import { Injectable } from '@nestjs/common';

export interface OrcidWork {
  title: string;
  year: number | null;
  doi: string | null;
  /** journal-article, book, book-chapter, conference-paper ... */
  type: string;
  venue: string | null;
}

/** Reads a researcher's works from ORCID. Replaceable, so tests need no network. */
export abstract class OrcidResolver {
  abstract works(orcid: string): Promise<OrcidWork[] | null>;
}

/** An ORCID iD: four groups of four characters, the last a mod 11-2 check digit (0-9 or X). */
export function validOrcid(id: string): boolean {
  const m = /^(\d{4})-(\d{4})-(\d{4})-(\d{3}[\dX])$/.exec(id.trim().toUpperCase().replace(/^HTTPS?:\/\/ORCID\.ORG\//, ''));
  if (!m) return false;
  const digits = m.slice(1).join('');
  let total = 0;
  for (const ch of digits.slice(0, 15)) total = (total + Number(ch)) * 2;
  const r = (12 - (total % 11)) % 11;
  return digits[15] === (r === 10 ? 'X' : String(r));
}

export const normalizeOrcid = (id: string) => id.trim().toUpperCase().replace(/^HTTPS?:\/\/ORCID\.ORG\//, '');

interface OrcidSummary {
  title?: { title?: { value?: string } };
  'publication-date'?: { year?: { value?: string } } | null;
  'external-ids'?: { 'external-id'?: { 'external-id-type'?: string; 'external-id-value'?: string }[] };
  type?: string;
  'journal-title'?: { value?: string } | null;
}

/** Maps ORCID's works response (v3.0) to works, one per group (ORCID groups duplicates of the same work). */
export function fromOrcid(body: { group?: { 'work-summary'?: OrcidSummary[] }[] }): OrcidWork[] {
  return (body.group ?? [])
    .map((g) => g['work-summary']?.[0])
    .filter((w): w is OrcidSummary => !!w?.title?.title?.value)
    .map((w) => ({
      title: w.title!.title!.value!.trim().slice(0, 300),
      year: Number(w['publication-date']?.year?.value) || null,
      doi: w['external-ids']?.['external-id']?.find((x) => x['external-id-type'] === 'doi')?.['external-id-value']?.trim() ?? null,
      type: w.type ?? 'journal-article',
      venue: w['journal-title']?.value?.slice(0, 200) ?? null,
    }));
}

/** ORCID's public API: no account is needed for public works. */
@Injectable()
export class PublicOrcidResolver extends OrcidResolver {
  async works(orcid: string): Promise<OrcidWork[] | null> {
    const res = await fetch(`https://pub.orcid.org/v3.0/${encodeURIComponent(orcid)}/works`, { headers: { Accept: 'application/json', 'User-Agent': 'ZYNETIX/1.0 (research office)' }, signal: AbortSignal.timeout(10000) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`ORCID answered ${res.status}`);
    return fromOrcid((await res.json()) as Parameters<typeof fromOrcid>[0]);
  }
}
