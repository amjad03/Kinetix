import type { Metadata } from 'next';
import { HR_TABS, SectionTabs } from '@/components/hr/Common';
import { LeaveDesk } from '@/components/hr/LeaveDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { Holiday, LeaveRequest, LeaveType, StaffSummary } from '@/lib/hr-types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('hr.tab.leave') };
}

export default async function LeavePage() {
  await requireSection('hr');
  const { t } = await getI18n();
  const data = await load(() => Promise.all([api<LeaveRequest[]>('/v1/hr/leave/requests'), api<LeaveType[]>('/v1/hr/leave-types'), api<Holiday[]>('/v1/hr/holidays'), api<StaffSummary[]>('/v1/hr/staff')]));
  return (
    <>
      <PageHeader title={t('nav.hr')} subtitle={t('hr.leave.subtitle')} />
      <SectionTabs tabs={HR_TABS} label="nav.hr" />
      {data.error !== undefined ? <ErrorState message={data.error} /> : <LeaveDesk requests={data.data[0]} types={data.data[1]} holidays={data.data[2]} staff={data.data[3]} />}
    </>
  );
}
