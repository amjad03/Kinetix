import AccountBalanceWalletOutlined from '@mui/icons-material/AccountBalanceWalletOutlined';
import ArrowForward from '@mui/icons-material/ArrowForward';
import FolderCopyOutlined from '@mui/icons-material/FolderCopyOutlined';
import PaymentsOutlined from '@mui/icons-material/PaymentsOutlined';
import PercentOutlined from '@mui/icons-material/PercentOutlined';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import RequestQuoteOutlined from '@mui/icons-material/RequestQuoteOutlined';
import ScheduleOutlined from '@mui/icons-material/ScheduleOutlined';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { MiniBar } from '@/components/Bars';
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
import { PendingTasks, QuickActions, Row } from './parts';

/** The accounts office: money collected and owed, who to chase, and where fees stand by class. */
export async function FinanceDashboard({ me, today }: { me: Me; today: string }) {
  const { t, fmt } = await getI18n();
  const [sum, roll, inv] = await Promise.all([
    load(() => api<FeeSummary>('/v1/fees/summary')),
    load(() => api<DashboardRollup>('/v1/admin/dashboard')),
    load(() => api<FeeInvoice[]>('/v1/fees/invoices?status=due')),
  ]);
  if (sum.error !== undefined) return <ErrorState message={sum.error} />;
  const s = sum.data;
  const f = roll.data?.fees;
  const overdue = (inv.data ?? []).filter((i) => i.dueOn < today).sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const rate = s.billedPaise > 0 ? Math.round((s.collectedPaise / s.billedPaise) * 1000) / 10 : null;
  const classes = [...s.classes].filter((c) => c.billedPaise > 0).sort((a, b) => b.overduePaise - a.overduePaise).slice(0, 6);
  const roles = me.roles;

  return (
    <>
      <StatGrid min={200}>
        <StatTile testId="stat-collected" icon={<PaymentsOutlined />} label={t('dash.fin.collected')} value={f ? fmt.rupeesShort(f.collected) : fmt.rupeesShort(s.collectedPaise)} trend={f ? { delta: percentChange(f.collected, f.previous), label: t('dash.vsLastMonth') } : undefined} caption={f ? t('dash.fin.collectedCaption') : t('dash.fin.collectedAll')} href="/fees" />
        <StatTile testId="stat-rate" icon={<PercentOutlined />} label={t('dash.fin.rate')} value={rate === null ? '—' : `${rate}%`} bar={rate === null ? undefined : <MiniBar value={rate} color="var(--kx-accent)" />} caption={t('dash.fin.rateCaption', { billed: fmt.rupeesShort(s.billedPaise) })} />
        <StatTile testId="stat-outstanding" icon={<AccountBalanceWalletOutlined />} label={t('dash.fin.outstanding')} value={fmt.rupeesShort(s.outstandingPaise)} caption={t('dash.fin.openInvoices', { n: s.openInvoices })} href="/fees/invoices" />
        <StatTile testId="stat-overdue" icon={<ScheduleOutlined />} label={t('dash.fin.overdue')} value={s.overdueInvoices} unit={t('dash.fin.overdueUnit')} tone={s.overdueInvoices > 0 ? 'warning' : 'default'} caption={t('dash.fin.overdueAmount', { amount: fmt.rupeesShort(s.overduePaise) })} href="/fees/invoices?status=overdue" />
      </StatGrid>

      <Row cols={3}>
        <Card title={t('dash.fin.followUps')} subtitle={t('dash.fin.followUpsSub')} padded={false} action={<LinkButton href="/fees/invoices?status=overdue" size="small" endIcon={<ArrowForward />}>{t('dash.viewAll')}</LinkButton>} testId="overdue-list">
          {overdue.length === 0 ? (
            <Box sx={{ px: 2.5, pb: 2.5 }}>
              <EmptyState dense icon={<ReceiptLongOutlined />} title={t('dash.fin.noOverdue')} />
            </Box>
          ) : (
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {overdue.slice(0, 7).map((i) => (
                <Box component="li" key={i.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2.5, py: 1.25, borderTop: 1, borderColor: 'm3.outlineVariant' }}>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography sx={{ fontSize: '0.875rem', fontWeight: 600 }} noWrap>
                      <Link href={`/students/${i.student.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                        {i.student.fullName}
                      </Link>
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap component="p">
                      {i.className} · {i.title}
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography sx={{ fontSize: '0.875rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt.rupees(i.amountPaise - i.paidPaise)}</Typography>
                    <Typography variant="caption" sx={{ color: 'error.main' }}>
                      {t('dash.fin.daysLate', { n: daysBetween(i.dueOn, today) })}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </Card>
        <Card title={t('dash.fin.byClass')} subtitle={t('dash.fin.byClassSub')} testId="fees-by-class">
          {classes.length === 0 ? (
            <EmptyState dense icon={<PaymentsOutlined />} title={t('dash.fin.noClasses')} />
          ) : (
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 2 }}>
              {classes.map((c) => {
                const pct = c.billedPaise > 0 ? (c.collectedPaise / c.billedPaise) * 100 : 0;
                return (
                  <li key={c.sectionId}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600 }}>{c.className}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {t('dash.fin.classLine', { pct: Math.round(pct), out: fmt.rupeesShort(c.outstandingPaise) })}
                      </Typography>
                    </Box>
                    <MiniBar value={pct} color={pct >= 90 ? 'var(--kx-success)' : pct >= 60 ? 'var(--kx-accent)' : 'var(--kx-warning)'} label={`${c.className}: ${Math.round(pct)}%`} />
                  </li>
                );
              })}
            </Box>
          )}
        </Card>
        <PendingTasks
          t={t}
          tasks={[
            { key: 'fees', label: t('dash.task.fees'), count: s.overdueInvoices, href: '/fees/invoices?status=overdue', icon: <ScheduleOutlined />, tone: 'warning' },
            { key: 'open', label: t('dash.task.openInvoices'), count: s.openInvoices, href: '/fees/invoices', icon: <ReceiptLongOutlined /> },
          ]}
        />
      </Row>
      <Row cols={3}>
        <QuickActions
          t={t}
          actions={[
            { href: '/fees', label: t('dash.qa.issueFee'), icon: <PaymentsOutlined /> },
            { href: '/fees/invoices', label: t('dash.qa.invoices'), icon: <ReceiptLongOutlined /> },
            ...(canSee(roles, 'payroll') ? [{ href: '/payroll', label: t('dash.qa.payroll'), icon: <RequestQuoteOutlined /> }] : []),
            ...(canSee(roles, 'documents') ? [{ href: '/documents', label: t('dash.qa.documents'), icon: <FolderCopyOutlined /> }] : []),
          ]}
        />
      </Row>
    </>
  );
}
