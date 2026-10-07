import { Controller, Get, Query } from '@nestjs/common';
import { and, asc, count, desc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { Clock, localParts, zonedToInstant } from '../common/time.js';
import { DbService, type Tx } from '../db/db.service.js';
import {
  attendanceRecords,
  boardSessions,
  broadcasts,
  campuses,
  devices,
  homework,
  programs,
  rooms,
  sections,
  students,
  subjects,
  timetableSlots,
  users,
  academicYears,
} from '../db/schema.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { addDays, isoWeekday, parseDate } from '../teacher/teacher.service.js';
import { CalendarService } from '../timetable/calendar.service.js';
import { TimetableService } from '../timetable/timetable.service.js';

export const DASHBOARD_ROLES: RoleName[] = ['principal', 'tenant_admin', 'hod'];

export type ClassStatus = 'upcoming' | 'live' | 'not_started' | 'taught' | 'missed';

/** The principal's dashboard: the whole school's day at a glance. */
@Controller('v1/admin')
export class AdminController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly timetable: TimetableService,
    private readonly realtime: RealtimeGateway,
    private readonly calendar: CalendarService,
  ) {}

  /** Campuses, programs, classes and rooms: for audience pickers and filters. */
  /** Also readable by the accounts office, which issues fees to classes. */
  @Get('structure')
  @Auth('user', [...DASHBOARD_ROLES, 'accountant'])
  structure(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => ({
      timezone: await this.timetable.tenantTimezone(tx),
      campuses: await tx.select({ id: campuses.id, name: campuses.name }).from(campuses).orderBy(asc(campuses.name)),
      academicYears: await tx.select({ id: academicYears.id, label: academicYears.label, isCurrent: academicYears.isCurrent }).from(academicYears).orderBy(asc(academicYears.startsOn)),
      programs: await tx
        .select({ id: programs.id, name: programs.name, level: programs.level, campusId: programs.campusId })
        .from(programs)
        .orderBy(asc(programs.name)),
      sections: await tx
        .select({
          id: sections.id,
          displayName: sections.displayName,
          programId: sections.programId,
          term: sections.term,
          // Qualified explicitly: an unqualified "id" here would resolve to students.id.
          students: sql<number>`(select count(*)::int from students s where s.section_id = "sections"."id" and s.status = 'active')`,
        })
        .from(sections)
        .orderBy(asc(sections.displayName)),
      rooms: await tx.select({ id: rooms.id, name: rooms.name, campusId: rooms.campusId }).from(rooms).orderBy(asc(rooms.name)),
      subjects: await tx
        .select({ id: subjects.id, code: subjects.code, name: subjects.name, programId: subjects.programId, term: subjects.term, courseId: subjects.courseId })
        .from(subjects)
        .orderBy(asc(subjects.code)),
    }));
  }

  /** Every timetabled class on a date, with whether it was taught and attendance taken. */
  @Get('classes')
  @Auth('user', DASHBOARD_ROLES)
  classes(@CurrentPrincipal() p: UserPrincipal, @Query('date') date?: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.classesOn(tx, date));
  }

  @Get('overview')
  @Auth('user', DASHBOARD_ROLES)
  overview(@CurrentPrincipal() p: UserPrincipal, @Query('date') date?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const day = await this.classesOn(tx, date);
      const by = (s: ClassStatus) => day.classes.filter((c) => c.status === s).length;
      const att = await this.attendanceTotals(tx, day.date);
      const [{ hw }] = await tx
        .select({ hw: count() })
        .from(homework)
        .where(and(gte(homework.createdAt, day.bounds.start), lt(homework.createdAt, day.bounds.end)));
      const [{ sent }] = await tx
        .select({ sent: count() })
        .from(broadcasts)
        .where(and(gte(broadcasts.createdAt, day.bounds.start), lt(broadcasts.createdAt, day.bounds.end)));
      const boards = await this.boards(tx);
      const due = day.classes.filter((c) => c.status !== 'upcoming');
      return {
        date: day.date,
        isToday: day.isToday,
        holiday: day.holiday,
        classes: {
          scheduled: day.classes.length,
          taught: by('taught'),
          live: by('live'),
          notStarted: by('not_started'),
          missed: by('missed'),
          upcoming: by('upcoming'),
        },
        attendance: {
          ...att,
          periodsDue: due.length,
          periodsTaken: due.filter((c) => c.attendanceTaken).length,
        },
        homeworkAssigned: hw,
        broadcastsSent: sent,
        boards: {
          total: boards.length,
          online: boards.filter((b) => b.online).length,
          inClass: boards.filter((b) => b.session).length,
        },
      };
    });
  }

  /** Per class: how many were marked, present, absent, late; and who was absent. */
  @Get('attendance')
  @Auth('user', DASHBOARD_ROLES)
  attendance(@CurrentPrincipal() p: UserPrincipal, @Query('date') date?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const day = date ? parseDate(date) : await this.today(tx);
      const perSection = await tx
        .select({
          sectionId: sections.id,
          section: sections.displayName,
          students: sql<number>`(select count(*)::int from students s where s.section_id = "sections"."id" and s.status = 'active')`,
          /** Students with at least one mark on the day. */
          marked: sql<number>`count(distinct ${attendanceRecords.studentId})::int`,
          /** Marks (one per student per period); present + absent + late + excused = marks. */
          marks: sql<number>`count(${attendanceRecords.id})::int`,
          present: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'present')::int`,
          absent: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'absent')::int`,
          late: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'late')::int`,
          excused: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'excused')::int`,
        })
        .from(sections)
        .leftJoin(attendanceRecords, and(eq(attendanceRecords.sectionId, sections.id), eq(attendanceRecords.date, day)))
        .groupBy(sections.id, sections.displayName)
        .orderBy(asc(sections.displayName));
      const absentees = await tx
        .select({
          studentId: students.id,
          student: students.fullName,
          rollNo: students.rollNo,
          section: sections.displayName,
          subject: subjects.name,
          startsAt: timetableSlots.startsAt,
          markedBy: users.fullName,
        })
        .from(attendanceRecords)
        .innerJoin(students, eq(students.id, attendanceRecords.studentId))
        .innerJoin(sections, eq(sections.id, attendanceRecords.sectionId))
        .innerJoin(users, eq(users.id, attendanceRecords.markedBy))
        .leftJoin(timetableSlots, eq(timetableSlots.id, attendanceRecords.timetableSlotId))
        .leftJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
        .where(and(eq(attendanceRecords.date, day), eq(attendanceRecords.status, 'absent')))
        .orderBy(asc(sections.displayName), asc(timetableSlots.startsAt), asc(students.rollNo));
      return { date: day, sections: perSection, absentees };
    });
  }

  /** Homework set in the last [days] days. */
  @Get('homework')
  @Auth('user', DASHBOARD_ROLES)
  homework(@CurrentPrincipal() p: UserPrincipal, @Query('days') daysParam?: string) {
    const days = Math.min(Math.max(Number(daysParam) || 7, 1), 90);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const since = new Date(this.clock.now().getTime() - days * 86400_000);
      return tx
        .select({
          id: homework.id,
          title: homework.title,
          instructions: homework.instructions,
          dueOn: homework.dueOn,
          createdAt: homework.createdAt,
          section: sections.displayName,
          subject: subjects.name,
          teacher: users.fullName,
        })
        .from(homework)
        .innerJoin(sections, eq(sections.id, homework.sectionId))
        .innerJoin(subjects, eq(subjects.id, homework.subjectId))
        .innerJoin(users, eq(users.id, homework.createdBy))
        .where(gte(homework.createdAt, since))
        .orderBy(desc(homework.createdAt));
    });
  }

  /** Every board: where it is, whether it is online, and who is teaching on it now. */
  @Get('devices')
  @Auth('user', DASHBOARD_ROLES)
  devices(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.boards(tx));
  }

  // ------------------------------------------------------------------------------------------

  private async today(tx: Tx) {
    return localParts(this.clock.now(), await this.timetable.tenantTimezone(tx)).date;
  }

  private async boards(tx: Tx) {
    const now = this.clock.now();
    const rows = await tx
      .select({
        id: devices.id,
        name: devices.name,
        room: rooms.name,
        platform: devices.platform,
        appVersion: devices.appVersion,
        enrolledAt: devices.enrolledAt,
        enrollmentExpiresAt: devices.enrollmentExpiresAt,
        lastSeenAt: devices.lastSeenAt,
      })
      .from(devices)
      .leftJoin(rooms, eq(rooms.id, devices.roomId))
      .orderBy(asc(devices.name));
    const sessions = rows.length
      ? await tx
          .select({
            deviceId: boardSessions.deviceId,
            sessionId: boardSessions.id,
            teacher: users.fullName,
            section: sections.displayName,
            subject: subjects.name,
            startedAt: boardSessions.startedAt,
          })
          .from(boardSessions)
          .innerJoin(users, eq(users.id, boardSessions.teacherId))
          .leftJoin(sections, eq(sections.id, boardSessions.sectionId))
          .leftJoin(subjects, eq(subjects.id, boardSessions.subjectId))
          .where(and(inArray(boardSessions.deviceId, rows.map((r) => r.id)), isNull(boardSessions.endedAt), gte(boardSessions.expiresAt, now)))
      : [];
    const byDevice = new Map(sessions.map((s) => [s.deviceId, s]));
    const live = await this.realtime.boardStatus(rows.map((r) => r.id));
    return rows.map((r) => {
      const s = byDevice.get(r.id);
      return {
        ...r,
        enrolled: r.enrolledAt != null,
        // Live socket, or an HTTP call in the last 3 minutes.
        online: live.get(r.id)?.online || (r.lastSeenAt != null && now.getTime() - r.lastSeenAt.getTime() < 180_000),
        session: s ? { id: s.sessionId, teacher: s.teacher, section: s.section, subject: s.subject, startedAt: s.startedAt } : null,
        viewers: live.get(r.id)?.viewers ?? 0,
      };
    });
  }

  private async attendanceTotals(tx: Tx, date: string) {
    const [t] = await tx
      .select({
        /** Marks: one per student per period. */
        marked: sql<number>`count(*)::int`,
        studentsMarked: sql<number>`count(distinct ${attendanceRecords.studentId})::int`,
        present: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'present')::int`,
        absent: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'absent')::int`,
        late: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'late')::int`,
        excused: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'excused')::int`,
        absentStudents: sql<number>`count(distinct ${attendanceRecords.studentId}) filter (where ${attendanceRecords.status} = 'absent')::int`,
      })
      .from(attendanceRecords)
      .where(eq(attendanceRecords.date, date));
    // Late and excused count as attended, as in the parent view.
    return { ...t, rate: t.marked === 0 ? null : Math.round(((t.present + t.late + t.excused) / t.marked) * 1000) / 10 };
  }

  private async classesOn(tx: Tx, date?: string) {
    const tz = await this.timetable.tenantTimezone(tx);
    const now = localParts(this.clock.now(), tz);
    const day = date ? parseDate(date) : now.date;
    const bounds = { start: zonedToInstant(day, '00:00:00', tz), end: zonedToInstant(addDays(day, 1), '00:00:00', tz) };

    const all = await tx
      .select({
        id: timetableSlots.id,
        programId: sections.programId,
        startsAt: timetableSlots.startsAt,
        endsAt: timetableSlots.endsAt,
        section: { id: sections.id, displayName: sections.displayName },
        subject: { id: subjects.id, name: subjects.name, code: subjects.code },
        teacher: { id: users.id, fullName: users.fullName },
        room: rooms.name,
      })
      .from(timetableSlots)
      .innerJoin(sections, eq(sections.id, timetableSlots.sectionId))
      .innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
      .innerJoin(users, eq(users.id, timetableSlots.teacherId))
      .leftJoin(rooms, eq(rooms.id, timetableSlots.roomId))
      .where(and(eq(timetableSlots.dayOfWeek, isoWeekday(day)), isNull(timetableSlots.archivedAt)))
      .orderBy(asc(timetableSlots.startsAt), asc(sections.displayName));
    // Classes cancelled by a holiday are not due (and not "missed").
    const holidays = await this.calendar.holidays(tx, day, day);
    const slots = all.filter((s) => !holidays.on(day, s.programId)).map(({ programId: _p, ...s }) => s);
    const holiday = holidays.forAll(day);

    const ids = slots.map((s) => s.id);
    const sessions = ids.length
      ? await tx
          .select({ slotId: boardSessions.timetableSlotId, endedAt: boardSessions.endedAt, expiresAt: boardSessions.expiresAt, board: devices.name })
          .from(boardSessions)
          .innerJoin(devices, eq(devices.id, boardSessions.deviceId))
          .where(and(inArray(boardSessions.timetableSlotId, ids), gte(boardSessions.startedAt, bounds.start), lt(boardSessions.startedAt, bounds.end)))
      : [];
    const marked = ids.length
      ? await tx
          .select({ slotId: attendanceRecords.timetableSlotId, n: sql<number>`count(*)::int`, absent: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'absent')::int` })
          .from(attendanceRecords)
          .where(and(inArray(attendanceRecords.timetableSlotId, ids), eq(attendanceRecords.date, day)))
          .groupBy(attendanceRecords.timetableSlotId)
      : [];
    const attendanceBySlot = new Map(marked.map((m) => [m.slotId, m]));
    const nowInstant = this.clock.now();

    const classes = slots.map((s) => {
      const used = sessions.filter((x) => x.slotId === s.id);
      const live = used.some((x) => !x.endedAt && x.expiresAt > nowInstant);
      const att = attendanceBySlot.get(s.id);
      const taughtEvidence = used.length > 0 || !!att;
      let status: ClassStatus;
      if (day > now.date || (day === now.date && now.time < s.startsAt)) status = 'upcoming';
      else if (live) status = 'live';
      else if (day === now.date && now.time < s.endsAt) status = taughtEvidence ? 'taught' : 'not_started';
      else status = taughtEvidence ? 'taught' : 'missed';
      return {
        ...s,
        status,
        board: used[0]?.board ?? null,
        attendanceTaken: !!att,
        absent: att?.absent ?? 0,
      };
    });
    return { date: day, isToday: day === now.date, bounds, classes, holiday: holiday ? { title: holiday.title } : null };
  }
}
