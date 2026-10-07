import ArrowBack from '@mui/icons-material/ArrowBack';
import Box from '@mui/material/Box';
import type { Metadata } from 'next';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { TopicVideos } from '@/components/topic-videos/TopicVideos';
import { canReviewVideos } from '@/lib/access';
import { api, load, requireSection } from '@/lib/api';
import { uniqueClasses } from '@/lib/topic-videos';
import type { CourseOutline, TopicVideoCount } from '@/lib/types';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.topicVideos') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One course's syllabus tree with the institution's videos per topic. */
export default async function CourseTopicVideosPage({ params }: { params: Promise<{ courseId: string }> }) {
  const me = await requireSection('topicVideos');
  const { courseId } = await params;
  const { t } = await getI18n();
  const admin = !!me && canReviewVideos(me.roles);
  const ok = UUID.test(courseId);
  const [course, counts, classes] = await Promise.all([
    ok ? load(() => api<CourseOutline>(`/v1/content/courses/${courseId}`)) : Promise.resolve({ error: t('tv.notFound'), data: undefined }),
    ok ? load(() => api<TopicVideoCount[]>(`/v1/content/video-counts?courseId=${courseId}`)) : Promise.resolve({ data: [] as TopicVideoCount[] }),
    admin ? Promise.resolve({ data: [] }) : load(() => api<{ section: { id: string; displayName: string } }[]>('/v1/teacher/classes')),
  ]);

  return (
    <>
      <Box sx={{ ml: -1, mb: 0.5 }}>
        <LinkButton href="/topic-videos" size="small" startIcon={<ArrowBack />}>
          {t('nav.topicVideos')}
        </LinkButton>
      </Box>
      {course.error !== undefined ? (
        <ErrorState title={t('tv.cantOpen')} message={course.error} />
      ) : (
        <>
          <PageHeader title={course.data.title} subtitle={t('tv.counts', { topics: course.data.chapters.reduce((n, c) => n + c.topics.length, 0) })} />
          <TopicVideos course={course.data} counts={counts.data ?? []} admin={admin} classes={uniqueClasses(classes.data ?? [])} />
        </>
      )}
    </>
  );
}
