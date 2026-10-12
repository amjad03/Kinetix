'use client';
import { useState, useTransition } from 'react';
import { deleteCustomReport, runCustomReport, saveCustomReport, scheduleCustomReport, unscheduleCustomReport } from '@/app/(dashboard)/reports/custom/actions';
import { FormDialog, Grid, InfoDialog, Pill, useToast, type Col, type Field } from '@/components/ops/kit';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { MiniBar } from '@/components/Bars';
import { chartOf, customExportPath, formatAggregates, formatFilters, formatList, formatSort, OPS, type CustomResult, type DatasetMeta, type SavedReport } from '@/lib/govern';

import { Button } from '@/components/kx';
import { Plus as Add } from 'lucide-react';
/** Saved custom reports: build, preview, run, download as CSV and schedule by email. */
export function ReportBuilder({ datasets, reports }: { datasets: DatasetMeta[]; reports: SavedReport[] }) {
  const { t, fmt } = useI18n();
  const [toast, toastNode] = useToast();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<SavedReport | 'new' | null>(null);
  const [scheduling, setScheduling] = useState<SavedReport | null>(null);
  const [result, setResult] = useState<{ title: string; data: CustomResult } | null>(null);

  const dataset = (key: string) => datasets.find((d) => d.key === key);
  const run = (r: SavedReport) =>
    start(async () => {
      const res = await runCustomReport(r.id);
      if (res.ok) setResult({ title: r.name, data: res.data });
      else toast(res.error);
    });
  const remove = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    start(async () => {
      const res = await fn();
      toast(res.ok ? t('ops.saved') : res.error);
    });

  const cols: Col<SavedReport>[] = [
    { label: t('rb.col.name'), cell: (r) => r.name, sort: (r) => r.name },
    { label: t('rb.col.dataset'), cell: (r) => dataset(r.dataset)?.label ?? r.dataset },
    { label: t('rb.col.schedule'), cell: (r) => (r.schedule ? <Pill label={t(`rb.freq.${r.schedule.frequency}` as MessageKey)} warn={!r.schedule.active} /> : '-') },
    {
      label: '',
      cell: (r) => (
        <div className="flex flex-row gap-1 flex-wrap">
          <Button size="small" disabled={pending} onClick={() => run(r)} data-testid={`rb-run-${r.id}`}>{t('rb.run')}</Button>
          <Button size="small" href={customExportPath(r.id)}>{t('rb.csv')}</Button>
          <Button size="small" onClick={() => setEditing(r)}>{t('rb.edit')}</Button>
          <Button size="small" onClick={() => setScheduling(r)}>{t('rb.schedule')}</Button>
          {r.schedule && <Button size="small" disabled={pending} onClick={() => remove(() => unscheduleCustomReport(r.id))}>{t('rb.unschedule')}</Button>}
          <Button size="small" color="error" disabled={pending} onClick={() => remove(() => deleteCustomReport(r.id))}>{t('rb.delete')}</Button>
        </div>
      ),
    },
  ];

  const resultCols = (data: CustomResult): Col<Record<string, string | number | null>>[] =>
    data.columns.map((c) => ({
      label: c.label,
      num: c.kind === 'money' || c.kind === 'int',
      cell: (row) => {
        const v = row[c.key];
        if (v === null || v === undefined) return '-';
        if (c.kind === 'money' && typeof v === 'number') return fmt.rupees(Math.round(v));
        return typeof v === 'number' ? fmt.number(v) : v;
      },
      sort: (row) => row[c.key] ?? null,
    }));

  const fields = (r?: SavedReport): Field[] => {
    const def = r?.definition;
    const fieldList = (key: string) => dataset(key)?.fields.map((f) => `${f.key} (${f.type})`).join(', ') ?? '';
    return [
      { name: 'name', label: t('rb.f.name'), required: true, init: r?.name },
      { name: 'description', label: t('rb.f.description'), init: r?.description },
      { name: 'dataset', label: t('rb.f.dataset'), kind: 'select', required: true, init: r?.dataset ?? datasets[0]?.key, options: datasets.map((d) => ({ value: d.key, label: `${d.label}: ${fieldList(d.key)}` })) },
      { name: 'columns', label: t('rb.f.columns'), init: def ? formatList(def.columns) : '' },
      { name: 'groupBy', label: t('rb.f.groupBy'), init: def ? formatList(def.groupBy) : '' },
      { name: 'aggregates', label: t('rb.f.aggregates'), init: def ? formatAggregates(def.aggregates) : '' },
      { name: 'filters', label: t('rb.f.filters'), kind: 'multiline', init: def ? formatFilters(def.filters) : '' },
      { name: 'sort', label: t('rb.f.sort'), init: def ? formatSort(def.sort) : '' },
      { name: 'limit', label: t('rb.f.limit'), kind: 'number', init: def ? String(def.limit) : '1000' },
    ];
  };

  const close = (m?: string) => {
    setEditing(null);
    setScheduling(null);
    if (m) toast(m);
  };

  return (
    <>
      <div className="flex flex-row gap-2 flex-wrap mb-4">
        <Button variant="contained" startIcon={<Add />} onClick={() => setEditing('new')} data-testid="rb-new">{t('rb.new')}</Button>
      </div>
      <Grid testId="rb-list" empty={t('rb.empty')} rows={reports} cols={cols} />
      {editing && (
        <FormDialog
          title={editing === 'new' ? t('rb.new') : t('rb.edit')}
          intro={
            <>
              <p className="text-[13px] leading-[19px]">{t('rb.help')}</p>
              <pre className="text-xs leading-4 tracking-[0.3px] m-0 whitespace-pre-wrap">
                {`${t('rb.help.ops')}: ${OPS.join(', ')}\n${t('rb.help.example')}:\nstudent, class\nclass\nsum:amount, avg:paid, count\nstatus in paid, due\namount gte 5000\nsum_amount desc`}
              </pre>
            </>
          }
          fields={fields(editing === 'new' ? undefined : editing)}
          onSubmit={(v) => saveCustomReport(v, editing === 'new' ? undefined : editing.id)}
          onClose={close}
        />
      )}
      {scheduling && (
        <FormDialog
          title={t('rb.schedule')}
          intro={<p className="text-[13px] leading-[19px]">{t('rb.schedule.help')}</p>}
          fields={[
            { name: 'frequency', label: t('rb.f.frequency'), kind: 'select', required: true, init: scheduling.schedule?.frequency ?? 'weekly', options: ['daily', 'weekly', 'monthly'].map((f) => ({ value: f, label: t(`rb.freq.${f}` as MessageKey) })) },
            { name: 'recipients', label: t('rb.f.recipients'), kind: 'multiline', required: true, init: scheduling.schedule?.recipients.join('\n') },
          ]}
          onSubmit={(v) => scheduleCustomReport(scheduling.id, v)}
          onClose={close}
        />
      )}
      {result && (
        <InfoDialog title={result.title} onClose={() => setResult(null)}>
          {result.data.truncated && <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">{t('rb.truncated')}</span>}
          <ResultChart data={result.data} />
          <Grid testId="rb-result" empty={t('rb.noRows')} rows={result.data.rows} cols={resultCols(result.data)} />
        </InfoDialog>
      )}
      {toastNode}
    </>
  );
}

/** A bar for each of the first rows: the first column names the bar and the first numeric column sets its length. */
function ResultChart({ data }: { data: CustomResult }) {
  const { t, fmt } = useI18n();
  const chart = chartOf(data);
  if (!chart) return null;
  const max = Math.max(...chart.bars.map((b) => b.value), 1);
  return (
    <div className="mb-4" data-testid="rb-chart" role="figure" aria-label={t('rb.chart', { measure: chart.measure })}>
      <h6 className="text-sm leading-5 font-medium tracking-[0.1px] mb-2">
        {t('rb.chart', { measure: chart.measure })}
      </h6>
      {chart.bars.map((b, i) => (
        <div className="grid grid-cols-[minmax(80px,200px)_1fr_80px] items-center gap-3 mb-1" key={i}>
          <p className="text-[13px] leading-[19px] truncate" title={b.name}>
            {b.name}
          </p>
          <MiniBar value={(b.value / max) * 100} label={`${b.name}: ${b.value}`} />
          <p className="text-[13px] leading-[19px] text-right tabular-nums">
            {fmt.number(b.value)}
          </p>
        </div>
      ))}
    </div>
  );
}
