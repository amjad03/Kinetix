import { Injectable } from '@nestjs/common';

export interface DoiRecord {
  title: string;
  venue: string;
  year: number;
  kind: 'journal' | 'conference' | 'book' | 'book_chapter';
  issn: string | null;
  authors: { name: string }[];
}

/** Looks a DOI up at a registry. Replaceable, so tests need no network. */
export abstract class DoiResolver {
  abstract resolve(doi: string): Promise<DoiRecord | null>;
}

interface CrossrefWork {
  title?: string[];
  'container-title'?: string[];
  type?: string;
  ISSN?: string[];
  author?: { given?: string; family?: string; name?: string }[];
  issued?: { 'date-parts'?: number[][] };
  published?: { 'date-parts'?: number[][] };
}

const KINDS: Record<string, DoiRecord['kind']> = { 'journal-article': 'journal', 'proceedings-article': 'conference', book: 'book', 'book-chapter': 'book_chapter' };

/** Maps a Crossref work to a publication record. */
export function fromCrossref(w: CrossrefWork): DoiRecord | null {
  const title = w.title?.[0]?.trim();
  const year = (w.issued ?? w.published)?.['date-parts']?.[0]?.[0];
  if (!title || !year) return null;
  const issn = w.ISSN?.find((i) => /^\d{4}-\d{3}[\dXx]$/.test(i)) ?? null;
  return {
    title: title.slice(0, 300),
    venue: (w['container-title']?.[0] ?? 'Unknown venue').slice(0, 200),
    year,
    kind: KINDS[w.type ?? ''] ?? 'journal',
    issn,
    authors: (w.author ?? []).map((a) => ({ name: (a.name ?? [a.given, a.family].filter(Boolean).join(' ')).trim().slice(0, 120) })).filter((a) => a.name).slice(0, 50),
  };
}

/** Crossref's public API: no account is needed. A short timeout keeps a slow registry from holding a request. */
@Injectable()
export class CrossrefDoiResolver extends DoiResolver {
  async resolve(doi: string): Promise<DoiRecord | null> {
    const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, { headers: { 'User-Agent': 'KINETIX/1.0 (research office)' }, signal: AbortSignal.timeout(8000) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Crossref answered ${res.status}`);
    const body = (await res.json()) as { message?: CrossrefWork };
    return body.message ? fromCrossref(body.message) : null;
  }
}
