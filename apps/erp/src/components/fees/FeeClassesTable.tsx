'use client';
import { MiniBar } from '@/components/Bars';
import { LinkButton } from '@/components/LinkButton';
import { DataTable, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { FeeSummary } from '@/lib/types';

import { ChevronRight } from 'lucide-react';
type ClassFees = FeeSummary['classes'][number];

const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

/** Fees by class: billed, collected (with a bar), outstanding and overdue, with a link to that class's invoices. */
export function FeeClassesTable({ rows }: { rows: ClassFees[] }) {
  const { t, fmt } = useI18n();
  const columns: Column<ClassFees>[] = [
    { id: 'class', header: t('fees.col.class'), rowHeader: true, sort: (c) => c.className, cell: (c) => <h6 className="text-sm leading-5 font-medium tracking-[0.1px]">{c.className}</h6> },
    { id: 'billed', header: t('fees.col.billed'), align: 'right', sort: (c) => c.billedPaise / 100, cell: (c) => fmt.rupees(c.billedPaise) },
    {
      id: 'collected',
      header: t('fees.col.collected'),
      align: 'right',
      sort: (c) => c.collectedPaise / 100,
      cell: (c) => {
        const share = pct(c.collectedPaise, c.billedPaise);
        return (
          <div className="flex items-center justify-end gap-3">
            <div className="w-[64px]">
              <MiniBar value={share} color="kx.success" label={t('fees.pctCollected', { p: share.toFixed(0) })} />
            </div>
            <p className="text-[13px] leading-[19px] tabular-nums min-w-[96px]">
              {fmt.rupees(c.collectedPaise)}
            </p>
          </div>
        );
      },
    },
    { id: 'outstanding', header: t('fees.col.outstanding'), align: 'right', sort: (c) => c.outstandingPaise / 100, cell: (c) => fmt.rupees(c.outstandingPaise) },
    { id: 'open', header: t('fees.col.open'), align: 'right', sort: (c) => c.open, cell: (c) => c.open },
    {
      id: 'overdue',
      header: t('fees.col.overdue'),
      align: 'right',
      sort: (c) => c.overduePaise / 100,
      cell: (c) =>
        c.overdue ? (
          <div className="text-red-ink whitespace-nowrap">
            <span className="font-medium">
              {fmt.rupees(c.overduePaise)}
            </span>
            <span className="text-xs leading-4 tracking-[0.3px] block text-muted-foreground">
              {t('fees.nInvoices', { n: c.overdue })}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: 'invoices',
      header: '',
      csv: false,
      align: 'right',
      cell: (c) => (
        <LinkButton href={`/fees/invoices?class=${c.sectionId}`} size="small" endIcon={<ChevronRight />} aria-label={t('fees.invoicesFor', { name: c.className })}>
          {t('fees.invoices')}
        </LinkButton>
      ),
    },
  ];
  return <DataTable testId="fee-classes" label={t('fees.byClass')} rows={rows} rowId={(c) => c.sectionId} exportName="fees-by-class" rowAttrs={() => ({ 'data-testid': 'fee-class-row' })} columns={columns} />;
}
