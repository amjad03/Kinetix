/** Pure rules of homework peer review. */

/** How many classmates review each piece of work. */
export const PEERS_PER_WORK = 2;

/**
 * Who reviews whom: students are put in a stable order and each work is reviewed by the next
 * [perWork] students after its author (wrapping round), so everyone reviews as many pieces as they
 * wrote and nobody reviews their own. With fewer classmates than [perWork] + 1 each work gets
 * as many reviewers as there are other students.
 */
export function pairPeers(authorIds: readonly string[], perWork = PEERS_PER_WORK): { authorId: string; reviewerId: string }[] {
  const ids = [...new Set(authorIds)].sort();
  const n = ids.length;
  const k = Math.min(perWork, n - 1);
  const out: { authorId: string; reviewerId: string }[] = [];
  for (let i = 0; i < n; i++) for (let j = 1; j <= k; j++) out.push({ authorId: ids[i], reviewerId: ids[(i + j) % n] });
  return out;
}

export interface Rubric {
  clarity: number;
  accuracy: number;
  effort: number;
}

/** The three rubric scores added up (3 to 15). */
export function rubricTotal(r: Rubric): number {
  return r.clarity + r.accuracy + r.effort;
}

/** The average rubric total of finished reviews, to one decimal, or null when there are none. */
export function averageTotal(rubrics: readonly Rubric[]): number | null {
  if (rubrics.length === 0) return null;
  return Math.round((rubrics.reduce((n, r) => n + rubricTotal(r), 0) / rubrics.length) * 10) / 10;
}
