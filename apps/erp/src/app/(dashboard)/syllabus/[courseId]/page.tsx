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
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('syl.course') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const me = await requireSection('syllabus');
  const { courseId } = await params;
  const { t } = await getI18n();
  const [course, curricula] = await Promise.all([
    UUID.test(courseId) ? load(() => api<CourseOutline>(`/v1/content/courses/${courseId}`)) : Promise.resolve({ error: t('syl.courseNotFound'), data: undefined }),
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
          {t('nav.syllabus')}
        </LinkButton>
      </Box>
      {course.error !== undefined ? (
        <ErrorState title={t('syl.cantOpen')} message={course.error} />
      ) : (
        <>
          <PageHeader
            title={c!.title}
            subtitle={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
                <span>
                  {t('syl.counts', { curriculum: curriculum ?? '', chapters: c!.chapters.length, topics })}
                  {own ? ` ${t('syl.yours', { n: own })}` : ''}
                </span>
                <ReviewChip reviewed={c!.reviewed} />
              </Box>
            }
          />
          {!c!.reviewed && (
            <Alert severity="info" variant="outlined" sx={{ mb: 3, borderColor: 'm3.outlineVariant' }}>
              {t('syl.unreviewedAlert')}
            </Alert>
          )}
          <CourseOutlineView course={c!} canEdit={!!me && canEditTopics(me.roles)} />
        </>
      )}
    </>
  );
}
