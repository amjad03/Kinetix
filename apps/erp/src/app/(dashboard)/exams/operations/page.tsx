import type { Metadata } from 'next';
import { DepthDesk } from '@/components/depth/DepthDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { UrlSelect } from '@/components/UrlSelect';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { Panel } from '@/lib/depth';
import { dl, opt, safe, STATE_TONES, stateWords } from '@/lib/depth-ui';

interface Options {
  sessions: { id: string; name: string; status: string }[];
  papers: { id: string; sessionId: string; subjectId: string; subject: string; sectionId: string; section: string }[];
  staff: { id: string; fullName: string }[];
  controllers: { id: string; fullName: string }[];
  normalisable: { id: string; title: string; maxMarks: number; markStatus: string; section: string; subject: string }[];
  lockedPapers: { id: string; title: string }[];
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('dx.exo.title') };
}

export default async function ExamOperationsPage({ searchParams }: { searchParams: Promise<{ session?: string }> }) {
  await requireSection('exams');
  const { t } = await getI18n();
  const sp = await searchParams;
  const data = await load(async () => {
    const o = await api<Options>('/v1/exam-ops/options');
    const session = o.sessions.find((s) => s.id === sp.session) ?? o.sessions[0];
    const [releases, practicals, classes, bands, norms] = await Promise.all([
      safe(api<Record<string, unknown>[]>('/v1/question-bank/releases'), []),
      session ? safe(api<Record<string, unknown>[]>(`/v1/exam-sessions/${session.id}/practicals`), []) : [],
      session ? safe(api<{ students: Record<string, unknown>[] }>(`/v1/exam-sessions/${session.id}/classification`), { students: [] }) : { students: [] },
      safe(api<{ bands: { name: string; minPercent: number }[] }>('/v1/exam-ops/class-bands'), { bands: [] }),
      safe(api<Record<string, unknown>[]>('/v1/exam-ops/normalisations'), []),
    ]);
    return { o, session, releases, practicals, classes, bands, norms };
  });
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  const { o, session, releases, practicals, classes, bands, norms } = data.data;
  const words = stateWords(t);
  const sessionPapers = o.papers.filter((p) => p.sessionId === session?.id);
  const uniq = (list: { value: string; label: string }[]) => [...new Map(list.map((x) => [x.value, x])).values()];

  const panels: Panel[] = [
    {
      id: 'sealed',
      title: t('dx.exo.sealed'),
      hint: t('dx.exo.sealedHint'),
      empty: t('dx.exo.sealedNone'),
      columns: [
        { key: 'title', label: t('dx.c.paper') },
        { key: 'subject', label: t('dx.c.subject') },
        { key: 'controller', label: t('dx.c.controller') },
        { key: 'releaseAt', label: t('dx.c.releaseAt'), kind: 'datetime' },
        { key: 'state', label: t('dx.c.status'), kind: 'pill', words, tones: STATE_TONES },
        { key: 'paperId', label: t('dx.exo.sealedCopy'), kind: 'link', href: '/api/download?kind=qb-sealed&id={paperId}', words: { link: t('dx.download') } },
      ],
      rows: releases,
      actions: [{ label: t('dx.cancel'), path: '/v1/question-bank/papers/{paperId}/release/cancel', show: { key: 'state', is: ['sealed'] }, confirm: t('dx.exo.cancelRelease') }],
      forms: [
        {
          id: 'release',
          title: t('dx.exo.schedule'),
          submit: t('dx.exo.scheduleSubmit'),
          path: '/v1/question-bank/papers/{paperId}/release',
          pathFields: ['paperId'],
          fields: [
            { name: 'paperId', label: t('dx.c.paper'), type: 'select', options: opt(o.lockedPapers, (x) => x.id, (x) => x.title), required: true },
            { name: 'releaseAt', label: t('dx.c.releaseAt'), type: 'datetime', required: true },
            { name: 'controllerId', label: t('dx.c.controller'), type: 'select', options: opt(o.controllers, (x) => x.id, (x) => x.fullName), required: true },
          ],
        },
      ],
    },
    {
      id: 'practicals',
      title: t('dx.exo.practicals'),
      hint: t('dx.exo.practicalsHint'),
      empty: t('dx.exo.practicalsNone'),
      columns: [
        { key: 'subject', label: t('dx.c.subject') },
        { key: 'kind', label: t('dx.c.kind'), kind: 'pill', words: { practical: t('dx.exo.kind.practical'), viva: t('dx.exo.kind.viva'), project: t('dx.exo.kind.project') } },
        { key: 'batchLabel', label: t('dx.c.batch') },
        { key: 'slotDate', label: t('dx.c.date'), kind: 'date' },
        { key: 'startsAt', label: t('dx.c.from') },
        { key: 'room', label: t('dx.c.room') },
        { key: 'examiner', label: t('dx.c.internalExaminer') },
        { key: 'externalExaminerName', label: t('dx.c.externalExaminer') },
        { key: 'candidateCount', label: t('dx.c.candidates'), kind: 'num' },
        { key: 'status', label: t('dx.c.status'), kind: 'pill', words, tones: STATE_TONES },
      ],
      rows: practicals.map((r) => ({ ...r, candidateCount: Array.isArray(r.candidates) ? r.candidates.length : 0 })),
      actions: [
        { label: t('dx.exo.enterMarks'), path: '/v1/practicals/{id}/marks', show: { key: 'status', is: ['scheduled'] }, fields: [{ name: 'sheet', label: t('dx.exo.marksSheet'), type: 'textarea', required: true, hint: t('dx.exo.marksSheetHint') }] },
        { label: t('dx.cancel'), path: '/v1/practicals/{id}/cancel', show: { key: 'status', is: ['scheduled'] }, confirm: t('dx.exo.cancelSitting') },
      ],
      forms: session
        ? [
            {
              id: 'practical',
              title: t('dx.exo.newSitting'),
              submit: t('dx.add'),
              path: `/v1/exam-sessions/${session.id}/practicals`,
              fields: [
                { name: 'subjectId', label: t('dx.c.subject'), type: 'select', options: uniq(sessionPapers.map((p) => ({ value: p.subjectId, label: p.subject }))), required: true },
                { name: 'sectionId', label: t('dx.c.class'), type: 'select', options: uniq(sessionPapers.map((p) => ({ value: p.sectionId, label: p.section }))), required: true },
                { name: 'kind', label: t('dx.c.kind'), type: 'select', options: [{ value: 'practical', label: t('dx.exo.kind.practical') }, { value: 'viva', label: t('dx.exo.kind.viva') }, { value: 'project', label: t('dx.exo.kind.project') }], initial: 'practical', required: true },
                { name: 'batchLabel', label: t('dx.c.batch'), type: 'text' },
                { name: 'slotDate', label: t('dx.c.date'), type: 'date', required: true },
                { name: 'startsAt', label: t('dx.c.from'), type: 'text', initial: '10:00', required: true, hint: t('dx.exo.timeHint') },
                { name: 'endsAt', label: t('dx.c.to'), type: 'text', initial: '12:00', required: true },
                { name: 'internalExaminerId', label: t('dx.c.internalExaminer'), type: 'select', options: opt(o.staff, (x) => x.id, (x) => x.fullName), required: true },
                { name: 'externalExaminerName', label: t('dx.c.externalExaminer'), type: 'text' },
                { name: 'externalExaminerOrg', label: t('dx.c.externalOrg'), type: 'text' },
                { name: 'maxMarks', label: t('dx.c.maxMarks'), type: 'number', initial: '25' },
              ],
            },
          ]
        : [],
    },
    {
      id: 'normalise',
      title: t('dx.exo.normalise'),
      hint: t('dx.exo.normaliseHint'),
      empty: t('dx.exo.normaliseNone'),
      columns: [
        { key: 'title', label: t('dx.c.assessment') },
        { key: 'method', label: t('dx.c.method'), kind: 'pill', words: { scale: t('dx.exo.m.scale'), add: t('dx.exo.m.add'), target_mean: t('dx.exo.m.target_mean') } },
        { key: 'value', label: t('dx.c.value'), kind: 'num' },
        { key: 'affected', label: t('dx.c.marksChanged'), kind: 'num' },
        { key: 'reason', label: t('dx.c.reason') },
        { key: 'appliedAt', label: t('dx.c.appliedAt'), kind: 'datetime' },
        { key: 'revertedAt', label: t('dx.exo.undone'), kind: 'datetime' },
      ],
      rows: norms,
      actions: [{ label: t('dx.exo.undo'), path: '/v1/exam-ops/normalisations/{id}/revert', show: { key: 'revertedAt', is: [null] }, confirm: t('dx.exo.undoConfirm') }],
      forms: ['preview', 'apply'].map((mode) => ({
        id: `normalise-${mode}`,
        title: mode === 'preview' ? t('dx.exo.previewTitle') : t('dx.exo.applyTitle'),
        submit: mode === 'preview' ? t('dx.exo.preview') : t('dx.exo.apply'),
        path: '/v1/exam-ops/normalise/{assessmentId}',
        pathFields: ['assessmentId'],
        extra: { preview: mode === 'preview' },
        result: mode === 'preview' ? [{ key: 'students', label: t('dx.exo.r.students') }, { key: 'changed', label: t('dx.exo.r.changed') }, { key: 'meanBefore', label: t('dx.exo.r.meanBefore') }, { key: 'meanAfter', label: t('dx.exo.r.meanAfter') }] : undefined,
        fields: [
          { name: 'assessmentId', label: t('dx.c.assessment'), type: 'select' as const, options: opt(o.normalisable, (x) => x.id, (x) => `${x.title} (${x.subject}, ${x.section}, ${x.maxMarks})`), required: true },
          { name: 'method', label: t('dx.c.method'), type: 'select' as const, options: [{ value: 'scale', label: t('dx.exo.m.scale') }, { value: 'add', label: t('dx.exo.m.add') }, { value: 'target_mean', label: t('dx.exo.m.target_mean') }], initial: 'scale', required: true },
          { name: 'value', label: t('dx.c.value'), type: 'number' as const, required: true, hint: t('dx.exo.valueHint') },
          { name: 'reason', label: t('dx.c.reason'), type: 'text' as const, required: true },
        ],
      })),
    },
    {
      id: 'classes',
      title: t('dx.exo.classes'),
      hint: t('dx.exo.classesHint'),
      empty: t('dx.exo.classesNone'),
      stats: bands.bands.map((b) => ({ label: b.name, value: `${b.minPercent}%` })),
      downloads: session && classes.students.length ? [{ label: t('dx.exo.consolidated'), href: dl('consolidated-result', session.id) }] : [],
      columns: [
        { key: 'rank', label: t('dx.c.rank'), kind: 'num' },
        { key: 'rollNo', label: t('dx.c.rollNo') },
        { key: 'name', label: t('dx.c.name') },
        { key: 'section', label: t('dx.c.class') },
        { key: 'sgpa', label: t('dx.c.sgpa') },
        { key: 'percent', label: t('dx.c.percent'), kind: 'pct' },
        { key: 'class', label: t('dx.c.resultClass') },
        { key: 'distinctions', label: t('dx.c.distinctions'), kind: 'num' },
        { key: 'studentId', label: t('dx.c.progressReport'), kind: 'link', href: '/api/download?kind=progress-report&id={studentId}', words: { link: t('dx.download') } },
      ],
      rows: classes.students,
      forms: [
        {
          id: 'bands',
          title: t('dx.exo.bandsTitle'),
          submit: t('dx.save'),
          method: 'PUT',
          path: '/v1/exam-ops/class-bands',
          fields: [{ name: 'bands', label: t('dx.exo.bands'), type: 'lines', lines: { keys: ['name', 'minPercent'], numeric: ['minPercent'] }, initial: bands.bands.map((b) => `${b.name}, ${b.minPercent}`).join('\n'), required: true, hint: t('dx.exo.bandsHint') }],
        },
      ],
    },
    {
      id: 'approval',
      title: t('dx.exo.approval'),
      hint: t('dx.exo.approvalHint'),
      empty: t('dx.exo.approvalNone'),
      columns: [
        { key: 'name', label: t('dx.c.session') },
        { key: 'status', label: t('dx.c.status'), kind: 'pill', words, tones: STATE_TONES },
      ],
      rows: o.sessions,
      actions: [{ label: t('dx.exo.requestApproval'), path: '/v1/exam-sessions/{id}/request-publish', show: { key: 'status', is: ['processed'] } }],
    },
  ];

  return (
    <>
      <PageHeader title={t('dx.exo.title')} subtitle={t('dx.exo.subtitle')} actions={o.sessions.length ? <UrlSelect label={t('dx.c.session')} param="session" value={session?.id ?? ''} options={opt(o.sessions, (s) => s.id, (s) => s.name)} /> : undefined} />
      <DepthDesk panels={panels} />
    </>
  );
}
