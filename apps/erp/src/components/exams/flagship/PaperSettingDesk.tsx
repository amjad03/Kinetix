'use client';

import { FileQuestion } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { readCell, runCell } from '@/app/(dashboard)/exams/cell/actions';
import { Alert, Button, CircularProgress } from '@/components/kx';
import { FormDialog, Grid, Pill } from '@/components/ops/kit';
import { Card, Dialog, EmptyState, StatGrid, StatTile, StatusPill, useToastOptional, type Tone } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { spread, type QpAppointment, type QpCoverageDetail, type QpOverview, type QpSet, type QpSubject, type StaffOption } from '@/lib/exam-flagship';

const SET_TONE: Record<string, Tone> = { draft: 'neutral', scrutiny: 'warning', returned: 'danger', approved: 'info', locked: 'success' };
const APP_TONE: Record<string, Tone> = { appointed: 'warning', accepted: 'info', in_progress: 'info', submitted: 'info', completed: 'success', declined: 'danger', cancelled: 'neutral' };

/**
 * Question paper setting of a session: per subject the appointed setter and moderator, the sets they made from the
 * question bank with what each covers (outcomes, Bloom levels, higher-order share, overlap with the other sets), the
 * draw of the set the examination uses and its sealed release.
 */
export function PaperSettingDesk({ overview, staff, canManage }: { overview: QpOverview; staff: StaffOption[]; canManage: boolean }) {
  const { t, fmt } = useI18n();
  const { summary } = overview;
  return (
    <>
      <StatGrid>
        <StatTile label={t('xf.qp.stat.subjects')} value={fmt.number(summary.subjects)} testId="xf-qp-subjects" />
        <StatTile label={t('xf.qp.stat.withSetter')} value={`${fmt.number(summary.withSetter)} / ${fmt.number(summary.subjects)}`} tone={summary.withSetter < summary.subjects ? 'warning' : 'default'} />
        <StatTile label={t('xf.qp.stat.locked')} value={fmt.number(summary.setsLocked)} />
        <StatTile label={t('xf.qp.stat.drawn')} value={`${fmt.number(summary.drawn)} / ${fmt.number(summary.subjects)}`} />
        <StatTile label={t('xf.qp.stat.overdue')} value={fmt.number(summary.overdue)} tone={summary.overdue ? 'warning' : 'default'} />
      </StatGrid>
      {overview.subjects.length === 0 ? (
        <EmptyState icon={<FileQuestion />} title={t('xf.qp.empty')} testId="xf-qp-empty">
          {t('xf.qp.emptyBody')}
        </EmptyState>
      ) : (
        <div className="grid gap-4">
          {overview.subjects.map((s) => (
            <SubjectCard key={s.subjectId} sessionId={overview.session.id} subject={s} staff={staff} canManage={canManage && ['draft', 'scheduled'].includes(overview.session.status)} />
          ))}
        </div>
      )}
    </>
  );
}

function SubjectCard({ sessionId, subject: s, staff, canManage }: { sessionId: string; subject: QpSubject; staff: StaffOption[]; canManage: boolean }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const toast = useToastOptional();
  const [dlg, setDlg] = useState<'appoint' | { cancel: QpAppointment } | { coverage: QpCoverageDetail } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) return setError(res.error ?? '');
      toast?.success(done);
      router.refresh();
    });
  const coverage = () =>
    start(async () => {
      const res = await readCell<QpCoverageDetail>(`/v1/exam-sessions/${sessionId}/subjects/${s.subjectId}/qp-coverage`);
      if (!res.ok) return setError(res.error);
      setDlg({ coverage: res.data });
    });
  const word = (k: string) => t(`xf.qp.st.${k}` as MessageKey);
  return (
    <Card
      testId={`xf-qp-${s.code}`}
      title={`${s.code} ${s.name}`}
      subtitle={s.examDate ? t('xf.qp.when', { date: fmt.date(s.examDate), time: s.startsAt ?? '' }) : undefined}
      action={
        <div className="flex flex-wrap gap-2">
          {s.sets.length > 0 && (
            <Button size="small" variant="outlined" onClick={coverage} disabled={busy} data-testid={`xf-coverage-${s.code}`}>
              {t('xf.qp.coverage')}
            </Button>
          )}
          {canManage && (
            <Button size="small" variant="outlined" onClick={() => setDlg('appoint')} data-testid={`xf-appoint-${s.code}`}>
              {t('xf.qp.appoint')}
            </Button>
          )}
          {canManage && s.canDraw && (
            <Button size="small" variant="contained" disabled={busy} onClick={() => window.confirm(t('xf.qp.drawConfirm', { n: s.lockedSets })) && run(() => runCell('POST', `/v1/exam-sessions/${sessionId}/subjects/${s.subjectId}/draw`), t('xf.qp.drawn'))} data-testid={`xf-draw-${s.code}`}>
              {busy ? <CircularProgress size={14} /> : t('xf.qp.draw')}
            </Button>
          )}
        </div>
      }
    >
      {s.draw && (
        <p className="m-0 mb-3 text-sm" data-testid={`xf-draw-info-${s.code}`}>
          {t('xf.qp.drawInfo', { set: s.draw.setLabel ?? '-', n: s.draw.candidates, at: fmt.dateTime(s.draw.drawnAt) })}
        </p>
      )}
      <h4 className="m-0 mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">{t('xf.qp.people')}</h4>
      <Grid
        empty={t('xf.qp.noAppointments')}
        rows={s.appointments}
        cols={[
          { label: t('xf.qp.col.role'), cell: (a) => t(`xf.qp.role.${a.role}` as MessageKey) },
          { label: t('xf.qp.col.name'), cell: (a) => a.name },
          { label: t('xf.qp.col.sets'), num: true, cell: (a) => (a.role === 'setter' ? a.setsRequired : '-') },
          { label: t('xf.qp.col.due'), cell: (a) => <span className={a.overdue ? 'text-red-ink' : undefined}>{fmt.date(a.dueOn, 'short')}{a.overdue ? ` · ${t('xf.qp.overdue')}` : ''}</span>, sort: (a) => a.dueOn },
          { label: t('xf.qp.col.progress'), cell: (a) => <StatusPill tone={APP_TONE[a.progress] ?? 'neutral'}>{word(a.progress)}</StatusPill>, sort: (a) => a.progress },
          { label: t('xf.qp.col.fee'), num: true, cell: (a) => fmt.rupees(Number(a.remunerationPaise ?? 0)) },
          ...(canManage ? [{ label: '', cell: (a: QpAppointment) => (['appointed', 'accepted'].includes(a.status) ? <Button size="small" color="error" onClick={() => setDlg({ cancel: a })}>{t('xf.qp.cancel')}</Button> : null) }] : []),
        ]}
      />
      <h4 className="m-0 mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">{t('xf.qp.sets')}</h4>
      <Grid
        empty={t('xf.qp.noSets')}
        rows={s.sets}
        cols={[
          { label: t('xf.qp.col.set'), cell: (x: QpSet) => <span className="font-medium">{x.setLabel ?? '-'}{x.drawn ? ` · ${t('xf.qp.drawnSet')}` : ''}</span> },
          { label: t('xf.qp.col.status'), cell: (x) => <StatusPill tone={SET_TONE[x.status] ?? 'neutral'}>{t(`xf.qp.set.${x.status}` as MessageKey)}</StatusPill>, sort: (x) => x.status },
          { label: t('xf.qp.col.marks'), num: true, cell: (x) => `${x.coverage.totalMarks} / ${x.coverage.questions}` },
          { label: t('xf.qp.col.cos'), wrap: true, cell: (x) => spread(x.coverage.byCo) || '-' },
          { label: t('xf.qp.col.bloom'), wrap: true, cell: (x) => spread(x.coverage.byBloom) || '-' },
          { label: t('xf.qp.col.higher'), num: true, cell: (x) => `${fmt.number(x.coverage.higherOrderPercent)}%` },
          { label: t('xf.qp.col.overlap'), num: true, cell: (x) => <span className={x.overlapPercent > 30 ? 'text-red-ink' : undefined}>{fmt.number(x.overlapPercent)}%</span> },
          { label: t('xf.qp.col.release'), cell: (x) => (x.release ? `${fmt.dateTime(x.release.releaseAt)} · ${x.release.status}` : x.status === 'locked' && !x.drawn && s.draw ? t('xf.qp.reserve') : '-') },
        ]}
      />
      {error && <Alert severity="error" role="alert">{error}</Alert>}
      {dlg === 'appoint' && (
        <FormDialog
          title={t('xf.qp.appointTitle', { code: s.code })}
          submitLabel={t('xf.qp.appoint')}
          fields={[
            { name: 'role', label: t('xf.qp.col.role'), kind: 'select', required: true, init: s.appointments.some((a) => a.role === 'setter' && ['appointed', 'accepted'].includes(a.status)) ? 'moderator' : 'setter', options: [{ value: 'setter', label: t('xf.qp.role.setter') }, { value: 'moderator', label: t('xf.qp.role.moderator') }] },
            { name: 'userId', label: t('xf.qp.col.name'), kind: 'select', required: true, options: staff.map((m) => ({ value: m.id, label: m.fullName })) },
            { name: 'setsRequired', label: t('xf.qp.col.sets'), kind: 'number', init: '2' },
            { name: 'dueOn', label: t('xf.qp.col.due'), kind: 'date', required: true },
            { name: 'remunerationPaise', label: t('xf.qp.col.fee'), kind: 'rupees', init: '0' },
            { name: 'note', label: t('xf.qp.note'), kind: 'multiline' },
          ]}
          onSubmit={(v) => runCell('POST', `/v1/exam-sessions/${sessionId}/qp-appointments`, { subjectId: s.subjectId, role: v.role, userId: v.userId, setsRequired: Number(v.setsRequired || 2), dueOn: v.dueOn, remunerationPaise: Number(v.remunerationPaise || 0), ...(v.note ? { note: v.note } : {}) })}
          onClose={(done) => {
            setDlg(null);
            if (done) {
              toast?.success(t('xf.qp.appointed'));
              router.refresh();
            }
          }}
        />
      )}
      {dlg && typeof dlg === 'object' && 'cancel' in dlg && (
        <FormDialog
          title={t('xf.qp.cancelTitle', { name: dlg.cancel.name })}
          submitLabel={t('xf.qp.cancel')}
          fields={[{ name: 'reason', label: t('xf.app.reason'), kind: 'multiline', required: true }]}
          onSubmit={(v) => runCell('POST', `/v1/qp-appointments/${dlg.cancel.id}/cancel`, { reason: v.reason })}
          onClose={(done) => {
            setDlg(null);
            if (done) router.refresh();
          }}
        />
      )}
      {dlg && typeof dlg === 'object' && 'coverage' in dlg && <CoverageDialog code={s.code} detail={dlg.coverage} onClose={() => setDlg(null)} />}
    </Card>
  );
}

/** Each set against its blueprint and the course outcomes: marks by outcome, Bloom level, unit and difficulty, and the gaps. */
function CoverageDialog({ code, detail, onClose }: { code: string; detail: QpCoverageDetail; onClose: () => void }) {
  const { t, fmt } = useI18n();
  return (
    <Dialog size="lg" title={t('xf.qp.coverageTitle', { code })} onClose={onClose} actions={<Button onClick={onClose}>{t('ops.close')}</Button>}>
      <p className="m-0 mb-3 text-sm text-muted-foreground">{t('xf.qp.outcomes', { list: detail.outcomes.join(', ') || '-' })}</p>
      <div className="grid gap-3" data-testid="xf-coverage">
        {detail.sets.map((x) => (
          <div key={x.paperId} className="rounded-md border border-border p-3">
            <div className="mb-1 flex flex-wrap items-center gap-2 text-sm font-medium">
              {t('xf.qp.setNamed', { set: x.setLabel ?? '-' })}
              <StatusPill tone={SET_TONE[x.status] ?? 'neutral'}>{t(`xf.qp.set.${x.status}` as MessageKey)}</StatusPill>
              {x.blueprint && <span className="text-muted-foreground">{t('xf.qp.blueprint', { title: x.blueprint.title, marks: x.blueprint.totalMarks })}</span>}
            </div>
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
              <dt className="text-muted-foreground">{t('xf.qp.col.cos')}</dt>
              <dd className="m-0">{spread(x.coverage.byCo) || '-'}</dd>
              <dt className="text-muted-foreground">{t('xf.qp.col.bloom')}</dt>
              <dd className="m-0">{spread(x.coverage.byBloom) || '-'}</dd>
              <dt className="text-muted-foreground">{t('xf.qp.units')}</dt>
              <dd className="m-0">{spread(x.coverage.byUnit) || '-'}</dd>
              <dt className="text-muted-foreground">{t('xf.qp.difficulty')}</dt>
              <dd className="m-0">{spread(x.coverage.byDifficulty) || '-'}</dd>
              <dt className="text-muted-foreground">{t('xf.qp.col.higher')}</dt>
              <dd className="m-0">{fmt.number(x.coverage.higherOrderPercent)}%</dd>
            </dl>
            {x.gaps.length ? (
              <ul className="m-0 mt-2 list-disc pl-5 text-[13px] text-red-ink">
                {x.gaps.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            ) : (
              <p className="m-0 mt-2 text-[13px]">
                <Pill label={t('xf.qp.meets')} />
              </p>
            )}
          </div>
        ))}
      </div>
    </Dialog>
  );
}
