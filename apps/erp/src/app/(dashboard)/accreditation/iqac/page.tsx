import type { Metadata } from 'next';
import { DepthDesk } from '@/components/depth/DepthDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { UrlSelect } from '@/components/UrlSelect';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { Panel } from '@/lib/depth';
import { dl } from '@/lib/depth-ui';
import { cycleOptions } from '@/lib/accreditation-ui';

interface Meeting {
  id: string;
  title: string;
  meetingOn: string;
  attendees: string;
  minutes: string;
  actions: { id: string; action: string; ownerName: string; dueOn: string | null; status: string; actionTaken: string }[];
}
interface Practice {
  id: string;
  kind: string;
  title: string;
  year: string;
}
interface Analysis {
  id: string;
  title: string;
  audience: string;
  responses: number;
  average: number | null;
}
interface Report {
  id: string;
  cycle: string;
  stakeholder: string;
  summary: string;
  actionTaken: string;
  status: string;
  averageRating: number | null;
  responses: number | null;
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('acc.title.iqac') };
}

const STAKEHOLDERS = ['students', 'teachers', 'employers', 'alumni', 'parents'] as const;

export default async function IqacPage({ searchParams }: { searchParams: Promise<{ cycle?: string }> }) {
  await requireSection('accreditation');
  const { t } = await getI18n();
  const sp = await searchParams;
  const data = await load(async () => {
    const [meetings, practices, analysis] = await Promise.all([api<Meeting[]>('/v1/accreditation/iqac/meetings'), api<Practice[]>('/v1/accreditation/iqac/practices'), api<Analysis[]>('/v1/accreditation/iqac/feedback-analysis')]);
    const now = new Date();
    const y = now.getUTCMonth() >= 5 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
    const cycle = sp.cycle ?? `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
    const reports = await api<Report[]>(`/v1/accreditation/iqac/feedback-reports?cycle=${encodeURIComponent(cycle)}`);
    return { meetings, practices, analysis, reports, cycle };
  });
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  const { meetings, practices, analysis, reports, cycle } = data.data;
  const status = { open: t('acc.st.open'), done: t('acc.st.done'), analysed: t('acc.st.analysed'), action_planned: t('acc.st.planned'), action_taken: t('acc.st.taken') };
  const actionRows = meetings.flatMap((m) => m.actions.map((a) => ({ ...a, meeting: m.title })));
  const panels: Panel[] = [
    {
      id: 'meetings',
      title: t('acc.iqac.meetings'),
      hint: t('acc.iqac.meetingsHint'),
      empty: t('acc.iqac.noMeetings'),
      columns: [
        { key: 'meetingOn', label: t('acc.c.date'), kind: 'date' },
        { key: 'title', label: t('acc.c.title') },
        { key: 'attendees', label: t('acc.c.attendees') },
        { key: 'minutes', label: t('acc.c.minutes') },
      ],
      rows: meetings.map((m) => ({ ...m })),
      actions: [
        { label: t('acc.a.minutes'), method: 'PUT', path: '/v1/accreditation/iqac/meetings/{id}', fields: [{ name: 'minutes', label: t('acc.c.minutes'), type: 'textarea', required: true }] },
        { label: t('acc.a.addAction'), path: '/v1/accreditation/iqac/meetings/{id}/actions', fields: [{ name: 'action', label: t('acc.c.action'), type: 'text', required: true }, { name: 'ownerName', label: t('acc.c.owner'), type: 'text' }, { name: 'dueOn', label: t('acc.c.due'), type: 'date', nullable: true }] },
      ],
      forms: [
        {
          id: 'meeting',
          title: t('acc.iqac.newMeeting'),
          submit: t('acc.add'),
          path: '/v1/accreditation/iqac/meetings',
          fields: [
            { name: 'title', label: t('acc.c.title'), type: 'text', required: true },
            { name: 'meetingOn', label: t('acc.c.date'), type: 'date', required: true },
            { name: 'attendees', label: t('acc.c.attendees'), type: 'text' },
            { name: 'agenda', label: t('acc.c.agenda'), type: 'textarea' },
            { name: 'minutes', label: t('acc.c.minutes'), type: 'textarea' },
          ],
        },
      ],
    },
    {
      id: 'actions',
      title: t('acc.iqac.actions'),
      empty: t('acc.iqac.noActions'),
      columns: [
        { key: 'meeting', label: t('acc.c.meeting') },
        { key: 'action', label: t('acc.c.action') },
        { key: 'ownerName', label: t('acc.c.owner') },
        { key: 'dueOn', label: t('acc.c.due'), kind: 'date' },
        { key: 'status', label: t('acc.c.status'), kind: 'pill', words: status, tones: { open: 'warning', done: 'success' } },
        { key: 'actionTaken', label: t('acc.c.taken') },
      ],
      rows: actionRows,
      actions: [
        { label: t('acc.a.taken'), method: 'PUT', path: '/v1/accreditation/iqac/actions/{id}', fields: [{ name: 'actionTaken', label: t('acc.c.taken'), type: 'textarea', required: true }] },
        { label: t('acc.a.done'), method: 'PUT', path: '/v1/accreditation/iqac/actions/{id}', body: { status: 'done' }, show: { key: 'status', is: ['open'] } },
      ],
    },
    {
      id: 'feedback',
      title: t('acc.iqac.feedback'),
      hint: t('acc.iqac.feedbackHint'),
      empty: t('acc.iqac.noSurveys'),
      columns: [
        { key: 'title', label: t('acc.c.survey') },
        { key: 'audience', label: t('acc.c.audience') },
        { key: 'responses', label: t('acc.c.responses'), kind: 'num' },
        { key: 'average', label: t('acc.c.average'), kind: 'num' },
      ],
      rows: analysis.map((a) => ({ ...a })),
    },
    {
      id: 'atr',
      title: t('acc.iqac.atr'),
      hint: t('acc.iqac.atrHint'),
      empty: t('acc.iqac.noReports'),
      downloads: [{ label: t('acc.dl.atr'), href: dl('accreditation', 'atr', `&cycle=${cycle}`) }],
      columns: [
        { key: 'stakeholder', label: t('acc.c.stakeholder') },
        { key: 'responses', label: t('acc.c.responses'), kind: 'num' },
        { key: 'averageRating', label: t('acc.c.average'), kind: 'num' },
        { key: 'summary', label: t('acc.c.analysis') },
        { key: 'actionTaken', label: t('acc.c.taken') },
        { key: 'status', label: t('acc.c.status'), kind: 'pill', words: status, tones: { analysed: 'warning', action_planned: 'info', action_taken: 'success' } },
      ],
      rows: reports.map((r) => ({ ...r })),
      actions: [{ label: t('acc.a.taken'), method: 'PUT', path: '/v1/accreditation/iqac/feedback-reports/{id}', fields: [{ name: 'actionTaken', label: t('acc.c.taken'), type: 'textarea', required: true }] }],
      forms: [
        {
          id: 'report',
          title: t('acc.iqac.newReport'),
          submit: t('acc.add'),
          path: '/v1/accreditation/iqac/feedback-reports',
          extra: { cycle },
          fields: [
            { name: 'stakeholder', label: t('acc.c.stakeholder'), type: 'select', required: true, options: STAKEHOLDERS.map((s) => ({ value: s, label: t(`acc.who.${s}`) })) },
            { name: 'responses', label: t('acc.c.responses'), type: 'number' },
            { name: 'averageRating', label: t('acc.c.average'), type: 'number' },
            { name: 'summary', label: t('acc.c.analysis'), type: 'textarea', required: true },
            { name: 'actionTaken', label: t('acc.c.taken'), type: 'textarea' },
          ],
        },
      ],
    },
    {
      id: 'practices',
      title: t('acc.iqac.practices'),
      hint: t('acc.iqac.practicesHint'),
      empty: t('acc.iqac.noPractices'),
      columns: [
        { key: 'kind', label: t('acc.c.kind'), kind: 'pill', words: { best_practice: t('acc.iqac.bestPractice'), distinctiveness: t('acc.iqac.distinctiveness') } },
        { key: 'title', label: t('acc.c.title') },
        { key: 'year', label: t('acc.c.year') },
      ],
      rows: practices.map((p) => ({ ...p })),
      actions: [{ label: t('acc.remove'), method: 'DELETE', path: '/v1/accreditation/iqac/practices/{id}', confirm: t('acc.removeConfirm') }],
      forms: [
        {
          id: 'practice',
          title: t('acc.iqac.newPractice'),
          submit: t('acc.add'),
          path: '/v1/accreditation/iqac/practices',
          fields: [
            { name: 'kind', label: t('acc.c.kind'), type: 'select', required: true, options: [{ value: 'best_practice', label: t('acc.iqac.bestPractice') }, { value: 'distinctiveness', label: t('acc.iqac.distinctiveness') }] },
            { name: 'title', label: t('acc.c.title'), type: 'text', required: true },
            { name: 'year', label: t('acc.c.year'), type: 'text' },
            { name: 'objectives', label: t('acc.f.objectives'), type: 'textarea' },
            { name: 'context', label: t('acc.f.context'), type: 'textarea' },
            { name: 'practice', label: t('acc.f.practice'), type: 'textarea' },
            { name: 'evidence', label: t('acc.f.evidenceOfSuccess'), type: 'textarea' },
            { name: 'problems', label: t('acc.f.problems'), type: 'textarea' },
          ],
        },
      ],
    },
  ];
  return (
    <>
      <PageHeader title={t('acc.title.iqac')} subtitle={t('acc.sub.iqac')} actions={<UrlSelect label={t('acc.cycle')} param="cycle" value={cycle} options={cycleOptions(cycle)} minWidth={160} />} />
      <DepthDesk panels={panels} />
    </>
  );
}
