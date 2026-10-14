'use client';

import { CircleAlert, CircleCheck, Download, FileSpreadsheet } from 'lucide-react';
import { useId, useRef, useState, useTransition } from 'react';
import { commitImport, uploadImport } from '@/app/(dashboard)/records-actions';
import { Button } from '@/components/shadcn/button';
import { CheckboxField, Dialog, StatusPill, type Tone } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { templateHref, type ImportBatch, type ImportRowStatus, type RecordMeta } from '@/lib/records';
import { rowErrorText } from '@/lib/import';
import { toCsv } from '@/lib/table';
import { cn } from '@/lib/utils';

const TONE: Record<ImportRowStatus, Tone> = { created: 'success', updated: 'info', skipped: 'neutral', error: 'danger' };
type Step = 'file' | 'preview' | 'result';

/**
 * Import for one list: download the Excel template (headers, drop-downs, an example row), upload it filled in (or a
 * CSV), check every row without saving, then import — all rows, or only the good ones — and keep the report.
 */
export function ImportWizard({ meta, title, onClose, onDone }: { meta: RecordMeta; title: string; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('file');
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<'upsert' | 'insert'>('upsert');
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [skipErrors, setSkipErrors] = useState(false);
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const cols = meta.import?.columns ?? [];
  const keyCols = cols.filter((c) => meta.import?.key.includes(c.key) || c.required).slice(0, 3);

  const check = () =>
    start(async () => {
      if (!file) return;
      setError(null);
      const form = new FormData();
      form.set('file', file);
      form.set('mode', mode);
      const res = await uploadImport(meta.key, form);
      if (!res.ok) return setError(res.error);
      setBatch(res.data);
      setOnlyErrors(res.data.totals.error > 0);
      setStep('preview');
    });

  const commit = () =>
    start(async () => {
      if (!batch) return;
      setError(null);
      const res = await commitImport(meta.key, batch.id, skipErrors);
      if (!res.ok) return setError(res.error);
      setBatch(res.data);
      if (res.data.committed) {
        setStep('result');
        onDone();
      } else setError(t('rk.import.stillErrors', { n: res.data.totals.error }));
    });

  const downloadReport = () => {
    if (!batch) return;
    const csv = toCsv([t('rk.import.row'), t('rk.import.status'), t('rk.import.message'), ...cols.map((c) => c.header)], batch.rows.map((r) => [r.row, t(`rk.import.st.${r.status}` as MessageKey), (({ text, detail }) => [text, detail].filter(Boolean).join(': '))(r.status === 'error' ? rowErrorText(r, t) : { text: r.message, detail: r.detail }), ...cols.map((c) => r.values[c.key] ?? '')]));
    const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${meta.key}-import-report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totals = batch?.totals;
  const errors = totals?.error ?? 0;
  const good = (totals?.created ?? 0) + (totals?.updated ?? 0) + (totals?.skipped ?? 0);
  const rows = (batch?.rows ?? []).filter((r) => !onlyErrors || r.status === 'error');

  const actions =
    step === 'file' ? (
      <>
        <Button variant="outline" onClick={onClose} disabled={pending}>
          {t('common.cancel')}
        </Button>
        <Button onClick={check} disabled={!file || pending} data-testid="import-check">
          {t('rk.import.check')}
        </Button>
      </>
    ) : step === 'preview' ? (
      <>
        <Button variant="outline" onClick={() => setStep('file')} disabled={pending}>
          {t('rk.import.back')}
        </Button>
        <Button onClick={commit} disabled={pending || good === 0 || (errors > 0 && !skipErrors)} data-testid="import-commit">
          {errors > 0 ? t('rk.import.commitGood', { n: good }) : t('rk.import.commit', { n: good })}
        </Button>
      </>
    ) : (
      <>
        <Button variant="outline" onClick={downloadReport}>
          <Download />
          {t('rk.report.download')}
        </Button>
        <Button onClick={onClose}>{t('rk.import.done')}</Button>
      </>
    );

  return (
    <Dialog title={title} size="lg" busy={pending} onClose={onClose} actions={actions}>
      <div className="grid gap-4" data-testid="import-wizard">
        <ol aria-label={t('rk.import.steps')} className="m-0 flex list-none flex-wrap gap-2 p-0 text-[13px]">
          {(['file', 'preview', 'result'] as Step[]).map((s, i) => (
            <li key={s} aria-current={s === step ? 'step' : undefined} className={cn('rounded-full border px-3 py-1', s === step ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground')}>
              {i + 1}. {t(`rk.import.step.${s}` as MessageKey)}
            </li>
          ))}
        </ol>
        {error && (
          <p role="alert" className="m-0 rounded-md border border-red-soft bg-red-soft/40 px-3 py-2 text-[13px] text-red-ink">
            {error}
          </p>
        )}

        {step === 'file' && (
          <>
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/40 p-3">
              <FileSpreadsheet aria-hidden className="size-5 text-muted-foreground" />
              <p className="m-0 flex-1 text-[13px]">{t('rk.import.templateHelp')}</p>
              <Button asChild variant="outline" size="sm">
                <a href={templateHref(meta.key)} download data-testid="import-template">
                  <Download />
                  {t('rk.import.template')}
                </a>
              </Button>
            </div>
            <div className="grid gap-1.5">
              <label htmlFor={`${id}-file`} className="text-[13px] font-semibold">
                {t('rk.import.file')}
              </label>
              <input
                ref={fileRef}
                id={`${id}-file`}
                type="file"
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="text-[13px] file:mr-3 file:rounded-md file:border file:border-border file:bg-card file:px-3 file:py-1.5 file:text-[13px]"
                data-testid="import-file"
              />
              <p className="m-0 text-xs text-muted-foreground">{t('rk.import.fileHelp')}</p>
            </div>
            <fieldset className="m-0 grid gap-2 border-0 p-0">
              <legend className="mb-1.5 text-[13px] font-semibold">{t('rk.import.mode')}</legend>
              {(['upsert', 'insert'] as const).map((m) => (
                <label key={m} className="flex cursor-pointer items-start gap-2.5 text-[13.5px]">
                  <input type="radio" name={`${id}-mode`} checked={mode === m} onChange={() => setMode(m)} className="mt-1" />
                  <span>
                    <b className="font-[550]">{t(`rk.import.mode.${m}` as MessageKey)}</b>
                    <span className="block text-xs text-muted-foreground">{t(`rk.import.mode.${m}.help` as MessageKey, { key: (meta.import?.key ?? []).map((k) => cols.find((c) => c.key === k)?.header ?? k).join(' + ') })}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          </>
        )}

        {step !== 'file' && batch && totals && (
          <>
            <div role="status" className="flex flex-wrap gap-2">
              {(['created', 'updated', 'skipped', 'error'] as const).map((s) => (
                <StatusPill key={s} tone={TONE[s]}>
                  {t(`rk.import.total.${s}` as MessageKey, { n: totals[s] })}
                </StatusPill>
              ))}
              {batch.ignored.length > 0 && <span className="text-xs text-muted-foreground">{t('rk.import.ignored', { columns: batch.ignored.join(', ') })}</span>}
            </div>
            {step === 'result' && (
              <p className="m-0 flex items-center gap-2 text-[14px]">
                <CircleCheck aria-hidden className="size-5 text-green-ink" />
                {t('rk.import.saved', { n: good, file: batch.fileName })}
              </p>
            )}
            {step === 'preview' && errors > 0 && (
              <div className="flex flex-wrap items-center gap-4 rounded-md border border-amber-soft bg-amber-soft/40 px-3 py-2 text-[13px]">
                <CircleAlert aria-hidden className="size-4 text-amber-ink" />
                <span className="flex-1">{t('rk.import.hasErrors', { n: errors })}</span>
                <CheckboxField label={t('rk.import.skipErrors')} checked={skipErrors} onChange={setSkipErrors} />
              </div>
            )}
            {(totals.error > 0 || step === 'preview') && (
              <div className="flex items-center gap-3">
                <CheckboxField label={t('rk.import.onlyErrors')} checked={onlyErrors} onChange={setOnlyErrors} />
              </div>
            )}
            <div className="max-h-[45vh] overflow-auto rounded-md border border-border">
              <table className="w-full text-[13px]" aria-label={t('rk.import.rows')}>
                <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-semibold">{t('rk.import.row')}</th>
                    <th className="px-3 py-2 font-semibold">{t('rk.import.status')}</th>
                    {keyCols.map((c) => (
                      <th key={c.key} className="px-3 py-2 font-semibold">
                        {c.header}
                      </th>
                    ))}
                    <th className="px-3 py-2 font-semibold">{t('rk.import.message')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const msg = r.status === 'error' ? rowErrorText(r, t) : { text: r.message, detail: r.detail };
                    return (
                    <tr key={r.row} className="border-t border-border align-top" data-testid={`import-row-${r.row}`}>
                      <td className="px-3 py-2 tabular-nums">{r.row}</td>
                      <td className="px-3 py-2">
                        <StatusPill tone={TONE[r.status]}>{t(`rk.import.st.${r.status}` as MessageKey)}</StatusPill>
                      </td>
                      {keyCols.map((c) => (
                        <td key={c.key} className="px-3 py-2">
                          {r.values[c.key] || '—'}
                        </td>
                      ))}
                      <td className={cn('px-3 py-2', r.status === 'error' && 'text-red-ink')}>
                        {msg.text}
                        {msg.detail && <span className="block text-xs text-muted-foreground">{msg.detail}</span>}
                      </td>
                    </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={3 + keyCols.length} className="px-3 py-6 text-center text-muted-foreground">
                        {t('rk.import.noRows')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
