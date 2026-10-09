import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { localParts, Clock } from '../common/time.js';
import { DbService, type Tx } from '../db/db.service.js';
import {
  attendanceRecords,
  guardians,
  homework,
  participationEvents,
  programs,
  recordings,
  sections,
  students,
  subjects,
  timetableSlots,
  users,
  whiteboards,
} from '../db/schema.js';
import { addDays } from '../teacher/teacher.service.js';
import { TimetableService } from '../timetable/timetable.service.js';
import { RecordingsService } from '../recordings/recordings.service.js';
import { WhiteboardsService } from '../whiteboards/whiteboards.service.js';
import { ParentVisibilityService } from './parent-visibility.js';

/** What a parent sees about their children. Every route checks the guardian link first. */
@Controller('v1/parent')
export class ParentController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly timetable: TimetableService,
    private readonly boards: WhiteboardsService,
    private readonly recordings: RecordingsService,
    private readonly vis: ParentVisibilityService,
  ) {}

  @Get('children')
  @Auth('user', ['guardian'])
  children(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
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
        .orderBy(asc(students.fullName)),
    );
  }

  /** One screen's worth: attendance over the last [days] days, homework, class participation, shared boards. */
  @Get('children/:id/summary')
  @Auth('user', ['guardian', 'student'])
  summary(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) studentId: string, @Query('days') daysParam?: string) {
    const days = Math.min(Math.max(Number(daysParam) || 30, 1), 365);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const child = await this.child(tx, p, studentId);
      const today = localParts(this.clock.now(), await this.timetable.tenantTimezone(tx)).date;
      const from = addDays(today, -(days - 1));
      const showAttendance = await this.vis.allowed(tx, p, 'attendance');

      const marks = await tx
        .select({ status: attendanceRecords.status, n: sql<number>`count(*)::int` })
        .from(attendanceRecords)
        .where(and(eq(attendanceRecords.studentId, studentId), gte(attendanceRecords.date, from)))
        .groupBy(attendanceRecords.status);
      const by = Object.fromEntries(marks.map((m) => [m.status, m.n])) as Record<string, number>;
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
      const hwBase = () =>
        tx
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
          subject: sql<string>`coalesce(${subjects.name}, 'Other')`,
          correct: sql<number>`count(*) filter (where ${participationEvents.outcome} = 'correct')::int`,
          partial: sql<number>`count(*) filter (where ${participationEvents.outcome} = 'partial')::int`,
          incorrect: sql<number>`count(*) filter (where ${participationEvents.outcome} = 'incorrect')::int`,
          skipped: sql<number>`count(*) filter (where ${participationEvents.outcome} = 'skipped')::int`,
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
            .innerJoin(
              attendanceRecords,
              and(
                eq(attendanceRecords.timetableSlotId, recordings.timetableSlotId),
                eq(attendanceRecords.studentId, studentId),
                eq(attendanceRecords.status, 'absent'),
                sql`${attendanceRecords.date} = (${recordings.startedAt} at time zone ${await this.timetable.tenantTimezone(tx)})::date`,
              ),
            )
            .where(inArray(recordings.id, recent.map((r) => r.id)))
        : [];
      const missed = new Set(missedRows.map((r) => r.id));

      return {
        child,
        period: { from, to: today, days },
        // The school can switch attendance off for parents: the block stays, empty, so apps need no special case.
        attendance: showAttendance
          ? {
              periods: total,
              present,
              absent,
              late,
              excused,
              // Late counts as attended.
              rate: total === 0 ? null : Math.round(((present + late + excused) / total) * 1000) / 10,
              recentAbsences,
            }
          : { periods: 0, present: 0, absent: 0, late: 0, excused: 0, rate: null, recentAbsences: [], hidden: true },
        homework: { upcoming: upcomingHomework, recent: pastHomework },
        participation,
        sharedBoards,
        recordings: recent.map((r) => ({ ...r, missed: missed.has(r.id) })),
      };
    });
  }

  /** Attendance by day for a calendar view. */
  /** The subjects of a child's class, with their syllabus course when linked. */
  @Get('children/:id/subjects')
  @Auth('user', ['guardian'])
  childSubjects(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [child] = await tx
        .select({ programId: sections.programId, term: sections.term })
        .from(guardians)
        .innerJoin(students, eq(students.id, guardians.studentId))
        .innerJoin(sections, eq(sections.id, students.sectionId))
        .where(and(eq(guardians.userId, p.userId), eq(guardians.studentId, studentId)));
      if (!child) throw new NotFoundException('Child not found');
      return tx
        .select({ id: subjects.id, code: subjects.code, name: subjects.name, courseId: subjects.courseId })
        .from(subjects)
        .where(and(eq(subjects.programId, child.programId), eq(subjects.term, child.term)))
        .orderBy(asc(subjects.code));
    });
  }

  @Get('children/:id/attendance')
  @Auth('user', ['guardian', 'student'])
  attendance(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) studentId: string, @Query('days') daysParam?: string) {
    const days = Math.min(Math.max(Number(daysParam) || 30, 1), 365);
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.child(tx, p, studentId);
      await this.vis.assert(tx, p, 'attendance');
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
  private async child(tx: Tx, p: UserPrincipal, studentId: string) {
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
    if (!c) throw new NotFoundException('Child not found');
    return c;
  }
}

/** The signed-in student's own record: the Student App's starting point. */
@Controller('v1/student')
export class StudentController {
  constructor(private readonly db: DbService) {}

  @Get('me')
  @Auth('user', ['student'])
  me(@CurrentPrincipal() p: UserPrincipal) {
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
      if (!me) throw new NotFoundException('No student record is linked to this login');
      return me;
    });
  }

  /** The subjects of the student's class, with their syllabus course when linked. */
  @Get('subjects')
  @Auth('user', ['student'])
  subjects(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [me] = await tx
        .select({ programId: sections.programId, term: sections.term })
        .from(students)
        .innerJoin(sections, eq(sections.id, students.sectionId))
        .where(eq(students.userId, p.userId));
      if (!me) throw new NotFoundException('No student record is linked to this login');
      return tx
        .select({ id: subjects.id, code: subjects.code, name: subjects.name, courseId: subjects.courseId })
        .from(subjects)
        .where(and(eq(subjects.programId, me.programId), eq(subjects.term, me.term)))
        .orderBy(asc(subjects.code));
    });
  }
}
