'use client';

import Link from 'next/link';
import { Grid } from '@/components/ops/kit';
import { StatusPill } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { statusTone } from '@/lib/procurement';
import { statusLabel } from '@/lib/procurement-labels';

export interface DebitRow {
  id: string;
  number: string;
  poId: string;
  po: string;
  vendor: string;
  amountPaise: number;
  reason: string;
  status: string;
  createdAt: string;
}

/** Debit notes raised for rejected goods; an open note is set off against the vendor's next payment on that order. */
export function DebitNotes({ rows }: { rows: DebitRow[] }) {
  const { t, fmt } = useI18n();
  return (
    <Grid
      testId="debit-notes"
      empty={t('ivd.empty.debit')}
      rows={rows}
      exportName="debit-notes"
      filters={[{ id: 'status', label: t('ops.f.status'), options: ['open', 'adjusted'].map((s) => ({ value: s, label: statusLabel(t, s) })), match: (r, v) => r.status === v }]}
      cols={[
        { label: t('inv.number'), cell: (r) => r.number },
        { label: t('ivd.date'), cell: (r) => fmt.date(r.createdAt.slice(0, 10), 'short') },
        { label: t('inv.po'), cell: (r) => <Link className="font-medium text-primary hover:underline" href={`/procurement/orders/${r.poId}`}>{r.po}</Link> },
        { label: t('inv.vendor'), cell: (r) => r.vendor },
        { label: t('ho.reason'), cell: (r) => r.reason },
        { label: t('ops.f.amount'), cell: (r) => fmt.rupees(r.amountPaise), num: true },
        { label: t('ops.f.status'), cell: (r) => <StatusPill tone={statusTone(r.status)}>{statusLabel(t, r.status)}</StatusPill> },
      ]}
    />
  );
}
