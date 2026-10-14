import type { Metadata } from 'next';
import { PlanningRecords, type PlanningEntity } from '@/components/academics/PlanningRecords';
import { WorkloadView, type WorkloadRow } from '@/components/academics/WorkloadView';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { loadRecords } from '@/lib/records-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.academicPlanning') };
}

const TABS = ['baskets', 'requisites', 'transfers', 'allocation', 'workload', 'regulations'] as const;
type Tab = (typeof TABS)[number];
const ENTITY: Record<Exclude<Tab, 'workload'>, PlanningEntity> = { baskets: 'elective-baskets', requisites: 'course-requisites', transfers: 'credit-transfers', allocation: 'faculty-allocations', regulations: 'regulations' };

/**
 * Academics → Planning: elective baskets (CBCS/NEP), prerequisites and co-requisites, credit transfers (ABC, SWAYAM,
 * NPTEL), faculty allocation with mid-semester hand-over, the workload statement, and regulations.
 */
export default async function PlanningPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('academics');
  const sp = await searchParams;
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : 'baskets';
  const { t } = await getI18n();
  const tabs = <LinkTabs value={tab} label={t('nav.academicPlanning')} items={TABS.map((x) => ({ value: x, label: t(`plan.tab.${x}`), href: `/academics/planning?tab=${x}` }))} />;
  const header = <PageHeader title={t('nav.academicPlanning')} subtitle={t('plan.subtitle')} />;
  if (tab === 'workload') {
    const res = await load(() => api<{ rows: WorkloadRow[] }>('/v1/academic-planning/workload'));
    return (
      <>
        {header}
        {tabs}
        <p className="mb-4 text-sm text-muted-foreground">{t('plan.workloadHelp')}</p>
        {res.error !== undefined ? <ErrorState message={res.error} /> : <WorkloadView rows={res.data.rows} />}
      </>
    );
  }
  const entity = ENTITY[tab];
  const records = await loadRecords(entity, sp);
  return (
    <>
      {header}
      {tabs}
      {records.error !== undefined ? <ErrorState message={records.error} /> : <PlanningRecords entity={entity} tab={tab} meta={records.data.meta} page={records.data.page} state={records.data.state} reorderScope={entity === 'elective-baskets' ? ['programme', 'term'] : []} />}
    </>
  );
}
