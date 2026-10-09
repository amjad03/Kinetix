import type { Metadata } from 'next';
import { CommsDesk } from '@/components/comms/CommsDesk';
import { PageHeader } from '@/components/PageHeader';
import { StatGrid, StatTile } from '@/components/StatTile';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { AudienceRow, CampaignRow, MessageTemplate } from '@/lib/pathways-b';
import type { Structure } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.comms') };
}

/** Communication engine: message templates, saved audiences and scheduled campaigns over in-app, SMS, email and WhatsApp. */
export default async function CommunicationPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireSection('comms');
  const { tab } = await searchParams;
  const { t } = await getI18n();
  const [templates, audiences, campaigns, structure] = await Promise.all([
    load(() => api<MessageTemplate[]>('/v1/comms/templates')),
    load(() => api<AudienceRow[]>('/v1/comms/audiences')),
    load(() => api<CampaignRow[]>('/v1/comms/campaigns')),
    load(() => api<Structure>('/v1/admin/structure')),
  ]);
  const failed = templates.error ?? audiences.error ?? campaigns.error;
  if (failed !== undefined) return <ErrorState message={failed} />;
  const list = campaigns.data!;
  return (
    <>
      <PageHeader title={t('nav.comms')} subtitle={t('pwb.comms.subtitle')} />
      <StatGrid min={140}>
        <StatTile label={t('pwb.comms.stat.templates')} value={templates.data!.filter((x) => x.active).length} testId="comms-templates-count" />
        <StatTile label={t('pwb.comms.stat.audiences')} value={audiences.data!.length} />
        <StatTile label={t('pwb.comms.stat.scheduled')} value={list.filter((c) => c.status === 'scheduled').length} testId="comms-scheduled-count" />
        <StatTile label={t('pwb.comms.stat.failed')} value={list.reduce((n, c) => n + c.failedCount, 0)} tone={list.some((c) => c.failedCount > 0) ? 'warning' : 'default'} />
      </StatGrid>
      <CommsDesk
        templates={templates.data!}
        audiences={audiences.data!}
        campaigns={list}
        sections={(structure.data?.sections ?? []).map((s) => ({ value: s.id, label: s.displayName }))}
        initialTab={tab ?? 'templates'}
      />
    </>
  );
}
