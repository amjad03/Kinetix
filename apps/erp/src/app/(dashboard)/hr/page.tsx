import type { Metadata } from 'next';
import { HR_TABS, SectionTabs } from '@/components/hr/Common';
import { StaffDirectory, type StaffRow } from '@/components/hr/StaffDirectory';
import { InsightCard } from '@/components/ai/InsightCard';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, ApiError, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { Designation } from '@/lib/hr-types';
import { loadRecords } from '@/lib/records-server';
import type { AdminDepartment } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.hr') };
}

export default async function HrPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('hr');
  const { t } = await getI18n();
  const staff = await loadRecords<StaffRow>('staff', await searchParams);
  const data = await load(() => Promise.all([api<Designation[]>('/v1/hr/designations'), api<AdminDepartment[]>('/v1/admin/departments').catch((e: unknown) => {
      // Setting up departments is for the principal and administrator; HR sees the staff list without the department choices.
      if (e instanceof ApiError && e.status === 403) return [] as AdminDepartment[];
      throw e;
    })]));
  return (
    <>
      <PageHeader title={t('nav.hr')} subtitle={t('hr.staff.subtitle')} />
      <SectionTabs tabs={HR_TABS} label="nav.hr" />
      <InsightCard kind="hr" />
      {data.error !== undefined || staff.error !== undefined ? (
        <ErrorState message={(data.error ?? staff.error)!} />
      ) : (
        <StaffDirectory meta={staff.data.meta} page={staff.data.page} state={staff.data.state} designations={data.data[0]} departments={data.data[1].map((x) => ({ id: x.id, name: x.name }))} />
      )}
    </>
  );
}
