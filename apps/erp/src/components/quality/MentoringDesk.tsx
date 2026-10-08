'use client';

import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { assignByClass, changeMentor, endAssignment, loadSessions } from '@/app/(dashboard)/mentoring/actions';
import { ActionButton, Bar, FormDialog, Grid, InfoDialog, Pill, Tabbed, useToast, type Field } from '@/components/ops/kit';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { InterventionPlanRow, MentoringSession, MentorAssignment, MentorRef, RiskRow } from '@/lib/quality';

type Dialog = 'bulk' | { change: MentorAssignment } | { sessions: { studentId: string; name: string } };

export function MentoringDesk({ risk, mentees, plans, mentors, sections, initialTab }: { risk: RiskRow[]; mentees: MentorAssignment[]; plans: InterventionPlanRow[]; mentors: MentorRef[]; sections: { id: string; name: string }[]; initialTab: string }) {
  const { t, fmt } = useI18n();
  const [dlg, setDlg] = useState<Dialog | null>(null);
  const [toast, toastNode] = useToast();
  const done = (m?: string) => {
    setDlg(null);
    if (m) toast(m);
  };
  const mentorOptions = mentors.map((m) => ({ value: m.id, label: m.fullName }));
  const mentorField = (name: string, label: string, required: boolean): Field => ({ name, label, kind: 'select', options: mentorOptions, required });

  return (
    <>
      <Tabbed
        label={t('nav.mentoring')}
        initial={initialTab}
        tabs={[
          {
            id: 'risk',
            label: t('mn.tab.risk', { n: risk.length }),
            node: (
              <Grid
                testId="mn-risk"
                empty={t('mn.empty.risk')}
                rows={risk}
                tint={(r) => r.level === 'high'}
                cols={[
                  { label: t('mn.col.student'), cell: (r) => `${r.studentName} (${r.rollNo})` },
                  { label: t('mn.col.class'), cell: (r) => r.section },
                  { label: t('mn.col.mentor'), cell: (r) => r.mentorName },
                  { label: t('mn.col.attendance'), cell: (r) => (r.attendancePct === null ? t('ops.none') : `${r.attendancePct}%`), num: true, sort: (r) => r.attendancePct },
                  { label: t('mn.col.marks'), cell: (r) => fmt.number(r.failingMarks), num: true },
                  { label: t('mn.col.fees'), cell: (r) => fmt.number(r.overdueFees), num: true },
                  { label: t('mn.col.cases'), cell: (r) => fmt.number(r.openCases), num: true },
                  { label: t('mn.col.level'), cell: (r) => <Pill warn={r.level === 'high'} label={t(`mn.level.${r.level}` as MessageKey)} />, sort: (r) => r.score },
                  { label: '', cell: (r) => <Button size="small" onClick={() => setDlg({ sessions: { studentId: r.studentId, name: r.studentName } })}>{t('mn.sessions')}</Button> },
                ]}
              />
            ),
          },
          {
            id: 'mentees',
            label: t('mn.tab.mentees', { n: mentees.length }),
            node: (
              <>
                <Bar>
                  <Button variant="outlined" onClick={() => setDlg('bulk')} disabled={mentors.length === 0 || sections.length === 0}>
                    {t('mn.bulk')}
                  </Button>
                </Bar>
                <Grid
                  testId="mn-mentees-list"
                  empty={t('mn.empty.mentees')}
                  rows={mentees}
                  cols={[
                    { label: t('mn.col.student'), cell: (a) => `${a.studentName} (${a.rollNo})` },
                    { label: t('mn.col.class'), cell: (a) => a.section },
                    { label: t('mn.col.mentor'), cell: (a) => a.mentorName },
                    { label: t('mn.col.since'), cell: (a) => fmt.date(a.startedOn, 'short'), sort: (a) => a.startedOn },
                    {
                      label: '',
                      cell: (a) => (
                        <>
                          <Button size="small" onClick={() => setDlg({ sessions: { studentId: a.studentId, name: a.studentName } })}>{t('mn.sessions')}</Button>
                          <Button size="small" onClick={() => setDlg({ change: a })}>{t('mn.change')}</Button>
                          <ActionButton tone="error" label={t('mn.end')} run={() => endAssignment(a.id)} onDone={toast} />
                        </>
                      ),
                    },
                  ]}
                />
              </>
            ),
          },
          {
            id: 'plans',
            label: t('mn.tab.plans', { n: plans.length }),
            node: (
              <Grid
                testId="mn-plans-list"
                empty={t('mn.empty.plans')}
                rows={plans}
                cols={[
                  { label: t('mn.col.student'), cell: (p) => `${p.studentName} (${p.rollNo})` },
                  { label: t('mn.col.goal'), cell: (p) => p.plan.goal },
                  { label: '', cell: (p) => t('mn.actionsDone', { done: p.plan.actions.filter((a) => a.done).length, total: p.plan.actions.length }) },
                  { label: t('mn.col.review'), cell: (p) => fmt.date(p.plan.reviewOn, 'short'), sort: (p) => p.plan.reviewOn },
                  { label: t('mn.col.status'), cell: (p) => <Pill label={t(`mn.plan.${p.plan.status}` as MessageKey)} /> },
                  { label: t('mn.col.outcome'), cell: (p) => (p.plan.outcomeRating ? `${t(`mn.rating.${p.plan.outcomeRating}` as MessageKey)}: ${p.plan.outcome ?? ''}` : t('ops.none')) },
                ]}
              />
            ),
          },
        ]}
      />
      {dlg === 'bulk' && (
        <FormDialog
          title={t('mn.bulkTitle')}
          intro={<Typography variant="body2">{t('mn.bulkIntro')}</Typography>}
          fields={[{ name: 'sectionId', label: t('mn.f.section'), kind: 'select', options: sections.map((s) => ({ value: s.id, label: s.name })), required: true }, mentorField('mentor1', t('mn.f.mentorN', { n: 1 }), true), mentorField('mentor2', t('mn.f.mentorN', { n: 2 }), false), mentorField('mentor3', t('mn.f.mentorN', { n: 3 }), false)]}
          onSubmit={assignByClass}
          onClose={done}
        />
      )}
      {dlg && typeof dlg === 'object' && 'change' in dlg && <FormDialog title={`${t('mn.change')}: ${dlg.change.studentName}`} fields={[mentorField('mentorUserId', t('mn.f.mentor'), true)]} onSubmit={(v) => changeMentor(dlg.change.studentId, v)} onClose={done} />}
      {dlg && typeof dlg === 'object' && 'sessions' in dlg && <SessionsDialog studentId={dlg.sessions.studentId} name={dlg.sessions.name} onClose={() => setDlg(null)} />}
      {toastNode}
    </>
  );
}

/** The sessions logged with one student; private notes appear only when the API sends them. */
function SessionsDialog({ studentId, name, onClose }: { studentId: string; name: string; onClose: () => void }) {
  const { t, fmt } = useI18n();
  const [rows, setRows] = useState<MentoringSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void loadSessions(studentId).then((r) => {
      if (!live) return;
      if (r.ok) setRows(r.data);
      else setError(r.error);
    });
    return () => {
      live = false;
    };
  }, [studentId]);
  return (
    <InfoDialog title={t('mn.sessionsTitle', { name })} onClose={onClose}>
      {error && <Typography color="error">{error}</Typography>}
      {rows && rows.length === 0 && <Typography>{t('mn.noSessions')}</Typography>}
      <Stack spacing={2}>
        {(rows ?? []).map((s) => (
          <div key={s.id}>
            <Typography variant="subtitle2">
              {fmt.date(s.heldOn, 'long')} · {t(`mn.mode.${s.mode}` as MessageKey)}
            </Typography>
            <Typography variant="body2">{s.summary}</Typography>
            {s.privateNotes ? (
              <Typography variant="body2" color="text.secondary">
                {t('mn.privateNotes')}: {s.privateNotes}
              </Typography>
            ) : s.hasNotes ? (
              <Typography variant="caption" color="text.secondary">
                {t('mn.notesHidden')}
              </Typography>
            ) : null}
            {s.followUpOn && <Typography variant="caption">{t('mn.followUp', { date: fmt.date(s.followUpOn, 'short') })}</Typography>}
          </div>
        ))}
      </Stack>
    </InfoDialog>
  );
}
