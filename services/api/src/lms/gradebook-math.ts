/** Pure grade arithmetic for the LMS gradebook. */

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** A percentage from earned and maximum marks; null when nothing was graded. */
export const percentOf = (earned: number, max: number): number | null => (max > 0 ? round2((earned / max) * 100) : null);

/** The weighted running grade over the categories that have data; weights are re-based so a missing category does not count against the student. */
export function weightedGrade(cats: { weight: number; percent: number | null }[]): number | null {
  const used = cats.filter((c) => c.percent !== null);
  const total = used.reduce((s, c) => s + c.weight, 0);
  if (total === 0) return null;
  return round2(used.reduce((s, c) => s + c.weight * (c.percent as number), 0) / total);
}

const LETTERS: [number, string][] = [[90, 'A+'], [80, 'A'], [70, 'B'], [60, 'C'], [50, 'D']];
export const letterGrade = (p: number | null): string | null => (p === null ? null : (LETTERS.find(([min]) => p >= min)?.[1] ?? 'F'));
