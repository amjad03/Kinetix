import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { CourseFilesDesk } from '@/components/quality/CourseFilesDesk';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import type { CourseFileOption, CourseFileRow } from '@/lib/quality';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.courseFiles') };
}

export default async function CourseFilesPage() {
  await requireSection('courseFiles');
  const { t } = await getI18n();
  const data = await load(async () => {
    const [options, files] = await Promise.all([api<CourseFileOption[]>('/v1/course-files/options'), api<CourseFileRow[]>('/v1/course-files')]);
    return { options, files };
  });
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  return (
    <>
      <PageHeader title={t('nav.courseFiles')} subtitle={t('cf.subtitle')} />
      <CourseFilesDesk options={data.data.options} files={data.data.files} />
    </>
  );
}
