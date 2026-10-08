'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import MenuItem from '@mui/material/MenuItem';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { addPaper, completeRevaluation, decideRevaluation, generateSeating, issueHallTickets, removePaper, sessionStep } from '@/app/(dashboard)/exams/actions';
import { TableFrame } from '@/components/DataTable';
import { StatGrid, StatTile, StatusPill } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { exportHref, nextStep, type ExamSessionDetail, type ResultRow, type Revaluation } from '@/lib/exams';
import type { Structure } from '@/lib/types';
import { useRun } from './useRun';

export function SessionDesk({ session: s, structure, results, revaluations, canManage }: { session: ExamSessionDetail; structure: Structure; results: ResultRow[]; revaluations: Revaluation[]; canManage: boolean }) {
  const { t, fmt } = useI18n();
  const { pending, run, feedback } = useRun();
  const sections = structure.sections.filter((x) => x.programId === s.programId && x.term === s.term);
  const subjects = structure.subjects.filter((x) => x.programId === s.programId && x.term === s.term);
  const [p, setP] = useState({ subjectId: subjects[0]?.id ?? '', sectionId: sections[0]?.id ?? '', examDate: s.startsOn, startsAt: '10:00', endsAt: '13:00', maxMarks: '60' });
  const [halls, setHalls] = useState(() => structure.rooms.slice(0, 1).map((r) => ({ roomId: r.id, capacity: '30' })));
  const [blocks, setBlocks] = useState('');
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

      {canManage && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', my: 2 }}>
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
            <Button variant="contained" color="success" disabled={pending} onClick={() => run(() => sessionStep(s.id, 'publish'), t('exm.published'))}>
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
        </Box>
      )}

      <Typography variant="h6" component="h2" sx={{ mt: 3, mb: 1 }}>
        {t('exm.timetable')}
      </Typography>
      {s.papers.length === 0 ? (
        <Typography color="text.secondary">{t('exm.noPapers')}</Typography>
      ) : (
        <TableFrame testId="exam-papers">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('exm.f.date')}</TableCell>
                <TableCell>{t('exm.f.time')}</TableCell>
                <TableCell>{t('exm.f.subject')}</TableCell>
                <TableCell>{t('exm.f.class')}</TableCell>
                <TableCell align="right">{t('exm.f.max')}</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {s.papers.map((x) => (
                <TableRow key={x.id}>
                  <TableCell>{fmt.date(x.examDate)}</TableCell>
                  <TableCell>{x.startsAt.slice(0, 5)}–{x.endsAt.slice(0, 5)}</TableCell>
                  <TableCell>{x.subject}</TableCell>
                  <TableCell>{x.section}</TableCell>
                  <TableCell align="right">{x.maxMarks}</TableCell>
                  <TableCell align="right">
                    {x.assessmentId && <Button size="small" href={`/results/${x.assessmentId}`}>{t('exm.marks')}</Button>}
                    {canManage && s.status === 'draft' && (
                      <Button size="small" color="error" disabled={pending} onClick={() => run(() => removePaper(s.id, x.id), t('exm.paperRemoved'))}>
                        {t('exm.remove')}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      )}

      {canManage && open && (
        <Card sx={{ p: 2.5, mt: 2 }}>
          <Typography variant="subtitle1" component="h3" sx={{ mb: 1.5 }}>
            {t('exm.addPaper')}
          </Typography>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(() => addPaper(s.id, { ...p, maxMarks: Number(p.maxMarks) }), t('exm.paperAdded'));
            }}
            style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}
          >
            <TextField select size="small" label={t('exm.f.subject')} value={p.subjectId} onChange={(e) => setP({ ...p, subjectId: e.target.value })}>
              {subjects.map((x) => (
                <MenuItem key={x.id} value={x.id}>
                  {x.code} {x.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField select size="small" label={t('exm.f.class')} value={p.sectionId} onChange={(e) => setP({ ...p, sectionId: e.target.value })}>
              {sections.map((x) => (
                <MenuItem key={x.id} value={x.id}>
                  {x.displayName}
                </MenuItem>
              ))}
            </TextField>
            <TextField size="small" type="date" label={t('exm.f.date')} value={p.examDate} onChange={(e) => setP({ ...p, examDate: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField size="small" type="time" label={t('exm.f.from')} value={p.startsAt} onChange={(e) => setP({ ...p, startsAt: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField size="small" type="time" label={t('exm.f.to')} value={p.endsAt} onChange={(e) => setP({ ...p, endsAt: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField size="small" type="number" label={t('exm.f.max')} value={p.maxMarks} onChange={(e) => setP({ ...p, maxMarks: e.target.value })} />
            <Button type="submit" variant="outlined" disabled={pending}>
              {t('exm.addPaper')}
            </Button>
          </form>
        </Card>
      )}

      {canManage && s.status !== 'draft' && (
        <Card sx={{ p: 2.5, mt: 3 }}>
          <Typography variant="h6" component="h2" sx={{ mb: 0.5 }}>
            {t('exm.seatingTitle')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {t('exm.seatingHelp')}
          </Typography>
          {halls.map((h, i) => (
            <Box key={i} sx={{ display: 'flex', gap: 1, mb: 1 }}>
              <TextField select size="small" label={t('exm.f.hall')} value={h.roomId} onChange={(e) => setHalls(halls.map((x, j) => (j === i ? { ...x, roomId: e.target.value } : x)))} sx={{ minWidth: 180 }}>
                {structure.rooms.map((r) => (
                  <MenuItem key={r.id} value={r.id}>
                    {r.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField size="small" type="number" label={t('exm.f.capacity')} value={h.capacity} onChange={(e) => setHalls(halls.map((x, j) => (j === i ? { ...x, capacity: e.target.value } : x)))} sx={{ width: 120 }} />
              <Button size="small" onClick={() => setHalls(halls.filter((_, j) => j !== i))} disabled={halls.length === 1}>
                {t('exm.remove')}
              </Button>
            </Box>
          ))}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button size="small" onClick={() => setHalls([...halls, { roomId: structure.rooms[0]?.id ?? '', capacity: '30' }])}>
              {t('exm.addHall')}
            </Button>
            <Button variant="outlined" disabled={pending || s.status === 'processed' || s.status === 'published' || s.status === 'locked'} onClick={() => run(() => generateSeating(s.id, halls.map((h) => ({ roomId: h.roomId, capacity: Number(h.capacity) }))), t('exm.seated'))}>
              {t('exm.seat')}
            </Button>
          </Box>
          <Typography variant="subtitle1" component="h3" sx={{ mt: 3, mb: 0.5 }}>
            {t('exm.ticketsTitle')}
          </Typography>
          <TextField
            size="small"
            fullWidth
            multiline
            minRows={2}
            label={t('exm.blocks')}
            helperText={t('exm.blocksHelp')}
            value={blocks}
            onChange={(e) => setBlocks(e.target.value)}
          />
          <Button
            sx={{ mt: 1 }}
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
          <Typography variant="h6" component="h2" sx={{ mt: 3, mb: 1 }}>
            {t('exm.resultsTitle')}
          </Typography>
          <TableFrame testId="exam-results">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('exm.f.roll')}</TableCell>
                  <TableCell>{t('exm.f.student')}</TableCell>
                  <TableCell>{t('exm.f.subjects')}</TableCell>
                  <TableCell align="right">SGPA</TableCell>
                  <TableCell align="right">CGPA</TableCell>
                  <TableCell>{t('exm.f.result')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {results.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.rollNo}</TableCell>
                    <TableCell>{r.fullName}</TableCell>
                    <TableCell>{r.lines.map((l) => `${l.code} ${l.grade}`).join(', ')}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{r.sgpa.toFixed(2)}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{r.cgpa.toFixed(2)}</TableCell>
                    <TableCell>
                      <StatusPill tone={r.outcome === 'pass' ? 'success' : 'danger'}>{t(r.outcome === 'pass' ? 'exm.pass' : 'exm.fail')}</StatusPill>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
        </>
      )}

      {revaluations.length > 0 && (
        <>
          <Typography variant="h6" component="h2" sx={{ mt: 3, mb: 1 }}>
            {t('exm.revalTitle')}
          </Typography>
          {s.status === 'locked' && <Alert severity="info" sx={{ mb: 1 }}>{t('exm.revalClosed')}</Alert>}
          <TableFrame testId="exam-revaluations">
            <Table size="small">
              <TableBody>
                {revaluations.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.rollNo} {r.student}</TableCell>
                    <TableCell>{r.subject}</TableCell>
                    <TableCell>{r.reason}</TableCell>
                    <TableCell>{r.previousPercent ?? '—'}% → {r.newPercent ?? '—'}%</TableCell>
                    <TableCell>
                      <StatusPill tone={r.status === 'requested' ? 'warning' : r.status === 'rejected' ? 'danger' : 'neutral'}>{t(`exm.rv.${r.status}`)}</StatusPill>
                    </TableCell>
                    <TableCell align="right">
                      {canManage && r.status === 'requested' && (
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
                        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                          <TextField size="small" type="number" label={t('exm.newMarks')} value={newMarks[r.id] ?? ''} onChange={(e) => setNewMarks({ ...newMarks, [r.id]: e.target.value })} sx={{ width: 120 }} />
                          <Button size="small" disabled={pending || (newMarks[r.id] ?? '') === ''} onClick={() => run(() => completeRevaluation(s.id, r.id, Number(newMarks[r.id])), t('exm.rv.completed'))}>
                            {t('exm.regrade')}
                          </Button>
                        </Box>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
        </>
      )}
    </>
  );
}
