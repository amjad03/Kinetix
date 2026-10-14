import type { Metadata } from 'next';
import { HR_TABS, SectionTabs } from '@/components/hr/Common';
import { ExitDesk } from '@/components/hr/ExitDesk';
import { HrList } from '@/components/hr/HrList';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { StaffSummary } from '@/lib/hr-types';
import type { Separation, SeparationDetail } from '@/lib/hr-lifecycle';
import { loadRecords } from '@/lib/records-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('hl.tab.exit') };
}

/** Exits: the cases in progress (acceptance, no-dues clearance, settlement, relieving) and every resignation with its letters. */
export default async function ExitPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('hr');
  const { t } = await getI18n();
  const sp = await searchParams;
  const view = sp.view === 'all' ? 'all' : 'open';
  const head = (
    <>
      <PageHeader title={t('nav.hr')} subtitle={t('hl.exit.subtitle')} />
      <SectionTabs tabs={HR_TABS} label="nav.hr" />
      <LinkTabs
        value={view}
        label={t('hl.tab.exit')}
        items={[
          { value: 'open', href: '/hr/exit', label: t('hk.exit.view.open') },
          { value: 'all', href: '/hr/exit?view=all', label: t('hk.exit.view.all') },
        ]}
      />
    </>
  );
  if (view === 'all') {
    const list = await loadRecords('separations', sp);
    return (
      <>
        {head}
        {list.error !== undefined ? <ErrorState message={list.error} /> : <HrList entity="separations" data={list.data} extraParams={{ view }} />}
      </>
    );
  }
  const data = await load(async () => {
    const [list, staff] = await Promise.all([api<Separation[]>('/v1/hr/separations'), api<StaffSummary[]>('/v1/hr/staff')]);
    const cases = await Promise.all(list.filter((s) => s.status !== 'withdrawn' && s.status !== 'relieved').map((s) => api<SeparationDetail>(`/v1/hr/separations/${s.id}`)));
    return { cases, staff: staff.map((s) => ({ userId: s.userId, fullName: s.fullName })) };
  });
  return (
    <>
      {head}
      {data.error !== undefined ? <ErrorState message={data.error} /> : <ExitDesk cases={data.data.cases} staff={data.data.staff} />}
    </>
  );
}
