import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { YoutubeImport } from '@/components/zynetix/YoutubeImport';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { Structure } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.zxYoutube') };
}

/** YouTube channel import for the institution's own videos: the courses are the ones its subjects use. */
export default async function YoutubePage() {
  await requireSection('zynetix');
  const { t } = await getI18n();
  const structure = await load(() => api<Structure>('/v1/admin/structure'));
  if (structure.error !== undefined) return <ErrorState message={structure.error} />;
  const programs = new Map(structure.data.programs.map((p) => [p.id, p.name]));
  const seen = new Set<string>();
  const courses = structure.data.subjects
    .filter((s) => s.courseId && !seen.has(s.courseId) && seen.add(s.courseId))
    .map((s) => ({ id: s.courseId!, label: `${s.code} · ${s.name}`, group: `${programs.get(s.programId) ?? ''} · ${t('zx.term', { n: s.term })}` }));
  return (
    <>
      <PageHeader title={t('nav.zxYoutube')} subtitle={t('zx.yt.subtitle')} />
      <YoutubeImport scope="institution" courses={courses} />
    </>
  );
}
