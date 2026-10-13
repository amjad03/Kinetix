'use client';

import type { ReactNode } from 'react';
import { StatusPill, type Column } from '@/components/ui';
import type { I18n } from '@/i18n/format';
import { fieldKey, statusKey, statusTone, type CellValue, type FactKind } from '@/lib/quality-hub';

/** One value as it reads on screen: dates and money in the viewer's locale, statuses as pills. */
export function cellNode(i: Pick<I18n, 't' | 'fmt'>, key: string, kind: FactKind, v: CellValue): ReactNode {
  if (v === null || v === '') return <span className="text-muted-foreground">-</span>;
  if (key === 'status') return <StatusPill tone={statusTone(String(v))}>{i.t(statusKey(String(v)))}</StatusPill>;
  return cellText(i, kind, v);
}

export function cellText(i: Pick<I18n, 't' | 'fmt'>, kind: FactKind, v: CellValue): string {
  if (v === null) return '';
  switch (kind) {
    case 'date':
      return i.fmt.date(String(v), 'short');
    case 'datetime':
      return i.fmt.dateTime(String(v));
    case 'paise':
      return i.fmt.rupees(Number(v));
    case 'lpa':
      return i.t('qh.lpa', { n: i.fmt.number(Number(v)) });
    case 'number':
      return i.fmt.number(Number(v));
    case 'bool':
      return v ? i.t('qh.yes') : i.t('qh.no');
    default:
      // Codes such as "staff_conduct" read as words; names and free text are shown as they are.
      return /^[a-z]+(_[a-z]+)*$/.test(String(v)) ? String(v).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : String(v);
  }
}

/** DataTable columns for an API column list ([key, kind]); the first column names the row. */
export function qhColumns<R extends Record<string, CellValue>>(i: Pick<I18n, 't' | 'fmt'>, columns: [string, FactKind][]): Column<R>[] {
  return columns.map(([key, kind], n) => ({
    id: key,
    header: i.t(fieldKey(key)),
    cell: (r) => cellNode(i, key, kind, r[key] ?? null),
    sort: (r) => (typeof r[key] === 'boolean' ? (r[key] ? 1 : 0) : ((r[key] as string | number | null) ?? '')),
    csv: (r) => (key === 'status' && r[key] ? i.t(statusKey(String(r[key]))) : cellText(i, kind, r[key] ?? null)),
    align: kind === 'number' || kind === 'paise' || kind === 'lpa' ? 'right' : 'left',
    rowHeader: n === 0,
    hideBelow: n > 2 ? 'md' : undefined,
  }));
}
