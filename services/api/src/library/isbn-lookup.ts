import { Injectable, Logger } from '@nestjs/common';
import { callNumber, type MarcBook } from './marc.js';

/**
 * Looks a book up by ISBN in an open bibliographic catalogue (Open Library, or the service at ISBN_LOOKUP_URL with
 * the same JSON shape). Returns null when the catalogue does not know the ISBN; throws when it cannot be reached.
 * Set ISBN_LOOKUP_URL=off to turn outside lookups off (the catalogue's own copy is still found).
 */
@Injectable()
export class IsbnLookup {
  private readonly log = new Logger(IsbnLookup.name);

  get enabled(): boolean {
    return (process.env.ISBN_LOOKUP_URL ?? '').toLowerCase() !== 'off';
  }

  async lookup(isbn13: string): Promise<MarcBook | null> {
    const base = process.env.ISBN_LOOKUP_URL || 'https://openlibrary.org/api/books';
    const url = `${base}?bibkeys=ISBN:${encodeURIComponent(isbn13)}&format=json&jscmd=data`;
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { accept: 'application/json' } });
    } catch (e) {
      this.log.warn(`ISBN lookup failed: ${(e as Error).message}`);
      throw new Error('unreachable');
    }
    if (!res.ok) throw new Error('unreachable');
    const body = (await res.json()) as Record<string, OpenLibraryBook>;
    const b = body[`ISBN:${isbn13}`];
    if (!b) return null;
    const author = b.authors?.[0]?.name ?? '';
    const ddc = b.classifications?.dewey_decimal_class?.[0] ?? '';
    const year = /(\d{4})/.exec(b.publish_date ?? '')?.[1];
    const subjects = (b.subjects ?? []).map((s) => s.name).filter(Boolean).slice(0, 8);
    return {
      title: [b.title, b.subtitle].filter(Boolean).join(': '),
      author,
      isbn: isbn13,
      publisher: b.publishers?.[0]?.name ?? '',
      edition: '',
      pubYear: year ? Number(year) : null,
      ddc,
      callNo: ddc ? callNumber(ddc, author) : '',
      subject: subjects[0] ?? '',
      keywords: subjects.join(', '),
      pages: b.number_of_pages ?? null,
      language: '',
    };
  }
}

interface OpenLibraryBook {
  title?: string;
  subtitle?: string;
  authors?: { name: string }[];
  publishers?: { name: string }[];
  publish_date?: string;
  number_of_pages?: number;
  subjects?: { name: string }[];
  classifications?: { dewey_decimal_class?: string[] };
}
