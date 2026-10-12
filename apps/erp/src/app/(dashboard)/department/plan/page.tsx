import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { LessonPlanBadges } from '@/components/department/LessonPlanBadges';
import { ReviewLessonPlan } from '@/components/department/ReviewLessonPlan';
import { Hint } from '@/components/Hint';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader, SectionTitle } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/States';
import type { I18n } from '@/i18n/format';
import { getI18n } from '@/i18n/server';
import { canReviewLessonPlans } from '@/lib/access';
import { api, load, requireSection } from '@/lib/api';
import { addDays } from '@/lib/dates';
import { rangeText } from '@/lib/department';
import { mondayOf, planChip, planWeeks, totalMinutes, weekFrom, weekRange, type PlanWeek, type TopicState } from '@/lib/plans';
import { schoolToday } from '@/lib/school';
import type { LessonPlan, LessonPlanList, Structure, YearPlan } from '@/lib/types';

import { Chip, Typography } from '@/components/kx';
import { ArrowLeft as ArrowBack, ChevronLeft, ChevronRight, Circle as RadioButtonUnchecked, CircleAlert as ErrorOutline, CircleCheck as CheckCircle, Clock as ScheduleOutlined, Columns3 as ViewWeekOutlined, NotebookText as EventNoteOutlined } from 'lucide-react';
import { cn } from '@/lib/utils';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('plan.title') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One class's plans for a subject: the year plan week by week (GET /v1/year-plans) and the lesson
 * plans of a chosen week (GET /v1/lesson-plans), which heads of department and the principal review.
 */
export default async function ClassPlanPage({ searchParams }: { searchParams: Promise<{ section?: string; subject?: string; week?: string }> }) {
  const me = await requireSection('department');
  const i18n = await getI18n();
  const { t } = i18n;
  const { section, subject, week: weekParam } = await searchParams;
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

  const today = schoolToday();
  const week = weekFrom(weekParam, today);
  const { from, to } = weekRange(week);
  const q = `sectionId=${section}&subjectId=${subject}`;
  const data = await load(async () => {
    const [plan, lessons, structure] = await Promise.all([
      api<YearPlan | null>(`/v1/year-plans?${q}`),
      api<LessonPlanList>(`/v1/lesson-plans?${q}&from=${from}&to=${to}`),
      api<Structure>('/v1/admin/structure'),
    ]);
    return { plan, lessons, section: structure.sections.find((s) => s.id === section), subject: structure.subjects.find((s) => s.id === subject) };
  });
  if (data.error !== undefined)
    return (
      <>
        {back}
        <PageHeader title={t('plan.title')} />
        <ErrorState message={data.error} />
      </>
    );

  const { plan, lessons } = data.data;
  const title = [data.data.section?.displayName, data.data.subject?.name].filter(Boolean).join(' · ');
  const href = (w: string) => `/department/plan?section=${section}&subject=${subject}&week=${w}`;
  const canReview = !!me && canReviewLessonPlans(me.roles);

  return (
    <>
      {back}
      <PageHeader title={title || t('plan.title')} subtitle={t('plan.title')} />

      <SectionTitle flush>{t('plan.col.yearPlan')}</SectionTitle>
      {plan ? (
        <YearPlanView plan={plan} today={today} selected={week} href={href} i18n={i18n} />
      ) : (
        <EmptyState dense icon={<EventNoteOutlined />} title={t('plan.none')} testId="no-year-plan">
          {t('plan.noneBody')}
        </EmptyState>
      )}

      <div className="scroll-mt-[80px]" id="lessons">
        <SectionTitle
          action={
            <div className="flex items-center gap-1 flex-wrap" data-testid="week-nav">
              <LinkButton href={`${href(addDays(week, -7))}#lessons`} size="small" startIcon={<ChevronLeft />}>
                {t('plan.lessons.prev')}
              </LinkButton>
              {week !== mondayOf(today) && (
                <LinkButton href={`${href(mondayOf(today))}#lessons`} size="small">
                  {t('plan.thisWeek')}
                </LinkButton>
              )}
              <LinkButton href={`${href(addDays(week, 7))}#lessons`} size="small" endIcon={<ChevronRight />}>
                {t('plan.lessons.next')}
              </LinkButton>
            </div>
          }
        >
          {t('plan.lessons.title')}
        </SectionTitle>
      </div>
      <p className="text-[13px] leading-[19px] text-muted-foreground mb-3 -mt-2" data-testid="lessons-week">
        {t('plan.week', { date: i18n.fmt.date(week, 'day') })} · {rangeText({ from, to }, i18n.locale)}
        {lessons.plans.length > 0 && <> · {t.plural('plan.lessons.count', lessons.plans.length)}</>}
      </p>
      {lessons.plans.length === 0 ? (
        <EmptyState dense icon={<ViewWeekOutlined />} title={t('plan.lessons.none')} testId="no-lesson-plans">
          {t('plan.lessons.noneBody')}
        </EmptyState>
      ) : (
        <div className="grid gap-4">
          {lessons.plans.map((p) => (
            <LessonPlanCard key={p.id} p={p} canReview={canReview} i18n={i18n} />
          ))}
        </div>
      )}
    </>
  );
}

function YearPlanView({ plan, today, selected, href, i18n }: { plan: YearPlan; today: string; selected: string; href: (week: string) => string; i18n: I18n }) {
  const { t, fmt } = i18n;
  const p = plan.progress;
  const chip = planChip(p, t);
  const weeks = planWeeks(plan, today);
  return (
    <>
      <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mb-3" data-testid="year-plan-summary">
        <Chip className={cn('font-medium', chip.status === 'behind' ? 'bg-red-soft text-red-ink' : chip.tone === 'good' ? 'bg-green-soft text-green-ink' : '')}
          size="small"
          label={chip.label}
          data-testid="plan-status"
          data-status={chip.status}
          variant={chip.tone === 'none' ? 'outlined' : 'filled'}
        />
        <p className="text-[13px] leading-[19px] ml-1 tabular-nums">
          {t('plan.taught', { covered: p.covered, total: p.total })}
        </p>
        <p className="text-[13px] leading-[19px] text-muted-foreground tabular-nums">
          · {t.plural('plan.expected', p.expected)} · {t('plan.runs', { range: rangeText({ from: plan.startsOn, to: plan.endsOn }, i18n.locale) })}
        </p>
      </div>
      <ol className="list-none m-0 p-0 overflow-hidden rounded-[12px] border" data-testid="year-plan">
        {weeks.map((w, i) => (
          <WeekRow key={w.weekOf} w={w} first={i === 0} selected={w.weekOf === selected} href={href(w.weekOf)} t={t} fmt={fmt} />
        ))}
      </ol>
    </>
  );
}

function WeekRow({ w, first, selected, href, t, fmt }: { w: PlanWeek; first: boolean; selected: boolean; href: string; t: I18n['t']; fmt: I18n['fmt'] }) {
  return (
    <li className={cn('grid grid-cols-[1fr] md:grid-cols-[220px_minmax(0,1fr)] gap-2 md:gap-4 pr-4 py-3 border-border border-l-teal', first ? 'border-t-0' : 'border-t', w.thisWeek ? 'bg-secondary' : '', w.thisWeek ? 'text-secondary-foreground' : '', w.thisWeek ? 'border-l-4' : 'border-l-0', w.thisWeek ? 'pl-3' : 'pl-4')}
      data-testid="plan-week"
      data-week={w.weekOf}
      data-this-week={w.thisWeek ? 'true' : 'false'}
      aria-current={w.thisWeek ? 'date' : undefined}
    >
      <div className="min-w-0">
        <h6 className="text-sm leading-5 font-medium tracking-[0.1px] flex items-center gap-2 flex-wrap">
          {t('plan.week', { date: fmt.date(w.weekOf, 'dayMonth') })}
          {w.thisWeek && <Chip className="h-[20px] text-[12px]" size="small" label={t('plan.thisWeek')} color="primary" data-testid="this-week" />}
        </h6>
        <LinkButton className="-ml-1.5 mt-0.5 min-h-[28px] py-0"
          href={`${href}#lessons`}
          size="small"
          variant={selected ? 'outlined' : 'text'}
          aria-label={t('plan.week.lessons', { date: fmt.date(w.weekOf, 'day') })}
          aria-current={selected ? 'true' : undefined}
        >
          {t('plan.col.lessonPlans')}
        </LinkButton>
      </div>
      {w.items.length === 0 ? (
        <p className="text-[13px] leading-[19px] text-muted-foreground self-center">
          {t('plan.week.empty')}
        </p>
      ) : (
        <ul className="list-none m-0 p-0 grid gap-2">
          {w.items.map((it) => (
            <li className="flex gap-2.5 items-start min-w-0" key={it.topicId} data-testid="plan-topic" data-state={it.state}>
              <TopicIcon state={it.state} />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] leading-[19px] font-medium">
                  {it.title}
                </p>
                <Typography className={cn(w.thisWeek ? 'opacity-[0.8]' : 'opacity-[1]')} variant="caption" color={w.thisWeek ? 'inherit' : 'text.secondary'} component="div">
                  {it.chapter} · {t.plural('plan.periods', it.periods)}
                </Typography>
              </div>
              <TopicStateChip state={it.state} coveredOn={it.coveredOn} t={t} fmt={fmt} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function TopicIcon({ state }: { state: TopicState }) {
  if (state === 'taught') return <CheckCircle className="text-green-ink  mt-0.5 size-[18px] shrink-0" />;
  if (state === 'late') return <ErrorOutline className="text-red-ink  mt-0.5 size-[18px] shrink-0" />;
  if (state === 'due') return <ScheduleOutlined className="text-teal-ink  mt-0.5 size-[18px] shrink-0" />;
  return <RadioButtonUnchecked className="text-faint  mt-0.5 size-[18px] shrink-0" />;
}

function TopicStateChip({ state, coveredOn, t, fmt }: { state: TopicState; coveredOn: string | null; t: I18n['t']; fmt: I18n['fmt'] }) {
  const base = { size: 'small' as const, className: 'h-[22px] shrink-0 font-medium' };
  switch (state) {
    case 'taught':
      return <Chip {...base} className="h-[22px] shrink-0 font-medium bg-green-soft text-green-ink" label={t('plan.topic.taught', { date: fmt.date(coveredOn!, 'dayMonth') })} data-testid="topic-taught" />;
    case 'late':
      return (
        <Hint title={t('plan.topic.lateHelp')}>
          <Chip {...base} className="h-[22px] shrink-0 font-medium bg-red-soft text-red-ink" label={t('plan.topic.late')} data-testid="topic-late" />
        </Hint>
      );
    case 'due':
      return <Chip {...base} label={t('plan.topic.due')} color="primary" variant="outlined" />;
    default:
      return <Chip {...base} className="h-[22px] shrink-0 font-medium text-muted-foreground" label={t('plan.topic.planned')} variant="outlined" />;
  }
}

function LessonPlanCard({ p, canReview, i18n }: { p: LessonPlan; canReview: boolean; i18n: I18n }) {
  const { t, fmt } = i18n;
  const c = p.content;
  const minutes = totalMinutes(c.steps);
  return (
    <article className="bg-card overflow-hidden rounded-[12px] border" data-testid="lesson-plan" data-reviewed={p.reviewedAt ? 'true' : 'false'} aria-labelledby={`lp-${p.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border">
        <div className="min-w-0">
          <h3 className="text-base leading-6 tracking-[0.1px] font-medium" id={`lp-${p.id}`}>
            {fmt.date(p.date, 'long')}
          </h3>
          <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
            {p.teacher}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <LessonPlanBadges aiDrafted={p.aiDrafted} reviewedAt={p.reviewedAt} reviewedBy={p.reviewedBy} />
          {canReview && <ReviewLessonPlan id={p.id} date={p.date} reviewed={!!p.reviewedAt} remark={p.reviewRemark} />}
        </div>
      </div>
      {p.reviewRemark && (
        <p className="text-[13px] leading-[19px] px-4 py-2 bg-muted border-b border-border wrap-anywhere" data-testid="review-remark">
          {t('plan.lesson.remark', { remark: p.reviewRemark })}
        </p>
      )}
      <div className="grid grid-cols-[1fr] md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-4 md:gap-6 p-4">
        <div className="grid gap-4 content-start min-w-0">
          <Part title={t('plan.lesson.topics')}>
            {p.topics.length ? (
              <div className="flex gap-1.5 flex-wrap">
                {p.topics.map((tp) => (
                  <Chip className="max-w-full" key={tp.id} size="small" label={tp.title} data-testid="lesson-topic" />
                ))}
              </div>
            ) : (
              <Dash />
            )}
          </Part>
          <Part title={t('plan.lesson.objectives')}>
            <Bullets items={c.objectives} testId="lesson-objectives" />
          </Part>
          <Part title={t('plan.lesson.steps')} aside={minutes ? t('plan.lesson.totalMinutes', { n: minutes }) : undefined}>
            {c.steps.length ? (
              <ol className="m-0 p-0 list-none grid gap-1.5" data-testid="lesson-steps">
                {c.steps.map((s, i) => (
                  <li className="grid grid-cols-[28px_64px_minmax(0,1fr)] items-baseline" key={i}>
                    <p className="text-[13px] leading-[19px] text-muted-foreground tabular-nums">
                      {i + 1}.
                    </p>
                    <p className="text-[13px] leading-[19px] text-teal-ink font-medium whitespace-nowrap tabular-nums" data-testid="step-minutes">
                      {t('plan.lesson.minutes', { n: s.minutes })}
                    </p>
                    <p className="text-[13px] leading-[19px] wrap-anywhere">
                      {s.activity}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <Dash />
            )}
          </Part>
        </div>
        <div className="grid gap-4 content-start min-w-0">
          <Part title={t('plan.lesson.materials')}>
            <Bullets items={c.materials} testId="lesson-materials" />
          </Part>
          <Part title={t('plan.lesson.assessment')}>
            <Text value={c.assessment} testId="lesson-assessment" />
          </Part>
          <Part title={t('plan.lesson.homework')}>
            <Text value={c.homework} testId="lesson-homework" />
          </Part>
        </div>
      </div>
    </article>
  );
}

function Part({ title, aside, children }: { title: string; aside?: string; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <h4 className="text-[11px] font-medium text-muted-foreground flex gap-2 items-baseline leading-[20px] tracking-[0.04em] mb-1">
        {title}
        {aside && (
          <span className="text-xs leading-4 normal-case tracking-[0px] tabular-nums">
            · {aside}
          </span>
        )}
      </h4>
      {children}
    </section>
  );
}

const Dash = () => (
  <p className="text-[13px] leading-[19px] text-muted-foreground">
    —
  </p>
);

function Bullets({ items, testId }: { items: string[]; testId: string }) {
  if (!items.length) return <Dash />;
  return (
    <ul className="m-0 pl-5 grid gap-0.5" data-testid={testId}>
      {items.map((x, i) => (
        <li className="text-[13px] leading-[19px] wrap-anywhere" key={i}>
          {x}
        </li>
      ))}
    </ul>
  );
}

function Text({ value, testId }: { value: string; testId: string }) {
  if (!value.trim()) return <Dash />;
  return (
    <p className="text-[13px] leading-[19px] whitespace-pre-line wrap-anywhere" data-testid={testId}>
      {value}
    </p>
  );
}
