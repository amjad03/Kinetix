import type { Metadata } from 'next';
import { HR_TABS, SectionTabs } from '@/components/hr/Common';
import { StaffDirectory } from '@/components/hr/StaffDirectory';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, ApiError, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { Designation, StaffSummary } from '@/lib/hr-types';
import type { AdminDepartment } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.hr') };
}

export default async function HrPage() {
  await requireSection('hr');
  const { t } = await getI18n();
  const data = await load(() => Promise.all([api<StaffSummary[]>('/v1/hr/staff'), api<Designation[]>('/v1/hr/designations'), api<AdminDepartment[]>('/v1/admin/departments').catch((e: unknown) => {
      // Setting up departments is for the principal and administrator; HR sees the staff list without the department choices.
      if (e instanceof ApiError && e.status === 403) return [] as AdminDepartment[];
      throw e;
    })]));
  return (
    <>
      <PageHeader title={t('nav.hr')} subtitle={t('hr.staff.subtitle')} />
      <SectionTabs tabs={HR_TABS} label="nav.hr" />
      {data.error !== undefined ? <ErrorState message={data.error} /> : <StaffDirectory staff={data.data[0]} designations={data.data[1]} departments={data.data[2].map((x) => ({ id: x.id, name: x.name }))} />}
    </>
  );
}
