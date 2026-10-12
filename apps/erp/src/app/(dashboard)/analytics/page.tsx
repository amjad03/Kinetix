import type { Metadata } from 'next';
import Link from 'next/link';
import { Bars, Kpi, V2Card } from '@/components/analytics/V2Card';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { DonutChart, LineChart } from '@/components/ui/Charts';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { DashboardRollup } from '@/lib/dashboard';
import { formatMonth } from '@/lib/dates';
import { formatRupees } from '@/lib/money';
import type { FeeSummary } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('v2.an.title') };
}

/** Principal analytics (redesign v2): KPIs, monthly performance, fee collection, class-wise dues and pending approvals. */
export default async function AnalyticsPage() {
  await requireSection('dashboard');
  const { t, locale } = await getI18n();
  const [roll, fees] = await Promise.all([load(() => api<DashboardRollup>('/v1/admin/dashboard')), load(() => api<FeeSummary>('/v1/fees/summary'))]);
  if (roll.error !== undefined) return <ErrorState message={roll.error} />;
  const r = roll.data;
  const f = fees.data;
  const perf = r.performance ?? [];
  const collectedPct = f && f.billedPaise ? Math.round((f.collectedPaise / f.billedPaise) * 100) : null;
  const pending = [
    { key: 'v2.an.p.leave', n: r.pending.leave, href: '/hr/leave' },
    { key: 'v2.an.p.marks', n: r.pending.marksToVerify, href: '/exams' },
    { key: 'v2.an.p.papers', n: r.pending.examPapers, href: '/exams' },
    { key: 'v2.an.p.fees', n: r.pending.feeFollowUps, href: '/fees' },
    { key: 'v2.an.p.admissions', n: r.pending.admissionsReview, href: '/admissions' },
  ].filter((x) => x.n !== null) as { key: Parameters<typeof t>[0]; n: number; href: string }[];
  const classes = [...(f?.classes ?? [])].sort((a, b) => b.outstandingPaise - a.outstandingPaise).slice(0, 6);
  return (
    <div className="grid gap-5" data-testid="analytics">
      <PageHeader title={t('v2.an.title')} subtitle={t('v2.an.subtitle')} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon="students" label={t('v2.an.students')} value={r.students?.total ?? '–'} caption={r.students ? t('v2.an.joined', { n: r.students.joined }) : undefined} />
        <Kpi icon="attendance" label={t('v2.an.attendance')} value={r.attendance?.today === null || !r.attendance ? '–' : `${r.attendance.today}%`} caption={r.attendance?.previous != null ? t('v2.an.prev', { v: `${r.attendance.previous}%` }) : undefined} />
        <Kpi icon="finance" label={t('v2.an.collected')} value={r.fees ? formatRupees(r.fees.collected) : '–'} caption={r.fees ? t('v2.an.prev', { v: formatRupees(r.fees.previous) }) : undefined} />
        <Kpi icon="hr" label={t('v2.an.staff')} value={r.staff?.total ?? '–'} caption={r.fees ? t('v2.an.overdue', { n: r.fees.overdueInvoices }) : undefined} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <V2Card title={t('v2.an.performance')} icon="reports">
          {perf.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('v2.an.noData')}</p>
          ) : (
            <LineChart
              ariaLabel={t('v2.an.performance')}
              labels={perf.map((p) => formatMonth(`${p.month}-01`, locale))}
              unit="%"
              min={0}
              max={100}
              series={[
                { key: 'att', label: t('v2.an.attendance'), values: perf.map((p) => p.attendance) },
                { key: 'marks', label: t('v2.an.marks'), values: perf.map((p) => p.internalMarks) },
                { key: 'co', label: t('v2.an.co'), values: perf.map((p) => p.coAttainment) },
              ]}
            />
          )}
        </V2Card>
        <V2Card title={t('v2.an.feeCollection')} icon="finance">
          {f ? (
            <div className="grid gap-4">
              <div className="flex justify-center">
                <DonutChart value={collectedPct} label={t('v2.an.feeCollection')} center={<b className="text-lg">{collectedPct ?? 0}%</b>} />
              </div>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-muted-foreground">{t('v2.an.billed')}</dt>
                <dd className="text-right font-semibold tabular-nums">{formatRupees(f.billedPaise)}</dd>
                <dt className="text-muted-foreground">{t('v2.an.collected')}</dt>
                <dd className="text-right font-semibold tabular-nums">{formatRupees(f.collectedPaise)}</dd>
                <dt className="text-muted-foreground">{t('v2.an.outstanding')}</dt>
                <dd className="text-right font-semibold tabular-nums">{formatRupees(f.outstandingPaise)}</dd>
              </dl>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('v2.an.noData')}</p>
          )}
        </V2Card>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <V2Card title={t('v2.an.classDues')} icon="classes">
          {classes.length === 0 ? <p className="text-sm text-muted-foreground">{t('v2.an.noData')}</p> : <Bars tone="bg-amber-500" rows={classes.map((c) => ({ label: c.className, value: Math.round(c.outstandingPaise / 100000) / 100, caption: t('v2.an.lakh') }))} />}
        </V2Card>
        <V2Card title={t('v2.an.pending')} icon="tasks">
          <ul className="divide-y">
            {pending.map((p) => (
              <li key={p.key}>
                <Link href={p.href} className="flex items-center gap-3 py-2.5 text-sm hover:underline">
                  <span className="flex-1">{t(p.key)}</span>
                  <b className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${p.n > 0 ? 'bg-red-soft text-red-ink' : 'bg-muted text-muted-foreground'}`}>{p.n}</b>
                </Link>
              </li>
            ))}
          </ul>
        </V2Card>
      </div>
    </div>
  );
}
