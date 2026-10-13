import type { Metadata } from 'next';
import { Bars, Kpi, V2Card } from '@/components/analytics/V2Card';
import type { CampaignReport } from '@/components/admissions/CampaignsDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import type { MessageKey } from '@/i18n/messages';
import { api, load, requireSection } from '@/lib/api';
import { ENQUIRY_STAGES, type Pipeline } from '@/lib/admissions';
import { formatRupees } from '@/lib/money';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('v2.cp.title') };
}

/** Admissions campaign dashboard (redesign v2): enquiries, conversion, spend, channels and the funnel. */
export default async function CampaignDashboard() {
  await requireSection('admissions');
  const { t } = await getI18n();
  const [rep, pipe] = await Promise.all([load(() => api<CampaignReport>('/v1/admissions/reports/campaigns')), load(() => api<Pipeline>('/v1/admissions/pipeline'))]);
  if (rep.error !== undefined) return <ErrorState message={rep.error} />;
  const cs = rep.data.campaigns;
  const sum = (k: 'enquiries' | 'applied' | 'enrolled') => cs.reduce((a, c) => a + c[k], 0) + rep.data.unattributed[k];
  const spend = cs.reduce((a, c) => a + c.budgetPaise, 0);
  const enrolled = sum('enrolled');
  const byChannel = new Map<string, number>();
  for (const c of cs) byChannel.set(c.channel, (byChannel.get(c.channel) ?? 0) + c.enquiries);
  const stages = pipe.data?.stages ?? {};
  const funnel = ENQUIRY_STAGES.filter((s) => s !== 'lost' && s !== 'deferred');
  return (
    <div className="grid gap-5" data-testid="campaign-dashboard">
      <PageHeader title={t('v2.cp.title')} subtitle={t('v2.cp.subtitle')} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon="admissions" label={t('v2.cp.enquiries')} value={sum('enquiries')} caption={pipe.data ? t('v2.cp.newWeek', { n: pipe.data.newThisWeek }) : undefined} />
        <Kpi icon="documents" label={t('v2.cp.applications')} value={sum('applied')} />
        <Kpi icon="students" label={t('v2.cp.enrolled')} value={enrolled} caption={sum('enquiries') ? t('v2.cp.conversion', { pct: Math.round((enrolled / sum('enquiries')) * 1000) / 10 }) : undefined} />
        <Kpi icon="finance" label={t('v2.cp.spend')} value={formatRupees(spend)} caption={enrolled ? t('v2.cp.perEnrolment', { amount: formatRupees(Math.round(spend / enrolled)) }) : undefined} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <V2Card title={t('v2.cp.funnel')} icon="admissions">
          <Bars tone="bg-violet-500" rows={funnel.map((s) => ({ label: t(`adm.stage.${s}` as MessageKey), value: stages[s] ?? 0 }))} />
        </V2Card>
        <V2Card title={t('v2.cp.channels')} icon="communication">
          {byChannel.size === 0 ? <p className="text-sm text-muted-foreground">{t('v2.an.noData')}</p> : <Bars tone="bg-orange-500" rows={[...byChannel].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }))} />}
        </V2Card>
      </div>
      <V2Card title={t('v2.cp.campaigns')} icon="communication">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 font-medium">{t('v2.cp.campaign')}</th>
                <th className="py-2 font-medium">{t('v2.cp.channel')}</th>
                <th className="py-2 text-right font-medium">{t('v2.cp.enquiries')}</th>
                <th className="py-2 text-right font-medium">{t('v2.cp.applications')}</th>
                <th className="py-2 text-right font-medium">{t('v2.cp.enrolled')}</th>
                <th className="py-2 text-right font-medium">{t('v2.cp.spend')}</th>
                <th className="py-2 text-right font-medium">{t('v2.cp.status')}</th>
              </tr>
            </thead>
            <tbody>
              {cs.map((c) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="py-2.5 font-medium">{c.name}</td>
                  <td className="py-2.5 text-muted-foreground">{c.channel}</td>
                  <td className="py-2.5 text-right tabular-nums">{c.enquiries}</td>
                  <td className="py-2.5 text-right tabular-nums">{c.applied}</td>
                  <td className="py-2.5 text-right tabular-nums">{c.enrolled}</td>
                  <td className="py-2.5 text-right tabular-nums">{formatRupees(c.budgetPaise)}</td>
                  <td className="py-2.5 text-right">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.active ? 'bg-green-soft text-green-ink' : 'bg-muted text-muted-foreground'}`}>{c.active ? t('v2.cp.live') : t('v2.cp.paused')}</span>
                  </td>
                </tr>
              ))}
              {cs.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-muted-foreground">{t('v2.an.noData')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </V2Card>
    </div>
  );
}
