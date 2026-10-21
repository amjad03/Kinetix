import type { Metadata } from 'next';
import { BookOpen } from 'lucide-react';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/States';
import { UrlSelect } from '@/components/UrlSelect';
import { LibraryDesk } from '@/components/zynetix/LibraryDesk';
import { PendingMaterials } from '@/components/zynetix/PendingMaterials';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { Structure } from '@/lib/types';
import { coverage, type PendingMaterial, type SubjectOutline } from '@/lib/zynetix';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.zxLibrary') };
}

/** Content library: subject → unit → topic, with each topic's videos and materials. */
export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  await requireSection('zynetix');
  const { t } = await getI18n();
  const sp = await searchParams;
  const [structure, animations, pending] = await Promise.all([
    load(() => api<Structure>('/v1/admin/structure')),
    load(() => api<{ id: string; title: string }[]>('/v1/topics/animations')),
    load(() => api<PendingMaterial[]>('/v1/topic-materials/pending')),
  ]);
  if (structure.error !== undefined) return <ErrorState message={structure.error} />;
  const programs = new Map(structure.data.programs.map((p) => [p.id, p.name]));
  const subjects = [...structure.data.subjects].sort((a, b) => (programs.get(a.programId) ?? '').localeCompare(programs.get(b.programId) ?? '') || a.term - b.term || a.name.localeCompare(b.name));
  const subject = subjects.find((s) => s.id === sp.subject) ?? subjects.find((s) => s.courseId) ?? subjects[0];
  const outline = subject ? await load(() => api<SubjectOutline>(`/v1/subjects/${subject.id}/outline`)) : null;
  const cov = outline?.data ? coverage([outline.data]) : null;

  return (
    <>
      <PageHeader title={t('nav.zxLibrary')} subtitle={t('zx.lib.subtitle')} actions={<LinkButton href="/zynetix/youtube" variant="outlined">{t('nav.zxYoutube')}</LinkButton>} />
      {pending.data && <PendingMaterials items={pending.data} />}
      {subjects.length === 0 ? (
        <EmptyState icon={<BookOpen />} title={t('zx.lib.noSubjects')}>
          {t('zx.lib.noSubjectsBody')}
        </EmptyState>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-4">
            <UrlSelect
              label={t('zx.lib.subject')}
              param="subject"
              value={subject!.id}
              minWidth={320}
              testId="zx-subject"
              options={subjects.map((s) => ({ value: s.id, label: `${s.code} · ${s.name}${s.courseId ? '' : ` (${t('zx.lib.notLinked')})`}`, group: `${programs.get(s.programId) ?? ''} · ${t('zx.term', { n: s.term })}` }))}
            />
            {cov && cov.pct !== null && <p className="pb-2 text-sm text-muted-foreground" data-testid="zx-subject-coverage">{t('zx.lib.coverage', { covered: cov.covered, topics: cov.topics, pct: cov.pct })}</p>}
          </div>
          {!outline || outline.error !== undefined ? (
            <ErrorState message={outline?.error ?? ''} />
          ) : !outline.data.course ? (
            <EmptyState icon={<BookOpen />} title={t('zx.lib.noCourse')} actions={<LinkButton href="/syllabus" variant="contained">{t('nav.syllabus')}</LinkButton>}>
              {t('zx.lib.noCourseBody')}
            </EmptyState>
          ) : (
            <LibraryDesk
              scope="institution"
              videosHref={`/topic-videos/${outline.data.course.id}`}
              animations={animations.data ?? []}
              chapters={outline.data.course.chapters.map((c) => ({ id: c.id, title: c.title, topics: c.topics.map((tp) => ({ id: tp.id, title: tp.title, videos: tp.counts.videos, materials: tp.counts.materials + tp.counts.animations })) }))}
            />
          )}
        </>
      )}
    </>
  );
}
