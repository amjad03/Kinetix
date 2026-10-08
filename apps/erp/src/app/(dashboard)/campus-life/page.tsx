import type { Metadata } from 'next';
import { CampusLifeDesk } from '@/components/campus-life/CampusLifeDesk';
import { PageHeader } from '@/components/PageHeader';
import { StatGrid, StatTile } from '@/components/StatTile';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import type { CampusEvent, Club, Committee } from '@/lib/clife';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.campusLife') };
}

export default async function CampusLifePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireSection('campusLife');
  const { tab } = await searchParams;
  const [clubs, committees, events] = await Promise.all([
    load(() => api<Club[]>('/v1/campus-life/clubs')),
    load(() => api<Committee[]>('/v1/campus-life/committees')),
    load(() => api<CampusEvent[]>('/v1/campus-life/events')),
  ]);
  const { t } = await getI18n();
  const failed = [clubs, committees, events].find((x) => x.error !== undefined)?.error;
  if (failed !== undefined) return <ErrorState message={failed} />;
  const c = clubs.data!;
  const cm = committees.data!;
  const ev = events.data!;
  const upcoming = ev.filter((e) => e.status === 'published' && Date.parse(e.endsAt) > Date.now());
  return (
    <>
      <PageHeader title={t('nav.campusLife')} subtitle={t('cl.subtitle')} />
      <StatGrid min={120}>
        <StatTile label={t('cl.stat.clubs')} value={c.length} caption={t('cl.stat.pending', { n: c.reduce((s, x) => s + x.pending, 0) })} testId="cl-clubs-count" />
        <StatTile label={t('cl.stat.committees')} value={cm.length} caption={t('cl.stat.statutory', { n: cm.filter((x) => x.statutory).length })} testId="cl-committees-count" />
        <StatTile label={t('cl.stat.openActions')} value={cm.reduce((s, x) => s + x.openActions, 0)} testId="cl-open-actions" />
        <StatTile label={t('cl.stat.upcoming')} value={upcoming.length} testId="cl-upcoming" />
      </StatGrid>
      <CampusLifeDesk clubs={c} committees={cm} events={ev} initialTab={tab ?? 'clubs'} />
    </>
  );
}
