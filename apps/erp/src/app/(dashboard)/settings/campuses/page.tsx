import type { Metadata } from 'next';
import { CampusOverviewView } from '@/components/access/CampusOverviewView';
import { CampusRecords } from '@/components/access/CampusRecords';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { CampusOverview } from '@/lib/governance-access';
import { loadRecords } from '@/lib/records-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('ga.campus.title') };
}

/** Settings > Campuses: the list (record kit) and the multi-campus overview. */
export default async function CampusesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('settings');
  const sp = await searchParams;
  const { t } = await getI18n();
  const view = sp.view === 'overview' ? 'overview' : 'list';
  const tabs = (
    <LinkTabs
      value={view}
      label={t('ga.campus.title')}
      items={[
        { value: 'list', label: t('ga.campus.tab.list'), href: '/settings/campuses' },
        { value: 'overview', label: t('ga.campus.tab.overview'), href: '/settings/campuses?view=overview' },
      ]}
    />
  );
  const header = (
    <PageHeader
      title={t('ga.campus.title')}
      subtitle={t('ga.campus.sub')}
      actions={
        <LinkButton href="/settings/buildings" variant="outlined">
          {t('nav.buildings')}
        </LinkButton>
      }
    />
  );
  if (view === 'overview') {
    const data = await load(() => api<CampusOverview>('/v1/admin/institution/campus-overview'));
    return (
      <>
        {header}
        {tabs}
        {data.error !== undefined ? <ErrorState message={data.error} /> : <CampusOverviewView data={data.data} />}
      </>
    );
  }
  const records = await loadRecords('campuses', sp);
  return (
    <>
      {header}
      {tabs}
      {records.error !== undefined ? <ErrorState message={records.error} /> : <CampusRecords meta={records.data.meta} page={records.data.page} state={records.data.state} />}
    </>
  );
}
