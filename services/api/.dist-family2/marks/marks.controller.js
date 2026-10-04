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
import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal, TEACHING_ROLES } from '../auth/auth.decorators.js';
import { audit } from '../common/audit.js';
import { assertCanSeeStudent } from '../common/student-access.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { assessments, marks, students, subjects, users } from '../db/schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { isSchoolAdmin, parseDate, TeacherService } from '../teacher/teacher.service.js';
const STAFF = [...TEACHING_ROLES, 'tenant_admin'];
const CreateBody = z.object({
    sectionId: z.uuid(),
    subjectId: z.uuid(),
    title: z.string().trim().min(1).max(160),
    kind: z.enum(['test', 'assignment', 'internal', 'exam', 'practical']),
    maxMarks: z.number().positive().max(1000),
    heldOn: z.string(),
});
const MarksBody = z.object({
    entries: z
        .array(z.object({
        studentId: z.uuid(),
        marks: z.number().min(0).nullable(),
        absent: z.boolean().default(false),
        remark: z.string().trim().max(300).optional(),
    }))
        .min(1)
        .max(500),
});
const round1 = (n) => Math.round(n * 10) / 10;
/**
 * Tests, assignments and exams with marks. Teachers of the class enter marks and publish them;
 * students and families then see their own marks with the class average and highest.
 */
let AssessmentsController = class AssessmentsController {
    constructor(db, teacher, notifications) {
        this.db = db;
        this.teacher = teacher;
        this.notifications = notifications;
    }
    create(p, body) {
        const heldOn = parseDate(body.heldOn, 'heldOn');
        return this.db.withTenant(p.tenantId, async (tx) => {
            const section = await this.assertTeaches(tx, p, body.sectionId);
            const [subject] = await tx.select().from(subjects).where(eq(subjects.id, body.subjectId));
            if (!subject || subject.programId !== section.programId || subject.term !== section.term)
                throw new BadRequestException('That subject is not taught in this class');
            const [a] = await tx
                .insert(assessments)
                .values({ tenantId: p.tenantId, sectionId: section.id, subjectId: subject.id, title: body.title, kind: body.kind, maxMarks: body.maxMarks, heldOn, createdBy: p.userId })
                .returning();
            return this.detail(tx, a.id);
        });
    }
    /** A class's assessments (staff). */
    list(p, sectionId) {
        return this.db.withTenant(p.tenantId, async (tx) => {
            await this.assertTeaches(tx, p, sectionId);
            return this.summaries(tx).where(eq(assessments.sectionId, sectionId)).orderBy(desc(assessments.heldOn));
        });
    }
    /** One assessment with the whole class's marks (staff). */
    one(p, id) {
        return this.db.withTenant(p.tenantId, async (tx) => {
            const a = await this.load(tx, id);
            await this.assertTeaches(tx, p, a.sectionId);
            return this.detail(tx, id);
        });
    }
    /** Enter or correct marks; can be done again after publishing (families see the update). */
    enter(p, id, body) {
        return this.db.withTenant(p.tenantId, async (tx) => {
            const a = await this.load(tx, id);
            await this.assertTeaches(tx, p, a.sectionId);
            const ids = body.entries.map((e) => e.studentId);
            const inClass = await tx.select({ id: students.id }).from(students).where(and(inArray(students.id, ids), eq(students.sectionId, a.sectionId)));
            if (inClass.length !== new Set(ids).size)
                throw new BadRequestException('Some students are not in this class');
            for (const e of body.entries) {
                if (e.marks !== null && e.marks > a.maxMarks)
                    throw new BadRequestException(`Marks cannot be more than ${a.maxMarks}`);
                const v = { marks: e.absent ? null : e.marks, absent: e.absent, remark: e.remark ?? null, updatedAt: new Date() };
                await tx
                    .insert(marks)
                    .values({ tenantId: p.tenantId, assessmentId: id, studentId: e.studentId, ...v })
                    .onConflictDoUpdate({ target: [marks.assessmentId, marks.studentId], set: v });
            }
            await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'marks.entered', subjectType: 'assessment', subjectId: id, data: { students: ids.length } });
            return this.detail(tx, id);
        });
    }
    publish(p, id) {
        return this.db.withTenant(p.tenantId, async (tx) => {
            const a = await this.load(tx, id);
            await this.assertTeaches(tx, p, a.sectionId);
            if (!a.publishedAt) {
                const [{ n }] = await tx.select({ n: sql `count(*)::int` }).from(marks).where(eq(marks.assessmentId, id));
                if (n === 0)
                    throw new BadRequestException('Enter marks before publishing');
                await tx.update(assessments).set({ publishedAt: new Date() }).where(eq(assessments.id, id));
                const [subject] = await tx.select({ name: subjects.name }).from(subjects).where(eq(subjects.id, a.subjectId));
                await this.notifications.marksPublished(tx, { id, sectionId: a.sectionId, title: a.title, subjectName: subject?.name ?? 'Class' });
            }
            return this.detail(tx, id);
        });
    }
    summaries(tx) {
        return tx
            .select({
            id: assessments.id,
            title: assessments.title,
            kind: assessments.kind,
            maxMarks: assessments.maxMarks,
            heldOn: assessments.heldOn,
            publishedAt: assessments.publishedAt,
            sectionId: assessments.sectionId,
            subject: { id: subjects.id, name: subjects.name },
            createdBy: users.fullName,
            entered: sql `(select count(*)::int from marks m where m.assessment_id = "assessments"."id")`,
        })
            .from(assessments)
            .innerJoin(subjects, eq(subjects.id, assessments.subjectId))
            .innerJoin(users, eq(users.id, assessments.createdBy))
            .$dynamic();
    }
    async detail(tx, id) {
        const [summary] = await this.summaries(tx).where(eq(assessments.id, id));
        const roster = await tx
            .select({ id: students.id, fullName: students.fullName, rollNo: students.rollNo, marks: marks.marks, absent: marks.absent, remark: marks.remark })
            .from(students)
            .leftJoin(marks, and(eq(marks.studentId, students.id), eq(marks.assessmentId, id)))
            .where(and(eq(students.sectionId, summary.sectionId), eq(students.status, 'active')))
            .orderBy(asc(students.rollNo));
        return { ...summary, stats: stats(roster.map((r) => r.marks)), students: roster.map((r) => ({ ...r, absent: r.absent ?? false })) };
    }
    async load(tx, id) {
        const [a] = await tx.select().from(assessments).where(eq(assessments.id, id));
        if (!a)
            throw new NotFoundException('Assessment not found');
        return a;
    }
    async assertTeaches(tx, p, sectionId) {
        const section = await this.teacher.section(tx, sectionId);
        if (!isSchoolAdmin(p) && !(await this.teacher.teachesSection(tx, p.userId, section.id)))
            throw new ForbiddenException('You do not teach this class');
        return section;
    }
};
__decorate([
    Post(),
    Auth('user', STAFF),
    __param(0, CurrentPrincipal()),
    __param(1, Body(new ZodBody(CreateBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AssessmentsController.prototype, "create", null);
__decorate([
    Get(),
    Auth('user', STAFF),
    __param(0, CurrentPrincipal()),
    __param(1, Query('sectionId', ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], AssessmentsController.prototype, "list", null);
__decorate([
    Get(':id'),
    Auth('user', STAFF),
    __param(0, CurrentPrincipal()),
    __param(1, Param('id', ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], AssessmentsController.prototype, "one", null);
__decorate([
    Put(':id/marks'),
    Auth('user', STAFF),
    __param(0, CurrentPrincipal()),
    __param(1, Param('id', ParseUUIDPipe)),
    __param(2, Body(new ZodBody(MarksBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], AssessmentsController.prototype, "enter", null);
__decorate([
    Post(':id/publish'),
    HttpCode(200),
    Auth('user', STAFF),
    __param(0, CurrentPrincipal()),
    __param(1, Param('id', ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], AssessmentsController.prototype, "publish", null);
AssessmentsController = __decorate([
    Controller('v1/assessments'),
    __metadata("design:paramtypes", [DbService,
        TeacherService,
        NotificationsService])
], AssessmentsController);
export { AssessmentsController };
/** Average, highest and lowest of the marks entered (absentees excluded). */
export function stats(values) {
    const v = values.filter((x) => x !== null);
    if (v.length === 0)
        return { count: 0, average: null, highest: null, lowest: null };
    return { count: v.length, average: round1(v.reduce((a, b) => a + b, 0) / v.length), highest: Math.max(...v), lowest: Math.min(...v) };
}
/** A student's published marks: for the student, their family and staff. */
let StudentMarksController = class StudentMarksController {
    constructor(db) {
        this.db = db;
    }
    forStudent(p, studentId) {
        return this.db.withTenant(p.tenantId, async (tx) => {
            await assertCanSeeStudent(tx, p, studentId, STAFF);
            const [student] = await tx.select({ sectionId: students.sectionId }).from(students).where(eq(students.id, studentId));
            const rows = await tx
                .select({
                id: assessments.id,
                title: assessments.title,
                kind: assessments.kind,
                maxMarks: assessments.maxMarks,
                heldOn: assessments.heldOn,
                subject: subjects.name,
                marks: marks.marks,
                absent: marks.absent,
                remark: marks.remark,
                classAverage: sql `(select round(avg(m.marks)::numeric, 1)::float from marks m where m.assessment_id = "assessments"."id" and m.marks is not null)`,
                classHighest: sql `(select max(m.marks)::float from marks m where m.assessment_id = "assessments"."id")`,
            })
                .from(assessments)
                .innerJoin(subjects, eq(subjects.id, assessments.subjectId))
                .leftJoin(marks, and(eq(marks.assessmentId, assessments.id), eq(marks.studentId, studentId)))
                .where(and(eq(assessments.sectionId, student.sectionId), isNotNull(assessments.publishedAt)))
                .orderBy(desc(assessments.heldOn));
            // Per subject: the student's percentage across published assessments.
            const bySubject = new Map();
            for (const r of rows) {
                if (r.marks === null)
                    continue;
                const s = bySubject.get(r.subject) ?? { scored: 0, max: 0 };
                s.scored += r.marks;
                s.max += r.maxMarks;
                bySubject.set(r.subject, s);
            }
            return {
                assessments: rows.map((r) => ({ ...r, absent: r.absent ?? false })),
                subjects: [...bySubject].map(([subject, s]) => ({ subject, percent: round1((s.scored / s.max) * 100) })),
            };
        });
    }
};
__decorate([
    Get('students/:id'),
    Auth('user'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('id', ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], StudentMarksController.prototype, "forStudent", null);
StudentMarksController = __decorate([
    Controller('v1/marks'),
    __metadata("design:paramtypes", [DbService])
], StudentMarksController);
export { StudentMarksController };
//# sourceMappingURL=marks.controller.js.map