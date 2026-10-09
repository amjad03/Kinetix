'use server';

import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import { readScan } from '@/lib/scan';
import type { ActionResult } from '@/lib/types';

export interface ScanResult {
  kind: 'asset' | 'book';
  title: string;
  lines: { label: string; value: string }[];
}

interface BookScan { book: { title: string; author?: string; barcode?: string; callNo?: string }; available: number; held: number; loans: { student: string; rollNo: string; dueOn: string }[] }
interface AssetScan { asset?: { tag: string; name: string; location?: string; status?: string }; tag?: string; name?: string; location?: string; status?: string }

/** Looks up a scanned or typed code with the existing library scan and asset-by-tag routes. */
export async function lookupCode(raw: string): Promise<ActionResult<ScanResult>> {
  const target = readScan(raw);
  const { t } = await getI18n();
  if (target.kind === 'none') return { ok: false, error: t('scan.err.empty') };
  return act(async () => {
    if (target.kind === 'asset') {
      const r = await api<AssetScan>(`/v1/assets/by-tag/${encodeURIComponent(target.code)}`);
      const a = r.asset ?? r;
      return { kind: 'asset' as const, title: a.name ?? target.code, lines: [{ label: t('scan.tag'), value: a.tag ?? target.code }, { label: t('scan.location'), value: a.location ?? '-' }, { label: t('scan.status'), value: a.status ?? '-' }] };
    }
    const r = await api<BookScan>(`/v1/library/scan/${encodeURIComponent(target.code)}`);
    return {
      kind: 'book' as const,
      title: r.book.title,
      lines: [
        { label: t('scan.author'), value: r.book.author || '-' },
        { label: t('scan.callNo'), value: r.book.callNo || '-' },
        { label: t('scan.available'), value: String(r.available) },
        ...r.loans.map((l) => ({ label: t('scan.outWith'), value: `${l.student} (${l.rollNo}), ${t('scan.due')} ${l.dueOn}` })),
      ],
    };
  });
}
