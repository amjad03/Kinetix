'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState, useTransition } from 'react';
import { allocate, finalise, saveConfig, saveQuestions, secondValuation, uploadScript } from '@/app/(dashboard)/evaluation/actions';
import { ActionButton, Bar, FormDialog, Grid, Pill, useToast } from '@/components/ops/kit';
import { Dialog, FormField, StatGrid, StatTile, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { questionsText, valuedCount, type EvalOverview, type EvalScript, type StaffMember } from '@/lib/evaluation';
import type { ActionResult } from '@/lib/types';

type Dlg = 'config' | 'questions' | 'upload' | 'allocate' | 'second' | null;

/** One paper's evaluation: settings, questions, script upload, allocation, second valuation and final marks. */
export function EvaluationDesk({ paperId, overview, staff }: { paperId: string; overview: EvalOverview; staff: StaffMember[] }) {
  const { t } = useI18n();
  const [toast, toastNode] = useToast();
  const [dlg, setDlg] = useState<Dlg>(null);
  const { config, questions, scripts, workload } = overview;
  const done = (m?: string) => {
    setDlg(null);
    if (m) toast(m);
  };
  const needThird = scripts.filter((s) => s.status === 'needs_third').length;
  const finalised = config.finalisedAt !== null;
  const mark = (s: EvalScript, r: '1' | '2' | '3') => s.totals[r] ?? '—';

  return (
    <>
      <StatGrid min={130}>
        <StatTile label={t('ev.stat.scripts')} value={scripts.length} testId="ev-scripts" />
        <StatTile label={t('ev.stat.valued')} value={valuedCount(scripts)} testId="ev-valued" />
        <StatTile label={t('ev.stat.third')} value={needThird} tone={needThird ? 'warning' : 'default'} testId="ev-third" />
        <StatTile label={t('ev.stat.questions')} value={questions.length} caption={`${overview.paper.maxMarks}`} testId="ev-questions" />
      </StatGrid>
      <Typography sx={{ my: 2 }}>{t('ev.anon')}</Typography>
      <Bar>
        <Button variant="outlined" onClick={() => setDlg('config')} disabled={finalised}>{t('ev.settings')}</Button>
        <Button variant="outlined" onClick={() => setDlg('questions')} disabled={finalised || workload.length > 0}>{t('ev.questions')}</Button>
        <Button variant="outlined" onClick={() => setDlg('upload')} disabled={finalised}>{t('ev.upload')}</Button>
        <Button variant="contained" onClick={() => setDlg('allocate')} disabled={finalised || scripts.length === 0}>{t('ev.allocate')}</Button>
        <Button variant="contained" onClick={() => setDlg('second')} disabled={finalised || config.secondPickedAt !== null}>{t('ev.second')}</Button>
        <ActionButton label={t('ev.finalise')} disabled={finalised} run={() => finalise(paperId)} onDone={toast} />
      </Bar>

      <Typography variant="h6" component="h2" sx={{ mb: 1 }}>{t('ev.scripts')}</Typography>
      <Grid
        testId="ev-script-list"
        empty={t('ev.noScripts')}
        rows={scripts}
        tint={(s) => s.status === 'needs_third'}
        cols={[
          { label: t('ev.col.dummy'), cell: (s) => s.dummyNo },
          { label: t('ev.col.roll'), cell: (s) => s.rollNo },
          { label: t('ev.col.pages'), cell: (s) => s.pages, num: true },
          { label: t('ev.col.status'), cell: (s) => <Pill label={t(`ev.st.${s.status}` as MessageKey)} warn={s.status === 'needs_third'} />, sort: (s) => s.status },
          { label: t('ev.col.first'), cell: (s) => mark(s, '1'), num: true, sort: (s) => s.totals['1'] ?? null },
          { label: t('ev.col.second'), cell: (s) => mark(s, '2'), num: true, sort: (s) => s.totals['2'] ?? null },
          { label: t('ev.col.third'), cell: (s) => mark(s, '3'), num: true, sort: (s) => s.totals['3'] ?? null },
          { label: t('ev.col.final'), cell: (s) => s.finalMarks ?? '—', num: true, sort: (s) => s.finalMarks },
        ]}
      />

      <Typography variant="h6" component="h2" sx={{ mt: 3, mb: 1 }}>{t('ev.workload')}</Typography>
      <Grid
        testId="ev-workload"
        empty={t('ev.noWorkload')}
        rows={workload}
        cols={[
          { label: t('ev.col.examiner'), cell: (w) => w.name },
          { label: t('ev.col.allocated'), cell: (w) => w.allocated, num: true },
          { label: t('ev.col.submitted'), cell: (w) => w.submitted, num: true },
        ]}
      />
      {toastNode}

      {dlg === 'config' && (
        <FormDialog
          title={t('ev.settings')}
          onSubmit={(v) => saveConfig(paperId, v)}
          onClose={done}
          fields={[
            { name: 'perExaminerCap', label: t('ev.f.cap'), kind: 'number', required: true, init: String(config.perExaminerCap) },
            { name: 'secondSharePercent', label: t('ev.f.share'), kind: 'number', required: true, init: String(config.secondSharePercent) },
            { name: 'thresholdMarks', label: t('ev.f.threshold'), required: true, init: String(config.thresholdMarks) },
          ]}
        />
      )}
      {dlg === 'questions' && (
        <FormDialog title={t('ev.questions')} onSubmit={(v) => saveQuestions(paperId, v)} onClose={done} fields={[{ name: 'questions', label: t('ev.f.questions'), kind: 'multiline', required: true, init: questionsText(questions) }]} />
      )}
      {dlg === 'upload' && <UploadDialog paperId={paperId} onClose={done} />}
      {dlg === 'allocate' && <ExaminerDialog title={t('ev.allocate')} staff={staff} onClose={done} run={(ids) => allocate(paperId, ids)} message={(r) => t('ev.allocated', { first: r.first, third: r.third })} />}
      {dlg === 'second' && <ExaminerDialog title={t('ev.second')} staff={staff} onClose={done} run={(ids) => secondValuation(paperId, ids)} message={(r) => t('ev.secondDone', { n: r.picked })} />}
    </>
  );
}

/** Roll number and scanned pages of one answer script. */
function UploadDialog({ paperId, onClose }: { paperId: string; onClose: (msg?: string) => void }) {
  const { t } = useI18n();
  const [roll, setRoll] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = () => {
    if (!roll.trim() || files.length === 0) return setError(t('ev.err.upload'));
    const form = new FormData();
    form.set('rollNo', roll.trim());
    for (const f of files) form.append('files', f);
    setError(null);
    start(async () => {
      const res = await uploadScript(paperId, form);
      if (res.ok) onClose(t('ev.uploaded', { no: res.data.dummyNo }));
      else setError(res.error);
    });
  };
  return (
    <Dialog
      title={t('ev.upload')}
      onClose={() => onClose()}
      busy={pending}
      actions={
        <>
          <Button onClick={() => onClose()} disabled={pending}>{t('ops.cancel')}</Button>
          <Button variant="contained" onClick={submit} disabled={pending}>{t('ev.upload')}</Button>
        </>
      }
    >
      <Stack spacing={2} sx={{ pt: 1 }}>
        <FormField label={t('ev.f.roll')} required>
          <TextInput value={roll} onChange={(e) => setRoll(e.target.value)} fullWidth />
        </FormField>
        <FormField label={t('ev.f.files')} required>
          <input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFiles([...(e.target.files ?? [])])} aria-label={t('ev.f.files')} />
        </FormField>
        {error && <Alert severity="error">{error}</Alert>}
      </Stack>
    </Dialog>
  );
}

/** Pick the examiners for an allocation. */
function ExaminerDialog<T>({ title, staff, run, message, onClose }: { title: string; staff: StaffMember[]; run: (ids: string[]) => Promise<ActionResult<T>>; message: (r: T) => string; onClose: (msg?: string) => void }) {
  const { t } = useI18n();
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const submit = () => {
    if (picked.length === 0) return setError(t('ev.err.examiners'));
    setError(null);
    start(async () => {
      const res = await run(picked);
      if (res.ok) onClose(message(res.data));
      else setError(res.error);
    });
  };
  return (
    <Dialog
      title={title}
      onClose={() => onClose()}
      busy={pending}
      actions={
        <>
          <Button onClick={() => onClose()} disabled={pending}>{t('ops.cancel')}</Button>
          <Button variant="contained" onClick={submit} disabled={pending}>{title}</Button>
        </>
      }
    >
      <Stack sx={{ pt: 1 }} role="group" aria-label={t('ev.f.examiners')}>
        {staff.map((s) => (
          <FormControlLabel key={s.id} control={<Checkbox checked={picked.includes(s.id)} onChange={() => toggle(s.id)} />} label={s.fullName} />
        ))}
        {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
      </Stack>
    </Dialog>
  );
}
