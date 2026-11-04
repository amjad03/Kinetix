import type { Metadata } from 'next';
import { ChannelsPanel } from '@/components/comms/ChannelsPanel';
import { CommsDesk } from '@/components/comms/CommsDesk';
import { CommsReport } from '@/components/comms/CommsReport';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { StatGrid, StatTile } from '@/components/StatTile';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { ChannelRow, CommsSummary, CreditRow } from '@/lib/comms-pass';
import type { AudienceRow, CampaignRow, MessageTemplate } from '@/lib/pathways-b';
import type { Structure } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.comms') };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Today and the first of this month in India, as YYYY-MM-DD. */
function thisMonth(): { from: string; to: string } {
  const ist = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  return { from: `${ist.slice(0, 8)}01`, to: ist };
}

/**
 * Communication engine: message templates (with their DLT and WhatsApp registration), saved audiences, campaigns
 * with a fallback chain, each channel's provider, price, caps and credits, and the delivery and cost report.
 */
export default async function CommunicationPage({ searchParams }: { searchParams: Promise<{ tab?: string; from?: string; to?: string }> }) {
  const me = await requireSection('comms');
  const sp = await searchParams;
  const { t, fmt } = await getI18n();
  const leader = !!me?.roles.some((r) => r === 'principal' || r === 'tenant_admin');
  const month = thisMonth();
  const from = sp.from && DATE.test(sp.from) ? sp.from : month.from;
  const to = sp.to && DATE.test(sp.to) ? sp.to : month.to;
  const [templates, audiences, campaigns, structure, channels, credits, summary] = await Promise.all([
    load(() => api<MessageTemplate[]>('/v1/comms/templates')),
    load(() => api<AudienceRow[]>('/v1/comms/audiences')),
    load(() => api<CampaignRow[]>('/v1/comms/campaigns')),
    load(() => api<Structure>('/v1/admin/structure')),
    leader ? load(() => api<ChannelRow[]>('/v1/comms/channels')) : Promise.resolve({ data: undefined, error: undefined }),
    leader ? load(() => api<CreditRow[]>('/v1/comms/credits')) : Promise.resolve({ data: undefined, error: undefined }),
    load(() => api<CommsSummary>(`/v1/comms/reports/summary?from=${from}&to=${to}`)),
  ]);
  const failed = templates.error ?? audiences.error ?? campaigns.error;
  if (failed !== undefined) return <ErrorState message={failed} />;
  const list = campaigns.data!;
  const sms = credits.data?.find((c) => c.channel === 'sms');
  const extraTabs = [
    ...(leader && channels.data && credits.data ? [{ id: 'channels', label: t('cp.tab.channels'), node: <ChannelsPanel channels={channels.data} credits={credits.data} canEdit={leader} canTopUp={leader} /> }] : []),
    ...(summary.data ? [{ id: 'reports', label: t('cp.tab.reports'), node: <CommsReport summary={summary.data} from={from} to={to} /> }] : []),
  ];
  return (
    <>
      <PageHeader
        title={t('nav.comms')}
        subtitle={t('pwb.comms.subtitle')}
        actions={
          <>
            <LinkButton href="/communication/log" variant="outlined">{t('cp.log.title')}</LinkButton>
            {leader && <LinkButton href="/communication/consent" variant="outlined">{t('cp.consent.title')}</LinkButton>}
            <LinkButton href="/communication/suppressions" variant="outlined">{t('cd.sup.title')}</LinkButton>
          </>
        }
      />
      <StatGrid min={140}>
        <StatTile label={t('pwb.comms.stat.templates')} value={templates.data!.filter((x) => x.active).length} testId="comms-templates-count" />
        <StatTile label={t('pwb.comms.stat.scheduled')} value={list.filter((c) => c.status === 'scheduled').length} testId="comms-scheduled-count" />
        <StatTile label={t('pwb.comms.stat.failed')} value={list.reduce((n, c) => n + c.failedCount, 0)} tone={list.some((c) => c.failedCount > 0) ? 'warning' : 'default'} />
        {summary.data && <StatTile label={t('cp.stat.costMonth')} value={fmt.rupees(summary.data.total.costPaise)} testId="comms-cost" />}
        {sms && sms.prepaid && <StatTile label={t('cp.stat.smsLeft')} value={fmt.number(sms.balance)} tone={sms.low ? 'warning' : 'default'} testId="comms-sms-left" />}
      </StatGrid>
      <CommsDesk
        templates={templates.data!}
        audiences={audiences.data!}
        campaigns={list}
        sections={(structure.data?.sections ?? []).map((s) => ({ value: s.id, label: s.displayName }))}
        initialTab={sp.tab ?? 'templates'}
        extraTabs={extraTabs}
        canEmergency={leader}
      />
    </>
  );
}
