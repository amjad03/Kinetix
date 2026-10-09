import type { Metadata } from 'next';
import { HR_TABS, SectionTabs } from '@/components/hr/Common';
import { ExitDesk } from '@/components/hr/ExitDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { StaffSummary } from '@/lib/hr-types';
import type { Separation, SeparationDetail } from '@/lib/hr-lifecycle';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('hl.tab.exit') };
}

export default async function ExitPage() {
  await requireSection('hr');
  const { t } = await getI18n();
  const data = await load(async () => {
    const [list, staff] = await Promise.all([api<Separation[]>('/v1/hr/separations'), api<StaffSummary[]>('/v1/hr/staff')]);
    const cases = await Promise.all(list.filter((s) => s.status !== 'withdrawn').map((s) => api<SeparationDetail>(`/v1/hr/separations/${s.id}`)));
    return { cases, staff: staff.map((s) => ({ userId: s.userId, fullName: s.fullName })) };
  });
  return (
    <>
      <PageHeader title={t('nav.hr')} subtitle={t('hl.exit.subtitle')} />
      <SectionTabs tabs={HR_TABS} label="nav.hr" />
      {data.error !== undefined ? <ErrorState message={data.error} /> : <ExitDesk cases={data.data.cases} staff={data.data.staff} />}
    </>
  );
}
