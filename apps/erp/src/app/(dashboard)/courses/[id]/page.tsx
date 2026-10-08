import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CourseDesk } from '@/components/lms/CourseDesk';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import type { LmsCourse } from '@/lib/lms';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.courses') };
}

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  await requireSection('courses');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { t } = await getI18n();
  const data = await load(() => api<LmsCourse>(`/v1/lms/courses/${id}`));
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  const c = data.data;
  return (
    <>
      <PageHeader title={c.title} subtitle={`${c.section} · ${c.subject}`} actions={<LinkButton href={`/courses/${id}/gradebook`} variant="outlined">{t('lms.gradebook')}</LinkButton>} />
      <CourseDesk course={c} />
    </>
  );
}
