import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { and, asc, desc, eq, gte, lt, sql } from 'drizzle-orm';
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
  sections,
  students,
  subjects,
  timetableSlots,
  users,
  whiteboards,
} from '../db/schema.js';
import { addDays } from '../teacher/teacher.service.js';
import { TimetableService } from '../timetable/timetable.service.js';
import { WhiteboardsService } from '../whiteboards/whiteboards.service.js';

/** What a parent sees about their children. Every route checks the guardian link first. */
@Controller('v1/parent')
export class ParentController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly timetable: TimetableService,
    private readonly boards: WhiteboardsService,
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
  @Auth('user', ['guardian'])
  summary(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) studentId: string, @Query('days') daysParam?: string) {
    const days = Math.min(Math.max(Number(daysParam) || 30, 1), 365);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const child = await this.child(tx, p, studentId);
      const today = localParts(this.clock.now(), await this.timetable.tenantTimezone(tx)).date;
      const from = addDays(today, -(days - 1));

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
      };
    });
  }

  /** Attendance by day for a calendar view. */
  @Get('children/:id/attendance')
  @Auth('user', ['guardian'])
  attendance(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) studentId: string, @Query('days') daysParam?: string) {
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

  /** The child, if this user is their guardian. 404 otherwise, so ids reveal nothing. */
  private async child(tx: Tx, p: UserPrincipal, studentId: string) {
    const [c] = await tx
      .select({
        id: students.id,
        fullName: students.fullName,
        rollNo: students.rollNo,
        section: { id: sections.id, displayName: sections.displayName },
      })
      .from(guardians)
      .innerJoin(students, eq(students.id, guardians.studentId))
      .innerJoin(sections, eq(sections.id, students.sectionId))
      .where(and(eq(guardians.userId, p.userId), eq(guardians.studentId, studentId)));
    if (!c) throw new NotFoundException('Child not found');
    return c;
  }
}
