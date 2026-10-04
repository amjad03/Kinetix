'use client';

import CheckCircleOutline from '@mui/icons-material/CheckCircleOutlined';
import Download from '@mui/icons-material/Download';
import ErrorOutline from '@mui/icons-material/ErrorOutlined';
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Step from '@mui/material/Step';
import StepButton from '@mui/material/StepButton';
import StepContent from '@mui/material/StepContent';
import Stepper from '@mui/material/Stepper';
import { alpha } from '@mui/material/styles';
import Switch from '@mui/material/Switch';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useRef, useState, useTransition } from 'react';
import { checkImport, importTemplate, runImport } from '@/app/(dashboard)/import/actions';
import { useI18n } from '@/i18n/client';
import {
  canImport,
  errorsFirst,
  fileProblem,
  IMPORT_KINDS,
  nextKind,
  rowErrorText,
  STATUS_LABEL,
  STEP_HELP,
  STEP_LABEL,
  type ImportKind,
  type ImportResult,
  type RowStatus,
} from '@/lib/import';

interface FileState {
  name: string;
  size: number;
  csv: string;
}

interface StepState {
  file?: FileState;
  replace: boolean;
  /** The dry run of the chosen file. */
  preview?: ImportResult;
  /** The import itself. */
  result?: ImportResult;
  error?: string;
}

const TOTAL_LABEL = { created: 'import.total.created', updated: 'import.total.updated', skipped: 'import.total.skipped', error: 'import.total.error' } as const;

const CHIP_COLOR: Record<RowStatus, 'success' | 'info' | 'default' | 'error'> = { created: 'success', updated: 'info', skipped: 'default', error: 'error' };

/** ERP → Import: one step per file. Template, file, check (dry run), then import. */
export function ImportWizard() {
  const { t } = useI18n();
  const [active, setActive] = useState(0);
  const [steps, setSteps] = useState<Record<ImportKind, StepState>>(() => Object.fromEntries(IMPORT_KINDS.map((k) => [k, { replace: false }])) as Record<ImportKind, StepState>);
  const set = (kind: ImportKind, patch: Partial<StepState>) => setSteps((s) => ({ ...s, [kind]: { ...s[kind], ...patch } }));

  return (
    <Card sx={{ p: { xs: 2, md: 3 } }}>
      <Stepper nonLinear activeStep={active} orientation="vertical">
        {IMPORT_KINDS.map((kind, i) => (
          <Step key={kind} completed={!!steps[kind].result?.committed} data-testid={`import-step-${kind}`}>
            <StepButton onClick={() => setActive(i)}>
              <Typography variant="subtitle1" component="span">
                {t(STEP_LABEL[kind])}
              </Typography>
            </StepButton>
            <StepContent>
              <ImportStep
                kind={kind}
                state={steps[kind]}
                onChange={(patch) => set(kind, patch)}
                onNext={() => {
                  setActive(i + 1);
                }}
              />
            </StepContent>
          </Step>
        ))}
      </Stepper>
    </Card>
  );
}

function ImportStep({ kind, state, onChange, onNext }: { kind: ImportKind; state: StepState; onChange: (p: Partial<StepState>) => void; onNext: () => void }) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<'check' | 'import' | 'template' | null>(null);
  const next = nextKind(kind);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    const problem = fileProblem(file);
    if (problem) return onChange({ file: undefined, preview: undefined, result: undefined, error: t(problem) });
    try {
      // Refuse text that is not UTF-8 here, so the error is clear (Excel's plain "CSV" is not).
      const csv = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      onChange({ file: { name: file.name, size: file.size, csv }, preview: undefined, result: undefined, error: undefined });
    } catch {
      onChange({ file: undefined, preview: undefined, result: undefined, error: t('import.err.read') });
    }
  };

  const run = (what: 'check' | 'import') =>
    start(async () => {
      if (!state.file) return;
      setBusy(what);
      const res = await (what === 'check' ? checkImport : runImport)(kind, state.file.csv, state.replace);
      setBusy(null);
      if (!res.ok) return onChange({ error: res.error });
      onChange(what === 'check' ? { preview: res.data, result: undefined, error: undefined } : { result: res.data, preview: res.data.committed ? undefined : res.data, error: undefined });
    });

  const download = () =>
    start(async () => {
      setBusy('template');
      const res = await importTemplate(kind);
      setBusy(null);
      if (!res.ok) return onChange({ error: res.error });
      // A byte-order mark, so Excel opens Hindi and Kannada names correctly.
      const url = URL.createObjectURL(new Blob(['﻿', res.data], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `kinetix-${kind}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });

  const shown = state.result ?? state.preview;
  return (
    <Stack spacing={2} sx={{ pt: 1, pb: 2 }} data-testid={`import-panel-${kind}`}>
      <Typography variant="body2" color="text.secondary">
        {t(STEP_HELP[kind])}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
        <Button variant="outlined" startIcon={busy === 'template' ? <CircularProgress size={18} /> : <Download />} onClick={download} disabled={pending} data-testid="import-template">
          {t('import.template')}
        </Button>
        <Button variant="outlined" startIcon={<UploadFileOutlined />} onClick={() => input.current?.click()} disabled={pending}>
          {t('import.chooseFile')}
        </Button>
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          hidden
          data-testid={`import-file-${kind}`}
          onChange={(e) => {
            void choose(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <Typography variant="body2" color={state.file ? 'text.primary' : 'text.secondary'} data-testid="import-file-name" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
          {state.file ? t('import.fileInfo', { name: state.file.name, size: Math.max(1, Math.round(state.file.size / 1024)) }) : t('import.noFile')}
        </Typography>
      </Box>
      {kind === 'timetable' && (
        <Box>
          <FormControlLabel
            control={<Checkbox checked={state.replace} onChange={(e) => onChange({ replace: e.target.checked, preview: undefined, result: undefined })} data-testid="import-replace" />}
            label={t('import.replace')}
          />
          <Typography variant="caption" color="text.secondary" component="div" sx={{ ml: 4 }}>
            {t('import.replaceHelp')}
          </Typography>
        </Box>
      )}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
        <Button variant={canImport(state.preview ?? null) ? 'outlined' : 'contained'} onClick={() => run('check')} disabled={!state.file || pending} data-testid="import-check" startIcon={busy === 'check' ? <CircularProgress size={18} color="inherit" /> : undefined}>
          {busy === 'check' ? t('import.checking') : t('import.check')}
        </Button>
        <Button variant="contained" onClick={() => run('import')} disabled={!canImport(state.preview ?? null) || pending} data-testid="import-run" startIcon={busy === 'import' ? <CircularProgress size={18} color="inherit" /> : undefined}>
          {busy === 'import' ? t('import.importing') : t('import.import')}
        </Button>
      </Box>
      {state.error && (
        <Alert severity="error" data-testid="import-error">
          {state.error}
        </Alert>
      )}
      {state.result?.committed && (
        <Alert
          severity="success"
          icon={<CheckCircleOutline />}
          data-testid="import-done"
          action={
            next ? (
              <Button color="inherit" size="small" onClick={onNext} data-testid="import-next">
                {t('import.next', { step: t(STEP_LABEL[next]) })}
              </Button>
            ) : undefined
          }
        >
          {t('import.done', { created: state.result.totals.created, updated: state.result.totals.updated, skipped: state.result.totals.skipped })}
        </Alert>
      )}
      {shown && !state.result?.committed && <Preview result={shown} />}
    </Stack>
  );
}

function Preview({ result }: { result: ImportResult }) {
  const { t } = useI18n();
  const [onlyErrors, setOnlyErrors] = useState(false);
  const errors = result.totals.error;
  const rows = errorsFirst(onlyErrors ? result.rows.filter((r) => r.status === 'error') : result.rows);
  return (
    <Box data-testid="import-preview">
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 1.5 }} data-testid="import-totals">
        {(['created', 'updated', 'skipped', 'error'] as const).map((k) => (
          <Chip key={k} size="small" variant={k === 'error' && errors ? 'filled' : 'outlined'} color={k === 'error' && errors ? 'error' : 'default'} label={`${t(TOTAL_LABEL[k])}: ${result.totals[k]}`} data-testid={`import-total-${k}`} />
        ))}
        {errors > 0 && (
          <FormControlLabel sx={{ ml: 'auto' }} control={<Switch size="small" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} />} label={t('import.errorsOnly')} />
        )}
      </Box>
      {errors > 0 ? (
        <Alert severity="error" icon={<ErrorOutline />} sx={{ mb: 1.5 }} data-testid="import-has-errors">
          {result.dryRun ? t.plural('import.hasErrors', errors) : t('import.notSaved')}
        </Alert>
      ) : (
        <Alert severity="info" sx={{ mb: 1.5 }} data-testid="import-ready">
          {t('import.previewNote')} {t('import.ready')}
        </Alert>
      )}
      <TableContainer sx={{ maxHeight: 480, border: 1, borderColor: 'divider', borderRadius: 2 }}>
        <Table size="small" stickyHeader aria-label={t('import.preview')}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 72 }}>{t('import.col.row')}</TableCell>
              <TableCell sx={{ width: 140 }}>{t('import.col.status')}</TableCell>
              <TableCell>{t('import.col.details')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => {
              const err = r.status === 'error' ? rowErrorText(r, t) : null;
              return (
                <TableRow key={r.row} data-testid="import-row" data-status={r.status} sx={err ? { bgcolor: (th) => alpha(th.palette.error.main, 0.08) } : undefined}>
                  <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>{r.row}</TableCell>
                  <TableCell>
                    <Chip size="small" color={CHIP_COLOR[r.status]} variant={r.status === 'skipped' ? 'outlined' : 'filled'} label={t(STATUS_LABEL[r.status])} />
                  </TableCell>
                  <TableCell sx={{ overflowWrap: 'anywhere' }}>
                    {err ? (
                      <>
                        <Typography variant="body2" component="span" color="error" sx={{ fontWeight: 500 }} data-testid="import-row-error">
                          {err.text}
                        </Typography>
                        {err.detail && (
                          <Typography variant="body2" component="span" color="text.secondary">
                            {' · '}
                            {err.detail}
                          </Typography>
                        )}
                      </>
                    ) : (
                      r.message
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
