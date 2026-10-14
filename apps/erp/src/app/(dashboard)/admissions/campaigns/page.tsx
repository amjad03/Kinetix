import type { Metadata } from 'next';
import { AdmissionsTabs } from '@/components/admissions/AdmissionsTabs';
import { CampaignsDesk, type CampaignReport } from '@/components/admissions/CampaignsDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { KitList } from '@/components/admissions/KitList';
import { EmptyState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import { loadRecords } from '@/lib/records-server';
import type { MessageKey } from '@/i18n/messages';
import { getI18n } from '@/i18n/server';
import { Megaphone } from 'lucide-react';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('adm.tab.campaigns') };
}

/** Campaigns: their conversion (enquiries to admissions, cost per admission) and the campaigns themselves as a record kit list. */
export default async function CampaignsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('admissions');
  const sp = await searchParams;
  const view = sp.view === 'list' ? 'list' : 'report';
  const { t } = await getI18n();
  const tabs = <LinkTabs value={view} label={t('adm.tab.campaigns')} items={[{ value: 'report', label: t('adk.view.conversion'), href: '/admissions/campaigns' }, { value: 'list', label: t('adk.view.list'), href: '/admissions/campaigns?view=list' }]} />;
  if (view === 'list') {
    const loaded = await loadRecords('admission-campaigns', sp);
    return (
      <>
        <PageHeader title={t('adm.tab.campaigns')} subtitle={t('camp.subtitle')} />
        <AdmissionsTabs current="campaigns" />
        {tabs}
        {loaded.error !== undefined ? (
          <ErrorState message={loaded.error} />
        ) : (
          <KitList
            meta={loaded.data.meta}
            page={loaded.data.page}
            state={loaded.data.state}
            label={t('adm.tab.campaigns')}
            extraParams={{ view: 'list' }}
            columns={[
              { key: 'name', header: t('adk.col.campaign'), sortKey: 'name', rowHeader: true, sub: 'channel' },
              { key: 'startsOn', header: t('adk.col.starts'), sortKey: 'starts', kind: 'date', hideBelow: 'md' },
              { key: 'endsOn', header: t('adk.col.ends'), kind: 'date', hideBelow: 'md' },
              { key: 'budgetRupees', header: t('adk.col.spend'), sortKey: 'budget', kind: 'rupees' },
              { key: 'leads', header: t('adk.funnel.enquiries'), sortKey: 'leads', kind: 'number', hideBelow: 'sm' },
              { key: 'enrolled', header: t('adk.funnel.enrolled'), sortKey: 'enrolled', kind: 'number', hideBelow: 'sm' },
              { key: 'costPerAdmissionRupees', header: t('adk.col.costPerAdmission'), kind: 'rupees', hideBelow: 'lg' },
              { key: 'active', header: t('adk.col.running'), kind: 'bool', hideBelow: 'sm' },
            ]}
            empty={
              <EmptyState icon={<Megaphone />} title={t('adk.camp.none')}>
                {t('adk.camp.noneBody')}
              </EmptyState>
            }
          />
        )}
      </>
    );
  }
  const report = await load(() => api<CampaignReport>('/v1/admissions/reports/campaigns'));
  return (
    <>
      <PageHeader title={t('adm.tab.campaigns')} subtitle={t('camp.subtitle')} />
      <AdmissionsTabs current="campaigns" />
      {tabs}
      {report.error !== undefined ? <ErrorState message={report.error} /> : <CampaignsDesk report={report.data!} />}
    </>
  );
}
