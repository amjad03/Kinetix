import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { attendanceOverrides } from '../db/schema-g1.js';
import { academicSettings, attendanceCondonations, attendanceRecords, businessRules, sections, subjects, tenants, timetableSlots } from '../db/schema.js';
import { ruleInForce } from '../governance/governance.logic.js';
import { attendancePct, effectivePct } from './attendance-rules.js';
import { resolveAffiliation, resolveForSection } from '../affiliation/resolve.js';
import { localParts } from '../common/time.js';

export const DEFAULT_THRESHOLD_PCT = 75;

/**
 * The attendance rules in force. A class's programme may override the threshold or lock window (attendance_overrides); otherwise
 * the threshold comes from the approved, dated rule `attendance/exam-eligibility` in the rule registry (governance) when there
 * is one for today, else the affiliating university's or board's profile (VTU 85%, BCI 70% for law, ...), else the institution's
 * setting, else 75.
 */
export async function attendanceSettings(tx: Tx, sectionId?: string, today?: string): Promise<{ lockHours: number | null; thresholdPct: number; overridden: boolean; source: ThresholdSource }> {
  const [t] = await tx.select({ settings: tenants.settings, timezone: tenants.timezone }).from(tenants);
  today = ruleDate(today, new Date(), t?.timezone ?? 'Asia/Kolkata');
  const rules = await tx.select().from(businessRules).where(and(eq(businessRules.domain, 'attendance'), eq(businessRules.key, 'exam-eligibility'), eq(businessRules.status, 'approved')));
  const fromRule = Number(ruleInForce(rules, today)?.params?.thresholdPercent);
  const governed = Number.isFinite(fromRule) && fromRule > 0 && fromRule <= 100 ? fromRule : null;
  const affiliation = sectionId ? await resolveForSection(tx, sectionId) : await resolveAffiliation(tx, null);
  const [{ value: saved } = { value: null }] = await tx.select({ value: academicSettings.value }).from(academicSettings).where(eq(academicSettings.kind, 'attendance'));
  const office = Number(saved?.minPercent);
  const chain: [number | null | undefined, ThresholdSource][] = [
    [governed, 'rule'],
    [affiliation?.rules.attendance.minPercent, 'profile'],
    [t?.settings?.attendanceThresholdPct, 'institution'],
    [Number.isFinite(office) && office > 0 ? office : null, 'institution'],
  ];
  const [thresholdPct, source] = chain.find(([v]) => typeof v === 'number') ?? [DEFAULT_THRESHOLD_PCT, 'default' as const];
  const base = { lockHours: t?.settings?.attendanceLockHours ?? null, thresholdPct: thresholdPct as number, overridden: false, source };
  if (!sectionId) return base;
  const [o] = await tx.select({ thresholdPct: attendanceOverrides.thresholdPct, lockHours: attendanceOverrides.lockHours }).from(attendanceOverrides).innerJoin(sections, eq(sections.programId, attendanceOverrides.programId)).where(eq(sections.id, sectionId));
  return o ? { thresholdPct: o.thresholdPct, lockHours: o.lockHours ?? base.lockHours, overridden: true, source: 'programme' } : base;
}

/** The date a dated rule is looked up for: the one given, else today in the institution's time zone (not UTC: at 00:30 IST it is still yesterday in UTC). */
export function ruleDate(today: string | undefined, now: Date, timeZone: string): string {
  return today ?? localParts(now, timeZone).date;
}

/** Where the attendance threshold in force comes from. */
export type ThresholdSource = 'programme' | 'rule' | 'profile' | 'institution' | 'default';

export interface SubjectAttendance {
  studentId: string;
  subjectId: string;
  subject: string;
  present: number;
  late: number;
  absent: number;
  /** Sessions on approved on-duty leave (reported apart from present; counted as attended when the institution's rule says so). */
  onDuty: number;
  pct: number | null;
  condonedPoints: number;
  effectivePct: number | null;
  short: boolean;
}

/**
 * Whether an attendance record (alias `ar`) was written by an approved on-duty leave: the leave keeps the `slot|date`
 * keys it marked (`day|date` for a whole-day mark).
 */
export const onDutyRecord = (ar: string) =>
  sql.raw(
    `exists (select 1 from attendance_leaves odl where odl.student_id = ${ar}.student_id and odl.status = 'approved' and odl.kind = 'on_duty' and odl.applied @> jsonb_build_array(coalesce(${ar}.timetable_slot_id::text, 'day') || '|' || ${ar}.date::text))`,
  );

/** The institution's rule for on-duty sessions: counted as attended (the default, as most universities do) or left out. */
export async function onDutyCounts(tx: Tx): Promise<boolean> {
  const [{ value } = { value: null }] = await tx.select({ value: academicSettings.value }).from(academicSettings).where(eq(academicSettings.kind, 'attendance'));
  return (value as { onDutyCountsAs?: string } | null)?.onDutyCountsAs !== 'excused';
}

/**
 * Per student and subject: sessions attended, condonation applied, and whether it is under the threshold. Only the
 * current attempt of a subject counts: a detained student who sits the subject again in a later year has only that
 * year's sessions counted (the latest academic year and term in which they have records for the subject), while a
 * backlog subject attended with a lower class still counts, being the only attempt with records.
 */
export async function subjectAttendance(tx: Tx, studentIds: string[], thresholdPct: number, subjectId?: string): Promise<SubjectAttendance[]> {
  if (studentIds.length === 0) return [];
  const ids = sql.join(studentIds.map((id) => sql`${id}::uuid`), sql`, `);
  const raw = (
    await tx.execute<{ student_id: string; subject_id: string; subject: string; present: number; late: number; absent: number; on_duty: number }>(sql`
    with r as (
      select ar.student_id, ts.subject_id, ar.status, ${onDutyRecord('ar')} as od,
        dense_rank() over (partition by ar.student_id, ts.subject_id order by ay.starts_on desc, s.term desc) as attempt
      from attendance_records ar
      join timetable_slots ts on ts.id = ar.timetable_slot_id
      join sections s on s.id = ar.section_id
      join academic_years ay on ay.id = s.academic_year_id
      where ar.student_id in (${ids}) ${subjectId ? sql`and ts.subject_id = ${subjectId}::uuid` : sql``}
    )
    select r.student_id, r.subject_id, sb.name as subject,
      count(*) filter (where r.status = 'present' and not r.od)::int as present,
      count(*) filter (where r.status = 'late' and not r.od)::int as late,
      count(*) filter (where r.status = 'absent')::int as absent,
      count(*) filter (where r.od and r.status <> 'absent')::int as on_duty
    from r join subjects sb on sb.id = r.subject_id
    where r.attempt = 1
    group by r.student_id, r.subject_id, sb.name`)
  ).rows;
  const rows = raw.map((r) => ({ studentId: r.student_id, subjectId: r.subject_id, subject: r.subject, present: r.present, late: r.late, absent: r.absent, onDuty: r.on_duty }));
  const condoned = await condonedPoints(tx, studentIds);
  const odCounts = await onDutyCounts(tx);
  return rows.map((r) => {
    const pct = attendancePct(r.present, r.late, r.absent, { onDuty: r.onDuty, onDutyCounts: odCounts });
    const pts = (condoned.overall.get(r.studentId) ?? 0) + (condoned.bySubject.get(`${r.studentId}:${r.subjectId}`) ?? 0);
    const eff = effectivePct(pct, pts);
    return { ...r, pct, condonedPoints: pts, effectivePct: eff, short: eff !== null && eff < thresholdPct };
  });
}

/**
 * Overall attendance per student (all subjects together) in the student's current term, after condonation. Only
 * records taken in a class of the same academic year and term as the student's class now count: without this a
 * semester 3 student's eligibility pooled semesters 1 and 2 as well (a moved student keeps the term's records).
 */
export async function overallAttendance(tx: Tx, studentIds: string[], thresholdPct: number): Promise<Map<string, { pct: number | null; onDuty: number; condonedPoints: number; effectivePct: number | null; eligible: boolean }>> {
  const out = new Map<string, { pct: number | null; onDuty: number; condonedPoints: number; effectivePct: number | null; eligible: boolean }>();
  if (studentIds.length === 0) return out;
  const rows = await tx
    .select({
      studentId: attendanceRecords.studentId,
      present: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'present' and not ${onDutyRecord('attendance_records')})::int`,
      late: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'late' and not ${onDutyRecord('attendance_records')})::int`,
      absent: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'absent')::int`,
      onDuty: sql<number>`count(*) filter (where ${attendanceRecords.status} <> 'absent' and ${onDutyRecord('attendance_records')})::int`,
    })
    .from(attendanceRecords)
    .where(
      and(
        inArray(attendanceRecords.studentId, studentIds),
        sql`${attendanceRecords.sectionId} in (select rs.id from sections rs join sections cs on cs.academic_year_id = rs.academic_year_id and cs.term = rs.term join students st on st.section_id = cs.id where st.id = ${attendanceRecords.studentId})`,
      ),
    )
    .groupBy(attendanceRecords.studentId);
  const condoned = await condonedPoints(tx, studentIds);
  const byStudent = new Map(rows.map((r) => [r.studentId, r]));
  const odCounts = await onDutyCounts(tx);
  for (const id of studentIds) {
    const r = byStudent.get(id);
    const pct = r ? attendancePct(r.present, r.late, r.absent, { onDuty: r.onDuty, onDutyCounts: odCounts }) : null;
    const pts = condoned.overall.get(id) ?? 0;
    const eff = effectivePct(pct, pts);
    // No records yet = nothing to hold against the student.
    out.set(id, { pct, onDuty: r?.onDuty ?? 0, condonedPoints: pts, effectivePct: eff, eligible: eff === null || eff >= thresholdPct });
  }
  return out;
}

async function condonedPoints(tx: Tx, studentIds: string[]) {
  const rows = await tx
    .select({ studentId: attendanceCondonations.studentId, subjectId: attendanceCondonations.subjectId, points: sql<number>`sum(${attendanceCondonations.approvedPoints})::int` })
    .from(attendanceCondonations)
    // A condonation with a fee counts once the fee is paid or waived.
    .where(and(inArray(attendanceCondonations.studentId, studentIds), eq(attendanceCondonations.status, 'approved'), inArray(attendanceCondonations.feeStatus, ['none', 'paid', 'waived'])))
    .groupBy(attendanceCondonations.studentId, attendanceCondonations.subjectId);
  const overall = new Map<string, number>();
  const bySubject = new Map<string, number>();
  for (const r of rows) {
    if (r.subjectId) bySubject.set(`${r.studentId}:${r.subjectId}`, r.points);
    else overall.set(r.studentId, r.points);
  }
  return { overall, bySubject };
}
