import type { Metadata } from 'next';
import { DepthDesk } from '@/components/depth/DepthDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { UrlSelect } from '@/components/UrlSelect';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { Panel } from '@/lib/depth';
import { opt, safe, STATE_TONES, stateWords } from '@/lib/depth-ui';

interface Framework {
  id: string;
  name: string;
  body: string;
  version: string;
  status: string;
  criteria: number;
  withFigure: number;
  score: number | null;
}
interface Detail {
  id: string;
  score: number | null;
  criteria: { id: string; code: string; parentId: string | null; title: string; metric: string; unit: string; target: number | null; actual: number | null; score: number | null; evidence: number; harvestSource: string }[];
}
interface PaperOutcomes {
  questions: { id: string; no: string; maxMarks: number; code: string | null; percent: number | null }[];
  outcomes: { code: string; percent: number | null }[];
  outcomeOptions: { id: string; code: string; statement: string }[];
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('dx.q.title') };
}

const HARVEST = ['students', 'staff', 'exam_pass_rate', 'placement_rate', 'feedback_rating', 'publications', 'lms_items', 'course_files', 'grievance_resolution', 'committee_meetings'] as const;

export default async function QualityPage({ searchParams }: { searchParams: Promise<{ framework?: string; paper?: string }> }) {
  await requireSection('obe');
  const { t, fmt } = await getI18n();
  const sp = await searchParams;
  const data = await load(async () => {
    const frameworks = await api<Framework[]>('/v1/quality/frameworks');
    const current = frameworks.find((f) => f.id === sp.framework) ?? frameworks[0];
    const [detail, cqi, people, exam] = await Promise.all([
      current ? api<Detail>(`/v1/quality/frameworks/${current.id}`) : null,
      safe(api<{ items: Record<string, unknown>[] }>('/v1/quality/cqi'), { items: [] }),
      safe(api<{ id: string; fullName: string }[]>('/v1/tasks/people'), []),
      safe(api<{ papers: { id: string; subject: string; section: string }[] }>('/v1/exam-ops/options'), { papers: [] }),
    ]);
    const paper = exam.papers.find((p) => p.id === sp.paper);
    const outcomes = paper ? await safe(api<PaperOutcomes>(`/v1/quality/exam-papers/${paper.id}/question-outcomes`), null) : null;
    return { frameworks, current, detail, cqi, people, exam, paper, outcomes };
  });
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  const { frameworks, current, detail, cqi, people, exam, paper, outcomes } = data.data;
  const words = stateWords(t);
  const harvestOptions = [{ value: '', label: t('dx.q.byHand') }, ...HARVEST.map((h) => ({ value: h, label: t(`dx.q.src.${h}`) }))];
  const bodyWords = { naac: 'NAAC', nba: 'NBA', nirf: 'NIRF', iqac: 'IQAC', custom: t('dx.q.custom') };

  const panels: Panel[] = [
    {
      id: 'frameworks',
      title: t('dx.q.frameworks'),
      hint: t('dx.q.frameworksHint'),
      empty: t('dx.q.noFrameworks'),
      columns: [
        { key: 'name', label: t('dx.c.name') },
        { key: 'body', label: t('dx.q.body'), kind: 'pill', words: bodyWords },
        { key: 'version', label: t('dx.c.version') },
        { key: 'status', label: t('dx.c.status'), kind: 'pill', words, tones: STATE_TONES },
        { key: 'criteria', label: t('dx.q.criteria'), kind: 'num' },
        { key: 'withFigure', label: t('dx.q.withFigure'), kind: 'num' },
        { key: 'score', label: t('dx.q.score'), kind: 'pct' },
      ],
      rows: frameworks.map((f) => ({ ...f })),
      actions: [
        { label: t('dx.q.activate'), path: '/v1/quality/frameworks/{id}/status', body: { status: 'active' }, show: { key: 'status', is: ['draft', 'archived'] } },
        { label: t('dx.q.archive'), path: '/v1/quality/frameworks/{id}/status', body: { status: 'archived' }, show: { key: 'status', is: ['active', 'draft'] } },
      ],
      forms: [
        {
          id: 'framework',
          title: t('dx.q.newFramework'),
          submit: t('dx.add'),
          path: '/v1/quality/frameworks',
          fields: [
            { name: 'name', label: t('dx.c.name'), type: 'text', required: true },
            { name: 'version', label: t('dx.c.version'), type: 'text' },
            { name: 'template', label: t('dx.q.template'), type: 'select', options: [{ value: 'naac', label: 'NAAC' }, { value: 'nba', label: 'NBA' }, { value: 'nirf', label: 'NIRF' }], hint: t('dx.q.templateHint') },
          ],
        },
      ],
    },
  ];

  if (current && detail) {
    panels.push({
      id: 'criteria',
      title: `${t('dx.q.tree')}: ${current.name}`,
      hint: t('dx.q.treeHint'),
      empty: t('dx.q.noCriteria'),
      stats: [{ label: t('dx.q.score'), value: detail.score === null ? '-' : `${fmt.number(detail.score, { maximumFractionDigits: 1 })}%` }],
      columns: [
        { key: 'code', label: t('dx.c.code') },
        { key: 'title', label: t('dx.c.title') },
        { key: 'metric', label: t('dx.c.metric') },
        { key: 'target', label: t('dx.c.target'), kind: 'num' },
        { key: 'actual', label: t('dx.c.figure'), kind: 'num' },
        { key: 'unit', label: t('dx.c.unit') },
        { key: 'score', label: t('dx.q.score'), kind: 'pct' },
        { key: 'evidence', label: t('dx.q.evidence'), kind: 'num' },
        { key: 'harvestSource', label: t('dx.q.source'), kind: 'pill', words: Object.fromEntries(HARVEST.map((h) => [h, t(`dx.q.src.${h}`)])) },
      ],
      rows: detail.criteria,
      actions: [
        { label: t('dx.q.recordFigure'), method: 'PUT', path: '/v1/quality/criteria/{id}', fields: [{ name: 'actual', label: t('dx.c.figure'), type: 'number', required: true }] },
        { label: t('dx.q.addEvidence'), path: '/v1/quality/criteria/{id}/evidence', fields: [{ name: 'title', label: t('dx.c.title'), type: 'text', required: true }, { name: 'url', label: t('dx.c.link'), type: 'text' }, { name: 'note', label: t('dx.c.note'), type: 'textarea' }] },
        { label: t('dx.remove'), method: 'DELETE', path: '/v1/quality/criteria/{id}', confirm: t('dx.q.removeConfirm') },
      ],
      forms: [
        {
          id: 'harvest',
          title: t('dx.q.harvestTitle'),
          submit: t('dx.q.harvest'),
          path: `/v1/quality/frameworks/${current.id}/harvest`,
          fields: [],
          result: [{ key: 'harvested', label: t('dx.q.harvested') }, { key: 'skipped', label: t('dx.q.skipped') }],
        },
        {
          id: 'criterion',
          title: t('dx.q.newCriterion'),
          submit: t('dx.add'),
          path: `/v1/quality/frameworks/${current.id}/criteria`,
          fields: [
            { name: 'code', label: t('dx.c.code'), type: 'text', required: true },
            { name: 'title', label: t('dx.c.title'), type: 'text', required: true },
            { name: 'parentId', label: t('dx.q.parent'), type: 'select', options: opt(detail.criteria, (c) => c.id, (c) => `${c.code} ${c.title}`) },
            { name: 'metric', label: t('dx.c.metric'), type: 'text' },
            { name: 'unit', label: t('dx.c.unit'), type: 'text' },
            { name: 'target', label: t('dx.c.target'), type: 'number' },
            { name: 'weight', label: t('dx.q.weight'), type: 'number', initial: '1' },
            { name: 'ownerId', label: t('dx.q.owner'), type: 'select', options: opt(people, (x) => x.id, (x) => x.fullName) },
            { name: 'harvestSource', label: t('dx.q.source'), type: 'select', options: harvestOptions.slice(1) },
          ],
        },
      ],
    });
  }

  panels.push({
    id: 'cqi',
    title: t('dx.q.cqi'),
    hint: t('dx.q.cqiHint'),
    empty: t('dx.q.noCqi'),
    columns: [
      { key: 'title', label: t('dx.c.title') },
      { key: 'program', label: t('dx.c.programme') },
      { key: 'rootCause', label: t('dx.q.rootCause') },
      { key: 'baselineValue', label: t('dx.q.baseline'), kind: 'num' },
      { key: 'targetValue', label: t('dx.c.target'), kind: 'num' },
      { key: 'remeasureOn', label: t('dx.q.remeasureOn'), kind: 'date' },
      { key: 'remeasuredValue', label: t('dx.q.remeasured'), kind: 'num' },
      { key: 'state', label: t('dx.c.status'), kind: 'pill', words, tones: STATE_TONES },
    ],
    rows: cqi.items,
    actions: [
      { label: t('dx.q.recordCause'), method: 'PUT', path: '/v1/quality/actions/{id}/root-cause', fields: [{ name: 'rootCause', label: t('dx.q.rootCause'), type: 'textarea', required: true }, { name: 'baselineValue', label: t('dx.q.baseline'), type: 'number' }, { name: 'targetValue', label: t('dx.c.target'), type: 'number' }, { name: 'remeasureOn', label: t('dx.q.remeasureOn'), type: 'date' }] },
      { label: t('dx.q.remeasure'), path: '/v1/quality/actions/{id}/remeasure', show: { key: 'state', is: ['planned', 'in_progress', 'awaiting_remeasure', 'not_effective'] }, fields: [{ name: 'value', label: t('dx.q.remeasured'), type: 'number', required: true }, { name: 'note', label: t('dx.c.note'), type: 'text' }] },
    ],
  });

  if (paper && outcomes) {
    panels.push({
      id: 'outcomes',
      title: `${t('dx.q.questionOutcomes')}: ${paper.subject}, ${paper.section}`,
      hint: t('dx.q.questionOutcomesHint'),
      empty: t('dx.q.noQuestions'),
      stats: outcomes.outcomes.map((o) => ({ label: o.code, value: o.percent === null ? '-' : `${fmt.number(o.percent, { maximumFractionDigits: 1 })}%` })),
      columns: [
        { key: 'no', label: t('dx.c.question') },
        { key: 'maxMarks', label: t('dx.c.maxMarks'), kind: 'num' },
        { key: 'code', label: t('dx.q.outcome') },
        { key: 'percent', label: t('dx.q.classScored'), kind: 'pct' },
      ],
      rows: outcomes.questions,
      actions: [{ label: t('dx.q.tag'), method: 'PUT', path: '/v1/quality/eval-questions/{id}/co', fields: [{ name: 'coId', label: t('dx.q.outcome'), type: 'select', options: opt(outcomes.outcomeOptions, (c) => c.id, (c) => `${c.code}: ${c.statement}`), required: true }] }],
      forms: [{ id: 'applymap', title: t('dx.q.applyMapTitle'), submit: t('dx.q.applyMap'), path: `/v1/quality/exam-papers/${paper.id}/apply-outcome-map`, fields: [], result: [{ key: 'mapped', label: t('dx.q.mapped') }] }],
    });
  }

  return (
    <>
      <PageHeader title={t('dx.q.title')} subtitle={t('dx.q.subtitle')} actions={frameworks.length ? <UrlSelect label={t('dx.q.framework')} param="framework" value={current?.id ?? ''} options={opt(frameworks, (f) => f.id, (f) => f.name)} /> : undefined} />
      <DepthDesk panels={panels} />
      {exam.papers.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <UrlSelect label={t('dx.q.examPaper')} param="paper" value={paper?.id ?? ''} options={opt(exam.papers, (p) => p.id, (p) => `${p.subject}, ${p.section}`)} minWidth={320} />
        </div>
      )}
    </>
  );
}
