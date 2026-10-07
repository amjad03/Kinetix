import VideoLibraryOutlined from '@mui/icons-material/VideoLibraryOutlined';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader, SectionTitle } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/States';
import { ApprovalQueue } from '@/components/topic-videos/ApprovalQueue';
import { canReviewVideos } from '@/lib/access';
import { api, load, requireSection } from '@/lib/api';
import type { Course, ManagedVideo } from '@/lib/types';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.topicVideos') };
}

/** Syllabus › Topic videos: the approval queue for the principal and admin, then the courses to add videos to. */
export default async function TopicVideosPage() {
  const me = await requireSection('topicVideos');
  const { t } = await getI18n();
  const admin = !!me && canReviewVideos(me.roles);
  const [courses, queue] = await Promise.all([
    load(() => api<Course[]>('/v1/content/courses')),
    admin ? load(() => api<ManagedVideo[]>('/v1/content/video-approvals?status=pending')) : Promise.resolve(null),
  ]);

  return (
    <>
      <PageHeader title={t('nav.topicVideos')} subtitle={admin ? t('tv.subtitle') : t('tv.subtitleTeacher')} />
      {queue && (
        <section>
          <SectionTitle>{t('tv.queue')}</SectionTitle>
          {queue.error !== undefined ? <ErrorState message={queue.error} /> : <ApprovalQueue items={queue.data} />}
        </section>
      )}
      <section>
        <SectionTitle>{t('tv.courses')}</SectionTitle>
        {courses.error !== undefined ? (
          <ErrorState message={courses.error} />
        ) : courses.data.length === 0 ? (
          <EmptyState icon={<VideoLibraryOutlined />} title={t('tv.noCourses')} />
        ) : (
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {courses.data.map((c) => (
              <Card key={c.id}>
                <CardActionArea component={Link} href={`/topic-videos/${c.id}`} sx={{ p: 2 }}>
                  <Typography sx={{ fontWeight: 500 }}>{c.title}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {c.curriculumCode} · {t('pv.term', { n: c.term })}
                  </Typography>
                </CardActionArea>
              </Card>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
