import ArrowBack from '@mui/icons-material/ArrowBack';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import type { Metadata } from 'next';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { CourseOutlineView } from '@/components/syllabus/CourseOutlineView';
import { ReviewChip } from '@/components/syllabus/ReviewChip';
import { canEditTopics } from '@/lib/access';
import { api, load, requireSection } from '@/lib/api';
import type { CourseOutline, Curriculum } from '@/lib/types';

export const metadata: Metadata = { title: 'Course' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const me = await requireSection('syllabus');
  const { courseId } = await params;
  const [course, curricula] = await Promise.all([
    UUID.test(courseId) ? load(() => api<CourseOutline>(`/v1/content/courses/${courseId}`)) : Promise.resolve({ error: 'Course not found.', data: undefined }),
    load(() => api<Curriculum[]>('/v1/content/curricula')),
  ]);
  const c = course.data;
  const curriculum = curricula.data?.find((x) => x.code === c?.curriculumCode)?.name ?? c?.curriculumCode;
  const topics = c?.chapters.reduce((n, ch) => n + ch.topics.length, 0) ?? 0;
  const own = c?.chapters.reduce((n, ch) => n + ch.topics.filter((t) => t.own).length, 0) ?? 0;

  return (
    <>
      <Box sx={{ ml: -1, mb: 0.5 }}>
        <LinkButton href="/syllabus" size="small" startIcon={<ArrowBack />}>
          Syllabus
        </LinkButton>
      </Box>
      {course.error !== undefined ? (
        <ErrorState title="Can't open this course" message={course.error} />
      ) : (
        <>
          <PageHeader
            title={c!.title}
            subtitle={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
                <span>
                  {curriculum} · {c!.chapters.length} chapters · {topics} topics{own ? ` (${own} yours)` : ''}
                </span>
                <ReviewChip reviewed={c!.reviewed} />
              </Box>
            }
          />
          {!c!.reviewed && (
            <Alert severity="info" variant="outlined" sx={{ mb: 3, borderColor: 'm3.outlineVariant' }}>
              This course has not been checked by a subject expert yet. Compare it with your university syllabus, and add your own topics where something is
              missing.
            </Alert>
          )}
          <CourseOutlineView course={c!} canEdit={!!me && canEditTopics(me.roles)} />
        </>
      )}
    </>
  );
}
