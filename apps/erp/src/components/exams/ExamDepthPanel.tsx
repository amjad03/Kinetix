'use client';

import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { addDuty, applyGrace, cancelSupplementary, decideMalpractice, registerSupplementary, removeDuty, reportMalpractice, saveResultRules, substituteDuty } from '@/app/(dashboard)/exams/actions';
import { ActionButton, Bar, FormDialog, Grid, Pill, Tabbed, useToast } from '@/components/ops/kit';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { Duty, GraceRow, MalpracticeCase, ProgressionReport, RankRow, ResultRules, StaffMember, SupplementaryRow } from '@/lib/evaluation';
import type { ExamSessionDetail } from '@/lib/exams';

export interface DepthData {
  duties: Duty[];
  supplementary: SupplementaryRow[];
  malpractice: MalpracticeCase[];
  rules: ResultRules | null;
  grace: GraceRow[];
  ranks: RankRow[] | null;
  progression: ProgressionReport | null;
  staff: StaffMember[];
  rooms: { id: string; name: string }[];
}

type Dlg = 'duty' | 'supp' | 'case' | 'rules' | { sub: Duty } | { decide: MalpracticeCase } | null;

/** Invigilation roster, supplementary registration, malpractice cases, and grace, ranks and progression for one session. */
export function ExamDepthPanel({ session, data, canManage }: { session: ExamSessionDetail; data: DepthData; canManage: boolean }) {
  const { t, fmt } = useI18n();
  const [toast, toastNode] = useToast();
  const [dlg, setDlg] = useState<Dlg>(null);
  const done = (m?: string) => {
    setDlg(null);
    if (m) toast(m);
  };
  const staffOpts = data.staff.map((s) => ({ value: s.id, label: s.fullName }));
  const rules = data.rules;
  const processed = session.status === 'processed';
  const num = (n: number | null) => (n === null ? t('ed.rules.unset') : String(n));

  return (
    <>
      <Tabbed
        label={t('nav.exams')}
        initial="duties"
        tabs={[
          {
            id: 'duties',
            label: t('ed.tab.duties'),
            node: (
              <>
                {canManage && <Bar><Button variant="outlined" onClick={() => setDlg('duty')}>{t('ed.duty.add')}</Button></Bar>}
                <Grid
                  testId="ed-duties"
                  empty={t('ed.duty.none')}
                  rows={data.duties}
                  cols={[
                    { label: t('exm.f.date'), cell: (d) => fmt.date(d.dutyDate), sort: (d) => d.dutyDate },
                    { label: t('exm.f.time'), cell: (d) => `${d.startsAt.slice(0, 5)} – ${d.endsAt.slice(0, 5)}`, sort: (d) => d.startsAt },
                    { label: t('exm.f.hall'), cell: (d) => d.room },
                    { label: t('ed.duty.staff'), cell: (d) => d.staff },
                    { label: t('ed.duty.role'), cell: (d) => t(d.role === 'chief' ? 'ed.duty.chief' : 'ed.duty.invigilator') },
                    { label: t('exm.status'), cell: (d) => <Pill label={t(`ed.duty.status.${d.status}` as MessageKey)} /> },
                    ...(canManage
                      ? [{ label: '', cell: (d: Duty) => (
                          <>
                            <Button size="small" onClick={() => setDlg({ sub: d })}>{t('ed.duty.substitute')}</Button>
                            <ActionButton label={t('ed.duty.remove')} tone="error" run={() => removeDuty(session.id, d.id)} onDone={toast} />
                          </>
                        ) }]
                      : []),
                  ]}
                />
              </>
            ),
          },
          {
            id: 'supp',
            label: t('ed.tab.supp'),
            node: (
              <>
                {canManage && session.kind === 'supplementary' ? <Bar><Button variant="outlined" onClick={() => setDlg('supp')}>{t('ed.supp.register')}</Button></Bar> : <Typography sx={{ mb: 1.5 }}>{t('ed.supp.notSupp')}</Typography>}
                <Grid
                  testId="ed-supp"
                  empty={t('ed.supp.none')}
                  rows={data.supplementary}
                  cols={[
                    { label: t('exm.f.roll'), cell: (r) => r.rollNo },
                    { label: t('exm.f.student'), cell: (r) => r.student },
                    { label: t('ed.supp.subject'), cell: (r) => `${r.code} ${r.subject}` },
                    ...(canManage ? [{ label: '', cell: (r: SupplementaryRow) => <ActionButton label={t('ed.supp.cancel')} tone="error" run={() => cancelSupplementary(session.id, r.id)} onDone={toast} /> }] : []),
                  ]}
                />
              </>
            ),
          },
          {
            id: 'malpractice',
            label: t('ed.tab.malpractice'),
            node: (
              <>
                <Bar><Button variant="outlined" onClick={() => setDlg('case')}>{t('ed.mp.report')}</Button></Bar>
                <Grid
                  testId="ed-cases"
                  empty={t('ed.mp.none')}
                  rows={data.malpractice}
                  tint={(c) => c.status === 'penalised'}
                  cols={[
                    { label: t('exm.f.roll'), cell: (c) => c.rollNo },
                    { label: t('exm.f.student'), cell: (c) => c.student },
                    { label: t('ed.mp.desc'), cell: (c) => c.description, sort: (c) => c.description },
                    { label: t('exm.status'), cell: (c) => <Pill label={t(`ed.mp.status.${c.status}` as MessageKey)} warn={c.status === 'penalised'} />, sort: (c) => c.status },
                    { label: t('ed.mp.penalty'), cell: (c) => c.penalty ?? '—' },
                    ...(canManage ? [{ label: '', cell: (c: MalpracticeCase) => (c.status === 'reported' ? <Button size="small" onClick={() => setDlg({ decide: c })}>{t('ed.mp.decide')}</Button> : null) }] : []),
                  ]}
                />
              </>
            ),
          },
          {
            id: 'results',
            label: t('ed.tab.results'),
            node: (
              <>
                <Typography variant="h6" component="h3" sx={{ mb: 1 }}>{t('ed.rules.title')}</Typography>
                <Typography sx={{ mb: 1.5 }} data-testid="ed-rules">
                  {rules ? t('ed.rules.summary', { per: rules.graceMaxPerSubject, total: rules.graceMaxTotal, credits: num(rules.progressionMinCredits), backlogs: num(rules.progressionMaxBacklogs) }) : t('ed.rules.unset')}
                </Typography>
                {canManage && (
                  <Bar>
                    <Button variant="outlined" onClick={() => setDlg('rules')} disabled={session.status === 'published' || session.status === 'locked'}>{t('ed.rules.edit')}</Button>
                    <ActionButton label={t('ed.grace.preview')} disabled={!processed} run={() => applyGrace(session.id, true)} onDone={toast} />
                    <ActionButton label={t('ed.grace.apply')} disabled={!processed} run={() => applyGrace(session.id, false)} onDone={toast} />
                  </Bar>
                )}
                <Grid
                  testId="ed-grace"
                  empty={t('ed.grace.none')}
                  rows={data.grace}
                  cols={[
                    { label: t('exm.f.roll'), cell: (g) => g.rollNo },
                    { label: t('exm.f.student'), cell: (g) => g.student },
                    { label: t('exm.f.subject'), cell: (g) => g.subject },
                    { label: t('ed.grace.marks'), cell: (g) => g.marks, num: true },
                  ]}
                />

                <Typography variant="h6" component="h3" sx={{ mt: 3, mb: 1 }}>{t('ed.ranks.title')}</Typography>
                <Grid
                  testId="ed-ranks"
                  empty={t('ed.ranks.none')}
                  rows={data.ranks ?? []}
                  cols={[
                    { label: t('ed.ranks.class'), cell: (r) => r.classRank ?? t('ed.ranks.unranked'), num: true, sort: (r) => r.classRank },
                    { label: t('ed.ranks.programme'), cell: (r) => r.programmeRank ?? '—', num: true, sort: (r) => r.programmeRank },
                    { label: t('exm.f.roll'), cell: (r) => r.rollNo },
                    { label: t('exm.f.student'), cell: (r) => r.name },
                    { label: 'SGPA', cell: (r) => r.sgpa, num: true },
                  ]}
                />

                <Typography variant="h6" component="h3" sx={{ mt: 3, mb: 1 }}>{t('ed.prog.title')}</Typography>
                {data.progression ? (
                  <>
                    <Typography sx={{ mb: 1 }} data-testid="ed-prog-summary">{t('ed.prog.summary', { eligible: data.progression.eligible, held: data.progression.held })}</Typography>
                    <Grid
                      testId="ed-progression"
                      empty={t('ed.prog.none')}
                      rows={data.progression.students}
                      tint={(r) => !r.eligible}
                      cols={[
                        { label: t('exm.f.roll'), cell: (r) => r.rollNo },
                        { label: t('exm.f.student'), cell: (r) => r.name },
                        { label: t('ed.prog.credits'), cell: (r) => r.creditsEarned, num: true },
                        { label: t('ed.prog.backlogs'), cell: (r) => r.backlogs, num: true },
                        { label: t('exm.status'), cell: (r) => <Pill label={r.eligible ? t('ed.prog.eligible') : `${t('ed.prog.held')}: ${r.reasons.map((x) => t(`ed.prog.reason.${x}` as MessageKey)).join(', ')}`} warn={!r.eligible} />, sort: (r) => (r.eligible ? 1 : 0) },
                      ]}
                    />
                  </>
                ) : (
                  <Typography>{t('ed.prog.none')}</Typography>
                )}
              </>
            ),
          },
        ]}
      />
      {toastNode}

      {dlg === 'duty' && (
        <FormDialog
          title={t('ed.duty.add')}
          onSubmit={(v) => addDuty(session.id, v)}
          onClose={(m) => done(m ? t('ed.duty.added') : undefined)}
          fields={[
            { name: 'staffId', label: t('ed.duty.staff'), kind: 'select', required: true, options: staffOpts },
            { name: 'roomId', label: t('ed.duty.room'), kind: 'select', required: true, options: data.rooms.map((r) => ({ value: r.id, label: r.name })) },
            { name: 'dutyDate', label: t('exm.f.date'), kind: 'date', required: true, init: session.startsOn },
            { name: 'startsAt', label: t('exm.f.from'), kind: 'time', required: true, init: '10:00' },
            { name: 'endsAt', label: t('exm.f.to'), kind: 'time', required: true, init: '13:00' },
            { name: 'role', label: t('ed.duty.role'), kind: 'select', init: 'invigilator', options: [{ value: 'invigilator', label: t('ed.duty.invigilator') }, { value: 'chief', label: t('ed.duty.chief') }] },
          ]}
        />
      )}
      {typeof dlg === 'object' && dlg && 'sub' in dlg && (
        <FormDialog title={t('ed.duty.substitute')} onSubmit={(v) => substituteDuty(session.id, dlg.sub.id, v)} onClose={(m) => done(m ? t('ed.duty.substituted') : undefined)} fields={[{ name: 'staffId', label: t('ed.duty.staff'), kind: 'select', required: true, options: staffOpts.filter((o) => o.value !== dlg.sub.staffId) }]} />
      )}
      {dlg === 'supp' && (
        <FormDialog
          title={t('ed.supp.register')}
          onSubmit={(v) => registerSupplementary(session.id, v)}
          onClose={(m) => done(m ? t('ed.supp.registered') : undefined)}
          fields={[
            { name: 'studentId', label: t('ed.supp.studentId'), kind: 'uuid', required: true },
            { name: 'subjectId', label: t('ed.supp.subject'), kind: 'uuid', required: true },
          ]}
        />
      )}
      {dlg === 'case' && (
        <FormDialog
          title={t('ed.mp.report')}
          onSubmit={(v) => reportMalpractice(session.id, v)}
          onClose={(m) => done(m ? t('ed.mp.saved') : undefined)}
          fields={[
            { name: 'studentId', label: t('ed.supp.studentId'), kind: 'uuid', required: true },
            { name: 'description', label: t('ed.mp.desc'), kind: 'multiline', required: true },
          ]}
        />
      )}
      {typeof dlg === 'object' && dlg && 'decide' in dlg && (
        <FormDialog
          title={t('ed.mp.decide')}
          onSubmit={(v) => decideMalpractice(session.id, dlg.decide.id, v)}
          onClose={done}
          fields={[
            { name: 'outcome', label: t('ed.mp.outcome'), kind: 'select', required: true, init: 'penalised', options: [{ value: 'penalised', label: t('ed.mp.penalised') }, { value: 'dismissed', label: t('ed.mp.dismissed') }] },
            { name: 'penalty', label: t('ed.mp.penalty') },
          ]}
        />
      )}
      {dlg === 'rules' && (
        <FormDialog
          title={t('ed.rules.title')}
          onSubmit={(v) => saveResultRules(session.id, v)}
          onClose={(m) => done(m ? t('ed.rules.saved') : undefined)}
          fields={[
            { name: 'graceMaxPerSubject', label: t('ed.rules.gracePer'), required: true, init: String(rules?.graceMaxPerSubject ?? 0) },
            { name: 'graceMaxTotal', label: t('ed.rules.graceTotal'), required: true, init: String(rules?.graceMaxTotal ?? 0) },
            { name: 'progressionMinCredits', label: t('ed.rules.minCredits'), init: rules?.progressionMinCredits == null ? '' : String(rules.progressionMinCredits) },
            { name: 'progressionMaxBacklogs', label: t('ed.rules.maxBacklogs'), init: rules?.progressionMaxBacklogs == null ? '' : String(rules.progressionMaxBacklogs) },
          ]}
        />
      )}
    </>
  );
}
