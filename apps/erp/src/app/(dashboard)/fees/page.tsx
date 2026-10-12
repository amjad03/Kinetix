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

import { ArrowRight as ArrowForward, Banknote as PaymentsOutlined, ChevronRight, ReceiptText as ReceiptLongOutlined } from 'lucide-react';
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
            <LinkButton href="/fees/plans" variant="outlined">
              {t('dx.link.fees')}
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
          <div className="hidden md:block">
            <FeeClassesTable rows={s!.classes} />
          </div>
          {/* Phones: one card per class instead of a wide table. */}
          <div className="grid md:hidden gap-3" data-testid="fee-classes-list">
            {s!.classes.map((c) => (
              <div className="border border-border rounded-[12px] p-4" key={c.sectionId}>
                <div className="flex items-baseline justify-between gap-2">
                  <h6 className="text-base leading-6 tracking-[0.1px] font-medium">
                    {c.className}
                  </h6>
                  {c.overdue > 0 && (
                    <p className="text-[13px] leading-[19px] text-red-ink whitespace-nowrap">
                      {t('fees.amountOverdue', { amount: formatRupees(c.overduePaise) })}
                    </p>
                  )}
                </div>
                <p className="text-[13px] leading-[19px] mt-1">
                  {t('fees.amountOutstanding', { amount: formatRupees(c.outstandingPaise) })}
                </p>
                <div className="my-2">
                  <MiniBar value={pct(c.collectedPaise, c.billedPaise)} color="kx.success" label={t('fees.pctCollected', { p: pct(c.collectedPaise, c.billedPaise).toFixed(0) })} />
                </div>
                <p className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                  {t('fees.collectedOf', { collected: formatRupees(c.collectedPaise), billed: formatRupees(c.billedPaise), open: c.open })}
                </p>
                <LinkButton className="mt-2 -ml-2" href={`/fees/invoices?class=${c.sectionId}`} size="small" endIcon={<ChevronRight />}>
                  {t('fees.invoices')}
                </LinkButton>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
