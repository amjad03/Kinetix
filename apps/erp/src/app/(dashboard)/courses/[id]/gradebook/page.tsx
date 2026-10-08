import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { GradebookDesk } from '@/components/lms/GradebookDesk';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import type { Gradebook } from '@/lib/lms';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('lms.gradebook') };
}

export default async function GradebookPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSection('courses');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { t } = await getI18n();
  const data = await load(() => api<Gradebook>(`/v1/lms/courses/${id}/gradebook`));
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  return (
    <>
      <PageHeader
        title={t('lms.gradebookOf', { course: data.data.course.title })}
        actions={
          <>
            <LinkButton href={`/courses/${id}`} variant="text">{t('lms.course')}</LinkButton>
            <LinkButton href={`/api/download?kind=gradebook&id=${id}`} variant="outlined">{t('lms.export')}</LinkButton>
          </>
        }
      />
      <GradebookDesk courseId={id} book={data.data} />
    </>
  );
}
