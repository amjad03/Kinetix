import MenuBookOutlined from '@mui/icons-material/MenuBookOutlined';
import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';
import { PageHeader, SectionTitle } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/States';
import { Library } from '@/components/syllabus/Library';
import { SubjectLinks } from '@/components/syllabus/SubjectLinks';
import { canLinkSubjects } from '@/lib/access';
import { api, load, requireSection } from '@/lib/api';
import { institutionSubjects } from '@/lib/syllabus';
import type { Course, Curriculum } from '@/lib/types';

export const metadata: Metadata = { title: 'Syllabus' };

export default async function SyllabusPage({ searchParams }: { searchParams: Promise<{ curriculum?: string }> }) {
  const me = await requireSection('syllabus');
  const [curricula, courses, subjects] = await Promise.all([
    load(() => api<Curriculum[]>('/v1/content/curricula')),
    load(() => api<Course[]>('/v1/content/courses')),
    load(institutionSubjects),
  ]);
  const { curriculum } = await searchParams;
  const selected = curricula.data?.some((c) => c.code === curriculum) ? curriculum : undefined;
  const shown = (courses.data ?? []).filter((c) => !selected || c.curriculumCode === selected);
  const linkedTo = new Map<string, string[]>();
  for (const s of subjects.data ?? []) if (s.courseId) linkedTo.set(s.courseId, [...(linkedTo.get(s.courseId) ?? []), s.name]);

  return (
    <>
      <PageHeader title="Syllabus" subtitle="The KINETIX content library behind the board's Books panel and KINETIX AI, and your own topics on top of it" />

      <SectionTitle flush>Your subjects</SectionTitle>
      <Typography variant="body2" color="text.secondary" sx={{ mt: -1, mb: 2, maxWidth: 760 }}>
        Link each subject to its course so teachers find the right chapters on the board and KINETIX AI answers from your syllabus.
      </Typography>
      {subjects.error !== undefined || courses.error !== undefined ? (
        <ErrorState message={subjects.error ?? courses.error ?? ''} />
      ) : subjects.data.length === 0 ? (
        <EmptyState dense icon={<MenuBookOutlined />} title="No subjects on the timetable this week">
          Subjects appear here once they are on the timetable.
        </EmptyState>
      ) : (
        <SubjectLinks subjects={subjects.data} courses={courses.data} curricula={curricula.data ?? []} canLink={!!me && canLinkSubjects(me.roles)} />
      )}

      <SectionTitle>Library</SectionTitle>
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
