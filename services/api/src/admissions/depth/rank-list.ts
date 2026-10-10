/**
 * Rank lists: one overall list, and one per reservation category, from index marks.
 * Ties are broken by the formula's tie-break marks in order, then by the older date of birth, then by application number.
 */

export interface RankCandidate {
  id: string;
  applicationNo: string;
  indexMark: number;
  /** Normalised category (SC, ST, OBC, EWS ...) or null for general. */
  category: string | null;
  dateOfBirth: string;
  tie: number[];
}

export interface RankedCandidate extends RankCandidate {
  overallRank: number;
  /** Rank within the candidate's own category; null for general candidates. */
  categoryRank: number | null;
}

export function compareCandidates(a: RankCandidate, b: RankCandidate): number {
  if (b.indexMark !== a.indexMark) return b.indexMark - a.indexMark;
  for (let i = 0; i < Math.max(a.tie.length, b.tie.length); i++) {
    const d = (b.tie[i] ?? 0) - (a.tie[i] ?? 0);
    if (d !== 0) return d;
  }
  if (a.dateOfBirth !== b.dateOfBirth) return a.dateOfBirth < b.dateOfBirth ? -1 : 1;
  return a.applicationNo < b.applicationNo ? -1 : a.applicationNo > b.applicationNo ? 1 : 0;
}

/** Overall rank 1..n (no gaps: ties are fully broken) plus the rank inside each category. */
export function buildRankList(cands: RankCandidate[]): RankedCandidate[] {
  const sorted = [...cands].sort(compareCandidates);
  const perCat = new Map<string, number>();
  return sorted.map((c, i) => {
    let categoryRank: number | null = null;
    if (c.category) {
      categoryRank = (perCat.get(c.category) ?? 0) + 1;
      perCat.set(c.category, categoryRank);
    }
    return { ...c, overallRank: i + 1, categoryRank };
  });
}
