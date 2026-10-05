import ArrowBack from '@mui/icons-material/ArrowBack';
import Box from '@mui/material/Box';
import type { Metadata } from 'next';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { CourseVideos } from '@/components/platform/CourseVideos';
import { api, load, requirePlatformAdmin } from '@/lib/api';
import { coverage } from '@/lib/concept-videos';
import type { PlatformCourseTree } from '@/lib/types';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.conceptVideos') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One course's chapters and topics: paste links per topic, reorder, remove, import playlists per chapter. */
export default async function CourseVideosPage({ params }: { params: Promise<{ courseId: string }> }) {
  await requirePlatformAdmin();
  const { courseId } = await params;
  const { t } = await getI18n();
  const [course, platform] = await Promise.all([
    UUID.test(courseId) ? load(() => api<PlatformCourseTree>(`/v1/platform/library/courses/${courseId}`)) : Promise.resolve({ error: t('pv.notFound'), data: undefined }),
    load(() => api<{ playlistImport: boolean }>('/v1/platform/me')),
  ]);
  const c = course.data;
  const cov = c ? coverage(c) : null;

  return (
    <>
      <Box sx={{ ml: -1, mb: 0.5 }}>
        <LinkButton href="/platform/concept-videos" size="small" startIcon={<ArrowBack />}>
          {t('nav.conceptVideos')}
        </LinkButton>
      </Box>
      {course.error !== undefined ? (
        <ErrorState title={t('pv.cantOpen')} message={course.error} />
      ) : (
        <>
          <PageHeader title={c!.title} subtitle={`${t('pv.term', { n: c!.term })} · ${t('pv.coverage', { with: cov!.withVideos, topics: cov!.topics })} · ${t.plural('pv.videos', cov!.videos)}`} />
          <CourseVideos course={c!} playlistImport={!!platform.data?.playlistImport} />
        </>
      )}
    </>
  );
}
