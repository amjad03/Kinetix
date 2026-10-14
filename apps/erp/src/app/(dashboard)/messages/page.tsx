import type { Metadata } from 'next';
import { AnnouncementsDesk } from '@/components/messages/AnnouncementsDesk';
import { ComposeMessage } from '@/components/messages/ComposeMessage';
import { SentMessages } from '@/components/messages/SentMessages';
import { PageHeader, SectionTitle } from '@/components/PageHeader';
import { StatGrid, StatTile } from '@/components/StatTile';
import { ErrorState } from '@/components/States';
import { api, getMe, load, requireSection } from '@/lib/api';
import type { Announcement, AnnTemplate } from '@/lib/communication';
import { TIMEZONE } from '@/lib/school';
import { getI18n } from '@/i18n/server';
import type { SentBroadcast, Structure } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.messages') };
}

/**
 * Communication > Messages: announcements to boards and the Teacher, Student and Parent apps
 * (targeting, schedule, read and acknowledgement tracking), and board-only alerts.
 */
export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireSection('school');
  const { tab } = await searchParams;
  const [me, structure, items, templates, departments, sent] = await Promise.all([
    getMe(),
    load(() => api<Structure>('/v1/admin/structure')),
    load(() => api<Announcement[]>('/v1/announcements')),
    load(() => api<AnnTemplate[]>('/v1/announcements/templates')),
    load(() => api<{ id: string; name: string }[]>('/v1/departments')),
    load(() => api<SentBroadcast[]>('/v1/broadcasts')),
  ]);
  const { t, fmt } = await getI18n();
  const failed = structure.error ?? items.error ?? templates.error;
  if (failed !== undefined) return <ErrorState message={failed} />;
  const list = items.data!;
  const lastWeek = new Date().getTime() - 7 * 86400_000;
  const recent = list.filter((a) => a.status === 'sent' && a.sentAt && new Date(a.sentAt).getTime() >= lastWeek);
  const reached = recent.reduce((n, a) => n + a.stats.recipients, 0);
  const read = recent.reduce((n, a) => n + a.stats.read, 0);
  const pendingAck = list.filter((a) => a.status === 'sent' && a.requiresAck).reduce((n, a) => n + (a.stats.recipients - a.stats.acknowledged), 0);
  const activeAlerts = sent.data?.filter((b) => b.active).length ?? 0;

  const boardAlerts =
    sent.error !== undefined ? (
      <ErrorState message={sent.error} />
    ) : (
      <div className="grid gap-8 grid-cols-[1fr] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
        <ComposeMessage structure={structure.data!} />
        <section aria-labelledby="sent-title">
          <SectionTitle id="sent-title" flush>
            {t('msg.sent')}
            {sent.data ? ` · ${sent.data.length}` : ''}
            {activeAlerts ? ` · ${t('msg.active', { n: activeAlerts })}` : ''}
          </SectionTitle>
          <SentMessages items={sent.data} structure={structure.data!} timeZone={TIMEZONE} userId={me.id} isAdmin={me.roles.some((r) => r === 'principal' || r === 'tenant_admin')} />
        </section>
      </div>
    );

  return (
    <>
      <PageHeader title={t('nav.messages')} subtitle={t('comm.subtitle')} />
      <StatGrid min={160}>
        <StatTile label={t('comm.stat.sentWeek')} value={fmt.number(recent.length)} testId="ann-sent-week" />
        <StatTile label={t('comm.stat.reached')} value={fmt.number(reached)} />
        <StatTile label={t('comm.stat.readRate')} value={reached ? `${Math.floor((read * 100) / reached)}%` : '—'} />
        <StatTile label={t('comm.stat.pendingAck')} value={fmt.number(pendingAck)} tone={pendingAck > 0 ? 'warning' : 'default'} />
      </StatGrid>
      <AnnouncementsDesk structure={structure.data!} departments={departments.data ?? []} items={list} templates={templates.data!} boardAlerts={boardAlerts} initialTab={tab ?? 'compose'} />
    </>
  );
}
