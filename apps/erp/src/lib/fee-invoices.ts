import { api } from '@/lib/api';
import type { FeeInvoice } from '@/lib/types';

/** One page of `GET /v1/fees/invoices` (keyset paging: oldest due first, then roll number). */
export interface InvoicePage<T = FeeInvoice> {
  rows: T[];
  nextCursor: string | null;
}

export type InvoiceQuery = { sectionId?: string; studentId?: string; status?: 'due' | 'paid' | 'cancelled'; dueBefore?: string; cursor?: string; limit?: number };

export function invoicesPath(q: InvoiceQuery): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `/v1/fees/invoices?${s}` : '/v1/fees/invoices';
}

export const invoicePage = <T = FeeInvoice>(q: InvoiceQuery) => api<InvoicePage<T>>(invoicesPath(q));

/**
 * Walks the pages up to [max] rows, for views that summarise a bounded list (follow-ups, a class roster). Lists people
 * page through use [invoicePage] with the cursor instead.
 */
export async function invoicesUpTo<T = FeeInvoice>(q: Omit<InvoiceQuery, 'cursor' | 'limit'>, max = 1000, get: (path: string) => Promise<InvoicePage<T>> = (path) => api<InvoicePage<T>>(path)): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined;
  do {
    const page = await get(invoicesPath({ ...q, cursor, limit: Math.min(500, max - out.length) }));
    out.push(...page.rows);
    cursor = page.nextCursor ?? undefined;
  } while (cursor && out.length < max);
  return out;
}
