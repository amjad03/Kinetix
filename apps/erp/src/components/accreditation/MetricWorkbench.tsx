'use client';

import { Database, Download, ExternalLink, FileSpreadsheet, Paperclip, Plus, Save, Send, Trash2, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { addComment, addEvidence, assignTask, importTemplate, removeEvidence, saveMetric, updateTask, type MetricPatch } from '@/app/(dashboard)/accreditation/actions';
import { Button, Checkbox } from '@/components/kx';
import { FormDialog } from '@/components/ops/kit';
import { FileFormDialog } from '@/components/pathways-b/common';
import { Card, FormRow, SelectInput, StatusPill, TextInput, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { accDownload, fig, type MetricDetail, type People } from '@/lib/accreditation-ui';
import { cn } from '@/lib/utils';
import { Meter } from './charts';

const EVIDENCE_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'] as const;
const XLSX = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'] as const;
const TONE = { assigned: 'neutral', in_progress: 'info', submitted: 'warning', approved: 'success', returned: 'danger' } as const;
const words = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

/**
 * One metric end to end: its formula and filed value, the year-wise data grid (ERP figures with overrides), options or
 * the narrative, the data template rows with Excel import, the ERP records behind each figure, evidence by year, own
 * marking, assignment and review, comments and DVV clarifications.
 */
export function MetricWorkbench({ d, fw, me, people }: { d: MetricDetail; fw: string; me: { id: string; canManage: boolean }; people: People | null }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const m = d.metric;
  const years = m.years.filter((y) => y.required);
  const scored = d.framework.scoring !== 'none';
  const task = m.task;
  const isOwner = !!task && task.ownerId === me.id;
  const canEdit = me.canManage || isOwner;

  // Year grid: what the user typed, by year and input key ('value' is the figure for the year).
  const [grid, setGrid] = useState<Record<string, Record<string, string>>>({});
  const cell = (year: string, key: string) => grid[year]?.[key];
  const setCell = (year: string, key: string, v: string) => setGrid({ ...grid, [year]: { ...(grid[year] ?? {}), [key]: v } });
  const changed = Object.entries(grid).filter(([, v]) => Object.keys(v).length);

  const [options, setOptions] = useState<number[]>(m.options?.selected ?? []);
  const [narrative, setNarrative] = useState(m.narrative);
  const [self, setSelf] = useState(m.selfScore === null ? '' : String(m.selfScore));
  const [note, setNote] = useState(m.note);
  const [comment, setComment] = useState('');
  const [rowYear, setRowYear] = useState(years.at(-1)?.year ?? d.cycle);
  const [dialog, setDialog] = useState<null | 'evidence' | 'import' | 'row'>(null);
  const [assign, setAssign] = useState({ ownerId: task?.ownerId ?? '', departmentId: task?.departmentId ?? '', reviewerId: '', dueOn: task?.dueOn ?? '' });
  const [openRecords, setOpenRecords] = useState<string | null>(null);

  const done = (msg: string, res: { ok: boolean; error?: string }, after?: () => void) => {
    if (res.ok) {
      toast.success(msg);
      after?.();
      router.refresh();
    } else toast.error(res.error ?? '');
  };
  const save = (patch: MetricPatch, after?: () => void) => start(async () => done(t('acx.m.saved'), await saveMetric(fw, m.code, d.cycle, patch), after));
  const saveGrid = () =>
    start(async () => {
      for (const [year, v] of changed) {
        const inputs: Record<string, number | null> = {};
        let value: number | null | undefined;
        for (const [k, raw] of Object.entries(v)) {
          const n = raw.trim() === '' ? null : Number(raw.replace(/,/g, ''));
          if (n !== null && !Number.isFinite(n)) return toast.error(t('acx.m.badNumber', { year }));
          if (k === '__value') value = n;
          else inputs[k] = n;
        }
        const res = await saveMetric(fw, m.code, d.cycle, { year, ...(Object.keys(inputs).length ? { inputs } : {}), ...(value !== undefined ? { value } : {}) });
        if (!res.ok) return toast.error(res.error);
      }
      setGrid({});
      toast.success(t('acx.m.saved'));
      router.refresh();
    });

  const rowsByYear = useMemo(() => new Map(d.dataRows.map((r) => [r.year, r.rows])), [d.dataRows]);
  const currentRows = rowsByYear.get(rowYear) ?? [];
  const sourceTag = (s: string, records: number) =>
    s === 'auto' ? <span className="text-[11px] text-teal-ink">{t('acx.m.erp', { n: records })}</span> : s === 'rows' ? <span className="text-[11px] text-blue-ink">{t('acx.m.fromRows')}</span> : s === 'manual' ? <span className="text-[11px] text-amber-ink">{t('acx.m.entered')}</span> : <span className="text-[11px] text-muted-foreground">{t('acx.m.missing')}</span>;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]" data-testid="acx-workbench">
      <div className="flex min-w-0 flex-col gap-4">
        <Card title={`${m.code} ${m.title}`} subtitle={`${d.criterion}${d.indicator && d.indicator !== d.criterion ? ` · ${d.indicator}` : ''}`}>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={m.kind === 'QnM' ? 'info' : 'neutral'}>{m.kind === 'QnM' ? t('acx.c.qnm') : t('acx.c.qlm')}</StatusPill>
            {m.weight > 0 && <StatusPill>{t('acx.c.weight', { n: m.weight })}</StatusPill>}
            <StatusPill>{t(`acx.m.combine.${m.combine}` as MessageKey, { n: m.yearsRequired })}</StatusPill>
            {m.bench !== null && <StatusPill>{t(m.dir === 'low' ? 'acx.m.benchLow' : 'acx.m.bench', { value: fig(m.bench), unit: m.unit })}</StatusPill>}
          </div>
          <p className="mb-0 mt-3 rounded-lg bg-muted px-3 py-2 text-[13px]">
            <b>{t('acx.m.formula')}: </b>
            {m.formula}
          </p>
          <dl className="m-0 mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">{t('acx.m.value')}</dt>
              <dd className="m-0 text-xl font-semibold tabular-nums" data-testid="acx-value">
                {m.kind === 'QlM' ? (m.narrative ? t('acx.c.written') : t('acx.c.notWritten')) : m.options ? `${m.options.selected?.length ?? '-'} / ${m.options.labels.length}` : `${fig(m.value)} ${m.unit}`}
              </dd>
            </div>
            {scored && (
              <div>
                <dt className="text-xs text-muted-foreground">{t('acx.m.score')}</dt>
                <dd className="m-0 text-xl font-semibold tabular-nums">{m.score === null ? '-' : `${fig(m.score)} / ${fig(m.maxScore)}`}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-muted-foreground">{t('acx.m.completeness')}</dt>
              <dd className="m-0 pt-1.5">
                <Meter value={m.completeness} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t('acx.m.source')}</dt>
              <dd className="m-0 pt-1 text-[13px]">{t(`acx.src.${m.valueSource}` as MessageKey)}</dd>
            </div>
          </dl>
        </Card>

        {m.kind === 'QnM' && !m.options && (
          <Card
            title={t('acx.m.grid')}
            subtitle={t('acx.m.gridSub')}
            action={
              canEdit ? (
                <Button size="small" variant="contained" startIcon={<Save />} disabled={pending || !changed.length} onClick={saveGrid} data-testid="acx-grid-save">
                  {t('acx.m.saveGrid')}
                </Button>
              ) : undefined
            }
            padded={false}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-[13px]" data-testid="acx-grid">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">{t('acx.m.input')}</th>
                    {years.map((y) => (
                      <th key={y.year} className="px-3 py-2 text-right font-medium tabular-nums">
                        {y.year}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {m.inputs.map((inp) => (
                    <tr key={inp.key} className="border-b">
                      <th scope="row" className="px-4 py-2 text-left font-normal">
                        {inp.label}
                        {inp.auto && <Database className="ml-1 inline size-3 text-teal-ink" aria-label={t('acx.m.erpInput')} />}
                      </th>
                      {years.map((y) => {
                        const yi = y.inputs.find((x) => x.key === inp.key);
                        const typed = cell(y.year, inp.key);
                        const manual = yi?.source === 'manual' ? String(yi.value) : '';
                        return (
                          <td key={y.year} className="px-2 py-1.5 text-right align-top">
                            {canEdit ? (
                              <TextInput
                                className="w-[110px] [&_input]:text-right"
                                aria-label={`${inp.label} ${y.year}`}
                                inputMode="decimal"
                                placeholder={yi && yi.source !== 'manual' && yi.value !== null ? fig(yi.value) : '-'}
                                value={typed ?? manual}
                                onChange={(e) => setCell(y.year, inp.key, e.target.value)}
                              />
                            ) : (
                              <span className="tabular-nums">{fig(yi?.value)}</span>
                            )}
                            <span className="block">{yi ? sourceTag(yi.source, yi.records) : null}</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr className="border-b bg-muted/40">
                    <th scope="row" className="px-4 py-2 text-left font-semibold">
                      {t('acx.m.yearValue', { unit: m.unit })}
                    </th>
                    {years.map((y) => (
                      <td key={y.year} className="px-2 py-1.5 text-right align-top">
                        {canEdit ? (
                          <TextInput className="w-[110px] [&_input]:text-right [&_input]:font-semibold" aria-label={`${t('acx.m.value')} ${y.year}`} inputMode="decimal" placeholder={y.source === 'computed' ? fig(y.value) : '-'} value={cell(y.year, '__value') ?? (y.source === 'manual' ? String(y.value) : '')} onChange={(e) => setCell(y.year, '__value', e.target.value)} />
                        ) : (
                          <b className="tabular-nums">{fig(y.value)}</b>
                        )}
                        <span className={cn('block text-[11px]', y.hasData ? 'text-teal-ink' : 'text-muted-foreground')}>{y.source === 'manual' ? t('acx.m.entered') : y.hasData ? t('acx.m.computed') : t('acx.m.noData')}</span>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="m-0 px-4 py-2.5 text-xs text-muted-foreground">{t('acx.m.gridHint')}</p>
          </Card>
        )}

        {m.options && (
          <Card title={t('acx.m.options')} subtitle={t('acx.m.optionsSub')}>
            <ul className="m-0 grid list-none gap-1 p-0">
              {m.options.labels.map((label, i) => (
                <li key={label}>
                  <label className="flex items-start gap-2 text-[13px]">
                    <Checkbox checked={options.includes(i)} disabled={!canEdit} onChange={(e) => setOptions(e.target.checked ? [...options, i] : options.filter((x) => x !== i))} />
                    <span className="pt-0.5">{label}</span>
                  </label>
                </li>
              ))}
            </ul>
            {canEdit && (
              <FormRow labelled={false} className="mt-3">
                <Button variant="contained" size="small" startIcon={<Save />} disabled={pending} onClick={() => save({ options })} data-testid="acx-options-save">
                  {t('acx.m.saveOptions')}
                </Button>
                <span className="text-xs text-muted-foreground">{t('acx.c.ticked', { n: options.length, total: m.options.labels.length })}</span>
              </FormRow>
            )}
          </Card>
        )}

        {m.kind === 'QlM' && (
          <Card title={t('acx.m.narrative')} subtitle={t('acx.m.narrativeSub')}>
            {m.autoNarrative && (
              <div className="mb-3 rounded-lg bg-teal-soft/60 px-3 py-2 text-[13px]">
                <b className="block text-xs text-teal-ink">{t('acx.m.fromErpData')}</b>
                {m.autoNarrative}
                {canEdit && (
                  <Button size="small" variant="text" className="ml-1" onClick={() => setNarrative(narrative ? `${narrative}\n\n${m.autoNarrative}` : m.autoNarrative)}>
                    {t('acx.m.useIt')}
                  </Button>
                )}
              </div>
            )}
            <TextInput fullWidth multiline minRows={8} label={t('acx.m.narrative')} disabled={!canEdit} value={narrative} onChange={(e) => setNarrative(e.target.value)} helper={words(narrative) > 500 ? `${t('acx.m.words', { n: words(narrative) })} · ${t('acx.m.tooLong')}` : t('acx.m.words', { n: words(narrative) })} error={words(narrative) > 500} />
            {canEdit && (
              <FormRow labelled={false} className="mt-3">
                <Button variant="contained" size="small" startIcon={<Save />} disabled={pending || narrative === m.narrative} onClick={() => save({ textValue: narrative })} data-testid="acx-narrative-save">
                  {t('acx.m.saveNarrative')}
                </Button>
              </FormRow>
            )}
          </Card>
        )}

        {m.columns.length > 0 && !m.options && (
          <Card
            title={t('acx.m.template')}
            subtitle={t('acx.m.templateSub')}
            action={
              <span className="flex flex-wrap gap-2">
                <a href={accDownload(fw, `tmpl-${m.code}`, d.cycle)} className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-3 text-[13px] font-medium no-underline hover:bg-accent">
                  <FileSpreadsheet className="size-4" aria-hidden />
                  {t('acx.m.downloadTemplate')}
                </a>
                {canEdit && (
                  <Button size="small" variant="outlined" startIcon={<Upload />} onClick={() => setDialog('import')} data-testid="acx-import">
                    {t('acx.m.import')}
                  </Button>
                )}
              </span>
            }
            padded={false}
          >
            <FormRow labelled={false} className="items-end px-4 pb-3">
              {years.length > 1 && <SelectInput className="w-[160px]" aria-label={t('acx.m.year')} value={rowYear} onChange={(e) => setRowYear(e.target.value)} options={years.map((y) => ({ value: y.year, label: `${y.year} (${rowsByYear.get(y.year)?.length ?? 0})` }))} />}
              {canEdit && (
                <Button size="small" variant="outlined" startIcon={<Plus />} onClick={() => setDialog('row')}>
                  {t('acx.m.addRow')}
                </Button>
              )}
            </FormRow>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-[12.5px]">
                <thead>
                  <tr className="border-y bg-muted/50 text-left">
                    {m.columns.map((c) => (
                      <th key={c} className="px-3 py-2 align-bottom font-semibold">
                        {c}
                      </th>
                    ))}
                    {canEdit && <th className="w-10" />}
                  </tr>
                </thead>
                <tbody>
                  {currentRows.length === 0 ? (
                    <tr>
                      <td colSpan={m.columns.length + 1} className="px-3 py-4 text-center text-muted-foreground">
                        {t('acx.m.noRows', { year: rowYear })}
                      </td>
                    </tr>
                  ) : (
                    currentRows.map((r, i) => (
                      <tr key={i} className="border-b">
                        {m.columns.map((c, j) => (
                          <td key={c} className="px-3 py-1.5 align-top">
                            {r[j] ?? ''}
                          </td>
                        ))}
                        {canEdit && (
                          <td className="px-1 align-top">
                            <Button size="small" variant="text" color="error" aria-label={t('acx.m.removeRow')} disabled={pending} onClick={() => save({ year: rowYear, rows: currentRows.filter((_, k) => k !== i) })}>
                              <Trash2 className="size-4" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {d.records.length > 0 && (
          <Card title={t('acx.m.records')} subtitle={t('acx.m.recordsSub')} padded={false} testId="acx-records">
            <ul className="m-0 list-none p-0">
              {d.records.map((r) => {
                const id = `${r.year}-${r.input}-${r.label}`;
                const open = openRecords === id;
                return (
                  <li key={id} className="border-t">
                    <button type="button" aria-expanded={open} onClick={() => setOpenRecords(open ? null : id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] hover:bg-accent/50">
                      <span className="w-16 shrink-0 font-semibold tabular-nums">{r.year}</span>
                      <span className="min-w-0 flex-1 truncate">{r.label}</span>
                      <StatusPill tone={r.total ? 'success' : 'neutral'}>{t('acx.m.recordsN', { n: r.total })}</StatusPill>
                    </button>
                    {open && (
                      <div className="overflow-x-auto px-4 pb-3">
                        {r.rows.length === 0 ? (
                          <p className="m-0 text-xs text-muted-foreground">{t('acx.m.noRecords')}</p>
                        ) : (
                          <table className="w-full border-collapse text-[12px]">
                            <thead>
                              <tr className="border-b text-left text-muted-foreground">
                                {r.columns.map((c) => (
                                  <th key={c} className="px-2 py-1 font-medium">
                                    {c}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {r.rows.slice(0, 100).map((row, i) => (
                                <tr key={i} className="border-b last:border-b-0">
                                  {row.map((v, j) => (
                                    <td key={j} className="px-2 py-1">
                                      {v ?? ''}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        {r.total > 100 && <p className="m-0 mt-1 text-xs text-muted-foreground">{t('acx.m.showing', { n: 100, total: r.total })}</p>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        <Card
          title={t('acx.m.evidence')}
          subtitle={m.evidenceRequired.length ? t('acx.m.evidenceSub', { docs: m.evidenceRequired.join('; ') }) : undefined}
          action={
            canEdit ? (
              <Button size="small" variant="outlined" startIcon={<Paperclip />} onClick={() => setDialog('evidence')} data-testid="acx-evidence-add">
                {t('acx.m.addEvidence')}
              </Button>
            ) : undefined
          }
          padded={false}
        >
          {d.evidence.length === 0 ? (
            <p className="m-0 px-[18px] pb-4 text-[13px] text-muted-foreground">{t('acx.m.noEvidence')}</p>
          ) : (
            <ul className="m-0 mt-2 list-none p-0">
              {d.evidence.map((e) => (
                <li key={e.id} className="flex items-center gap-3 border-t px-[18px] py-2.5 text-[13px]">
                  <span className="w-16 shrink-0 tabular-nums text-muted-foreground">{e.year}</span>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate">{e.title}</b>
                    <span className="block truncate text-xs text-muted-foreground">{[e.fileName, e.note].filter(Boolean).join(' · ') || e.url}</span>
                    {(e.tags?.length || e.validUntil) && (
                      <span className="mt-0.5 flex flex-wrap gap-1 text-xs">
                        {e.tags?.map((tag) => (
                          <span key={tag} className="rounded-full bg-slate-soft px-2 text-slate-ink">
                            {tag}
                          </span>
                        ))}
                        {e.validUntil && <span className={e.validUntil < new Date().toISOString().slice(0, 10) ? 'text-red-ink' : 'text-muted-foreground'}>{t('acx2.ev.valid', { date: fmt.date(e.validUntil, 'short') })}</span>}
                      </span>
                    )}
                  </span>
                  {e.fileName && (
                    <a href={accDownload(fw, `file-${e.id}`)} className="inline-flex h-8 items-center gap-1 rounded-md border bg-card px-2.5 text-[12.5px] no-underline hover:bg-accent" aria-label={`${t('acx.m.download')} ${e.title}`}>
                      <Download className="size-3.5" aria-hidden />
                      {t('acx.m.download')}
                    </a>
                  )}
                  {e.url && (
                    <a href={e.url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-md border bg-card px-2.5 text-[12.5px] no-underline hover:bg-accent">
                      <ExternalLink className="size-3.5" aria-hidden />
                      {t('acx.m.open')}
                    </a>
                  )}
                  {me.canManage && (
                    <Button size="small" variant="text" color="error" aria-label={`${t('acx.m.remove')} ${e.title}`} disabled={pending} onClick={() => start(async () => done(t('acx.m.removed'), await removeEvidence(fw, m.code, e.id)))}>
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <aside className="flex min-w-0 flex-col gap-4">
        <Card title={t('acx.m.assignment')} testId="acx-assignment">
          {task ? (
            <div className="grid gap-1.5 text-[13px]">
              <span>
                <StatusPill tone={TONE[task.status]}>{t(`acx.ts.${task.status}` as MessageKey)}</StatusPill>
                {task.scope !== m.code && <span className="ml-2 text-xs text-muted-foreground">{t('acx.m.viaCriterion', { id: task.scope })}</span>}
              </span>
              <span>{[task.ownerName, task.departmentName].filter(Boolean).join(' · ') || '-'}</span>
              {task.dueOn && <span className="text-muted-foreground">{t('acx.r.due', { date: fmt.date(task.dueOn) })}</span>}
              <FormRow labelled={false} className="mt-1 gap-2">
                {isOwner && (task.status === 'assigned' || task.status === 'returned') && (
                  <Button size="small" variant="outlined" disabled={pending} onClick={() => start(async () => done(t('acx.m.saved'), await updateTask(fw, task.id, { status: 'in_progress' }, `/accreditation/${fw}/metrics/${m.code}`)))}>
                    {t('acx.m.start')}
                  </Button>
                )}
                {isOwner && task.status !== 'submitted' && task.status !== 'approved' && (
                  <Button size="small" variant="contained" startIcon={<Send />} disabled={pending} onClick={() => start(async () => done(t('acx.m.submitted'), await updateTask(fw, task.id, { status: 'submitted' }, `/accreditation/${fw}/metrics/${m.code}`)))} data-testid="acx-submit">
                    {t('acx.m.submit')}
                  </Button>
                )}
                {me.canManage && task.status === 'submitted' && (
                  <>
                    <Button size="small" variant="contained" disabled={pending} onClick={() => start(async () => done(t('acx.t.approved'), await updateTask(fw, task.id, { status: 'approved' }, `/accreditation/${fw}/metrics/${m.code}`)))}>
                      {t('acx.t.approve')}
                    </Button>
                    <Button size="small" variant="outlined" disabled={pending} onClick={() => start(async () => done(t('acx.t.returnedDone'), await updateTask(fw, task.id, { status: 'returned' }, `/accreditation/${fw}/metrics/${m.code}`)))}>
                      {t('acx.t.return')}
                    </Button>
                  </>
                )}
              </FormRow>
            </div>
          ) : (
            <p className="m-0 text-[13px] text-muted-foreground">{t('acx.c.unassigned')}</p>
          )}
          {me.canManage && people && (
            <form
              className="mt-3 grid gap-2 border-t pt-3"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => done(t('acx.t.assigned'), await assignTask(fw, d.cycle, { scope: m.code, ...assign }, `/accreditation/${fw}/metrics/${m.code}`)));
              }}
            >
              <SelectInput label={t('acx.t.owner')} value={assign.ownerId} onChange={(e) => setAssign({ ...assign, ownerId: e.target.value })} options={people.staff.map((s) => ({ value: s.id, label: s.name }))} empty={t('acx.t.none')} />
              <SelectInput label={t('acx.t.department')} value={assign.departmentId} onChange={(e) => setAssign({ ...assign, departmentId: e.target.value })} options={people.departments.map((x) => ({ value: x.id, label: x.name }))} empty={t('acx.t.none')} />
              <SelectInput label={t('acx.t.reviewer')} value={assign.reviewerId} onChange={(e) => setAssign({ ...assign, reviewerId: e.target.value })} options={people.staff.map((s) => ({ value: s.id, label: s.name }))} empty={t('acx.t.none')} />
              <TextInput type="date" label={t('acx.t.due')} value={assign.dueOn} onChange={(e) => setAssign({ ...assign, dueOn: e.target.value })} />
              <Button type="submit" variant="outlined" disabled={pending || (!assign.ownerId && !assign.departmentId)}>
                {task ? t('acx.m.reassign') : t('acx.t.assignBtn')}
              </Button>
            </form>
          )}
        </Card>

        {scored && canEdit && (
          <Card title={t('acx.m.marking')} subtitle={t(d.framework.scoring === 'naac' ? 'acx.m.markingNaac' : 'acx.m.markingMarks', { max: fig(m.maxScore) })}>
            <form
              className="grid gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const n = self.trim() === '' ? null : Number(self);
                if (n !== null && (!Number.isFinite(n) || n < 0 || n > m.maxScore)) return toast.error(t('acx.m.badMarking', { max: fig(m.maxScore) }));
                save({ selfScore: n, note });
              }}
            >
              <TextInput label={t('acx.m.ownMarking')} inputMode="decimal" value={self} onChange={(e) => setSelf(e.target.value)} helper={t('acx.m.ownMarkingHint')} />
              <TextInput label={t('acx.m.note')} multiline minRows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              <Button type="submit" variant="outlined" disabled={pending}>
                {t('acx.m.saveMarking')}
              </Button>
            </form>
          </Card>
        )}

        <Card title={t('acx.m.comments')} padded={false} testId="acx-comments">
          <ul className="m-0 mt-2 list-none p-0">
            {d.comments.map((c) => (
              <li key={c.id} className="border-t px-[18px] py-2.5 text-[13px]">
                <span className="block text-xs text-muted-foreground">
                  {c.author ?? '-'} · {fmt.dateTime(c.createdAt)}
                </span>
                <span className="whitespace-pre-wrap">{c.body}</span>
              </li>
            ))}
            {d.comments.length === 0 && <li className="px-[18px] pb-2 text-[13px] text-muted-foreground">{t('acx.m.noComments')}</li>}
          </ul>
          <form
            className="grid gap-2 border-t px-[18px] py-3"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => done(t('acx.m.commented'), await addComment(fw, m.code, d.cycle, comment.trim()), () => setComment('')));
            }}
          >
            <TextInput aria-label={t('acx.m.comment')} placeholder={t('acx.m.comment')} multiline minRows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
            <Button type="submit" size="small" variant="outlined" disabled={pending || !comment.trim()}>
              {t('acx.m.post')}
            </Button>
          </form>
        </Card>

        <Card title={t('acx.m.dvv')} padded={false}>
          {d.dvv.length === 0 ? (
            <p className="m-0 px-[18px] pb-4 text-[13px] text-muted-foreground">{t('acx.m.noDvv')}</p>
          ) : (
            <ul className="m-0 mt-2 list-none p-0">
              {d.dvv.map((q) => (
                <li key={q.id} className="border-t px-[18px] py-2.5 text-[13px]">
                  <StatusPill tone={q.status === 'open' || q.status === 'rejected' ? 'warning' : q.status === 'accepted' ? 'success' : 'info'}>{t(`acx.ds.${q.status}` as MessageKey)}</StatusPill>
                  <span className="mt-1 block">{q.query}</span>
                  {q.response && <span className="mt-1 block text-xs text-muted-foreground">{q.response}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </aside>

      {dialog === 'evidence' && (
        <FileFormDialog
          title={t('acx.m.addEvidence')}
          allowed={EVIDENCE_TYPES}
          submitLabel={t('acx.m.upload')}
          intro={m.evidenceRequired.length ? <p className="m-0 text-[13px] text-muted-foreground">{t('acx.m.evidenceSub', { docs: m.evidenceRequired.join('; ') })}</p> : undefined}
          fields={[
            { name: 'title', label: t('acx.m.docTitle'), required: true },
            ...(years.length > 1 ? [{ name: 'year', label: t('acx.m.year'), kind: 'select' as const, required: true, init: years.at(-1)!.year, options: years.map((y) => ({ value: y.year, label: y.year })) }] : []),
            { name: 'url', label: t('acx.m.link') },
            { name: 'note', label: t('acx.m.note') },
            { name: 'tags', label: t('acx2.ev.tags') },
            { name: 'validUntil', label: t('acx2.ev.validUntil'), kind: 'date' as const },
          ]}
          onSubmit={(v, file) => addEvidence(fw, m.code, d.cycle, v, file)}
          onClose={(msg) => {
            setDialog(null);
            if (msg) router.refresh();
          }}
        />
      )}
      {dialog === 'import' && (
        <FileFormDialog
          title={t('acx.m.import')}
          allowed={XLSX}
          required
          submitLabel={t('acx.m.importBtn')}
          intro={<p className="m-0 text-[13px] text-muted-foreground">{t('acx.m.importHint')}</p>}
          fields={years.length > 1 ? [] : [{ name: 'year', label: t('acx.m.year'), kind: 'select', init: years.at(-1)?.year ?? d.cycle, options: years.map((y) => ({ value: y.year, label: y.year })) }]}
          onSubmit={(v, file) => importTemplate(fw, m.code, d.cycle, v, file)}
          onClose={(msg) => {
            setDialog(null);
            if (msg) router.refresh();
          }}
        />
      )}
      {dialog === 'row' && (
        <FormDialog
          title={t('acx.m.addRowTitle', { year: rowYear })}
          fields={m.columns.map((c, i) => ({ name: `c${i}`, label: c, kind: c.length > 60 ? 'multiline' : 'text', init: /^(academic )?year$/i.test(c.trim()) ? rowYear : '' }))}
          submitLabel={t('acx.m.addRow')}
          onSubmit={(v) => saveMetric(fw, m.code, d.cycle, { year: rowYear, rows: [...currentRows, m.columns.map((_, i) => v[`c${i}`] ?? '')] })}
          onClose={(msg) => {
            setDialog(null);
            if (msg) router.refresh();
          }}
        />
      )}
    </div>
  );
}
