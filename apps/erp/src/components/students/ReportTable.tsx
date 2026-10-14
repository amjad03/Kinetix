'use client';

import type { ReactNode } from 'react';
import { DataTable, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';

/** A column of a statement: its key in the API's rows, its header, and how to show the value. */
export interface ReportColumn {
  key: string;
  header: string;
  kind?: 'text' | 'number' | 'date' | 'rupees' | 'percent';
  /** Words for fixed values (a status or category), by value. */
  labels?: Record<string, string>;
  rowHeader?: boolean;
  hideBelow?: 'sm' | 'md' | 'lg';
}

type Row = Record<string, unknown>;

/**
 * A register or statement from the API: sortable, searchable, CSV export with the same columns, and totals for the
 * number columns when `totals` is set (strength and category statements).
 */
export function ReportTable({ rows, columns, label, exportName, totals, empty, testId }: { rows: Row[]; columns: ReportColumn[]; label: string; exportName: string; totals?: boolean; empty?: ReactNode; testId?: string }) {
  const { t, fmt } = useI18n();
  const show = (c: ReportColumn, v: unknown): string => {
    if (v === null || v === undefined || v === '') return '—';
    if (c.labels && typeof v === 'string') return c.labels[v] ?? v;
    switch (c.kind) {
      case 'number':
        return fmt.number(Number(v));
      case 'rupees':
        return fmt.rupees(Number(v));
      case 'percent':
        return `${Number(v)}%`;
      case 'date':
        return fmt.date(String(v).slice(0, 10), 'short');
      default:
        return String(v);
    }
  };
  const numeric = (c: ReportColumn) => c.kind === 'number' || c.kind === 'rupees';
  const list: Row[] = rows.map((r, i) => ({ ...r, __id: String(r.id ?? r.studentId ?? r.applicationId ?? i) }));
  if (totals && rows.length > 1) {
    const sum: Row = { __id: '__total', __total: true };
    for (const c of columns) sum[c.key] = numeric(c) ? rows.reduce((n, r) => n + Number(r[c.key] ?? 0), 0) : c === columns[0] ? t('si.reg.total') : null;
    list.push(sum);
  }
  const cols: Column<Row>[] = columns.map((c) => ({
    id: c.key,
    header: c.header,
    rowHeader: c.rowHeader,
    hideBelow: c.hideBelow,
    align: numeric(c) || c.kind === 'percent' ? 'right' : undefined,
    sort: (r) => (r.__total ? (numeric(c) ? Number.MAX_SAFE_INTEGER : '\uffff') : ((r[c.key] as string | number | null) ?? null)),
    csv: (r) => (c.kind === 'rupees' ? Number(r[c.key] ?? 0) / 100 : c.labels && typeof r[c.key] === 'string' ? (c.labels[r[c.key] as string] ?? (r[c.key] as string)) : ((r[c.key] as string | number | null) ?? '')),
    cell: (r) => <span className={r.__total ? 'font-semibold' : numeric(c) ? 'tabular-nums' : undefined}>{show(c, r[c.key])}</span>,
  }));
  return <DataTable testId={testId} label={label} columns={cols} rows={list} rowId={(r) => String(r.__id)} exportName={exportName} empty={empty} />;
}
