// Pure rules for rubrics, reattempts and academic-integrity checks.

export interface RubricLevelLike {
  label: string;
  points: number;
}
export interface RubricCriterionLike {
  name: string;
  levels: RubricLevelLike[];
}

/** The most a rubric can award: the best level of each criterion. */
export const rubricMax = (criteria: RubricCriterionLike[]) => criteria.reduce((n, c) => n + Math.max(0, ...c.levels.map((l) => l.points)), 0);

/** Totals one marking: `selections[i]` is the level index chosen for criterion i. */
export function scoreRubric(criteria: RubricCriterionLike[], selections: number[]): { total: number; max: number } {
  if (selections.length !== criteria.length) throw new RangeError(`Choose a level for each of the ${criteria.length} criteria`);
  let total = 0;
  criteria.forEach((c, i) => {
    const level = c.levels[selections[i]];
    if (!level) throw new RangeError(`"${c.name}" has no level ${selections[i] + 1}`);
    total += level.points;
  });
  return { total, max: rubricMax(criteria) };
}

/** Problems with a rubric on its own; empty when sound. */
export function rubricProblems(criteria: RubricCriterionLike[]): string[] {
  const out: string[] = [];
  if (criteria.length === 0) out.push('Add at least one criterion');
  const names = new Set<string>();
  for (const c of criteria) {
    if (names.has(c.name.toLowerCase())) out.push(`"${c.name}" appears twice`);
    names.add(c.name.toLowerCase());
    if (c.levels.length < 2) out.push(`"${c.name}" needs at least two levels`);
    const pts = c.levels.map((l) => l.points);
    if (new Set(pts).size !== pts.length) out.push(`"${c.name}" has two levels worth the same points`);
  }
  return out;
}

/** Whether another attempt may be asked for: attempts so far (the first sitting counts) against the allowed number. */
export function nextAttempt(attemptsUsed: number, maxAttempts: number): { ok: true; attemptNo: number } | { ok: false; reason: string } {
  if (attemptsUsed >= maxAttempts) return { ok: false, reason: `All ${maxAttempts} attempt${maxAttempts === 1 ? '' : 's'} allowed for this assessment are used` };
  return { ok: true, attemptNo: attemptsUsed + 1 };
}

/** Severity of a client-reported event; repeated events in one sitting count for more. */
export function integritySeverity(kind: string, repeats: number): 'low' | 'medium' | 'high' {
  const base: Record<string, number> = { tab_switch: 1, fullscreen_exit: 1, copy_paste: 2, network_loss: 0, plagiarism_match: 3, manual: 2 };
  const score = (base[kind] ?? 1) + Math.min(3, Math.floor(repeats / 3));
  return score >= 4 ? 'high' : score >= 2 ? 'medium' : 'low';
}

const words = (s: string) => s.toLowerCase().normalize('NFKC').split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** Overlap of two texts as the share of their three-word phrases they have in common (0 to 1). */
export function similarity(a: string, b: string): number {
  const grams = (t: string) => {
    const w = words(t);
    const out = new Set<string>();
    for (let i = 0; i + 2 < w.length; i++) out.add(`${w[i]} ${w[i + 1]} ${w[i + 2]}`);
    return out;
  };
  const x = grams(a);
  const y = grams(b);
  if (x.size === 0 || y.size === 0) return 0;
  let both = 0;
  for (const g of x) if (y.has(g)) both++;
  return both / (x.size + y.size - both);
}

/** Every pair of submissions that overlap at least `threshold`. */
export function similarPairs(items: { studentId: string; text: string }[], threshold: number): { a: string; b: string; score: number }[] {
  const out: { a: string; b: string; score: number }[] = [];
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) {
      if (items[i].studentId === items[j].studentId) continue;
      const score = similarity(items[i].text, items[j].text);
      if (score >= threshold) out.push({ a: items[i].studentId, b: items[j].studentId, score: Math.round(score * 100) / 100 });
    }
  return out.sort((p, q) => q.score - p.score);
}
