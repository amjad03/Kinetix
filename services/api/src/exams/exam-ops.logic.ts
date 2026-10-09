// Pure rules for bulk normalisation of marks and for result classes (distinction, first class …).

export type NormaliseMethod = 'scale' | 'add' | 'target_mean';

export interface MarkRow {
  studentId: string;
  /** The mark in force: the moderated mark when there is one, otherwise the awarded mark. */
  marks: number;
}

export interface Change extends MarkRow {
  after: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Re-computes a whole assessment's marks: multiply by a factor, add a flat amount, or shift so the class
 * average becomes the target. Marks stay between 0 and the maximum; only marks that change are returned.
 */
export function normalise(method: NormaliseMethod, value: number, max: number, rows: MarkRow[]): Change[] {
  if (rows.length === 0) return [];
  const clamp = (n: number) => Math.min(max, Math.max(0, r2(n)));
  const shift = method === 'target_mean' ? value - rows.reduce((a, r) => a + r.marks, 0) / rows.length : 0;
  return rows
    .map((r) => ({ ...r, after: clamp(method === 'scale' ? r.marks * value : method === 'add' ? r.marks + value : r.marks + shift) }))
    .filter((c) => c.after !== r2(c.marks));
}

export interface ClassBand {
  name: string;
  minPercent: number;
}

/** The institution starts with the usual four bands; it can change them. */
export const DEFAULT_BANDS: ClassBand[] = [
  { name: 'Distinction', minPercent: 75 },
  { name: 'First class', minPercent: 60 },
  { name: 'Second class', minPercent: 50 },
  { name: 'Pass class', minPercent: 40 },
];

/** The class for an overall percentage: the highest band reached; "Fail" when a subject was failed. */
export function classOf(bands: ClassBand[], percent: number, passedAll: boolean): string {
  if (!passedAll) return 'Fail';
  const hit = [...bands].sort((a, b) => b.minPercent - a.minPercent).find((b) => percent >= b.minPercent);
  return hit?.name ?? 'Pass';
}

/** Subjects at or above the top band's mark: the subject-wise distinctions. */
export function distinctionCount(bands: ClassBand[], percents: number[]): number {
  const top = [...bands].sort((a, b) => b.minPercent - a.minPercent)[0];
  return top ? percents.filter((p) => p >= top.minPercent).length : 0;
}

/** True when two clock ranges ("09:00"-"11:00") on one day overlap. */
export const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) => aStart < bEnd && bStart < aEnd;
