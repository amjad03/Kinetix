'use client';

import type { ReactNode } from 'react';
import { DataTable, StatusPill, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { fillHref, toneOf, type ColSpec, type Row } from '@/lib/fee-desk';

/** A status, kind or mode in the reader's language, or as it is when the dictionary has no word for it. */
export function useWord() {
  const { t } = useI18n();
  return (v: unknown) => {
    const key = `fd.st.${String(v)}` as MessageKey;
    const s = t(key);
    return s === key ? String(v ?? '') : s;
  };
}

/** Formats one cell of a spec column. */
export function useCell() {
  const { fmt, t } = useI18n();
  const word = useWord();
  return function formatCell(col: ColSpec, v: unknown): ReactNode {
    if (v === null || v === undefined || v === '') return '—';
    switch (col.kind) {
      case 'money':
        return fmt.rupees(Number(v));
      case 'date':
        return fmt.date(String(v).slice(0, 10), 'short');
      case 'datetime':
        return fmt.dateTime(String(v));
      case 'number':
        return Number(v).toLocaleString('en-IN');
      case 'bool':
        return v ? t('fd.yes') : t('fd.no');
      case 'status':
        return <StatusPill tone={toneOf(String(v))}>{word(v)}</StatusPill>;
      default:
        return String(v);
    }
  };
}

/** A DataTable built from column specs; rows open `href` (e.g. /accounts/invoices/{id}) when given. */
export function SpecTable({ columns, rows, label, href, exportName, toolbar, empty }: { columns: ColSpec[]; rows: Row[]; label: string; href?: string; exportName?: string; toolbar?: ReactNode; empty?: string }) {
  const { t } = useI18n();
  const cell = useCell();
  const word = useWord();
  const cols: Column<Row>[] = columns.map((c, i) => ({
    id: c.key,
    header: t(c.label as MessageKey),
    cell: (r) => cell(c, r[c.key]),
    sort: (r) => (c.kind === 'money' || c.kind === 'number' ? Number(r[c.key] ?? 0) : String(r[c.key] ?? '')),
    csv: (r) => (c.kind === 'money' ? Number(r[c.key] ?? 0) / 100 : c.kind === 'status' ? word(r[c.key]) : String(r[c.key] ?? '')),
    align: c.kind === 'money' || c.kind === 'number' ? 'right' : 'left',
    hideBelow: c.hideBelow,
    rowHeader: i === 0,
  }));
  return <DataTable columns={cols} rows={rows} rowId={(r) => r.id} label={label} exportName={exportName} toolbar={toolbar} empty={empty} rowHref={href ? (r) => fillHref(href, r) : undefined} />;
}
