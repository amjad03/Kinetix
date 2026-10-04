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
import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import { localParts, Clock } from '../common/time.js';
import { DbService } from '../db/db.service.js';
import { attendanceRecords, guardians, homework, participationEvents, programs, recordings, sections, students, subjects, timetableSlots, users, whiteboards, } from '../db/schema.js';
import { addDays } from '../teacher/teacher.service.js';
import { TimetableService } from '../timetable/timetable.service.js';
import { RecordingsService } from '../recordings/recordings.service.js';
import { WhiteboardsService } from '../whiteboards/whiteboards.service.js';
/** What a parent sees about their children. Every route checks the guardian link first. */
let ParentController = class ParentController {
    constructor(db, clock, timetable, boards, recordings) {
        this.db = db;
        this.clock = clock;
        this.timetable = timetable;
        this.boards = boards;
        this.recordings = recordings;
    }
    children(p) {
        return this.db.withTenant(p.tenantId, (tx) => tx
            .select({
            id: students.id,
            fullName: students.fullName,
            rollNo: students.rollNo,
            relation: guardians.relation,
            section: { id: sections.id, displayName: sections.displayName, term: sections.term },
            program: { name: programs.name, level: programs.level },
        })
            .from(guardians)
            .innerJoin(students, eq(students.id, guardians.studentId))
            .innerJoin(sections, eq(sections.id, students.sectionId))
            .innerJoin(programs, eq(programs.id, sections.programId))
            .where(eq(guardians.userId, p.userId))
            .orderBy(asc(students.fullName)));
    }
    /** One screen's worth: attendance over the last [days] days, homework, class participation, shared boards. */
    summary(p, studentId, daysParam) {
        const days = Math.min(Math.max(Number(daysParam) || 30, 1), 365);
        return this.db.withTenant(p.tenantId, async (tx) => {
            const child = await this.child(tx, p, studentId);
            const today = localParts(this.clock.now(), await this.timetable.tenantTimezone(tx)).date;
            const from = addDays(today, -(days - 1));
            const marks = await tx
                .select({ status: attendanceRecords.status, n: sql `count(*)::int` })
                .from(attendanceRecords)
                .where(and(eq(attendanceRecords.studentId, studentId), gte(attendanceRecords.date, from)))
                .groupBy(attendanceRecords.status);
            const by = Object.fromEntries(marks.map((m) => [m.status, m.n]));
            const present = by.present ?? 0, absent = by.absent ?? 0, late = by.late ?? 0, excused = by.excused ?? 0;
            const total = present + absent + late + excused;
            const recentAbsences = await tx
                .select({ date: attendanceRecords.date, subject: subjects.name, startsAt: timetableSlots.startsAt })
                .from(attendanceRecords)
                .leftJoin(timetableSlots, eq(timetableSlots.id, attendanceRecords.timetableSlotId))
                .leftJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
                .where(and(eq(attendanceRecords.studentId, studentId), eq(attendanceRecords.status, 'absent'), gte(attendanceRecords.date, from)))
                .orderBy(desc(attendanceRecords.date), desc(timetableSlots.startsAt))
                .limit(10);
            const hwColumns = {
                id: homework.id,
                title: homework.title,
                instructions: homework.instructions,
                dueOn: homework.dueOn,
                createdAt: homework.createdAt,
                subject: subjects.name,
                teacher: users.fullName,
            };
            const hwBase = () => tx
                .select(hwColumns)
                .from(homework)
                .innerJoin(subjects, eq(subjects.id, homework.subjectId))
                .innerJoin(users, eq(users.id, homework.createdBy))
                .$dynamic();
            const upcomingHomework = await hwBase()
                .where(and(eq(homework.sectionId, child.section.id), gte(homework.dueOn, today)))
                .orderBy(asc(homework.dueOn))
                .limit(20);
            const pastHomework = await hwBase()
                .where(and(eq(homework.sectionId, child.section.id), lt(homework.dueOn, today)))
                .orderBy(desc(homework.dueOn))
                .limit(10);
            const participation = await tx
                .select({
                subject: sql `coalesce(${subjects.name}, 'Other')`,
                correct: sql `count(*) filter (where ${participationEvents.outcome} = 'correct')::int`,
                partial: sql `count(*) filter (where ${participationEvents.outcome} = 'partial')::int`,
                incorrect: sql `count(*) filter (where ${participationEvents.outcome} = 'incorrect')::int`,
                skipped: sql `count(*) filter (where ${participationEvents.outcome} = 'skipped')::int`,
            })
                .from(participationEvents)
                .leftJoin(subjects, eq(subjects.id, participationEvents.subjectId))
                .where(and(eq(participationEvents.studentId, studentId), gte(participationEvents.occurredAt, new Date(`${from}T00:00:00Z`))))
                .groupBy(subjects.name)
                .orderBy(asc(subjects.name));
            const sharedBoards = await this.boards
                .summaries(tx)
                .where(this.boards.sharedWith([child.section.id]))
                .orderBy(desc(whiteboards.sharedAt))
                .limit(10);
            const recent = await this.recordings
                .summaries(tx)
                .where(this.recordings.sharedWith([child.section.id]))
                .orderBy(desc(recordings.startedAt))
                .limit(10);
            // Which of them the child was absent for: those come first in the app.
            const missedRows = recent.length
                ? await tx
                    .select({ id: recordings.id })
                    .from(recordings)
                    .innerJoin(attendanceRecords, and(eq(attendanceRecords.timetableSlotId, recordings.timetableSlotId), eq(attendanceRecords.studentId, studentId), eq(attendanceRecords.status, 'absent'), sql `${attendanceRecords.date} = (${recordings.startedAt} at time zone ${await this.timetable.tenantTimezone(tx)})::date`))
                    .where(inArray(recordings.id, recent.map((r) => r.id)))
                : [];
            const missed = new Set(missedRows.map((r) => r.id));
            return {
                child,
                period: { from, to: today, days },
                attendance: {
                    periods: total,
                    present,
                    absent,
                    late,
                    excused,
                    // Late counts as attended.
                    rate: total === 0 ? null : Math.round(((present + late + excused) / total) * 1000) / 10,
                    recentAbsences,
                },
                homework: { upcoming: upcomingHomework, recent: pastHomework },
                participation,
                sharedBoards,
                recordings: recent.map((r) => ({ ...r, missed: missed.has(r.id) })),
            };
        });
    }
    /** Attendance by day for a calendar view. */
    attendance(p, studentId, daysParam) {
        const days = Math.min(Math.max(Number(daysParam) || 30, 1), 365);
        return this.db.withTenant(p.tenantId, async (tx) => {
            await this.child(tx, p, studentId);
            const today = localParts(this.clock.now(), await this.timetable.tenantTimezone(tx)).date;
            return tx
                .select({
                date: attendanceRecords.date,
                status: attendanceRecords.status,
                subject: subjects.name,
                startsAt: timetableSlots.startsAt,
                endsAt: timetableSlots.endsAt,
            })
                .from(attendanceRecords)
                .leftJoin(timetableSlots, eq(timetableSlots.id, attendanceRecords.timetableSlotId))
                .leftJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
                .where(and(eq(attendanceRecords.studentId, studentId), gte(attendanceRecords.date, addDays(today, -(days - 1)))))
                .orderBy(desc(attendanceRecords.date), asc(timetableSlots.startsAt));
        });
    }
    /**
     * The child, if this user is their guardian, or the student themselves (the Student App uses
     * these routes for its own summary). 404 otherwise, so ids reveal nothing.
     */
    async child(tx, p, studentId) {
        const cols = {
            id: students.id,
            fullName: students.fullName,
            rollNo: students.rollNo,
            section: { id: sections.id, displayName: sections.displayName },
        };
        const base = () => tx.select(cols).from(students).innerJoin(sections, eq(sections.id, students.sectionId)).$dynamic();
        const [self] = await base().where(and(eq(students.id, studentId), eq(students.userId, p.userId)));
        const [c] = self
            ? [self]
            : await base()
                .innerJoin(guardians, eq(guardians.studentId, students.id))
                .where(and(eq(guardians.userId, p.userId), eq(guardians.studentId, studentId)));
        if (!c)
            throw new NotFoundException('Child not found');
        return c;
    }
};
__decorate([
    Get('children'),
    Auth('user', ['guardian']),
    __param(0, CurrentPrincipal()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ParentController.prototype, "children", null);
__decorate([
    Get('children/:id/summary'),
    Auth('user', ['guardian', 'student']),
    __param(0, CurrentPrincipal()),
    __param(1, Param('id', ParseUUIDPipe)),
    __param(2, Query('days')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], ParentController.prototype, "summary", null);
__decorate([
    Get('children/:id/attendance'),
    Auth('user', ['guardian', 'student']),
    __param(0, CurrentPrincipal()),
    __param(1, Param('id', ParseUUIDPipe)),
    __param(2, Query('days')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], ParentController.prototype, "attendance", null);
ParentController = __decorate([
    Controller('v1/parent'),
    __metadata("design:paramtypes", [DbService,
        Clock,
        TimetableService,
        WhiteboardsService,
        RecordingsService])
], ParentController);
export { ParentController };
/** The signed-in student's own record: the Student App's starting point. */
let StudentController = class StudentController {
    constructor(db) {
        this.db = db;
    }
    me(p) {
        return this.db.withTenant(p.tenantId, async (tx) => {
            const [me] = await tx
                .select({
                id: students.id,
                fullName: students.fullName,
                rollNo: students.rollNo,
                section: { id: sections.id, displayName: sections.displayName, term: sections.term },
                program: { name: programs.name, level: programs.level },
            })
                .from(students)
                .innerJoin(sections, eq(sections.id, students.sectionId))
                .innerJoin(programs, eq(programs.id, sections.programId))
                .where(eq(students.userId, p.userId));
            if (!me)
                throw new NotFoundException('No student record is linked to this login');
            return me;
        });
    }
    /** The subjects of the student's class, with their syllabus course when linked. */
    subjects(p) {
        return this.db.withTenant(p.tenantId, async (tx) => {
            const [me] = await tx
                .select({ programId: sections.programId, term: sections.term })
                .from(students)
                .innerJoin(sections, eq(sections.id, students.sectionId))
                .where(eq(students.userId, p.userId));
            if (!me)
                throw new NotFoundException('No student record is linked to this login');
            return tx
                .select({ id: subjects.id, code: subjects.code, name: subjects.name, courseId: subjects.courseId })
                .from(subjects)
                .where(and(eq(subjects.programId, me.programId), eq(subjects.term, me.term)))
                .orderBy(asc(subjects.code));
        });
    }
};
__decorate([
    Get('me'),
    Auth('user', ['student']),
    __param(0, CurrentPrincipal()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], StudentController.prototype, "me", null);
__decorate([
    Get('subjects'),
    Auth('user', ['student']),
    __param(0, CurrentPrincipal()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], StudentController.prototype, "subjects", null);
StudentController = __decorate([
    Controller('v1/student'),
    __metadata("design:paramtypes", [DbService])
], StudentController);
export { StudentController };
//# sourceMappingURL=parent.controller.js.map