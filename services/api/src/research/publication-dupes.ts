import { sql } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { titleKey } from './research-pass.rules.js';

export interface DuplicateHit {
  id: string;
  title: string;
  year: number;
  reason: 'doi' | 'title';
}

/**
 * A publication already on record that this one would duplicate: the same DOI, or the same title once case, spacing and
 * punctuation are set aside, in the same year or one year apart (online first, in print the next year); two papers
 * with different DOIs are never duplicates. Co-authors of
 * several institutions or departments recording one paper find the first record and are credited there.
 */
export async function duplicateOf(tx: Tx, p: { doi?: string | null; title: string; year: number; exceptId?: string }): Promise<DuplicateHit | null> {
  const except = p.exceptId ? sql`and id <> ${p.exceptId}` : sql``;
  if (p.doi) {
    const [d] = (await tx.execute(sql`select id, title, year from publications where lower(doi) = ${p.doi.toLowerCase()} ${except} limit 1`)).rows as { id: string; title: string; year: number }[];
    if (d) return { ...d, reason: 'doi' };
  }
  const key = titleKey(p.title);
  if (key.length < 8) return null;
  const [t] = (await tx.execute(sql`select id, title, year from publications where regexp_replace(lower(title), '[^a-z0-9]+', '', 'g') = ${key} and abs(year - ${p.year}) <= 1 ${p.doi ? sql`and doi is null` : sql``} ${except} order by year limit 1`)).rows as { id: string; title: string; year: number }[];
  return t ? { ...t, reason: 'title' } : null;
}
