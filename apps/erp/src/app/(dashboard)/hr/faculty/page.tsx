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
import { HrList } from '@/components/hr/HrList';
import { LinkTabs } from '@/components/ui';
import { loadRecords } from '@/lib/records-server';

const FACULTY_VIEWS = ['qualifications', 'experience', 'publications', 'documents', 'workload'] as const;
type FacultyView = (typeof FACULTY_VIEWS)[number];
const FACULTY_ENTITY = { qualifications: 'staff-qualifications', experience: 'staff-experience', publications: 'staff-publications', documents: 'staff-documents' } as const;

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

/** The faculty's qualifications, experience, publications and documents (record kit lists), teaching workload and teaching evaluation. */
export default async function FacultyPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireSection('appraisal');
  const { t, fmt } = await getI18n();
  const sp = await searchParams;
  const view = FACULTY_VIEWS.includes(sp.view as FacultyView) ? (sp.view as FacultyView) : 'qualifications';
  const tabs = <LinkTabs value={view} label={t('dx.fac.title')} items={FACULTY_VIEWS.map((v) => ({ value: v, href: v === 'qualifications' ? '/hr/faculty' : `/hr/faculty?view=${v}`, label: t(`hk.fac.view.${v}`) }))} />;
  if (view !== 'workload') {
    const entity = FACULTY_ENTITY[view];
    const list = await loadRecords(entity, sp);
    return (
      <>
        <PageHeader title={t('dx.fac.title')} subtitle={t('dx.fac.subtitle')} />
        <SectionTabs tabs={HR_TABS} label="nav.hr" />
        {tabs}
        {list.error !== undefined ? <ErrorState message={list.error} /> : <HrList entity={entity} data={list.data} extraParams={{ view }} />}
      </>
    );
  }
  const data = await load(async () => {
    const [workload, people] = await Promise.all([
      safe(api<{ norm: number; teachers: Record<string, unknown>[]; summary: { under: number; within: number; over: number } }>(`/v1/hr/workload${sp.norm ? `?norm=${encodeURIComponent(sp.norm)}` : ''}`), null),
      safe(api<{ id: string; fullName: string }[]>('/v1/tasks/people'), []),
    ]);
    const report = await safe(api<Report>(`/v1/hr/evaluations/report${sp.staff ? `?staffUserId=${encodeURIComponent(sp.staff)}` : ''}`), null);
    return { workload, people, report };
  });
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  const { workload, people, report } = data.data;
  const words = stateWords(t);
  const raterWords = Object.fromEntries(KINDS.map((k) => [k, t(`dx.fac.rater.${k}`)]));

  const panels: Panel[] = [];

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
      {tabs}
      <DepthDesk panels={panels} />
    </>
  );
}
