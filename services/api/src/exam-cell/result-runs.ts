import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { academicDocRequests, examResultLines, examResults, examSessions, resultRevisions, resultRuns } from '../db/schema.js';
import type { ExamsService, ProcessedStudent, SessionRow } from '../exams/exams.service.js';
import type { ResultShape } from './exam-cell.logic.js';

/** A stored result with its lines, as kept in a run's snapshot and a revision. */
export interface StoredResult {
  studentId: string;
  sgpa: number;
  cgpa: number;
  creditsAttempted: number;
  creditsEarned: number;
  creditPoints: number;
  outcome: string;
  rulesRef: unknown;
  lines: { subjectId: string; credits: number; percent: number; grade: string; gradePoint: number; passed: boolean; reasons: unknown; components: unknown; grace: number }[];
}

/** The session's stored results (optionally for some students), with their lines. */
export async function storedResults(tx: Tx, sessionId: string, studentIds?: string[]): Promise<StoredResult[]> {
  const rs = await tx
    .select()
    .from(examResults)
    .where(and(eq(examResults.sessionId, sessionId), studentIds ? inArray(examResults.studentId, studentIds.length ? studentIds : ['00000000-0000-0000-0000-000000000000']) : sql`true`));
  if (rs.length === 0) return [];
  const lines = await tx.select().from(examResultLines).where(inArray(examResultLines.resultId, rs.map((r) => r.id)));
  return rs.map((r) => ({
    studentId: r.studentId,
    sgpa: r.sgpa,
    cgpa: r.cgpa,
    creditsAttempted: r.creditsAttempted,
    creditsEarned: r.creditsEarned,
    creditPoints: r.creditPoints,
    outcome: r.outcome,
    rulesRef: r.rulesRef,
    lines: lines.filter((l) => l.resultId === r.id).map((l) => ({ subjectId: l.subjectId, credits: l.credits, percent: l.percent, grade: l.grade, gradePoint: l.gradePoint, passed: l.passed, reasons: l.reasons, components: l.components, grace: l.grace })),
  }));
}

/** Puts stored results back exactly as they were (a rollback). */
export async function restoreResults(tx: Tx, tenantId: string, sessionId: string, snapshot: StoredResult[]): Promise<void> {
  await tx.delete(examResults).where(eq(examResults.sessionId, sessionId));
  for (const r of snapshot) {
    const [row] = await tx
      .insert(examResults)
      .values({ tenantId, sessionId, studentId: r.studentId, sgpa: r.sgpa, cgpa: r.cgpa, creditsAttempted: r.creditsAttempted, creditsEarned: r.creditsEarned, creditPoints: r.creditPoints, outcome: r.outcome, rulesRef: r.rulesRef as never })
      .returning({ id: examResults.id });
    if (r.lines.length) await tx.insert(examResultLines).values(r.lines.map((l) => ({ tenantId, resultId: row.id, ...l, reasons: l.reasons as never, components: l.components as never })));
  }
}

export const shapeOfStored = (r: StoredResult): ResultShape => ({ studentId: r.studentId, sgpa: r.sgpa, outcome: r.outcome, lines: r.lines.map((l) => ({ subjectId: l.subjectId, grade: l.grade, percent: l.percent, passed: l.passed })) });
export const shapeOfProcessed = (r: ProcessedStudent): ResultShape => ({ studentId: r.studentId, sgpa: r.sgpa, outcome: r.outcome, lines: r.lines.map((l) => ({ subjectId: l.subjectId, grade: l.result.grade, percent: l.result.percent, passed: l.result.passed })) });

/** Records a run; processing keeps the results it replaced so a rollback can restore them. */
export async function recordRun(tx: Tx, tenantId: string, sessionId: string, kind: string, actorId: string, summary: Record<string, unknown>, snapshot: StoredResult[] | null = null, note: string | null = null) {
  const [row] = await tx.insert(resultRuns).values({ tenantId, sessionId, kind, summary, snapshot: snapshot as never, note, createdBy: actorId }).returning();
  return row;
}

/** The next revision number of a student's result in a session. */
async function nextVersion(tx: Tx, sessionId: string, studentId: string): Promise<number> {
  const [r] = await tx.select({ v: sql<number>`coalesce(max(${resultRevisions.version}), 0)::int` }).from(resultRevisions).where(and(eq(resultRevisions.sessionId, sessionId), eq(resultRevisions.studentId, studentId)));
  return (r?.v ?? 0) + 1;
}

/**
 * Re-grades one student in a session whose results are out (published or locked) after a change to their marks,
 * keeps a revision with the result before and after, recalculates the CGPA of the student's later sessions, and
 * marks their issued transcripts and grade cards as out of date. Returns the new result.
 */
export async function reviseResult(tx: Tx, exams: ExamsService, tenantId: string, actorId: string, s: SessionRow, studentId: string, kind: string, reason: string): Promise<{ result: ProcessedStudent | undefined; version: number; later: number }> {
  const [before] = await storedResults(tx, s.id, [studentId]);
  const [res] = await exams.compute(tx, s, studentId);
  if (res) await exams.store(tx, tenantId, s, [res]);
  const [after] = await storedResults(tx, s.id, [studentId]);
  const version = await nextVersion(tx, s.id, studentId);
  await tx.insert(resultRevisions).values({ tenantId, sessionId: s.id, studentId, version, kind, reason, before: (before ?? {}) as never, after: (after ?? {}) as never, createdBy: actorId });
  // A correction to an older term changes the CGPA of every later term.
  const later = await tx
    .select()
    .from(examSessions)
    .innerJoin(examResults, and(eq(examResults.sessionId, examSessions.id), eq(examResults.studentId, studentId)))
    .where(and(eq(examSessions.programId, s.programId), inArray(examSessions.status, ['published', 'locked']), gt(examSessions.startsOn, s.startsOn)))
    .orderBy(asc(examSessions.startsOn));
  let changed = 0;
  for (const l of later) {
    const ls = l.exam_sessions;
    const [old] = await storedResults(tx, ls.id, [studentId]);
    const [again] = await exams.compute(tx, ls, studentId);
    if (!again || !old || again.cgpa === old.cgpa) continue;
    await exams.store(tx, tenantId, ls, [again]);
    const [now] = await storedResults(tx, ls.id, [studentId]);
    await tx.insert(resultRevisions).values({ tenantId, sessionId: ls.id, studentId, version: await nextVersion(tx, ls.id, studentId), kind: 'correction', reason: `CGPA recalculated after a change in ${s.name}`, before: old as never, after: now as never, createdBy: actorId });
    changed++;
  }
  await supersedeDocuments(tx, studentId, `Result changed in ${s.name}: ${reason}`);
  return { result: res, version, later: changed };
}

/** Issued academic documents of a student that no longer match the record (to be issued again). */
export async function supersedeDocuments(tx: Tx, studentId: string, reason: string): Promise<number> {
  const rows = await tx
    .update(academicDocRequests)
    .set({ supersededAt: new Date(), supersededReason: reason.slice(0, 300) })
    .where(and(eq(academicDocRequests.studentId, studentId), eq(academicDocRequests.status, 'issued'), isNotNull(academicDocRequests.serialNo), isNull(academicDocRequests.supersededAt)))
    .returning({ id: academicDocRequests.id });
  return rows.length;
}

/** The latest processing run of a session that kept a snapshot. */
export async function lastProcessRun(tx: Tx, sessionId: string) {
  const [r] = await tx
    .select()
    .from(resultRuns)
    .where(and(eq(resultRuns.sessionId, sessionId), eq(resultRuns.kind, 'process'), isNotNull(resultRuns.snapshot), sql`coalesce((${resultRuns.summary} ->> 'rolledBack')::boolean, false) = false`))
    .orderBy(desc(resultRuns.createdAt))
    .limit(1);
  return r ?? null;
}
