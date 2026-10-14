import { and, eq, gte, inArray, lte, sql, type SQL } from 'drizzle-orm';
import { SETTINGS_DEFAULTS, SETTINGS_SCHEMAS, type Settings } from '../academics/academics-rules.js';
import { resolveForSection, resolveAffiliation } from '../affiliation/resolve.js';
import type { Tx } from '../db/db.service.js';
import { attendanceLeaves, studentBatches } from '../db/schema-academic-ops.js';
import { academicSettings, academicYears, courseOfferings, courseRegistrations, sections, students, timetableSlots } from '../db/schema.js';
import { termFor } from '../terms/terms.js';
import { attendanceSettings, type ThresholdSource } from './eligibility.js';

/**
 * The attendance policy in force for a class, in one place: the eligibility threshold (programme override > approved
 * rule > the affiliating university's profile > the institution's setting > 75), whether the university counts it per
 * subject or overall, how far a shortage may be condoned, and the office's own rules (marking mode, alerts, how leave
 * counts, the condonation fee). See docs/architecture/university-profiles.md.
 */
export interface AttendancePolicy {
  thresholdPct: number;
  source: ThresholdSource;
  lockHours: number | null;
  /** per_subject: a student must reach the threshold in every subject; overall: across all of them. */
  basis: 'overall' | 'per_subject';
  /** The lowest percentage a shortage can be condoned from (null = up to the condonation limit). */
  condonableToPct: number | null;
  /** Under this a student is warned (the threshold plus the office's warning margin). */
  warnPct: number;
  maxCondonationPoints: number;
  lateCountsAsPresent: boolean;
  mode: 'hour' | 'day' | 'session';
  shortageAlerts: boolean;
  dailyDigest: boolean;
  notifyGuardianOnAbsence: boolean;
  unmarkedReminderMinutes: number;
  onDutyCountsAs: 'present' | 'excused';
  medicalCountsAs: 'absent' | 'excused';
  personalCountsAs: 'absent' | 'excused';
  condonationFeePaise: number;
  correctionWindowDays: number;
  profile: { code: string; name: string; scheme: string } | null;
}

/** The academics office's attendance settings, defaults filled in. */
export async function officeAttendanceSettings(tx: Tx): Promise<Settings<'attendance'>> {
  const [row] = await tx.select({ value: academicSettings.value }).from(academicSettings).where(eq(academicSettings.kind, 'attendance'));
  const parsed = SETTINGS_SCHEMAS.attendance.safeParse({ ...SETTINGS_DEFAULTS.attendance, ...(row?.value ?? {}) });
  return parsed.success ? parsed.data : SETTINGS_DEFAULTS.attendance;
}

export async function attendancePolicy(tx: Tx, sectionId?: string | null): Promise<AttendancePolicy> {
  const base = await attendanceSettings(tx, sectionId ?? undefined);
  const office = await officeAttendanceSettings(tx);
  const aff = sectionId ? await resolveForSection(tx, sectionId) : await resolveAffiliation(tx, null);
  const rule = aff?.rules.attendance;
  return {
    thresholdPct: base.thresholdPct,
    source: base.source,
    lockHours: base.lockHours,
    basis: rule?.basis ?? 'overall',
    condonableToPct: rule?.condonableToPercent ?? null,
    warnPct: Math.min(100, base.thresholdPct + Math.max(0, office.warnPercent - office.minPercent)),
    maxCondonationPoints: office.maxCondonationPoints,
    lateCountsAsPresent: office.lateCountsAsPresent,
    mode: office.mode,
    shortageAlerts: office.shortageAlerts,
    dailyDigest: office.dailyDigest,
    notifyGuardianOnAbsence: office.notifyGuardianOnAbsence,
    unmarkedReminderMinutes: office.unmarkedReminderMinutes,
    onDutyCountsAs: office.onDutyCountsAs,
    medicalCountsAs: office.medicalCountsAs,
    personalCountsAs: office.personalCountsAs,
    condonationFeePaise: office.condonationFeePaise,
    correctionWindowDays: office.correctionWindowDays,
    profile: aff ? { code: aff.profile.code, name: aff.profile.name, scheme: aff.scheme.code } : null,
  };
}

export interface AttendanceWindow {
  from: string | null;
  to: string | null;
  /** The term's or year's name. */
  label: string;
}

/**
 * The dates attendance is counted over: the class's current term; without terms, everything marked in the student's
 * present class (a class belongs to one academic year, so that is the year so far). `from`/`to` narrow it.
 */
export async function attendanceWindow(tx: Tx, sectionId: string, today: string, range?: { from?: string; to?: string }): Promise<AttendanceWindow> {
  const [s] = await tx.select({ programId: sections.programId, year: academicYears.label }).from(sections).innerJoin(academicYears, eq(academicYears.id, sections.academicYearId)).where(eq(sections.id, sectionId));
  if (range?.from || range?.to) return { from: range.from ?? null, to: range.to ?? null, label: '' };
  const term = s ? await termFor(tx, today, s.programId) : undefined;
  if (term) return { from: term.startsOn, to: term.endsOn < today ? term.endsOn : today, label: term.name };
  return { from: null, to: null, label: s?.year ?? '' };
}

// ---- who attends a period -----------------------------------------------------------------------

export interface PeriodRosterRow {
  id: string;
  fullName: string;
  rollNo: string;
  sectionId: string;
  section: string;
  enrolledOn: string | null;
  batch: string | null;
}

/**
 * The students who attend a timetable period: its class (and the classes combined with it); only the batch's students
 * when the period is for a lab batch; only the registered students when the period is an elective's (course
 * registration). On a date, students who joined later are left out (their attendance counts from the day they joined).
 */
export async function periodRoster(tx: Tx, slot: { id: string; sectionId: string; batch?: string | null; combinedSectionIds?: string[] | null }, date?: string): Promise<PeriodRosterRow[]> {
  const sectionIds = [slot.sectionId, ...(slot.combinedSectionIds ?? [])];
  const offerings = await tx.select({ id: courseOfferings.id }).from(courseOfferings).where(sql`${slot.id}::uuid = any(${courseOfferings.slotIds})`);
  const registered = offerings.length
    ? new Set((await tx.select({ id: courseRegistrations.studentId }).from(courseRegistrations).where(and(inArray(courseRegistrations.offeringId, offerings.map((o) => o.id)), eq(courseRegistrations.status, 'registered')))).map((r) => r.id))
    : null;
  const rows = await tx
    .select({ id: students.id, fullName: students.fullName, rollNo: students.rollNo, sectionId: students.sectionId, section: sections.displayName, enrolledOn: students.enrolledOn, batch: studentBatches.batch })
    .from(students)
    .innerJoin(sections, eq(sections.id, students.sectionId))
    .leftJoin(studentBatches, eq(studentBatches.studentId, students.id))
    .where(and(registered ? inArray(students.id, [...registered, '00000000-0000-0000-0000-000000000000']) : inArray(students.sectionId, sectionIds), eq(students.status, 'active')));
  return rows
    .filter((r) => !slot.batch || r.batch === slot.batch)
    .filter((r) => !date || !r.enrolledOn || r.enrolledOn <= date)
    .sort((a, b) => a.section.localeCompare(b.section) || a.rollNo.localeCompare(b.rollNo, undefined, { numeric: true }));
}

/** A period's row with its batch and combined classes. */
export async function slotRow(tx: Tx, slotId: string) {
  const [s] = await tx.select().from(timetableSlots).where(eq(timetableSlots.id, slotId));
  return s;
}

// ---- leave covering a date ----------------------------------------------------------------------

export interface LeaveCover {
  leaveId: string;
  kind: string;
  countsAs: 'present' | 'absent' | 'late' | 'excused';
}

/** Approved leave and on duty of these students on a date that covers a period starting at `startsAt` (or the whole day). */
export async function leaveOn(tx: Tx, studentIds: string[], date: string, startsAt?: string): Promise<Map<string, LeaveCover>> {
  const out = new Map<string, LeaveCover>();
  if (!studentIds.length) return out;
  const rows = await tx
    .select()
    .from(attendanceLeaves)
    .where(and(inArray(attendanceLeaves.studentId, studentIds), eq(attendanceLeaves.status, 'approved'), lte(attendanceLeaves.fromDate, date), gte(attendanceLeaves.toDate, date)));
  for (const l of rows) {
    if (startsAt && l.fromTime && l.toTime && !(l.fromTime.slice(0, 5) <= startsAt.slice(0, 5) && startsAt.slice(0, 5) < l.toTime.slice(0, 5))) continue;
    if (l.countsAs) out.set(l.studentId, { leaveId: l.id, kind: l.kind, countsAs: l.countsAs });
  }
  return out;
}

// ---- eligibility ----------------------------------------------------------------------------------

export interface Tally {
  held: number;
  attended: number;
  pct: number | null;
  condoned: number;
  effective: number | null;
}

export interface SubjectTally extends Tally {
  subjectId: string;
  subject: string;
  code: string;
  short: boolean;
}

export type EligibilityStatus = 'eligible' | 'condonable' | 'detained';

export interface StudentEligibility {
  studentId: string;
  overall: Tally;
  subjects: SubjectTally[];
  status: EligibilityStatus;
  /** Subjects (or "overall") the student is short in. */
  shortIn: string[];
  /** Below the warning level but not short. */
  warning: boolean;
}

const pct1 = (attended: number, held: number) => (held > 0 ? Math.round((attended / held) * 1000) / 10 : null);
const eff = (p: number | null, pts: number) => (p === null ? null : Math.min(100, Math.round((p + pts) * 10) / 10));

/** Whether a percentage short of the threshold could still be condoned under the policy. */
export function canBeCondoned(p: AttendancePolicy, pct: number | null): boolean {
  if (pct === null) return true;
  if (p.condonableToPct !== null) return pct >= p.condonableToPct;
  return pct + p.maxCondonationPoints >= p.thresholdPct;
}

/**
 * Each student's attendance over the window: per subject (periods and special classes) and overall, condonation
 * applied (capped at the policy's limit; a condonation with a fee counts once paid or waived), and whether they are
 * eligible, short but condonable, or detained under the policy's basis and condonation floor.
 */
export async function eligibilityFor(tx: Tx, studentIds: string[], policy: AttendancePolicy, window: { from: string | null; to: string | null }): Promise<StudentEligibility[]> {
  if (!studentIds.length) return [];
  const ids = sql.join(studentIds.map((id) => sql`${id}::uuid`), sql`, `);
  const attended = policy.lateCountsAsPresent ? sql`status in ('present','late')` : sql`status = 'present'`;
  const held = sql`status in ('present','late','absent')`;
  // Within the dates; without dates, what was marked in the student's present class.
  const within = (dateCol: SQL, sectionCol: SQL, studentCol: SQL) =>
    window.from || window.to
      ? sql`${dateCol} between coalesce(${window.from}::date, '1900-01-01'::date) and coalesce(${window.to}::date, '2999-12-31'::date)`
      : sql`${sectionCol} = (select st.section_id from students st where st.id = ${studentCol})`;
  const bySubject = (await tx.execute<{ student_id: string; subject_id: string; subject: string; code: string; held: number; attended: number }>(sql`
    with u as (
      select ar.student_id, ts.subject_id, ar.status from attendance_records ar join timetable_slots ts on ts.id = ar.timetable_slot_id
        where ar.student_id in (${ids}) and ${within(sql.raw('ar.date'), sql.raw('ar.section_id'), sql.raw('ar.student_id'))}
      union all
      select sca.student_id, sc.subject_id, sca.status from special_class_attendance sca join special_classes sc on sc.id = sca.special_class_id
        where sca.student_id in (${ids}) and sc.status <> 'cancelled' and ${within(sql.raw('sc.date'), sql.raw('sc.section_id'), sql.raw('sca.student_id'))}
    )
    select u.student_id, u.subject_id, sb.name as subject, sb.code, count(*) filter (where ${held})::int as held, count(*) filter (where ${attended})::int as attended
    from u join subjects sb on sb.id = u.subject_id group by u.student_id, u.subject_id, sb.name, sb.code order by sb.code`)).rows;
  // Whole-day marks count where the institution marks by day, and for anyone with no period marks at all (a day
  // register, biometric punches) where it marks by period.
  const dayRows = (
          await tx.execute<{ student_id: string; held: number; attended: number }>(
            policy.mode !== 'session'
              ? sql`select student_id, count(*) filter (where ${held})::int as held, count(*) filter (where ${attended})::int as attended from attendance_records ar
                    where student_id in (${ids}) and timetable_slot_id is null and ${within(sql.raw('ar.date'), sql.raw('ar.section_id'), sql.raw('ar.student_id'))} group by student_id`
              : sql`select student_id, count(*) filter (where ${held})::int as held, count(*) filter (where ${attended})::int as attended from attendance_session_marks m
                    where student_id in (${ids}) and ${within(sql.raw('m.date'), sql.raw('m.section_id'), sql.raw('m.student_id'))} group by student_id`,
          )
        ).rows;
  const condoned = (await tx.execute<{ student_id: string; subject_id: string | null; pts: number }>(sql`
    select student_id, subject_id, sum(approved_points)::int as pts from attendance_condonations
    where student_id in (${ids}) and status = 'approved' and fee_status in ('none','paid','waived') group by student_id, subject_id`)).rows;
  const overallPts = new Map<string, number>();
  const subjectPts = new Map<string, number>();
  for (const c of condoned) (c.subject_id ? subjectPts.set(`${c.student_id}:${c.subject_id}`, c.pts) : overallPts.set(c.student_id, c.pts));
  const cap = (n: number) => Math.min(policy.maxCondonationPoints, n);

  return studentIds.map((studentId) => {
    const subs = bySubject.filter((r) => r.student_id === studentId);
    const subjects: SubjectTally[] = subs.map((r) => {
      const pct = pct1(r.attended, r.held);
      const condonedPts = cap((subjectPts.get(`${studentId}:${r.subject_id}`) ?? 0) + (overallPts.get(studentId) ?? 0));
      const e = eff(pct, condonedPts);
      return { subjectId: r.subject_id, subject: r.subject, code: r.code, held: r.held, attended: r.attended, pct, condoned: condonedPts, effective: e, short: e !== null && e < policy.thresholdPct };
    });
    const day = dayRows.find((r) => r.student_id === studentId);
    const byPeriod = policy.mode === 'hour' && subs.some((r) => r.held > 0);
    const h = byPeriod ? subs.reduce((s, r) => s + r.held, 0) : (day?.held ?? 0);
    const a = byPeriod ? subs.reduce((s, r) => s + r.attended, 0) : (day?.attended ?? 0);
    const pct = pct1(a, h);
    const pts = cap(overallPts.get(studentId) ?? 0);
    const overall: Tally = { held: h, attended: a, pct, condoned: pts, effective: eff(pct, pts) };
    const overallShort = overall.effective !== null && overall.effective < policy.thresholdPct;
    const perSubject = policy.basis === 'per_subject' && byPeriod;
    const shortIn = perSubject ? subjects.filter((s) => s.short).map((s) => s.subjectId) : overallShort ? ['overall'] : [];
    const detained = perSubject ? subjects.some((s) => s.short && !canBeCondoned(policy, s.pct)) : overallShort && !canBeCondoned(policy, overall.pct);
    const lowest = perSubject ? Math.min(...subjects.map((s) => s.effective ?? 100), 100) : (overall.effective ?? 100);
    return { studentId, overall, subjects, status: detained ? 'detained' : shortIn.length ? 'condonable' : 'eligible', shortIn, warning: shortIn.length === 0 && lowest < policy.warnPct };
  });
}

/** Students of a class who are in attendance's scope (active, on leave or detained). */
export async function classStudents(tx: Tx, sectionId: string) {
  return tx
    .select({ id: students.id, fullName: students.fullName, rollNo: students.rollNo, enrolledOn: students.enrolledOn, sectionId: students.sectionId })
    .from(students)
    .where(and(eq(students.sectionId, sectionId), inArray(students.status, ['active', 'on_leave', 'detained'])))
    .then((rows) => rows.sort((a, b) => a.rollNo.localeCompare(b.rollNo, undefined, { numeric: true })));
}
