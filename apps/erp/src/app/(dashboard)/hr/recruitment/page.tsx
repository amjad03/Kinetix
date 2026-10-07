import type { Metadata } from 'next';
import { HR_TABS, SectionTabs } from '@/components/hr/Common';
import { RecruitmentDesk } from '@/components/hr/RecruitmentDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, ApiError, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { JobApplicant, JobOpening } from '@/lib/hr-types';
import type { AdminDepartment } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('hr.tab.recruitment') };
}

export default async function RecruitmentPage({ searchParams }: { searchParams: Promise<{ opening?: string }> }) {
  await requireSection('hr');
  const { t } = await getI18n();
  const { opening } = await searchParams;
  const selected = opening && UUID.test(opening) ? opening : null;
  const data = await load(async () => {
    const [openings, departments] = await Promise.all([
      api<JobOpening[]>('/v1/hr/openings'),
      api<AdminDepartment[]>('/v1/admin/departments').catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 403) return [] as AdminDepartment[];
        throw e;
      }),
    ]);
    const applicants = selected ? await api<JobApplicant[]>(`/v1/hr/openings/${selected}/applicants`) : [];
    return { openings, departments, applicants };
  });
  return (
    <>
      <PageHeader title={t('nav.hr')} subtitle={t('hr.rec.subtitle')} />
      <SectionTabs tabs={HR_TABS} label="nav.hr" />
      {data.error !== undefined ? <ErrorState message={data.error} /> : <RecruitmentDesk openings={data.data.openings} applicants={data.data.applicants} selected={selected} departments={data.data.departments.map((d) => ({ id: d.id, name: d.name }))} />}
    </>
  );
}
