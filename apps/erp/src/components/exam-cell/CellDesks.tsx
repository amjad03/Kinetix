'use client';

import { Download, FlaskConical, Lock, Play, RotateCcw, Snowflake, Undo2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { readCell, runCell } from '@/app/(dashboard)/exams/cell/actions';
import { Button } from '@/components/kx';
import { Card, DataTable, Dialog, EmptyState, FormField, FormRow, SelectInput, StatusPill, TextInput, useToast, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { DoubleEntrySheet, DryRunResult, ReportData, ResultRun, RevisionRow, SessionOption, SwapRow } from '@/lib/exam-cell';
import type { Row } from '@/lib/records';
import { CellActionButton, useCellAction } from './CellAction';

import { Alert, Checkbox } from '@/components/kx';

const k = (key: string) => key as MessageKey;

// ---- invigilation: roster and swaps ----------------------------------------------------------------

/** Above the duty list: build the roster for the chosen session. */
export function RosterToolbar({ sessionId, sessions }: { sessionId: string | null; sessions: SessionOption[] }) {
  const { t } = useI18n();
  const name = sessions.find((s) => s.id === sessionId)?.name;
  if (!sessionId) return <span className="text-[13px] text-muted-foreground">{t('xc.pickSessionRoster')}</span>;
  return (
    <CellActionButton
      testId="build-roster"
      spec={{ label: t('xc.act.buildRoster'), path: `/v1/exam-sessions/${sessionId}/duties/auto`, intro: t('xc.rosterIntro', { session: name ?? '' }), fields: [{ name: 'replace', label: t('xc.f.replaceRoster'), type: 'bool', initial: 'false' }], done: t('xc.done.roster') }}
    />
  );
}

/** Swap requests of a session, with approve and refuse. */
export function SwapPanel({ swaps }: { swaps: SwapRow[] }) {
  const { t, fmt } = useI18n();
  const { open, dialog } = useCellAction();
  if (swaps.length === 0) return null;
  const columns: Column<SwapRow>[] = [
    { id: 'duty', header: t('xc.col.date'), rowHeader: true, cell: (r) => `${fmt.date(r.dutyDate, 'short')} ${r.startsAt} · ${r.room}` },
    { id: 'from', header: t('xc.col.onDuty'), cell: (r) => r.onDuty },
    { id: 'to', header: t('xc.col.swapWith'), cell: (r) => r.swapWith },
    { id: 'reason', header: t('xc.col.reason'), hideBelow: 'md', cell: (r) => r.reason },
    { id: 'status', header: t('xc.col.status'), cell: (r) => <StatusPill tone={r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'danger' : 'warning'}>{t(k(`rk.o.invigilation-duties.swap.${r.status}`))}</StatusPill> },
    {
      id: 'act',
      header: '',
      csv: false,
      align: 'right',
      cell: (r) =>
        r.status === 'requested' ? (
          <div className="flex justify-end gap-2">
            <Button size="small" onClick={() => open({ label: t('xc.act.approve'), path: `/v1/invigilation/swaps/${r.id}/decide`, extra: { approve: true }, confirm: t('xc.confirm.swap') })}>{t('xc.act.approve')}</Button>
            <Button size="small" color="error" onClick={() => open({ label: t('xc.act.reject'), tone: 'danger', path: `/v1/invigilation/swaps/${r.id}/decide`, extra: { approve: false }, fields: [{ name: 'note', label: t('xc.f.why'), type: 'textarea', required: true }] })}>
              {t('xc.act.reject')}
            </Button>
          </div>
        ) : null,
    },
  ];
  return (
    <Card title={t('xc.swaps')} className="mt-6">
      <DataTable rows={swaps} columns={columns} rowId={(r) => r.id} label={t('xc.swaps')} />
      {dialog}
    </Card>
  );
}

// ---- postponement ----------------------------------------------------------------------------------

/** Moves a paper to another day or time; candidates are told. */
export function RescheduleButton({ papers }: { papers: { value: string; label: string; sessionId: string }[] }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ paper: '', examDate: '', startsAt: '10:00', endsAt: '13:00', reason: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const paper = papers.find((p) => p.value === v.paper);
  const submit = () =>
    start(async () => {
      if (!paper) return setError(t('xc.f.paper'));
      const res = await runCell('POST', `/v1/exam-sessions/${paper.sessionId}/papers/${paper.value}/reschedule`, { examDate: v.examDate, startsAt: v.startsAt, endsAt: v.endsAt, reason: v.reason });
      if (!res.ok) return setError(res.error);
      setOpen(false);
      toast.success(t('xc.done.rescheduled', { n: Number((res.data as { notified?: number }).notified ?? 0) }));
      router.refresh();
    });
  return (
    <>
      <Button variant="outlined" onClick={() => { setError(null); setOpen(true); }} disabled={papers.length === 0} data-testid="reschedule-open">
        {t('xc.act.reschedule')}
      </Button>
      {open && (
        <Dialog
          title={t('xc.act.reschedule')}
          onClose={() => setOpen(false)}
          busy={busy}
          actions={
            <>
              <Button onClick={() => setOpen(false)}>{t('dx.cancel')}</Button>
              <Button variant="contained" onClick={submit} disabled={busy || !v.paper || !v.examDate || v.reason.trim().length < 5} data-testid="reschedule-submit">
                {t('xc.act.reschedule')}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3 pt-1">
            <p className="text-[13px] leading-[19px] text-muted-foreground">{t('xc.rescheduleIntro')}</p>
            <FormField label={t('xc.f.paper')} required>
              <SelectInput value={v.paper} onChange={(e) => setV({ ...v, paper: e.target.value })} options={papers} empty={t('dx.choose')} fullWidth />
            </FormField>
            <FormField label={t('xc.f.newDate')} required>
              <TextInput type="date" value={v.examDate} onChange={(e) => setV({ ...v, examDate: e.target.value })} fullWidth />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label={t('xc.f.from')} required>
                <TextInput type="time" value={v.startsAt} onChange={(e) => setV({ ...v, startsAt: e.target.value })} fullWidth />
              </FormField>
              <FormField label={t('xc.f.to')} required>
                <TextInput type="time" value={v.endsAt} onChange={(e) => setV({ ...v, endsAt: e.target.value })} fullWidth />
              </FormField>
            </div>
            <FormField label={t('xc.f.reason')} required helper={t('xc.f.reasonTold')}>
              <TextInput multiline minRows={2} value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} fullWidth />
            </FormField>
            {error && <Alert severity="error">{error}</Alert>}
          </div>
        </Dialog>
      )}
    </>
  );
}

/** Candidates who must be in two papers at once (a backlog paper of another session at the same time). */
export function ClashPanel({ clashes }: { clashes: { rollNo: string; name: string; examDate: string; startsAt: string; paperA: string; paperB: string; sessionA: string; sessionB: string }[] }) {
  const { t, fmt } = useI18n();
  return (
    <Card title={t('xc.clash.title')} subtitle={clashes.length ? t('xc.clash.some', { n: clashes.length }) : t('xc.clash.none')} className="mt-6" testId="clashes">
      {clashes.length > 0 && (
        <DataTable
          rows={clashes.map((c, i) => ({ ...c, id: String(i) }))}
          rowId={(r) => r.id}
          label={t('xc.clash.title')}
          columns={[
            { id: 'student', header: t('xc.col.student'), rowHeader: true, cell: (r) => `${r.rollNo} ${r.name}` },
            { id: 'when', header: t('xc.col.date'), cell: (r) => `${fmt.date(r.examDate, 'short')} ${r.startsAt}` },
            { id: 'a', header: t('xc.clash.paperA'), cell: (r) => `${r.paperA} (${r.sessionA})` },
            { id: 'b', header: t('xc.clash.paperB'), cell: (r) => `${r.paperB} (${r.sessionB})` },
          ]}
        />
      )}
    </Card>
  );
}

// ---- valuation: day-wise count ---------------------------------------------------------------------

export function DailyCount({ campId, name, onClose }: { campId: string; name: string; onClose: () => void }) {
  const { t, fmt } = useI18n();
  const [rows, setRows] = useState<{ day: string; examiner: string | null; scripts: number; bundles: number }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void readCell<{ day: string; examiner: string | null; scripts: number; bundles: number }[]>(`/v1/valuation-camps/${campId}/daily`).then((r) => (r.ok ? setRows(r.data) : setError(r.error)));
  }, [campId]);
  return (
    <Dialog title={t('xc.dailyTitle', { name })} onClose={onClose} size="md">
      {error && <Alert severity="error">{error}</Alert>}
      {rows && rows.length === 0 && <p className="text-sm text-muted-foreground">{t('xc.dailyNone')}</p>}
      {rows && rows.length > 0 && (
        <DataTable
          rows={rows.map((r, i) => ({ ...r, id: String(i) }))}
          rowId={(r) => r.id}
          label={t('xc.dailyTitle', { name })}
          columns={[
            { id: 'day', header: t('xc.col.date'), rowHeader: true, cell: (r) => fmt.date(r.day, 'short') },
            { id: 'examiner', header: t('xc.col.examiner'), cell: (r) => r.examiner ?? '-' },
            { id: 'bundles', header: t('xc.col.bundles'), align: 'right', cell: (r) => fmt.number(r.bundles) },
            { id: 'scripts', header: t('xc.col.scripts'), align: 'right', cell: (r) => fmt.number(r.scripts) },
          ]}
        />
      )}
    </Dialog>
  );
}

// ---- double entry ----------------------------------------------------------------------------------

/**
 * Double entry of a paper's external marks: the first and second keyings side by side, mismatches settled
 * against the script, then the agreed marks posted to the paper.
 */
export function DoubleEntryDesk({ sheet, canSettle }: { sheet: DoubleEntrySheet; canSettle: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const { open, dialog } = useCellAction();
  const [round, setRound] = useState<1 | 2>(sheet.rows.some((r) => r.first) ? 2 : 1);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, start] = useTransition();
  const posted = sheet.summary.posted > 0 && sheet.summary.posted === sheet.summary.candidates;
  const keyable = sheet.rows.filter((r) => !r.posted);

  const save = () =>
    start(async () => {
      const entries = keyable
        .map((r) => {
          const raw = (values[r.studentId] ?? '').trim().toUpperCase();
          if (!raw) return null;
          if (raw === 'A' || raw === 'AB') return { studentId: r.studentId, marks: null, absent: true };
          const marks = Number(raw);
          return Number.isFinite(marks) ? { studentId: r.studentId, marks, absent: false } : null;
        })
        .filter((x): x is { studentId: string; marks: number | null; absent: boolean } => !!x);
      if (entries.length === 0) return toast.error(t('xc.de.nothing'));
      const res = await runCell('PUT', `/v1/exam-papers/${sheet.paperId}/double-entry/${round}`, { entries });
      if (!res.ok) return toast.error(res.error);
      setValues({});
      toast.success(t('xc.de.saved', { n: entries.length }));
      router.refresh();
    });

  const cell = (c: { marks: number | null; absent: boolean } | null) => (c ? (c.absent ? t('xc.de.absent') : String(c.marks)) : '-');
  const columns: Column<DoubleEntrySheet['rows'][number] & { id: string }>[] = [
    { id: 'roll', header: t('xc.col.student'), rowHeader: true, cell: (r) => `${r.rollNo} ${r.name}` },
    { id: 'first', header: t('xc.de.first'), align: 'right', cell: (r) => cell(r.first) },
    { id: 'second', header: t('xc.de.second'), align: 'right', cell: (r) => cell(r.second) },
    {
      id: 'entry',
      header: t('xc.de.enter', { n: round }),
      csv: false,
      cell: (r) =>
        r.posted ? (
          <span className="text-muted-foreground">{t('xc.de.posted')}</span>
        ) : (
          <TextInput value={values[r.studentId] ?? ''} onChange={(e) => setValues({ ...values, [r.studentId]: e.target.value })} placeholder={`0–${sheet.maxMarks}`} slotProps={{ htmlInput: { 'aria-label': `${r.rollNo} ${t('xc.de.enter', { n: round })}`, inputMode: 'decimal', 'data-testid': `de-${r.rollNo}`, style: { width: 90 } } }} />
        ),
    },
    {
      id: 'state',
      header: t('xc.col.status'),
      cell: (r) => <StatusPill tone={r.status === 'matched' || r.status === 'resolved' ? 'success' : r.status === 'mismatch' ? 'danger' : 'neutral'}>{r.status === 'resolved' && r.resolved ? `${t('xc.de.status.resolved')} ${cell(r.resolved)}` : t(k(`xc.de.status.${r.status}`))}</StatusPill>,
    },
    {
      id: 'settle',
      header: '',
      csv: false,
      align: 'right',
      cell: (r) =>
        canSettle && r.status === 'mismatch' ? (
          <Button size="small" onClick={() => open({ label: t('xc.de.settle'), path: `/v1/exam-papers/${sheet.paperId}/double-entry/resolve`, extra: { studentId: r.studentId }, intro: t('xc.de.settleIntro', { a: cell(r.first), b: cell(r.second) }), fields: [{ name: 'marks', label: t('xc.f.marksOnScript'), type: 'number', nullable: true }, { name: 'absent', label: t('xc.de.absent'), type: 'bool', initial: 'false' }, { name: 'note', label: t('xc.f.note'), type: 'textarea', required: true }] })}>
            {t('xc.de.settle')}
          </Button>
        ) : null,
    },
  ];
  return (
    <div className="flex flex-col gap-4" data-testid="double-entry">
      <div className="flex flex-wrap gap-2">
        <StatusPill tone="neutral">{t('xc.de.sum.candidates', { n: sheet.summary.candidates })}</StatusPill>
        <StatusPill tone="success">{t('xc.de.sum.matched', { n: sheet.summary.matched + sheet.summary.resolved })}</StatusPill>
        <StatusPill tone={sheet.summary.mismatch ? 'danger' : 'neutral'}>{t('xc.de.sum.mismatch', { n: sheet.summary.mismatch })}</StatusPill>
        <StatusPill tone="warning">{t('xc.de.sum.pending', { n: sheet.summary.pending })}</StatusPill>
      </div>
      <div data-slot="toolbar" className="flex flex-wrap items-end gap-3">
        <FormField label={t('xc.de.round')}>
          <SelectInput value={String(round)} onChange={(e) => setRound(e.target.value === '2' ? 2 : 1)} options={[{ value: '1', label: t('xc.de.first') }, { value: '2', label: t('xc.de.second') }]} />
        </FormField>
        <Button variant="contained" onClick={save} disabled={busy || posted} data-testid="de-save">
          {t('xc.de.saveRound')}
        </Button>
        {canSettle && (
          <CellActionButton spec={{ label: t('xc.de.post'), path: `/v1/exam-papers/${sheet.paperId}/double-entry/post`, confirm: t('xc.de.postConfirm'), done: t('xc.de.postDone') }} disabled={posted || sheet.summary.pending + sheet.summary.mismatch > 0} testId="de-post" />
        )}
      </div>
      <p className="text-[13px] leading-[19px] text-muted-foreground">{t('xc.de.hint')}</p>
      <DataTable rows={sheet.rows.map((r) => ({ ...r, id: r.studentId }))} columns={columns} rowId={(r) => r.id} label={`${sheet.code} ${sheet.subject}`} />
      {dialog}
    </div>
  );
}

// ---- result processing -----------------------------------------------------------------------------

export function ResultsDesk({ session, runs, revisions, students, subjects, canUnpublish }: { session: SessionOption; runs: ResultRun[]; revisions: RevisionRow[]; students: { value: string; label: string }[]; subjects: { value: string; label: string }[]; canUnpublish: boolean }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const [dry, setDry] = useState<DryRunResult | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();
  const base = `/v1/exam-sessions/${session.id}`;
  const st = session.status;
  const frozen = !!session.frozenAt;
  const runDry = () =>
    start(async () => {
      const res = await runCell<DryRunResult>('POST', `${base}/dry-run`);
      if (!res.ok) return toast.error(res.error);
      setDry(res.data);
      router.refresh();
    });
  const reason = [{ name: 'reason', label: t('xc.f.reason'), type: 'textarea' as const, required: true }];
  return (
    <div className="flex flex-col gap-6">
      <Card title={t('xc.rd.title')} subtitle={t('xc.rd.state', { status: t(k(`rk.o.exam-sessions.status.${st}`)), frozen: frozen ? t('xc.rd.frozen') : t('xc.rd.notFrozen') })}>
        <div className="flex flex-wrap gap-2" data-testid="results-actions">
          <Button variant="outlined" startIcon={<FlaskConical />} onClick={runDry} disabled={busy || st === 'draft'} data-testid="dry-run">
            {t('xc.act.dryRun')}
          </Button>
          <CellActionButton spec={{ label: t('xc.act.process'), path: `${base}/process`, confirm: t('xc.confirm.process'), done: t('xc.done.processed') }} variant="contained" disabled={!(st === 'scheduled' || st === 'processed') || frozen} />
          {st === 'processed' && !frozen && <CellActionButton spec={{ label: t('xc.act.freeze'), path: `${base}/freeze`, confirm: t('xc.confirm.freeze') }} />}
          {st === 'processed' && frozen && <CellActionButton spec={{ label: t('xc.act.unfreeze'), path: `${base}/unfreeze`, fields: reason }} />}
          {st === 'processed' && !frozen && <CellActionButton spec={{ label: t('xc.act.rollback'), path: `${base}/rollback`, intro: t('xc.rollbackIntro'), fields: reason, tone: 'danger' }} />}
          {st === 'processed' && <CellActionButton spec={{ label: t('xc.act.publish'), path: `${base}/publish`, confirm: t('xc.confirm.publish'), done: t('xc.done.published') }} variant="contained" />}
          {st === 'published' && canUnpublish && <CellActionButton spec={{ label: t('xc.act.unpublish'), path: `${base}/unpublish`, intro: t('xc.unpublishIntro'), fields: reason, tone: 'danger' }} />}
          <Button variant="text" startIcon={<Download />} component="a" href={`/api/exam-cell?kind=internal&sessionId=${session.id}`}>
            {t('xc.act.internalExport')}
          </Button>
        </div>
        <p className="mt-3 text-[13px] leading-[19px] text-muted-foreground">{t('xc.rd.hint')}</p>
      </Card>

      {dry && (
        <Card title={t('xc.rd.dryTitle')} subtitle={t('xc.rd.drySummary', { students: dry.students, passed: dry.passed, failed: dry.failed, changed: dry.changed })}>
          {dry.problems.length > 0 && (
            <Alert severity="warning" className="mb-3">
              <div className="font-medium">{t('xc.rd.problems')}</div>
              <ul className="ml-4 list-disc">{dry.problems.map((p) => <li key={p}>{p}</li>)}</ul>
            </Alert>
          )}
          {dry.changes.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('xc.rd.noChanges')}</p>
          ) : (
            <DataTable
              rows={dry.changes.map((c) => ({ ...c, id: c.studentId }))}
              rowId={(r) => r.id}
              label={t('xc.rd.dryTitle')}
              columns={[
                { id: 'student', header: t('xc.col.student'), rowHeader: true, cell: (r) => `${r.rollNo ?? ''} ${r.name ?? ''}` },
                { id: 'kind', header: t('xc.col.change'), cell: (r) => t(k(`xc.rd.kind.${r.kind}`)) },
                { id: 'sgpa', header: t('xc.col.sgpa'), align: 'right', cell: (r) => `${r.before ? fmt.number(r.before.sgpa) : '-'} → ${r.after ? fmt.number(r.after.sgpa) : '-'}` },
                { id: 'outcome', header: t('xc.col.result'), cell: (r) => `${r.before ? t(k(`xc.outcome.${r.before.outcome}`)) : '-'} → ${r.after ? t(k(`xc.outcome.${r.after.outcome}`)) : '-'}` },
                { id: 'subjects', header: t('xc.col.grades'), hideBelow: 'md', cell: (r) => r.subjects.map((x) => `${x.code}: ${x.before ?? '-'}→${x.after ?? '-'}`).join(', ') },
              ]}
            />
          )}
        </Card>
      )}

      {(st === 'published' || st === 'locked') && (
        <Card title={t('xc.rd.changeTitle')} subtitle={t('xc.rd.changeHint')}>
          <CellActionButton
            spec={{
              label: t('xc.act.changeResult'),
              path: `${base}/results/{studentId}/change`,
              fields: [
                { name: 'studentId', label: t('xc.col.student'), type: 'select', required: true, options: students },
                { name: 'subjectId', label: t('xc.col.subject'), type: 'select', required: true, options: subjects },
                { name: 'marks', label: t('xc.f.correctMarks'), type: 'number', nullable: true },
                { name: 'absent', label: t('xc.de.absent'), type: 'bool', initial: 'false' },
                { name: 'reason', label: t('xc.f.reason'), type: 'textarea', required: true },
              ],
              done: t('xc.done.changed'),
            }}
            testId="change-result"
          />
        </Card>
      )}

      <Card title={t('xc.rd.runs')}>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('xc.rd.noRuns')}</p>
        ) : (
          <DataTable
            rows={runs}
            rowId={(r) => r.id}
            label={t('xc.rd.runs')}
            columns={[
              { id: 'at', header: t('xc.col.when'), rowHeader: true, cell: (r) => fmt.dateTime(r.at) },
              { id: 'kind', header: t('xc.col.step'), cell: (r) => <span className="inline-flex items-center gap-1">{RUN_ICON[r.kind]}{t(k(`xc.run.${r.kind}`))}</span> },
              { id: 'what', header: t('xc.col.what'), hideBelow: 'sm', cell: (r) => runSummary(t, r) },
              { id: 'by', header: t('xc.col.by'), hideBelow: 'md', cell: (r) => r.by ?? '' },
              { id: 'note', header: t('xc.col.note'), hideBelow: 'lg', cell: (r) => r.note ?? '' },
            ]}
          />
        )}
      </Card>

      <Card title={t('xc.rd.revisions')}>
        {revisions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('xc.rd.noRevisions')}</p>
        ) : (
          <DataTable
            rows={revisions}
            rowId={(r) => r.id}
            label={t('xc.rd.revisions')}
            columns={[
              { id: 'student', header: t('xc.col.student'), rowHeader: true, cell: (r) => `${r.rollNo} ${r.name}` },
              { id: 'version', header: t('xc.col.version'), align: 'right', cell: (r) => fmt.number(r.version) },
              { id: 'kind', header: t('xc.col.kind'), cell: (r) => t(k(`xc.rev.${r.kind}`)) },
              { id: 'sgpa', header: t('xc.col.sgpa'), align: 'right', cell: (r) => `${r.sgpaBefore ?? '-'} → ${r.sgpaAfter ?? '-'}` },
              { id: 'reason', header: t('xc.col.reason'), hideBelow: 'md', cell: (r) => r.reason },
              { id: 'at', header: t('xc.col.when'), hideBelow: 'sm', cell: (r) => fmt.dateTime(r.at) },
            ]}
          />
        )}
      </Card>
    </div>
  );
}

const RUN_ICON: Record<string, React.ReactNode> = { process: <Play className="size-3.5" />, freeze: <Snowflake className="size-3.5" />, unfreeze: <Snowflake className="size-3.5" />, rollback: <RotateCcw className="size-3.5" />, publish: <Lock className="size-3.5" />, unpublish: <Undo2 className="size-3.5" />, dry_run: <FlaskConical className="size-3.5" /> };

function runSummary(t: (key: MessageKey, v?: Record<string, string | number>) => string, r: ResultRun): string {
  const s = r.summary as Record<string, number | boolean | string[] | undefined>;
  if (r.kind === 'process' || r.kind === 'dry_run') return t('xc.rd.runLine', { students: Number(s.students ?? 0), passed: Number(s.passed ?? 0), changed: Number(s.changes ?? s.changed ?? 0) }) + (s.rolledBack ? ` · ${t('xc.rd.rolledBack')}` : '');
  if (r.kind === 'rollback') return t('xc.rd.rollbackLine', { n: Number(s.restored ?? 0) });
  return '';
}

// ---- registers -------------------------------------------------------------------------------------

export function ReportView({ data, csvHref }: { data: ReportData; csvHref: string }) {
  const { t, fmt } = useI18n();
  const rows = useMemo(() => data.rows.map((r, i) => ({ ...r, id: String(i) })) as (Row & Record<string, unknown>)[], [data.rows]);
  const show = (v: unknown) => (typeof v === 'number' ? fmt.number(v, { maximumFractionDigits: 2 }) : v === null || v === undefined ? '' : String(v));
  const columns: Column<Row>[] = data.columns.map((c, i) => ({ id: c.key, header: reportHeader(t, data.report, c), rowHeader: i === 0, align: typeof data.rows[0]?.[c.key] === 'number' ? 'right' : undefined, cell: (r) => show(r[c.key]), sort: (r) => (r[c.key] as string | number | null) ?? '' }));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] text-muted-foreground">{t('xc.rep.count', { n: data.rows.length })}</span>
        <Button variant="outlined" startIcon={<Download />} component="a" href={csvHref} data-testid="report-csv">
          {t('xc.rep.csv')}
        </Button>
      </div>
      {data.rows.length === 0 ? (
        <EmptyState title={t('xc.rep.empty')} testId="report-empty">{t(k(`xc.rep.emptyBody.${data.report}`))}</EmptyState>
      ) : (
        <DataTable rows={rows} columns={columns} rowId={(r) => r.id} label={t(k(`xc.rep.${data.report}`))} />
      )}
      {data.totals && (
        <p className="text-[13px] leading-[19px]" data-testid="report-totals">
          {data.columns.filter((c) => data.totals![c.key] !== undefined && data.totals![c.key] !== '').map((c) => `${reportHeader(t, data.report, c)}: ${show(data.totals![c.key])}`).join(' · ')}
        </p>
      )}
    </div>
  );
}

/** Column headings of a register in the person's language (subject codes stay as they are). */
function reportHeader(t: (key: MessageKey) => string, report: string, c: { key: string; label: string }) {
  if (c.key.startsWith('sub:')) return c.label;
  const key = `xc.rc.${c.key}` as MessageKey;
  const v = t(key);
  return v === key ? c.label : v;
}

// ---- settings --------------------------------------------------------------------------------------

export function CellSettingsForm({ settings }: { settings: import('@/lib/exam-cell').CellSettings }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [s, setS] = useState(settings);
  const [lateText, setLateText] = useState(settings.lateFeeSlabs.map((x) => `${x.afterDays}, ${x.amountPaise / 100}, ${x.label}`).join('\n'));
  const [attText, setAttText] = useState(settings.attendanceSlabs.map((x) => `${x.minPercent}, ${x.percentOfMax}`).join('\n'));
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const rupees = (p: number) => String(p / 100);
  const paise = (v: string) => Math.round(Number(v || 0) * 100);
  const save = () =>
    start(async () => {
      setError(null);
      const late = lateText.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => l.split(',').map((x) => x.trim()));
      const att = attText.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => l.split(',').map((x) => x.trim()));
      if (late.some((p) => p.length < 3 || !Number.isFinite(Number(p[0])) || !Number.isFinite(Number(p[1])))) return setError(t('xc.set.badLate'));
      if (att.some((p) => p.length < 2 || !Number.isFinite(Number(p[0])) || !Number.isFinite(Number(p[1])))) return setError(t('xc.set.badAtt'));
      const body = { ...s, lateFeeSlabs: late.map((p) => ({ afterDays: Number(p[0]), amountPaise: paise(p[1]), label: p.slice(2).join(', ') })), attendanceSlabs: att.map((p) => ({ minPercent: Number(p[0]), percentOfMax: Number(p[1]) })) };
      const res = await runCell('PUT', '/v1/exam-cell/settings', body as unknown as Record<string, unknown>);
      if (!res.ok) return setError(res.error);
      toast.success(t('dx.saved'));
      router.refresh();
    });
  const num = (label: string, value: string, on: (v: string) => void, helper?: string) => (
    <FormField label={label} helper={helper}>
      <TextInput type="number" value={value} onChange={(e) => on(e.target.value)} fullWidth slotProps={{ htmlInput: { step: 'any', min: 0 } }} />
    </FormField>
  );
  return (
    <div className="flex flex-col gap-6" data-testid="cell-settings">
      <Card title={t('xc.set.results')}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField label={t('xc.set.attempt')} helper={t('xc.set.attemptHelp')}>
            <SelectInput value={s.attemptPolicy} onChange={(e) => setS({ ...s, attemptPolicy: e.target.value === 'latest' ? 'latest' : 'best' })} options={[{ value: 'best', label: t('xc.set.best') }, { value: 'latest', label: t('xc.set.latest') }]} fullWidth />
          </FormField>
          {num(t('xc.set.reval'), s.revaluationThresholdPercent === null ? '' : String(s.revaluationThresholdPercent), (v) => setS({ ...s, revaluationThresholdPercent: v === '' ? null : Number(v) }), t('xc.set.revalHelp'))}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={s.ranks.excludeRepeaters} onChange={(e) => setS({ ...s, ranks: { excludeRepeaters: e.target.checked } })} />
            {t('xc.set.excludeRepeaters')}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={s.medal.firstAttemptOnly} onChange={(e) => setS({ ...s, medal: { ...s.medal, firstAttemptOnly: e.target.checked } })} />
            {t('xc.set.medalFirst')}
          </label>
          {num(t('xc.set.medalMin'), String(s.medal.minCgpa), (v) => setS({ ...s, medal: { ...s.medal, minCgpa: Number(v) } }))}
        </div>
      </Card>
      <Card title={t('xc.set.fees')}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField label={t('xc.set.lateSlabs')} helper={t('xc.set.lateSlabsHelp')}>
            <TextInput multiline minRows={3} value={lateText} onChange={(e) => setLateText(e.target.value)} fullWidth />
          </FormField>
          <div className="flex flex-col gap-4">
            {num(t('xc.set.duplicateFee'), rupees(s.duplicateFeePaise), (v) => setS({ ...s, duplicateFeePaise: paise(v) }))}
            {num(t('xc.set.verificationFee'), rupees(s.verificationFeePaise), (v) => setS({ ...s, verificationFeePaise: paise(v) }))}
          </div>
        </div>
      </Card>
      <Card title={t('xc.set.internal')}>
        <FormField label={t('xc.set.attSlabs')} helper={t('xc.set.attSlabsHelp')}>
          <TextInput multiline minRows={4} value={attText} onChange={(e) => setAttText(e.target.value)} fullWidth />
        </FormField>
      </Card>
      <Card title={t('xc.set.pay')}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {num(t('xc.set.invigilator'), rupees(s.rates.invigilatorPaise), (v) => setS({ ...s, rates: { ...s.rates, invigilatorPaise: paise(v) } }))}
          {num(t('xc.set.chief'), rupees(s.rates.chiefPaise), (v) => setS({ ...s, rates: { ...s.rates, chiefPaise: paise(v) } }))}
          {num(t('xc.set.perScript'), rupees(s.rates.valuationPerScriptPaise), (v) => setS({ ...s, rates: { ...s.rates, valuationPerScriptPaise: paise(v) } }))}
          {num(t('xc.set.chiefExaminer'), rupees(s.rates.chiefExaminerPerDayPaise), (v) => setS({ ...s, rates: { ...s.rates, chiefExaminerPerDayPaise: paise(v) } }))}
          {num(t('xc.set.ratio'), String(s.perInvigilator), (v) => setS({ ...s, perInvigilator: Number(v) }), t('xc.set.ratioHelp'))}
        </div>
      </Card>
      {error && <Alert severity="error">{error}</Alert>}
      <FormRow labelled={false}>
        <Button variant="contained" onClick={save} disabled={busy} data-testid="cell-settings-save">
          {t('xc.set.save')}
        </Button>
      </FormRow>
    </div>
  );
}
