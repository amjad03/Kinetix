'use client';
import { useState } from 'react';
import { enterMarks, moderateMarks, reopenMarks, submitMarks, verifyMarks } from '@/app/(dashboard)/results/actions';
import { TableFrame } from '@/components/DataTable';
import { useRun } from '@/components/exams/useRun';
import { StatusPill } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { canEnterMarks } from '@/lib/exams';
import type { AssessmentDetail } from '@/lib/types';

import { Button, Card, Table, TableBody, TableCell, TableHead, TableRow, TextField } from '@/components/kx';
/** Marks entry and the check-and-moderate workflow: draft → submitted → verified → moderated. */
export function MarksPanel({ assessment: a, canVerify }: { assessment: AssessmentDetail; canPublish: boolean; canVerify: boolean }) {
  const { t } = useI18n();
  const { pending, run, feedback } = useRun();
  const status = a.markStatus ?? 'draft';
  const [vals, setVals] = useState<Record<string, { marks: string; absent: boolean }>>(() => Object.fromEntries(a.students.map((s) => [s.id, { marks: s.marks === null ? '' : String(s.marks), absent: s.absent }])));
  const [mod, setMod] = useState<Record<string, { marks: string; note: string }>>({});
  const editable = canEnterMarks(status);

  return (
    <Card className="p-4 md:p-6 mb-6" data-testid="marks-panel">
      <div className="flex gap-3 items-center flex-wrap mb-3">
        <h2 className="text-base leading-6 font-medium tracking-[0.1px]">
          {t('results.entry.title')}
        </h2>
        <StatusPill tone={status === 'draft' ? 'neutral' : status === 'submitted' ? 'warning' : 'success'}>{t(`results.ms.${status}`)}</StatusPill>
        <div className="flex-1" />
        {status === 'draft' && (
          <Button variant="contained" disabled={pending} onClick={() => run(() => submitMarks(a.id), t('results.entry.submitted'))}>
            {t('results.entry.submit')}
          </Button>
        )}
        {status === 'submitted' && canVerify && (
          <Button variant="contained" disabled={pending} onClick={() => run(() => verifyMarks(a.id), t('results.entry.verified'))}>
            {t('results.entry.verify')}
          </Button>
        )}
        {status !== 'draft' && canVerify && (
          <Button variant="outlined" disabled={pending} onClick={() => run(() => reopenMarks(a.id), t('results.entry.reopened'))}>
            {t('results.entry.reopen')}
          </Button>
        )}
      </div>
      {feedback}
      <TableFrame>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('results.col.roll')}</TableCell>
              <TableCell>{t('results.col.student')}</TableCell>
              <TableCell>{t('results.entry.marks', { max: a.maxMarks })}</TableCell>
              <TableCell>{t('results.entry.absent')}</TableCell>
              {(status === 'verified' || status === 'moderated') && canVerify && <TableCell>{t('results.moderate.to')}</TableCell>}
              {status !== 'draft' && <TableCell>{t('results.moderate.current')}</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {a.students.map((s) => {
              const v = vals[s.id] ?? { marks: '', absent: false };
              return (
                <TableRow key={s.id}>
                  <TableCell>{s.rollNo}</TableCell>
                  <TableCell>{s.fullName}</TableCell>
                  <TableCell>
                    <TextField className="w-[100px]" size="small" type="number" value={v.marks} disabled={!editable || v.absent} onChange={(e) => setVals({ ...vals, [s.id]: { ...v, marks: e.target.value } })} slotProps={{ htmlInput: { min: 0, max: a.maxMarks, step: 0.5, 'aria-label': `${s.fullName} ${t('results.entry.marks', { max: a.maxMarks })}` } }} />
                  </TableCell>
                  <TableCell>
                    <input type="checkbox" checked={v.absent} disabled={!editable} onChange={(e) => setVals({ ...vals, [s.id]: { marks: '', absent: e.target.checked } })} aria-label={`${s.fullName} ${t('results.entry.absent')}`} />
                  </TableCell>
                  {(status === 'verified' || status === 'moderated') && canVerify && (
                    <TableCell>
                      <div className="flex gap-2">
                        <TextField className="w-[90px]" size="small" type="number" placeholder={s.moderatedMarks == null ? undefined : String(s.moderatedMarks)} value={mod[s.id]?.marks ?? ''} onChange={(e) => setMod({ ...mod, [s.id]: { marks: e.target.value, note: mod[s.id]?.note ?? '' } })} slotProps={{ htmlInput: { 'aria-label': `${s.fullName} ${t('results.moderate.to')}` } }} />
                        <TextField size="small" placeholder={t('results.moderate.note')} value={mod[s.id]?.note ?? ''} onChange={(e) => setMod({ ...mod, [s.id]: { marks: mod[s.id]?.marks ?? '', note: e.target.value } })} />
                      </div>
                    </TableCell>
                  )}
                  {status !== 'draft' && <TableCell>{s.moderatedMarks ?? s.marks ?? '—'}</TableCell>}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableFrame>
      <div className="mt-3 flex gap-2">
        {editable && (
          <Button
            variant="outlined"
            disabled={pending}
            onClick={() =>
              run(
                () => enterMarks(a.id, a.students.map((s) => ({ studentId: s.id, marks: vals[s.id]?.marks === '' || vals[s.id] === undefined ? null : Number(vals[s.id].marks), absent: vals[s.id]?.absent ?? false })).filter((e) => e.absent || e.marks !== null)),
                t('results.entry.saved'),
              )
            }
          >
            {t('results.entry.save')}
          </Button>
        )}
        {(status === 'verified' || status === 'moderated') && canVerify && (
          <Button
            variant="outlined"
            disabled={pending || !Object.values(mod).some((m) => m.marks !== '' && m.note.trim() !== '')}
            onClick={() =>
              run(
                () => moderateMarks(a.id, Object.entries(mod).filter(([, m]) => m.marks !== '' && m.note.trim() !== '').map(([studentId, m]) => ({ studentId, moderatedMarks: Number(m.marks), note: m.note }))),
                t('results.moderate.done'),
                () => setMod({}),
              )
            }
          >
            {t('results.moderate.apply')}
          </Button>
        )}
      </div>
    </Card>
  );
}
