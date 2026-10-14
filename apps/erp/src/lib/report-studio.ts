// The report studio (services/api/src/analytics/studio.controller.ts): shapes of the catalogue,
// definitions, results, saved reports, schedules and dashboards, and the pure helpers the builder,
// viewer and dashboards share.

export type FieldType = 'text' | 'int' | 'number' | 'money' | 'percent' | 'date' | 'bool';
export type Cell = string | number | boolean | null;
export type Row = Record<string, Cell>;
export type ChartType = 'table' | 'bar' | 'hbar' | 'line' | 'area' | 'pie' | 'donut' | 'stacked' | 'stacked100' | 'kpi';
export type Tone = 'red' | 'amber' | 'green' | 'blue' | 'grey';
export type Lang = 'en' | 'hi' | 'kn';

export interface FieldMeta {
  key: string;
  label: string;
  type: FieldType;
  aggregatable: boolean;
  picker: 'section' | 'program' | 'campus' | 'department' | 'academic_year' | 'subject' | 'values' | null;
  restricted: boolean;
}
export interface DatasetMeta {
  key: string;
  label: string;
  description: string;
  category: string;
  dateField: string | null;
  detail: string[];
  fields: FieldMeta[];
}
export interface Catalogue {
  operators: Op[];
  aggregates: AggFn[];
  buckets: Bucket[];
  charts: ChartType[];
  relative: { key: string; label: string }[];
  functions: { row: string[]; measure: string[] };
  datasets: DatasetMeta[];
}

export const OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'contains', 'not_contains', 'starts_with', 'in', 'not_in', 'is_null', 'not_null', 'relative', 'is_true', 'is_false'] as const;
export type Op = (typeof OPERATORS)[number];
export const AGG_FNS = ['count', 'count_distinct', 'sum', 'avg', 'min', 'max', 'pct', 'pct_true', 'measure'] as const;
export type AggFn = (typeof AGG_FNS)[number];
export const BUCKETS = ['day', 'week', 'month', 'quarter', 'year', 'weekday'] as const;
export type Bucket = (typeof BUCKETS)[number];
export const CHART_TYPES: ChartType[] = ['table', 'bar', 'hbar', 'line', 'area', 'stacked', 'stacked100', 'pie', 'donut', 'kpi'];
export const TONES: Tone[] = ['red', 'amber', 'green', 'blue', 'grey'];

export interface Filter {
  field: string;
  op: Op;
  value?: string | number | boolean | (string | number | boolean)[];
}
export interface Calculated {
  key: string;
  label: string;
  expr: string;
  kind: 'row' | 'measure';
}
export interface Aggregate {
  fn: AggFn;
  field?: string;
  label?: string;
}
export interface FormatRule {
  column: string;
  op: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq' | 'between' | 'contains' | 'bar';
  value?: number | string;
  value2?: number;
  tone: Tone;
  style: 'fill' | 'text';
}
export interface ChartSpec {
  type: ChartType;
  x?: string;
  y?: string[];
  series?: string;
  showValues?: boolean;
}
export interface Definition {
  columns: string[];
  calculated: Calculated[];
  filters: Filter[];
  groupBy: string[];
  pivot?: { column: string };
  aggregates: Aggregate[];
  having: { field: string; op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'between'; value: number | [number, number] }[];
  sort: { field: string; dir: 'asc' | 'desc' }[];
  limit: number;
  totals: boolean;
  chart?: ChartSpec;
  formatting: FormatRule[];
}

export interface OutColumn {
  key: string;
  label: string;
  type: FieldType;
  dim: boolean;
  pivotValue?: string;
  measure?: string;
}
export interface StudioResult {
  dataset: { key: string; label: string };
  columns: OutColumn[];
  rows: Row[];
  totals: Row | null;
  truncated: boolean;
  pivot: { column: string; label: string; truncated: boolean } | null;
  filters: string[];
  chart: ChartSpec | null;
  formatting: FormatRule[];
}

/** Where a report comes from: a saved report, a library report, or an unsaved definition. */
export type Source = { reportId: string } | { libraryKey: string } | { dataset: string; definition: Definition; title?: string };

export interface LibraryItem {
  key: string;
  category: string;
  dataset: string;
  datasetLabel: string;
  title: string;
  description: string;
  chart: ChartType;
  favourite: boolean;
}
export interface SavedReportRow {
  id: string;
  name: string;
  description: string;
  dataset: string;
  datasetLabel: string;
  folder: string;
  sharedRoles: string[];
  owner: string;
  mine: boolean;
  canEdit: boolean;
  favourite: boolean;
  schedules: number;
  chart: ChartType;
  sourceLibraryKey: string | null;
  updatedAt: string;
  lastRunAt: string | null;
}
export interface ReportDoc {
  ref: string;
  title: string;
  description: string;
  dataset: string;
  definition: Definition;
  favourite: boolean;
  canEdit: boolean;
  id?: string;
  key?: string;
  folder?: string;
  sharedRoles?: string[];
  sourceLibraryKey?: string | null;
}
export interface ScheduleRow {
  id: string;
  ref: string;
  title: string;
  available: boolean;
  name: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  hour: number;
  weekday: number;
  monthDay: number;
  lang: Lang;
  runtime: Filter[];
  format: 'csv' | 'xlsx' | 'pdf';
  recipients: { emails: string[]; userIds: string[]; roles: string[] };
  active: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
  lastStatus: 'ok' | 'failed' | null;
  lastError: string | null;
  failureCount: number;
  mine: boolean;
}
export interface ScheduleRun {
  id: string;
  status: 'ok' | 'failed';
  format: string;
  rowCount: number;
  deliveredTo: string[];
  error: string | null;
  createdAt: string;
  manual: boolean;
}
export interface Person {
  id: string;
  name: string;
  email: string;
  roles: string[];
}
export interface Widget {
  id: string;
  ref: string;
  title?: string;
  chart?: ChartType;
  w: number;
  h: number;
}
export interface DashboardRow {
  id: string;
  name: string;
  description: string;
  widgets: number;
  sharedRoles: string[];
  defaultForRoles: string[];
  owner: string;
  mine: boolean;
  canEdit: boolean;
  updatedAt: string;
}
export interface DashboardDoc {
  id: string;
  name: string;
  description: string;
  widgets: Widget[];
  sharedRoles: string[];
  defaultForRoles: string[];
  canEdit: boolean;
  canSetDefault: boolean;
}
export interface WidgetData {
  id: string;
  ok: boolean;
  ref: string;
  title?: string;
  chart?: ChartType;
  result?: StudioResult;
  error?: string;
}

/** Roles a report or dashboard can be shared with (the API checks each against the data). */
export const SHARE_ROLES = ['principal', 'tenant_admin', 'hod', 'accountant', 'hr_manager', 'exam_controller', 'admissions_officer', 'librarian', 'hostel_warden', 'transport_manager', 'store_keeper', 'placement_officer', 'teacher'] as const;

export const emptyDefinition = (): Definition => ({ columns: [], calculated: [], filters: [], groupBy: [], aggregates: [], having: [], sort: [], limit: 1000, totals: true, formatting: [] });

export const isNumeric = (t: FieldType) => t === 'int' || t === 'number' || t === 'money' || t === 'percent';

/** The operators that make sense for a field type, most useful first. */
export function opsFor(type: FieldType, picker: FieldMeta['picker']): Op[] {
  if (type === 'bool') return ['is_true', 'is_false'];
  if (type === 'date') return ['relative', 'between', 'eq', 'gte', 'lte', 'is_null', 'not_null'];
  if (isNumeric(type)) return ['gte', 'lte', 'gt', 'lt', 'eq', 'neq', 'between', 'is_null', 'not_null'];
  if (picker) return ['in', 'not_in', 'eq', 'neq', 'contains', 'is_null', 'not_null'];
  return ['contains', 'eq', 'neq', 'in', 'not_in', 'starts_with', 'not_contains', 'is_null', 'not_null'];
}
export const opNeedsValue = (op: Op) => !['is_null', 'not_null', 'is_true', 'is_false'].includes(op);

/** The output key the API gives an aggregate (count, sum_amount, measure key…). */
export function aggKey(a: Aggregate): string {
  if (a.fn === 'measure') return a.field ?? '';
  if (!a.field) return a.fn === 'pct' ? 'pct' : 'count';
  return a.fn === 'count' ? `count_${a.field}` : `${a.fn}_${a.field}`;
}
/** The output key of a grouping: `due_on:month` → `due_on__month`. */
export const refKey = (ref: string) => ref.replace(':', '__');

/** The aggregates a field allows. */
export function aggsFor(f: Pick<FieldMeta, 'type' | 'aggregatable'>): AggFn[] {
  if (f.type === 'bool') return ['pct_true', 'count'];
  if (isNumeric(f.type)) return f.aggregatable ? ['sum', 'avg', 'min', 'max', 'pct', 'count', 'count_distinct'] : ['avg', 'min', 'max', 'count_distinct'];
  if (f.type === 'date') return ['min', 'max', 'count', 'count_distinct'];
  return ['count_distinct', 'count', 'min', 'max'];
}

/** The tone a conditional-formatting rule gives a value (rules on a measure cover its pivot columns). Mirrors the API's exports. */
export function toneOf(col: OutColumn, v: Cell, rules: FormatRule[]): { tone: Tone; style: 'fill' | 'text' } | null {
  for (const r of rules) {
    if (r.op === 'bar' || (r.column !== col.key && r.column !== col.measure) || v === null || v === undefined) continue;
    const x = col.type === 'money' && typeof v === 'number' ? v / 100 : Number(v);
    const val = typeof r.value === 'number' ? r.value : Number(r.value);
    const hit =
      r.op === 'gt' ? x > val :
      r.op === 'gte' ? x >= val :
      r.op === 'lt' ? x < val :
      r.op === 'lte' ? x <= val :
      r.op === 'between' ? x >= val && x <= (r.value2 ?? val) :
      r.op === 'eq' ? (typeof r.value === 'number' ? x === val : String(v) === String(r.value)) :
      r.op === 'neq' ? (typeof r.value === 'number' ? x !== val : String(v) !== String(r.value)) :
      String(v).toLowerCase().includes(String(r.value ?? '').toLowerCase());
    if (hit) return { tone: r.tone, style: r.style };
  }
  return null;
}

/** Data-bar rules: the largest absolute value of each column with a bar, so cells can draw their share. */
export function barMax(result: StudioResult): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of result.formatting.filter((f) => f.op === 'bar')) {
    for (const c of result.columns.filter((c) => c.key === r.column || c.measure === r.column)) {
      out[c.key] = Math.max(0, ...result.rows.map((row) => Math.abs(Number(row[c.key] ?? 0)) || 0));
    }
  }
  return out;
}

/** What a result can be drawn as: the category column, the numeric series, and whether it is a cross-tab. */
export interface ChartPlan {
  x: OutColumn | null;
  series: OutColumn[];
  /** Pie and donut need one series of parts of a whole; a KPI needs one value. */
  pieOk: boolean;
  kpiOk: boolean;
  timeLike: boolean;
}
export function chartPlan(result: StudioResult, spec?: ChartSpec | null): ChartPlan {
  const cols = result.columns;
  const dims = cols.filter((c) => c.dim);
  const nums = cols.filter((c) => !c.dim && isNumeric(c.type));
  const x = (spec?.x && cols.find((c) => c.key === spec.x)) || dims[0] || cols.find((c) => !isNumeric(c.type)) || null;
  let series: OutColumn[];
  if (result.pivot) {
    const measure = spec?.y?.[0] ? cols.find((c) => c.key === spec.y![0])?.measure ?? spec.y[0] : nums.find((c) => c.pivotValue !== undefined)?.measure;
    series = nums.filter((c) => c.pivotValue !== undefined && (!measure || c.measure === measure));
  } else {
    const wanted = (spec?.y ?? []).map((k) => cols.find((c) => c.key === k)).filter((c): c is OutColumn => !!c && isNumeric(c.type));
    series = wanted.length ? wanted : nums.filter((c) => c.key !== x?.key).slice(0, 1);
  }
  const rows = result.rows.length;
  const allPositive = series.every((s) => result.rows.every((r) => r[s.key] === null || Number(r[s.key]) >= 0));
  return {
    x,
    series: series.slice(0, 8),
    pieOk: series.length === 1 && rows >= 2 && rows <= 12 && allPositive && series[0].type !== 'percent',
    kpiOk: series.length >= 1 && rows === 1,
    timeLike: !!x && (/__(day|week|month|quarter|year)$/.test(x.key) || x.type === 'date'),
  };
}

/** A sensible chart when the report does not name one: a line over time, a bar by category, a number for one row. */
export function defaultChart(result: StudioResult): ChartType {
  if (result.chart?.type) return result.chart.type;
  const p = chartPlan(result);
  if (p.kpiOk && !result.columns.some((c) => c.dim)) return 'kpi';
  if (!p.x || p.series.length === 0 || result.rows.length === 0) return 'table';
  if (p.timeLike) return 'line';
  if (result.pivot) return 'stacked';
  return result.rows.length > 8 || String(result.rows[0]?.[p.x.key] ?? '').length > 14 ? 'hbar' : 'bar';
}

/** A filter written for people, before the API words it ("Class is one of 2 values"). */
export function describeFilter(f: Filter, label: string, opLabel: string, valueLabel?: (v: string) => string): string {
  if (!opNeedsValue(f.op)) return `${label} ${opLabel}`;
  const vals = Array.isArray(f.value) ? f.value : f.value === undefined ? [] : [f.value];
  const shown = vals.map((v) => (valueLabel ? valueLabel(String(v)) : String(v)));
  return `${label} ${opLabel} ${shown.length > 3 ? `${shown.slice(0, 3).join(', ')} +${shown.length - 3}` : shown.join(f.op === 'between' ? ' – ' : ', ')}`;
}

/** Splits "a@x.in, b@x.in\n c@x.in" into trimmed, lower-case, unique addresses. */
export const parseEmails = (s: string) => [...new Set(s.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];

/** Leaves out filters and totals that are still being filled in, so the live preview does not fail on them. */
export function ready(def: Definition): Definition {
  const okFilter = (f: Filter) => {
    if (!opNeedsValue(f.op)) return true;
    const v = f.value;
    if (v === undefined || v === '') return false;
    if (Array.isArray(v)) return v.length > 0 && (f.op !== 'between' || (v.length === 2 && v.every((x) => x !== '')));
    return true;
  };
  return {
    ...def,
    filters: def.filters.filter(okFilter),
    aggregates: def.aggregates.filter((a) => a.fn === 'count' || !!a.field),
    having: def.having.filter((h) => h.field && (Array.isArray(h.value) ? h.value.every((x) => Number.isFinite(x)) : Number.isFinite(h.value))),
    sort: def.sort.filter((s) => s.field),
    formatting: def.formatting.filter((r) => r.column && (r.op === 'bar' || r.value !== undefined)),
  };
}

export const newWidgetId = () => `w${Math.random().toString(36).slice(2, 10)}`;

/** Moves an item in a list (drag and drop, or the up/down buttons). */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const out = [...list];
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x);
  return out;
}

/** The validated 8-slot categorical palette (light and dark steps live in the chart's CSS variables). */
export const SERIES_VARS = Array.from({ length: 8 }, (_, i) => `var(--rs-series-${i + 1})`);
