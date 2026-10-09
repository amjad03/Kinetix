/** Pure rules for the project workspace: rubric scoring and skill matching. */

export interface RubricScore {
  total: number;
  percent: number;
}

/** Sums a criterion -> score rubric; every score must lie between 0 and `max`. Returns null when one is out of range or none is given. */
export function scoreRubric(rubric: Record<string, number>, max: number): RubricScore | null {
  const scores = Object.values(rubric);
  if (scores.length === 0 || scores.some((s) => !Number.isFinite(s) || s < 0 || s > max)) return null;
  const total = scores.reduce((a, b) => a + b, 0);
  return { total, percent: Math.round((total / (scores.length * max)) * 10000) / 100 };
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * How well a student's skills cover what a project looks for: the matching terms and a 0-100 fit.
 * A term matches when a skill name contains it or it contains the skill name.
 */
export function skillFit(lookingFor: string[], studentSkills: string[]): { matched: string[]; fit: number } {
  const wanted = [...new Set(lookingFor.map(norm).filter(Boolean))];
  const have = studentSkills.map(norm).filter(Boolean);
  if (wanted.length === 0) return { matched: [], fit: 0 };
  const matched = wanted.filter((w) => have.some((h) => h.includes(w) || w.includes(h)));
  return { matched, fit: Math.round((matched.length / wanted.length) * 100) };
}

/** Whether `ownerOnly` content such as an unpublished portfolio item may be shown to a viewer. */
export const canSeePortfolioItem = (item: { published: boolean }, viewer: { isOwner: boolean; isStaff: boolean }) => item.published || viewer.isOwner || viewer.isStaff;
