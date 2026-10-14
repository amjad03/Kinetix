'use client';

import { Archive, ArrowRightLeft, BookOpen, ClipboardList, FileCheck, FileQuestion, Gavel, Hourglass, Layers, PackageOpen, ShieldCheck, UserCheck, UsersRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { RecordsTable } from '@/components/records/RecordsTable';
import { tr } from '@/components/records/text';
import { EmptyState, StatusPill, type Column, type RowAction, type Tone } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { TFunction } from '@/i18n/translate';
import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';
import { useCellAction, type CellActionSpec } from './CellAction';
import { DailyCount } from './CellDesks';

type Props = { meta: RecordMeta; page: RecordsPage<Row>; state: ListState; toolbar?: ReactNode; extraParams?: Record<string, string> };

const TONE: Record<string, Tone> = {
  draft: 'neutral',
  scheduled: 'info',
  processed: 'warning',
  published: 'success',
  locked: 'neutral',
  held: 'danger',
  released: 'success',
  requested: 'warning',
  approved: 'info',
  rejected: 'danger',
  applied: 'success',
  reported: 'warning',
  penalised: 'danger',
  dismissed: 'neutral',
  accepted: 'info',
  completed: 'success',
  assigned: 'info',
  substituted: 'warning',
  submitted: 'success',
  open: 'info',
  closed: 'neutral',
  packed: 'neutral',
  issued: 'info',
  valued: 'warning',
  returned: 'success',
  received: 'warning',
  paid: 'info',
  verified: 'success',
  mismatch: 'danger',
};

/** A status in the person's language (the kit's `rk.o.<entity>.status.<value>` words), coloured. */
function Status({ entity, value, k = 'status' }: { entity: string; value: unknown; k?: string }) {
  const { t } = useI18n();
  const v = String(value ?? '');
  return <StatusPill tone={TONE[v] ?? 'neutral'}>{tr(t, `rk.o.${entity}.${k}.${v}`, v)}</StatusPill>;
}

const s = (r: Row, k: string) => (r[k] === null || r[k] === undefined ? '' : String(r[k]));
const n = (r: Row, k: string) => Number(r[k] ?? 0);
const muted = (text: string) => <span className="text-muted-foreground">{text}</span>;
/** The big empty state hides the list toolbar, so it is only for people who cannot add or import: they get the explanation, the rest get the Add and Import buttons. */
const canAdd = (meta: RecordMeta) => meta.can.create || meta.can.import;
const word = (t: TFunction, entity: string, key: string, value: unknown) => tr(t, `rk.o.${entity}.${key}.${String(value ?? '')}`, String(value ?? ''));

/** Row actions that open an exam cell action (a dialog when it needs input). */
function useRowActions(build: (row: Row) => (CellActionSpec & { id: string; when: boolean })[]) {
  const { open, dialog } = useCellAction();
  const actions = (row: Row): RowAction<Row>[] =>
    build(row)
      .filter((a) => a.when)
      .map((a) => ({ id: a.id, label: a.label, tone: a.tone === 'danger' ? 'danger' : undefined, onSelect: () => open(a) }));
  return { actions, dialog };
}

// ---- exam sessions -------------------------------------------------------------------------------

export function SessionRecords({ meta, page, state }: Props) {
  const { t, fmt } = useI18n();
  const e = 'exam-sessions';
  const columns: Column<Row>[] = [
    { id: 'name', header: t('xc.col.session'), sortKey: 'name', rowHeader: true, hideable: false, cell: (r) => s(r, 'name') },
    { id: 'kind', header: t('xc.col.kind'), cell: (r) => word(t, e, 'kind', r.kind) },
    { id: 'programme', header: t('xc.col.programme'), sortKey: 'programme', hideBelow: 'md', cell: (r) => s(r, 'programName') },
    { id: 'term', header: t('xc.col.term'), sortKey: 'term', align: 'right', hideBelow: 'md', cell: (r) => fmt.number(n(r, 'term')) },
    { id: 'dates', header: t('xc.col.dates'), sortKey: 'starts', hideBelow: 'sm', cell: (r) => `${fmt.date(s(r, 'startsOn'), 'short')} – ${fmt.date(s(r, 'endsOn'), 'short')}` },
    { id: 'papers', header: t('xc.col.papers'), sortKey: 'papers', align: 'right', hideBelow: 'md', cell: (r) => fmt.number(n(r, 'papers')) },
    { id: 'results', header: t('xc.col.results'), align: 'right', defaultHidden: true, cell: (r) => fmt.number(n(r, 'candidates')) },
    { id: 'status', header: t('xc.col.status'), sortKey: 'status', cell: (r) => <Status entity={e} value={r.status} /> },
  ];
  return (
    <RecordsTable
      meta={meta}
      page={page}
      state={state}
      label={t('rk.entity.exam-sessions')}
      columns={columns}
      rowHref={(r) => `/exams/${r.id}`}
      empty={canAdd(meta) ? undefined : (
        <EmptyState icon={<ClipboardList />} title={t('xc.empty.sessions')} testId="no-exam-sessions">
          {t('xc.empty.sessionsBody')}
        </EmptyState>
      )}
    />
  );
}

// ---- withheld results ------------------------------------------------------------------------------

export function WithholdRecords({ meta, page, state }: Props) {
  const { t, fmt } = useI18n();
  const e = 'result-withholds';
  const { actions, dialog } = useRowActions((r) => [
    { id: 'release', when: r.status === 'held', label: t('xc.act.release'), path: `/v1/result-withholds/${r.id}/release`, fields: [{ name: 'note', label: t('xc.f.releaseNote'), type: 'textarea', required: true }], done: t('xc.done.released') },
  ]);
  const columns: Column<Row>[] = [
    { id: 'student', header: t('xc.col.student'), sortKey: 'student', rowHeader: true, hideable: false, cell: (r) => `${s(r, 'rollNo')} ${s(r, 'studentName')}` },
    { id: 'session', header: t('xc.col.session'), sortKey: 'session', hideBelow: 'md', cell: (r) => s(r, 'sessionName') },
    { id: 'reason', header: t('xc.col.reason'), cell: (r) => word(t, e, 'reason', r.reason) },
    { id: 'note', header: t('xc.col.note'), hideBelow: 'lg', cell: (r) => s(r, 'note') || muted('-') },
    { id: 'held', header: t('xc.col.heldOn'), sortKey: 'held', hideBelow: 'sm', cell: (r) => fmt.date(s(r, 'heldAt').slice(0, 10), 'short') },
    { id: 'status', header: t('xc.col.status'), sortKey: 'status', cell: (r) => <Status entity={e} value={r.status} /> },
  ];
  return (
    <>
      <RecordsTable meta={meta} page={page} state={state} label={t('rk.entity.result-withholds')} columns={columns} extraRowActions={actions} empty={canAdd(meta) ? undefined : <EmptyState icon={<Hourglass />} title={t('xc.empty.withheld')} testId="no-withheld">{t('xc.empty.withheldBody')}</EmptyState>} />
      {dialog}
    </>
  );
}

// ---- grace applications ----------------------------------------------------------------------------

export function GraceRecords({ meta, page, state }: Props) {
  const { t, fmt } = useI18n();
  const e = 'grace-applications';
  const { actions, dialog } = useRowActions((r) => [
    { id: 'approve', when: r.status === 'requested', label: t('xc.act.approve'), path: `/v1/grace-applications/${r.id}/decide`, extra: { approve: true }, fields: [{ name: 'marksApproved', label: t('xc.f.marksApproved'), type: 'number', required: true, initial: s(r, 'marksRequested') }, { name: 'note', label: t('xc.f.note'), type: 'textarea' }] },
    { id: 'reject', when: r.status === 'requested', tone: 'danger', label: t('xc.act.reject'), path: `/v1/grace-applications/${r.id}/decide`, extra: { approve: false }, fields: [{ name: 'note', label: t('xc.f.why'), type: 'textarea', required: true }] },
    { id: 'apply', when: r.status === 'approved', label: t('xc.act.applyGrace'), path: `/v1/grace-applications/${r.id}/apply`, confirm: t('xc.confirm.applyGrace'), done: t('xc.done.graceApplied') },
  ]);
  const columns: Column<Row>[] = [
    { id: 'student', header: t('xc.col.student'), sortKey: 'student', rowHeader: true, hideable: false, cell: (r) => `${s(r, 'rollNo')} ${s(r, 'studentName')}` },
    { id: 'category', header: t('xc.col.category'), cell: (r) => word(t, e, 'category', r.category) },
    { id: 'subject', header: t('xc.col.subject'), hideBelow: 'md', cell: (r) => s(r, 'subjectName') || muted(t('xc.anySubject')) },
    { id: 'marks', header: t('xc.col.marks'), sortKey: 'marks', align: 'right', cell: (r) => (r.marksApproved === null || r.marksApproved === undefined ? fmt.number(n(r, 'marksRequested')) : `${fmt.number(n(r, 'marksApproved'))} / ${fmt.number(n(r, 'marksRequested'))}`) },
    { id: 'evidence', header: t('xc.col.evidence'), hideBelow: 'lg', cell: (r) => s(r, 'evidence') },
    { id: 'session', header: t('xc.col.session'), sortKey: 'session', defaultHidden: true, cell: (r) => s(r, 'sessionName') },
    { id: 'status', header: t('xc.col.status'), sortKey: 'status', cell: (r) => <Status entity={e} value={r.status} /> },
  ];
  return (
    <>
      <RecordsTable meta={meta} page={page} state={state} label={t('rk.entity.grace-applications')} columns={columns} extraRowActions={actions} empty={canAdd(meta) ? undefined : <EmptyState icon={<UserCheck />} title={t('xc.empty.grace')} testId="no-grace">{t('xc.empty.graceBody')}</EmptyState>} />
      {dialog}
    </>
  );
}

// ---- malpractice -----------------------------------------------------------------------------------

export function MalpracticeRecords({ meta, page, state }: Props) {
  const { t, fmt } = useI18n();
  const e = 'malpractice-cases';
  const { actions, dialog } = useRowActions((r) => [
    {
      id: 'decide',
      when: r.status === 'reported',
      label: t('xc.act.decideCase'),
      path: `/v1/malpractice/${r.id}/decide`,
      intro: t('xc.decideIntro'),
      fields: [
        { name: 'outcome', label: t('xc.f.outcome'), type: 'select', required: true, options: [{ value: 'penalised', label: t('rk.o.malpractice-cases.status.penalised') }, { value: 'dismissed', label: t('rk.o.malpractice-cases.status.dismissed') }] },
        { name: 'penalty', label: t('xc.f.penalty'), type: 'text' },
        { name: 'action', label: t('xc.f.penaltyAction'), type: 'select', initial: 'none', options: ['none', 'cancel_paper', 'cancel_session', 'debar'].map((v) => ({ value: v, label: t(`xc.penalty.${v}` as MessageKey) })) },
        { name: 'withhold', label: t('xc.f.withhold'), type: 'bool', initial: 'false' },
        { name: 'note', label: t('xc.f.committeeNote'), type: 'textarea' },
      ],
    },
  ]);
  const columns: Column<Row>[] = [
    { id: 'student', header: t('xc.col.student'), sortKey: 'student', rowHeader: true, hideable: false, cell: (r) => `${s(r, 'rollNo')} ${s(r, 'studentName')}` },
    { id: 'paper', header: t('xc.col.paper'), hideBelow: 'sm', cell: (r) => s(r, 'code') || muted('-') },
    { id: 'what', header: t('xc.col.what'), hideBelow: 'md', cell: (r) => s(r, 'description') },
    { id: 'reported', header: t('xc.col.reported'), sortKey: 'reported', hideBelow: 'md', cell: (r) => fmt.date(s(r, 'createdAt').slice(0, 10), 'short') },
    { id: 'penalty', header: t('xc.col.penalty'), hideBelow: 'lg', cell: (r) => s(r, 'penalty') || muted('-') },
    { id: 'status', header: t('xc.col.status'), sortKey: 'status', cell: (r) => <Status entity={e} value={r.status} /> },
  ];
  return (
    <>
      <RecordsTable meta={meta} page={page} state={state} label={t('rk.entity.malpractice-cases')} columns={columns} extraRowActions={actions} empty={canAdd(meta) ? undefined : <EmptyState icon={<Gavel />} title={t('xc.empty.malpractice')} testId="no-malpractice">{t('xc.empty.malpracticeBody')}</EmptyState>} />
      {dialog}
    </>
  );
}

// ---- revaluation -----------------------------------------------------------------------------------

export function RevaluationRecords({ meta, page, state }: Props) {
  const { t, fmt } = useI18n();
  const e = 'revaluations';
  const { actions, dialog } = useRowActions((r) => [
    { id: 'accept', when: r.status === 'requested', label: t('xc.act.accept'), path: `/v1/revaluations/${r.id}/decide`, extra: { accept: true }, confirm: t('xc.confirm.accept') },
    { id: 'reject', when: r.status === 'requested', tone: 'danger', label: t('xc.act.reject'), path: `/v1/revaluations/${r.id}/decide`, extra: { accept: false }, fields: [{ name: 'note', label: t('xc.f.why'), type: 'textarea', required: true }] },
    {
      id: 'complete',
      when: r.status === 'accepted',
      label: r.kind === 'photocopy' ? t('xc.act.copyGiven') : t('xc.act.recordRecheck'),
      path: `/v1/revaluations/${r.id}/complete`,
      intro: r.kind === 'photocopy' ? undefined : t('xc.recheckIntro'),
      fields: r.kind === 'photocopy' ? [{ name: 'note', label: t('xc.f.note'), type: 'textarea' }] : [{ name: 'marks', label: t('xc.f.recheckedMarks'), type: 'number', required: true }, { name: 'note', label: t('xc.f.note'), type: 'textarea' }],
    },
  ]);
  const columns: Column<Row>[] = [
    { id: 'student', header: t('xc.col.student'), sortKey: 'student', rowHeader: true, hideable: false, cell: (r) => `${s(r, 'rollNo')} ${s(r, 'studentName')}` },
    { id: 'subject', header: t('xc.col.paper'), sortKey: 'subject', cell: (r) => s(r, 'code') },
    { id: 'kind', header: t('xc.col.kind'), cell: (r) => word(t, e, 'kind', r.kind) },
    { id: 'fee', header: t('xc.col.fee'), align: 'right', hideBelow: 'md', cell: (r) => fmt.rupees(n(r, 'feePaise')) },
    { id: 'change', header: t('xc.col.percent'), align: 'right', hideBelow: 'sm', cell: (r) => (r.newPercent === null || r.newPercent === undefined ? fmt.number(n(r, 'previousPercent')) : `${fmt.number(n(r, 'previousPercent'))} → ${fmt.number(n(r, 'newPercent'))}`) },
    { id: 'note', header: t('xc.col.note'), hideBelow: 'lg', cell: (r) => s(r, 'decisionNote') || muted('-') },
    { id: 'status', header: t('xc.col.status'), sortKey: 'status', cell: (r) => <Status entity={e} value={r.status} /> },
  ];
  return (
    <>
      <RecordsTable meta={meta} page={page} state={state} label={t('rk.entity.revaluations')} columns={columns} extraRowActions={actions} empty={canAdd(meta) ? undefined : <EmptyState icon={<FileQuestion />} title={t('xc.empty.revaluations')} testId="no-revaluations">{t('xc.empty.revaluationsBody')}</EmptyState>} />
      {dialog}
    </>
  );
}

// ---- invigilation duties ---------------------------------------------------------------------------

export function DutyRecords({ meta, page, state, toolbar }: Props) {
  const { t, fmt } = useI18n();
  const e = 'invigilation-duties';
  const staff = meta.move?.options ?? [];
  const { actions, dialog } = useRowActions((r) => [
    { id: 'swap', when: true, label: t('xc.act.askSwap'), path: `/v1/invigilation/duties/${r.id}/swap`, fields: [{ name: 'swapWith', label: t('xc.f.swapWith'), type: 'select', required: true, options: staff.filter((o) => o.value !== r.staffId) }, { name: 'reason', label: t('xc.f.reason'), type: 'textarea', required: true }], done: t('xc.done.swapAsked') },
  ]);
  const columns: Column<Row>[] = [
    { id: 'date', header: t('xc.col.date'), sortKey: 'date', rowHeader: true, hideable: false, cell: (r) => `${fmt.date(s(r, 'dutyDate'), 'short')} ${s(r, 'startsAt').slice(0, 5)}–${s(r, 'endsAt').slice(0, 5)}` },
    { id: 'room', header: t('xc.col.hall'), sortKey: 'room', cell: (r) => s(r, 'roomName') },
    { id: 'staff', header: t('xc.col.staff'), sortKey: 'staff', cell: (r) => s(r, 'staffName') },
    { id: 'role', header: t('xc.col.role'), hideBelow: 'sm', cell: (r) => word(t, e, 'role', r.role) },
    { id: 'session', header: t('xc.col.session'), defaultHidden: true, cell: (r) => s(r, 'sessionName') },
    { id: 'status', header: t('xc.col.status'), hideBelow: 'md', cell: (r) => <Status entity={e} value={r.status} /> },
  ];
  return (
    <>
      <RecordsTable meta={meta} page={page} state={state} label={t('rk.entity.invigilation-duties')} columns={columns} extraRowActions={actions} toolbar={toolbar} empty={canAdd(meta) ? undefined : <EmptyState icon={<UsersRound />} title={t('xc.empty.duties')} testId="no-duties">{t('xc.empty.dutiesBody')}</EmptyState>} />
      {dialog}
    </>
  );
}

// ---- answer-book accounts --------------------------------------------------------------------------

export function AnswerSheetRecords({ meta, page, state }: Props) {
  const { t, fmt } = useI18n();
  const e = 'answer-sheet-accounts';
  const { actions, dialog } = useRowActions((r) => [{ id: 'submit', when: r.status === 'draft', label: t('xc.act.submitAccount'), path: `/v1/answer-sheet-accounts/${r.id}/submit`, confirm: t('xc.confirm.submitAccount') }]);
  const c = (id: string, key: string, hide?: 'sm' | 'md' | 'lg'): Column<Row> => ({ id, header: t(`xc.col.${key}` as MessageKey), align: 'right', hideBelow: hide, cell: (r) => fmt.number(n(r, key)) });
  const columns: Column<Row>[] = [
    { id: 'date', header: t('xc.col.sitting'), sortKey: 'date', rowHeader: true, hideable: false, cell: (r) => `${fmt.date(s(r, 'examDate'), 'short')} ${s(r, 'sitting')}` },
    { id: 'room', header: t('xc.col.hall'), sortKey: 'room', cell: (r) => s(r, 'roomName') },
    c('received', 'received', 'md'),
    c('issued', 'issued'),
    c('additional', 'additional', 'lg'),
    c('spoiled', 'spoiled', 'lg'),
    c('returned', 'returned', 'md'),
    c('present', 'present', 'sm'),
    c('absent', 'absent', 'sm'),
    { id: 'malpractice', header: t('xc.col.malpractice'), align: 'right', defaultHidden: true, cell: (r) => fmt.number(n(r, 'malpractice')) },
    { id: 'status', header: t('xc.col.status'), sortKey: 'status', cell: (r) => <Status entity={e} value={r.status} /> },
  ];
  return (
    <>
      <RecordsTable meta={meta} page={page} state={state} label={t('rk.entity.answer-sheet-accounts')} columns={columns} extraRowActions={actions} empty={canAdd(meta) ? undefined : <EmptyState icon={<BookOpen />} title={t('xc.empty.halls')} testId="no-halls">{t('xc.empty.hallsBody')}</EmptyState>} />
      {dialog}
    </>
  );
}

// ---- postponements ---------------------------------------------------------------------------------

export function RescheduleRecords({ meta, page, state, toolbar }: Props) {
  const { t, fmt } = useI18n();
  const columns: Column<Row>[] = [
    { id: 'paper', header: t('xc.col.paper'), sortKey: 'subject', rowHeader: true, hideable: false, cell: (r) => `${s(r, 'code')} ${s(r, 'subjectName')}` },
    { id: 'class', header: t('xc.col.class'), hideBelow: 'md', cell: (r) => s(r, 'sectionName') },
    { id: 'from', header: t('xc.col.wasOn'), sortKey: 'from', cell: (r) => `${fmt.date(s(r, 'fromDate'), 'short')} ${s(r, 'fromStartsAt').slice(0, 5)}` },
    { id: 'to', header: t('xc.col.movedTo'), sortKey: 'to', cell: (r) => `${fmt.date(s(r, 'toDate'), 'short')} ${s(r, 'toStartsAt').slice(0, 5)}` },
    { id: 'reason', header: t('xc.col.reason'), hideBelow: 'sm', cell: (r) => s(r, 'reason') },
    { id: 'told', header: t('xc.col.told'), align: 'right', hideBelow: 'md', cell: (r) => fmt.number(n(r, 'notified')) },
  ];
  return <RecordsTable meta={meta} page={page} state={state} label={t('rk.entity.exam-reschedules')} columns={columns} toolbar={toolbar} empty={canAdd(meta) ? undefined : <EmptyState icon={<Hourglass />} title={t('xc.empty.postponements')} testId="no-postponements">{t('xc.empty.postponementsBody')}</EmptyState>} />;
}

// ---- valuation -------------------------------------------------------------------------------------

export function CampRecords({ meta, page, state, papers, extraParams }: Props & { papers: { value: string; label: string; sessionId: string }[] }) {
  const { t, fmt } = useI18n();
  const [daily, setDaily] = useState<Row | null>(null);
  const router = useRouter();
  const e = 'valuation-camps';
  const { actions, dialog } = useRowActions((r) => [
    { id: 'pack', when: r.status === 'open', label: t('xc.act.pack'), path: `/v1/valuation-camps/${r.id}/pack`, intro: t('xc.packIntro'), fields: [{ name: 'paperId', label: t('xc.f.paper'), type: 'select', required: true, options: papers.filter((p) => p.sessionId === r.sessionId) }, { name: 'size', label: t('xc.f.bundleSize'), type: 'number', required: true, initial: '30' }] },
    { id: 'close', when: r.status === 'open', label: t('xc.act.closeCamp'), path: `/v1/valuation-camps/${r.id}/close`, confirm: t('xc.confirm.closeCamp') },
  ]);
  const columns: Column<Row>[] = [
    { id: 'name', header: t('xc.col.camp'), sortKey: 'name', rowHeader: true, hideable: false, cell: (r) => s(r, 'name') },
    { id: 'session', header: t('xc.col.session'), sortKey: 'session', hideBelow: 'md', cell: (r) => s(r, 'sessionName') },
    { id: 'dates', header: t('xc.col.dates'), sortKey: 'starts', hideBelow: 'sm', cell: (r) => `${fmt.date(s(r, 'startsOn'), 'short')} – ${fmt.date(s(r, 'endsOn'), 'short')}` },
    { id: 'chief', header: t('xc.col.chiefExaminer'), hideBelow: 'md', cell: (r) => s(r, 'chiefName') || muted('-') },
    { id: 'progress', header: t('xc.col.valued'), sortKey: 'scripts', align: 'right', cell: (r) => `${fmt.number(n(r, 'valued'))} / ${fmt.number(n(r, 'scripts'))}` },
    { id: 'status', header: t('xc.col.status'), cell: (r) => <Status entity={e} value={r.status} /> },
  ];
  return (
    <>
      <RecordsTable meta={meta} page={page} state={state} label={t('rk.entity.valuation-camps')} columns={columns} extraParams={extraParams} extraRowActions={(r) => [...actions(r), { id: 'daily', label: t('xc.act.daily'), onSelect: setDaily }, { id: 'bundles', label: t('xc.act.bundles'), onSelect: (x) => router.push(`/exams/cell/valuation?view=bundles&f.camp=${x.id}`) }]} empty={canAdd(meta) ? undefined : <EmptyState icon={<Layers />} title={t('xc.empty.camps')} testId="no-camps">{t('xc.empty.campsBody')}</EmptyState>} />
      {dialog}
      {daily && <DailyCount campId={daily.id} name={s(daily, 'name')} onClose={() => setDaily(null)} />}
    </>
  );
}

export function BundleRecords({ meta, page, state, extraParams }: Props) {
  const { t, fmt } = useI18n();
  const e = 'valuation-bundles';
  const examiners = meta.move?.options ?? [];
  const { actions, dialog } = useRowActions((r) => [
    { id: 'issue', when: r.status === 'packed', label: t('xc.act.issueBundle'), path: `/v1/valuation-bundles/${r.id}/issue`, fields: [{ name: 'examinerId', label: t('xc.f.examiner'), type: 'select', required: true, options: examiners }] },
    { id: 'count', when: r.status === 'issued', label: t('xc.act.count'), path: `/v1/valuation-bundles/${r.id}/count`, fields: [{ name: 'day', label: t('xc.f.day'), type: 'date', required: true }, { name: 'scripts', label: t('xc.f.scriptsValued'), type: 'number', required: true }] },
    { id: 'return', when: r.status === 'valued', label: t('xc.act.returnBundle'), path: `/v1/valuation-bundles/${r.id}/return`, confirm: t('xc.confirm.returnBundle') },
  ]);
  const columns: Column<Row>[] = [
    { id: 'bundle', header: t('xc.col.bundle'), sortKey: 'bundle', rowHeader: true, hideable: false, cell: (r) => s(r, 'bundleNo') },
    { id: 'subject', header: t('xc.col.paper'), sortKey: 'subject', hideBelow: 'sm', cell: (r) => `${s(r, 'code')} ${s(r, 'subjectName')}` },
    { id: 'camp', header: t('xc.col.camp'), defaultHidden: true, cell: (r) => s(r, 'campName') },
    { id: 'progress', header: t('xc.col.valued'), sortKey: 'scripts', align: 'right', cell: (r) => `${fmt.number(n(r, 'valued'))} / ${fmt.number(n(r, 'scripts'))}` },
    { id: 'examiner', header: t('xc.col.examiner'), sortKey: 'examiner', cell: (r) => s(r, 'examinerName') || muted('-') },
    { id: 'status', header: t('xc.col.status'), sortKey: 'status', cell: (r) => <Status entity={e} value={r.status} /> },
  ];
  return (
    <>
      <RecordsTable meta={meta} page={page} state={state} label={t('rk.entity.valuation-bundles')} columns={columns} extraRowActions={actions} extraParams={extraParams} reorderScope={['camp']} empty={canAdd(meta) ? undefined : <EmptyState icon={<PackageOpen />} title={t('xc.empty.bundles')} testId="no-bundles">{t('xc.empty.bundlesBody')}</EmptyState>} />
      {dialog}
    </>
  );
}

// ---- academic documents ----------------------------------------------------------------------------

export function DocRequestRecords({ meta, page, state, extraParams }: Props) {
  const { t, fmt } = useI18n();
  const e = 'academic-doc-requests';
  const { actions, dialog } = useRowActions((r) => [
    { id: 'approve', when: r.status === 'requested', label: t('xc.act.approve'), path: `/v1/academic-docs/requests/${r.id}/decide`, extra: { approve: true }, confirm: t('xc.confirm.approveDoc') },
    { id: 'reject', when: r.status === 'requested', tone: 'danger', label: t('xc.act.reject'), path: `/v1/academic-docs/requests/${r.id}/decide`, extra: { approve: false }, fields: [{ name: 'note', label: t('xc.f.why'), type: 'textarea', required: true }] },
    { id: 'pay', when: n(r, 'feePaise') > 0 && !r.paymentRef && r.status !== 'issued' && r.status !== 'rejected', label: t('xc.act.recordFee'), path: `/v1/academic-docs/requests/${r.id}/pay`, intro: t('xc.feeIntro', { fee: fmt.rupees(n(r, 'feePaise')) }), fields: [{ name: 'paymentRef', label: t('xc.f.paymentRef'), type: 'text', required: true }] },
    { id: 'issue', when: r.status === 'approved', label: t('xc.act.issue'), path: `/v1/academic-docs/requests/${r.id}/issue`, confirm: t('xc.confirm.issueDoc') },
    { id: 'duplicate', when: r.status === 'issued', label: t('xc.act.duplicate'), path: `/v1/academic-docs/requests/${r.id}/duplicate`, intro: t('xc.duplicateIntro'), fields: [{ name: 'affidavitRef', label: t('xc.f.affidavit'), type: 'text', required: true }, { name: 'firNo', label: t('xc.f.firNo'), type: 'text' }, { name: 'reason', label: t('xc.f.reason'), type: 'textarea', required: true }] },
    { id: 'reissue', when: r.status === 'issued' && !!r.supersededAt, label: t('xc.act.reissue'), path: `/v1/academic-docs/requests/${r.id}/reissue`, confirm: t('xc.confirm.reissue') },
  ]);
  const columns: Column<Row>[] = [
    { id: 'student', header: t('xc.col.student'), sortKey: 'student', rowHeader: true, hideable: false, cell: (r) => `${s(r, 'rollNo')} ${s(r, 'studentName')}` },
    { id: 'kind', header: t('xc.col.document'), cell: (r) => word(t, e, 'kind', r.kind) + (r.duplicate ? ` (${t('xc.duplicate')})` : '') },
    { id: 'purpose', header: t('xc.col.purpose'), hideBelow: 'lg', cell: (r) => s(r, 'purpose') },
    { id: 'serial', header: t('xc.col.serial'), hideBelow: 'md', cell: (r) => s(r, 'serialNo') || muted('-') },
    { id: 'fee', header: t('xc.col.fee'), align: 'right', hideBelow: 'md', cell: (r) => (n(r, 'feePaise') ? `${fmt.rupees(n(r, 'feePaise'))}${r.paymentRef ? ' ✓' : ''}` : muted('-')) },
    { id: 'asked', header: t('xc.col.askedOn'), sortKey: 'created', hideBelow: 'sm', cell: (r) => fmt.date(s(r, 'createdAt').slice(0, 10), 'short') },
    { id: 'status', header: t('xc.col.status'), sortKey: 'status', cell: (r) => (r.status === 'issued' && r.supersededAt ? <StatusPill tone="warning">{t('xc.outOfDate')}</StatusPill> : <Status entity={e} value={r.status} />) },
  ];
  return (
    <>
      <RecordsTable
        meta={meta}
        page={page}
        state={state}
        label={t('rk.entity.academic-doc-requests')}
        columns={columns}
        extraParams={extraParams}
        extraRowActions={(r) => [...actions(r), ...(r.status === 'issued' ? [{ id: 'download', label: t('xc.act.download'), onSelect: () => window.open(`/api/download?kind=academic-doc&id=${r.id}`, '_blank') }] : [])]}
        empty={canAdd(meta) ? undefined : <EmptyState icon={<FileCheck />} title={t('xc.empty.docs')} testId="no-doc-requests">{t('xc.empty.docsBody')}</EmptyState>}
      />
      {dialog}
    </>
  );
}

export function CorrectionRecords({ meta, page, state, extraParams }: Props) {
  const { t, fmt } = useI18n();
  const e = 'record-corrections';
  const { actions, dialog } = useRowActions((r) => [
    { id: 'approve', when: r.status === 'requested', label: t('xc.act.approve'), path: `/v1/record-corrections/${r.id}/decide`, extra: { approve: true }, confirm: t('xc.confirm.approveCorrection') },
    { id: 'reject', when: r.status === 'requested', tone: 'danger', label: t('xc.act.reject'), path: `/v1/record-corrections/${r.id}/decide`, extra: { approve: false }, fields: [{ name: 'note', label: t('xc.f.why'), type: 'textarea', required: true }] },
    { id: 'apply', when: r.status === 'approved', label: t('xc.act.applyCorrection'), path: `/v1/record-corrections/${r.id}/apply`, confirm: t('xc.confirm.applyCorrection'), done: t('xc.done.corrected') },
  ]);
  const columns: Column<Row>[] = [
    { id: 'student', header: t('xc.col.student'), sortKey: 'student', rowHeader: true, hideable: false, cell: (r) => `${s(r, 'rollNo')} ${s(r, 'studentName')}` },
    { id: 'field', header: t('xc.col.field'), cell: (r) => word(t, e, 'field', r.field) },
    { id: 'change', header: t('xc.col.change'), hideBelow: 'sm', cell: (r) => `${s(r, 'currentValue') || '-'} → ${s(r, 'requestedValue')}` },
    { id: 'doc', header: t('xc.col.supportingDoc'), hideBelow: 'lg', cell: (r) => s(r, 'documentRef') },
    { id: 'asked', header: t('xc.col.askedOn'), sortKey: 'created', hideBelow: 'md', cell: (r) => fmt.date(s(r, 'createdAt').slice(0, 10), 'short') },
    { id: 'status', header: t('xc.col.status'), sortKey: 'status', cell: (r) => <Status entity={e} value={r.status} /> },
  ];
  return (
    <>
      <RecordsTable meta={meta} page={page} state={state} label={t('rk.entity.record-corrections')} columns={columns} extraParams={extraParams} extraRowActions={actions} empty={canAdd(meta) ? undefined : <EmptyState icon={<ShieldCheck />} title={t('xc.empty.corrections')} testId="no-corrections">{t('xc.empty.correctionsBody')}</EmptyState>} />
      {dialog}
    </>
  );
}

export function VerificationRecords({ meta, page, state, extraParams }: Props) {
  const { t, fmt } = useI18n();
  const e = 'verification-requests';
  const answered = (r: Row) => ['verified', 'mismatch', 'rejected'].includes(String(r.status));
  const { actions, dialog } = useRowActions((r) => [
    { id: 'pay', when: r.status === 'received' && n(r, 'feePaise') > 0, label: t('xc.act.recordFee'), path: `/v1/verification-requests/${r.id}/pay`, intro: t('xc.feeIntro', { fee: fmt.rupees(n(r, 'feePaise')) }), fields: [{ name: 'paymentRef', label: t('xc.f.paymentRef'), type: 'text', required: true }] },
    { id: 'check', when: r.status === 'paid' || (r.status === 'received' && n(r, 'feePaise') === 0), label: t('xc.act.check'), path: `/v1/verification-requests/${r.id}/check`, done: t('xc.done.checked') },
    { id: 'reject', when: !answered(r), tone: 'danger', label: t('xc.act.reject'), path: `/v1/verification-requests/${r.id}/reject`, fields: [{ name: 'note', label: t('xc.f.why'), type: 'textarea', required: true }] },
  ]);
  const columns: Column<Row>[] = [
    { id: 'organisation', header: t('xc.col.organisation'), sortKey: 'organisation', rowHeader: true, hideable: false, cell: (r) => s(r, 'organisation') },
    { id: 'serial', header: t('xc.col.serial'), cell: (r) => s(r, 'serialNo') },
    { id: 'candidate', header: t('xc.col.candidate'), hideBelow: 'sm', cell: (r) => s(r, 'candidateName') },
    { id: 'fee', header: t('xc.col.fee'), align: 'right', hideBelow: 'md', cell: (r) => fmt.rupees(n(r, 'feePaise')) },
    { id: 'answer', header: t('xc.col.answer'), hideBelow: 'lg', cell: (r) => s(r, 'outcome') || muted('-') },
    { id: 'received', header: t('xc.col.received'), sortKey: 'created', hideBelow: 'md', cell: (r) => fmt.date(s(r, 'createdAt').slice(0, 10), 'short') },
    { id: 'status', header: t('xc.col.status'), sortKey: 'status', cell: (r) => <Status entity={e} value={r.status} /> },
  ];
  return (
    <>
      <RecordsTable meta={meta} page={page} state={state} label={t('rk.entity.verification-requests')} columns={columns} extraParams={extraParams} extraRowActions={actions} empty={canAdd(meta) ? undefined : <EmptyState icon={<Archive />} title={t('xc.empty.verification')} testId="no-verification">{t('xc.empty.verificationBody')}</EmptyState>} />
      {dialog}
    </>
  );
}

// ---- past-exam questions ---------------------------------------------------------------------------

export function PastPaperRecords({ meta, page, state }: Props) {
  const { t, fmt } = useI18n();
  const columns: Column<Row>[] = [
    { id: 'question', header: t('xc.col.question'), rowHeader: true, hideable: false, cell: (r) => <span className="line-clamp-3 max-w-[48ch]">{s(r, 'question')}</span> },
    { id: 'exam', header: t('xc.col.examination'), sortKey: 'exam', hideBelow: 'sm', cell: (r) => s(r, 'exam') },
    { id: 'year', header: t('xc.col.year'), sortKey: 'year', align: 'right', cell: (r) => String(r.year ?? '') },
    { id: 'subject', header: t('xc.col.subject'), sortKey: 'subject', hideBelow: 'md', cell: (r) => s(r, 'subjectCode') || muted(t('xc.anySubject')) },
    { id: 'unit', header: t('xc.col.unit'), hideBelow: 'lg', cell: (r) => s(r, 'unit') || muted('-') },
    { id: 'qno', header: t('xc.col.qno'), hideBelow: 'lg', cell: (r) => s(r, 'questionNo') || muted('-') },
    { id: 'marks', header: t('xc.col.marks'), sortKey: 'marks', align: 'right', hideBelow: 'sm', cell: (r) => (r.marks === null || r.marks === undefined ? muted('-') : fmt.number(n(r, 'marks'))) },
  ];
  return <RecordsTable meta={meta} page={page} state={state} label={t('rk.entity.past-exam-questions')} columns={columns} empty={canAdd(meta) ? undefined : <EmptyState icon={<FileQuestion />} title={t('xc.empty.pastPapers')} testId="no-past-papers">{t('xc.empty.pastPapersBody')}</EmptyState>} />;
}

/** Credits accepted from another institution: they count in the CGPA and lead the transcript. */
export function TransferRecords({ meta, page, state }: Props) {
  const { t, fmt } = useI18n();
  const columns: Column<Row>[] = [
    { id: 'student', header: t('xc.col.student'), sortKey: 'student', rowHeader: true, hideable: false, cell: (r) => `${s(r, 'rollNo')} ${s(r, 'studentName')}` },
    { id: 'institution', header: t('xc.ct.institution'), sortKey: 'institution', hideBelow: 'md', cell: (r) => s(r, 'sourceInstitution') },
    { id: 'course', header: t('xc.ct.course'), cell: (r) => s(r, 'sourceCourse') },
    { id: 'countsAs', header: t('xc.ct.countsAs'), hideBelow: 'lg', cell: (r) => (r.subjectCode ? `${s(r, 'subjectCode')} ${s(r, 'subjectName')}` : muted(t('xc.ct.creditOnly'))) },
    { id: 'term', header: t('xc.col.term'), sortKey: 'term', align: 'right', hideBelow: 'sm', cell: (r) => fmt.number(n(r, 'term')) },
    { id: 'credits', header: t('xc.ct.credits'), sortKey: 'credits', align: 'right', cell: (r) => fmt.number(n(r, 'credits')) },
    { id: 'grade', header: t('xc.ct.grade'), hideBelow: 'sm', cell: (r) => `${s(r, 'grade')} (${fmt.number(n(r, 'gradePoint'))})` },
    { id: 'note', header: t('xc.col.note'), defaultHidden: true, cell: (r) => s(r, 'note') || muted('-') },
  ];
  return <RecordsTable meta={meta} page={page} state={state} label={t('rk.entity.credit-transfers')} columns={columns} empty={canAdd(meta) ? undefined : <EmptyState icon={<ArrowRightLeft />} title={t('xc.empty.transfers')} testId="no-transfers">{t('xc.empty.transfersBody')}</EmptyState>} />;
}
