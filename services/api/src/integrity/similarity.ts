/** Text similarity for academic integrity checks. Pure functions: words, shingles, containment, shared phrase. */

const WORD = /[\p{L}\p{N}]+/gu;

/** Lower-cased words (letters and digits in any script). */
export const words = (text: string): string[] => (text.toLowerCase().match(WORD) ?? []);

/** The set of overlapping runs of `n` words. */
export function shingles(ws: string[], n = 4): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + n <= ws.length; i++) out.add(ws.slice(i, i + n).join(' '));
  return out;
}

/**
 * How much of the shorter text appears in the other: shared shingles over the shingles of the shorter one.
 * 1 means the shorter answer is entirely contained in the longer; 0 means no four-word run is shared.
 */
export function containment(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let shared = 0;
  for (const s of small) if (large.has(s)) shared++;
  return shared / small.size;
}

/** The longest run of words the two texts have in common (at most `max` words), as the reviewer's evidence. */
export function sharedPhrase(a: string[], b: string[], max = 18): string {
  let best: [number, number] = [0, 0];
  const index = new Map<string, number[]>();
  for (let j = 0; j + 4 <= b.length; j++) {
    const k = b.slice(j, j + 4).join(' ');
    (index.get(k) ?? index.set(k, []).get(k)!).push(j);
  }
  for (let i = 0; i + 4 <= a.length; i++) {
    for (const j of index.get(a.slice(i, i + 4).join(' ')) ?? []) {
      let len = 4;
      while (i + len < a.length && j + len < b.length && a[i + len] === b[j + len]) len++;
      if (len > best[1]) best = [i, len];
    }
  }
  return a.slice(best[0], best[0] + Math.min(best[1], max)).join(' ');
}

/** Answers shorter than this many words are not compared: short answers match by chance. */
export const MIN_WORDS = 20;
