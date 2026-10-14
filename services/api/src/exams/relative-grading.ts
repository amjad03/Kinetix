import type { RelativeCut } from '../db/schema-curriculum.js';

/** One grade of a relative scale: it starts at the class mean plus `minZ` standard deviations. */
export interface RelativeBand {
  grade: string;
  gradePoint: number;
  minZ: number;
}

/** The relative scale used when the institution grades on its own rules (no affiliating profile): UGC CBCS. */
export const DEFAULT_RELATIVE = {
  minClassSize: 30,
  maxShift: 5,
  bands: [
    { grade: 'O', gradePoint: 10, minZ: 1.5 },
    { grade: 'A+', gradePoint: 9, minZ: 1 },
    { grade: 'A', gradePoint: 8, minZ: 0.5 },
    { grade: 'B+', gradePoint: 7, minZ: 0 },
    { grade: 'B', gradePoint: 6, minZ: -0.5 },
    { grade: 'C', gradePoint: 5, minZ: -1 },
    { grade: 'P', gradePoint: 4, minZ: -1.5 },
  ] as RelativeBand[],
};

export interface ClassStats {
  candidates: number;
  mean: number;
  /** Population standard deviation. */
  sd: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The class's mean and standard deviation of the percentages (absentees and the ineligible are left out by the caller). */
export function classStats(percents: number[]): ClassStats {
  const n = percents.length;
  if (!n) return { candidates: 0, mean: 0, sd: 0 };
  const mean = percents.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(percents.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  return { candidates: n, mean: round2(mean), sd: round2(sd) };
}

/**
 * The cut-offs of a relative scale for a class: each grade starts at mean + z × SD + shift (moderation), kept within
 * 0–100 and never below the pass mark, and never above the grade before it. Highest grade first.
 */
export function relativeCuts(stats: ClassStats, bands: RelativeBand[], passPercent: number, shift = 0): RelativeCut[] {
  const ordered = [...bands].sort((a, b) => b.minZ - a.minZ);
  const out: RelativeCut[] = [];
  let ceiling = 100;
  for (const [i, b] of ordered.entries()) {
    const last = i === ordered.length - 1;
    const raw = stats.mean + b.minZ * stats.sd + shift;
    // The lowest pass grade starts at the pass mark itself; no grade starts below it.
    const at = last ? passPercent : Math.max(passPercent, raw);
    const minPercent = round2(Math.min(ceiling, Math.max(0, at)));
    out.push({ grade: b.grade, points: b.gradePoint, minPercent });
    ceiling = minPercent;
  }
  return out;
}

/** The grade a passing candidate gets on the relative scale (the lowest pass grade when below every cut-off). */
export function gradeOnCurve(percent: number, cuts: RelativeCut[]): { grade: string; gradePoint: number } {
  const hit = cuts.find((c) => percent >= c.minPercent) ?? cuts[cuts.length - 1];
  return { grade: hit.grade, gradePoint: hit.points };
}

/** How many candidates get each grade (grades in the given order, plus any others seen). */
export function distribution(grades: string[], order: string[]): { grade: string; count: number }[] {
  const counts = new Map<string, number>(order.map((g) => [g, 0]));
  for (const g of grades) counts.set(g, (counts.get(g) ?? 0) + 1);
  return [...counts].map(([grade, count]) => ({ grade, count }));
}
