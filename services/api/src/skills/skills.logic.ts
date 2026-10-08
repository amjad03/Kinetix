/** Pure rules that turn raw facts into a skill level from 1 (foundation) to 5 (expert). */

export const SKILL_CATEGORIES = ['knowledge', 'skill', 'attitude', 'leadership', 'communication', 'career'] as const;
export const MAP_KINDS = ['subject', 'course_outcome', 'club', 'event_type', 'placement', 'internship', 'research', 'certificate'] as const;
export const EVENT_TYPES = ['seminar', 'workshop', 'parent_meeting', 'fest', 'sports', 'competition', 'conference', 'alumni', 'other'] as const;
export type MapKind = (typeof MAP_KINDS)[number];

/** A percentage of marks: under 40 is level 1, then 55, 70 and 85 step up to 5. */
export function levelFromPercent(pct: number): number {
  return pct >= 85 ? 5 : pct >= 70 ? 4 : pct >= 55 ? 3 : pct >= 40 ? 2 : 1;
}

/** Club activity points: 1, 10, 25, 50 and 100 points mark levels 1 to 5. */
export function levelFromPoints(points: number): number {
  return points >= 100 ? 5 : points >= 50 ? 4 : points >= 25 ? 3 : points >= 10 ? 2 : 1;
}

/** Events attended: 1, 2, 3, 5 and 8 mark levels 1 to 5. */
export function levelFromCount(n: number): number {
  return n >= 8 ? 5 : n >= 5 ? 4 : n >= 3 ? 3 : n >= 2 ? 2 : 1;
}

/** A completed internship is level 3; a good employer evaluation (75, 90 out of 100) adds a level each. */
export function internshipLevel(evaluationScore: number | null): number {
  return Math.min(5, 3 + (evaluationScore !== null && evaluationScore >= 75 ? 1 : 0) + (evaluationScore !== null && evaluationScore >= 90 ? 1 : 0));
}

/** The skill's level is the average of its evidence levels, rounded; null when there is no evidence. */
export function skillLevel(levels: number[]): number | null {
  if (!levels.length) return null;
  return Math.min(5, Math.max(1, Math.round(levels.reduce((s, l) => s + l, 0) / levels.length)));
}

export const percent = (got: number, of: number): number => (of > 0 ? Math.round((got / of) * 1000) / 10 : 0);
