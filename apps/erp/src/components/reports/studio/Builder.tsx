'use client';

import { CalendarClock, Database, Pencil, Play, Plus, Save, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { previewReport, saveReport } from '@/app/(dashboard)/reports/studio-actions';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import { Switch } from '@/components/shadcn/switch';
import { EmptyState } from '@/components/States';
import { Card } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import {
  aggKey,
  BUCKETS,
  CHART_TYPES,
  emptyDefinition,
  isNumeric,
  moveItem,
  ready,
  TONES,
  type AggFn,
  type Catalogue,
  type ChartType,
  type DatasetMeta,
  type Definition,
  type FormatRule,
  type ReportDoc,
  type StudioResult,
} from '@/lib/report-studio';
import { ChipList, DropZone, FieldList, FormulaDialog, Section, type FieldAction } from './builder-parts';
import { Labelled, Pick, Toolbar, tk } from './controls';
import { SaveDialog, ScheduleDialog } from './Dialogs';
import { ExportMenu } from './ExportMenu';
import { FilterEditor } from './FilterEditor';
import { ResultView } from './ResultView';

const AGG_NEEDS_FIELD: AggFn[] = ['count_distinct', 'sum', 'avg', 'min', 'max', 'pct_true', 'measure'];

/**
 * The report builder: pick the data, drag fields into columns, groups and filters, add totals,
 * formulas and conditions, choose a chart and highlights, and see the result as you go.
 */
export function Builder({ catalogue, doc, folders, startDataset }: { catalogue: Catalogue; doc: ReportDoc | null; folders: string[]; startDataset?: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const fromLibrary = doc?.ref.startsWith('lib:') ? doc.ref.slice(4) : undefined;
  const savedId = doc?.ref.startsWith('custom:') && doc.canEdit ? doc.ref.slice(7) : undefined;
  const [datasetKey, setDatasetKey] = useState(doc?.dataset ?? (startDataset && catalogue.datasets.some((d) => d.key === startDataset) ? startDataset : ''));
  const [def, setDef] = useState<Definition>(doc?.definition ?? emptyDefinition());
  const [meta, setMeta] = useState({ name: doc?.title ?? '', description: doc?.description ?? '', folder: doc?.folder ?? '', sharedRoles: doc?.sharedRoles ?? [] });
  const [result, setResult] = useState<StudioResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [running, start] = useTransition();
  const [dialog, setDialog] = useState<'save' | 'saveAs' | 'schedule' | { formula: number | 'new' } | null>(null);
  const dataset: DatasetMeta | undefined = catalogue.datasets.find((d) => d.key === datasetKey);
  const runSeq = useRef(0);

  const update = (fn: (d: Definition) => Definition) => {
    setDef((d) => fn(d));
    setDirty(true);
  };
  const summary = def.groupBy.length > 0 || def.aggregates.length > 0 || !!def.pivot;
  const prepared = useMemo(() => ready(def), [def]);
  const key = JSON.stringify([datasetKey, prepared]);

  const run = () => {
    if (!dataset) return;
    const seq = ++runSeq.current;
    start(async () => {
      const res = await previewReport(dataset.key, prepared);
      if (seq !== runSeq.current) return;
      if (res.ok) {
        setResult(res.data);
        setError(null);
      } else setError(res.error);
    });
  };
  useEffect(() => {
    if (!auto || !dataset) return;
    const timer = setTimeout(run, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, auto]);

  const fieldOf = (k: string) => dataset?.fields.find((f) => f.key === k);
  const labelOf = (k: string) => fieldOf(k)?.label ?? def.calculated.find((c) => c.key === k)?.label ?? k;
  const outputs = useMemo(() => {
    if (result) return result.columns.map((c) => ({ value: c.measure && c.pivotValue === undefined && c.key.endsWith('__total') ? c.measure : c.key, label: c.label, numeric: isNumeric(c.type), dim: c.dim })).filter((o, i, a) => a.findIndex((x) => x.value === o.value) === i);
    return [];
  }, [result]);
  const measureOutputs = outputs.filter((o) => !o.dim && o.numeric);

  const onField = (k: string, a: FieldAction) => {
    const f = fieldOf(k);
    if (a.kind === 'column') update((d) => ({ ...d, columns: d.columns.includes(k) ? d.columns : [...d.columns, k] }));
    if (a.kind === 'group') update((d) => ({ ...d, groupBy: d.groupBy.some((g) => g.split(':')[0] === k) ? d.groupBy : [...d.groupBy, f?.type === 'date' ? `${k}:month` : k].slice(0, 5) }));
    if (a.kind === 'pivot') update((d) => ({ ...d, pivot: { column: f?.type === 'date' ? `${k}:month` : k }, aggregates: d.aggregates.length ? d.aggregates : [{ fn: 'count' }] }));
    if (a.kind === 'filter') update((d) => ({ ...d, filters: [...d.filters, f ? { field: k, op: f.type === 'date' ? 'relative' : f.type === 'bool' ? 'is_true' : isNumeric(f.type) ? 'gte' : f.picker ? 'in' : 'contains', ...(f.type === 'date' ? { value: 'this_month' } : {}) } : { field: k, op: 'contains' }] }));
    if (a.kind === 'agg') update((d) => ({ ...d, aggregates: [...d.aggregates, a.fn === 'count' ? { fn: 'count' as const } : { fn: a.fn, field: k }].filter((x, i, arr) => arr.findIndex((y) => aggKey(y) === aggKey(x)) === i) }));
  };
  /** A dropped or clicked field: a number becomes a total when summarising, anything else a column or group. */
  const smartAdd = (zone: 'columns' | 'group' | 'filters' | 'totals' | 'pivot', k: string) => {
    const f = fieldOf(k);
    if (zone === 'columns') return onField(k, { kind: 'column' });
    if (zone === 'group') return onField(k, { kind: 'group' });
    if (zone === 'pivot') return onField(k, { kind: 'pivot' });
    if (zone === 'filters') return onField(k, { kind: 'filter' });
    const fn: AggFn = !f ? 'count' : f.type === 'bool' ? 'pct_true' : isNumeric(f.type) ? (f.aggregatable ? 'sum' : 'avg') : 'count_distinct';
    onField(k, { kind: 'agg', fn });
  };

  const changeDataset = (k: string) => {
    if (k === datasetKey) return;
    setDatasetKey(k);
    setDef(emptyDefinition());
    setResult(null);
    setError(null);
    setDirty(true);
  };

  const source = dataset ? { dataset: dataset.key, definition: prepared, title: meta.name || dataset.label } : null;
  const save = (asNew: boolean) => async (v: { name: string; description: string; folder: string; sharedRoles: string[] }) => {
    const res = await saveReport({ ...v, dataset: datasetKey, definition: prepared, ...(fromLibrary ? { sourceLibraryKey: fromLibrary } : {}) }, asNew ? undefined : savedId);
    if (res.ok) {
      setMeta(v);
      setDirty(false);
      if (asNew || !savedId) router.replace(`/reports/builder?id=${res.data.id}`);
    }
    return res;
  };

  return (
    <div className="grid gap-4" data-testid="rs-builder">
      <Toolbar label={t('rs.builder.title')}>
        <Labelled label={t('rs.b.dataset')} className="w-[260px] max-sm:w-full">
          <Pick label={t('rs.b.dataset')} placeholder={t('rs.b.pickDataset')} value={datasetKey} onChange={changeDataset} options={catalogue.datasets.map((d) => ({ value: d.key, label: d.label, group: tk(t, `rs.dcat.${d.category}`) }))} testId="rs-dataset" />
        </Labelled>
        <div className="flex h-9 items-center gap-2 text-sm">
          <Switch id="rs-live" checked={auto} onCheckedChange={setAuto} />
          <label htmlFor="rs-live">{t('rs.p.auto')}</label>
        </div>
        <Button variant="outline" onClick={run} disabled={!dataset || running} data-testid="rs-run">
          <Play />
          {running ? t('rs.p.loading') : t('rs.p.run')}
        </Button>
        <div className="flex-1" />
        {dirty && <span className="self-center text-xs text-amber-ink">{t('rs.b.unsaved')}</span>}
        <ExportMenu source={source} disabled={!dataset} />
        <Button variant="outline" onClick={() => setDialog('schedule')} disabled={!savedId} title={savedId ? undefined : t('rs.s.saveFirst')}>
          <CalendarClock />
          {t('rs.v.schedule')}
        </Button>
        {savedId && (
          <Button variant="outline" onClick={() => setDialog('saveAs')} disabled={!dataset}>
            {t('rs.b.saveAs')}
          </Button>
        )}
        <Button onClick={() => setDialog('save')} disabled={!dataset} data-testid="rs-save">
          <Save />
          {t('rs.save.save')}
        </Button>
      </Toolbar>
      {fromLibrary && <p className="text-xs text-muted-foreground">{t('rs.b.fromLibrary', { title: doc?.title ?? '' })}</p>}

      {!dataset ? (
        <Card>
          <EmptyState icon={<Database />} title={t('rs.p.pick')}>
            {t('rs.p.pickHelp')}
          </EmptyState>
          <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-3">
            {catalogue.datasets.map((d) => (
              <button key={d.key} type="button" onClick={() => changeDataset(d.key)} className="rounded-lg border bg-card p-3 text-left hover:border-primary hover:bg-muted/40" data-testid={`rs-pick-${d.key}`}>
                <div className="text-sm font-semibold">{d.label}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{d.description}</div>
              </button>
            ))}
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[220px_420px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-[160px] lg:max-h-[calc(100vh-180px)] lg:overflow-y-auto" aria-label={t('rs.b.fields')}>
            <FieldList dataset={dataset} calculated={def.calculated} onAction={onField} />
          </aside>

          <div className="grid content-start gap-3">
            <Section title={t('rs.b.filters')} hint={t('rs.b.filtersHint')} count={def.filters.length} testId="rs-sec-filters">
              <DropZone onField={(k) => smartAdd('filters', k)}>
                <div className="grid gap-2">
                  {def.filters.length === 0 && <p className="px-1 py-1.5 text-xs text-muted-foreground">{t('rs.b.dropHere')}</p>}
                  {def.filters.map((f, i) => (
                    <FilterEditor key={i} dataset={dataset} filter={f} relative={catalogue.relative} onChange={(nf) => update((d) => ({ ...d, filters: d.filters.map((x, j) => (j === i ? nf : x)) }))} onRemove={() => update((d) => ({ ...d, filters: d.filters.filter((_, j) => j !== i) }))} />
                  ))}
                </div>
              </DropZone>
            </Section>

            <Section title={t('rs.b.summarise')} hint={t('rs.b.summariseHint')} count={def.aggregates.length + def.groupBy.length} testId="rs-sec-summary">
              <h4 className="text-xs font-semibold text-muted-foreground">{t('rs.b.aggregates')}</h4>
              <DropZone onField={(k) => smartAdd('totals', k)} testId="rs-drop-totals">
                <div className="grid gap-2">
                  {def.aggregates.length === 0 && <p className="px-1 py-1.5 text-xs text-muted-foreground">{t('rs.b.dropTotals')}</p>}
                  {def.aggregates.map((a, i) => {
                    const fieldOptions =
                      a.fn === 'measure'
                        ? def.calculated.filter((c) => c.kind === 'measure').map((c) => ({ value: c.key, label: c.label }))
                        : dataset.fields.filter((f) => (a.fn === 'sum' || a.fn === 'pct' ? isNumeric(f.type) && f.aggregatable : a.fn === 'avg' ? isNumeric(f.type) : a.fn === 'pct_true' ? f.type === 'bool' : a.fn === 'min' || a.fn === 'max' ? f.type !== 'bool' : true)).map((f) => ({ value: f.key, label: f.label }));
                    const set = (patch: Partial<typeof a>) => update((d) => ({ ...d, aggregates: d.aggregates.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
                    return (
                      <div key={i} className="flex flex-wrap items-end gap-2" data-testid="rs-agg">
                        <Pick label={t('rs.b.aggFn')} value={a.fn} onChange={(fn) => set({ fn: fn as AggFn, field: AGG_NEEDS_FIELD.includes(fn as AggFn) || fn === 'pct' ? a.field : undefined })} options={catalogue.aggregates.map((fn) => ({ value: fn, label: tk(t, `rs.agg.${fn}`) }))} className="w-[104px] min-w-0" />
                        {(AGG_NEEDS_FIELD.includes(a.fn) || a.fn === 'pct') && <Pick label={t('rs.f.field')} value={a.field ?? ''} onChange={(field) => set({ field })} options={fieldOptions} className="w-[140px]" />}
                        <Input aria-label={t('rs.b.aggLabel')} placeholder={t('rs.b.aggLabel')} className="h-9 w-[84px] bg-card" value={a.label ?? ''} maxLength={60} onChange={(e) => set({ label: e.target.value || undefined })} />
                        <Button size="icon" variant="ghost" aria-label={t('rs.b.remove')} onClick={() => update((d) => ({ ...d, aggregates: d.aggregates.filter((_, j) => j !== i) }))}>
                          <X />
                        </Button>
                      </div>
                    );
                  })}
                  <Button size="sm" variant="ghost" className="justify-self-start" onClick={() => update((d) => ({ ...d, aggregates: [...d.aggregates, { fn: 'count' }] }))}>
                    <Plus />
                    {t('rs.b.addTotal')}
                  </Button>
                </div>
              </DropZone>
              <h4 className="mt-2 text-xs font-semibold text-muted-foreground">{t('rs.b.groupBy')}</h4>
              <DropZone onField={(k) => smartAdd('group', k)} testId="rs-drop-group">
                <ChipList
                  label={t('rs.b.groupBy')}
                  empty={t('rs.b.dropGroup')}
                  items={def.groupBy.map((g) => ({ key: g, label: labelOf(g.split(':')[0]), type: fieldOf(g.split(':')[0])?.type }))}
                  onMove={(a, b) => update((d) => ({ ...d, groupBy: moveItem(d.groupBy, a, b) }))}
                  onRemove={(i) => update((d) => ({ ...d, groupBy: d.groupBy.filter((_, j) => j !== i) }))}
                  extra={(i) => {
                    const [k, b] = def.groupBy[i].split(':');
                    if (fieldOf(k)?.type !== 'date') return null;
                    return (
                      <select aria-label={t('rs.b.bucket')} className="h-6 rounded border bg-card text-xs" value={b ?? ''} onChange={(e) => update((d) => ({ ...d, groupBy: d.groupBy.map((x, j) => (j === i ? (e.target.value ? `${k}:${e.target.value}` : k) : x)) }))}>
                        <option value="">{t('rs.bucket.value')}</option>
                        {BUCKETS.map((x) => (
                          <option key={x} value={x}>
                            {tk(t, `rs.bucket.${x}`)}
                          </option>
                        ))}
                      </select>
                    );
                  }}
                />
              </DropZone>
              <h4 className="mt-2 text-xs font-semibold text-muted-foreground">{t('rs.b.pivot')}</h4>
              <p className="text-xs text-muted-foreground">{t('rs.b.pivotHint')}</p>
              <DropZone onField={(k) => smartAdd('pivot', k)} testId="rs-drop-pivot">
                <div className="flex flex-wrap items-end gap-2">
                  <Pick
                    label={t('rs.b.pivot')}
                    value={def.pivot?.column.split(':')[0] ?? '_none'}
                    onChange={(k) => update((d) => (k === '_none' ? { ...d, pivot: undefined } : { ...d, pivot: { column: fieldOf(k)?.type === 'date' ? `${k}:month` : k }, aggregates: d.aggregates.length ? d.aggregates : [{ fn: 'count' }] }))}
                    options={[{ value: '_none', label: t('rs.b.none') }, ...dataset.fields.filter((f) => !isNumeric(f.type)).map((f) => ({ value: f.key, label: f.label }))]}
                    className="w-[200px]"
                  />
                  {def.pivot && fieldOf(def.pivot.column.split(':')[0])?.type === 'date' && (
                    <Pick label={t('rs.b.bucket')} value={def.pivot.column.split(':')[1] ?? 'month'} onChange={(b) => update((d) => ({ ...d, pivot: { column: `${d.pivot!.column.split(':')[0]}:${b}` } }))} options={BUCKETS.map((x) => ({ value: x, label: tk(t, `rs.bucket.${x}`) }))} className="w-[130px]" />
                  )}
                </div>
              </DropZone>
              {summary && (
                <>
                  <h4 className="mt-2 text-xs font-semibold text-muted-foreground">{t('rs.b.having')}</h4>
                  {def.having.map((h, i) => {
                    const set = (patch: Partial<typeof h>) => update((d) => ({ ...d, having: d.having.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
                    const vals = Array.isArray(h.value) ? h.value : [h.value, h.value];
                    return (
                      <div key={i} className="flex flex-wrap items-end gap-2">
                        <Pick label={t('rs.fmt.column')} value={h.field} onChange={(field) => set({ field })} options={measureOutputs.map((o) => ({ value: o.value, label: o.label }))} className="w-[160px]" />
                        <Pick label={t('rs.f.condition')} value={h.op} onChange={(op) => set({ op: op as typeof h.op, value: op === 'between' ? [vals[0], vals[1]] : vals[0] })} options={(['gte', 'lte', 'gt', 'lt', 'eq', 'neq', 'between'] as const).map((o) => ({ value: o, label: tk(t, `rs.op.${o}`) }))} className="w-[130px]" />
                        <Input type="number" aria-label={t('rs.v.value')} className="h-9 w-[90px] bg-card" value={Number.isFinite(vals[0]) ? vals[0] : ''} onChange={(e) => set({ value: h.op === 'between' ? [Number(e.target.value), vals[1]] : Number(e.target.value) })} />
                        {h.op === 'between' && <Input type="number" aria-label={t('rs.v.to')} className="h-9 w-[90px] bg-card" value={Number.isFinite(vals[1]) ? vals[1] : ''} onChange={(e) => set({ value: [vals[0], Number(e.target.value)] })} />}
                        <Button size="icon" variant="ghost" aria-label={t('rs.b.remove')} onClick={() => update((d) => ({ ...d, having: d.having.filter((_, j) => j !== i) }))}>
                          <X />
                        </Button>
                      </div>
                    );
                  })}
                  <Button size="sm" variant="ghost" className="justify-self-start" disabled={measureOutputs.length === 0} onClick={() => update((d) => ({ ...d, having: [...d.having, { field: measureOutputs[0]?.value ?? '', op: 'gte', value: NaN }] }))}>
                    <Plus />
                    {t('rs.b.addCondition')}
                  </Button>
                </>
              )}
            </Section>

            <Section title={t('rs.b.columns')} hint={summary ? t('rs.b.columnsIgnored') : t('rs.b.columnsHint')} count={def.columns.length} open={!summary} testId="rs-sec-columns">
              <DropZone onField={(k) => smartAdd('columns', k)} testId="rs-drop-columns">
                <ChipList
                  label={t('rs.b.columns')}
                  empty={t('rs.b.columnsDefault')}
                  items={def.columns.map((c) => ({ key: c, label: labelOf(c), type: fieldOf(c)?.type }))}
                  onMove={(a, b) => update((d) => ({ ...d, columns: moveItem(d.columns, a, b) }))}
                  onRemove={(i) => update((d) => ({ ...d, columns: d.columns.filter((_, j) => j !== i) }))}
                />
              </DropZone>
            </Section>

            <Section title={t('rs.b.calc')} hint={t('rs.b.calcHint')} count={def.calculated.length} open={def.calculated.length > 0} testId="rs-sec-calc">
              {def.calculated.map((c, i) => (
                <div key={c.key} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{c.label}</span>
                    <code className="ml-2 truncate text-xs text-muted-foreground">{c.expr}</code>
                  </span>
                  <Button size="icon-sm" variant="ghost" aria-label={t('rs.act.edit')} onClick={() => setDialog({ formula: i })}>
                    <Pencil />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label={t('rs.b.remove')} onClick={() => update((d) => ({ ...d, calculated: d.calculated.filter((_, j) => j !== i), columns: d.columns.filter((x) => x !== c.key), aggregates: d.aggregates.filter((a) => a.field !== c.key) }))}>
                    <X />
                  </Button>
                </div>
              ))}
              <Button size="sm" variant="ghost" className="justify-self-start" onClick={() => setDialog({ formula: 'new' })} data-testid="rs-add-formula" disabled={def.calculated.length >= 10}>
                <Plus />
                {t('rs.b.addFormula')}
              </Button>
            </Section>

            <Section title={t('rs.b.sortLimit')} count={def.sort.length} open={false} testId="rs-sec-sort">
              {def.sort.map((s, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2">
                  <Pick label={t('rs.b.sort')} value={s.field} onChange={(field) => update((d) => ({ ...d, sort: d.sort.map((x, j) => (j === i ? { ...x, field } : x)) }))} options={(outputs.length ? outputs : dataset.fields.map((f) => ({ value: f.key, label: f.label }))).map((o) => ({ value: o.value, label: o.label }))} className="w-[180px]" />
                  <Pick label={t('rs.b.direction')} value={s.dir} onChange={(dir) => update((d) => ({ ...d, sort: d.sort.map((x, j) => (j === i ? { ...x, dir: dir as 'asc' | 'desc' } : x)) }))} options={[{ value: 'asc', label: t('rs.b.asc') }, { value: 'desc', label: t('rs.b.desc') }]} className="w-[140px]" />
                  <Button size="icon" variant="ghost" aria-label={t('rs.b.remove')} onClick={() => update((d) => ({ ...d, sort: d.sort.filter((_, j) => j !== i) }))}>
                    <X />
                  </Button>
                </div>
              ))}
              <Button size="sm" variant="ghost" className="justify-self-start" disabled={def.sort.length >= 5} onClick={() => update((d) => ({ ...d, sort: [...d.sort, { field: outputs[0]?.value ?? '', dir: 'asc' }] }))}>
                <Plus />
                {t('rs.b.addSort')}
              </Button>
              <div className="flex flex-wrap items-end gap-4">
                <Labelled label={t('rs.b.limit')} htmlFor="rs-limit">
                  <Input id="rs-limit" type="number" min={1} max={10000} className="h-9 w-[110px] bg-card" value={def.limit} onChange={(e) => update((d) => ({ ...d, limit: Math.min(10000, Math.max(1, Number(e.target.value) || 1)) }))} />
                </Labelled>
                <div className="flex h-9 items-center gap-2 text-sm">
                  <Switch id="rs-totals" checked={def.totals} onCheckedChange={(v) => update((d) => ({ ...d, totals: v }))} />
                  <label htmlFor="rs-totals">{t('rs.b.totals')}</label>
                </div>
              </div>
            </Section>

            <Section title={t('rs.viz.title')} open={false} testId="rs-sec-chart">
              <div role="radiogroup" aria-label={t('rs.viz.title')} className="flex flex-wrap gap-1.5">
                {CHART_TYPES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={(def.chart?.type ?? 'auto') === c}
                    onClick={() => update((d) => ({ ...d, chart: { ...(d.chart ?? {}), type: c } }))}
                    className={`h-8 rounded-md border px-2.5 text-xs ${(def.chart?.type ?? '') === c ? 'border-primary bg-teal-soft font-semibold' : 'bg-card hover:bg-muted'}`}
                  >
                    {tk(t, `rs.chart.${c}`)}
                  </button>
                ))}
                {def.chart && (
                  <button type="button" onClick={() => update((d) => ({ ...d, chart: undefined }))} className="h-8 rounded-md px-2.5 text-xs text-muted-foreground hover:bg-muted">
                    {t('rs.viz.auto')}
                  </button>
                )}
              </div>
              {def.chart && def.chart.type !== 'table' && result && (
                <div className="grid gap-2">
                  <Labelled label={t('rs.viz.x')}>
                    <Pick label={t('rs.viz.x')} value={def.chart.x ?? ''} onChange={(x) => update((d) => ({ ...d, chart: { ...d.chart!, x } }))} options={outputs.filter((o) => o.dim).map((o) => ({ value: o.value, label: o.label }))} />
                  </Labelled>
                  <fieldset>
                    <legend className="mb-1 text-xs font-semibold text-muted-foreground">{t('rs.viz.y')}</legend>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {measureOutputs.slice(0, 20).map((o) => (
                        <label key={o.value} className="flex items-center gap-1.5 text-xs">
                          <input type="checkbox" checked={def.chart?.y?.includes(o.value) ?? false} onChange={(e) => update((d) => ({ ...d, chart: { ...d.chart!, y: e.target.checked ? [...(d.chart?.y ?? []), o.value].slice(0, 6) : (d.chart?.y ?? []).filter((y) => y !== o.value) } }))} />
                          {o.label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="flex h-9 items-center gap-2 text-sm">
                    <Switch id="rs-values" checked={!!def.chart.showValues} onCheckedChange={(v) => update((d) => ({ ...d, chart: { ...d.chart!, showValues: v } }))} />
                    <label htmlFor="rs-values">{t('rs.viz.values')}</label>
                  </div>
                </div>
              )}
            </Section>

            <Section title={t('rs.fmt.title')} hint={t('rs.fmt.hint')} count={def.formatting.length} open={false} testId="rs-sec-format">
              {def.formatting.map((r, i) => {
                const set = (patch: Partial<FormatRule>) => update((d) => ({ ...d, formatting: d.formatting.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
                return (
                  <div key={i} className="flex flex-wrap items-end gap-2 rounded-md border p-2">
                    <Pick label={t('rs.fmt.column')} value={r.column} onChange={(column) => set({ column })} options={outputs.map((o) => ({ value: o.value, label: o.label }))} className="w-[150px]" />
                    <Pick label={t('rs.fmt.when')} value={r.op} onChange={(op) => set({ op: op as FormatRule['op'] })} options={(['lt', 'lte', 'gt', 'gte', 'between', 'eq', 'neq', 'contains', 'bar'] as const).map((o) => ({ value: o, label: o === 'bar' ? t('rs.fmt.bar') : tk(t, `rs.op.${o}`) }))} className="w-[130px]" />
                    {r.op !== 'bar' && <Input aria-label={t('rs.v.value')} className="h-9 w-[80px] bg-card" value={r.value ?? ''} onChange={(e) => set({ value: e.target.value === '' ? undefined : Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : e.target.value })} />}
                    {r.op === 'between' && <Input type="number" aria-label={t('rs.v.to')} className="h-9 w-[80px] bg-card" value={r.value2 ?? ''} onChange={(e) => set({ value2: e.target.value === '' ? undefined : Number(e.target.value) })} />}
                    {r.op !== 'bar' && <Pick label={t('rs.fmt.tone')} value={r.tone} onChange={(tone) => set({ tone: tone as FormatRule['tone'] })} options={TONES.map((x) => ({ value: x, label: tk(t, `rs.tone.${x}`) }))} className="w-[110px]" />}
                    {r.op !== 'bar' && <Pick label={t('rs.fmt.style')} value={r.style} onChange={(style) => set({ style: style as FormatRule['style'] })} options={[{ value: 'fill', label: t('rs.fmt.fill') }, { value: 'text', label: t('rs.fmt.text') }]} className="w-[100px]" />}
                    <Button size="icon" variant="ghost" aria-label={t('rs.b.remove')} onClick={() => update((d) => ({ ...d, formatting: d.formatting.filter((_, j) => j !== i) }))}>
                      <X />
                    </Button>
                  </div>
                );
              })}
              <Button size="sm" variant="ghost" className="justify-self-start" disabled={outputs.length === 0} onClick={() => update((d) => ({ ...d, formatting: [...d.formatting, { column: measureOutputs[0]?.value ?? outputs[0]?.value ?? '', op: 'lt', tone: 'red', style: 'fill' }] }))}>
                <Plus />
                {t('rs.fmt.add')}
              </Button>
            </Section>
          </div>

          <section aria-label={t('rs.p.title')} className="min-w-0">
            <Card title={meta.name || t('rs.p.title')} subtitle={dataset.label} testId="rs-preview">
              {error && (
                <p role="alert" className="mb-3 rounded-md bg-red-soft px-3 py-2 text-sm text-red-ink" data-testid="rs-error">
                  {error}
                </p>
              )}
              {result ? <ResultView result={result} title={meta.name || dataset.label} chartType={(def.chart?.type as ChartType | undefined) ?? undefined} definition={prepared} source={source ?? undefined} /> : <p className="py-8 text-center text-sm text-muted-foreground">{running ? t('rs.p.loading') : t('rs.p.ready')}</p>}
            </Card>
          </section>
        </div>
      )}

      {(dialog === 'save' || dialog === 'saveAs') && (
        <SaveDialog title={dialog === 'saveAs' ? t('rs.b.saveAs') : t('rs.save.title')} initial={dialog === 'saveAs' ? { ...meta, name: t('rs.copyOf', { name: meta.name }) } : { ...meta, name: meta.name || dataset?.label || '' }} folders={folders} onSave={save(dialog === 'saveAs')} onClose={() => setDialog(null)} />
      )}
      {dialog === 'schedule' && savedId && <ScheduleDialog source={{ reportId: savedId }} title={meta.name} runtime={[]} onClose={() => setDialog(null)} />}
      {dialog && typeof dialog === 'object' && dataset && (
        <FormulaDialog
          dataset={dataset}
          definition={prepared}
          functions={catalogue.functions}
          initial={dialog.formula === 'new' ? undefined : def.calculated[dialog.formula]}
          existingKeys={[...dataset.fields.map((f) => f.key), ...def.calculated.map((c) => c.key)]}
          onClose={() => setDialog(null)}
          onSave={(c) =>
            update((d) => {
              const exists = d.calculated.some((x) => x.key === c.key);
              const calculated = exists ? d.calculated.map((x) => (x.key === c.key ? c : x)) : [...d.calculated, c];
              const add = !exists ? (c.kind === 'measure' ? { aggregates: [...d.aggregates, { fn: 'measure' as const, field: c.key }] } : d.groupBy.length || d.aggregates.length ? {} : { columns: [...(d.columns.length ? d.columns : dataset.detail), c.key] }) : {};
              return { ...d, calculated, ...add };
            })
          }
        />
      )}
    </div>
  );
}
