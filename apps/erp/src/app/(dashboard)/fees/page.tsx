import type { Metadata } from 'next';
import { MiniBar } from '@/components/Bars';
import { FeesBoard, type SettlementBatchRow } from '@/components/fees/FeesBoard';
import { FeesNav } from '@/components/fees/FeesNav';
import { IssueFeeButton } from '@/components/fees/IssueFeeDialog';
import { PageHeader } from '@/components/PageHeader';
import { StatGrid, StatTile } from '@/components/StatTile';
import { EmptyState, ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { formatRupees } from '@/lib/money';
import { defaulters, lastMonths, receiptsFromVouchers, type Receipt } from '@/lib/roster';
import { schoolToday, TIMEZONE } from '@/lib/school';
import { getI18n } from '@/i18n/server';
import type { FeeInvoice, FeeSummary, Structure } from '@/lib/types';

import { Banknote as PaymentsOutlined } from 'lucide-react';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('fo.title') };
}

const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);
const MONTHS = 6;

interface PaymentRow {
  id: string;
  receiptNo: string | null;
  amountPaise: number;
  method: string;
  paidAt: string;
  student: { fullName: string };
  className: string;
}

/** Paid receipts of the last six months: GET /v1/fees/payments, or the GL journal on an API without it. */
async function recentReceipts(today: string, months: string[]): Promise<Receipt[]> {
  const day = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TIMEZONE });
  try {
    const rows = await api<PaymentRow[]>(`/v1/fees/payments?months=${MONTHS}`);
    return rows.map((p) => ({ id: p.id, receiptNo: p.receiptNo ?? p.id.slice(0, 8), amountPaise: p.amountPaise, method: p.method, day: day(p.paidAt), student: p.student.fullName, className: p.className }));
  } catch {
    const gl = await api<{ vouchers: Parameters<typeof receiptsFromVouchers>[0] }>(`/v1/finance/gl?from=${months[0]}-01&to=${today}`);
    return receiptsFromVouchers(gl.vouchers);
  }
}

export default async function FeesPage() {
  await requireSection('fees');
  const today = schoolToday();
  const months = lastMonths(today, MONTHS);
  const [summary, structure, due, receipts, batches, unsettled, exceptions] = await Promise.all([
    load(() => api<FeeSummary>('/v1/fees/summary')),
    load(() => api<Structure>('/v1/admin/structure')),
    load(() => api<FeeInvoice[]>('/v1/fees/invoices?status=due')),
    load(() => recentReceipts(today, months)),
    load(() => api<SettlementBatchRow[]>('/v1/fees/settlements')),
    load(() => api<unknown[]>('/v1/fees/settlements/unsettled')),
    load(() => api<unknown[]>('/v1/fees/settlements/exceptions')),
  ]);
  const s = summary.data;
  const { t, fmt } = await getI18n();
  const year = structure.data?.academicYears.find((y) => y.isCurrent)?.label ?? '';
  const classes = (structure.data?.sections ?? []).map((x) => ({ id: x.id, name: x.displayName, students: x.students }));
  /** The exact amount, when the tile shows it shortened (₹9.26 L). */
  const exact = (paise: number) => (fmt.rupeesShort(paise) === formatRupees(paise) ? '' : ` · ${formatRupees(paise)}`);

  return (
    <>
      <PageHeader title={t('fo.title')} subtitle={year ? t('fo.subtitle', { year }) : t('fees.subtitle')} actions={<IssueFeeButton classes={classes} today={today} />} />
      <FeesNav value="overview" />
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
            <StatTile label={t('fees.outstanding')} value={fmt.rupeesShort(s!.outstandingPaise)} caption={`${t('fees.openInvoices', { n: s!.openInvoices })}${exact(s!.outstandingPaise)}`} testId="fee-outstanding" />
            <StatTile
              label={t('fees.overdue')}
              value={fmt.rupeesShort(s!.overduePaise)}
              tone={s!.overduePaise > 0 ? 'warning' : 'default'}
              caption={s!.overdueInvoices > 0 ? `${t('fees.overdueCaption', { n: s!.overdueInvoices })}${exact(s!.overduePaise)}` : t('fees.nothingOverdue')}
              testId="fee-overdue"
            />
          </StatGrid>
          <FeesBoard
            billedPaise={s!.billedPaise}
            collectedPaise={s!.collectedPaise}
            classes={s!.classes.map((c) => ({ id: c.sectionId, label: c.className, collected: c.collectedPaise / 1e7, outstanding: c.outstandingPaise / 1e7 }))}
            months={months}
            receipts={receipts.data ?? null}
            defaulters={due.data ? defaulters(due.data, today) : null}
            settlements={batches.data ? { batches: batches.data, unsettled: unsettled.data?.length ?? 0, exceptions: exceptions.data?.length ?? 0 } : null}
          />
        </>
      )}
    </>
  );
}
