import type { Metadata } from 'next';
import { RequisitionButton } from '@/components/hr/HrFlow';
import { HR_TABS, SectionTabs } from '@/components/hr/Common';
import { HrList } from '@/components/hr/HrList';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import { api, ApiError, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import { loadRecords } from '@/lib/records-server';
import type { AdminDepartment } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('hr.tab.recruitment') };
}

const VIEWS = ['openings', 'applicants', 'interviews'] as const;
type View = (typeof VIEWS)[number];
const ENTITY = { openings: 'job-openings', applicants: 'job-applicants', interviews: 'job-interviews' } as const;

/** Recruitment: openings (and requisitions), every applicant with screening and interview scores, and the interview schedule. */
export default async function RecruitmentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('hr');
  const { t } = await getI18n();
  const sp = await searchParams;
  const view: View = VIEWS.includes(sp.view as View) ? (sp.view as View) : 'openings';
  const entity = ENTITY[view];
  const [list, departments] = await Promise.all([
    loadRecords(entity, sp),
    load(() =>
      api<AdminDepartment[]>('/v1/admin/departments').catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 403) return [] as AdminDepartment[];
        throw e;
      }),
    ),
  ]);
  return (
    <>
      <PageHeader title={t('nav.hr')} subtitle={t('hr.rec.subtitle')} actions={departments.error === undefined ? <RequisitionButton departments={departments.data.map((d) => ({ id: d.id, name: d.name }))} /> : undefined} />
      <SectionTabs tabs={HR_TABS} label="nav.hr" />
      <LinkTabs value={view} label={t('hr.tab.recruitment')} items={VIEWS.map((v) => ({ value: v, href: v === 'openings' ? '/hr/recruitment' : `/hr/recruitment?view=${v}`, label: t(`hk.rec.view.${v}`) }))} />
      {list.error !== undefined ? <ErrorState message={list.error} /> : <HrList entity={entity} data={list.data} extraParams={view === 'openings' ? {} : { view }} />}
    </>
  );
}
