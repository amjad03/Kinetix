'use client';

import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { generateAntiCollusionPlan, overrideRegistration, saveRegistrationWindow } from '@/app/(dashboard)/exams/actions';
import { Bar, FormDialog, Grid, Pill, Tabbed, useToast } from '@/components/ops/kit';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { chartHref, hallSeats, type RegistrationRow, type RegistrationWindow, type SeatingPlanOverview } from '@/lib/exam-registration';
import type { ExamSessionDetail } from '@/lib/exams';

type Dlg = 'window' | 'plan' | { override: RegistrationRow } | null;

/** Registration window and eligibility with the controller's override, and the anti-collusion seating plan with a chart per hall. */
export function ExamRegistrationPanel({ session, window: win, registrations, plan, rooms, canManage }: { session: ExamSessionDetail; window: RegistrationWindow | null; registrations: RegistrationRow[]; plan: SeatingPlanOverview | null; rooms: { id: string; name: string }[]; canManage: boolean }) {
  const { t, fmt } = useI18n();
  const [toast, toastNode] = useToast();
  const [dlg, setDlg] = useState<Dlg>(null);
  const done = (m?: string) => {
    setDlg(null);
    if (m) toast(m);
  };
  const closed = ['processed', 'published', 'locked'].includes(session.status);
  const ineligible = registrations.filter((r) => r.status === 'ineligible').length;

  return (
    <>
      <Tabbed
        label={t('nav.exams')}
        initial="registration"
        tabs={[
          {
            id: 'registration',
            label: t('er.tab.registration'),
            node: (
              <>
                {canManage && !closed && <Bar><Button variant="outlined" onClick={() => setDlg('window')} data-testid="er-set-window">{t('er.window.set')}</Button></Bar>}
                {win ? (
                  <Typography sx={{ mb: 1.5 }} data-testid="er-window">
                    {t('er.window.summary', { from: fmt.date(win.opensOn), to: fmt.date(win.closesOn) })} <Pill label={t(`er.state.${win.state}` as MessageKey)} warn={win.state === 'closed'} />{' '}
                    {[
                      win.minAttendancePercent !== null ? t('er.rule.attendance', { n: win.minAttendancePercent }) : null,
                      win.blockOnFeeDues ? t('er.rule.fees') : null,
                      win.maxBacklogs !== null ? t('er.rule.backlogs', { n: win.maxBacklogs }) : null,
                    ].filter(Boolean).join(' · ')}
                  </Typography>
                ) : (
                  <Typography sx={{ mb: 1.5 }}>{t('er.window.none')}</Typography>
                )}
                {ineligible > 0 && <Typography sx={{ mb: 1.5 }}>{t('er.held', { n: ineligible })}</Typography>}
                <Grid
                  testId="er-registrations"
                  empty={t('er.none')}
                  rows={registrations}
                  tint={(r) => r.status === 'ineligible'}
                  cols={[
                    { label: t('exm.f.roll'), cell: (r) => r.rollNo, sort: (r) => r.rollNo },
                    { label: t('exm.f.student'), cell: (r) => r.student, sort: (r) => r.student },
                    { label: t('exm.status'), cell: (r) => <Pill label={t(r.status === 'registered' ? 'er.status.registered' : 'er.status.ineligible')} warn={r.status === 'ineligible'} />, sort: (r) => r.status },
                    { label: t('er.col.reasons'), cell: (r) => r.reasons.join('; ') || '-' },
                    { label: t('er.col.override'), cell: (r) => (r.overridden ? (r.overrideReason ?? t('er.status.registered')) : '-') },
                    ...(canManage && !closed
                      ? [{ label: '', cell: (r: RegistrationRow) => (r.status === 'ineligible' ? <Button size="small" onClick={() => setDlg({ override: r })}>{t('er.override')}</Button> : null) }]
                      : []),
                  ]}
                />
              </>
            ),
          },
          {
            id: 'seating',
            label: t('er.tab.seating'),
            node: (
              <>
                <Typography sx={{ mb: 1.5 }}>{t('er.seat.hint')}</Typography>
                {canManage && !closed && <Bar><Button variant="outlined" onClick={() => setDlg('plan')} data-testid="er-generate">{t('er.seat.generate')}</Button></Bar>}
                {plan && plan.layouts.length > 0 && (
                  <Typography sx={{ mb: 1.5 }}>
                    {plan.layouts.map((l) => t('er.seat.layout', { room: l.room, rows: l.rows, benches: l.benchesPerRow, seats: l.seatsPerBench, total: hallSeats(l) })).join(' · ')}
                  </Typography>
                )}
                <Grid
                  testId="er-sittings"
                  empty={t('er.seat.none')}
                  rows={plan?.sittings ?? []}
                  cols={[
                    { label: t('exm.f.date'), cell: (s) => fmt.date(s.examDate), sort: (s) => s.examDate },
                    { label: t('exm.f.time'), cell: (s) => `${s.startsAt.slice(0, 5)} – ${s.endsAt.slice(0, 5)}` },
                    { label: t('exm.f.subjects'), cell: (s) => s.subjects.join(', ') },
                    { label: t('er.col.seated'), cell: (s) => s.seated, num: true, sort: (s) => s.seated },
                    {
                      label: t('er.col.halls'),
                      cell: (s) => (
                        <>
                          {s.halls.map((h) => (
                            <Button key={h.roomId} size="small" href={chartHref(session.id, s.slot, h.roomId)} target="_blank" rel="noopener">
                              {t('er.seat.chart', { room: h.room, n: h.seated })}
                            </Button>
                          ))}
                        </>
                      ),
                    },
                  ]}
                />
              </>
            ),
          },
        ]}
      />

      {dlg === 'window' && (
        <FormDialog
          title={t('er.window.set')}
          onSubmit={(v) => saveRegistrationWindow(session.id, v)}
          onClose={(m) => done(m ? t('ops.saved') : undefined)}
          fields={[
            { name: 'opensOn', label: t('er.f.opens'), kind: 'date', required: true, init: win?.opensOn },
            { name: 'closesOn', label: t('er.f.closes'), kind: 'date', required: true, init: win?.closesOn },
            { name: 'minAttendancePercent', label: t('er.f.attendance'), init: win?.minAttendancePercent == null ? '' : String(win.minAttendancePercent) },
            { name: 'blockOnFeeDues', label: t('er.f.fees'), kind: 'select', init: win && !win.blockOnFeeDues ? 'no' : 'yes', options: [{ value: 'yes', label: t('wf.yes') }, { value: 'no', label: t('wf.no') }] },
            { name: 'maxBacklogs', label: t('er.f.backlogs'), init: win?.maxBacklogs == null ? '' : String(win.maxBacklogs) },
          ]}
        />
      )}
      {typeof dlg === 'object' && dlg && 'override' in dlg && (
        <FormDialog
          title={t('er.override.title', { name: dlg.override.student })}
          intro={<Typography variant="body2">{dlg.override.reasons.join('; ')}</Typography>}
          onSubmit={(v) => overrideRegistration(session.id, dlg.override.studentId, v)}
          onClose={(m) => done(m ? t('ops.saved') : undefined)}
          fields={[{ name: 'reason', label: t('er.override.reason'), kind: 'multiline', required: true }]}
        />
      )}
      {dlg === 'plan' && (
        <FormDialog
          title={t('er.seat.generate')}
          intro={<Typography variant="body2">{t('er.seat.formHint')}</Typography>}
          onSubmit={(v) => generateAntiCollusionPlan(session.id, v)}
          onClose={(m) => done(m ? t('er.seat.done') : undefined)}
          fields={[
            { name: 'roomId', label: t('exm.f.hall'), kind: 'select', required: true, init: rooms[0]?.id, options: rooms.map((r) => ({ value: r.id, label: r.name })) },
            { name: 'rows', label: t('er.f.rows'), kind: 'number', required: true, init: '8' },
            { name: 'benchesPerRow', label: t('er.f.benches'), kind: 'number', required: true, init: '4' },
            { name: 'seatsPerBench', label: t('er.f.perBench'), kind: 'number', required: true, init: '2' },
          ]}
        />
      )}
      {toastNode}
    </>
  );
}
