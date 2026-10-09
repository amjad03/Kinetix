import type { SearchHit } from '@/lib/insights';

/** The order of result groups in the search palette. */
export const SEARCH_TYPE_ORDER: SearchHit['type'][] = ['students', 'staff', 'courses', 'topics', 'documents', 'reports', 'events', 'fees', 'messages', 'knowledge'];

/** Results grouped by kind in a fixed order (best match first inside a group); kinds with no result are left out. */
export function groupHits(hits: readonly SearchHit[]): { type: SearchHit['type']; hits: SearchHit[] }[] {
  return SEARCH_TYPE_ORDER.map((type) => ({ type, hits: hits.filter((h) => h.type === type).sort((a, b) => b.score - a.score) })).filter((g) => g.hits.length > 0);
}

/** A question for the search box: it ends with a question mark (or starts with "ask ") and is long enough to mean something. */
export const isQuestion = (term: string): boolean => term.length >= 4 && (/\?$/.test(term) || /^ask\s+/i.test(term));

/** The answer to a plain-words question (GET /v1/search/ask). */
export interface AskAnswer {
  q: string;
  intent?: string;
  interpretation: string;
  columns: string[];
  rows: Record<string, string | number | null>[];
  url: string | null;
  note?: string;
}

/** A result's link, kept to a path on this site (the API gives paths; anything else is dropped). */
export const safeHitUrl = (url: string): string | null => (/^\/(?!\/)/.test(url) ? url : null);
