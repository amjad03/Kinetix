import type { Metadata } from 'next';
import { DepthDesk } from '@/components/depth/DepthDesk';
import { HR_TABS, SectionTabs } from '@/components/hr/Common';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { UrlSelect } from '@/components/UrlSelect';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { Panel } from '@/lib/depth';
import { opt, safe, STATE_TONES, stateWords } from '@/lib/depth-ui';

const CRITERIA = ['clarity', 'preparation', 'punctuality', 'engagement', 'fairness', 'support'] as const;
const KINDS = ['student', 'hod', 'peer', 'self'] as const;

interface Report {
  staffUserId: string;
  fullName: string;
  year: string;
  composite: number | null;
  kinds: { kind: string; count: number; average: number }[];
  perCriterion: { criterion: string; average: number | null }[];
  comments: { kind: string; comment: string }[];
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('dx.fac.title') };
}

/** Qualifications and skills, teaching workload, and teaching evaluation. */
export default async function FacultyPage({ searchParams }: { searchParams: Promise<{ staff?: string; norm?: string }> }) {
  await requireSection('appraisal');
  const { t, fmt } = await getI18n();
  const sp = await searchParams;
  const data = await load(async () => {
    const [quals, workload, people] = await Promise.all([
      api<Record<string, unknown>[]>('/v1/hr/qualifications'),
      safe(api<{ norm: number; teachers: Record<string, unknown>[]; summary: { under: number; within: number; over: number } }>(`/v1/hr/workload${sp.norm ? `?norm=${encodeURIComponent(sp.norm)}` : ''}`), null),
      safe(api<{ id: string; fullName: string }[]>('/v1/tasks/people'), []),
    ]);
    const report = await safe(api<Report>(`/v1/hr/evaluations/report${sp.staff ? `?staffUserId=${encodeURIComponent(sp.staff)}` : ''}`), null);
    return { quals, workload, people, report };
  });
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  const { quals, workload, people, report } = data.data;
  const words = stateWords(t);
  const QUAL = ['degree', 'certification', 'skill', 'experience'] as const;
  const kindWords = Object.fromEntries(QUAL.map((k) => [k, t(`dx.fac.q.${k}`)]));
  const raterWords = Object.fromEntries(KINDS.map((k) => [k, t(`dx.fac.rater.${k}`)]));

  const panels: Panel[] = [
    {
      id: 'qualifications',
      title: t('dx.fac.qualifications'),
      hint: t('dx.fac.qualificationsHint'),
      empty: t('dx.fac.noQualifications'),
      columns: [
        { key: 'fullName', label: t('dx.c.name') },
        { key: 'kind', label: t('dx.c.kind'), kind: 'pill', words: kindWords },
        { key: 'title', label: t('dx.c.title') },
        { key: 'institution', label: t('dx.c.institution') },
        { key: 'year', label: t('dx.c.year') },
        { key: 'level', label: t('dx.c.level') },
        { key: 'verifiedAt', label: t('dx.fac.verified'), kind: 'date' },
      ],
      rows: quals.map((q) => ({ ...q, verifiedAt: typeof q.verifiedAt === 'string' ? q.verifiedAt.slice(0, 10) : null })),
      actions: [
        { label: t('dx.fac.verify'), path: '/v1/hr/qualifications/{id}/verify', show: { key: 'verifiedAt', is: [null] } },
        { label: t('dx.remove'), method: 'DELETE', path: '/v1/hr/qualifications/{id}', confirm: t('dx.fac.removeConfirm') },
      ],
      forms: [
        {
          id: 'qualification',
          title: t('dx.fac.addQualification'),
          submit: t('dx.add'),
          path: '/v1/hr/qualifications',
          fields: [
            { name: 'kind', label: t('dx.c.kind'), type: 'select', options: opt([...QUAL], (k) => k, (k) => kindWords[k]), required: true },
            { name: 'title', label: t('dx.c.title'), type: 'text', required: true },
            { name: 'institution', label: t('dx.c.institution'), type: 'text' },
            { name: 'year', label: t('dx.c.year'), type: 'number' },
            { name: 'level', label: t('dx.c.level'), type: 'text' },
          ],
        },
      ],
    },
  ];

  if (workload) {
    panels.push({
      id: 'workload',
      title: t('dx.fac.workload'),
      hint: t('dx.fac.workloadHint', { hours: workload.norm }),
      empty: t('dx.fac.noWorkload'),
      stats: [
        { label: t('dx.state.under'), value: fmt.number(workload.summary.under) },
        { label: t('dx.state.within'), value: fmt.number(workload.summary.within) },
        { label: t('dx.state.over'), value: fmt.number(workload.summary.over) },
      ],
      columns: [
        { key: 'fullName', label: t('dx.c.name') },
        { key: 'department', label: t('dx.c.department') },
        { key: 'hoursPerWeek', label: t('dx.fac.hours'), kind: 'num' },
        { key: 'periods', label: t('dx.fac.periods'), kind: 'num' },
        { key: 'classes', label: t('dx.fac.classes'), kind: 'num' },
        { key: 'subjects', label: t('dx.fac.subjects'), kind: 'num' },
        { key: 'invigilationDuties', label: t('dx.fac.duties'), kind: 'num' },
        { key: 'load', label: t('dx.c.status'), kind: 'pill', words, tones: STATE_TONES },
      ],
      rows: workload.teachers.map((r) => ({ ...r, id: r.userId })),
    });
  }

  panels.push({
    id: 'evaluation',
    title: report ? `${t('dx.fac.evaluation')}: ${report.fullName} (${report.year})` : t('dx.fac.evaluation'),
    hint: t('dx.fac.evaluationHint'),
    empty: t('dx.fac.noRatings'),
    stats: report ? [{ label: t('dx.fac.composite'), value: report.composite === null ? '-' : fmt.number(report.composite, { maximumFractionDigits: 2 }) }, ...report.perCriterion.filter((c) => c.average !== null).map((c) => ({ label: t(`dx.fac.crit.${c.criterion}` as 'dx.fac.crit.clarity'), value: fmt.number(c.average as number, { maximumFractionDigits: 2 }) }))] : [],
    columns: [
      { key: 'kind', label: t('dx.fac.ratedBy'), kind: 'pill', words: raterWords },
      { key: 'count', label: t('dx.fac.ratings'), kind: 'num' },
      { key: 'average', label: t('dx.fac.average'), kind: 'num' },
    ],
    rows: (report?.kinds ?? []).filter((k) => k.count > 0).map((k) => ({ ...k, id: k.kind })),
    forms: [
      {
        id: 'rate',
        title: t('dx.fac.rate'),
        submit: t('dx.fac.submitRating'),
        path: '/v1/hr/evaluations',
        fields: [
          { name: 'staffUserId', label: t('dx.fac.teacher'), type: 'select', options: opt(people, (p) => p.id, (p) => p.fullName), required: true },
          { name: 'raterKind', label: t('dx.fac.ratedBy'), type: 'select', options: opt(['hod', 'peer', 'self'], (k) => k, (k) => raterWords[k]), required: true },
          ...CRITERIA.map((c) => ({ name: `scores.${c}`, label: t(`dx.fac.crit.${c}`), type: 'number' as const, required: true, hint: t('dx.fac.scale') })),
          { name: 'comment', label: t('dx.c.note'), type: 'textarea' },
        ],
      },
    ],
  });

  return (
    <>
      <PageHeader title={t('dx.fac.title')} subtitle={t('dx.fac.subtitle')} actions={people.length ? <UrlSelect label={t('dx.fac.teacher')} param="staff" value={sp.staff ?? ''} options={opt(people, (p) => p.id, (p) => p.fullName)} /> : undefined} />
      <SectionTabs tabs={HR_TABS} label="nav.hr" />
      <DepthDesk panels={panels} />
    </>
  );
}
