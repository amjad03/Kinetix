import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { attendanceLocked } from '../attendance-governance/attendance-rules.js';
import { attendanceSettings } from '../attendance-governance/eligibility.js';
import { attendancePolicy, attendanceWindow, classStudents, eligibilityFor, leaveOn, periodRoster, type AttendancePolicy, type PeriodRosterRow } from '../attendance-governance/policy.js';
import { audit, auditUser } from '../common/audit.js';
import { Clock, localParts } from '../common/time.js';
import { DbService, type Tx } from '../db/db.service.js';
import { attendanceAlerts, attendanceLeaves, attendanceSessionMarks, specialClassAttendance, specialClasses, studentBatches } from '../db/schema-academic-ops.js';
import { attendanceRecords, departments, sections, students, subjects, teacherSubstitutions, timetableSlots, users } from '../db/schema.js';
import { JobsService, type Job } from '../jobs/jobs.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { addDays, isoWeekday, isSchoolAdmin } from '../teacher/teacher.service.js';
import { CalendarService } from '../timetable/calendar.service.js';
import { TimetableService } from '../timetable/timetable.service.js';
import { deskTexts } from './desk-texts.js';

export const ALERTS_JOB = 'attendance.alerts';
export type Status = 'present' | 'absent' | 'late' | 'excused';
export type LeaveKind = 'on_duty' | 'medical' | 'personal';

/** The longest leave approval writes marks for, and the longest range the unmarked list looks at. */
const MAX_LEAVE_DAYS = 62;
const MAX_RANGE_DAYS = 31;

const hm = (t: string) => t.slice(0, 5);
const daysBetween = (from: string, to: string) => Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000);

/** A period on a date: who teaches it that day (the substitute when there is one). */
export interface DayPeriod {
  slotId: string;
  date: string;
  startsAt: string;
  endsAt: string;
  sectionId: string;
  section: string;
  subjectId: string;
  subject: string;
  teacherId: string;
  teacher: string;
  substitute: boolean;
  batch: string | null;
  combined: number;
  marked: number;
}

/**
 * The attendance desk: mark sheets for a period, a day or a session, copying marks across a class's periods, the
 * unmarked-hours watch, leave and on duty with approval that writes the marks, shortage alerts and the evening digest,
 * the monthly register and one student's attendance by subject and day.
 */
@Injectable()
export class AttendanceDeskService implements OnModuleInit {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly timetable: TimetableService,
    private readonly calendar: CalendarService,
    private readonly notifications: NotificationsService,
    private readonly jobs: JobsService,
  ) {}

  onModuleInit(): void {
    this.jobs.registerHourly(ALERTS_JOB, (job: Job) => this.runAlerts(job.tenantId).then(() => undefined));
  }

  async now(tx: Tx) {
    const tz = await this.timetable.tenantTimezone(tx);
    return { ...localParts(this.clock.now(), tz), tz };
  }

  // ---- who may mark --------------------------------------------------------------------------------

  /** Heads of department mark and watch the periods of their department's subjects. */
  private async headsSubject(tx: Tx, userId: string, subjectId: string): Promise<boolean> {
    const [r] = await tx.select({ id: subjects.id }).from(subjects).innerJoin(departments, eq(departments.id, subjects.departmentId)).where(and(eq(subjects.id, subjectId), eq(departments.headUserId, userId)));
    return !!r;
  }

  /** The period under RLS, if this person may mark it on the date: its teacher, the day's substitute, the subject's head of department, or the principal. */
  async slotToMark(tx: Tx, p: UserPrincipal, slotId: string, date: string) {
    const [slot] = await tx.select().from(timetableSlots).where(eq(timetableSlots.id, slotId));
    if (!slot) throw new NotFoundException('Period not found');
    if (isSchoolAdmin(p) || slot.teacherId === p.userId) return slot;
    const [sub] = await tx.select({ id: teacherSubstitutions.id }).from(teacherSubstitutions).where(and(eq(teacherSubstitutions.slotId, slotId), eq(teacherSubstitutions.date, date), eq(teacherSubstitutions.substituteTeacherId, p.userId), eq(teacherSubstitutions.status, 'assigned')));
    if (sub) return slot;
    if (p.roles.includes('hod') && (await this.headsSubject(tx, p.userId, slot.subjectId))) return slot;
    throw new ForbiddenException('This is not your period');
  }

  /** A class's whole-day register: its class teacher, anyone timetabled for it, its heads of department, the principal. */
  async assertDayMarker(tx: Tx, p: UserPrincipal, sectionId: string) {
    const [s] = await tx.select().from(sections).where(eq(sections.id, sectionId));
    if (!s) throw new NotFoundException('Class not found');
    if (isSchoolAdmin(p) || s.classTeacherId === p.userId) return s;
    const [mine] = await tx.select({ id: timetableSlots.id }).from(timetableSlots).where(and(eq(timetableSlots.sectionId, sectionId), eq(timetableSlots.teacherId, p.userId))).limit(1);
    if (mine) return s;
    if (p.roles.includes('hod')) {
      const [dept] = await tx
        .select({ id: subjects.id })
        .from(subjects)
        .innerJoin(departments, eq(departments.id, subjects.departmentId))
        .where(and(eq(subjects.programId, s.programId), eq(subjects.term, s.term), eq(departments.headUserId, p.userId)))
        .limit(1);
      if (dept) return s;
    }
    throw new ForbiddenException('You do not teach this class');
  }

  private async assertOpen(tx: Tx, sectionId: string, date: string) {
    const now = await this.now(tx);
    if (date > now.date) throw new BadRequestException('Attendance cannot be taken for a future date');
    const { lockHours } = await attendanceSettings(tx, sectionId);
    if (attendanceLocked(date, this.clock.now(), now.tz, lockHours)) throw new ConflictException('Attendance for this day is locked. Ask for a correction and your head of department will review it.');
  }

  // ---- a class's day ---------------------------------------------------------------------------------

  /**
   * The periods a class meets on a date (its own and those it is combined into), following compensatory working days
   * and holidays, each with how many marks it has; periods removed from the timetable after that day still show.
   */
  async classDay(tx: Tx, sectionId: string, date: string) {
    const [sec] = await tx.select().from(sections).where(eq(sections.id, sectionId));
    if (!sec) throw new NotFoundException('Class not found');
    const orders = await this.calendar.dayOrders(tx, date, date);
    const weekday = orders.weekday(date, sec.programId);
    const holiday = (await this.calendar.holidays(tx, date, date)).on(date, sec.programId);
    const rows = await tx
      .select({ slot: timetableSlots, section: sections.displayName, subject: subjects.name, teacher: users.fullName })
      .from(timetableSlots)
      .innerJoin(sections, eq(sections.id, timetableSlots.sectionId))
      .innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
      .innerJoin(users, eq(users.id, timetableSlots.teacherId))
      .where(
        and(
          eq(timetableSlots.dayOfWeek, weekday),
          or(eq(timetableSlots.sectionId, sectionId), sql`${sectionId}::uuid = any(${timetableSlots.combinedSectionIds})`),
          or(isNull(timetableSlots.archivedAt), sql`${timetableSlots.archivedAt}::date > ${date}::date`, sql`exists (select 1 from attendance_records ar where ar.timetable_slot_id = ${timetableSlots.id} and ar.date = ${date}::date)`),
        ),
      )
      .orderBy(asc(timetableSlots.startsAt));
    const periods = await this.describe(tx, rows, date);
    const special = await tx
      .select({ id: specialClasses.id, kind: specialClasses.kind, startsAt: specialClasses.startsAt, endsAt: specialClasses.endsAt, subject: subjects.name, teacher: users.fullName, status: specialClasses.status, marked: sql<number>`(select count(*)::int from special_class_attendance a where a.special_class_id = ${specialClasses.id})` })
      .from(specialClasses)
      .innerJoin(subjects, eq(subjects.id, specialClasses.subjectId))
      .innerJoin(users, eq(users.id, specialClasses.teacherId))
      .where(and(eq(specialClasses.sectionId, sectionId), eq(specialClasses.date, date)))
      .orderBy(asc(specialClasses.startsAt));
    const dayMarks = await tx.select({ n: sql<number>`count(*)::int` }).from(attendanceRecords).where(and(eq(attendanceRecords.sectionId, sectionId), eq(attendanceRecords.date, date), isNull(attendanceRecords.timetableSlotId)));
    const sessionMarks = await tx.select({ session: attendanceSessionMarks.session, n: sql<number>`count(*)::int` }).from(attendanceSessionMarks).where(and(eq(attendanceSessionMarks.sectionId, sectionId), eq(attendanceSessionMarks.date, date))).groupBy(attendanceSessionMarks.session);
    return {
      date,
      section: { id: sec.id, name: sec.displayName },
      weekday,
      followsWeekday: weekday !== isoWeekday(date) ? weekday : null,
      holiday: holiday ? holiday.title : null,
      periods,
      special,
      dayMarked: dayMarks[0]?.n ?? 0,
      sessionsMarked: Object.fromEntries(sessionMarks.map((s) => [s.session, s.n])),
      strength: (await classStudents(tx, sectionId)).filter((s) => !s.enrolledOn || s.enrolledOn <= date).length,
    };
  }

  /** Adds the marked count and the day's substitute to period rows. */
  private async describe(tx: Tx, rows: { slot: typeof timetableSlots.$inferSelect; section: string; subject: string; teacher: string }[], date: string): Promise<DayPeriod[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.slot.id);
    const marked = new Map((await tx.select({ id: attendanceRecords.timetableSlotId, n: sql<number>`count(*)::int` }).from(attendanceRecords).where(and(inArray(attendanceRecords.timetableSlotId, ids), eq(attendanceRecords.date, date))).groupBy(attendanceRecords.timetableSlotId)).map((m) => [m.id!, m.n]));
    const subs = new Map(
      (
        await tx
          .select({ slotId: teacherSubstitutions.slotId, id: users.id, name: users.fullName })
          .from(teacherSubstitutions)
          .innerJoin(users, eq(users.id, teacherSubstitutions.substituteTeacherId))
          .where(and(inArray(teacherSubstitutions.slotId, ids), eq(teacherSubstitutions.date, date), eq(teacherSubstitutions.status, 'assigned')))
      ).map((s) => [s.slotId, s]),
    );
    return rows.map((r) => {
      const sub = subs.get(r.slot.id);
      return {
        slotId: r.slot.id,
        date,
        startsAt: hm(r.slot.startsAt),
        endsAt: hm(r.slot.endsAt),
        sectionId: r.slot.sectionId,
        section: r.section,
        subjectId: r.slot.subjectId,
        subject: r.subject,
        teacherId: sub?.id ?? r.slot.teacherId,
        teacher: sub?.name ?? r.teacher,
        substitute: !!sub,
        batch: r.slot.batch,
        combined: r.slot.combinedSectionIds?.length ?? 0,
        marked: marked.get(r.slot.id) ?? 0,
      };
    });
  }

  // ---- sheets ----------------------------------------------------------------------------------------

  /** A period's mark sheet: who attends, their marks, leave that stands, the day's biometric punch as a suggestion. */
  async periodSheet(tx: Tx, p: UserPrincipal, slotId: string, date: string) {
    const slot = await this.slotToMark(tx, p, slotId, date);
    const [sec] = await tx.select({ programId: sections.programId, name: sections.displayName }).from(sections).where(eq(sections.id, slot.sectionId));
    const meets = (await this.calendar.dayOrders(tx, date, date)).weekday(date, sec.programId) === slot.dayOfWeek;
    const roster = await periodRoster(tx, slot, date);
    const ids = roster.map((r) => r.id);
    const marks = ids.length ? await tx.select({ id: attendanceRecords.studentId, status: attendanceRecords.status, by: users.fullName }).from(attendanceRecords).innerJoin(users, eq(users.id, attendanceRecords.markedBy)).where(and(eq(attendanceRecords.timetableSlotId, slotId), eq(attendanceRecords.date, date), inArray(attendanceRecords.studentId, ids))) : [];
    const punches = ids.length ? await tx.select({ id: attendanceRecords.studentId, status: attendanceRecords.status }).from(attendanceRecords).where(and(isNull(attendanceRecords.timetableSlotId), eq(attendanceRecords.date, date), inArray(attendanceRecords.studentId, ids))) : [];
    const leave = await leaveOn(tx, ids, date, slot.startsAt);
    const [subject] = await tx.select({ name: subjects.name, code: subjects.code }).from(subjects).where(eq(subjects.id, slot.subjectId));
    const now = await this.now(tx);
    const { lockHours } = await attendanceSettings(tx, slot.sectionId);
    const others = (await this.classDay(tx, slot.sectionId, date)).periods.filter((x) => x.slotId !== slotId);
    return {
      kind: 'period' as const,
      slotId,
      date,
      meets,
      section: { id: slot.sectionId, name: sec.name },
      subject: { id: slot.subjectId, ...subject },
      startsAt: hm(slot.startsAt),
      endsAt: hm(slot.endsAt),
      batch: slot.batch,
      locked: attendanceLocked(date, this.clock.now(), now.tz, lockHours),
      future: date > now.date,
      others,
      roster: this.sheetRows(roster, new Map(marks.map((m) => [m.id, m])), leave, new Map(punches.map((x) => [x.id, x.status]))),
    };
  }

  private sheetRows(roster: PeriodRosterRow[], marks: Map<string, { status: Status; by?: string }>, leave: Map<string, { leaveId: string; kind: string; countsAs: Status }>, punches = new Map<string, Status>()) {
    return roster.map((r) => ({
      id: r.id,
      fullName: r.fullName,
      rollNo: r.rollNo,
      section: r.section,
      batch: r.batch,
      status: marks.get(r.id)?.status ?? null,
      markedBy: marks.get(r.id)?.by ?? null,
      leave: leave.get(r.id) ?? null,
      punch: punches.get(r.id) ?? null,
    }));
  }

  /** The whole-day (or forenoon/afternoon) sheet of a class. */
  async daySheet(tx: Tx, p: UserPrincipal, sectionId: string, date: string, session: 'fn' | 'an' | null) {
    const sec = await this.assertDayMarker(tx, p, sectionId);
    const roster = (await classStudents(tx, sectionId)).filter((s) => !s.enrolledOn || s.enrolledOn <= date);
    const batches = new Map((await tx.select({ id: studentBatches.studentId, batch: studentBatches.batch }).from(studentBatches).where(eq(studentBatches.sectionId, sectionId))).map((b) => [b.id, b.batch]));
    const rows: PeriodRosterRow[] = roster.map((s) => ({ id: s.id, fullName: s.fullName, rollNo: s.rollNo, sectionId, section: sec.displayName, enrolledOn: s.enrolledOn, batch: batches.get(s.id) ?? null }));
    const ids = rows.map((r) => r.id);
    const marks = !ids.length
      ? []
      : session
        ? await tx.select({ id: attendanceSessionMarks.studentId, status: attendanceSessionMarks.status }).from(attendanceSessionMarks).where(and(eq(attendanceSessionMarks.date, date), eq(attendanceSessionMarks.session, session), inArray(attendanceSessionMarks.studentId, ids)))
        : await tx.select({ id: attendanceRecords.studentId, status: attendanceRecords.status }).from(attendanceRecords).where(and(eq(attendanceRecords.date, date), isNull(attendanceRecords.timetableSlotId), inArray(attendanceRecords.studentId, ids)));
    const leave = await leaveOn(tx, ids, date, session === 'an' ? '13:00' : session === 'fn' ? '09:00' : undefined);
    const now = await this.now(tx);
    const { lockHours } = await attendanceSettings(tx, sectionId);
    return {
      kind: session ? ('session' as const) : ('day' as const),
      session,
      date,
      section: { id: sectionId, name: sec.displayName },
      locked: attendanceLocked(date, this.clock.now(), now.tz, lockHours),
      future: date > now.date,
      roster: this.sheetRows(rows, new Map(marks.map((m) => [m.id, { status: m.status }])), leave),
    };
  }

  /** Records a class's whole-day or session marks (leave that stands keeps its mark). */
  async markDay(tx: Tx, p: UserPrincipal, b: { sectionId: string; date: string; session: 'fn' | 'an' | null; records: { studentId: string; status: Status }[] }) {
    await this.assertDayMarker(tx, p, b.sectionId);
    await this.assertOpen(tx, b.sectionId, b.date);
    const roster = new Set((await classStudents(tx, b.sectionId)).filter((s) => !s.enrolledOn || s.enrolledOn <= b.date).map((s) => s.id));
    const marks = new Map(b.records.map((r) => [r.studentId, r.status]));
    const strangers = [...marks.keys()].filter((id) => !roster.has(id));
    if (strangers.length) throw new BadRequestException({ message: 'Some students are not in this class', studentIds: strangers });
    for (const [id, l] of await leaveOn(tx, [...marks.keys()], b.date, b.session === 'an' ? '13:00' : b.session === 'fn' ? '09:00' : undefined)) marks.set(id, l.countsAs);
    const at = this.clock.now();
    for (const [studentId, status] of marks) {
      if (b.session) {
        await tx
          .insert(attendanceSessionMarks)
          .values({ tenantId: p.tenantId, studentId, sectionId: b.sectionId, date: b.date, session: b.session, status, markedBy: p.userId, markedAt: at })
          .onConflictDoUpdate({ target: [attendanceSessionMarks.studentId, attendanceSessionMarks.date, attendanceSessionMarks.session], set: { status, markedBy: p.userId, markedAt: at } });
      } else {
        await tx
          .insert(attendanceRecords)
          .values({ tenantId: p.tenantId, studentId, sectionId: b.sectionId, date: b.date, timetableSlotId: null, status, markedBy: p.userId, occurredAt: at })
          .onConflictDoUpdate({ target: [attendanceRecords.studentId, attendanceRecords.date, attendanceRecords.timetableSlotId], set: { status, markedBy: p.userId, occurredAt: at, updatedAt: at } });
      }
    }
    if (!b.session) await this.notifications.attendanceChanged(tx, null, b.date, [...marks.keys()]);
    await auditUser(tx, p, 'attendance.day_marked', 'section', b.sectionId, { date: b.date, session: b.session, count: marks.size });
    return this.daySheet(tx, p, b.sectionId, b.date, b.session);
  }

  /**
   * Copies one period's marks to other periods of the same class that day (a two-hour lab, back-to-back lectures).
   * Only students on both rosters are copied; leave that stands keeps its mark; locked days are refused.
   */
  async copyMarks(tx: Tx, p: UserPrincipal, b: { fromSlotId: string; date: string; toSlotIds: string[] }) {
    const from = await this.slotToMark(tx, p, b.fromSlotId, b.date);
    const source = new Map((await tx.select({ id: attendanceRecords.studentId, status: attendanceRecords.status }).from(attendanceRecords).where(and(eq(attendanceRecords.timetableSlotId, from.id), eq(attendanceRecords.date, b.date)))).map((r) => [r.id, r.status]));
    if (!source.size) throw new BadRequestException('Mark the period you copy from first');
    const out: { slotId: string; copied: number }[] = [];
    for (const toId of [...new Set(b.toSlotIds)].filter((x) => x !== from.id)) {
      const slot = await this.slotToMark(tx, p, toId, b.date);
      if (slot.sectionId !== from.sectionId) throw new BadRequestException('Copy only between periods of the same class');
      const [sec] = await tx.select({ programId: sections.programId }).from(sections).where(eq(sections.id, slot.sectionId));
      if ((await this.calendar.dayOrders(tx, b.date, b.date)).weekday(b.date, sec.programId) !== slot.dayOfWeek) throw new BadRequestException('That period is not on that day');
      await this.assertOpen(tx, slot.sectionId, b.date);
      const roster = await periodRoster(tx, slot, b.date);
      const leave = await leaveOn(tx, roster.map((r) => r.id), b.date, slot.startsAt);
      const at = this.clock.now();
      let n = 0;
      for (const r of roster) {
        const status = leave.get(r.id)?.countsAs ?? source.get(r.id);
        if (!status) continue;
        await tx
          .insert(attendanceRecords)
          .values({ tenantId: p.tenantId, studentId: r.id, sectionId: r.sectionId, date: b.date, timetableSlotId: slot.id, status, markedBy: p.userId, occurredAt: at })
          .onConflictDoUpdate({ target: [attendanceRecords.studentId, attendanceRecords.date, attendanceRecords.timetableSlotId], set: { status, markedBy: p.userId, occurredAt: at, updatedAt: at } });
        n++;
      }
      await this.notifications.attendanceChanged(tx, slot.id, b.date, roster.map((r) => r.id));
      await auditUser(tx, p, 'attendance.copied', 'timetable_slot', slot.id, { date: b.date, from: from.id, count: n });
      out.push({ slotId: slot.id, copied: n });
    }
    return { results: out };
  }

  /** A special class's sheet (its teacher, the subject's head of department or the principal). */
  async specialSheet(tx: Tx, p: UserPrincipal, id: string) {
    const sc = await this.specialToMark(tx, p, id);
    const roster = await periodRoster(tx, { id: '00000000-0000-0000-0000-000000000000', sectionId: sc.sectionId, batch: sc.batch }, sc.date);
    const marks = await tx.select({ id: specialClassAttendance.studentId, status: specialClassAttendance.status }).from(specialClassAttendance).where(eq(specialClassAttendance.specialClassId, id));
    const leave = await leaveOn(tx, roster.map((r) => r.id), sc.date, sc.startsAt);
    const [subject] = await tx.select({ name: subjects.name, code: subjects.code }).from(subjects).where(eq(subjects.id, sc.subjectId));
    const [sec] = await tx.select({ name: sections.displayName }).from(sections).where(eq(sections.id, sc.sectionId));
    const now = await this.now(tx);
    return {
      kind: 'special' as const,
      id,
      specialKind: sc.kind,
      status: sc.status,
      date: sc.date,
      startsAt: hm(sc.startsAt),
      endsAt: hm(sc.endsAt),
      section: { id: sc.sectionId, name: sec.name },
      subject: { id: sc.subjectId, ...subject },
      locked: false,
      future: sc.date > now.date,
      roster: this.sheetRows(roster, new Map(marks.map((m) => [m.id, { status: m.status }])), leave),
    };
  }

  private async specialToMark(tx: Tx, p: UserPrincipal, id: string) {
    const [sc] = await tx.select().from(specialClasses).where(eq(specialClasses.id, id));
    if (!sc) throw new NotFoundException('Special class not found');
    if (isSchoolAdmin(p) || sc.teacherId === p.userId) return sc;
    if (p.roles.includes('hod') && (await this.headsSubject(tx, p.userId, sc.subjectId))) return sc;
    throw new ForbiddenException('This is not your class');
  }

  /** Marks a special class; marking it makes it held. */
  async markSpecial(tx: Tx, p: UserPrincipal, id: string, records: { studentId: string; status: Status }[]) {
    const sc = await this.specialToMark(tx, p, id);
    if (sc.status === 'cancelled') throw new ConflictException('This class was cancelled');
    const now = await this.now(tx);
    if (sc.date > now.date) throw new BadRequestException('Attendance cannot be taken for a future date');
    const roster = new Set((await periodRoster(tx, { id: '00000000-0000-0000-0000-000000000000', sectionId: sc.sectionId, batch: sc.batch }, sc.date)).map((r) => r.id));
    const marks = new Map(records.map((r) => [r.studentId, r.status]));
    const strangers = [...marks.keys()].filter((x) => !roster.has(x));
    if (strangers.length) throw new BadRequestException({ message: 'Some students are not in this class', studentIds: strangers });
    for (const [sid, l] of await leaveOn(tx, [...marks.keys()], sc.date, sc.startsAt)) marks.set(sid, l.countsAs);
    for (const [studentId, status] of marks) {
      await tx
        .insert(specialClassAttendance)
        .values({ tenantId: p.tenantId, specialClassId: id, studentId, status, markedBy: p.userId, markedAt: this.clock.now() })
        .onConflictDoUpdate({ target: [specialClassAttendance.specialClassId, specialClassAttendance.studentId], set: { status, markedBy: p.userId, markedAt: this.clock.now() } });
    }
    if (sc.status === 'scheduled') await tx.update(specialClasses).set({ status: 'held' }).where(eq(specialClasses.id, id));
    await auditUser(tx, p, 'attendance.special_marked', 'special_class', id, { count: marks.size });
    return this.specialSheet(tx, p, id);
  }

  // ---- unmarked hours ---------------------------------------------------------------------------------

  /**
   * Periods that met between two dates (weekday or compensatory working day, not a holiday, already over) and have no
   * marks. The principal sees all; a head of department their department's subjects; a teacher their own.
   */
  async unmarked(tx: Tx, p: UserPrincipal, q: { from: string; to: string; departmentId?: string; teacherId?: string; sectionId?: string }): Promise<DayPeriod[]> {
    if (q.from > q.to) throw new BadRequestException('from must be on or before to');
    if (daysBetween(q.from, q.to) > MAX_RANGE_DAYS) throw new BadRequestException(`Choose at most ${MAX_RANGE_DAYS} days`);
    const now = await this.now(tx);
    const to = q.to > now.date ? now.date : q.to;
    if (q.from > to) return [];
    const headed = p.roles.includes('hod') && !isSchoolAdmin(p) ? (await tx.select({ id: departments.id }).from(departments).where(eq(departments.headUserId, p.userId))).map((d) => d.id) : null;
    const slots = await tx
      .select({ slot: timetableSlots, programId: sections.programId, section: sections.displayName, subject: subjects.name, teacher: users.fullName, departmentId: subjects.departmentId })
      .from(timetableSlots)
      .innerJoin(sections, eq(sections.id, timetableSlots.sectionId))
      .innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
      .innerJoin(users, eq(users.id, timetableSlots.teacherId))
      .where(
        and(
          or(isNull(timetableSlots.archivedAt), sql`${timetableSlots.archivedAt}::date > ${q.from}::date`),
          q.departmentId ? eq(subjects.departmentId, q.departmentId) : undefined,
          q.sectionId ? eq(timetableSlots.sectionId, q.sectionId) : undefined,
          headed ? (headed.length ? inArray(subjects.departmentId, headed) : sql`false`) : undefined,
        ),
      );
    const orders = await this.calendar.dayOrders(tx, q.from, to);
    const holidays = await this.calendar.holidays(tx, q.from, to);
    const subs = await tx
      .select({ slotId: teacherSubstitutions.slotId, date: teacherSubstitutions.date, id: users.id, name: users.fullName })
      .from(teacherSubstitutions)
      .innerJoin(users, eq(users.id, teacherSubstitutions.substituteTeacherId))
      .where(and(eq(teacherSubstitutions.status, 'assigned'), gte(teacherSubstitutions.date, q.from), lte(teacherSubstitutions.date, to)));
    const subOf = new Map(subs.map((s) => [`${s.slotId}|${s.date}`, s]));
    const marked = new Set(
      (await tx.selectDistinct({ slotId: attendanceRecords.timetableSlotId, date: attendanceRecords.date }).from(attendanceRecords).where(and(gte(attendanceRecords.date, q.from), lte(attendanceRecords.date, to), sql`${attendanceRecords.timetableSlotId} is not null`))).map((m) => `${m.slotId}|${m.date}`),
    );
    const out: DayPeriod[] = [];
    for (let d = q.from; d <= to; d = addDays(d, 1)) {
      for (const s of slots) {
        if (orders.weekday(d, s.programId) !== s.slot.dayOfWeek) continue;
        if (s.slot.archivedAt && s.slot.archivedAt.toISOString().slice(0, 10) <= d) continue;
        if (holidays.on(d, s.programId)) continue;
        if (d === now.date && hm(s.slot.endsAt) > hm(now.time)) continue;
        if (marked.has(`${s.slot.id}|${d}`)) continue;
        const sub = subOf.get(`${s.slot.id}|${d}`);
        const teacherId = sub?.id ?? s.slot.teacherId;
        if (q.teacherId && teacherId !== q.teacherId) continue;
        if (!isSchoolAdmin(p) && !headed && teacherId !== p.userId) continue;
        out.push({
          slotId: s.slot.id,
          date: d,
          startsAt: hm(s.slot.startsAt),
          endsAt: hm(s.slot.endsAt),
          sectionId: s.slot.sectionId,
          section: s.section,
          subjectId: s.slot.subjectId,
          subject: s.subject,
          teacherId,
          teacher: sub?.name ?? s.teacher,
          substitute: !!sub,
          batch: s.slot.batch,
          combined: s.slot.combinedSectionIds?.length ?? 0,
          marked: 0,
        });
      }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date) || a.startsAt.localeCompare(b.startsAt) || a.section.localeCompare(b.section));
  }

  /** Reminds the teachers of unmarked periods (one reminder per period and day). */
  async remind(tx: Tx, p: UserPrincipal, items: { slotId: string; date: string }[]) {
    const all = await this.unmarked(tx, p, { from: items.reduce((m, i) => (i.date < m ? i.date : m), items[0].date), to: items.reduce((m, i) => (i.date > m ? i.date : m), items[0].date) });
    const want = new Set(items.map((i) => `${i.slotId}|${i.date}`));
    const hits = all.filter((x) => want.has(`${x.slotId}|${x.date}`));
    for (const x of hits) await this.remindOne(tx, x);
    await auditUser(tx, p, 'attendance.unmarked_reminded', 'tenant', p.tenantId, { count: hits.length });
    return { reminded: hits.length };
  }

  private async remindOne(tx: Tx, x: DayPeriod) {
    await this.notifications.notifyUsers(tx, [x.teacherId], { kind: 'task', text: deskTexts.unmarked({ section: x.section, subject: x.subject, date: x.date, time: x.startsAt }), data: { slotId: x.slotId, date: x.date, link: `/attendance/mark?slot=${x.slotId}&date=${x.date}` }, dedupeKey: `unmarked:${x.slotId}:${x.date}` });
  }

  // ---- leave and on duty ------------------------------------------------------------------------------

  /** Who decides leave: the class teacher, the student's mentor-teachers, heads of department and the principal. */
  async assertLeaveDecider(tx: Tx, p: UserPrincipal, studentId: string) {
    if (isSchoolAdmin(p) || p.roles.includes('hod')) return;
    const [s] = await tx.select({ sectionId: students.sectionId, classTeacherId: sections.classTeacherId }).from(students).innerJoin(sections, eq(sections.id, students.sectionId)).where(eq(students.id, studentId));
    if (!s) throw new NotFoundException('Student not found');
    if (s.classTeacherId === p.userId) return;
    const [mine] = await tx.select({ id: timetableSlots.id }).from(timetableSlots).where(and(eq(timetableSlots.sectionId, s.sectionId), eq(timetableSlots.teacherId, p.userId))).limit(1);
    if (!mine) throw new ForbiddenException("Only the student's teachers, the head of department or the principal decide this");
  }

  /** How an approved leave of a kind counts under the policy. */
  countsAs(policy: AttendancePolicy, kind: LeaveKind): Status {
    return kind === 'on_duty' ? policy.onDutyCountsAs : kind === 'medical' ? policy.medicalCountsAs : policy.personalCountsAs;
  }

  /**
   * Approves (writing the marks of every period the leave covers, as the policy says the kind counts, locked days
   * included) or rejects a pending leave. Returns the leave.
   */
  async decideLeave(tx: Tx, p: UserPrincipal, id: string, approve: boolean, note: string | null) {
    const [l] = await tx.select().from(attendanceLeaves).where(eq(attendanceLeaves.id, id)).for('update');
    if (!l) throw new NotFoundException('Leave not found');
    if (l.status !== 'pending') throw new ConflictException(`This leave is already ${l.status}`);
    await this.assertLeaveDecider(tx, p, l.studentId);
    if (l.requestedBy === p.userId && !isSchoolAdmin(p) && !p.roles.includes('hod')) throw new ForbiddenException('Someone else must decide a leave you applied for');
    if (!approve) {
      if (!note) throw new BadRequestException('Give a reason for declining');
      const [row] = await tx.update(attendanceLeaves).set({ status: 'rejected', decidedBy: p.userId, decidedAt: this.clock.now(), decisionNote: note }).where(eq(attendanceLeaves.id, id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'attendance_leave.rejected', subjectType: 'attendance_leave', subjectId: id, changes: { status: { before: 'pending', after: 'rejected' } }, data: { note } });
      await this.tellFamily(tx, row, false);
      return row;
    }
    const [stu] = await tx.select({ sectionId: students.sectionId }).from(students).where(eq(students.id, l.studentId));
    const policy = await attendancePolicy(tx, stu.sectionId);
    const countsAs = this.countsAs(policy, l.kind as LeaveKind);
    const applied = await this.writeLeaveMarks(tx, p, l, countsAs, policy);
    const [row] = await tx
      .update(attendanceLeaves)
      .set({ status: 'approved', countsAs, decidedBy: p.userId, decidedAt: this.clock.now(), decisionNote: note, applied, appliedMarks: applied.length })
      .where(eq(attendanceLeaves.id, id))
      .returning();
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'attendance_leave.approved', subjectType: 'attendance_leave', subjectId: id, changes: { status: { before: 'pending', after: 'approved' } }, data: { countsAs, marks: applied.length, note } });
    await this.tellFamily(tx, row, true);
    return row;
  }

  /** Undoes an approval: the marks it wrote become absent again (the student was not in class). */
  async revokeLeave(tx: Tx, p: UserPrincipal, id: string, note: string) {
    const [l] = await tx.select().from(attendanceLeaves).where(eq(attendanceLeaves.id, id)).for('update');
    if (!l) throw new NotFoundException('Leave not found');
    if (l.status !== 'approved') throw new ConflictException('Only an approved leave can be revoked');
    await this.assertLeaveDecider(tx, p, l.studentId);
    const at = this.clock.now();
    for (const key of l.applied) {
      const [slot, date] = key.split('|');
      if (slot === 'special') continue;
      await tx
        .update(attendanceRecords)
        .set({ status: 'absent', markedBy: p.userId, occurredAt: at, updatedAt: at })
        .where(and(eq(attendanceRecords.studentId, l.studentId), eq(attendanceRecords.date, date), slot === 'day' ? isNull(attendanceRecords.timetableSlotId) : eq(attendanceRecords.timetableSlotId, slot), eq(attendanceRecords.status, l.countsAs ?? 'excused')));
    }
    const [row] = await tx.update(attendanceLeaves).set({ status: 'revoked', decisionNote: note }).where(eq(attendanceLeaves.id, id)).returning();
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'attendance_leave.revoked', subjectType: 'attendance_leave', subjectId: id, changes: { status: { before: 'approved', after: 'revoked' } }, data: { note, marks: l.applied.length } });
    return row;
  }

  /**
   * Writes the leave's marks: every period of the student's class (and the classes it is combined into, its batch,
   * its electives) that meets on a day of the leave and starts inside its hours, skipping holidays; whole-day and
   * session marks when the institution marks by day or session. Returns `slotId|date` keys.
   */
  private async writeLeaveMarks(tx: Tx, p: UserPrincipal, l: typeof attendanceLeaves.$inferSelect, status: Status, policy: AttendancePolicy): Promise<string[]> {
    if (daysBetween(l.fromDate, l.toDate) > MAX_LEAVE_DAYS) throw new BadRequestException(`Leave longer than ${MAX_LEAVE_DAYS} days is approved in parts`);
    const [stu] = await tx.select({ id: students.id, sectionId: students.sectionId, programId: sections.programId }).from(students).innerJoin(sections, eq(sections.id, students.sectionId)).where(eq(students.id, l.studentId));
    const now = await this.now(tx);
    const last = l.toDate < now.date ? l.toDate : now.date;
    const orders = await this.calendar.dayOrders(tx, l.fromDate, last);
    const holidays = await this.calendar.holidays(tx, l.fromDate, last);
    const within = (startsAt: string) => !l.fromTime || !l.toTime || (hm(l.fromTime) <= hm(startsAt) && hm(startsAt) < hm(l.toTime));
    const at = this.clock.now();
    const keys: string[] = [];
    if (policy.mode === 'hour') {
      const candidates = await tx
        .select()
        .from(timetableSlots)
        .where(and(isNull(timetableSlots.archivedAt), or(eq(timetableSlots.sectionId, stu.sectionId), sql`${stu.sectionId}::uuid = any(${timetableSlots.combinedSectionIds})`)));
      const mine: (typeof timetableSlots.$inferSelect)[] = [];
      for (const s of candidates) if ((await periodRoster(tx, s)).some((r) => r.id === stu.id)) mine.push(s);
      for (let d = l.fromDate; d <= last; d = addDays(d, 1)) {
        if (holidays.on(d, stu.programId)) continue;
        for (const s of mine) {
          if (orders.weekday(d, stu.programId) !== s.dayOfWeek || !within(s.startsAt)) continue;
          await tx
            .insert(attendanceRecords)
            .values({ tenantId: p.tenantId, studentId: stu.id, sectionId: stu.sectionId, date: d, timetableSlotId: s.id, status, markedBy: p.userId, occurredAt: at })
            .onConflictDoUpdate({ target: [attendanceRecords.studentId, attendanceRecords.date, attendanceRecords.timetableSlotId], set: { status, markedBy: p.userId, occurredAt: at, updatedAt: at } });
          keys.push(`${s.id}|${d}`);
        }
      }
    } else {
      for (let d = l.fromDate; d <= last; d = addDays(d, 1)) {
        if (holidays.on(d, stu.programId) || orders.weekday(d, stu.programId) === 7) continue;
        if (policy.mode === 'day') {
          await tx
            .insert(attendanceRecords)
            .values({ tenantId: p.tenantId, studentId: stu.id, sectionId: stu.sectionId, date: d, timetableSlotId: null, status, markedBy: p.userId, occurredAt: at })
            .onConflictDoUpdate({ target: [attendanceRecords.studentId, attendanceRecords.date, attendanceRecords.timetableSlotId], set: { status, markedBy: p.userId, occurredAt: at, updatedAt: at } });
          keys.push(`day|${d}`);
        } else {
          for (const session of ['fn', 'an'] as const) {
            if (!within(session === 'fn' ? '09:00' : '13:00')) continue;
            await tx
              .insert(attendanceSessionMarks)
              .values({ tenantId: p.tenantId, studentId: stu.id, sectionId: stu.sectionId, date: d, session, status, markedBy: p.userId, markedAt: at })
              .onConflictDoUpdate({ target: [attendanceSessionMarks.studentId, attendanceSessionMarks.date, attendanceSessionMarks.session], set: { status, markedBy: p.userId, markedAt: at } });
            keys.push(`${session}|${d}`);
          }
        }
      }
    }
    // Special classes in the leave.
    const specials = await tx.select().from(specialClasses).where(and(eq(specialClasses.sectionId, stu.sectionId), gte(specialClasses.date, l.fromDate), lte(specialClasses.date, last), sql`${specialClasses.status} <> 'cancelled'`));
    for (const sc of specials) {
      if (!within(sc.startsAt)) continue;
      await tx
        .insert(specialClassAttendance)
        .values({ tenantId: p.tenantId, specialClassId: sc.id, studentId: stu.id, status, markedBy: p.userId, markedAt: at })
        .onConflictDoUpdate({ target: [specialClassAttendance.specialClassId, specialClassAttendance.studentId], set: { status, markedBy: p.userId, markedAt: at } });
      keys.push(`special|${sc.id}`);
    }
    return keys;
  }

  private async tellFamily(tx: Tx, l: typeof attendanceLeaves.$inferSelect, approved: boolean) {
    const [s] = await tx.select({ name: students.fullName }).from(students).where(eq(students.id, l.studentId));
    await this.notifications.attendanceNotice(tx, l.studentId, { text: deskTexts.leaveDecided({ studentName: s?.name ?? '', kind: l.kind as LeaveKind, approved, from: l.fromDate, to: l.toDate }), data: { leaveId: l.id, studentId: l.studentId }, dedupeKey: `att-leave:${l.id}` });
  }

  // ---- alerts ------------------------------------------------------------------------------------------

  /**
   * The hourly attendance job of one institution: reminders for periods left unmarked past the policy's minutes; in the
   * evening (from 18:00) the families' digest of the day's absences and the shortage alerts.
   */
  async runAlerts(tenantId: string): Promise<{ reminders: number; digests: number; alerts: number }> {
    return this.db.withTenant(tenantId, async (tx) => {
      const policy = await attendancePolicy(tx, null);
      const now = await this.now(tx);
      const system = { tenantId, userId: '', roles: ['tenant_admin'] } as unknown as UserPrincipal;
      let reminders = 0;
      if (policy.unmarkedReminderMinutes > 0) {
        const cutoff = new Date(this.clock.now().getTime() - policy.unmarkedReminderMinutes * 60_000);
        const cut = localParts(cutoff, now.tz);
        const due = (await this.unmarked(tx, system, { from: now.date, to: now.date })).filter((x) => cut.date === now.date && x.endsAt <= hm(cut.time));
        for (const x of due) await this.remindOne(tx, x);
        reminders = due.length;
      }
      if (now.time < '18:00') return { reminders, digests: 0, alerts: 0 };
      const digests = policy.dailyDigest ? await this.sendDigests(tx, now.date) : 0;
      const alerts = policy.shortageAlerts ? (await this.sendShortageAlerts(tx, null)).students : 0;
      return { reminders, digests, alerts };
    });
  }

  /** The evening summary to each family of a student absent for one or more periods today. */
  async sendDigests(tx: Tx, date: string): Promise<number> {
    const rows = await tx.execute<{ student_id: string; name: string; absent: number; held: number; subjects: string }>(sql`
      select ar.student_id, st.full_name as name, count(*) filter (where ar.status = 'absent')::int as absent, count(*)::int as held,
             string_agg(distinct sb.name, ', ') filter (where ar.status = 'absent') as subjects
      from attendance_records ar join students st on st.id = ar.student_id left join timetable_slots ts on ts.id = ar.timetable_slot_id left join subjects sb on sb.id = ts.subject_id
      where ar.date = ${date}::date and st.status = 'active' group by ar.student_id, st.full_name having count(*) filter (where ar.status = 'absent') > 0`);
    for (const r of rows.rows) {
      await this.notifications.attendanceNotice(tx, r.student_id, { text: deskTexts.digest({ studentName: r.name, date, absent: r.absent, held: r.held, subjects: r.subjects ?? '' }), data: { studentId: r.student_id, date }, dedupeKey: `att-digest:${r.student_id}:${date}` });
    }
    return rows.rows.length;
  }

  /**
   * Tells each student (and family) who has fallen under the warning level or the minimum, once per level and scope
   * (a subject, or overall), and logs it. For all classes, or the ones given.
   */
  async sendShortageAlerts(tx: Tx, sectionIds: string[] | null): Promise<{ students: number; recipients: number }> {
    const secs = sectionIds ?? (await tx.selectDistinct({ id: students.sectionId }).from(students).where(eq(students.status, 'active'))).map((s) => s.id);
    const now = await this.now(tx);
    const tenantId = await this.tenantOf(tx);
    let told = 0;
    let recipients = 0;
    for (const sectionId of secs) {
      const policy = await attendancePolicy(tx, sectionId);
      const window = await attendanceWindow(tx, sectionId, now.date);
      const roster = await classStudents(tx, sectionId);
      const list = await eligibilityFor(tx, roster.map((r) => r.id), policy, window);
      const names = new Map(roster.map((r) => [r.id, r.fullName]));
      for (const e of list) {
        const scopes: { scope: string; label: string; pct: number }[] =
          policy.basis === 'per_subject' && policy.mode === 'hour'
            ? e.subjects.filter((s) => s.effective !== null && s.held >= 5).map((s) => ({ scope: s.subjectId, label: s.subject, pct: s.effective! }))
            : e.overall.effective !== null && e.overall.held >= 5
              ? [{ scope: 'overall', label: '', pct: e.overall.effective }]
              : [];
        let sent = false;
        for (const s of scopes) {
          const kind = s.pct < policy.thresholdPct ? 'shortage' : s.pct < policy.warnPct ? 'warning' : null;
          if (!kind) continue;
          const level = kind === 'shortage' ? policy.thresholdPct : policy.warnPct;
          const [logged] = await tx.insert(attendanceAlerts).values({ tenantId, studentId: e.studentId, kind, scope: s.scope, level, percent: s.pct }).onConflictDoNothing().returning({ id: attendanceAlerts.id });
          if (!logged) continue;
          const n = await this.notifications.attendanceNotice(tx, e.studentId, { text: deskTexts.shortage({ studentName: names.get(e.studentId) ?? '', subject: s.label, pct: s.pct, threshold: policy.thresholdPct, short: kind === 'shortage' }), data: { studentId: e.studentId, scope: s.scope }, dedupeKey: `att-${kind}:${e.studentId}:${s.scope}:${level}` });
          await tx.update(attendanceAlerts).set({ recipients: n }).where(eq(attendanceAlerts.id, logged.id));
          recipients += n;
          sent = true;
        }
        if (sent) told++;
      }
    }
    return { students: told, recipients };
  }

  private async tenantOf(tx: Tx): Promise<string> {
    const { rows } = await tx.execute<{ id: string }>(sql`select nullif(current_setting('app.tenant_id', true), '')::uuid as id`);
    return rows[0].id;
  }

  // ---- registers and one student's view ------------------------------------------------------------

  /**
   * The monthly register of a class (university format): a row per student, a column per day with the periods
   * attended of those held (or the mark, for one subject or a day-wise register), leave shown as OD or ML, and totals.
   */
  async register(tx: Tx, sectionId: string, month: string, subjectId?: string) {
    const [sec] = await tx.select({ name: sections.displayName }).from(sections).where(eq(sections.id, sectionId));
    if (!sec) throw new NotFoundException('Class not found');
    const from = `${month}-01`;
    const to = addDays(addDays(from, 32).slice(0, 8) + '01', -1);
    const policy = await attendancePolicy(tx, sectionId);
    const roster = await classStudents(tx, sectionId);
    const ids = roster.map((r) => r.id);
    const attended = (s: Status) => s === 'present' || (s === 'late' && policy.lateCountsAsPresent);
    const marks = !ids.length
      ? []
      : policy.mode === 'session'
        ? (await tx.select({ id: attendanceSessionMarks.studentId, date: attendanceSessionMarks.date, status: attendanceSessionMarks.status }).from(attendanceSessionMarks).where(and(inArray(attendanceSessionMarks.studentId, ids), gte(attendanceSessionMarks.date, from), lte(attendanceSessionMarks.date, to))))
        : await tx
            .select({ id: attendanceRecords.studentId, date: attendanceRecords.date, status: attendanceRecords.status })
            .from(attendanceRecords)
            .leftJoin(timetableSlots, eq(timetableSlots.id, attendanceRecords.timetableSlotId))
            .where(and(inArray(attendanceRecords.studentId, ids), gte(attendanceRecords.date, from), lte(attendanceRecords.date, to), policy.mode === 'day' ? isNull(attendanceRecords.timetableSlotId) : sql`${attendanceRecords.timetableSlotId} is not null`, subjectId ? eq(timetableSlots.subjectId, subjectId) : undefined));
    const leaves = ids.length ? await tx.select().from(attendanceLeaves).where(and(inArray(attendanceLeaves.studentId, ids), eq(attendanceLeaves.status, 'approved'), lte(attendanceLeaves.fromDate, to), gte(attendanceLeaves.toDate, from))) : [];
    const days = [...new Set(marks.map((m) => m.date))].sort();
    const single = policy.mode === 'day' || !!subjectId;
    const students = roster.map((r) => {
      const mine = marks.filter((m) => m.id === r.id);
      const cells: Record<string, string> = {};
      let held = 0;
      let got = 0;
      for (const d of days) {
        const on = mine.filter((m) => m.date === d && m.status !== 'excused');
        const leave = leaves.find((l) => l.studentId === r.id && l.fromDate <= d && d <= l.toDate);
        const a = on.filter((m) => attended(m.status)).length;
        held += on.length;
        got += a;
        if (!on.length) cells[d] = leave ? (leave.kind === 'on_duty' ? 'OD' : leave.kind === 'medical' ? 'ML' : 'L') : mine.some((m) => m.date === d) ? 'E' : '';
        else if (leave) cells[d] = leave.kind === 'on_duty' ? 'OD' : leave.kind === 'medical' ? 'ML' : 'L';
        else if (single && on.length === 1) cells[d] = on[0].status === 'present' ? 'P' : on[0].status === 'late' ? 'L' : 'A';
        else cells[d] = `${a}/${on.length}`;
      }
      return { id: r.id, rollNo: r.rollNo, fullName: r.fullName, enrolledOn: r.enrolledOn, cells, held, attended: got, pct: held ? Math.round((got / held) * 1000) / 10 : null };
    });
    return { section: sec.name, month, from, to, mode: policy.mode, subjectId: subjectId ?? null, thresholdPct: policy.thresholdPct, days, students };
  }

  /** One student's attendance: per subject and overall under the policy, and day by day with each period's mark. */
  async studentView(tx: Tx, studentId: string, range: { from?: string; to?: string }) {
    const [s] = await tx.select({ id: students.id, fullName: students.fullName, rollNo: students.rollNo, sectionId: students.sectionId, section: sections.displayName, enrolledOn: students.enrolledOn }).from(students).innerJoin(sections, eq(sections.id, students.sectionId)).where(eq(students.id, studentId));
    if (!s) throw new NotFoundException('Student not found');
    const now = await this.now(tx);
    const policy = await attendancePolicy(tx, s.sectionId);
    const window = await attendanceWindow(tx, s.sectionId, now.date, range);
    const [e] = await eligibilityFor(tx, [studentId], policy, window);
    const from = window.from ?? addDays(now.date, -30);
    const to = window.to ?? now.date;
    const marks = await tx
      .select({ date: attendanceRecords.date, status: attendanceRecords.status, startsAt: timetableSlots.startsAt, subject: subjects.name, code: subjects.code })
      .from(attendanceRecords)
      .leftJoin(timetableSlots, eq(timetableSlots.id, attendanceRecords.timetableSlotId))
      .leftJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
      .where(and(eq(attendanceRecords.studentId, studentId), gte(attendanceRecords.date, from), lte(attendanceRecords.date, to)))
      .orderBy(asc(attendanceRecords.date), asc(timetableSlots.startsAt));
    const special = await tx
      .select({ date: specialClasses.date, status: specialClassAttendance.status, startsAt: specialClasses.startsAt, subject: subjects.name, code: subjects.code })
      .from(specialClassAttendance)
      .innerJoin(specialClasses, eq(specialClasses.id, specialClassAttendance.specialClassId))
      .innerJoin(subjects, eq(subjects.id, specialClasses.subjectId))
      .where(and(eq(specialClassAttendance.studentId, studentId), gte(specialClasses.date, from), lte(specialClasses.date, to)));
    const byDay = new Map<string, { startsAt: string | null; subject: string | null; code: string | null; status: Status; special: boolean }[]>();
    for (const m of [...marks.map((x) => ({ ...x, special: false })), ...special.map((x) => ({ ...x, special: true }))]) {
      const list = byDay.get(m.date) ?? [];
      list.push({ startsAt: m.startsAt ? hm(m.startsAt) : null, subject: m.subject, code: m.code, status: m.status, special: m.special });
      byDay.set(m.date, list);
    }
    const leaves = await tx.select({ id: attendanceLeaves.id, kind: attendanceLeaves.kind, fromDate: attendanceLeaves.fromDate, toDate: attendanceLeaves.toDate, status: attendanceLeaves.status, reason: attendanceLeaves.reason }).from(attendanceLeaves).where(eq(attendanceLeaves.studentId, studentId)).orderBy(sql`${attendanceLeaves.fromDate} desc`).limit(50);
    return {
      student: { id: s.id, fullName: s.fullName, rollNo: s.rollNo, section: s.section, enrolledOn: s.enrolledOn },
      policy: { thresholdPct: policy.thresholdPct, basis: policy.basis, warnPct: policy.warnPct, mode: policy.mode, profile: policy.profile },
      window: { from, to, label: window.label },
      overall: e.overall,
      subjects: e.subjects,
      status: e.status,
      warning: e.warning,
      days: [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([date, list]) => ({ date, marks: list.sort((a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? '')) })),
      leaves,
    };
  }
}
