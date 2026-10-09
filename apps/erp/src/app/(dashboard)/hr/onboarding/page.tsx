import type { Metadata } from 'next';
import { HR_TABS, SectionTabs } from '@/components/hr/Common';
import { OnboardingDesk } from '@/components/hr/OnboardingDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { StaffSummary } from '@/lib/hr-types';
import type { OnboardingProgress } from '@/lib/hr-lifecycle';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('hl.tab.onboarding') };
}

export default async function OnboardingPage() {
  await requireSection('hr');
  const { t } = await getI18n();
  const data = await load(async () => {
    const [progress, staff] = await Promise.all([api<OnboardingProgress[]>('/v1/hr/onboarding'), api<StaffSummary[]>('/v1/hr/staff')]);
    return { progress, staff: staff.map((s) => ({ userId: s.userId, fullName: s.fullName })) };
  });
  return (
    <>
      <PageHeader title={t('nav.hr')} subtitle={t('hl.onb.subtitle')} />
      <SectionTabs tabs={HR_TABS} label="nav.hr" />
      {data.error !== undefined ? <ErrorState message={data.error} /> : <OnboardingDesk progress={data.data.progress} staff={data.data.staff} />}
    </>
  );
}
