/** Pure rules for on-screen evaluation: anonymous numbers, round-robin allocation, second valuation and final marks. */
import { randomInt } from 'node:crypto';

/** A random 7-digit dummy number that is not already used on the paper. */
export function newDummyNo(taken: Set<string>): string {
  for (let i = 0; i < 1000; i++) {
    const n = String(randomInt(1_000_000, 10_000_000));
    if (!taken.has(n)) return n;
  }
  throw new RangeError('Could not generate a free dummy number');
}

export interface Examiner {
  id: string;
  /** Scripts already held on this paper (all rounds). */
  load: number;
}

/**
 * Round-robin allocation. `scripts` carry the examiners who must not get them (for example the
 * first examiner for a second valuation). Each examiner takes at most `cap` scripts on the paper.
 * Returns script id to examiner id, or throws when the cap leaves scripts without an examiner.
 */
export function allocateRoundRobin(scripts: { id: string; exclude: string[] }[], examiners: Examiner[], cap: number): Map<string, string> {
  const load = new Map(examiners.map((e) => [e.id, e.load]));
  const order = examiners.map((e) => e.id);
  const out = new Map<string, string>();
  let cursor = 0;
  for (const s of scripts) {
    let picked: string | null = null;
    for (let i = 0; i < order.length; i++) {
      const id = order[(cursor + i) % order.length];
      if ((load.get(id) ?? 0) < cap && !s.exclude.includes(id)) {
        picked = id;
        cursor = (cursor + i + 1) % order.length;
        break;
      }
    }
    if (!picked) throw new RangeError('The examiners do not have enough capacity for every script');
    load.set(picked, (load.get(picked) ?? 0) + 1);
    out.set(s.id, picked);
  }
  return out;
}

/** The scripts picked for second valuation: `share` percent of them, spread evenly in dummy-number order. */
export function pickSecondValuation(scripts: { id: string; dummyNo: string }[], sharePercent: number): string[] {
  if (sharePercent <= 0 || scripts.length === 0) return [];
  const sorted = [...scripts].sort((a, b) => a.dummyNo.localeCompare(b.dummyNo));
  const want = Math.min(sorted.length, Math.ceil((sorted.length * sharePercent) / 100));
  const picked: string[] = [];
  for (let i = 0; i < want; i++) picked.push(sorted[Math.floor((i * sorted.length) / want)].id);
  return picked;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** True when two valuations differ by more than the threshold (marks). */
export const differsBeyond = (first: number, second: number, threshold: number) => Math.abs(first - second) > threshold;

/**
 * Final marks of a script: the third valuation (moderation) wins when there is one; with two
 * valuations within the threshold it is their average; with one valuation it is that.
 * Returns null while a required valuation is missing.
 */
export function finalMarks(v: { first: number | null; second: number | null; third: number | null; secondRequired: boolean; thirdRequired: boolean }): number | null {
  if (v.first === null) return null;
  if (v.thirdRequired) return v.third === null ? null : r2(v.third);
  if (v.secondRequired) return v.second === null ? null : r2((v.first + v.second) / 2);
  return r2(v.first);
}

export type AnnotationKind = 'tick' | 'cross' | 'comment' | 'highlight';
export interface AnnotationInput {
  kind: AnnotationKind;
  x: number;
  y: number;
  w?: number;
  h?: number;
  text?: string;
}

/**
 * Checks an annotation's geometry. Coordinates are fractions of the page (0 to 1) so they hold at any zoom.
 * Returns the problem in plain words, or null when the annotation is fine.
 */
export function annotationProblem(a: AnnotationInput): string | null {
  const inside = (n: number) => Number.isFinite(n) && n >= 0 && n <= 1;
  if (!inside(a.x) || !inside(a.y)) return 'Place the mark inside the page';
  if (a.kind === 'highlight') {
    const w = a.w ?? 0;
    const h = a.h ?? 0;
    if (!(w > 0) || !(h > 0)) return 'A highlight needs a width and a height';
    if (a.x + w > 1.0001 || a.y + h > 1.0001) return 'The highlight runs off the page';
  }
  if (a.kind === 'comment' && !(a.text ?? '').trim()) return 'Write the comment';
  return null;
}
