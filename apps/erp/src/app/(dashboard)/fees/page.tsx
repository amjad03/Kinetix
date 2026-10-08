import ArrowForward from '@mui/icons-material/ArrowForward';
import ChevronRight from '@mui/icons-material/ChevronRight';
import PaymentsOutlined from '@mui/icons-material/PaymentsOutlined';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';
import { MiniBar } from '@/components/Bars';
import { FeeClassesTable } from '@/components/fees/FeeClassesTable';
import { IssueFeeButton } from '@/components/fees/IssueFeeDialog';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader, SectionTitle } from '@/components/PageHeader';
import { StatGrid, StatTile } from '@/components/StatTile';
import { EmptyState, ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { feeClasses } from '@/lib/fees';
import { formatRupees } from '@/lib/money';
import { schoolToday } from '@/lib/school';
import { getI18n } from '@/i18n/server';
import type { FeeSummary } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.fees') };
}

const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

export default async function FeesPage() {
  await requireSection('fees');
  const [summary, classes] = await Promise.all([load(() => api<FeeSummary>('/v1/fees/summary')), load(feeClasses)]);
  const today = schoolToday();
  const s = summary.data;
  const { t, fmt } = await getI18n();
  /** The exact amount, when the tile shows it shortened (₹9.26 L). */
  const exact = (paise: number) => (fmt.rupeesShort(paise) === formatRupees(paise) ? '' : ` · ${formatRupees(paise)}`);

  return (
    <>
      <PageHeader
        title={t('nav.fees')}
        subtitle={t('fees.subtitle')}
        actions={
          <>
            <LinkButton href="/fees/invoices" variant="outlined" startIcon={<ReceiptLongOutlined />}>
              {t('fees.invoices')}
            </LinkButton>
            <LinkButton href="/fees/bank-transfers" variant="outlined">
              {t('pd.link.transfers')}
            </LinkButton>
            <LinkButton href="/fees/sponsors" variant="outlined">
              {t('pd.link.sponsors')}
            </LinkButton>
            <IssueFeeButton classes={classes.data ?? []} today={today} />
          </>
        }
      />
      {summary.error !== undefined ? (
        <ErrorState message={summary.error} />
      ) : s!.classes.length === 0 ? (
        <EmptyState icon={<PaymentsOutlined />} title={t('fees.none')} testId="no-fees">
          {t('fees.noneBody')}
        </EmptyState>
      ) : (
        <>
          <StatGrid min={200}>
            <StatTile label={t('fees.billed')} value={fmt.rupeesShort(s!.billedPaise)} caption={formatRupees(s!.billedPaise)} testId="fee-billed" />
            <StatTile
              label={t('fees.collected')}
              value={fmt.rupeesShort(s!.collectedPaise)}
              caption={`${t('fees.collectedCaption', { p: pct(s!.collectedPaise, s!.billedPaise).toFixed(1) })}${exact(s!.collectedPaise)}`}
              bar={<MiniBar value={pct(s!.collectedPaise, s!.billedPaise)} color="kx.success" label={t('fees.collectedBar')} />}
              testId="fee-collected"
            />
            <StatTile
              label={t('fees.outstanding')}
              value={fmt.rupeesShort(s!.outstandingPaise)}
              caption={`${t('fees.openInvoices', { n: s!.openInvoices })}${exact(s!.outstandingPaise)}`}
              testId="fee-outstanding"
            />
            <StatTile
              label={t('fees.overdue')}
              value={fmt.rupeesShort(s!.overduePaise)}
              tone={s!.overduePaise > 0 ? 'warning' : 'default'}
              caption={s!.overdueInvoices > 0 ? `${t('fees.overdueCaption', { n: s!.overdueInvoices })}${exact(s!.overduePaise)}` : t('fees.nothingOverdue')}
              testId="fee-overdue"
            />
          </StatGrid>

          <SectionTitle
            action={
              <LinkButton href="/fees/invoices" endIcon={<ArrowForward />} size="small">
                {t('fees.allInvoices')}
              </LinkButton>
            }
          >
            {t('fees.byClass')}
          </SectionTitle>
          <Box sx={{ display: { xs: 'none', md: 'block' } }}>
            <FeeClassesTable rows={s!.classes} />
          </Box>
          {/* Phones: one card per class instead of a wide table. */}
          <Box sx={{ display: { xs: 'grid', md: 'none' }, gap: 1.5 }} data-testid="fee-classes-list">
            {s!.classes.map((c) => (
              <Box key={c.sectionId} sx={{ border: 1, borderColor: 'm3.outlineVariant', borderRadius: '12px', p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>
                    {c.className}
                  </Typography>
                  {c.overdue > 0 && (
                    <Typography variant="body2" sx={{ color: 'error.main', whiteSpace: 'nowrap' }}>
                      {t('fees.amountOverdue', { amount: formatRupees(c.overduePaise) })}
                    </Typography>
                  )}
                </Box>
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  {t('fees.amountOutstanding', { amount: formatRupees(c.outstandingPaise) })}
                </Typography>
                <Box sx={{ my: 1 }}>
                  <MiniBar value={pct(c.collectedPaise, c.billedPaise)} color="kx.success" label={t('fees.pctCollected', { p: pct(c.collectedPaise, c.billedPaise).toFixed(0) })} />
                </Box>
                <Typography variant="caption" color="text.secondary" component="p">
                  {t('fees.collectedOf', { collected: formatRupees(c.collectedPaise), billed: formatRupees(c.billedPaise), open: c.open })}
                </Typography>
                <LinkButton href={`/fees/invoices?class=${c.sectionId}`} size="small" endIcon={<ChevronRight />} sx={{ mt: 1, ml: -1 }}>
                  {t('fees.invoices')}
                </LinkButton>
              </Box>
            ))}
          </Box>
        </>
      )}
    </>
  );
}
