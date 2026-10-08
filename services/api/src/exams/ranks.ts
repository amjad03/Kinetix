/** Rank lists. Ties share a rank and the next rank is skipped (1, 1, 3). Pure functions. */

export function rankDescending<T>(items: T[], score: (t: T) => number): (T & { rank: number })[] {
  const sorted = [...items].sort((a, b) => score(b) - score(a));
  const out: (T & { rank: number })[] = [];
  sorted.forEach((it, i) => {
    const prev = out[i - 1];
    out.push({ ...it, rank: prev && score(sorted[i - 1]) === score(it) ? prev.rank : i + 1 });
  });
  return out;
}

export interface ProgressionRule {
  minCreditsEarned: number | null;
  maxBacklogs: number | null;
}

/** Whether a student may move to the next term, and why not. */
export function progression(s: { creditsEarned: number; backlogs: number }, rule: ProgressionRule): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (rule.minCreditsEarned !== null && s.creditsEarned < rule.minCreditsEarned) reasons.push('credits');
  if (rule.maxBacklogs !== null && s.backlogs > rule.maxBacklogs) reasons.push('backlogs');
  return { eligible: reasons.length === 0, reasons };
}
