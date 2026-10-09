import type { Metadata } from 'next';
import { HR_TABS, SectionTabs } from '@/components/hr/Common';
import { ProbationDesk } from '@/components/hr/ProbationDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { canSee } from '@/lib/access';
import { getI18n } from '@/i18n/server';
import type { Probationer } from '@/lib/staff-changes';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('as.tab.probation') };
}

export default async function ProbationPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const me = await requireSection('appraisal');
  const { all } = await searchParams;
  const { t } = await getI18n();
  const roles = me?.roles ?? [];
  const data = await load(() => api<Probationer[]>(`/v1/hr/probation${all === '1' ? '?all=1' : ''}`));
  return (
    <>
      <PageHeader title={t('as.tab.probation')} subtitle={t('as.prob.subtitle')} />
      {canSee(roles, 'hr') && <SectionTabs tabs={HR_TABS} label="nav.hr" />}
      {data.error !== undefined ? <ErrorState message={data.error} /> : <ProbationDesk rows={data.data} showAll={all === '1'} canDecide={roles.includes('principal') || roles.includes('tenant_admin')} />}
    </>
  );
}
