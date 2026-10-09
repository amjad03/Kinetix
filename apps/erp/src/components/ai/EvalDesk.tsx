'use client';

import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { addEvalCase, removeEvalCase, runEvals } from '@/app/(dashboard)/ai/audit-actions';
import { ActionButton, Bar, FormDialog, Grid, useToast } from '@/components/ops/kit';
import { StatusPill } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { EvalCase, EvalRun } from '@/lib/governance';

/** Fixed questions with checks on the answer, run against the live model before a prompt or model change ships. */
export function EvalDesk({ cases, runs }: { cases: EvalCase[]; runs: EvalRun[] }) {
  const { t, fmt } = useI18n();
  const [toast, toastNode] = useToast();
  const [open, setOpen] = useState(false);
  const latest = runs[0];
  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('ae.hint')}
      </Typography>
      <Bar>
        <Button variant="contained" onClick={() => setOpen(true)} data-testid="ae-add">
          {t('ae.add')}
        </Button>
        <ActionButton label={t('ae.run')} run={runEvals} onDone={toast} disabled={cases.length === 0} />
      </Bar>
      {latest && (
        <Typography sx={{ mb: 2 }} data-testid="ae-latest">
          {t('ae.latest', { passed: latest.passed, total: latest.passed + latest.failed, when: fmt.dateTime(latest.createdAt), model: latest.model || latest.provider })}
        </Typography>
      )}
      <Grid
        testId="ae-cases"
        empty={t('ae.empty')}
        rows={cases}
        cols={[
          { label: t('ae.col.name'), cell: (r) => r.name, sort: (r) => r.name },
          { label: t('ae.col.task'), cell: (r) => r.task, sort: (r) => r.task },
          { label: t('ae.col.include'), cell: (r) => r.mustInclude.join(', ') || '—' },
          { label: t('ae.col.exclude'), cell: (r) => r.mustNotInclude.join(', ') || '—' },
          {
            label: t('ae.col.last'),
            cell: (r) => {
              const res = latest?.results.find((x) => x.caseId === r.id);
              return res ? <StatusPill tone={res.passed ? 'success' : 'danger'}>{res.passed ? t('ae.pass') : res.failures[0] ?? t('ae.fail')}</StatusPill> : '—';
            },
          },
          { label: '', cell: (r) => <ActionButton label={t('ae.remove')} tone="error" run={() => removeEvalCase(r.id)} onDone={toast} /> },
        ]}
      />
      <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
        {t('ae.runs')}
      </Typography>
      <Grid
        testId="ae-runs"
        empty={t('ae.noRuns')}
        rows={runs}
        cols={[
          { label: t('ae.col.when'), cell: (r) => fmt.dateTime(r.createdAt), sort: (r) => r.createdAt },
          { label: t('ae.col.model'), cell: (r) => r.model || r.provider },
          { label: t('ae.col.passed'), cell: (r) => `${r.passed} / ${r.passed + r.failed}`, num: true, sort: (r) => r.passed },
        ]}
      />
      {open && (
        <FormDialog
          title={t('ae.add')}
          intro={t('ae.addHint')}
          onSubmit={addEvalCase}
          onClose={(m) => {
            setOpen(false);
            if (m) toast(t('ops.saved'));
          }}
          fields={[
            { name: 'name', label: t('ae.f.name'), required: true },
            { name: 'task', label: t('ae.f.task'), kind: 'select', init: 'explain', options: [{ value: 'explain', label: 'explain' }, { value: 'tutor', label: 'tutor' }] },
            { name: 'input', label: t('ae.f.input'), kind: 'multiline', init: '{"question": "What is photosynthesis?", "language": "en"}', required: true },
            { name: 'mustInclude', label: t('ae.f.include'), kind: 'multiline' },
            { name: 'mustNotInclude', label: t('ae.f.exclude'), kind: 'multiline' },
            { name: 'maxChars', label: t('ae.f.max'), kind: 'number' },
          ]}
        />
      )}
      {toastNode}
    </>
  );
}
