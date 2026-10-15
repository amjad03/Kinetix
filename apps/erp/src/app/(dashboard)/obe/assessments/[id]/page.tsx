import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ObeTabs } from '@/components/obe/ObeDepth';
import { MarksGrid, PaperEditor } from '@/components/obe/QuestionMarks';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { StatusPill } from '@/components/ui';
import { api, load, requireSection } from '@/lib/api';
import { safe } from '@/lib/depth-ui';
import { getI18n } from '@/i18n/server';
import type { CourseAssessment, Paper } from '@/lib/obe-flagship';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('of.grid.page') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An assessment's question paper tagged to COs and Bloom levels, and its question-wise marks (grid, paste from Excel, sheet upload). */
export default async function AssessmentQuestionsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSection('obe');
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { t } = await getI18n();
  const paper = await load(() => api<Paper>(`/v1/obe/assessments/${id}/questions`));
  if (paper.error !== undefined) return <><PageHeader title={t('of.grid.page')} /><ErrorState message={paper.error} /></>;
  const a = paper.data.assessment;
  const yearOf = await safe(api<{ academicYears: { id: string; isCurrent: boolean }[]; sections: { id: string; academicYearId: string }[] }>('/v1/obe/structure'), null);
  const yearId = yearOf?.sections.find((s) => s.id === a.sectionId)?.academicYearId ?? '';
  const [others, qb] = await Promise.all([
    yearId ? safe(api<CourseAssessment[]>(`/v1/obe/subjects/${a.subjectId}/assessments?academicYearId=${yearId}`), []) : Promise.resolve([] as CourseAssessment[]),
    safe(api<{ id: string; title: string; subjectId: string }[]>('/v1/question-bank/papers'), []),
  ]);
  return (
    <>
      <PageHeader
        title={a.title}
        subtitle={`${a.subject} · ${a.section} · ${t('of.grid.outOf', { n: a.maxMarks })}`}
        actions={
          <>
            <StatusPill tone={a.evidence === 'see' ? 'info' : 'neutral'}>{t(a.evidence === 'see' ? 'of.ev.see' : 'of.ev.cie')}</StatusPill>
            <LinkButton href={`/obe/courses/${a.subjectId}?tab=assessments${yearId ? `&academicYearId=${yearId}` : ''}`} variant="outlined">
              {t('of.grid.back')}
            </LinkButton>
          </>
        }
      />
      <ObeTabs value="courses" />
      <div className="flex flex-col gap-6">
        <PaperEditor key={`p:${paper.data.questions.map((q) => q.id).join(',')}`} paper={paper.data} others={others.filter((o) => o.id !== id && o.questions > 0).map((o) => ({ id: o.id, title: o.title, section: o.section }))} qbPapers={qb.filter((p) => p.subjectId === a.subjectId).map((p) => ({ id: p.id, title: p.title }))} />
        <MarksGrid key={`g:${paper.data.students.map((s) => `${s.id}${s.total}`).join(',')}`} paper={paper.data} />
      </div>
    </>
  );
}
