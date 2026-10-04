var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { and, asc, desc, eq, ilike, isNull, lt, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import { audit } from '../common/audit.js';
import { assertCanSeeStudent } from '../common/student-access.js';
import { Clock, localParts } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { libraryBooks, libraryLoans, sections, students, tenants } from '../db/schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { addDays } from '../teacher/teacher.service.js';
export const LIBRARY_ROLES = ['librarian', 'tenant_admin', 'principal'];
/** Default loan period and late fine; per-institution settings later. */
const LOAN_DAYS = 14;
const FINE_PAISE_PER_DAY = 200;
const BookBody = z.object({
    title: z.string().trim().min(1).max(300),
    author: z.string().trim().max(200).default(''),
    isbn: z.string().trim().max(20).optional(),
    callNo: z.string().trim().max(40).optional(),
    copies: z.number().int().min(1).max(500).default(1),
});
const IssueBody = z.object({ bookId: z.uuid(), studentId: z.uuid(), dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
/** Days between two YYYY-MM-DD dates (b − a). */
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400_000);
/**
 * Library circulation: the librarian keeps the catalogue and issues and returns books; students
 * and their families see what is borrowed, when it is due and any fine.
 */
let LibraryController = class LibraryController {
    constructor(db, clock, notifications) {
        this.db = db;
        this.clock = clock;
        this.notifications = notifications;
    }
    /** The catalogue, with copies available now. */
    books(p, q = '') {
        const like = `%${q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
        return this.db.withTenant(p.tenantId, (tx) => tx
            .select({
            id: libraryBooks.id,
            title: libraryBooks.title,
            author: libraryBooks.author,
            isbn: libraryBooks.isbn,
            callNo: libraryBooks.callNo,
            copies: libraryBooks.copies,
            onLoan: sql `(select count(*)::int from library_loans l where l.book_id = "library_books"."id" and l.returned_at is null)`,
        })
            .from(libraryBooks)
            .where(q.trim() ? or(ilike(libraryBooks.title, like), ilike(libraryBooks.author, like), ilike(libraryBooks.isbn, like), ilike(libraryBooks.callNo, like)) : undefined)
            .orderBy(asc(libraryBooks.title))
            .limit(200));
    }
    async addBook(p, body) {
        return this.db.withTenant(p.tenantId, async (tx) => {
            const [b] = await tx.insert(libraryBooks).values({ tenantId: p.tenantId, ...body }).returning();
            return { ...b, onLoan: 0 };
        });
    }
    /** Lend a book to a student. */
    issue(p, body) {
        return this.db.withTenant(p.tenantId, async (tx) => {
            const [book] = await tx.select().from(libraryBooks).where(eq(libraryBooks.id, body.bookId)).for('update');
            if (!book)
                throw new NotFoundException('Book not found');
            const [student] = await tx.select({ id: students.id, fullName: students.fullName }).from(students).where(eq(students.id, body.studentId));
            if (!student)
                throw new NotFoundException('Student not found');
            const [{ out }] = await tx.select({ out: sql `count(*)::int` }).from(libraryLoans).where(and(eq(libraryLoans.bookId, book.id), isNull(libraryLoans.returnedAt)));
            if (out >= book.copies)
                throw new BadRequestException('Every copy of this book is out on loan');
            const today = await this.today(tx);
            const dueOn = body.dueOn ?? addDays(today, LOAN_DAYS);
            if (dueOn < today)
                throw new BadRequestException('The due date has already passed');
            const [loan] = await tx.insert(libraryLoans).values({ tenantId: p.tenantId, bookId: book.id, studentId: student.id, dueOn, issuedBy: p.userId }).returning();
            await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'library.issued', subjectType: 'library_loan', subjectId: loan.id });
            await this.notifications.libraryIssued(tx, { loanId: loan.id, studentId: student.id, studentName: student.fullName, title: book.title, dueOn });
            return loan;
        });
    }
    /** A book comes back; a late return is fined per day. */
    giveBack(p, id) {
        return this.db.withTenant(p.tenantId, async (tx) => {
            const [loan] = await tx.select().from(libraryLoans).where(eq(libraryLoans.id, id)).for('update');
            if (!loan)
                throw new NotFoundException('Loan not found');
            if (loan.returnedAt)
                return loan;
            const late = Math.max(0, daysBetween(loan.dueOn, await this.today(tx)));
            const [done] = await tx
                .update(libraryLoans)
                .set({ returnedAt: this.clock.now(), finePaise: late * FINE_PAISE_PER_DAY })
                .where(eq(libraryLoans.id, id))
                .returning();
            await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'library.returned', subjectType: 'library_loan', subjectId: id, data: { daysLate: late } });
            return done;
        });
    }
    /** Books out now; `?overdue=true` for the ones past their due date. */
    loans(p, overdue) {
        return this.db.withTenant(p.tenantId, async (tx) => {
            const today = await this.today(tx);
            return this.loanRows(tx, today)
                .where(and(isNull(libraryLoans.returnedAt), overdue === 'true' ? lt(libraryLoans.dueOn, today) : undefined))
                .orderBy(asc(libraryLoans.dueOn))
                .limit(500);
        });
    }
    /** One student's borrowing: for the student, their family and the library. */
    student(p, studentId) {
        return this.db.withTenant(p.tenantId, async (tx) => {
            await assertCanSeeStudent(tx, p, studentId, LIBRARY_ROLES);
            const today = await this.today(tx);
            const rows = await this.loanRows(tx, today).where(eq(libraryLoans.studentId, studentId)).orderBy(desc(libraryLoans.issuedAt)).limit(50);
            return {
                current: rows.filter((r) => !r.returnedAt),
                history: rows.filter((r) => r.returnedAt),
                finesPaise: rows.reduce((s, r) => s + r.finePaise, 0),
            };
        });
    }
    loanRows(tx, today) {
        return tx
            .select({
            id: libraryLoans.id,
            book: { id: libraryBooks.id, title: libraryBooks.title, author: libraryBooks.author, callNo: libraryBooks.callNo },
            student: { id: students.id, fullName: students.fullName, rollNo: students.rollNo },
            className: sections.displayName,
            issuedAt: libraryLoans.issuedAt,
            dueOn: libraryLoans.dueOn,
            returnedAt: libraryLoans.returnedAt,
            finePaise: libraryLoans.finePaise,
            overdue: sql `${libraryLoans.returnedAt} is null and ${libraryLoans.dueOn} < ${today}`,
        })
            .from(libraryLoans)
            .innerJoin(libraryBooks, eq(libraryBooks.id, libraryLoans.bookId))
            .innerJoin(students, eq(students.id, libraryLoans.studentId))
            .innerJoin(sections, eq(sections.id, students.sectionId))
            .$dynamic();
    }
    async today(tx) {
        const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
        return localParts(this.clock.now(), t?.tz ?? 'Asia/Kolkata').date;
    }
};
__decorate([
    Get('books'),
    Auth('user', LIBRARY_ROLES),
    __param(0, CurrentPrincipal()),
    __param(1, Query('q')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], LibraryController.prototype, "books", null);
__decorate([
    Post('books'),
    Auth('user', LIBRARY_ROLES),
    __param(0, CurrentPrincipal()),
    __param(1, Body(new ZodBody(BookBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], LibraryController.prototype, "addBook", null);
__decorate([
    Post('loans'),
    Auth('user', LIBRARY_ROLES),
    __param(0, CurrentPrincipal()),
    __param(1, Body(new ZodBody(IssueBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], LibraryController.prototype, "issue", null);
__decorate([
    Post('loans/:id/return'),
    HttpCode(200),
    Auth('user', LIBRARY_ROLES),
    __param(0, CurrentPrincipal()),
    __param(1, Param('id', ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], LibraryController.prototype, "giveBack", null);
__decorate([
    Get('loans'),
    Auth('user', LIBRARY_ROLES),
    __param(0, CurrentPrincipal()),
    __param(1, Query('overdue')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], LibraryController.prototype, "loans", null);
__decorate([
    Get('students/:id'),
    Auth('user'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('id', ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], LibraryController.prototype, "student", null);
LibraryController = __decorate([
    Controller('v1/library'),
    __metadata("design:paramtypes", [DbService,
        Clock,
        NotificationsService])
], LibraryController);
export { LibraryController };
//# sourceMappingURL=library.controller.js.map