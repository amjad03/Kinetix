import type { Metadata } from 'next';
import { ObeTabs, ProgramYearBar, StudentAttainment } from '@/components/obe/ObeDepth';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import type { StudentWise } from '@/lib/obe';
import { getI18n } from '@/i18n/server';
import { obePicks } from '../picks';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('obe2.tab.students') };
}

/** Student-wise CO attainment of a course in a year. */
export default async function ObeStudentsPage({ searchParams }: { searchParams: Promise<{ programId?: string; academicYearId?: string; subjectId?: string }> }) {
  await requireSection('obe');
  const { t } = await getI18n();
  const picks = await obePicks(await searchParams);
  const head = (
    <>
      <PageHeader title={t('obe2.tab.students')} subtitle={t('obe2.sw.sub')} />
      <ObeTabs value="students" />
    </>
  );
  if (picks.error !== undefined) return <>{head}<ErrorState message={picks.error} /></>;
  if (!picks.programId || !picks.yearId || !picks.subjectId) return <>{head}<ErrorState message={t('obe.noSubject')} /></>;
  const data = await load(() => api<StudentWise>(`/v1/obe/programs/${picks.programId}/attainment/students?academicYearId=${picks.yearId}&subjectId=${picks.subjectId}`));
  return (
    <>
      {head}
      <ProgramYearBar base="/obe/students" programs={picks.programs} programId={picks.programId} years={picks.years} yearId={picks.yearId} subjects={picks.subjects} subjectId={picks.subjectId} />
      {data.error !== undefined ? <ErrorState message={data.error} /> : <StudentAttainment data={data.data} />}
    </>
  );
}
