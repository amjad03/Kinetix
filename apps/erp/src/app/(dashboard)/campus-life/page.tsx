import type { Metadata } from 'next';
import { AchievementsTab } from '@/components/campus-life/LifeExtras';
import { CampusLifeTab } from '@/components/life/CampusLifeTab';
import { CampusReports } from '@/components/life/CampusReports';
import { PageHeader } from '@/components/PageHeader';
import { StatGrid, StatTile } from '@/components/StatTile';
import { ErrorState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import { api, load, requireSection } from '@/lib/api';
import type { CampusEvent, Club, Committee } from '@/lib/clife';
import type { EventRegisterRow, NaacLife, ParticipationRow, UnitHoursRow } from '@/lib/life';
import { loadRecords } from '@/lib/records-server';
import type { Structure } from '@/lib/types';
import { getI18n } from '@/i18n/server';
import type { MessageKey } from '@/i18n/messages';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.campusLife') };
}

/** Each list tab and the record kit entity behind it. */
const LISTS = { clubs: 'clubs', committees: 'committees', events: 'campus-events', units: 'activity-units', achievements: 'student-achievements', outreach: 'outreach-activities', claims: 'club-expense-claims', elections: 'elections' } as const;
type ListTab = keyof typeof LISTS;
const TABS = [...(Object.keys(LISTS) as ListTab[]), 'awards', 'reports'] as const;
type Tab = (typeof TABS)[number];

/** Published and not yet over. */
function isUpcoming(e: CampusEvent) {
  return e.status === 'published' && Date.parse(e.endsAt) > Date.now();
}

/**
 * Campus life: clubs, committees, events, NSS/NCC and sports units, the achievements register, extension and
 * outreach, club claims and budgets, council elections, and the NAAC reports. Every list is a record kit list.
 */
export default async function CampusLifePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('campusLife');
  const sp = await searchParams;
  const { t } = await getI18n();
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : 'clubs';
  const [clubs, committees, events] = await Promise.all([
    load(() => api<Club[]>('/v1/campus-life/clubs')),
    load(() => api<Committee[]>('/v1/campus-life/committees')),
    load(() => api<CampusEvent[]>('/v1/campus-life/events')),
  ]);
  const failed = [clubs, committees, events].find((x) => x.error !== undefined)?.error;
  const header = <PageHeader title={t('nav.campusLife')} subtitle={t('cl.subtitle')} />;
  if (failed !== undefined) return <>{header}<ErrorState message={failed} /></>;
  const c = clubs.data!;
  const cm = committees.data!;
  const ev = events.data!;
  const tabs = (
    <LinkTabs
      label={t('nav.campusLife')}
      value={tab}
      items={TABS.map((x) => ({ value: x, label: t(`lf.tab.${x}` as MessageKey), href: x === 'clubs' ? '/campus-life' : `/campus-life?tab=${x}` }))}
    />
  );
  let body: React.ReactNode;
  if (tab === 'awards') body = <AchievementsTab />;
  else if (tab === 'reports') {
    const r = await load(() =>
      Promise.all([
        api<NaacLife>('/v1/campus-life/reports/naac'),
        api<EventRegisterRow[]>('/v1/campus-life/reports/event-register'),
        api<ParticipationRow[]>('/v1/campus-life/reports/participation'),
        api<UnitHoursRow[]>('/v1/campus-life/reports/unit-hours'),
      ]),
    );
    body = r.error !== undefined ? <ErrorState message={r.error} /> : <CampusReports naac={r.data[0]} register={r.data[1]} participation={r.data[2]} hours={r.data[3]} />;
  } else {
    const records = await loadRecords(LISTS[tab], sp);
    const structure = tab === 'units' || tab === 'elections' ? await load(() => api<Structure>('/v1/admin/structure')) : null;
    const sections = (structure?.data?.sections ?? []).map((x) => ({ id: x.id, name: x.displayName }));
    body = records.error !== undefined ? <ErrorState message={records.error} /> : <CampusLifeTab tab={tab} meta={records.data.meta} page={records.data.page} state={records.data.state} sections={sections} />;
  }
  return (
    <>
      {header}
      <StatGrid min={120}>
        <StatTile label={t('cl.stat.clubs')} value={c.length} caption={t('cl.stat.pending', { n: c.reduce((s, x) => s + x.pending, 0) })} testId="cl-clubs-count" />
        <StatTile label={t('cl.stat.committees')} value={cm.length} caption={t('cl.stat.statutory', { n: cm.filter((x) => x.statutory).length })} testId="cl-committees-count" />
        <StatTile label={t('cl.stat.openActions')} value={cm.reduce((s, x) => s + x.openActions, 0)} testId="cl-open-actions" />
        <StatTile label={t('cl.stat.upcoming')} value={ev.filter(isUpcoming).length} testId="cl-upcoming" />
      </StatGrid>
      {tabs}
      {body}
    </>
  );
}
