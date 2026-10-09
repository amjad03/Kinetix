/** Pure thesis rules: stage moves, the internal similarity check and supervisor capacity. */

export const THESIS_STAGES = ['synopsis', 'draft', 'submitted', 'examination', 'viva', 'awarded'] as const;
export type ThesisStage = (typeof THESIS_STAGES)[number];

/** A thesis moves one stage forward; an examiner's or viva panel's "revise" sends it back to draft. */
export function canMoveThesis(from: string, to: string): boolean {
  const i = THESIS_STAGES.indexOf(from as ThesisStage);
  const j = THESIS_STAGES.indexOf(to as ThesisStage);
  if (i < 0 || j < 0) return false;
  if (j === i + 1) return true;
  return to === 'draft' && (from === 'examination' || from === 'viva');
}

/** Similarity above this share needs the research office's override before the thesis goes to examiners. */
export const SIMILARITY_LIMIT_PERCENT = 25;
/** At least this many examiners before a thesis can go to examination. */
export const MIN_EXAMINERS = 2;

const words = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, ' ').split(/\s+/).filter(Boolean);

/** The set of every run of `n` consecutive words, joined: the unit the check compares. */
export function shingles(text: string, n = 5): Set<string> {
  const w = words(text);
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i += 1) out.add(w.slice(i, i + n).join(' '));
  return out;
}

export interface SimilarityResult {
  scorePercent: number;
  matches: { thesisId: string; title: string; percent: number }[];
}

/**
 * Share of this thesis's word runs that also appear in other theses of the institution (overall and per thesis).
 * This is an internal-corpus check; it does not see the web or journals.
 */
export function internalSimilarity(text: string, others: { id: string; title: string; text: string }[]): SimilarityResult {
  const mine = shingles(text);
  if (mine.size === 0) return { scorePercent: 0, matches: [] };
  const covered = new Set<string>();
  const matches: SimilarityResult['matches'] = [];
  for (const o of others) {
    const theirs = shingles(o.text);
    let shared = 0;
    for (const s of mine) {
      if (theirs.has(s)) {
        shared += 1;
        covered.add(s);
      }
    }
    const percent = Math.round((shared / mine.size) * 10000) / 100;
    if (percent > 0) matches.push({ thesisId: o.id, title: o.title, percent });
  }
  matches.sort((a, b) => b.percent - a.percent);
  return { scorePercent: Math.round((covered.size / mine.size) * 10000) / 100, matches: matches.slice(0, 10) };
}

/** Whether a supervisor with `load` current scholars can take one more under a `max` cap. */
export const hasCapacity = (load: number, max: number) => load < max;
