/**
 * Spreading a syllabus over the periods a class actually has. Pure functions: the controller
 * collects the dates, these decide the weeks.
 */

import { addDays, isoWeekday } from '../teacher/teacher.service.js';

/** Monday of the week [date] (YYYY-MM-DD) falls in. */
export function mondayOf(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}

/**
 * Dates of every period of a class between [from] and [to] (inclusive): one entry per period, so
 * a subject taught twice on Monday gives that Monday twice. [isOff] says whether classes are
 * cancelled that day (holidays, exam days).
 */
export function periodDates(slotWeekdays: number[], from: string, to: string, isOff: (date: string) => boolean): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (isOff(d)) continue;
    const wd = isoWeekday(d);
    for (const s of slotWeekdays) if (s === wd) out.push(d);
  }
  return out;
}

export interface PlannedTopic {
  topicId: string;
  weekOf: string;
  periods: number;
}

/**
 * Gives each topic (in syllabus order) an equal share of the periods, in order: topic i starts
 * at period floor(i·N/T). With fewer periods than topics, some periods carry two topics, and
 * every topic still gets at least one period on paper.
 */
export function spreadTopics(topicIds: string[], periods: string[]): PlannedTopic[] {
  const n = periods.length;
  const t = topicIds.length;
  if (t === 0 || n === 0) return [];
  return topicIds.map((topicId, i) => {
    const start = Math.floor((i * n) / t);
    const end = Math.floor(((i + 1) * n) / t);
    return { topicId, weekOf: mondayOf(periods[Math.min(start, n - 1)]), periods: Math.max(1, end - start) };
  });
}

export type PlanStatus = 'not_started' | 'on_track' | 'behind' | 'ahead';

/**
 * Where a class stands against its plan on [today]: topics planned for weeks before this one
 * are expected to be taught; this week's are due. Covered topics count wherever they sit.
 */
export function planProgress(items: { topicId: string; weekOf: string }[], covered: Set<string>, today: string) {
  const thisWeek = mondayOf(today);
  const expected = items.filter((i) => i.weekOf < thisWeek);
  const dueThisWeek = items.filter((i) => i.weekOf === thisWeek);
  const coveredCount = items.filter((i) => covered.has(i.topicId)).length;
  const missing = expected.filter((i) => !covered.has(i.topicId)).length;
  let status: PlanStatus;
  if (expected.length === 0 && coveredCount === 0) status = 'not_started';
  else if (missing > 0) status = 'behind';
  else if (coveredCount > expected.length + dueThisWeek.length) status = 'ahead';
  else status = 'on_track';
  return { total: items.length, covered: coveredCount, expected: expected.length, dueThisWeek: dueThisWeek.length, behindBy: missing, status };
}
