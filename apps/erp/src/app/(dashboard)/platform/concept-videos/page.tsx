import OndemandVideoOutlined from '@mui/icons-material/OndemandVideoOutlined';
import SearchOff from '@mui/icons-material/SearchOff';
import { StatusPill } from '@/components/ui';
import type { Metadata } from 'next';
import { PageHeader, SectionTitle } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/States';
import { CourseCoverageList, TopicHits, VideoSearch } from '@/components/platform/VideoLibrary';
import { api, load, requirePlatformAdmin } from '@/lib/api';
import type { PlatformLibraryCurriculum, PlatformTopicHit } from '@/lib/types';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.conceptVideos') };
}

/** Platform › Concept videos: every course of the global library and how many of its topics have videos. */
export default async function ConceptVideosPage({ searchParams }: { searchParams: Promise<{ q?: string; missing?: string }> }) {
  await requirePlatformAdmin();
  const { q = '', missing } = await searchParams;
  const missingOnly = missing === '1';
  const query = q.trim();
  const { t } = await getI18n();
  const [library, hits] = await Promise.all([
    load(() => api<PlatformLibraryCurriculum[]>('/v1/platform/library')),
    query.length >= 2 ? load(() => api<PlatformTopicHit[]>(`/v1/platform/library/search?q=${encodeURIComponent(query)}${missingOnly ? '&missing=true' : ''}`)) : Promise.resolve(null),
  ]);

  return (
    <>
      <PageHeader title={t('nav.conceptVideos')} subtitle={t('pv.subtitle')} actions={<StatusPill tone="info">{t('pv.teamOnly')}</StatusPill>} />
      <VideoSearch q={query} missingOnly={missingOnly} />

      {hits ? (
        hits.error !== undefined ? (
          <ErrorState message={hits.error} />
        ) : hits.data.length === 0 ? (
          <EmptyState dense icon={<SearchOff />} title={t('pv.noResults')}>
            {t('pv.noResultsBody')}
          </EmptyState>
        ) : (
          <TopicHits hits={hits.data} />
        )
      ) : library.error !== undefined ? (
        <ErrorState message={library.error} />
      ) : library.data.every((c) => c.courses.length === 0) ? (
        <EmptyState icon={<OndemandVideoOutlined />} title={t('pv.noCourses')} />
      ) : (
        library.data
          .filter((c) => c.courses.length > 0)
          .map((c) => (
            <section key={c.code}>
              <SectionTitle>{c.name}</SectionTitle>
              <CourseCoverageList courses={missingOnly ? c.courses.filter((x) => x.topicsWithVideos < x.topics) : c.courses} />
            </section>
          ))
      )}
    </>
  );
}
