import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { attendanceCondonations, attendanceRecords, subjects, tenants, timetableSlots } from '../db/schema.js';
import { attendancePct, effectivePct } from './attendance-rules.js';

export const DEFAULT_THRESHOLD_PCT = 75;

export async function attendanceSettings(tx: Tx): Promise<{ lockHours: number | null; thresholdPct: number }> {
  const [t] = await tx.select({ settings: tenants.settings }).from(tenants);
  return { lockHours: t?.settings?.attendanceLockHours ?? null, thresholdPct: t?.settings?.attendanceThresholdPct ?? DEFAULT_THRESHOLD_PCT };
}

export interface SubjectAttendance {
  studentId: string;
  subjectId: string;
  subject: string;
  present: number;
  late: number;
  absent: number;
  pct: number | null;
  condonedPoints: number;
  effectivePct: number | null;
  short: boolean;
}

/** Per student and subject: sessions attended, condonation applied, and whether it is under the threshold. */
export async function subjectAttendance(tx: Tx, studentIds: string[], thresholdPct: number, subjectId?: string): Promise<SubjectAttendance[]> {
  if (studentIds.length === 0) return [];
  const rows = await tx
    .select({
      studentId: attendanceRecords.studentId,
      subjectId: timetableSlots.subjectId,
      subject: subjects.name,
      present: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'present')::int`,
      late: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'late')::int`,
      absent: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'absent')::int`,
    })
    .from(attendanceRecords)
    .innerJoin(timetableSlots, eq(timetableSlots.id, attendanceRecords.timetableSlotId))
    .innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
    .where(and(inArray(attendanceRecords.studentId, studentIds), subjectId ? eq(timetableSlots.subjectId, subjectId) : undefined))
    .groupBy(attendanceRecords.studentId, timetableSlots.subjectId, subjects.name);
  const condoned = await condonedPoints(tx, studentIds);
  return rows.map((r) => {
    const pct = attendancePct(r.present, r.late, r.absent);
    const pts = (condoned.overall.get(r.studentId) ?? 0) + (condoned.bySubject.get(`${r.studentId}:${r.subjectId}`) ?? 0);
    const eff = effectivePct(pct, pts);
    return { ...r, pct, condonedPoints: pts, effectivePct: eff, short: eff !== null && eff < thresholdPct };
  });
}

/** Overall attendance per student (all subjects together), after condonation. */
export async function overallAttendance(tx: Tx, studentIds: string[], thresholdPct: number): Promise<Map<string, { pct: number | null; condonedPoints: number; effectivePct: number | null; eligible: boolean }>> {
  const out = new Map<string, { pct: number | null; condonedPoints: number; effectivePct: number | null; eligible: boolean }>();
  if (studentIds.length === 0) return out;
  const rows = await tx
    .select({
      studentId: attendanceRecords.studentId,
      present: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'present')::int`,
      late: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'late')::int`,
      absent: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'absent')::int`,
    })
    .from(attendanceRecords)
    .where(inArray(attendanceRecords.studentId, studentIds))
    .groupBy(attendanceRecords.studentId);
  const condoned = await condonedPoints(tx, studentIds);
  const byStudent = new Map(rows.map((r) => [r.studentId, r]));
  for (const id of studentIds) {
    const r = byStudent.get(id);
    const pct = r ? attendancePct(r.present, r.late, r.absent) : null;
    const pts = condoned.overall.get(id) ?? 0;
    const eff = effectivePct(pct, pts);
    // No records yet = nothing to hold against the student.
    out.set(id, { pct, condonedPoints: pts, effectivePct: eff, eligible: eff === null || eff >= thresholdPct });
  }
  return out;
}

async function condonedPoints(tx: Tx, studentIds: string[]) {
  const rows = await tx
    .select({ studentId: attendanceCondonations.studentId, subjectId: attendanceCondonations.subjectId, points: sql<number>`sum(${attendanceCondonations.approvedPoints})::int` })
    .from(attendanceCondonations)
    .where(and(inArray(attendanceCondonations.studentId, studentIds), eq(attendanceCondonations.status, 'approved')))
    .groupBy(attendanceCondonations.studentId, attendanceCondonations.subjectId);
  const overall = new Map<string, number>();
  const bySubject = new Map<string, number>();
  for (const r of rows) {
    if (r.subjectId) bySubject.set(`${r.studentId}:${r.subjectId}`, r.points);
    else overall.set(r.studentId, r.points);
  }
  return { overall, bySubject };
}
