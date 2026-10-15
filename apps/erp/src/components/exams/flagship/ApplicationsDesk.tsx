'use client';

import { FileSignature } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { readCell, runCell } from '@/app/(dashboard)/exams/cell/actions';
import { Alert, Button, CircularProgress, MenuItem } from '@/components/kx';
import { Bar, Grid, Pill } from '@/components/ops/kit';
import { CheckboxField, Dialog, FormField, StatGrid, StatTile, StatusPill, TextInput, useToastOptional } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { chosenRepeats, feeFor, type ApplicationRow, type ApplicationView } from '@/lib/exam-flagship';

export interface CandidateOption {
  id: string;
  label: string;
}

const FEE_TONE = { due: 'warning', paid: 'success', waived: 'neutral' } as const;

/**
 * The examination applications of a session: who applied for which papers (this term's, backlog, improvement), who is
 * held back and why, and the exam fee on each candidate's fee account. The office opens any application to change the
 * subjects, submit it for the candidate, withdraw it or let an ineligible candidate through.
 */
export function ApplicationsDesk({ sessionId, rows, candidates, canManage, windowState }: { sessionId: string; rows: ApplicationRow[]; candidates: CandidateOption[]; canManage: boolean; windowState: string | null }) {
  const { t, fmt } = useI18n();
  const [open, setOpen] = useState<string | null>(null);
  const [pick, setPick] = useState(false);
  const stats = useMemo(
    () => ({
      total: rows.length,
      registered: rows.filter((r) => r.status === 'registered').length,
      ineligible: rows.filter((r) => r.status === 'ineligible').length,
      due: rows.filter((r) => r.feeStatus === 'due').reduce((a, r) => a + Number(r.feePaise ?? 0), 0),
      paid: rows.filter((r) => r.feeStatus === 'paid').reduce((a, r) => a + Number(r.feePaise ?? 0), 0),
      repeats: rows.reduce((a, r) => a + r.backlog + r.improvement, 0),
    }),
    [rows],
  );
  return (
    <>
      <StatGrid>
        <StatTile label={t('xf.app.stat.total')} value={fmt.number(stats.total)} testId="xf-app-total" />
        <StatTile label={t('xf.app.stat.registered')} value={fmt.number(stats.registered)} />
        <StatTile label={t('xf.app.stat.ineligible')} value={fmt.number(stats.ineligible)} tone={stats.ineligible ? 'warning' : 'default'} />
        <StatTile label={t('xf.app.stat.repeats')} value={fmt.number(stats.repeats)} />
        <StatTile label={t('xf.app.stat.due')} value={fmt.rupees(Number(stats.due ?? 0))} tone={stats.due ? 'warning' : 'default'} />
        <StatTile label={t('xf.app.stat.paid')} value={fmt.rupees(Number(stats.paid ?? 0))} />
      </StatGrid>
      {canManage && (
        <Bar>
          <Button variant="outlined" onClick={() => setPick(true)} disabled={!candidates.length} data-testid="xf-app-new">
            {t('xf.app.new')}
          </Button>
          {windowState && <span className="text-sm text-muted-foreground self-center">{t(`er.state.${windowState}` as MessageKey)}</span>}
        </Bar>
      )}
      <Grid
        testId="xf-applications"
        exportName="exam-applications"
        empty={t('xf.app.empty')}
        emptyIcon={<FileSignature />}
        rows={rows}
        tint={(r) => r.status === 'ineligible'}
        cols={[
          { label: t('exm.f.roll'), cell: (r) => r.rollNo, sort: (r) => r.rollNo },
          { label: t('exm.f.student'), cell: (r) => r.student, sort: (r) => r.student },
          { label: t('xf.app.col.class'), cell: (r) => r.section },
          { label: t('xf.app.col.no'), cell: (r) => r.applicationNo ?? '-' },
          { label: t('xf.app.col.papers'), cell: (r) => t('xf.app.papers', { regular: r.regular, backlog: r.backlog, improvement: r.improvement }), sort: (r) => r.regular + r.backlog + r.improvement },
          { label: t('exm.status'), cell: (r) => <Pill label={t(r.status === 'registered' ? (r.overridden ? 'xf.app.overridden' : 'er.status.registered') : 'er.status.ineligible')} warn={r.status === 'ineligible'} />, sort: (r) => r.status },
          { label: t('xf.app.col.fee'), cell: (r) => (r.feeStatus ? <StatusPill tone={FEE_TONE[r.feeStatus]}>{`${fmt.rupees(Number(r.feePaise ?? 0))} ${t(`xf.fee.${r.feeStatus}` as MessageKey)}`}</StatusPill> : '-'), sort: (r) => r.feeStatus ?? '' },
          { label: t('xf.app.col.invoice'), cell: (r) => r.receiptNo ?? r.invoiceNo ?? '-' },
          { label: t('xf.app.col.reasons'), wrap: true, cell: (r) => r.reasons.join('; ') || '-' },
          { label: '', cell: (r) => <Button size="small" onClick={() => setOpen(r.studentId)} data-testid={`xf-open-${r.rollNo}`}>{t('xf.app.open')}</Button> },
        ]}
      />
      {pick && (
        <PickCandidate
          candidates={candidates}
          onClose={(id) => {
            setPick(false);
            if (id) setOpen(id);
          }}
        />
      )}
      {open && <ApplicationDialog sessionId={sessionId} studentId={open} canManage={canManage} onClose={() => setOpen(null)} />}
    </>
  );
}

function PickCandidate({ candidates, onClose }: { candidates: CandidateOption[]; onClose: (id?: string) => void }) {
  const { t } = useI18n();
  const [id, setId] = useState('');
  return (
    <Dialog
      title={t('xf.app.new')}
      onClose={() => onClose()}
      actions={
        <>
          <Button onClick={() => onClose()}>{t('ops.cancel')}</Button>
          <Button variant="contained" disabled={!id} onClick={() => onClose(id)} data-testid="xf-pick-go">
            {t('xf.app.open')}
          </Button>
        </>
      }
    >
      <FormField label={t('exm.f.student')} required>
        <TextInput select value={id} onChange={(e) => setId(e.target.value)} fullWidth slotProps={{ htmlInput: { 'data-testid': 'xf-pick' } }}>
          {candidates.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.label}
            </MenuItem>
          ))}
        </TextInput>
      </FormField>
    </Dialog>
  );
}

/** One candidate's application: the subjects with their eligibility, the choice of repeat papers, the fee. */
export function ApplicationDialog({ sessionId, studentId, canManage, onClose }: { sessionId: string; studentId: string; canManage: boolean; onClose: () => void }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const toast = useToastOptional();
  const [view, setView] = useState<ApplicationView | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState<'view' | 'withdraw' | 'override'>('view');
  const [busy, start] = useTransition();

  useEffect(() => {
    let live = true;
    readCell<ApplicationView>(`/v1/exam-sessions/${sessionId}/application/${studentId}`).then((res) => {
      if (!live) return;
      if (!res.ok) return setError(res.error);
      setView(res.data);
      setChosen(new Set(chosenRepeats(res.data)));
    });
    return () => {
      live = false;
    };
  }, [sessionId, studentId]);

  const run = (path: string, body: Record<string, unknown>, done: string) =>
    start(async () => {
      setError(null);
      const res = await runCell<ApplicationView>('POST', path, body);
      if (!res.ok) return setError(res.error);
      toast?.success(done);
      router.refresh();
      if (path.endsWith('/application')) {
        setView(res.data);
        setChosen(new Set(chosenRepeats(res.data)));
      } else onClose();
    });

  const total = view ? feeFor(view, chosen) : 0;
  const app = view?.application;
  const editable = !!view && canManage && !['processed', 'published', 'locked'].includes(view.session.status) && (!app?.fee || app.fee.status === 'due');
  return (
    <Dialog
      size="lg"
      title={view ? t('xf.app.title', { name: view.student.name, roll: view.student.rollNo }) : t('xf.app.loading')}
      onClose={onClose}
      busy={busy}
      actions={
        mode === 'view' ? (
          <>
            <Button onClick={onClose} disabled={busy}>
              {t('ops.close')}
            </Button>
            {app && editable && (
              <Button color="error" onClick={() => setMode('withdraw')} disabled={busy} data-testid="xf-withdraw">
                {t('xf.app.withdraw')}
              </Button>
            )}
            {app?.status === 'ineligible' && canManage && (
              <Button onClick={() => setMode('override')} disabled={busy} data-testid="xf-override">
                {t('er.override')}
              </Button>
            )}
            {editable && (
              <Button variant="contained" onClick={() => run(`/v1/exam-sessions/${sessionId}/application`, { studentId, subjectIds: [...chosen] }, t('xf.app.submitted'))} disabled={busy || !view?.subjects.length} startIcon={busy ? <CircularProgress size={16} /> : undefined} data-testid="xf-submit">
                {app ? t('xf.app.update') : t('xf.app.submit')}
              </Button>
            )}
          </>
        ) : (
          <>
            <Button onClick={() => setMode('view')} disabled={busy}>
              {t('ops.cancel')}
            </Button>
            <Button
              variant="contained"
              color={mode === 'withdraw' ? 'error' : 'primary'}
              disabled={busy || reason.trim().length < 3}
              onClick={() => (mode === 'withdraw' ? run(`/v1/exam-sessions/${sessionId}/application/${studentId}/withdraw`, { reason: reason.trim() }, t('xf.app.withdrawn')) : run(`/v1/exam-sessions/${sessionId}/registrations/${studentId}/override`, { reason: reason.trim() }, t('xf.app.overrideDone')))}
              data-testid="xf-confirm"
            >
              {mode === 'withdraw' ? t('xf.app.withdraw') : t('er.override')}
            </Button>
          </>
        )
      }
    >
      {!view ? (
        error ? <Alert severity="error">{error}</Alert> : <CircularProgress size={20} />
      ) : mode !== 'view' ? (
        <div className="flex flex-col gap-3 pt-1">
          <p className="m-0 text-sm text-muted-foreground">{mode === 'withdraw' ? t('xf.app.withdrawIntro') : t('xf.app.overrideIntro')}</p>
          <FormField label={t('xf.app.reason')} required>
            <TextInput multiline minRows={2} value={reason} onChange={(e) => setReason(e.target.value)} fullWidth slotProps={{ htmlInput: { 'data-testid': 'xf-reason' } }} />
          </FormField>
          {error && <Alert severity="error">{error}</Alert>}
        </div>
      ) : (
        <div className="flex flex-col gap-4 pt-1" data-testid="xf-application">
          <div className="text-sm leading-[21px]">
            <div>{view.session.name} · {view.student.section}</div>
            <div className="text-muted-foreground">
              {view.window ? t('xf.app.window', { from: fmt.date(view.window.opensOn), to: fmt.date(view.window.lateUntil ?? view.window.closesOn), state: t(`er.state.${view.window.state}` as MessageKey) }) : t('er.window.none')}
              {' · '}
              {t('xf.app.rules', { min: view.rules.minAttendancePercent })}
              {view.rules.condonableToPercent !== null ? ` ${t('xf.app.condone', { n: view.rules.condonableToPercent })}` : ''}
              {view.rules.internalEligibilityPercent !== null ? ` ${t('xf.app.ne', { n: view.rules.internalEligibilityPercent })}` : ''}
            </div>
          </div>
          {app && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <b>{app.applicationNo ?? '-'}</b>
              <Pill label={t(app.status === 'registered' ? 'er.status.registered' : 'er.status.ineligible')} warn={app.status === 'ineligible'} />
              {app.fee && <StatusPill tone={FEE_TONE[app.fee.status as keyof typeof FEE_TONE] ?? 'neutral'}>{`${fmt.rupees(Number(app.fee.amountPaise ?? 0))} ${t(`xf.fee.${app.fee.status}` as MessageKey)}`}</StatusPill>}
              {app.fee?.invoiceNo && <span className="text-muted-foreground">{t('xf.app.invoice', { no: app.fee.invoiceNo })}</span>}
              {app.fee?.receiptNo && <span className="text-muted-foreground">{t('xf.app.receipt', { no: app.fee.receiptNo })}</span>}
            </div>
          )}
          {view.blockers.length > 0 && (
            <Alert severity="warning" data-testid="xf-blockers">
              {view.blockers.join('; ')}
            </Alert>
          )}
          {view.subjects.length === 0 ? (
            <p className="m-0 text-sm">{t('xf.app.noSubjects')}</p>
          ) : (
            <div className="flex flex-col divide-y divide-border rounded-md border border-border">
              {view.subjects.map((s) => (
                <div key={s.subjectId} className="flex flex-wrap items-start justify-between gap-3 px-3 py-2" data-testid={`xf-subject-${s.code}`}>
                  <div className="min-w-0 flex-1">
                    {s.kind === 'regular' ? (
                      <div className="text-sm font-medium">
                        {s.code} {s.name}
                      </div>
                    ) : (
                      <CheckboxField label={`${s.code} ${s.name}`} checked={chosen.has(s.subjectId)} disabled={!editable || busy} onChange={(c) => setChosen((x) => { const n = new Set(x); if (c) n.add(s.subjectId); else n.delete(s.subjectId); return n; })} />
                    )}
                    <div className="text-[13px] text-muted-foreground">
                      {t(`xf.kind.${s.kind}` as MessageKey)}
                      {s.credits ? ` · ${t('xf.app.credits', { n: s.credits })}` : ''}
                      {s.examDate ? ` · ${fmt.date(s.examDate, 'short')} ${s.startsAt ?? ''}` : ''}
                    </div>
                    {s.reasons.length > 0 && <div className="text-[13px] text-red-ink">{s.reasons.join('; ')}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Pill label={s.eligible ? t('xf.app.eligible') : t('xf.app.notEligible')} warn={!s.eligible} />
                    <span className="tabular-nums text-sm">{fmt.rupees(s.eligible ? s.feePaise : 0)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="text-sm" data-testid="xf-fee">
            {t('xf.app.feeLine', { total: fmt.rupees(total), min: fmt.rupees(view.fee.minimumPaise) })}
            {view.fee.lateFeePaise > 0 ? ` ${t('xf.app.lateLine', { late: fmt.rupees(view.fee.lateFeePaise), slab: view.fee.lateSlab ?? t('xf.app.lateFee') })}` : ''}
          </div>
          {error && <Alert severity="error">{error}</Alert>}
        </div>
      )}
    </Dialog>
  );
}
