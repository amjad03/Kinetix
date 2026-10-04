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
import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { and, asc, desc, eq, gt, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal, TEACHING_ROLES } from '../auth/auth.decorators.js';
import { audit } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { attendanceRecords, boardSessions, devices, guardians, homework, sections, students, subjects, tenants, timetableSlots, userRoles, users } from '../db/schema.js';
import { SessionsService } from '../sessions/sessions.service.js';
import { isoWeekday, isSchoolAdmin, parseDate, TeacherService } from './teacher.service.js';
/** Teaching staff plus admins, who can look at (and correct) any class. */
const CLASS_ROLES = [...TEACHING_ROLES, 'tenant_admin'];
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-05');
const AttendanceBody = z.object({
    slotId: z.uuid(),
    date: Day,
    records: z
        .array(z.object({ studentId: z.uuid(), status: z.enum(['present', 'absent', 'late', 'excused']) }))
        .min(1)
        .max(500),
});
const BoardHomeworkBody = z.object({
    title: z.string().trim().min(1).max(200),
    instructions: z.string().trim().max(5000).optional(),
    dueOn: Day,
});
const HomeworkBody = z.object({
    sectionId: z.uuid(),
    subjectId: z.uuid(),
    title: z.string().trim().min(1).max(200),
    instructions: z.string().trim().max(5000).optional(),
    dueOn: Day,
    boardSessionId: z.uuid().optional(),
});
/** The signed-in user's profile. Used by every app after login. */
let MeController = class MeController {
    constructor(db) {
        this.db = db;
    }
    me(p) {
        return this.db.withTenant(p.tenantId, async (tx) => {
            const [u] = await tx.select().from(users).where(eq(users.id, p.userId));
            if (!u)
                throw new NotFoundException('User not found');
            const roles = await tx.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, u.id));
            const [tenant] = await tx.select({ name: tenants.name, slug: tenants.slug, timezone: tenants.timezone }).from(tenants);
            return {
                id: u.id,
                fullName: u.fullName,
                email: u.email,
                phone: u.phone,
                preferredLanguage: u.preferredLanguage,
                roles: [...new Set(roles.map((r) => r.role))],
                tenant,
            };
        });
    }
};
__decorate([
    Get(),
    Auth('user'),
    __param(0, CurrentPrincipal()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MeController.prototype, "me", null);
MeController = __decorate([
    Controller('v1/me'),
    __metadata("design:paramtypes", [DbService])
], MeController);
export { MeController };
/** Teacher App: the signed-in teacher's own day, classes, board session and homework. */
let TeacherController = class TeacherController {
    constructor(db, teacher, sessions, clock) {
        this.db = db;
        this.teacher = teacher;
        this.sessions = sessions;
        this.clock = clock;
    }
    timetable(p, date) {
        return this.db.withTenant(p.tenantId, (tx) => this.teacher.timetableFor(tx, p.userId, date || undefined));
    }
    /** Distinct class + subject pairs from the teacher's timetable (for pickers such as homework). */
    classes(p) {
        return this.db.withTenant(p.tenantId, (tx) => tx
            .selectDistinct({
            section: { id: sections.id, displayName: sections.displayName },
            subject: { id: subjects.id, code: subjects.code, name: subjects.name },
        })
            .from(timetableSlots)
            .innerJoin(sections, eq(sections.id, timetableSlots.sectionId))
            .innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
            .where(eq(timetableSlots.teacherId, p.userId))
            .orderBy(asc(sections.displayName), asc(subjects.name)));
    }
    /** The teacher's active board session, so the app can show "Connected" and End class. */
    session(p) {
        return this.db.withTenant(p.tenantId, async (tx) => {
            const [row] = await tx
                .select({ id: boardSessions.id, board: { id: devices.id, name: devices.name } })
                .from(boardSessions)
                .innerJoin(devices, eq(devices.id, boardSessions.deviceId))
                .where(and(eq(boardSessions.teacherId, p.userId), isNull(boardSessions.endedAt), gt(boardSessions.expiresAt, this.clock.now())))
                .orderBy(desc(boardSessions.startedAt))
                .limit(1);
            if (!row)
                return { active: null };
            return { active: { board: row.board, session: await this.sessions.context(tx, row.id) } };
        });
    }
    /** Homework this teacher set recently, newest first. */
    homework(p) {
        return this.db.withTenant(p.tenantId, (tx) => this.teacher.homeworkList(tx, eq(homework.createdBy, p.userId), 'created'));
    }
};
__decorate([
    Get('timetable'),
    Auth('user', TEACHING_ROLES),
    __param(0, CurrentPrincipal()),
    __param(1, Query('date')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], TeacherController.prototype, "timetable", null);
__decorate([
    Get('classes'),
    Auth('user', TEACHING_ROLES),
    __param(0, CurrentPrincipal()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TeacherController.prototype, "classes", null);
__decorate([
    Get('session'),
    Auth('user', TEACHING_ROLES),
    __param(0, CurrentPrincipal()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TeacherController.prototype, "session", null);
__decorate([
    Get('homework'),
    Auth('user', TEACHING_ROLES),
    __param(0, CurrentPrincipal()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TeacherController.prototype, "homework", null);
TeacherController = __decorate([
    Controller('v1/teacher'),
    __metadata("design:paramtypes", [DbService,
        TeacherService,
        SessionsService,
        Clock])
], TeacherController);
export { TeacherController };
let SectionsController = class SectionsController {
    constructor(db, teacher, sessions) {
        this.db = db;
        this.teacher = teacher;
        this.sessions = sessions;
    }
    /** Students in a class. Only for teachers timetabled for it, principals and admins. */
    roster(p, id) {
        return this.db.withTenant(p.tenantId, async (tx) => {
            await this.teacher.assertCanSeeSection(tx, p, id);
            return this.sessions.roster(tx, id);
        });
    }
};
__decorate([
    Get(':id/roster'),
    Auth('user', CLASS_ROLES),
    __param(0, CurrentPrincipal()),
    __param(1, Param('id', ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], SectionsController.prototype, "roster", null);
SectionsController = __decorate([
    Controller('v1/sections'),
    __metadata("design:paramtypes", [DbService,
        TeacherService,
        SessionsService])
], SectionsController);
export { SectionsController };
let AttendanceController = class AttendanceController {
    constructor(db, teacher, clock, notifications) {
        this.db = db;
        this.teacher = teacher;
        this.clock = clock;
        this.notifications = notifications;
    }
    /** Marks already recorded for a period on a date (to reload the sheet). */
    get(p, slotId, date) {
        const day = parseDate(date);
        return this.db.withTenant(p.tenantId, async (tx) => {
            const [slot] = await tx.select().from(timetableSlots).where(eq(timetableSlots.id, slotId));
            if (!slot)
                throw new NotFoundException('Period not found');
            await this.teacher.assertCanSeeSection(tx, p, slot.sectionId);
            return this.teacher.attendanceSheet(tx, slotId, day);
        });
    }
    /**
     * Records attendance for one period. Upserts per student with the same last-writer-wins rule
     * as the board's sync outbox, so a mark made later on the board is not overwritten.
     */
    submit(p, body) {
        const day = parseDate(body.date);
        return this.db.withTenant(p.tenantId, async (tx) => {
            const slot = await this.teacher.slotFor(tx, p, body.slotId);
            if (isoWeekday(day) !== slot.dayOfWeek)
                throw new BadRequestException('This period is not on that day');
            const now = await this.teacher.localNow(tx);
            if (day > now.date)
                throw new BadRequestException('Attendance cannot be taken for a future date');
            // One mark per student; the last one in the list wins.
            const marks = new Map(body.records.map((r) => [r.studentId, r.status]));
            // FKs bypass RLS: confirm every student under RLS and in this period's class.
            const valid = await this.teacher.studentsInSection(tx, slot.sectionId, [...marks.keys()]);
            const strangers = [...marks.keys()].filter((id) => !valid.has(id));
            if (strangers.length)
                throw new BadRequestException({ message: 'Some students are not in this class', studentIds: strangers });
            const occurredAt = this.clock.now();
            for (const [studentId, status] of marks) {
                await tx
                    .insert(attendanceRecords)
                    .values({ tenantId: p.tenantId, studentId, sectionId: slot.sectionId, date: day, timetableSlotId: slot.id, status, markedBy: p.userId, occurredAt })
                    .onConflictDoUpdate({
                    target: [attendanceRecords.studentId, attendanceRecords.date, attendanceRecords.timetableSlotId],
                    set: { status, markedBy: p.userId, occurredAt, updatedAt: new Date() },
                    setWhere: sql `${attendanceRecords.occurredAt} <= excluded.occurred_at`,
                });
            }
            await this.notifications.attendanceChanged(tx, slot.id, day, [...marks.keys()]);
            await audit(tx, {
                tenantId: p.tenantId,
                actorType: 'user',
                actorId: p.userId,
                action: 'attendance.submitted',
                subjectType: 'timetable_slot',
                subjectId: slot.id,
                data: { date: day, count: marks.size },
            });
            return this.teacher.attendanceSheet(tx, slot.id, day);
        });
    }
};
__decorate([
    Get(),
    Auth('user', CLASS_ROLES),
    __param(0, CurrentPrincipal()),
    __param(1, Query('slotId', ParseUUIDPipe)),
    __param(2, Query('date')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], AttendanceController.prototype, "get", null);
__decorate([
    Post(),
    Auth('user', CLASS_ROLES),
    __param(0, CurrentPrincipal()),
    __param(1, Body(new ZodBody(AttendanceBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AttendanceController.prototype, "submit", null);
AttendanceController = __decorate([
    Controller('v1/attendance'),
    __metadata("design:paramtypes", [DbService,
        TeacherService,
        Clock,
        NotificationsService])
], AttendanceController);
export { AttendanceController };
let HomeworkController = class HomeworkController {
    constructor(db, teacher, notifications) {
        this.db = db;
        this.teacher = teacher;
        this.notifications = notifications;
    }
    create(p, body) {
        const dueOn = parseDate(body.dueOn, 'dueOn');
        return this.db.withTenant(p.tenantId, async (tx) => {
            // Every referenced id is looked up under RLS first: FKs alone would accept another tenant's ids.
            const section = await this.teacher.section(tx, body.sectionId);
            if (!(await this.teacher.teachesSection(tx, p.userId, section.id)) && !isSchoolAdmin(p)) {
                throw new ForbiddenException('You do not teach this class');
            }
            const [subject] = await tx.select().from(subjects).where(eq(subjects.id, body.subjectId));
            if (!subject || subject.programId !== section.programId || subject.term !== section.term) {
                throw new BadRequestException('That subject is not taught in this class');
            }
            if (body.boardSessionId) {
                const [s] = await tx.select({ teacherId: boardSessions.teacherId }).from(boardSessions).where(eq(boardSessions.id, body.boardSessionId));
                if (!s || s.teacherId !== p.userId)
                    throw new BadRequestException('Board session not found');
            }
            return this.insert(tx, { tenantId: p.tenantId, teacherId: p.userId, actor: 'user', actorId: p.userId, sectionId: section.id, subject, boardSessionId: body.boardSessionId, title: body.title, instructions: body.instructions, dueOn });
        });
    }
    /**
     * Homework set from the board (often a KINETIX AI draft the teacher accepted). The class and
     * subject come from the period open on the board.
     */
    fromBoard(p, body) {
        const dueOn = parseDate(body.dueOn, 'dueOn');
        return this.db.withTenant(p.tenantId, async (tx) => {
            const [session] = await tx.select().from(boardSessions).where(eq(boardSessions.id, p.sessionId));
            if (!session?.sectionId || !session.subjectId)
                throw new BadRequestException('Open a class on the board to give homework');
            const [subject] = await tx.select().from(subjects).where(eq(subjects.id, session.subjectId));
            return this.insert(tx, { tenantId: p.tenantId, teacherId: p.teacherId, actor: 'device', actorId: p.deviceId, sectionId: session.sectionId, subject, boardSessionId: session.id, title: body.title, instructions: body.instructions, dueOn });
        });
    }
    async insert(tx, h) {
        const now = await this.teacher.localNow(tx);
        if (h.dueOn < now.date)
            throw new BadRequestException('The due date has already passed');
        const [hw] = await tx
            .insert(homework)
            .values({
            tenantId: h.tenantId,
            sectionId: h.sectionId,
            subjectId: h.subject.id,
            createdBy: h.teacherId,
            boardSessionId: h.boardSessionId,
            title: h.title,
            instructions: h.instructions ?? '',
            dueOn: h.dueOn,
        })
            .returning();
        await audit(tx, { tenantId: h.tenantId, actorType: h.actor, actorId: h.actorId, action: 'homework.created', subjectType: 'homework', subjectId: hw.id });
        await this.notifications.homeworkCreated(tx, { id: hw.id, sectionId: h.sectionId, title: hw.title, dueOn: hw.dueOn, subjectName: h.subject.name });
        const [created] = await this.teacher.homeworkList(tx, eq(homework.id, hw.id), 'created');
        return created;
    }
    /**
     * One homework. Staff who can see the class, students in it and their guardians: the
     * Parent and Student apps open this from a notification.
     */
    async one(p, id) {
        return this.db.withTenant(p.tenantId, async (tx) => {
            const [hw] = await this.teacher.homeworkList(tx, eq(homework.id, id), 'created');
            const notFound = new NotFoundException('Homework not found');
            if (!hw)
                throw notFound;
            const [row] = await tx.select({ sectionId: homework.sectionId }).from(homework).where(eq(homework.id, id));
            if (isSchoolAdmin(p) || (await this.teacher.teachesSection(tx, p.userId, row.sectionId)))
                return hw;
            const [inClass] = await tx
                .select({ id: students.id })
                .from(students)
                .leftJoin(guardians, and(eq(guardians.studentId, students.id), eq(guardians.userId, p.userId)))
                .where(and(eq(students.sectionId, row.sectionId), or(eq(students.userId, p.userId), isNotNull(guardians.id))));
            if (!inClass)
                throw notFound;
            return hw;
        });
    }
    /** Homework set for a class, latest due date first. */
    list(p, sectionId) {
        return this.db.withTenant(p.tenantId, async (tx) => {
            await this.teacher.assertCanSeeSection(tx, p, sectionId);
            return this.teacher.homeworkList(tx, eq(homework.sectionId, sectionId), 'due');
        });
    }
};
__decorate([
    Post(),
    Auth('user', TEACHING_ROLES),
    __param(0, CurrentPrincipal()),
    __param(1, Body(new ZodBody(HomeworkBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], HomeworkController.prototype, "create", null);
__decorate([
    Post('from-board'),
    Auth('board'),
    __param(0, CurrentPrincipal()),
    __param(1, Body(new ZodBody(BoardHomeworkBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], HomeworkController.prototype, "fromBoard", null);
__decorate([
    Get(':id'),
    Auth('user'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('id', ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], HomeworkController.prototype, "one", null);
__decorate([
    Get(),
    Auth('user', CLASS_ROLES),
    __param(0, CurrentPrincipal()),
    __param(1, Query('sectionId', ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], HomeworkController.prototype, "list", null);
HomeworkController = __decorate([
    Controller('v1/homework'),
    __metadata("design:paramtypes", [DbService,
        TeacherService,
        NotificationsService])
], HomeworkController);
export { HomeworkController };
//# sourceMappingURL=teacher.controller.js.map