import ArrowBack from '@mui/icons-material/ArrowBack';
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import CheckCircle from '@mui/icons-material/CheckCircle';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import ErrorOutline from '@mui/icons-material/ErrorOutlineOutlined';
import EventNoteOutlined from '@mui/icons-material/EventNoteOutlined';
import RadioButtonUnchecked from '@mui/icons-material/RadioButtonUnchecked';
import ScheduleOutlined from '@mui/icons-material/ScheduleOutlined';
import VerifiedOutlined from '@mui/icons-material/VerifiedOutlined';
import ViewWeekOutlined from '@mui/icons-material/ViewWeekOutlined';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
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

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('plan.title') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const num = { fontVariantNumeric: 'tabular-nums' } as const;
const frame = { border: 1, borderColor: 'm3.outlineVariant', borderRadius: '12px', overflow: 'hidden' } as const;

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
    <Box sx={{ ml: -1, mb: 0.5 }}>
      <LinkButton href="/department" size="small" startIcon={<ArrowBack />}>
        {t('nav.department')}
      </LinkButton>
    </Box>
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

      <Box id="lessons" sx={{ scrollMarginTop: 80 }}>
        <SectionTitle
          action={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }} data-testid="week-nav">
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
            </Box>
          }
        >
          {t('plan.lessons.title')}
        </SectionTitle>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, mt: -1 }} data-testid="lessons-week">
        {t('plan.week', { date: i18n.fmt.date(week, 'day') })} · {rangeText({ from, to }, i18n.locale)}
        {lessons.plans.length > 0 && <> · {t.plural('plan.lessons.count', lessons.plans.length)}</>}
      </Typography>
      {lessons.plans.length === 0 ? (
        <EmptyState dense icon={<ViewWeekOutlined />} title={t('plan.lessons.none')} testId="no-lesson-plans">
          {t('plan.lessons.noneBody')}
        </EmptyState>
      ) : (
        <Box sx={{ display: 'grid', gap: 2 }}>
          {lessons.plans.map((p) => (
            <LessonPlanCard key={p.id} p={p} canReview={canReview} i18n={i18n} />
          ))}
        </Box>
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
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 1, rowGap: 0.5, mb: 1.5 }} data-testid="year-plan-summary">
        <Chip
          size="small"
          label={chip.label}
          data-testid="plan-status"
          data-status={chip.status}
          variant={chip.tone === 'none' ? 'outlined' : 'filled'}
          sx={{
            fontWeight: 500,
            ...(chip.status === 'behind' ? { bgcolor: 'm3.errorContainer', color: 'm3.onErrorContainer' } : chip.tone === 'good' ? { bgcolor: 'kx.successContainer', color: 'kx.onSuccessContainer' } : {}),
          }}
        />
        <Typography variant="body2" sx={{ ...num, ml: 0.5 }}>
          {t('plan.taught', { covered: p.covered, total: p.total })}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={num}>
          · {t.plural('plan.expected', p.expected)} · {t('plan.runs', { range: rangeText({ from: plan.startsOn, to: plan.endsOn }, i18n.locale) })}
        </Typography>
      </Box>
      <Box component="ol" sx={{ ...frame, listStyle: 'none', m: 0, p: 0 }} data-testid="year-plan">
        {weeks.map((w, i) => (
          <WeekRow key={w.weekOf} w={w} first={i === 0} selected={w.weekOf === selected} href={href(w.weekOf)} t={t} fmt={fmt} />
        ))}
      </Box>
    </>
  );
}

function WeekRow({ w, first, selected, href, t, fmt }: { w: PlanWeek; first: boolean; selected: boolean; href: string; t: I18n['t']; fmt: I18n['fmt'] }) {
  return (
    <Box
      component="li"
      data-testid="plan-week"
      data-week={w.weekOf}
      data-this-week={w.thisWeek ? 'true' : 'false'}
      aria-current={w.thisWeek ? 'date' : undefined}
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '220px minmax(0, 1fr)' },
        gap: { xs: 1, md: 2 },
        pr: 2,
        py: 1.5,
        borderTop: first ? 0 : 1,
        borderColor: 'm3.outlineVariant',
        bgcolor: w.thisWeek ? 'm3.secondaryContainer' : undefined,
        color: w.thisWeek ? 'm3.onSecondaryContainer' : undefined,
        borderLeft: w.thisWeek ? 4 : 0,
        borderLeftColor: 'primary.main',
        pl: w.thisWeek ? 1.5 : 2,
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          {t('plan.week', { date: fmt.date(w.weekOf, 'dayMonth') })}
          {w.thisWeek && <Chip size="small" label={t('plan.thisWeek')} color="primary" sx={{ height: 20, fontSize: 12 }} data-testid="this-week" />}
        </Typography>
        <LinkButton
          href={`${href}#lessons`}
          size="small"
          variant={selected ? 'outlined' : 'text'}
          aria-label={t('plan.week.lessons', { date: fmt.date(w.weekOf, 'day') })}
          aria-current={selected ? 'true' : undefined}
          sx={{ ml: -0.75, mt: 0.25, minHeight: 28, py: 0 }}
        >
          {t('plan.col.lessonPlans')}
        </LinkButton>
      </Box>
      {w.items.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
          {t('plan.week.empty')}
        </Typography>
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1 }}>
          {w.items.map((it) => (
            <Box component="li" key={it.topicId} data-testid="plan-topic" data-state={it.state} sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start', minWidth: 0 }}>
              <TopicIcon state={it.state} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {it.title}
                </Typography>
                <Typography variant="caption" color={w.thisWeek ? 'inherit' : 'text.secondary'} component="div" sx={{ opacity: w.thisWeek ? 0.8 : 1 }}>
                  {it.chapter} · {t.plural('plan.periods', it.periods)}
                </Typography>
              </Box>
              <TopicStateChip state={it.state} coveredOn={it.coveredOn} t={t} fmt={fmt} />
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

function TopicIcon({ state }: { state: TopicState }) {
  const sx = { mt: '2px', fontSize: 18 };
  if (state === 'taught') return <CheckCircle sx={{ ...sx, color: 'kx.success' }} />;
  if (state === 'late') return <ErrorOutline sx={{ ...sx, color: 'error.main' }} />;
  if (state === 'due') return <ScheduleOutlined sx={{ ...sx, color: 'primary.main' }} />;
  return <RadioButtonUnchecked sx={{ ...sx, color: 'text.disabled' }} />;
}

function TopicStateChip({ state, coveredOn, t, fmt }: { state: TopicState; coveredOn: string | null; t: I18n['t']; fmt: I18n['fmt'] }) {
  const base = { size: 'small' as const, sx: { height: 22, flexShrink: 0, fontWeight: 500 } };
  switch (state) {
    case 'taught':
      return <Chip {...base} label={t('plan.topic.taught', { date: fmt.date(coveredOn!, 'dayMonth') })} data-testid="topic-taught" sx={{ ...base.sx, bgcolor: 'kx.successContainer', color: 'kx.onSuccessContainer' }} />;
    case 'late':
      return (
        <Hint title={t('plan.topic.lateHelp')}>
          <Chip {...base} label={t('plan.topic.late')} data-testid="topic-late" sx={{ ...base.sx, bgcolor: 'm3.errorContainer', color: 'm3.onErrorContainer' }} />
        </Hint>
      );
    case 'due':
      return <Chip {...base} label={t('plan.topic.due')} color="primary" variant="outlined" />;
    default:
      return <Chip {...base} label={t('plan.topic.planned')} variant="outlined" sx={{ ...base.sx, color: 'text.secondary' }} />;
  }
}

function LessonPlanCard({ p, canReview, i18n }: { p: LessonPlan; canReview: boolean; i18n: I18n }) {
  const { t, fmt } = i18n;
  const c = p.content;
  const minutes = totalMinutes(c.steps);
  return (
    <Box component="article" data-testid="lesson-plan" data-reviewed={p.reviewedAt ? 'true' : 'false'} aria-labelledby={`lp-${p.id}`} sx={{ ...frame, bgcolor: 'background.paper' }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, px: 2, py: 1.5, borderBottom: 1, borderColor: 'm3.outlineVariant' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" component="h3" id={`lp-${p.id}`} sx={{ fontWeight: 500 }}>
            {fmt.date(p.date, 'long')}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {p.teacher}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          {p.aiDrafted && (
            <Hint title={t('plan.lesson.aiDraftHelp')}>
              <Chip size="small" icon={<AutoAwesomeOutlined />} label={t('plan.lesson.aiDraft')} variant="outlined" data-testid="ai-draft" sx={{ '& .MuiChip-icon': { color: 'primary.main' } }} />
            </Hint>
          )}
          {p.reviewedAt ? (
            <Chip
              size="small"
              icon={<VerifiedOutlined />}
              label={t('plan.lesson.reviewed', { date: fmt.dateTime(p.reviewedAt, undefined, false) })}
              data-testid="review-status"
              sx={{ bgcolor: 'kx.successContainer', color: 'kx.onSuccessContainer', '& .MuiChip-icon': { color: 'inherit' } }}
            />
          ) : (
            <Chip size="small" label={t('plan.lesson.notReviewed')} variant="outlined" data-testid="review-status" sx={{ color: 'text.secondary' }} />
          )}
          {canReview && <ReviewLessonPlan id={p.id} date={p.date} reviewed={!!p.reviewedAt} remark={p.reviewRemark} />}
        </Box>
      </Box>
      {p.reviewRemark && (
        <Typography variant="body2" sx={{ px: 2, py: 1, bgcolor: 'kx.tonal', borderBottom: 1, borderColor: 'm3.outlineVariant', overflowWrap: 'anywhere' }} data-testid="review-remark">
          {t('plan.lesson.remark', { remark: p.reviewRemark })}
        </Typography>
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 3fr) minmax(0, 2fr)' }, gap: { xs: 2, md: 3 }, p: 2 }}>
        <Box sx={{ display: 'grid', gap: 2, alignContent: 'start', minWidth: 0 }}>
          <Part title={t('plan.lesson.topics')}>
            {p.topics.length ? (
              <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                {p.topics.map((tp) => (
                  <Chip key={tp.id} size="small" label={tp.title} data-testid="lesson-topic" sx={{ maxWidth: '100%' }} />
                ))}
              </Box>
            ) : (
              <Dash />
            )}
          </Part>
          <Part title={t('plan.lesson.objectives')}>
            <Bullets items={c.objectives} testId="lesson-objectives" />
          </Part>
          <Part title={t('plan.lesson.steps')} aside={minutes ? t('plan.lesson.totalMinutes', { n: minutes }) : undefined}>
            {c.steps.length ? (
              <Box component="ol" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gap: 0.75 }} data-testid="lesson-steps">
                {c.steps.map((s, i) => (
                  <Box component="li" key={i} sx={{ display: 'grid', gridTemplateColumns: '28px 64px minmax(0, 1fr)', alignItems: 'baseline' }}>
                    <Typography variant="body2" color="text.secondary" sx={num}>
                      {i + 1}.
                    </Typography>
                    <Typography variant="body2" color="primary.main" sx={{ ...num, fontWeight: 500, whiteSpace: 'nowrap' }} data-testid="step-minutes">
                      {t('plan.lesson.minutes', { n: s.minutes })}
                    </Typography>
                    <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                      {s.activity}
                    </Typography>
                  </Box>
                ))}
              </Box>
            ) : (
              <Dash />
            )}
          </Part>
        </Box>
        <Box sx={{ display: 'grid', gap: 2, alignContent: 'start', minWidth: 0 }}>
          <Part title={t('plan.lesson.materials')}>
            <Bullets items={c.materials} testId="lesson-materials" />
          </Part>
          <Part title={t('plan.lesson.assessment')}>
            <Text value={c.assessment} testId="lesson-assessment" />
          </Part>
          <Part title={t('plan.lesson.homework')}>
            <Text value={c.homework} testId="lesson-homework" />
          </Part>
        </Box>
      </Box>
    </Box>
  );
}

function Part({ title, aside, children }: { title: string; aside?: string; children: ReactNode }) {
  return (
    <Box component="section" sx={{ minWidth: 0 }}>
      <Typography variant="overline" component="h4" color="text.secondary" sx={{ display: 'flex', gap: 1, alignItems: 'baseline', lineHeight: '20px', letterSpacing: '0.04em', mb: 0.5 }}>
        {title}
        {aside && (
          <Typography component="span" variant="caption" sx={{ textTransform: 'none', letterSpacing: 0, ...num }}>
            · {aside}
          </Typography>
        )}
      </Typography>
      {children}
    </Box>
  );
}

const Dash = () => (
  <Typography variant="body2" color="text.secondary">
    —
  </Typography>
);

function Bullets({ items, testId }: { items: string[]; testId: string }) {
  if (!items.length) return <Dash />;
  return (
    <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.25 }} data-testid={testId}>
      {items.map((x, i) => (
        <Typography component="li" variant="body2" key={i} sx={{ overflowWrap: 'anywhere' }}>
          {x}
        </Typography>
      ))}
    </Box>
  );
}

function Text({ value, testId }: { value: string; testId: string }) {
  if (!value.trim()) return <Dash />;
  return (
    <Typography variant="body2" data-testid={testId} sx={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
      {value}
    </Typography>
  );
}
