import MenuBookOutlined from '@mui/icons-material/MenuBookOutlined';
import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';
import { PageHeader, SectionTitle } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/States';
import { Library } from '@/components/syllabus/Library';
import { SubjectLinks } from '@/components/syllabus/SubjectLinks';
import { canLinkSubjects } from '@/lib/access';
import { api, load, requireSection } from '@/lib/api';
import { subjectLinks } from '@/lib/syllabus';
import type { Course, Curriculum, Structure } from '@/lib/types';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.syllabus') };
}

export default async function SyllabusPage({ searchParams }: { searchParams: Promise<{ curriculum?: string }> }) {
  const me = await requireSection('syllabus');
  const [curricula, courses, subjects] = await Promise.all([
    load(() => api<Curriculum[]>('/v1/content/curricula')),
    load(() => api<Course[]>('/v1/content/courses')),
    load(async () => subjectLinks(await api<Structure>('/v1/admin/structure'))),
  ]);
  const { curriculum } = await searchParams;
  const selected = curricula.data?.some((c) => c.code === curriculum) ? curriculum : undefined;
  const shown = (courses.data ?? []).filter((c) => !selected || c.curriculumCode === selected);
  const { t } = await getI18n();
  const linkedTo = new Map<string, string[]>();
  for (const s of subjects.data ?? []) if (s.courseId) linkedTo.set(s.courseId, [...(linkedTo.get(s.courseId) ?? []), s.name]);

  return (
    <>
      <PageHeader title={t('nav.syllabus')} subtitle={t('syl.subtitle')} />

      <SectionTitle flush>{t('syl.yourSubjects')}</SectionTitle>
      <Typography variant="body2" color="text.secondary" sx={{ mt: -1, mb: 2, maxWidth: 760 }}>
        {t('syl.yourSubjectsHelp')}
      </Typography>
      {subjects.error !== undefined || courses.error !== undefined ? (
        <ErrorState message={subjects.error ?? courses.error ?? ''} />
      ) : subjects.data.length === 0 ? (
        <EmptyState dense icon={<MenuBookOutlined />} title={t('syl.noSubjects')}>
          {t('syl.noSubjectsBody')}
        </EmptyState>
      ) : (
        <SubjectLinks subjects={subjects.data} courses={courses.data} curricula={curricula.data ?? []} canLink={!!me && canLinkSubjects(me.roles)} />
      )}

      <SectionTitle>{t('syl.library')}</SectionTitle>
      {curricula.error !== undefined || courses.error !== undefined ? (
        <ErrorState message={curricula.error ?? courses.error ?? ''} />
      ) : (
        <Library
          curricula={curricula.data}
          courses={shown}
          selected={selected ?? ''}
          usedBy={Object.fromEntries(linkedTo)}
        />
      )}
    </>
  );
}
