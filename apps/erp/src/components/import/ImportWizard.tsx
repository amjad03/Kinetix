'use client';
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

import { Alert, Button, Card, Checkbox, Chip, CircularProgress, FormControlLabel, Step, StepButton, StepContent, Stepper, Switch, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@/components/kx';
import { CircleAlert as ErrorOutline, CircleCheck as CheckCircleOutline, Download, FileUp as UploadFileOutlined } from 'lucide-react';
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
    <Card className="p-4 md:p-6">
      <Stepper nonLinear activeStep={active} orientation="vertical">
        {IMPORT_KINDS.map((kind, i) => (
          <Step key={kind} completed={!!steps[kind].result?.committed} data-testid={`import-step-${kind}`}>
            <StepButton onClick={() => setActive(i)}>
              <span className="text-base leading-6 font-medium tracking-[0.1px]">
                {t(STEP_LABEL[kind])}
              </span>
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
    <div className="flex flex-col gap-4 pt-2 pb-4" data-testid={`import-panel-${kind}`}>
      <p className="text-[13px] leading-[19px] text-muted-foreground">
        {t(STEP_HELP[kind])}
      </p>
      <div className="flex flex-wrap items-center gap-3">
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
        <Typography className="min-w-0 wrap-anywhere" variant="body2" color={state.file ? 'text.primary' : 'text.secondary'} data-testid="import-file-name">
          {state.file ? t('import.fileInfo', { name: state.file.name, size: Math.max(1, Math.round(state.file.size / 1024)) }) : t('import.noFile')}
        </Typography>
      </div>
      {kind === 'timetable' && (
        <div>
          <FormControlLabel
            control={<Checkbox checked={state.replace} onChange={(e) => onChange({ replace: e.target.checked, preview: undefined, result: undefined })} data-testid="import-replace" />}
            label={t('import.replace')}
          />
          <div className="text-xs leading-4 tracking-[0.3px] text-muted-foreground ml-8">
            {t('import.replaceHelp')}
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <Button variant={canImport(state.preview ?? null) ? 'outlined' : 'contained'} onClick={() => run('check')} disabled={!state.file || pending} data-testid="import-check" startIcon={busy === 'check' ? <CircularProgress size={18} color="inherit" /> : undefined}>
          {busy === 'check' ? t('import.checking') : t('import.check')}
        </Button>
        <Button variant="contained" onClick={() => run('import')} disabled={!canImport(state.preview ?? null) || pending} data-testid="import-run" startIcon={busy === 'import' ? <CircularProgress size={18} color="inherit" /> : undefined}>
          {busy === 'import' ? t('import.importing') : t('import.import')}
        </Button>
      </div>
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
    </div>
  );
}

function Preview({ result }: { result: ImportResult }) {
  const { t } = useI18n();
  const [onlyErrors, setOnlyErrors] = useState(false);
  const errors = result.totals.error;
  const rows = errorsFirst(onlyErrors ? result.rows.filter((r) => r.status === 'error') : result.rows);
  return (
    <div data-testid="import-preview">
      <div className="flex flex-wrap items-center gap-2 mb-3" data-testid="import-totals">
        {(['created', 'updated', 'skipped', 'error'] as const).map((k) => (
          <Chip key={k} size="small" variant={k === 'error' && errors ? 'filled' : 'outlined'} color={k === 'error' && errors ? 'error' : 'default'} label={`${t(TOTAL_LABEL[k])}: ${result.totals[k]}`} data-testid={`import-total-${k}`} />
        ))}
        {errors > 0 && (
          <FormControlLabel className="ml-auto" control={<Switch size="small" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} />} label={t('import.errorsOnly')} />
        )}
      </div>
      {errors > 0 ? (
        <Alert className="mb-3" severity="error" icon={<ErrorOutline />} data-testid="import-has-errors">
          {result.dryRun ? t.plural('import.hasErrors', errors) : t('import.notSaved')}
        </Alert>
      ) : (
        <Alert className="mb-3" severity="info" data-testid="import-ready">
          {t('import.previewNote')} {t('import.ready')}
        </Alert>
      )}
      <TableContainer className="max-h-[480px] border border-border rounded-[20px]">
        <Table size="small" stickyHeader aria-label={t('import.preview')}>
          <TableHead>
            <TableRow>
              <TableCell className="w-[72px]">{t('import.col.row')}</TableCell>
              <TableCell className="w-[140px]">{t('import.col.status')}</TableCell>
              <TableCell>{t('import.col.details')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => {
              const err = r.status === 'error' ? rowErrorText(r, t) : null;
              return (
                <TableRow className={err ? 'bg-red-soft/60' : undefined} key={r.row} data-testid="import-row" data-status={r.status}>
                  <TableCell className="tabular-nums">{r.row}</TableCell>
                  <TableCell>
                    <Chip size="small" color={CHIP_COLOR[r.status]} variant={r.status === 'skipped' ? 'outlined' : 'filled'} label={t(STATUS_LABEL[r.status])} />
                  </TableCell>
                  <TableCell className="wrap-anywhere">
                    {err ? (
                      <>
                        <span className="text-[13px] leading-[19px] text-red-ink font-medium" data-testid="import-row-error">
                          {err.text}
                        </span>
                        {err.detail && (
                          <span className="text-[13px] leading-[19px] text-muted-foreground">
                            {' · '}
                            {err.detail}
                          </span>
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
    </div>
  );
}
