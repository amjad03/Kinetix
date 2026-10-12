import Link from 'next/link';
import { LinkButton } from '@/components/LinkButton';
import { EmptyState, ErrorState } from '@/components/States';
import { Card } from '@/components/ui/Card';
import { StatGrid, StatTile } from '@/components/ui/StatTile';
import { api, load } from '@/lib/api';
import { canSee } from '@/lib/access';
import { daysBetween } from '@/lib/dates';
import { percentChange, type DashboardRollup } from '@/lib/dashboard';
import type { FeeInvoice, FeeSummary, Me } from '@/lib/types';
import { getI18n } from '@/i18n/server';
import { AttentionInbox, ChartCard, DrillBars, FeeBars, MiniBars, MiniMeter, type InboxItem } from './home';
import { QuickActions, Row } from './parts';

import { ArrowRight as ArrowForward, Banknote as PaymentsOutlined, Clock as ScheduleOutlined, FileText as RequestQuoteOutlined, Folders as FolderCopyOutlined, Landmark, ReceiptText as ReceiptLongOutlined, TriangleAlert, Users, Wallet as AccountBalanceWalletOutlined } from 'lucide-react';

interface Unsettled {
  id: string;
  amountPaise: number;
  paidAt: string;
}

/** The office and accounts home: money collected and owed, who to chase, gateway money not yet in the bank, and dues by class and age. */
export async function FinanceDashboard({ me, today }: { me: Me; today: string }) {
  const { t, fmt } = await getI18n();
  const [sum, roll, inv, uns, exc] = await Promise.all([
    load(() => api<FeeSummary>('/v1/fees/summary')),
    load(() => api<DashboardRollup>('/v1/admin/dashboard')),
    load(() => api<FeeInvoice[]>('/v1/fees/invoices?status=due')),
    load(() => api<Unsettled[]>('/v1/fees/settlements/unsettled?olderThanDays=0')),
    load(() => api<unknown[]>('/v1/fees/settlements/exceptions')),
  ]);
  if (sum.error !== undefined) return <ErrorState message={sum.error} />;
  const s = sum.data;
  const f = roll.data?.fees;
  const overdue = (inv.data ?? []).filter((i) => i.dueOn < today).sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const defaulters = new Set(overdue.map((i) => i.student.id)).size;
  const late30 = new Set(overdue.filter((i) => daysBetween(i.dueOn, today) > 30).map((i) => i.student.id)).size;
  const rate = s.billedPaise > 0 ? Math.round((s.collectedPaise / s.billedPaise) * 1000) / 10 : null;
  const unsettled = uns.data ?? [];
  const unsettledPaise = unsettled.reduce((a, x) => a + x.amountPaise, 0);
  const exceptions = exc.data?.length ?? 0;
  const roles = me.roles;
  const lakh = (p: number) => Math.round(p / 1e5) / 100;

  // Overdue money by how late it is: the ageing buckets the office chases first.
  const AGE: { id: string; from: number; to: number }[] = [
    { id: '1-30', from: 1, to: 30 },
    { id: '31-60', from: 31, to: 60 },
    { id: '61-90', from: 61, to: 90 },
    { id: '90+', from: 91, to: Infinity },
  ];
  const ageing = AGE.map((b) => ({
    id: b.id,
    label: t('dash.fin.ageBucket', { range: b.id }),
    value: lakh(overdue.filter((i) => { const d = daysBetween(i.dueOn, today); return d >= b.from && d <= b.to; }).reduce((a, i) => a + i.amountPaise - i.paidPaise, 0)),
    href: '/fees/invoices?status=overdue',
  }));
  const feeRows = s.classes
    .filter((c) => c.billedPaise > 0)
    .sort((a, b) => b.outstandingPaise - a.outstandingPaise)
    .slice(0, 10)
    .map((c) => ({ id: c.sectionId, label: c.className, collected: lakh(c.collectedPaise), outstanding: lakh(c.outstandingPaise) }));

  const inbox = (
    [
    defaulters > 0 && { key: 'defaulters', kind: 'alert', tone: 'red', icon: <Users />, title: t('dash.fin.inbox.defaulters', { n: defaulters }), detail: t('dash.fin.inbox.defaultersSub', { amount: fmt.rupeesShort(s.overduePaise) }), action: t('home.review'), href: '/fees/invoices?status=overdue' },
    unsettled.length > 0 && { key: 'unsettled', kind: 'alert', tone: 'amber', icon: <Landmark />, title: t('dash.fin.inbox.unsettled', { n: unsettled.length }), detail: fmt.rupeesShort(unsettledPaise), action: t('home.open'), href: '/settlements' },
    exceptions > 0 && { key: 'exceptions', kind: 'task', tone: 'amber', icon: <TriangleAlert />, title: t('dash.fin.inbox.exceptions', { n: exceptions }), action: t('home.open'), href: '/settlements' },
    s.openInvoices > 0 && { key: 'open', kind: 'task', tone: 'blue', icon: <ReceiptLongOutlined />, title: `${fmt.number(s.openInvoices)} · ${t('dash.task.openInvoices')}`, action: t('home.open'), href: '/fees/invoices' },
    ] as (InboxItem | false)[]
  ).filter((x): x is InboxItem => !!x);

  return (
    <>
      <StatGrid min={200}>
        <StatTile testId="stat-collected" icon={<PaymentsOutlined />} label={t('dash.fin.collected')} value={fmt.rupeesShort(f ? f.collected : s.collectedPaise)} trend={f ? { delta: percentChange(f.collected, f.previous), label: t('dash.vsLastMonth') } : undefined} spark={rate === null ? undefined : <MiniMeter value={rate} />} caption={rate === null ? t('dash.fin.collectedAll') : t('dash.fin.ofBilled', { pct: rate, billed: fmt.rupeesShort(s.billedPaise) })} href="/fees" />
        <StatTile testId="stat-outstanding" icon={<AccountBalanceWalletOutlined />} label={t('dash.fin.outstanding')} value={fmt.rupeesShort(s.outstandingPaise)} spark={<MiniMeter value={s.billedPaise > 0 ? (s.overduePaise / s.billedPaise) * 100 : 0} tone="amber" />} caption={t('dash.fin.openInvoices', { n: s.openInvoices })} href="/fees/invoices" />
        <StatTile testId="stat-defaulters" icon={<Users />} label={t('dash.fin.defaulters')} value={defaulters} tone={defaulters > 0 ? 'warning' : 'default'} spark={overdue.length > 0 ? <MiniBars values={ageing.map((a) => a.value)} label={t('dash.fin.ageing')} /> : undefined} caption={t('dash.fin.late30', { n: late30 })} href="/fees/invoices?status=overdue" />
        <StatTile testId="stat-unsettled" icon={<Landmark />} label={t('dash.fin.unsettled')} value={fmt.rupeesShort(unsettledPaise)} caption={uns.error !== undefined ? '—' : t('dash.fin.unsettledCaption', { n: unsettled.length })} href="/settlements" />
      </StatGrid>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard title={t('home.feeChart')} subtitle={t('home.feeChartSub')} className="xl:col-span-2" testId="fee-chart">
          {feeRows.length ? <FeeBars rows={feeRows} ariaLabel={t('home.feeChart')} collectedLabel={t('home.collected')} outstandingLabel={t('home.outstanding')} /> : <EmptyState dense icon={<PaymentsOutlined />} title={t('dash.fin.noClasses')} />}
        </ChartCard>
        <AttentionInbox items={inbox} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard title={t('dash.fin.ageing')} subtitle={t('dash.fin.ageingSub')} testId="ageing-chart">
          {overdue.length ? <DrillBars rows={ageing} ariaLabel={t('dash.fin.ageing')} money /> : <EmptyState dense icon={<ScheduleOutlined />} title={t('dash.fin.noOverdue')} />}
        </ChartCard>
        <Card className="xl:col-span-2" title={t('dash.fin.followUps')} subtitle={t('dash.fin.followUpsSub')} padded={false} action={<LinkButton href="/fees/invoices?status=overdue" size="small" endIcon={<ArrowForward />}>{t('dash.viewAll')}</LinkButton>} testId="overdue-list">
          {overdue.length === 0 ? (
            <div className="px-5 pb-5">
              <EmptyState dense icon={<ReceiptLongOutlined />} title={t('dash.fin.noOverdue')} />
            </div>
          ) : (
            <ul className="m-0 list-none p-0">
              {overdue.slice(0, 6).map((i) => (
                <li className="flex items-center gap-3 border-t px-5 py-2.5" key={i.id}>
                  <div className="min-w-0 flex-1">
                    <p className="m-0 truncate text-sm font-semibold">
                      <Link href={`/students/${i.student.id}`} className="text-inherit no-underline hover:underline">
                        {i.student.fullName}
                      </Link>
                    </p>
                    <p className="m-0 truncate text-xs text-muted-foreground">
                      {i.className} · {i.title}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="m-0 text-sm font-bold tabular-nums">{fmt.rupees(i.amountPaise - i.paidPaise)}</p>
                    <span className="text-xs text-red-ink">{t('dash.fin.daysLate', { n: daysBetween(i.dueOn, today) })}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Row cols={3}>
        <QuickActions
          t={t}
          actions={[
            { href: '/fees', label: t('dash.qa.issueFee'), icon: <PaymentsOutlined /> },
            { href: '/fees/invoices', label: t('dash.qa.invoices'), icon: <ReceiptLongOutlined /> },
            { href: '/settlements', label: t('dash.fin.settlements'), icon: <Landmark /> },
            ...(canSee(roles, 'payroll') ? [{ href: '/payroll', label: t('dash.qa.payroll'), icon: <RequestQuoteOutlined /> }] : []),
            ...(canSee(roles, 'documents') ? [{ href: '/documents', label: t('dash.qa.documents'), icon: <FolderCopyOutlined /> }] : []),
          ]}
        />
      </Row>
    </>
  );
}
