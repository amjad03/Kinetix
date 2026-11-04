import { and, eq, sql } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { lmsCourses, lmsItems, lmsModules, students } from '../db/schema.js';
import { lmsItemProgress } from '../db/schema-life.js';

/** Where a learner stands in a SCORM or cmi5 package, as the course item's completion rule reads it. */
export interface PackageOutcome {
  /** The package reported completed or passed. */
  completed: boolean;
  passed: boolean | null;
  /** Score as a percentage, when the package sent one. */
  scorePct: number | null;
}

/** Whether a course item counts as done for this outcome under its rule (opened; marked done; a pass mark). */
export function packageItemDone(rule: 'view' | 'mark_done' | 'pass', passPct: number | null, o: PackageOutcome): boolean {
  if (rule === 'view') return true;
  if (rule === 'mark_done') return o.completed || o.passed === true;
  if (o.passed === false) return false;
  if (passPct !== null && passPct > 0) return o.scorePct !== null ? o.scorePct >= passPct : o.passed === true;
  return o.passed === true || (o.passed === null && o.completed);
}

/** SCORM 1.2 / 2004 learner data as an outcome. */
export function scormOutcome(version: string, cmi: Record<string, string>): PackageOutcome {
  const v12 = version === '1.2';
  const status = (v12 ? cmi['cmi.core.lesson_status'] : cmi['cmi.completion_status']) ?? '';
  const success = v12 ? (status === 'passed' ? true : status === 'failed' ? false : null) : cmi['cmi.success_status'] === 'passed' ? true : cmi['cmi.success_status'] === 'failed' ? false : null;
  const raw = Number(v12 ? cmi['cmi.core.score.raw'] : cmi['cmi.score.raw']);
  const maxS = Number(v12 ? cmi['cmi.core.score.max'] : cmi['cmi.score.max']);
  const scaled = Number(cmi['cmi.score.scaled']);
  const hasRaw = (v12 ? cmi['cmi.core.score.raw'] : cmi['cmi.score.raw']) !== undefined && Number.isFinite(raw) && (v12 ? cmi['cmi.core.score.raw'] : cmi['cmi.score.raw']) !== '';
  const scorePct = !v12 && cmi['cmi.score.scaled'] !== undefined && cmi['cmi.score.scaled'] !== '' && Number.isFinite(scaled) ? Math.round(scaled * 10000) / 100 : hasRaw ? Math.round((raw / (Number.isFinite(maxS) && maxS > 0 ? maxS : 100)) * 10000) / 100 : null;
  return { completed: status === 'completed' || status === 'passed', passed: success, scorePct };
}

/**
 * Brings the learner's progress on every course item that shows this package up to date: opened now, and done when the
 * item's rule is met. A user who is not a student (a teacher previewing) changes nothing.
 */
export async function syncPackageProgress(tx: Tx, tenantId: string, packageId: string, userId: string, outcome: PackageOutcome, now: Date): Promise<number> {
  const [stu] = await tx.select({ id: students.id, sectionId: students.sectionId }).from(students).where(eq(students.userId, userId));
  if (!stu) return 0;
  const items = await tx
    .select({ id: lmsItems.id, rule: lmsItems.completionRule, passPct: lmsItems.passPct })
    .from(lmsItems)
    .innerJoin(lmsModules, eq(lmsModules.id, lmsItems.moduleId))
    .innerJoin(lmsCourses, eq(lmsCourses.id, lmsModules.courseId))
    .where(and(eq(lmsItems.kind, 'scorm'), eq(lmsItems.refId, packageId), eq(lmsCourses.sectionId, stu.sectionId)));
  let done = 0;
  for (const it of items) {
    const finished = packageItemDone(it.rule, it.passPct, outcome);
    if (finished) done++;
    await tx
      .insert(lmsItemProgress)
      .values({ tenantId, itemId: it.id, studentId: stu.id, firstViewedAt: now, lastViewedAt: now, completedAt: finished ? now : null })
      .onConflictDoUpdate({ target: [lmsItemProgress.itemId, lmsItemProgress.studentId], set: { lastViewedAt: now, ...(finished ? { completedAt: sql`coalesce(${lmsItemProgress.completedAt}, ${now.toISOString()}::timestamptz)` } : {}) } });
  }
  return done;
}
