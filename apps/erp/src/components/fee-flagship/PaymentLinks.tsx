'use client';

import { Link2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import type { FieldSpec } from '@/components/fee-desk/DeskAction';
import { useWord } from '@/components/fee-desk/SpecTable';
import { DeskDialog } from '@/components/fee-depth/DeskDialog';
import { Grid, type Col } from '@/components/ops/kit';
import { Button } from '@/components/shadcn/button';
import { StatusPill } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { toneOf } from '@/lib/fee-desk';

export interface LinkRow {
  id: string;
  number: string;
  student: string;
  rollNo: string | null;
  title: string;
  invoiceNo: string | null;
  amountPaise: number;
  status: string;
  expiresAt: string;
  channels: string[];
  sent: { channel: string; ok: boolean; error?: string; at: string }[];
  openedAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

/** The channels a link is sent on, as ticks in the dialog. */
export const CHANNEL_FIELDS: FieldSpec[] = [
  { name: 'sms', label: 'ff.ch.sms', kind: 'bool' },
  { name: 'whatsapp', label: 'ff.ch.whatsapp', kind: 'bool' },
  { name: 'email', label: 'ff.ch.email', kind: 'bool' },
];

/** Payment links sent to families: who, how much, how it was sent, whether it was opened and paid; resend or cancel. */
export function PaymentLinks({ rows, total, page }: { rows: LinkRow[]; total: number; page: number }) {
  const { t, fmt } = useI18n();
  const word = useWord();
  const [dialog, setDialog] = useState<{ title: string; path: string; fields: FieldSpec[]; done: string } | null>(null);
  const cols: Col<LinkRow>[] = [
    { label: t('fd.col.number'), cell: (r) => <span className="font-mono text-[13px]">{r.number}</span>, sort: (r) => r.number },
    { label: t('fd.col.student'), cell: (r) => `${r.student}${r.rollNo ? ` · ${r.rollNo}` : ''}`, sort: (r) => r.student },
    { label: t('fd.col.title'), cell: (r) => r.title, sort: (r) => r.title },
    { label: t('fd.col.amount'), cell: (r) => fmt.rupees(r.amountPaise), num: true, sort: (r) => r.amountPaise },
    {
      label: t('fd.col.channels'),
      cell: (r) =>
        r.sent.length ? (
          <span className="flex flex-wrap gap-1">
            {r.sent.map((x, i) => (
              <StatusPill key={i} tone={x.ok ? 'success' : 'danger'} title={x.error}>
                {t(`ff.ch.${x.channel}` as 'ff.ch.sms')}
              </StatusPill>
            ))}
          </span>
        ) : (
          t('ff.link.appOnly')
        ),
    },
    { label: t('fd.col.expiresOn'), cell: (r) => fmt.date(r.expiresAt.slice(0, 10), 'short'), sort: (r) => r.expiresAt },
    { label: t('ff.link.opened'), cell: (r) => (r.openedAt ? fmt.date(r.openedAt.slice(0, 10), 'short') : '—') },
    { label: t('fd.col.status'), cell: (r) => <StatusPill tone={toneOf(r.status)}>{word(r.status)}</StatusPill>, sort: (r) => r.status },
    {
      label: '',
      cell: (r) =>
        r.status === 'active' ? (
          <span className="flex gap-1">
            <Button size="sm" variant="outline" onClick={() => setDialog({ title: t('ff.link.resendTitle', { no: r.number }), path: `/v1/fees/payment-links/${r.id}/resend`, fields: CHANNEL_FIELDS, done: 'ff.link.resent' })}>
              {t('ff.link.resend')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDialog({ title: t('ff.link.cancelTitle', { no: r.number }), path: `/v1/fees/payment-links/${r.id}/cancel`, fields: [], done: 'ff.link.cancelled' })}>
              {t('ff.link.cancel')}
            </Button>
          </span>
        ) : null,
    },
  ];
  return (
    <>
      <p className="m-0 mb-3 text-sm text-muted-foreground">
        {t('ff.link.how')}{' '}
        <Link className="underline underline-offset-2" href="/fees/invoices">
          {t('fo.tab.invoices')}
        </Link>
      </p>
      <Grid testId="payment-links" rows={rows} cols={cols} empty={t('ff.link.empty')} emptyIcon={<Link2 />} exportName="payment-links" />
      {total > rows.length ? (
        <div className="mt-3 flex gap-2">
          {page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/fees/payment-links?page=${page - 1}`}>{t('ff.prev')}</Link>
            </Button>
          ) : null}
          {page * 50 < total ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/fees/payment-links?page=${page + 1}`}>{t('ff.next')}</Link>
            </Button>
          ) : null}
        </div>
      ) : null}
      {dialog ? <DeskDialog title={dialog.title} path={dialog.path} fields={dialog.fields} done={dialog.done} onClose={() => setDialog(null)} /> : null}
    </>
  );
}
