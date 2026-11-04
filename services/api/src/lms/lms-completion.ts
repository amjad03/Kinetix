import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { lmsCourses, lmsItems, lmsModules } from '../db/schema.js';
import { lmsItemProgress } from '../db/schema-life.js';
import { itemAccess, type AccessRules } from './lms-access.js';
import type { LmsService } from './lms.service.js';

type Course = typeof lmsCourses.$inferSelect;

export interface Completion {
  /** Items released to this student. */
  total: number;
  done: number;
  pct: number;
  /** The running grade (published marks only), or null before anything is graded. */
  grade: number | null;
  /** The course's rules are met. */
  eligible: boolean;
  /** Why not yet: items (the share still to finish) and/or grade. */
  missing: ('items' | 'grade')[];
}

/** One student's completion of a course from the items released to them, what they finished and their grade. */
export function completionOf(items: AccessRules[], studentId: string, now: Date, finished: ReadonlySet<string>, grade: number | null, rules: { completionPct: number; minGradePct: number | null }): Completion {
  const mine = items.filter((i) => itemAccess(i, studentId, now, finished).visible);
  const done = mine.filter((i) => finished.has(i.id)).length;
  const pct = mine.length ? Math.floor((done * 100) / mine.length) : 0;
  const missing: Completion['missing'] = [];
  if (!mine.length || pct < rules.completionPct) missing.push('items');
  if (rules.minGradePct !== null && (grade === null || grade < rules.minGradePct)) missing.push('grade');
  return { total: mine.length, done, pct, grade, eligible: missing.length === 0, missing };
}

/** Completion of a course for many students in a fixed number of queries. */
export async function courseCompletions(tx: Tx, lms: LmsService, c: Course, studentIds: string[], now: Date): Promise<Map<string, Completion>> {
  const out = new Map<string, Completion>();
  if (!studentIds.length) return out;
  const items = await tx
    .select({ id: lmsItems.id, releaseAt: lmsItems.releaseAt, prerequisiteItemId: lmsItems.prerequisiteItemId, audienceStudentIds: lmsItems.audienceStudentIds })
    .from(lmsItems)
    .innerJoin(lmsModules, eq(lmsModules.id, lmsItems.moduleId))
    .where(eq(lmsModules.courseId, c.id))
    .orderBy(asc(lmsModules.position), asc(lmsItems.position));
  const prog = items.length ? await tx.select({ itemId: lmsItemProgress.itemId, studentId: lmsItemProgress.studentId }).from(lmsItemProgress).where(and(inArray(lmsItemProgress.itemId, items.map((i) => i.id)), inArray(lmsItemProgress.studentId, studentIds), isNotNull(lmsItemProgress.completedAt))) : [];
  const grades = c.minGradePct !== null ? new Map((await lms.gradebook(tx, c, { publishedOnly: true, studentIds })).rows.map((r) => [r.studentId, r.overall])) : new Map<string, number | null>();
  for (const s of studentIds) {
    const finished = new Set(prog.filter((x) => x.studentId === s).map((x) => x.itemId));
    out.set(s, completionOf(items, s, now, finished, grades.get(s) ?? null, { completionPct: c.completionPct, minGradePct: c.minGradePct }));
  }
  return out;
}

/** The prerequisite courses a student has not completed yet (ids), for courses that ask for some. */
export async function openPrerequisites(tx: Tx, lms: LmsService, c: Course, studentId: string, now: Date): Promise<{ id: string; title: string }[]> {
  if (!c.prerequisiteCourseIds?.length) return [];
  const pre = await tx.select().from(lmsCourses).where(inArray(lmsCourses.id, c.prerequisiteCourseIds));
  const open: { id: string; title: string }[] = [];
  for (const p of pre) {
    const done = (await courseCompletions(tx, lms, p, [studentId], now)).get(studentId);
    if (!done?.eligible) open.push({ id: p.id, title: p.title });
  }
  return open;
}
