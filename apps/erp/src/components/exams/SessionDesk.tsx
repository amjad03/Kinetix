'use client';
import { useState } from 'react';
import { addPaper, approvalStep, completeRevaluation, decideRevaluation, generateSeating, issueHallTickets, removePaper, sessionStep, setApprovalRequired } from '@/app/(dashboard)/exams/actions';
import { DataTable, FormField, StatGrid, StatTile, StatusPill, TextInput, FormRow } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { exportHref, nextStep, type ExamSessionDetail, type ResultRow, type Revaluation } from '@/lib/exams';
import type { Structure } from '@/lib/types';
import { useRun } from './useRun';

import { Alert, Button, Card, MenuItem } from '@/components/kx';
export function SessionDesk({ session: s, structure, results, revaluations, canManage }: { session: ExamSessionDetail; structure: Structure; results: ResultRow[]; revaluations: Revaluation[]; canManage: boolean }) {
  const { t, fmt } = useI18n();
  const { pending, run, feedback } = useRun();
  const sections = structure.sections.filter((x) => x.programId === s.programId && x.term === s.term);
  const subjects = structure.subjects.filter((x) => x.programId === s.programId && x.term === s.term);
  const [p, setP] = useState({ subjectId: subjects[0]?.id ?? '', sectionId: sections[0]?.id ?? '', examDate: s.startsOn, startsAt: '10:00', endsAt: '13:00', maxMarks: '60' });
  const [halls, setHalls] = useState(() => structure.rooms.slice(0, 1).map((r) => ({ roomId: r.id, capacity: '30' })));
  const [blocks, setBlocks] = useState('');
  const [approvalNote, setApprovalNote] = useState('');
  const [newMarks, setNewMarks] = useState<Record<string, string>>({});
  const step = nextStep(s.status, s.papers.length);
  const open = s.status === 'draft' || s.status === 'scheduled';
  const fail = results.filter((r) => r.outcome === 'fail').length;
  const stepLabel = { addPapers: 'exm.step.addPapers', schedule: 'exm.step.schedule', process: 'exm.step.process', publish: 'exm.step.publish', lock: 'exm.step.lock', done: 'exm.step.done' } as const;

  return (
    <>
      <StatGrid min={140}>
        <StatTile label={t('exm.status')} value={t(`exm.st.${s.status}`)} caption={t(stepLabel[step])} testId="exm-status" />
        <StatTile label={t('exm.papers')} value={s.papers.length} testId="exm-papers" />
        <StatTile label={t('exm.passPercent')} value={s.stats.passPercent === null ? '—' : `${s.stats.passPercent}%`} caption={t('exm.ofStudents', { n: s.stats.students })} testId="exm-pass" />
        <StatTile label={t('exm.avgSgpa')} value={s.stats.averageSgpa ?? '—'} tone={fail ? 'warning' : 'default'} caption={fail ? t('exm.failing', { n: fail }) : undefined} testId="exm-sgpa" />
      </StatGrid>
      {feedback}
      {s.status === 'processed' && s.approvalRequired && (
        <Alert className="my-4" severity={s.approvedAt ? 'success' : 'info'} data-testid="ap-state">
          {s.approvedAt ? t('ap.stateApproved') : s.approvalRequestedAt ? t('ap.stateWaiting') : t('ap.stateNeeded')}
          {s.approvalNote ? ` · ${s.approvalNote}` : ''}
        </Alert>
      )}

      {canManage && (
        <div className="flex gap-2 flex-wrap my-4">
          {s.status === 'draft' && (
            <Button variant="contained" disabled={pending || s.papers.length === 0} onClick={() => run(() => sessionStep(s.id, 'schedule'), t('exm.scheduled'))}>
              {t('exm.schedule')}
            </Button>
          )}
          {(s.status === 'scheduled' || s.status === 'processed') && (
            <Button variant="contained" disabled={pending} onClick={() => run(() => sessionStep(s.id, 'process'), t('exm.processed'))}>
              {t('exm.process')}
            </Button>
          )}
          {s.status === 'processed' && (
            <Button variant="outlined" disabled={pending} onClick={() => run(() => setApprovalRequired(s.id, !s.approvalRequired), t('ap.saved'))} data-testid="ap-toggle">
              {s.approvalRequired ? t('ap.turnOff') : t('ap.turnOn')}
            </Button>
          )}
          {s.status === 'processed' && s.approvalRequired && !s.approvalRequestedAt && (
            <Button variant="contained" disabled={pending} onClick={() => run(() => approvalStep(s.id, 'request-approval'), t('ap.requested'))} data-testid="ap-request">
              {t('ap.request')}
            </Button>
          )}
          {s.status === 'processed' && s.approvalRequired && s.approvalRequestedAt && !s.approvedAt && (
            <>
              <TextInput label={t('ap.note')} value={approvalNote} onChange={(e) => setApprovalNote(e.target.value)} />
              <Button variant="contained" disabled={pending} onClick={() => run(() => approvalStep(s.id, 'approve', approvalNote), t('ap.approved'))} data-testid="ap-approve">
                {t('ap.approve')}
              </Button>
              <Button variant="outlined" color="warning" disabled={pending} onClick={() => run(() => approvalStep(s.id, 'return', approvalNote), t('ap.returned'))}>
                {t('ap.return')}
              </Button>
            </>
          )}
          {s.status === 'processed' && (
            <Button variant="contained" color="success" disabled={pending || (!!s.approvalRequired && !s.approvedAt)} onClick={() => run(() => sessionStep(s.id, 'publish'), t('exm.published'))}>
              {t('exm.publish')}
            </Button>
          )}
          {s.status === 'published' && (
            <Button variant="outlined" disabled={pending} onClick={() => run(() => sessionStep(s.id, 'lock'), t('exm.locked'))}>
              {t('exm.lock')}
            </Button>
          )}
          {results.length > 0 && (
            <Button href={exportHref(`/v1/exam-sessions/${s.id}/results.csv`)} download>
              {t('exm.exportCsv')}
            </Button>
          )}
        </div>
      )}

      <h2 className="text-base leading-6 font-medium tracking-[0.1px] mt-6 mb-2">
        {t('exm.timetable')}
      </h2>
      {s.papers.length === 0 ? (
        <p className="text-sm leading-[21px] text-muted-foreground">{t('exm.noPapers')}</p>
      ) : (
        <DataTable
          testId="exam-papers"
          label={t('exm.timetable')}
          rows={s.papers}
          rowId={(x) => String(x.id)}
          exportName="exam-papers"
          columns={[
            { id: 'c0', header: t('exm.f.date'), rowHeader: true, sort: (x) => fmt.date(x.examDate), cell: (x) => fmt.date(x.examDate) },
            { id: 'c1', header: t('exm.f.time'), sort: (x) => `${x.startsAt.slice(0, 5)}–${x.endsAt.slice(0, 5)}`, cell: (x) => `${x.startsAt.slice(0, 5)}–${x.endsAt.slice(0, 5)}` },
            { id: 'c2', header: t('exm.f.subject'), sort: (x) => x.subject, cell: (x) => x.subject },
            { id: 'c3', header: t('exm.f.class'), sort: (x) => x.section, cell: (x) => x.section },
            { id: 'c4', header: t('exm.f.max'), align: 'right', sort: (x) => x.maxMarks, cell: (x) => x.maxMarks },
            { id: 'c5', header: '', align: 'right', csv: false, cell: (x) => (<>{x.assessmentId && <Button size="small" href={`/results/${x.assessmentId}`}>{t('exm.marks')}</Button>}
                              {canManage && s.status === 'draft' && (
                                <Button size="small" color="error" disabled={pending} onClick={() => run(() => removePaper(s.id, x.id), t('exm.paperRemoved'))}>
                                  {t('exm.remove')}
                                </Button>
                              )}</>) },
          ]}
        />
      )}

      {canManage && open && (
        <Card className="p-5 mt-4">
          <h3 className="text-base leading-6 font-medium tracking-[0.1px] mb-3">
            {t('exm.addPaper')}
          </h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(() => addPaper(s.id, { ...p, maxMarks: Number(p.maxMarks) }), t('exm.paperAdded'));
            }}
            style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}
          >
            <FormField label={t('exm.f.subject')}>
              <TextInput select value={p.subjectId} onChange={(e) => setP({ ...p, subjectId: e.target.value })}>
                {subjects.map((x) => (
                  <MenuItem key={x.id} value={x.id}>
                    {x.code} {x.name}
                  </MenuItem>
                ))}
              </TextInput>
            </FormField>
            <FormField label={t('exm.f.class')}>
              <TextInput select value={p.sectionId} onChange={(e) => setP({ ...p, sectionId: e.target.value })}>
                {sections.map((x) => (
                  <MenuItem key={x.id} value={x.id}>
                    {x.displayName}
                  </MenuItem>
                ))}
              </TextInput>
            </FormField>
            <FormField label={t('exm.f.date')}>
              <TextInput type="date" value={p.examDate} onChange={(e) => setP({ ...p, examDate: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
            </FormField>
            <FormField label={t('exm.f.from')}>
              <TextInput type="time" value={p.startsAt} onChange={(e) => setP({ ...p, startsAt: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
            </FormField>
            <FormField label={t('exm.f.to')}>
              <TextInput type="time" value={p.endsAt} onChange={(e) => setP({ ...p, endsAt: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
            </FormField>
            <FormField label={t('exm.f.max')}>
              <TextInput type="number" value={p.maxMarks} onChange={(e) => setP({ ...p, maxMarks: e.target.value })} />
            </FormField>
            <Button type="submit" variant="outlined" disabled={pending}>
              {t('exm.addPaper')}
            </Button>
          </form>
        </Card>
      )}

      {canManage && s.status !== 'draft' && (
        <Card className="p-5 mt-6">
          <h2 className="text-base leading-6 font-medium tracking-[0.1px] mb-1">
            {t('exm.seatingTitle')}
          </h2>
          <p className="text-[13px] leading-[19px] text-muted-foreground mb-3">
            {t('exm.seatingHelp')}
          </p>
          {halls.map((h, i) => (
            <FormRow className="gap-2 mb-2" key={i}>
              <FormField label={t('exm.f.hall')}>
                <TextInput className="min-w-[180px]" select value={h.roomId} onChange={(e) => setHalls(halls.map((x, j) => (j === i ? { ...x, roomId: e.target.value } : x)))}>
                  {structure.rooms.map((r) => (
                    <MenuItem key={r.id} value={r.id}>
                      {r.name}
                    </MenuItem>
                  ))}
                </TextInput>
              </FormField>
              <FormField label={t('exm.f.capacity')}>
                <TextInput className="w-[120px]" type="number" value={h.capacity} onChange={(e) => setHalls(halls.map((x, j) => (j === i ? { ...x, capacity: e.target.value } : x)))} />
              </FormField>
              <Button size="small" onClick={() => setHalls(halls.filter((_, j) => j !== i))} disabled={halls.length === 1}>
                {t('exm.remove')}
              </Button>
            </FormRow>
          ))}
          <div className="flex gap-2 flex-wrap">
            <Button size="small" onClick={() => setHalls([...halls, { roomId: structure.rooms[0]?.id ?? '', capacity: '30' }])}>
              {t('exm.addHall')}
            </Button>
            <Button variant="outlined" disabled={pending || s.status === 'processed' || s.status === 'published' || s.status === 'locked'} onClick={() => run(() => generateSeating(s.id, halls.map((h) => ({ roomId: h.roomId, capacity: Number(h.capacity) }))), t('exm.seated'))}>
              {t('exm.seat')}
            </Button>
          </div>
          <h3 className="text-base leading-6 font-medium tracking-[0.1px] mt-6 mb-1">
            {t('exm.ticketsTitle')}
          </h3>
          <FormField label={t('exm.blocks')}>
            <TextInput
              fullWidth
              multiline
              minRows={2}
              helperText={t('exm.blocksHelp')}
              value={blocks}
              onChange={(e) => setBlocks(e.target.value)}
            />
          </FormField>
          <Button className="mt-2"
            variant="outlined"
            disabled={pending}
            onClick={() => {
              // One "student id, reason" per line; withheld tickets are not printed.
              const parsed = blocks
                .split('\n')
                .map((l) => l.trim())
                .filter(Boolean)
                .map((l) => {
                  const [studentId, ...reason] = l.split(',');
                  return { studentId: studentId.trim(), reason: reason.join(',').trim() };
                });
              run(() => issueHallTickets(s.id, parsed), t('exm.ticketsIssued'));
            }}
          >
            {t('exm.issueTickets')}
          </Button>
        </Card>
      )}

      {results.length > 0 && (
        <>
          <h2 className="text-base leading-6 font-medium tracking-[0.1px] mt-6 mb-2">
            {t('exm.resultsTitle')}
          </h2>
          <DataTable
            testId="exam-results"
            label={t('exm.resultsTitle')}
            rows={results}
            rowId={(r) => String(r.id)}
            exportName="exam-results"
            columns={[
              { id: 'c0', header: t('exm.f.roll'), rowHeader: true, sort: (r) => r.rollNo, cell: (r) => r.rollNo },
              { id: 'c1', header: t('exm.f.student'), sort: (r) => r.fullName, cell: (r) => r.fullName },
              { id: 'c2', header: t('exm.f.subjects'), sort: (r) => r.lines.map((l) => `${l.code} ${l.grade}`).join(', '), cell: (r) => r.lines.map((l) => `${l.code} ${l.grade}`).join(', ') },
              { id: 'c3', header: `SGPA`, align: 'right', sort: (r) => r.sgpa.toFixed(2), cell: (r) => r.sgpa.toFixed(2) },
              { id: 'c4', header: `CGPA`, align: 'right', sort: (r) => r.cgpa.toFixed(2), cell: (r) => r.cgpa.toFixed(2) },
              { id: 'c5', header: t('exm.f.result'), sort: (r) => r.outcome, cell: (r) => (<><StatusPill tone={r.outcome === 'pass' ? 'success' : 'danger'}>{t(r.outcome === 'pass' ? 'exm.pass' : 'exm.fail')}</StatusPill></>) },
            ]}
          />
        </>
      )}

      {revaluations.length > 0 && (
        <>
          <h2 className="text-base leading-6 font-medium tracking-[0.1px] mt-6 mb-2">
            {t('exm.revalTitle')}
          </h2>
          {s.status === 'locked' && <Alert className="mb-2" severity="info">{t('exm.revalClosed')}</Alert>}
          <DataTable
            testId="exam-revaluations"
            label={t('exm.revalTitle')}
            rows={revaluations}
            rowId={(r) => String(r.id)}
            exportName="exam-revaluations"
            columns={[
              { id: 'c0', header: t('exm.f.student'), rowHeader: true, sort: (r) => `${r.rollNo} ${r.student}`, cell: (r) => `${r.rollNo} ${r.student}` },
              { id: 'c1', header: t('exm.f.subject'), sort: (r) => r.subject, cell: (r) => r.subject },
              { id: 'c2', header: t('exm.f.reason'), sort: (r) => r.reason, cell: (r) => r.reason },
              { id: 'c3', header: t('exm.marks'), sort: (r) => `${r.previousPercent ?? '—'}% → ${r.newPercent ?? '—'}%`, cell: (r) => `${r.previousPercent ?? '—'}% → ${r.newPercent ?? '—'}%` },
              { id: 'c4', header: t('exm.status'), sort: (r) => r.status, cell: (r) => (<><StatusPill tone={r.status === 'requested' ? 'warning' : r.status === 'rejected' ? 'danger' : 'neutral'}>{t(`exm.rv.${r.status}`)}</StatusPill></>) },
              { id: 'c5', header: '', align: 'right', csv: false, cell: (r) => (<>{canManage && r.status === 'requested' && (
                                    <>
                                      <Button size="small" disabled={pending} onClick={() => run(() => decideRevaluation(s.id, r.id, true, ''), t('exm.rv.accepted'))}>
                                        {t('exm.accept')}
                                      </Button>
                                      <Button size="small" color="error" disabled={pending} onClick={() => run(() => decideRevaluation(s.id, r.id, false, ''), t('exm.rv.rejected'))}>
                                        {t('exm.reject')}
                                      </Button>
                                    </>
                                  )}
                                  {canManage && r.status === 'accepted' && s.status === 'published' && (
                                    <FormRow className="gap-2 justify-end">
                                      <FormField label={t('exm.newMarks')}>
                                        <TextInput className="w-[120px]" type="number" value={newMarks[r.id] ?? ''} onChange={(e) => setNewMarks({ ...newMarks, [r.id]: e.target.value })} />
                                      </FormField>
                                      <Button size="small" disabled={pending || (newMarks[r.id] ?? '') === ''} onClick={() => run(() => completeRevaluation(s.id, r.id, Number(newMarks[r.id])), t('exm.rv.completed'))}>
                                        {t('exm.regrade')}
                                      </Button>
                                    </FormRow>
                                  )}</>) },
            ]}
          />
        </>
      )}
    </>
  );
}
