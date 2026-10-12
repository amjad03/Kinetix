import type { Metadata } from 'next';
import { MiniBar } from '@/components/Bars';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader, SectionTitle } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { formatPercent } from '@/lib/department';
import type { Coverage, CourseOutline, Structure } from '@/lib/types';

import { ArrowLeft as ArrowBack, Circle as RadioButtonUnchecked, CircleCheck as CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('dept.syllabus.title') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One class's syllabus: every topic of the subject's course, and which have been taught (GET /v1/coverage). */
export default async function ClassSyllabusPage({ searchParams }: { searchParams: Promise<{ section?: string; subject?: string }> }) {
  await requireSection('department');
  const { t, fmt } = await getI18n();
  const { section, subject } = await searchParams;
  const back = (
    <div className="-ml-2 mb-1">
      <LinkButton href="/department" size="small" startIcon={<ArrowBack />}>
        {t('nav.department')}
      </LinkButton>
    </div>
  );
  if (!section || !subject || !UUID.test(section) || !UUID.test(subject))
    return (
      <>
        {back}
        <ErrorState message={t('error.NOT_FOUND')} />
      </>
    );
  const data = await load(async () => {
    const [coverage, structure] = await Promise.all([api<Coverage>(`/v1/coverage?sectionId=${section}&subjectId=${subject}`), api<Structure>('/v1/admin/structure')]);
    const subj = structure.subjects.find((s) => s.id === subject);
    const course = subj?.courseId ? await api<CourseOutline>(`/v1/content/courses/${subj.courseId}`) : null;
    return { coverage, course, subject: subj, section: structure.sections.find((s) => s.id === section) };
  });
  if (data.error !== undefined)
    return (
      <>
        {back}
        <PageHeader title={t('dept.syllabus.title')} />
        <ErrorState message={data.error} />
      </>
    );
  const { coverage, course } = data.data;
  const covered = new Map(coverage.topics.map((x) => [x.topicId, x]));
  const title = [data.data.section?.displayName, data.data.subject?.name].filter(Boolean).join(' · ');
  return (
    <>
      {back}
      <PageHeader
        title={title || t('dept.syllabus.title')}
        subtitle={
          <span className="inline-flex items-center gap-3" data-testid="syllabus-progress">
            <span className="w-[120px] inline-block">
              <MiniBar value={coverage.percent ?? 0} />
            </span>
            {t('dept.syllabus.title')}: {formatPercent(coverage.percent)} · {t('dept.syllabus.topics', { covered: coverage.covered, total: coverage.total })}
          </span>
        }
      />
      {!course || course.chapters.length === 0 ? (
        <EmptyState dense icon={<RadioButtonUnchecked />} title={course ? t('dept.syllabus.empty') : t('dept.syllabus.none')}>
          {course ? undefined : t('dept.syllabus.noneHelp')}
        </EmptyState>
      ) : (
        course.chapters.map((ch) => (
          <section key={ch.id}>
            <SectionTitle>{ch.title}</SectionTitle>
            <ul className="list-none m-0 p-0 border border-border rounded-[12px] overflow-hidden">
              {ch.topics.map((tp, i) => {
                const c = covered.get(tp.id);
                return (
                  <li className={cn('flex gap-3 items-start px-4 py-2.5 border-border', i ? 'border-t' : 'border-t-0')}
                    key={tp.id}
                    data-testid="syllabus-topic"
                    data-covered={c ? 'true' : 'false'}
                  >
                    {c ? <CheckCircle className="size-5 text-green-ink mt-[2px]" /> : <RadioButtonUnchecked className="size-5 text-faint mt-[2px]" />}
                    <div className="min-w-0">
                      <p className="text-sm leading-[21px]">{tp.title}</p>
                      <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                        {c ? t('dept.syllabus.covered', { date: fmt.date(c.coveredOn, 'day'), name: c.coveredBy }) : t('dept.syllabus.notYet')}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
