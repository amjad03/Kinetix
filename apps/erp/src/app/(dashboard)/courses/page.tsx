import type { Metadata } from 'next';
import { CoursesDesk } from '@/components/lms/CoursesDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { offeringOptions, type LmsCourseRow, type Structure } from '@/lib/lms';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.courses') };
}

export default async function CoursesPage() {
  await requireSection('courses');
  const { t } = await getI18n();
  const data = await load(async () => ({ courses: await api<LmsCourseRow[]>('/v1/lms/courses'), structure: await api<Structure>('/v1/admin/structure') }));
  return (
    <>
      <PageHeader title={t('nav.courses')} subtitle={t('lms.subtitle')} />
      {data.error !== undefined ? <ErrorState message={data.error} /> : <CoursesDesk courses={data.data.courses} offerings={offeringOptions(data.data.structure)} />}
    </>
  );
}
