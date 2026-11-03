'use client';

import { CopyCheck } from 'lucide-react';
import { useState } from 'react';
import { useWord } from '@/components/fee-desk/SpecTable';
import { DeskDialog } from '@/components/fee-depth/DeskDialog';
import { Grid, type Col } from '@/components/ops/kit';
import { Button } from '@/components/shadcn/button';
import { StatusPill } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { toneOf } from '@/lib/fee-desk';

export interface FlagRow {
  flag: { id: string; reason: string; amountPaise: number; status: string; resolution: string | null; note: string | null; createdAt: string };
  student: string;
  rollNo: string | null;
  receiptNo: string | null;
  method: string;
  provider: string | null;
}

/**
 * Payments that look like money already received (the same UTR or UPI reference again, the same amount minutes
 * apart, a fee paid twice online). The money is kept; the office settles each one: not a duplicate, keep the extra
 * as the student's advance, or refund it.
 */
export function DuplicateFlags({ rows }: { rows: FlagRow[] }) {
  const { t, fmt } = useI18n();
  const word = useWord();
  const [open, setOpen] = useState<FlagRow | null>(null);
  const cols: Col<FlagRow>[] = [
    { label: t('fd.col.date'), cell: (r) => fmt.date(r.flag.createdAt.slice(0, 10), 'short'), sort: (r) => r.flag.createdAt },
    { label: t('fd.col.student'), cell: (r) => `${r.student}${r.rollNo ? ` · ${r.rollNo}` : ''}`, sort: (r) => r.student },
    { label: t('fd.col.receipt'), cell: (r) => <span className="font-mono text-[13px]">{r.receiptNo ?? '—'}</span> },
    { label: t('fd.col.mode'), cell: (r) => word(r.provider ?? r.method) },
    { label: t('fd.col.reason'), cell: (r) => <StatusPill tone={toneOf(r.flag.reason)}>{word(r.flag.reason)}</StatusPill> },
    { label: t('fd.col.amount'), cell: (r) => fmt.rupees(r.flag.amountPaise), num: true, sort: (r) => r.flag.amountPaise },
    { label: t('fd.col.status'), cell: (r) => <StatusPill tone={toneOf(r.flag.resolution ?? r.flag.status)}>{word(r.flag.resolution ?? r.flag.status)}</StatusPill> },
    {
      label: '',
      cell: (r) =>
        r.flag.status === 'open' ? (
          <Button size="sm" variant="outline" onClick={() => setOpen(r)}>
            {t('ff.dup.settle')}
          </Button>
        ) : null,
    },
  ];
  return (
    <>
      <Grid testId="duplicate-flags" rows={rows} cols={cols} empty={t('ff.dup.empty')} emptyIcon={<CopyCheck />} exportName="duplicate-payments" tint={(r) => r.flag.status === 'open'} />
      {open ? (
        <DeskDialog
          title={t('ff.dup.settleTitle', { receipt: open.receiptNo ?? '' })}
          intro={<p className="m-0 text-sm text-muted-foreground">{t(`ff.dup.why.${open.flag.reason}` as 'ff.dup.why.same_reference', { amount: fmt.rupees(open.flag.amountPaise) })}</p>}
          path={`/v1/fees/flags/${open.flag.id}/resolve`}
          done="ff.dup.settled"
          fields={[
            { name: 'resolution', label: 'ff.dup.resolution', kind: 'select', required: true, options: ['not_duplicate', 'kept_as_advance', 'refunded'].map((v) => ({ value: v, label: word(v) })) },
            { name: 'note', label: 'fd.col.note', kind: 'textarea' },
          ]}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}
