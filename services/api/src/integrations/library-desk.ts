import { and, eq, isNull, sql } from 'drizzle-orm';
import { audit } from '../common/audit.js';
import { tenantToday } from '../common/tenant-today.js';
import type { Clock } from '../common/time.js';
import type { Tx } from '../db/db.service.js';
import { libraryBooks, libraryLoans, students } from '../db/schema.js';
import { libraryReservations } from '../db/schema-depth.js';
import type { NotificationsService } from '../notifications/notifications.service.js';
import { copiesHeld, promoteNext } from '../library/reservations.js';
import { addDays } from '../teacher/teacher.service.js';

const LOAN_DAYS = 14;
const FINE_PAISE_PER_DAY = 200;
const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);

export type DeskResult = { ok: true; loanId: string; dueOn?: string; fineP?: number; title: string } | { ok: false; reason: string };

/** Library issue and return for machines (RFID readers, the SIP2 bridge); it follows the desk's rules in library.controller.ts. */
export class LibraryDesk {
  constructor(private readonly clock: Clock, private readonly notifications: NotificationsService) {}

  async issue(tx: Tx, tenantId: string, actorId: string, bookId: string, studentId: string): Promise<DeskResult> {
    const [book] = await tx.select().from(libraryBooks).where(eq(libraryBooks.id, bookId)).for('update');
    const [student] = await tx.select({ id: students.id, fullName: students.fullName }).from(students).where(eq(students.id, studentId));
    if (!book || !student) return { ok: false, reason: 'unknown_item_or_patron' };
    const [{ out }] = await tx.select({ out: sql<number>`count(*)::int` }).from(libraryLoans).where(and(eq(libraryLoans.bookId, book.id), isNull(libraryLoans.returnedAt)));
    const held = await copiesHeld(tx, book.id, student.id);
    if (out >= book.copies) return { ok: false, reason: 'no_copy_available' };
    if (out + held >= book.copies) return { ok: false, reason: 'held_for_reservation' };
    const today = await tenantToday(tx, this.clock);
    const dueOn = addDays(today, LOAN_DAYS);
    const [loan] = await tx.insert(libraryLoans).values({ tenantId, bookId: book.id, studentId: student.id, dueOn, issuedBy: actorId }).returning();
    await tx.update(libraryReservations).set({ status: 'fulfilled', loanId: loan.id }).where(and(eq(libraryReservations.bookId, book.id), eq(libraryReservations.studentId, student.id), sql`${libraryReservations.status} in ('waiting', 'ready')`));
    await audit(tx, { tenantId, actorType: 'user', actorId, action: 'library.issued', subjectType: 'library_loan', subjectId: loan.id, data: { via: 'machine' } });
    await this.notifications.libraryIssued(tx, { loanId: loan.id, studentId: student.id, studentName: student.fullName, title: book.title, dueOn });
    return { ok: true, loanId: loan.id, dueOn, title: book.title };
  }

  /** Returns the open loan of a book (optionally only if held by `studentId`). */
  async giveBack(tx: Tx, tenantId: string, actorId: string, bookId: string, studentId?: string): Promise<DeskResult> {
    const [loan] = await tx.select().from(libraryLoans).where(and(eq(libraryLoans.bookId, bookId), isNull(libraryLoans.returnedAt), studentId ? eq(libraryLoans.studentId, studentId) : undefined)).for('update');
    const [book] = await tx.select({ title: libraryBooks.title }).from(libraryBooks).where(eq(libraryBooks.id, bookId));
    if (!loan || !book) return { ok: false, reason: 'not_on_loan' };
    const late = Math.max(0, daysBetween(loan.dueOn, await tenantToday(tx, this.clock)));
    await tx.update(libraryLoans).set({ returnedAt: this.clock.now(), finePaise: late * FINE_PAISE_PER_DAY }).where(eq(libraryLoans.id, loan.id));
    await audit(tx, { tenantId, actorType: 'user', actorId, action: 'library.returned', subjectType: 'library_loan', subjectId: loan.id, data: { daysLate: late, via: 'machine' } });
    await promoteNext(tx, loan.bookId, this.clock.now());
    return { ok: true, loanId: loan.id, fineP: late * FINE_PAISE_PER_DAY, title: book.title };
  }
}
