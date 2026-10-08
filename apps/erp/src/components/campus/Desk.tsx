'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { isValidElement, useMemo, type ReactNode } from 'react';
import { DataTable, StatusPill, type Column } from '@/components/ui';

/** A row of stat tiles that stacks on a phone. */
export function Tiles({ children }: { children: ReactNode }) {
  return <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>{children}</Box>;
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
    <Box sx={{ mb: 3 }}>
      <Typography variant="h6" component="h2" sx={{ mb: 1.5 }}>
        {title}
      </Typography>
      <DataTable testId={testId} label={title} columns={columns} rows={rows} rowId={(r) => ids.get(r) ?? ''} exportName={exportName ?? testId ?? 'list'} />
    </Box>
  );
}

export function Pill({ label, tone = 'default' }: { label: string; tone?: 'default' | 'warning' | 'error' | 'success' }) {
  return <StatusPill tone={tone === 'default' ? 'neutral' : tone === 'error' ? 'danger' : tone}>{label}</StatusPill>;
}
