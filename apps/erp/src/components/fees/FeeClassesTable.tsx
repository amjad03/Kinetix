'use client';

import ChevronRight from '@mui/icons-material/ChevronRight';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { MiniBar } from '@/components/Bars';
import { LinkButton } from '@/components/LinkButton';
import { DataTable, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { FeeSummary } from '@/lib/types';

type ClassFees = FeeSummary['classes'][number];

const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

/** Fees by class: billed, collected (with a bar), outstanding and overdue, with a link to that class's invoices. */
export function FeeClassesTable({ rows }: { rows: ClassFees[] }) {
  const { t, fmt } = useI18n();
  const columns: Column<ClassFees>[] = [
    { id: 'class', header: t('fees.col.class'), rowHeader: true, sort: (c) => c.className, cell: (c) => <Typography variant="subtitle2">{c.className}</Typography> },
    { id: 'billed', header: t('fees.col.billed'), align: 'right', sort: (c) => c.billedPaise / 100, cell: (c) => fmt.rupees(c.billedPaise) },
    {
      id: 'collected',
      header: t('fees.col.collected'),
      align: 'right',
      sort: (c) => c.collectedPaise / 100,
      cell: (c) => {
        const share = pct(c.collectedPaise, c.billedPaise);
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1.5 }}>
            <Box sx={{ width: 64 }}>
              <MiniBar value={share} color="kx.success" label={t('fees.pctCollected', { p: share.toFixed(0) })} />
            </Box>
            <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', minWidth: 96 }}>
              {fmt.rupees(c.collectedPaise)}
            </Typography>
          </Box>
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
          <Box sx={{ color: 'error.main', whiteSpace: 'nowrap' }}>
            <Box component="span" sx={{ fontWeight: 500 }}>
              {fmt.rupees(c.overduePaise)}
            </Box>
            <Typography component="span" variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
              {t('fees.nInvoices', { n: c.overdue })}
            </Typography>
          </Box>
        ) : (
          <Box component="span" sx={{ color: 'text.secondary' }}>—</Box>
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
