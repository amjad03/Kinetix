import { ExamsTabs } from '@/components/exams/ExamsTabs';
import type { Metadata } from 'next';
import { AssessmentsTable } from '@/components/results/ResultsTables';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { PublishedChip } from '@/components/results/PublishedChip';
import { EmptyState, ErrorState } from '@/components/States';
import { UrlSelect } from '@/components/UrlSelect';
import { load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import { formatMarks } from '@/lib/results';
import { resultClasses } from '@/lib/results-data';

import { ChevronRight, ClipboardCheck as GradingOutlined } from 'lucide-react';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.results') };
}

export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  const me = await requireSection('results');
  const sp = await searchParams;
  const classes = await load(resultClasses);
  const list = classes.data ?? [];
  const klass = list.find((c) => c.id === sp.class) ?? list.find((c) => c.assessments.length > 0) ?? list[0];
  const rows = klass?.assessments ?? [];
  const published = rows.filter((a) => a.publishedAt).length;
  const { t, fmt } = await getI18n();

  return (
    <>
      <PageHeader
        title={t('nav.results')}
        subtitle={t('results.subtitle')}
        actions={
          list.length > 0 && klass ? (
            <UrlSelect label={t('results.class')} param="class" value={klass.id} options={list.map((c) => ({ value: c.id, label: c.name }))} testId="results-class" />
          ) : undefined
        }
      />
      <ExamsTabs current="results" roles={me?.roles} />
      {classes.error !== undefined ? (
        <ErrorState message={classes.error} />
      ) : !klass ? (
        <EmptyState icon={<GradingOutlined />} title={t('results.noClasses')} testId="no-result-classes">
          {t('results.noClassesBody')}
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState icon={<GradingOutlined />} title={t('results.noAssessments', { name: klass.name })} testId="no-assessments">
          {t('results.noAssessmentsBody')}
        </EmptyState>
      ) : (
        <>
          <p className="text-[13px] leading-[19px] text-muted-foreground mb-3" data-testid="results-summary">
            {t('results.summary', { name: klass.name, students: klass.students, assessments: t.plural('results.assessments', rows.length), published })}
          </p>
          <div className="hidden md:block">
            <AssessmentsTable rows={rows} />
          </div>
          <div className="grid md:hidden gap-3">
            {rows.map((a) => (
              <div className="border border-border rounded-[12px] p-4" key={a.id}>
                <div className="flex justify-between gap-2">
                  <h6 className="text-base tracking-[0.1px] font-medium leading-[1.3]">
                    {a.title}
                  </h6>
                  <PublishedChip publishedAt={a.publishedAt} />
                </div>
                <p className="text-[13px] leading-[19px] text-muted-foreground">
                  {a.subject.name} · {fmt.date(a.heldOn, 'short')}
                </p>
                <p className="text-[13px] leading-[19px] mt-2">
                  {t('results.averageLine', { avg: a.average === null ? '—' : `${formatMarks(a.average)} / ${formatMarks(a.maxMarks)}`, n: a.entered, d: a.classSize })}
                </p>
                <LinkButton className="mt-2 -ml-2" href={`/results/${a.id}`} size="small" endIcon={<ChevronRight />}>
                  {t('results.marks')}
                </LinkButton>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
