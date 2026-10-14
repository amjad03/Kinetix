'use client';

import { ClipboardCheck, ListChecks } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  addQuestion, addQuiz, compliance, dropQuestion, grantExtension, homeworkSettings, markAnswer, pushMarks, quizAnalysis, quizAttempts, quizDetail, quizStep, saveGroups, saveHomeworkSettings, saveMarks, submissionsOf, withdrawExtension,
} from '@/app/(dashboard)/homework/actions';
import { useRead } from '@/components/campus-life/CampusLifeDesk';
import { ActionButton, Bar, FormDialog, Grid, InfoDialog, Pill, useToast, type Field } from '@/components/ops/kit';
import { RecordsTable } from '@/components/records/RecordsTable';
import { Button } from '@/components/shadcn/button';
import { StatGrid, StatTile } from '@/components/StatTile';
import { EmptyState, SectionTitle, SelectInput, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { ComplianceRow, HomeworkSettings, QuizAnalysis, QuizAttemptRow, QuizDetail, SubmissionRow } from '@/lib/life';
import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';
import { useKitColumns, emptyFor } from './kit';

type Toast = (m: string) => void;
type Opt = { id: string; name: string };
type Props = { meta: RecordMeta; page: RecordsPage<Row>; state: ListState; tab: string; sections: Opt[]; subjects: Opt[] };
const s = (v: unknown) => String(v ?? '');

// ---- assignments ---------------------------------------------------------------------------------------

export function AssignmentsKit({ meta, page, state, tab }: Props) {
  const { t } = useI18n();
  const [toast, toastNode] = useToast();
  const [dlg, setDlg] = useState<{ kind: 'settings' | 'marks'; row: Row } | null>(null);
  const columns = useKitColumns(meta, [
    { key: 'title', header: 'ld.col.assignment', sortKey: 'title', rowHeader: true, kind: 'wrap' },
    { key: 'className', header: 'ld.col.class', sortKey: 'className', hideBelow: 'sm' },
    { key: 'subject', header: 'ld.col.subject', sortKey: 'subject', hideBelow: 'md' },
    { key: 'dueOn', header: 'ld.col.due', kind: 'date', sortKey: 'due' },
    { key: 'submitted', header: 'ld.col.handedIn', kind: 'number', sortKey: 'submitted' },
    { key: 'students', header: 'ld.col.students', kind: 'number', hideBelow: 'sm' },
    { key: 'late', header: 'ld.col.late', kind: 'number', hideBelow: 'sm' },
    { key: 'latePolicy', header: 'ld.col.latePolicy', kind: 'choice', choiceOf: 'latePolicy', hideBelow: 'md' },
    { key: 'maxMarks', header: 'ld.col.maxMarks', kind: 'number', defaultHidden: true },
    { key: 'teacher', header: 'ld.col.teacher', defaultHidden: true },
  ]);
  return (
    <>
      <RecordsTable
        meta={meta}
        page={page}
        state={state}
        label={t('ld.tab.assignments')}
        columns={columns}
        extraParams={{ tab }}
        testId="ld-assignments"
        onView={(r) => setDlg({ kind: 'marks', row: r })}
        extraRowActions={(r) => [
          { id: 'marks', label: t('ld.hw.submissions'), onSelect: () => setDlg({ kind: 'marks', row: r }) },
          { id: 'settings', label: t('ld.hw.rules'), onSelect: () => setDlg({ kind: 'settings', row: r }) },
        ]}
        empty={emptyFor(meta, <EmptyState icon={<ClipboardCheck />} title={t('ld.empty.hwTitle')}>{t('ld.empty.hw')}</EmptyState>)}
      />
      {dlg?.kind === 'settings' && <RulesDialog row={dlg.row} onClose={() => setDlg(null)} toast={toast} />}
      {dlg?.kind === 'marks' && <MarksDialog row={dlg.row} onClose={() => setDlg(null)} toast={toast} />}
      {toastNode}
    </>
  );
}

/** Late policy, cut-off, attempts and marks; extensions per student; groups. */
function RulesDialog({ row, onClose, toast }: { row: Row; onClose: () => void; toast: Toast }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const d = useRead<HomeworkSettings>(() => homeworkSettings(s(row.id)));
  const subs = useRead(() => submissionsOf(s(row.id)));
  const [sub, setSub] = useState<'rules' | 'extend' | 'groups' | null>(null);
  const refresh = (m: string) => {
    toast(m);
    d.reload();
    router.refresh();
  };
  const x = d.data;
  const roster = subs.data?.students ?? [];
  const nameOf = (id: string) => roster.find((r) => r.studentId === id)?.fullName ?? id;
  return (
    <InfoDialog title={s(row.title)} onClose={onClose}>
      {d.error && <p className="text-sm text-red-ink">{d.error}</p>}
      {x && (
        <>
          <p className="mt-0 text-sm" data-testid="ld-rules-summary">
            {t('ld.hw.rulesSummary', { due: fmt.date(x.dueOn, 'short'), max: x.maxMarks ?? '-', policy: t(`ld.late.${x.latePolicy}` as MessageKey), pct: x.latePenaltyPct, cutoff: x.cutoffOn ? fmt.date(x.cutoffOn, 'short') : '-', attempts: x.maxAttempts })}
          </p>
          <Bar>
            <Button variant="outline" onClick={() => setSub('rules')}>{t('ld.hw.editRules')}</Button>
            <Button variant="outline" onClick={() => setSub('extend')}>{t('ld.hw.extend')}</Button>
            <Button variant="outline" onClick={() => setSub('groups')}>{t('ld.hw.groups')}</Button>
          </Bar>
          <SectionTitle>{t('ld.hw.extensions')}</SectionTitle>
          <Grid
            testId="ld-extensions"
            empty={t('ld.hw.noExtensions')}
            rows={x.extensions}
            cols={[
              { label: t('ld.col.student'), cell: (e) => `${e.rollNo} ${e.fullName}` },
              { label: t('ld.col.due'), cell: (e) => fmt.date(e.dueOn, 'short'), sort: (e) => e.dueOn },
              { label: t('ld.hw.reason'), cell: (e) => e.reason || '-' },
              { label: '', cell: (e) => <ActionButton tone="error" label={t('ld.hw.withdraw')} run={() => withdrawExtension(s(row.id), e.studentId)} onDone={refresh} /> },
            ]}
          />
          <SectionTitle>{t('ld.hw.groups')}</SectionTitle>
          <Grid testId="ld-groups" empty={t('ld.hw.noGroups')} rows={x.groups} cols={[{ label: t('ops.f.name'), cell: (g) => g.name }, { label: t('ld.hw.members'), cell: (g) => g.studentIds.map(nameOf).join(', '), wrap: true }]} />
        </>
      )}
      {sub === 'rules' && x && (
        <FormDialog
          title={t('ld.hw.editRules')}
          onSubmit={(v) => saveHomeworkSettings(s(row.id), v)}
          onClose={(m) => {
            setSub(null);
            if (m) refresh(m);
          }}
          fields={[
            { name: 'maxMarks', label: t('ld.col.maxMarks'), kind: 'number', init: x.maxMarks === null ? '' : String(x.maxMarks) },
            { name: 'latePolicy', label: t('ld.col.latePolicy'), kind: 'select', init: x.latePolicy, options: ['accept', 'penalty', 'reject'].map((v) => ({ value: v, label: t(`ld.late.${v}` as MessageKey) })) },
            { name: 'latePenaltyPct', label: t('ld.hw.penalty'), kind: 'number', init: String(x.latePenaltyPct) },
            { name: 'cutoffOn', label: t('ld.hw.cutoff'), kind: 'date', init: x.cutoffOn ?? '' },
            { name: 'maxAttempts', label: t('ld.hw.attempts'), kind: 'number', init: String(x.maxAttempts) },
          ] satisfies Field[]}
        />
      )}
      {sub === 'extend' && (
        <FormDialog
          title={t('ld.hw.extend')}
          onSubmit={(v) => grantExtension(s(row.id), v.studentId, v)}
          onClose={(m) => {
            setSub(null);
            if (m) refresh(m);
          }}
          fields={[
            { name: 'studentId', label: t('ld.col.student'), kind: 'select', required: true, options: roster.map((r) => ({ value: r.studentId, label: `${r.rollNo} ${r.fullName}` })) },
            { name: 'dueOn', label: t('ld.hw.newDue'), kind: 'date', required: true },
            { name: 'reason', label: t('ld.hw.reason') },
          ]}
        />
      )}
      {sub === 'groups' && x && <GroupsDialog homeworkId={s(row.id)} roster={roster} groups={x.groups} onClose={(m) => { setSub(null); if (m) refresh(m); }} />}
    </InfoDialog>
  );
}

/** Puts each student in a group by typing a group name next to them (empty = alone). */
function GroupsDialog({ homeworkId, roster, groups, onClose }: { homeworkId: string; roster: SubmissionRow[]; groups: HomeworkSettings['groups']; onClose: (m?: string) => void }) {
  const { t } = useI18n();
  const [names, setNames] = useState<Record<string, string>>(() => Object.fromEntries(groups.flatMap((g) => g.studentIds.map((id) => [id, g.name]))));
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  return (
    <InfoDialog title={t('ld.hw.groups')} onClose={() => onClose()}>
      <p className="mt-0 text-sm text-muted-foreground">{t('ld.hw.groupsHelp')}</p>
      <div className="flex max-h-[360px] flex-col gap-2 overflow-y-auto">
        {roster.map((r) => (
          <TextInput key={r.studentId} label={`${r.rollNo} ${r.fullName}`} value={names[r.studentId] ?? ''} onChange={(e) => setNames({ ...names, [r.studentId]: e.target.value })} />
        ))}
      </div>
      {error && <p className="text-sm text-red-ink">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="outline" onClick={() => onClose()}>{t('common.cancel')}</Button>
        <Button
          disabled={busy}
          onClick={() =>
            start(async () => {
              const by = new Map<string, string[]>();
              for (const [id, n] of Object.entries(names)) if (n.trim()) by.set(n.trim(), [...(by.get(n.trim()) ?? []), id]);
              const r = await saveGroups(homeworkId, [...by.entries()].map(([name, studentIds]) => ({ name, studentIds })));
              if (!r.ok) return setError(r.error);
              onClose(t('ops.saved'));
            })
          }
        >
          {t('rk.save')}
        </Button>
      </div>
    </InfoDialog>
  );
}

/** Who handed in (late, attempts), marks per student less the late penalty, and the push to internal marks. */
function MarksDialog({ row, onClose, toast }: { row: Row; onClose: () => void; toast: Toast }) {
  const { t, fmt } = useI18n();
  const subs = useRead(() => submissionsOf(s(row.id)));
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [busy, start] = useTransition();
  const rows = subs.data?.students ?? [];
  const max = row.maxMarks === null || row.maxMarks === undefined ? null : Number(row.maxMarks);
  return (
    <InfoDialog title={s(row.title)} onClose={onClose}>
      {!max && <p className="mt-0 text-sm text-muted-foreground">{t('ld.hw.noMax')}</p>}
      <Bar>
        <Button
          disabled={busy || !max}
          onClick={() =>
            start(async () => {
              const entries = Object.entries(marks).filter(([, v]) => v.trim() !== '').map(([studentId, v]) => ({ studentId, marks: Number(v) }));
              if (!entries.length) return;
              const r = await saveMarks(s(row.id), entries);
              toast(r.ok ? t('ops.saved') : r.error);
              if (r.ok) {
                setMarks({});
                subs.reload();
              }
            })
          }
          data-testid="ld-save-marks"
        >
          {t('ld.hw.saveMarks')}
        </Button>
        <ActionButton label={t('ld.hw.push')} run={() => pushMarks(s(row.id))} onDone={toast} disabled={!max} />
      </Bar>
      <Grid
        testId="ld-submissions"
        exportName="submissions"
        empty={t('ld.hw.noStudents')}
        rows={rows}
        cols={[
          { label: t('ld.col.student'), cell: (r) => `${r.rollNo} ${r.fullName}`, sort: (r) => r.rollNo },
          { label: t('ld.col.status'), cell: (r) => (r.status ? t(`ld.sub.${r.status}` as MessageKey) : <Pill warn label={t('ld.sub.missing')} />), sort: (r) => r.status ?? '' },
          { label: t('ld.col.handedOn'), cell: (r) => (r.submittedAt ? fmt.dateTime(r.submittedAt) : '-'), sort: (r) => r.submittedAt ?? '' },
          { label: t('ld.col.late'), cell: (r) => (r.late ? <Pill warn label={r.penaltyPct ? t('ld.sub.latePenalty', { pct: r.penaltyPct }) : t('ld.sub.late')} /> : '-') },
          { label: t('ld.col.tries'), cell: (r) => r.attempts ?? '-', num: true },
          { label: t('ld.col.marks'), cell: (r) => (r.marks === null ? '-' : r.marks), num: true, sort: (r) => r.marks ?? -1 },
          { label: '', cell: (r) => (r.status && max ? <TextInput label={t('ld.hw.enterMarks', { max })} type="number" value={marks[r.studentId] ?? ''} onChange={(e) => setMarks({ ...marks, [r.studentId]: e.target.value })} /> : null) },
        ]}
      />
    </InfoDialog>
  );
}

/** Submission compliance for a class. */
export function ComplianceView({ sections }: { sections: Opt[] }) {
  const { t, fmt } = useI18n();
  const [section, setSection] = useState('');
  const [data, setData] = useState<{ students: number; assignments: ComplianceRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  return (
    <>
      <Bar>
        <SelectInput
          label={t('ld.col.class')}
          value={section}
          onChange={(e) => {
            const v = String(e.target.value);
            setSection(v);
            start(async () => {
              if (!v) return setData(null);
              const r = await compliance(v);
              if (r.ok) setData(r.data);
              else setError(r.error);
            });
          }}
          options={sections.map((x) => ({ value: x.id, label: x.name }))}
          empty={t('lf.pick.class')}
        />
      </Bar>
      {error && <p className="text-sm text-red-ink">{error}</p>}
      {data && (
        <>
          <StatGrid min={140}>
            <StatTile label={t('ld.col.students')} value={data.students} />
            <StatTile label={t('ld.rep.assignments')} value={data.assignments.length} />
            <StatTile label={t('ld.rep.avgCompliance')} value={data.assignments.length ? `${Math.round(data.assignments.reduce((a, r) => a + r.compliancePct, 0) / data.assignments.length)}%` : '-'} />
          </StatGrid>
          <Grid
            testId="ld-compliance"
            exportName="assignment-compliance"
            empty={t('ld.empty.hwTitle')}
            rows={data.assignments}
            cols={[
              { label: t('ld.col.assignment'), cell: (r) => r.title, wrap: true },
              { label: t('ld.col.subject'), cell: (r) => r.subject },
              { label: t('ld.col.due'), cell: (r) => fmt.date(r.dueOn, 'short'), sort: (r) => r.dueOn },
              { label: t('ld.rep.onTime'), cell: (r) => r.onTime, num: true },
              { label: t('ld.col.late'), cell: (r) => r.late, num: true },
              { label: t('ld.rep.missing'), cell: (r) => (r.missing ? <Pill warn label={String(r.missing)} /> : 0), sort: (r) => r.missing },
              { label: t('ld.rep.compliance'), cell: (r) => `${r.compliancePct}%`, num: true, sort: (r) => r.compliancePct },
              { label: t('ld.rep.avgMarks'), cell: (r) => (r.avgMarks === null ? '-' : `${r.avgMarks}${r.maxMarks ? ` / ${r.maxMarks}` : ''}`), num: true, sort: (r) => r.avgMarks ?? -1 },
            ]}
          />
        </>
      )}
    </>
  );
}

// ---- quizzes --------------------------------------------------------------------------------------------

export function QuizzesKit({ meta, page, state, tab, sections, subjects }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const [toast, toastNode] = useToast();
  const [dlg, setDlg] = useState<'add' | Row | null>(null);
  const columns = useKitColumns(meta, [
    { key: 'title', header: 'ld.col.quiz', sortKey: 'title', rowHeader: true },
    { key: 'className', header: 'ld.col.class', hideBelow: 'sm' },
    { key: 'subject', header: 'ld.col.subject', hideBelow: 'md' },
    { key: 'opensAt', header: 'ld.col.opens', kind: 'datetime', sortKey: 'opens' },
    { key: 'status', header: 'ld.col.status', kind: 'choice', tones: { draft: 'neutral', published: 'live', closed: 'success' } },
    { key: 'questions', header: 'ld.col.questions', kind: 'number', hideBelow: 'sm' },
    { key: 'attempts', header: 'ld.col.tries', kind: 'number', sortKey: 'attempts' },
    { key: 'averagePct', header: 'ld.col.average', kind: 'number', hideBelow: 'md' },
  ]);
  return (
    <>
      <RecordsTable
        meta={meta}
        page={page}
        state={state}
        label={t('ld.tab.quizzes')}
        columns={columns}
        extraParams={{ tab }}
        testId="ld-quizzes"
        toolbar={<Button size="sm" variant="outline" className="h-9 rounded-md" onClick={() => setDlg('add')}>{t('ld.qz.add')}</Button>}
        onView={(r) => setDlg(r)}
        extraRowActions={(r) => [{ id: 'manage', label: t('cl.manage'), onSelect: () => setDlg(r) }]}
        empty={emptyFor(meta, <EmptyState icon={<ListChecks />} title={t('ld.empty.qzTitle')}>{t('ld.empty.qz')}</EmptyState>, <Button onClick={() => setDlg('add')}>{t('ld.qz.add')}</Button>)}
      />
      {dlg === 'add' && (
        <FormDialog
          title={t('ld.qz.add')}
          intro={t('ld.qz.addHelp')}
          onSubmit={addQuiz}
          onClose={(m) => {
            setDlg(null);
            if (m) toast(m);
            router.refresh();
          }}
          fields={[
            { name: 'title', label: t('ops.f.title'), required: true },
            { name: 'sectionId', label: t('ld.col.class'), kind: 'select', required: true, options: sections.map((x) => ({ value: x.id, label: x.name })) },
            { name: 'subjectId', label: t('ld.col.subject'), kind: 'select', required: true, options: subjects.map((x) => ({ value: x.id, label: x.name })) },
            { name: 'opensAt', label: t('ld.col.opens'), kind: 'datetime', required: true },
            { name: 'closesAt', label: t('ld.col.closes'), kind: 'datetime', required: true },
            { name: 'durationMin', label: t('ld.qz.minutes'), kind: 'number', init: '30' },
            { name: 'maxAttempts', label: t('ld.col.attempts'), kind: 'number', init: '1' },
            { name: 'drawCount', label: t('ld.qz.draw'), kind: 'number' },
            { name: 'instructions', label: t('ld.qz.instructions'), kind: 'multiline' },
          ]}
        />
      )}
      {dlg && dlg !== 'add' && <QuizDialog row={dlg} onClose={() => { setDlg(null); router.refresh(); }} toast={toast} />}
      {toastNode}
    </>
  );
}

function QuizDialog({ row, onClose, toast }: { row: Row; onClose: () => void; toast: Toast }) {
  const { t } = useI18n();
  const d = useRead<QuizDetail>(() => quizDetail(s(row.id)));
  const [view, setView] = useState<'questions' | 'attempts' | 'analysis'>('questions');
  const [adding, setAdding] = useState(false);
  const refresh = (m: string) => {
    toast(m);
    d.reload();
  };
  const q = d.data;
  return (
    <InfoDialog title={s(row.title)} onClose={onClose}>
      {d.error && <p className="text-sm text-red-ink">{d.error}</p>}
      {q && (
        <>
          <Bar>
            <SelectInput label={t('ld.qz.view')} value={view} onChange={(e) => setView(e.target.value as typeof view)} options={(['questions', 'attempts', 'analysis'] as const).map((v) => ({ value: v, label: t(`ld.qz.view.${v}` as MessageKey) }))} />
            {q.status === 'draft' && <Button variant="outline" onClick={() => setAdding(true)}>{t('ld.qz.addQuestion')}</Button>}
            {q.status === 'draft' && <ActionButton label={t('ld.qz.publish')} run={() => quizStep(q.id, 'publish')} onDone={refresh} />}
            {q.status === 'published' && <ActionButton label={t('ld.qz.close')} run={() => quizStep(q.id, 'close')} onDone={refresh} />}
          </Bar>
          {view === 'questions' && (
            <Grid
              testId="ld-questions"
              empty={t('ld.qz.noQuestions')}
              rows={q.questions}
              cols={[
                { label: '#', cell: (x) => x.position + 1, num: true },
                { label: t('ld.qz.question'), cell: (x) => x.text, wrap: true },
                { label: t('ld.qz.kind'), cell: (x) => t(`ld.qk.${x.kind}` as MessageKey) },
                { label: t('ld.qz.answer'), cell: (x) => (x.kind === 'code' ? t('ld.qz.tests', { n: x.tests.length }) : x.kind === 'short' ? x.answer : x.options.filter((o) => o.correct).map((o) => o.text).join(', ')), wrap: true },
                { label: t('ld.col.marks'), cell: (x) => x.marks, num: true },
                { label: '', cell: (x) => (q.status === 'draft' ? <ActionButton tone="error" label={t('ld.qz.remove')} run={() => dropQuestion(x.id)} onDone={refresh} /> : null) },
              ]}
            />
          )}
          {view === 'attempts' && <AttemptsView quiz={q} toast={toast} />}
          {view === 'analysis' && <AnalysisView quizId={q.id} />}
        </>
      )}
      {adding && q && <QuestionDialog quizId={q.id} onClose={(m) => { setAdding(false); if (m) refresh(m); }} />}
    </InfoDialog>
  );
}

/** A choice, short-answer or coding question: options one per line with a * before the right ones; tests as input => output. */
function QuestionDialog({ quizId, onClose }: { quizId: string; onClose: (m?: string) => void }) {
  const { t } = useI18n();
  const [kind, setKind] = useState<'mcq' | 'multi' | 'short' | 'code'>('mcq');
  const fields: Field[] = [
    { name: 'text', label: t('ld.qz.question'), kind: 'multiline', required: true },
    { name: 'marks', label: t('ld.col.marks'), kind: 'number', init: '1' },
    ...(kind === 'mcq' || kind === 'multi' ? [{ name: 'options', label: t('ld.qz.options'), kind: 'multiline' as const, required: true }] : []),
    ...(kind === 'short' ? [{ name: 'answer', label: t('ld.qz.accepted'), required: true }] : []),
    ...(kind === 'code' ? [{ name: 'language', label: t('ld.qz.language'), kind: 'select' as const, init: 'c', options: [{ value: 'c', label: 'C' }, { value: 'cpp', label: 'C++' }, { value: 'java', label: 'Java' }] }, { name: 'tests', label: t('ld.qz.testCases'), kind: 'multiline' as const, required: true }] : []),
  ];
  return (
    <FormDialog
      key={kind}
      title={t('ld.qz.addQuestion')}
      intro={
        <div className="mb-3">
          <SelectInput label={t('ld.qz.kind')} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} options={(['mcq', 'multi', 'short', 'code'] as const).map((k) => ({ value: k, label: t(`ld.qk.${k}` as MessageKey) }))} />
          <p className="mb-0 text-[13px] text-muted-foreground">{t(`ld.qz.help.${kind}` as MessageKey)}</p>
        </div>
      }
      onSubmit={(v) => {
        const body: Record<string, unknown> = { kind, text: v.text, marks: Number(v.marks || '1') };
        if (kind === 'mcq' || kind === 'multi') body.options = (v.options ?? '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => ({ text: l.replace(/^\*\s*/, ''), correct: l.startsWith('*') }));
        if (kind === 'short') body.answer = v.answer;
        if (kind === 'code') {
          body.language = v.language || 'c';
          body.tests = (v.tests ?? '').split('\n').map((l) => l.split('=>')).filter((p) => p.length === 2).map(([stdin, expected]) => ({ stdin: stdin.trim().replace(/\\n/g, '\n'), expected: expected.trim() }));
        }
        return addQuestion(quizId, body);
      }}
      onClose={onClose}
      fields={fields}
    />
  );
}

function AttemptsView({ quiz, toast }: { quiz: QuizDetail; toast: Toast }) {
  const { t, fmt } = useI18n();
  const a = useRead<QuizAttemptRow[]>(() => quizAttempts(quiz.id));
  const [marking, setMarking] = useState<{ attempt: QuizAttemptRow; questionId: string } | null>(null);
  const qText = (id: string) => quiz.questions.find((q) => q.id === id)?.text ?? '';
  return (
    <>
      <Grid
        testId="ld-attempts"
        exportName="quiz-attempts"
        empty={t('ld.qz.noAttempts')}
        rows={a.data ?? []}
        cols={[
          { label: t('ld.col.student'), cell: (r) => `${r.rollNo} ${r.fullName}`, sort: (r) => r.rollNo },
          { label: '#', cell: (r) => r.attemptNo, num: true },
          { label: t('ld.col.handedOn'), cell: (r) => (r.submittedAt ? fmt.dateTime(r.submittedAt) : t('ld.qz.inProgress')), sort: (r) => r.submittedAt ?? '' },
          { label: t('ld.col.score'), cell: (r) => (r.score === null ? '-' : `${r.score} / ${r.maxScore}`), num: true, sort: (r) => r.score ?? -1 },
          {
            label: '',
            cell: (r) =>
              r.needsMarking
                ? r.questionIds.filter((id) => r.results[id]?.correct === null).map((id) => (
                    <Button key={id} size="sm" variant="outline" onClick={() => setMarking({ attempt: r, questionId: id })}>{t('ld.qz.mark')}</Button>
                  ))
                : null,
          },
        ]}
      />
      {marking && (
        <FormDialog
          title={t('ld.qz.mark')}
          intro={
            <div className="mb-3 text-sm">
              <p className="mt-0 font-medium">{qText(marking.questionId)}</p>
              <pre className="max-h-[200px] overflow-auto rounded-md bg-muted p-2 text-xs">{String(marking.attempt.answers[marking.questionId] ?? '')}</pre>
              <p className="text-muted-foreground">{marking.attempt.results[marking.questionId]?.note}</p>
            </div>
          }
          onSubmit={(v) => markAnswer(marking.attempt.id, marking.questionId, Number(v.marks))}
          onClose={(m) => {
            setMarking(null);
            if (m) {
              toast(m);
              a.reload();
            }
          }}
          fields={[{ name: 'marks', label: t('ld.col.marks'), kind: 'number', required: true }]}
        />
      )}
    </>
  );
}

function AnalysisView({ quizId }: { quizId: string }) {
  const { t } = useI18n();
  const d = useRead<QuizAnalysis>(() => quizAnalysis(quizId));
  if (!d.data) return null;
  const x = d.data;
  return (
    <div data-testid="ld-analysis">
      <StatGrid min={120}>
        <StatTile label={t('ld.col.tries')} value={x.attempts} />
        <StatTile label={t('ld.col.average')} value={x.averagePct === null ? '-' : `${x.averagePct}%`} />
        {x.bands.map((b) => (
          <StatTile key={b.from} label={`${b.from}–${b.to}%`} value={b.n} />
        ))}
      </StatGrid>
      <Grid
        testId="ld-items"
        exportName="item-analysis"
        empty={t('ld.qz.noQuestions')}
        rows={x.items}
        cols={[
          { label: '#', cell: (i) => i.position + 1, num: true },
          { label: t('ld.qz.question'), cell: (i) => i.text, wrap: true },
          { label: t('ld.col.tries'), cell: (i) => i.attempts, num: true },
          { label: t('ld.qz.difficulty'), cell: (i) => (i.difficulty === null ? '-' : i.difficulty), num: true, sort: (i) => i.difficulty ?? -1 },
          { label: t('ld.qz.discrimination'), cell: (i) => (i.discrimination === null ? '-' : <Pill warn={i.discrimination < 0.2} label={String(i.discrimination)} />), sort: (i) => i.discrimination ?? -2 },
        ]}
      />
      <p className="text-[13px] text-muted-foreground">{t('ld.qz.analysisHelp')}</p>
    </div>
  );
}

