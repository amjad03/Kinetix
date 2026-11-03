// Pure rules of the teaching diary: how a period went against its lesson plan, hours allotted to a course, and
// whether a class is on track with its syllabus.

export type AgainstPlan = 'as_planned' | 'ahead' | 'behind' | 'unplanned';

/**
 * Compares the topics taught with the topics planned for the period: no plan is `unplanned`; every planned topic and
 * more is `ahead`; some planned topics left is `behind`; otherwise `as_planned`.
 */
export function againstPlan(planned: string[] | null, taught: string[]): AgainstPlan {
  if (planned === null) return 'unplanned';
  const p = new Set(planned);
  const t = new Set(taught);
  const missing = [...p].filter((x) => !t.has(x)).length;
  const extra = [...t].filter((x) => !p.has(x)).length;
  if (missing > 0) return 'behind';
  if (extra > 0) return 'ahead';
  return 'as_planned';
}

/** Contact hours a week from L-T-P (lecture, tutorial, practical), falling back to the periods timetabled a week. */
export function weeklyHours(s: { lectureHours: number; tutorialHours: number; practicalHours: number }, timetabled: number): number {
  const ltp = s.lectureHours + s.tutorialHours + s.practicalHours;
  return ltp > 0 ? ltp : timetabled;
}

export type Pace = 'ahead' | 'on_track' | 'behind' | 'not_started';

/**
 * Where a class stands with a course: syllabus covered against how far the term has run (periods held so far out of
 * all the term's periods). Within ten points is on track.
 */
export function pace(coveredPct: number | null, elapsedPct: number | null): Pace {
  if (coveredPct === null || elapsedPct === null) return 'not_started';
  if (coveredPct === 0 && elapsedPct > 0) return 'behind';
  const gap = coveredPct - elapsedPct;
  return gap > 10 ? 'ahead' : gap < -10 ? 'behind' : 'on_track';
}

export const pctOf = (n: number, d: number): number | null => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);
