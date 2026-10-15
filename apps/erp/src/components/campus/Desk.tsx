'use client';
import { isValidElement, useMemo, type ReactNode } from 'react';
import { DataTable, StatusPill, type Column } from '@/components/ui';
import { StatGrid } from '@/components/ui/StatTile';

/** A row of stat tiles: the shared StatGrid (two on a phone, as many as fit on a desk). */
export function Tiles({ children }: { children: ReactNode }) {
  return <StatGrid>{children}</StatGrid>;
}

/** The words in a ready-made cell (text, numbers and pill labels), for sorting, search and export. */
export function nodeText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).filter(Boolean).join(' ');
  if (isValidElement(node)) {
    const p = node.props as { label?: unknown; children?: ReactNode };
    return typeof p.label === 'string' ? p.label : nodeText(p.children);
  }
  return '';
}

/** A titled list in the shared DataTable: header labels and rows of ready-made cells (sortable, searchable, exportable as CSV). */
export function DeskTable({ title, head, rows, testId, exportName }: { title: string; head: string[]; rows: ReactNode[][]; testId?: string; exportName?: string }) {
  const ids = useMemo(() => new Map(rows.map((r, i) => [r, String(i)])), [rows]);
  const columns: Column<ReactNode[]>[] = head.map((h, j) => ({ id: `c${j}`, header: h, rowHeader: j === 0, sort: (r) => nodeText(r[j]), cell: (r) => r[j] }));
  return (
    <div className="mb-6">
      <h2 className="text-base leading-6 font-medium tracking-[0.1px] mb-3">
        {title}
      </h2>
      <DataTable testId={testId} label={title} columns={columns} rows={rows} rowId={(r) => ids.get(r) ?? ''} exportName={exportName ?? testId ?? 'list'} />
    </div>
  );
}

export function Pill({ label, tone = 'default' }: { label: string; tone?: 'default' | 'warning' | 'error' | 'success' }) {
  return <StatusPill tone={tone === 'default' ? 'neutral' : tone === 'error' ? 'danger' : tone}>{label}</StatusPill>;
}
