import type { SearchHit } from '@/lib/insights';

/** The order of result groups in the search palette. */
export const SEARCH_TYPE_ORDER: SearchHit['type'][] = ['students', 'staff', 'courses', 'topics', 'documents', 'reports'];

/** Results grouped by kind in a fixed order (best match first inside a group); kinds with no result are left out. */
export function groupHits(hits: readonly SearchHit[]): { type: SearchHit['type']; hits: SearchHit[] }[] {
  return SEARCH_TYPE_ORDER.map((type) => ({ type, hits: hits.filter((h) => h.type === type).sort((a, b) => b.score - a.score) })).filter((g) => g.hits.length > 0);
}

/** A result's link, kept to a path on this site (the API gives paths; anything else is dropped). */
export const safeHitUrl = (url: string): string | null => (/^\/(?!\/)/.test(url) ? url : null);
