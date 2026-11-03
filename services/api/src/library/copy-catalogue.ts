import { Injectable, Logger } from '@nestjs/common';
import { marcToBook, parseMarcXml, type MarcBook, type MarcRecord } from './marc.js';

/** The catalogues copy cataloguing searches: SRU servers that return MARCXML (Library of Congress by default). */
export interface SruTarget {
  key: string;
  name: string;
  url: string;
}

const DEFAULT_TARGETS: SruTarget[] = [{ key: 'loc', name: 'Library of Congress', url: 'https://lx2.loc.gov:210/LCDB' }];

/** The SRU CQL query for an ISBN, or a title and author (quotes in the words are dropped). */
export function cqlQuery(q: { isbn?: string; title?: string; author?: string }): string {
  const w = (s: string) => `"${s.replace(/["\\]/g, ' ').trim()}"`;
  if (q.isbn) return `bath.isbn=${q.isbn.replace(/[^0-9Xx]/g, '')}`;
  return [q.title?.trim() && `dc.title=${w(q.title)}`, q.author?.trim() && `dc.creator=${w(q.author)}`].filter(Boolean).join(' and ');
}

/**
 * Copy cataloguing: finds the record of a title in another library's catalogue over SRU (the web form of Z39.50) and
 * returns it as MARC21 with the catalogue fields read out, so the cataloguer imports it instead of keying it in.
 * LIBRARY_SRU_TARGETS ("key|name|url,key|name|url") lists the servers; "off" turns outside searches off.
 */
@Injectable()
export class CopyCatalogue {
  private readonly log = new Logger(CopyCatalogue.name);

  targets(): SruTarget[] {
    const raw = process.env.LIBRARY_SRU_TARGETS ?? '';
    if (raw.toLowerCase() === 'off') return [];
    if (!raw.trim()) return DEFAULT_TARGETS;
    return raw
      .split(',')
      .map((t) => t.split('|').map((x) => x.trim()))
      .filter((t) => t.length === 3 && /^https?:\/\//.test(t[2]))
      .map(([key, name, url]) => ({ key, name, url }));
  }

  /** Up to `max` records for the query from one target. Throws when the server cannot be reached. */
  async search(target: SruTarget, q: { isbn?: string; title?: string; author?: string }, max = 10): Promise<{ book: MarcBook; marc: MarcRecord }[]> {
    const query = cqlQuery(q);
    if (!query) return [];
    const url = `${target.url}?operation=searchRetrieve&version=1.1&recordSchema=marcxml&maximumRecords=${Math.min(25, Math.max(1, max))}&query=${encodeURIComponent(query)}`;
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { accept: 'application/xml, text/xml' } });
    } catch (e) {
      this.log.warn(`SRU search on ${target.key} failed: ${(e as Error).message}`);
      throw new Error('unreachable');
    }
    if (!res.ok) throw new Error('unreachable');
    const xml = await res.text();
    return parseMarcXml(xml.slice(0, 5_000_000))
      .slice(0, max)
      .map((marc) => ({ marc, book: marcToBook(marc) }))
      .filter((r) => r.book.title);
  }
}
