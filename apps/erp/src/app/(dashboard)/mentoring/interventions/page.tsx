import type { Metadata } from 'next';
import { DepthDesk } from '@/components/depth/DepthDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { UrlSelect } from '@/components/UrlSelect';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { Panel } from '@/lib/depth';
import { opt, safe } from '@/lib/depth-ui';

interface PlanRow {
  plan: { id: string; goal: string; status: string; reviewOn: string };
  studentName: string;
  rollNo: string;
}
interface Progress {
  support: { id: string; kind: string; title: string; ref: string | null; dueOn: string | null; done: boolean }[];
  reassessment: { scoreBefore: number; scoreAfter: number | null; outcome: string | null; dueOn: string; assessedAt: string | null } | null;
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('dx.mn.title') };
}

const KINDS = ['content', 'tutoring', 'remedial_class', 'counselling', 'other'] as const;

/** Intervention plans with the support set for each, and the risk measured again at the review date. */
export default async function InterventionsPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  await requireSection('mentoring');
  const { t } = await getI18n();
  const sp = await searchParams;
  const data = await load(async () => {
    const plans = await api<PlanRow[]>('/v1/mentoring/plans');
    const current = plans.find((p) => p.plan.id === sp.plan) ?? plans[0];
    const progress = current ? await safe(api<Progress>(`/v1/mentoring/plans/${current.plan.id}/progress`), null) : null;
    return { plans, current, progress };
  });
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  const { plans, current, progress } = data.data;
  const kindWords = Object.fromEntries(KINDS.map((k) => [k, t(`dx.mn.k.${k}`)]));
  const re = progress?.reassessment;

  const panels: Panel[] = [
    {
      id: 'plans',
      title: t('dx.mn.plans'),
      empty: t('dx.mn.noPlans'),
      columns: [
        { key: 'studentName', label: t('dx.c.student') },
        { key: 'rollNo', label: t('dx.c.rollNo') },
        { key: 'goal', label: t('dx.mn.goal') },
        { key: 'reviewOn', label: t('dx.mn.reviewOn'), kind: 'date' },
        { key: 'status', label: t('dx.c.status'), kind: 'pill', words: { open: t('dx.state.open'), in_progress: t('dx.state.in_progress'), closed: t('dx.state.locked') }, tones: { open: 'warning', in_progress: 'info', closed: 'neutral' } },
      ],
      rows: plans.map((p) => ({ id: p.plan.id, studentName: p.studentName, rollNo: p.rollNo, goal: p.plan.goal, reviewOn: p.plan.reviewOn, status: p.plan.status })),
      actions: [{ label: t('dx.mn.reassess'), path: '/v1/mentoring/plans/{id}/reassess', show: { key: 'status', is: ['open', 'in_progress'] } }],
    },
  ];

  if (current && progress) {
    panels.push({
      id: 'support',
      title: `${t('dx.mn.support')}: ${current.studentName}`,
      hint: re ? t('dx.mn.reassessmentText', { before: re.scoreBefore, after: re.scoreAfter === null ? '-' : String(re.scoreAfter), outcome: re.outcome ? t(`dx.state.${re.outcome}` as 'dx.state.improved') : t('dx.mn.notYet') }) : t('dx.mn.noReassessment'),
      empty: t('dx.mn.noSupport'),
      stats: re ? [{ label: t('dx.mn.scoreBefore'), value: String(re.scoreBefore) }, { label: t('dx.mn.scoreAfter'), value: re.scoreAfter === null ? '-' : String(re.scoreAfter) }] : [],
      columns: [
        { key: 'kind', label: t('dx.c.kind'), kind: 'pill', words: kindWords },
        { key: 'title', label: t('dx.c.title') },
        { key: 'ref', label: t('dx.mn.ref') },
        { key: 'dueOn', label: t('dx.lib.due'), kind: 'date' },
        { key: 'done', label: t('dx.mn.done'), kind: 'yes' },
      ],
      rows: progress.support,
      actions: [{ label: t('dx.mn.markDone'), path: '/v1/mentoring/support/{id}/done', show: { key: 'done', is: [false] } }],
      forms:
        current.plan.status === 'closed'
          ? []
          : [
              {
                id: 'support',
                title: t('dx.mn.addSupport'),
                submit: t('dx.add'),
                path: `/v1/mentoring/plans/${current.plan.id}/support`,
                fields: [
                  { name: 'kind', label: t('dx.c.kind'), type: 'select', options: opt([...KINDS], (k) => k, (k) => kindWords[k]), required: true },
                  { name: 'title', label: t('dx.c.title'), type: 'text', required: true },
                  { name: 'ref', label: t('dx.mn.ref'), type: 'text', hint: t('dx.mn.refHint') },
                  { name: 'dueOn', label: t('dx.lib.due'), type: 'date' },
                ],
              },
            ],
    });
  }

  return (
    <>
      <PageHeader title={t('dx.mn.title')} subtitle={t('dx.mn.subtitle')} actions={plans.length ? <UrlSelect label={t('dx.mn.plan')} param="plan" value={current?.plan.id ?? ''} options={opt(plans, (p) => p.plan.id, (p) => `${p.studentName}: ${p.plan.goal.slice(0, 50)}`)} minWidth={320} /> : undefined} />
      <DepthDesk panels={panels} />
    </>
  );
}
