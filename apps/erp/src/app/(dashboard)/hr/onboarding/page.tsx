import type { Metadata } from 'next';
import { HR_TABS, SectionTabs } from '@/components/hr/Common';
import { HrList } from '@/components/hr/HrList';
import { OnboardingDesk } from '@/components/hr/OnboardingDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { StaffSummary } from '@/lib/hr-types';
import type { OnboardingProgress } from '@/lib/hr-lifecycle';
import { loadRecords } from '@/lib/records-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('hl.tab.onboarding') };
}

/** Joining checklists: progress per new joiner (start a checklist) and every task across them, with owners and due dates. */
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('hr');
  const { t } = await getI18n();
  const sp = await searchParams;
  const view = sp.view === 'tasks' ? 'tasks' : 'people';
  const head = (
    <>
      <PageHeader title={t('nav.hr')} subtitle={t('hl.onb.subtitle')} />
      <SectionTabs tabs={HR_TABS} label="nav.hr" />
      <LinkTabs
        value={view}
        label={t('hl.tab.onboarding')}
        items={[
          { value: 'people', href: '/hr/onboarding', label: t('hk.onb.view.people') },
          { value: 'tasks', href: '/hr/onboarding?view=tasks', label: t('hk.onb.view.tasks') },
        ]}
      />
    </>
  );
  if (view === 'tasks') {
    const list = await loadRecords('onboarding-items', sp);
    return (
      <>
        {head}
        {list.error !== undefined ? <ErrorState message={list.error} /> : <HrList entity="onboarding-items" data={list.data} extraParams={{ view }} />}
      </>
    );
  }
  const data = await load(async () => {
    const [progress, staff] = await Promise.all([api<OnboardingProgress[]>('/v1/hr/onboarding'), api<StaffSummary[]>('/v1/hr/staff')]);
    return { progress, staff: staff.map((s) => ({ userId: s.userId, fullName: s.fullName })) };
  });
  return (
    <>
      {head}
      {data.error !== undefined ? <ErrorState message={data.error} /> : <OnboardingDesk progress={data.data.progress} staff={data.data.staff} />}
    </>
  );
}
