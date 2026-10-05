import { and, asc, eq } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { chapters, subjects, topicCoverage, topics, yearPlanItems, yearPlans } from '../db/schema.js';
import { mondayOf } from './planner.js';

/**
 * The topics a period is likely to teach when no lesson plan says so: the year plan's untaught
 * topics for that week, else its next untaught one. Empty without a year plan.
 */
export async function yearPlanTopicIds(tx: Tx, sectionId: string, subjectId: string, date: string): Promise<string[]> {
  const [plan] = await tx.select({ id: yearPlans.id }).from(yearPlans).where(and(eq(yearPlans.sectionId, sectionId), eq(yearPlans.subjectId, subjectId)));
  if (!plan) return [];
  const items = await tx.select({ topicId: yearPlanItems.topicId, weekOf: yearPlanItems.weekOf }).from(yearPlanItems).where(eq(yearPlanItems.planId, plan.id)).orderBy(asc(yearPlanItems.weekOf));
  const covered = await coveredTopicIds(tx, sectionId);
  const open = items.filter((i) => !covered.has(i.topicId));
  const week = open.filter((i) => i.weekOf === mondayOf(date));
  return (week.length ? week : open.slice(0, 1)).map((i) => i.topicId);
}

/** The first topic of the subject's syllabus (in course order) the class has not been taught yet. */
export async function nextUntaughtTopicId(tx: Tx, sectionId: string, subjectId: string): Promise<string | null> {
  const rows = await tx
    .select({ id: topics.id })
    .from(subjects)
    .innerJoin(chapters, eq(chapters.courseId, subjects.courseId))
    .innerJoin(topics, eq(topics.chapterId, chapters.id))
    .where(eq(subjects.id, subjectId))
    .orderBy(asc(chapters.position), asc(topics.position));
  const covered = await coveredTopicIds(tx, sectionId);
  return rows.find((r) => !covered.has(r.id))?.id ?? null;
}

async function coveredTopicIds(tx: Tx, sectionId: string): Promise<Set<string>> {
  return new Set((await tx.select({ topicId: topicCoverage.topicId }).from(topicCoverage).where(eq(topicCoverage.sectionId, sectionId))).map((r) => r.topicId));
}
