import type { Metadata } from 'next';
import { HR_TABS, SectionTabs } from '@/components/hr/Common';
import { HrList } from '@/components/hr/HrList';
import { LeaveDesk } from '@/components/hr/LeaveDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { Holiday, LeaveType, StaffSummary } from '@/lib/hr-types';
import { loadRecords } from '@/lib/records-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('hr.tab.leave') };
}

const VIEWS = ['requests', 'types', 'compoff', 'encashments', 'balances', 'holidays'] as const;
type View = (typeof VIEWS)[number];
const ENTITY = { requests: 'leave-requests', types: 'leave-types', compoff: 'comp-off-credits', encashments: 'leave-encashments' } as const;

/** Leave: requests (apply, approve, withdraw, substitutes, documents), leave types and rules, compensatory off, encashment, balances and holidays. */
export default async function LeavePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('hr');
  const { t } = await getI18n();
  const sp = await searchParams;
  const view: View = VIEWS.includes(sp.view as View) ? (sp.view as View) : 'requests';
  // The standard leave types are made on first use.
  const types = await load(() => api<LeaveType[]>('/v1/hr/leave-types'));
  const tabs = (
    <LinkTabs
      value={view}
      label={t('hr.tab.leave')}
      items={VIEWS.map((v) => ({ value: v, href: v === 'requests' ? '/hr/leave' : `/hr/leave?view=${v}`, label: t(`hk.leave.view.${v}`) }))}
    />
  );
  const head = (
    <>
      <PageHeader title={t('nav.hr')} subtitle={t('hr.leave.subtitle')} />
      <SectionTabs tabs={HR_TABS} label="nav.hr" />
      {tabs}
    </>
  );
  if (types.error !== undefined) return (<>{head}<ErrorState message={types.error} /></>);
  if (view === 'balances' || view === 'holidays') {
    const data = await load(() => Promise.all([api<Holiday[]>('/v1/hr/holidays'), api<StaffSummary[]>('/v1/hr/staff')]));
    return (
      <>
        {head}
        {data.error !== undefined ? <ErrorState message={data.error} /> : <LeaveDesk only={view} requests={[]} types={types.data} holidays={data.data[0]} staff={data.data[1]} />}
      </>
    );
  }
  const entity = ENTITY[view];
  const list = await loadRecords(entity, sp);
  return (
    <>
      {head}
      {list.error !== undefined ? <ErrorState message={list.error} /> : <HrList entity={entity} data={list.data} extraParams={view === 'requests' ? {} : { view }} />}
    </>
  );
}
