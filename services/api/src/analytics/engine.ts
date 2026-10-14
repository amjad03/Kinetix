import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { RoleName } from '../auth/principal.js';
import type { Tx } from '../db/db.service.js';
import { compileExpr, ExprError, type ExprMode, type Operand } from './expr.js';
import { addDays } from './queries.js';
import { fieldAggregatable, maySeeField, mayUseDataset, NUMERIC, type FieldType, type L, type Lang, type SemDataset, type SemField } from './semantic.js';

/**
 * The report engine: validates a report definition against the semantic catalogue, compiles it to
 * one parameterised SQL statement (plus totals), and runs it inside the caller's tenant transaction
 * (row-level security) with an explicit tenant predicate and a statement timeout. Nothing from the
 * request reaches SQL except catalogue keys, which pick our own fragments, and bound values.
 */

// ----- the definition ---------------------------------------------------------------------------------

export const OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'contains', 'not_contains', 'starts_with', 'in', 'not_in', 'is_null', 'not_null', 'relative', 'is_true', 'is_false'] as const;
export const AGGREGATES = ['count', 'count_distinct', 'sum', 'avg', 'min', 'max', 'pct', 'pct_true', 'measure'] as const;
export const BUCKETS = ['day', 'week', 'month', 'quarter', 'year', 'weekday'] as const;
export const RELATIVE = ['today', 'yesterday', 'tomorrow', 'this_week', 'last_week', 'last_7_days', 'last_30_days', 'last_90_days', 'next_7_days', 'next_30_days', 'this_month', 'last_month', 'this_quarter', 'this_year', 'this_academic_year', 'last_academic_year', 'this_financial_year', 'last_financial_year', 'before_today', 'after_today'] as const;
export const CHARTS = ['table', 'bar', 'hbar', 'line', 'area', 'pie', 'donut', 'stacked', 'stacked100', 'kpi'] as const;
export const TONES = ['red', 'amber', 'green', 'blue', 'grey'] as const;
export type Op = (typeof OPERATORS)[number];
export type Bucket = (typeof BUCKETS)[number];
export type Relative = (typeof RELATIVE)[number];

const Key = z.string().regex(/^[a-z_][a-z0-9_]{0,39}$/, 'Not a field');
/** A field, or a date field cut into periods: `due_on:month`. */
const Ref = z.string().regex(/^[a-z_][a-z0-9_]{0,39}(:(day|week|month|quarter|year|weekday))?$/, 'Not a field');
/** An output column: a field, a period (`due_on__month`) or an aggregate (`sum_amount`). */
const OutKey = z.string().regex(/^[a-z_][a-z0-9_]{0,80}$/, 'Not a column');
const Scalar = z.union([z.string().max(200), z.number().finite(), z.boolean()]);
export const FilterSchema = z.object({ field: Key, op: z.enum(OPERATORS), value: z.union([Scalar, z.array(Scalar).max(200)]).optional() });
export type Filter = z.infer<typeof FilterSchema>;

export const DefinitionSchema = z.object({
  /** Detail mode: the columns to show (the dataset's usual columns when empty). Ignored when summarising. */
  columns: z.array(Key).max(40).default([]),
  /** Formulas over the dataset's fields (expr.ts). "row" fields work like fields; "measure" fields summarise. */
  calculated: z.array(z.object({ key: Key, label: z.string().trim().min(1).max(60), expr: z.string().min(1).max(400), kind: z.enum(['row', 'measure']).default('row') })).max(10).default([]),
  filters: z.array(FilterSchema).max(25).default([]),
  groupBy: z.array(Ref).max(5).default([]),
  /** Spread one more field across the columns (a cross-tab). Needs at least one aggregate or count. */
  pivot: z.object({ column: Ref }).optional(),
  aggregates: z.array(z.object({ fn: z.enum(AGGREGATES), field: Key.optional(), label: z.string().trim().max(60).optional() })).max(10).default([]),
  /** Conditions on summarised values: "attendance % below 75". */
  having: z.array(z.object({ field: OutKey, op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between']), value: z.union([z.number().finite(), z.array(z.number().finite()).length(2)]) })).max(10).default([]),
  sort: z.array(z.object({ field: OutKey, dir: z.enum(['asc', 'desc']).default('asc') })).max(5).default([]),
  limit: z.number().int().min(1).max(10000).default(1000),
  totals: z.boolean().default(true),
  chart: z
    .object({
      type: z.enum(CHARTS),
      x: OutKey.optional(),
      y: z.array(OutKey).max(6).optional(),
      series: OutKey.optional(),
      showValues: z.boolean().optional(),
    })
    .optional(),
  formatting: z
    .array(
      z.object({
        column: OutKey,
        op: z.enum(['gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'between', 'contains', 'bar']),
        value: z.union([z.number().finite(), z.string().max(100)]).optional(),
        value2: z.number().finite().optional(),
        tone: z.enum(TONES).default('red'),
        style: z.enum(['fill', 'text']).default('fill'),
      }),
    )
    .max(20)
    .default([]),
});
export type Definition = z.infer<typeof DefinitionSchema>;

// ----- results ----------------------------------------------------------------------------------------

export type Cell = string | number | boolean | null;
export type Row = Record<string, Cell>;
/** The legacy column kind (catalogue reports and the CSV export use it). */
export type Kind = 'text' | 'int' | 'percent' | 'money' | 'date';

export interface OutColumn {
  key: string;
  label: string;
  type: FieldType;
  kind: Kind;
  /** A dimension (grouping) rather than a measure. */
  dim: boolean;
  /** For pivot columns: the pivot value and the aggregate it shows. */
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
  /** The filters as words, for headers of exports and the viewer. */
  filters: string[];
  chart: Definition['chart'] | null;
  formatting: Definition['formatting'];
}

export interface Caller {
  tenantId: string;
  userId: string;
  roles: RoleName[];
}

export interface RunCtx {
  today: string;
  timezone: string;
  lang: Lang;
  /** Current and previous academic years, when the institution has set them up. */
  academicYears: { from: string; to: string; current: boolean }[];
}

export interface RunOptions {
  /** Filters the viewer adds on top of the saved ones. */
  runtime?: Filter[];
  /** Overrides the definition's row limit (exports take more rows). */
  limit?: number;
  /** Extra conditions (a drill-down). */
  extra?: { ref: string; value: Cell }[];
}

const fail = (m: string): never => {
  throw new BadRequestException(m);
};

const T = <K extends string>(m: Record<K, L>) => m;
const WORDS = T({
  count: { en: 'Count', hi: 'गिनती', kn: 'ಎಣಿಕೆ' },
  countOf: { en: 'Count of {f}', hi: '{f} की गिनती', kn: '{f} ಎಣಿಕೆ' },
  count_distinct: { en: 'Distinct {f}', hi: 'भिन्न {f}', kn: 'ಭಿನ್ನ {f}' },
  sum: { en: 'Sum of {f}', hi: '{f} का योग', kn: '{f} ಮೊತ್ತ' },
  avg: { en: 'Average of {f}', hi: '{f} का औसत', kn: '{f} ಸರಾಸರಿ' },
  min: { en: 'Lowest {f}', hi: 'न्यूनतम {f}', kn: 'ಕನಿಷ್ಠ {f}' },
  max: { en: 'Highest {f}', hi: 'अधिकतम {f}', kn: 'ಗರಿಷ್ಠ {f}' },
  pct: { en: '% of total', hi: 'कुल का %', kn: 'ಒಟ್ಟಿನ %' },
  pctOf: { en: '% of total {f}', hi: 'कुल {f} का %', kn: 'ಒಟ್ಟು {f} ಶೇಕಡಾ' },
  pct_true: { en: '% {f}', hi: '% {f}', kn: '% {f}' },
  total: { en: 'Total', hi: 'कुल', kn: 'ಒಟ್ಟು' },
  day: { en: '{f} (day)', hi: '{f} (दिन)', kn: '{f} (ದಿನ)' },
  week: { en: '{f} (week)', hi: '{f} (सप्ताह)', kn: '{f} (ವಾರ)' },
  month: { en: '{f} (month)', hi: '{f} (महीना)', kn: '{f} (ತಿಂಗಳು)' },
  quarter: { en: '{f} (quarter)', hi: '{f} (तिमाही)', kn: '{f} (ತ್ರೈಮಾಸಿಕ)' },
  year: { en: '{f} (year)', hi: '{f} (वर्ष)', kn: '{f} (ವರ್ಷ)' },
  weekday: { en: '{f} (weekday)', hi: '{f} (सप्ताह का दिन)', kn: '{f} (ವಾರದ ದಿನ)' },
  yes: { en: 'Yes', hi: 'हाँ', kn: 'ಹೌದು' },
  no: { en: 'No', hi: 'नहीं', kn: 'ಇಲ್ಲ' },
  empty: { en: '(blank)', hi: '(खाली)', kn: '(ಖಾಲಿ)' },
});
const OP_WORDS: Record<Op, L> = {
  eq: { en: 'is', hi: 'है', kn: 'ಆಗಿದೆ' },
  neq: { en: 'is not', hi: 'नहीं है', kn: 'ಅಲ್ಲ' },
  gt: { en: 'more than', hi: 'से अधिक', kn: 'ಕ್ಕಿಂತ ಹೆಚ್ಚು' },
  gte: { en: 'at least', hi: 'कम से कम', kn: 'ಕನಿಷ್ಠ' },
  lt: { en: 'less than', hi: 'से कम', kn: 'ಕ್ಕಿಂತ ಕಡಿಮೆ' },
  lte: { en: 'at most', hi: 'अधिकतम', kn: 'ಗರಿಷ್ಠ' },
  between: { en: 'between', hi: 'के बीच', kn: 'ನಡುವೆ' },
  contains: { en: 'contains', hi: 'में शामिल', kn: 'ಒಳಗೊಂಡಿದೆ' },
  not_contains: { en: 'does not contain', hi: 'में शामिल नहीं', kn: 'ಒಳಗೊಂಡಿಲ್ಲ' },
  starts_with: { en: 'starts with', hi: 'से शुरू', kn: 'ಇದರಿಂದ ಆರಂಭ' },
  in: { en: 'is one of', hi: 'इनमें से एक', kn: 'ಇವುಗಳಲ್ಲಿ ಒಂದು' },
  not_in: { en: 'is none of', hi: 'इनमें से कोई नहीं', kn: 'ಇವುಗಳಲ್ಲಿ ಯಾವುದೂ ಅಲ್ಲ' },
  is_null: { en: 'is blank', hi: 'खाली है', kn: 'ಖಾಲಿ ಇದೆ' },
  not_null: { en: 'is not blank', hi: 'खाली नहीं है', kn: 'ಖಾಲಿ ಇಲ್ಲ' },
  relative: { en: 'is', hi: 'है', kn: 'ಆಗಿದೆ' },
  is_true: { en: 'is yes', hi: 'हाँ है', kn: 'ಹೌದು' },
  is_false: { en: 'is no', hi: 'नहीं है', kn: 'ಇಲ್ಲ' },
};
export const RELATIVE_WORDS: Record<Relative, L> = {
  today: { en: 'today', hi: 'आज', kn: 'ಇಂದು' },
  yesterday: { en: 'yesterday', hi: 'कल (बीता)', kn: 'ನಿನ್ನೆ' },
  tomorrow: { en: 'tomorrow', hi: 'कल (आने वाला)', kn: 'ನಾಳೆ' },
  this_week: { en: 'this week', hi: 'इस सप्ताह', kn: 'ಈ ವಾರ' },
  last_week: { en: 'last week', hi: 'पिछले सप्ताह', kn: 'ಕಳೆದ ವಾರ' },
  last_7_days: { en: 'the last 7 days', hi: 'पिछले 7 दिन', kn: 'ಕಳೆದ 7 ದಿನಗಳು' },
  last_30_days: { en: 'the last 30 days', hi: 'पिछले 30 दिन', kn: 'ಕಳೆದ 30 ದಿನಗಳು' },
  last_90_days: { en: 'the last 90 days', hi: 'पिछले 90 दिन', kn: 'ಕಳೆದ 90 ದಿನಗಳು' },
  next_7_days: { en: 'the next 7 days', hi: 'अगले 7 दिन', kn: 'ಮುಂದಿನ 7 ದಿನಗಳು' },
  next_30_days: { en: 'the next 30 days', hi: 'अगले 30 दिन', kn: 'ಮುಂದಿನ 30 ದಿನಗಳು' },
  this_month: { en: 'this month', hi: 'इस महीने', kn: 'ಈ ತಿಂಗಳು' },
  last_month: { en: 'last month', hi: 'पिछले महीने', kn: 'ಕಳೆದ ತಿಂಗಳು' },
  this_quarter: { en: 'this quarter', hi: 'इस तिमाही', kn: 'ಈ ತ್ರೈಮಾಸಿಕ' },
  this_year: { en: 'this calendar year', hi: 'इस कैलेंडर वर्ष', kn: 'ಈ ಕ್ಯಾಲೆಂಡರ್ ವರ್ಷ' },
  this_academic_year: { en: 'this academic year', hi: 'इस शैक्षणिक वर्ष', kn: 'ಈ ಶೈಕ್ಷಣಿಕ ವರ್ಷ' },
  last_academic_year: { en: 'last academic year', hi: 'पिछले शैक्षणिक वर्ष', kn: 'ಕಳೆದ ಶೈಕ್ಷಣಿಕ ವರ್ಷ' },
  this_financial_year: { en: 'this financial year', hi: 'इस वित्तीय वर्ष', kn: 'ಈ ಆರ್ಥಿಕ ವರ್ಷ' },
  last_financial_year: { en: 'last financial year', hi: 'पिछले वित्तीय वर्ष', kn: 'ಕಳೆದ ಆರ್ಥಿಕ ವರ್ಷ' },
  before_today: { en: 'before today', hi: 'आज से पहले', kn: 'ಇಂದಿಗಿಂತ ಮೊದಲು' },
  after_today: { en: 'after today', hi: 'आज के बाद', kn: 'ಇಂದಿನ ನಂತರ' },
};
const word = (w: L, lang: Lang, f = '') => w[lang].replace('{f}', f);

// ----- dates ------------------------------------------------------------------------------------------

const isoDow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay() || 7;
const monthStart = (d: string, back = 0) => {
  const x = new Date(`${d.slice(0, 7)}-01T00:00:00Z`);
  x.setUTCMonth(x.getUTCMonth() - back);
  return x.toISOString().slice(0, 10);
};
const monthEnd = (start: string) => {
  const x = new Date(`${start}T00:00:00Z`);
  x.setUTCMonth(x.getUTCMonth() + 1, 0);
  return x.toISOString().slice(0, 10);
};

/** The inclusive local-date range of a relative period (either end may be open). */
export function relativeRange(r: Relative, ctx: Pick<RunCtx, 'today' | 'academicYears'>): { from?: string; to?: string } {
  const t = ctx.today;
  const y = Number(t.slice(0, 4));
  const m = Number(t.slice(5, 7));
  switch (r) {
    case 'today':
      return { from: t, to: t };
    case 'yesterday':
      return { from: addDays(t, -1), to: addDays(t, -1) };
    case 'tomorrow':
      return { from: addDays(t, 1), to: addDays(t, 1) };
    case 'this_week':
      return { from: addDays(t, 1 - isoDow(t)), to: addDays(t, 7 - isoDow(t)) };
    case 'last_week':
      return { from: addDays(t, -6 - isoDow(t)), to: addDays(t, -isoDow(t)) };
    case 'last_7_days':
      return { from: addDays(t, -6), to: t };
    case 'last_30_days':
      return { from: addDays(t, -29), to: t };
    case 'last_90_days':
      return { from: addDays(t, -89), to: t };
    case 'next_7_days':
      return { from: t, to: addDays(t, 6) };
    case 'next_30_days':
      return { from: t, to: addDays(t, 29) };
    case 'this_month':
      return { from: monthStart(t), to: monthEnd(monthStart(t)) };
    case 'last_month':
      return { from: monthStart(t, 1), to: monthEnd(monthStart(t, 1)) };
    case 'this_quarter': {
      const qs = `${y}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, '0')}-01`;
      const end = new Date(`${qs}T00:00:00Z`);
      end.setUTCMonth(end.getUTCMonth() + 3, 0);
      return { from: qs, to: end.toISOString().slice(0, 10) };
    }
    case 'this_year':
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case 'this_financial_year':
    case 'last_financial_year': {
      const start = (m >= 4 ? y : y - 1) - (r === 'last_financial_year' ? 1 : 0);
      return { from: `${start}-04-01`, to: `${start + 1}-03-31` };
    }
    case 'this_academic_year':
    case 'last_academic_year': {
      const years = [...ctx.academicYears].sort((a, b) => (a.from < b.from ? 1 : -1));
      const cur = years.find((a) => a.current) ?? years.find((a) => a.from <= t && a.to >= t);
      if (r === 'this_academic_year' && cur) return { from: cur.from, to: cur.to };
      if (r === 'last_academic_year' && cur) {
        const prev = years.find((a) => a.to < cur.from);
        if (prev) return { from: prev.from, to: prev.to };
        return { from: `${Number(cur.from.slice(0, 4)) - 1}${cur.from.slice(4)}`, to: addDays(cur.from, -1) };
      }
      // No academic years set up: June to May, the usual Indian academic year.
      const start = (m >= 6 ? y : y - 1) - (r === 'last_academic_year' ? 1 : 0);
      return { from: `${start}-06-01`, to: `${start + 1}-05-31` };
    }
    case 'before_today':
      return { to: addDays(t, -1) };
    case 'after_today':
      return { from: addDays(t, 1) };
  }
}

// ----- compilation ------------------------------------------------------------------------------------

/** A resolved field or formula: its SQL, type and label. */
interface Resolved {
  key: string;
  label: string;
  type: FieldType;
  sql: SQL;
  /** Our SQL text, scanned for the joins it needs. */
  raw: string[];
  idSql?: SQL;
  sortSql?: SQL;
  aggregatable: boolean;
  picker?: SemField['picker'];
  measure?: boolean;
}

interface Output {
  key: string;
  label: string;
  type: FieldType;
  sql: SQL;
  dim: boolean;
  /** For aggregates: whether row and column totals add up (counts and sums). */
  additive?: boolean;
  sortSql?: SQL;
  ref?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const kindOf = (t: FieldType): Kind => (t === 'money' ? 'money' : t === 'int' ? 'int' : t === 'percent' ? 'percent' : t === 'date' ? 'date' : 'text');

/** Binds `{{today}}` and `{{tz}}` and leaves the rest of our own SQL as it is. */
function bindRaw(expr: string, ctx: RunCtx): SQL {
  const parts = expr.split(/(\{\{today\}\}|\{\{tz\}\})/).filter((p) => p !== '');
  return sql.join(
    parts.map((p) => (p === '{{today}}' ? sql`${ctx.today}` : p === '{{tz}}' ? sql`${ctx.timezone}` : sql.raw(p))),
    sql``,
  );
}

const BUCKET_SQL: Record<Bucket, (e: SQL) => SQL> = {
  day: (e) => sql`to_char(${e}, 'YYYY-MM-DD')`,
  week: (e) => sql`to_char(${e}, 'IYYY-"W"IW')`,
  month: (e) => sql`to_char(${e}, 'YYYY-MM')`,
  quarter: (e) => sql`to_char(${e}, 'YYYY-"Q"Q')`,
  year: (e) => sql`to_char(${e}, 'YYYY')`,
  weekday: (e) => sql`(array['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])[extract(isodow from ${e})::int]`,
};

/** Everything one definition needs to run: validated, permission-checked and compiled. */
export class Plan {
  readonly fields = new Map<string, Resolved>();
  readonly outputs: Output[] = [];
  readonly wheres: SQL[] = [];
  readonly having: SQL[] = [];
  readonly raws: string[] = [];
  readonly filterText: string[] = [];
  /** Picker filters whose values are ids, named later for the filter line. */
  readonly idFilters: { label: string; op: Op; ids: string[]; field: Resolved }[] = [];
  readonly aggregate: boolean;
  pivot: Output | null = null;
  readonly groupOutputs: Output[] = [];
  readonly measureOutputs: Output[] = [];

  constructor(
    readonly ds: SemDataset,
    readonly def: Definition,
    readonly who: Caller,
    readonly ctx: RunCtx,
    readonly opts: RunOptions = {},
  ) {
    if (!mayUseDataset(ds, who.roles)) throw new ForbiddenException('Insufficient role for this dataset');
    const lang = ctx.lang;
    for (const fd of ds.fields) this.fields.set(fd.key, this.fromField(fd));
    // Formulas, in order: each may use the fields and the formulas before it.
    for (const c of def.calculated) {
      if (this.fields.has(c.key)) fail(`"${c.key}" is already a field of ${ds.label[lang]}; choose another name`);
      const raws: string[] = [];
      let compiled: Operand & { aggregate: boolean };
      try {
        compiled = compileExpr(c.expr, c.kind as ExprMode, (name) => {
          const r = this.fields.get(name);
          if (!r) return undefined;
          if (r.measure) throw new ExprError(`"${name}" is a summary formula and cannot be used inside another formula`);
          raws.push(...r.raw);
          return { sql: r.sql, type: r.type };
        }, ctx.today);
      } catch (e) {
        if (e instanceof ExprError) fail(`Formula "${c.label}": ${e.message}`);
        throw e;
      }
      this.fields.set(c.key, { key: c.key, label: c.label, type: compiled!.type, sql: sql`(${compiled!.sql})`, raw: raws, aggregatable: NUMERIC.includes(compiled!.type), measure: c.kind === 'measure' });
    }

    for (const f of [...def.filters, ...(opts.runtime ?? [])]) this.addFilter(f);
    this.wheres.unshift(sql`${sql.raw(`${ds.base}.tenant_id`)} = ${who.tenantId}::uuid`);
    if (ds.where) {
      this.wheres.push(sql`(${bindRaw(ds.where, ctx)})`);
      this.raws.push(ds.where);
    }
    // A teacher (and no wider role for this dataset) sees only the classes they teach.
    if (ds.classScoped && !who.roles.some((r) => r !== 'teacher' && ds.roles.includes(r))) {
      this.wheres.push(sql`sec.id in (select section_id from timetable_slots where teacher_id = ${who.userId}::uuid and archived_at is null)`);
      this.raws.push('sec.id');
    }

    this.aggregate = def.groupBy.length > 0 || def.aggregates.length > 0 || !!def.pivot;
    if (this.aggregate) this.planAggregate();
    else this.planDetail();

    for (const e of opts.extra ?? []) {
      const o = this.dimFor(e.ref);
      const v = e.value;
      if (v === null) this.wheres.push(sql`(${o.sql}) is null`);
      else if (NUMERIC.includes(o.type) && Number.isFinite(Number(v))) this.wheres.push(sql`(${o.sql}) = ${Number(v)}`);
      else if (o.type === 'bool') this.wheres.push(sql`(${o.sql}) = ${v === true || v === 'true'}`);
      else this.wheres.push(sql`(${o.sql})::text = ${String(v)}`);
      this.raws.push(...this.rawsOf(e.ref));
    }
  }

  private fromField(fd: SemField): Resolved {
    return {
      key: fd.key,
      label: fd.label[this.ctx.lang],
      type: fd.type,
      sql: sql`(${bindRaw(fd.expr, this.ctx)})`,
      raw: [fd.expr],
      idSql: fd.idExpr ? sql.raw(fd.idExpr) : undefined,
      sortSql: fd.sortExpr ? sql`(${bindRaw(fd.sortExpr, this.ctx)})` : undefined,
      aggregatable: fieldAggregatable(fd),
      picker: fd.picker,
    };
  }

  /** A field the caller may use; 400 when unknown, 403 when it is not theirs to see. */
  field(key: string): Resolved {
    const r = this.fields.get(key);
    if (!r) return fail(`"${key}" is not a column of ${this.ds.label[this.ctx.lang]}`);
    const fd = this.ds.fields.find((x) => x.key === key);
    if (fd && !maySeeField(fd, this.who.roles)) throw new ForbiddenException(`You may not see "${fd.label.en}"`);
    this.raws.push(...r.raw);
    if (fd?.idExpr) this.raws.push(fd.idExpr);
    if (fd?.sortExpr) this.raws.push(fd.sortExpr);
    return r;
  }

  private rawsOf(ref: string): string[] {
    const r = this.fields.get(ref.split(':')[0]);
    return r ? r.raw : [];
  }

  /** A grouping: a field, or a date field cut into days, weeks, months, quarters, years or weekdays. */
  private dimFor(ref: string): Output {
    const [key, bucket] = ref.split(':') as [string, Bucket | undefined];
    const r = this.field(key);
    if (r.measure) fail(`"${r.label}" is a summary formula: add it as an aggregate, not a grouping`);
    if (!bucket) return { key, label: r.label, type: r.type, sql: r.sql, dim: true, sortSql: r.sortSql, ref };
    if (r.type !== 'date') fail(`Only dates can be grouped by ${bucket}; "${r.label}" is not a date`);
    return {
      key: `${key}__${bucket}`,
      label: word(WORDS[bucket], this.ctx.lang, r.label),
      type: 'text',
      sql: BUCKET_SQL[bucket](r.sql),
      dim: true,
      sortSql: bucket === 'weekday' ? sql`extract(isodow from ${r.sql})` : undefined,
      ref,
    };
  }

  private planDetail() {
    const def = this.def;
    const cols = def.columns.length ? def.columns : this.ds.detail.filter((k) => maySeeField(this.ds.fields.find((x) => x.key === k)!, this.who.roles));
    if (new Set(cols).size !== cols.length) fail('A column is listed twice');
    for (const k of cols) {
      const r = this.field(k);
      if (r.measure) fail(`"${r.label}" is a summary formula: it needs a grouping or an aggregate`);
      this.outputs.push({ key: k, label: r.label, type: r.type, sql: r.sql, dim: true, ref: k });
    }
    if (def.having.length) fail('Conditions on totals need a grouping or an aggregate');
  }

  private planAggregate() {
    const def = this.def;
    const lang = this.ctx.lang;
    if (new Set(def.groupBy).size !== def.groupBy.length) fail('A group-by column is listed twice');
    for (const ref of def.groupBy) {
      const o = this.dimFor(ref);
      this.outputs.push(o);
      this.groupOutputs.push(o);
    }
    if (def.pivot) {
      if (def.groupBy.includes(def.pivot.column)) fail('The pivot column is already a grouping');
      this.pivot = this.dimFor(def.pivot.column);
    }
    const aggs = def.aggregates.length ? def.aggregates : [{ fn: 'count' as const, field: undefined, label: undefined }];
    for (const a of aggs) {
      const o = this.aggregateOutput(a.fn, a.field, lang);
      if (a.label) o.label = a.label;
      this.outputs.push(o);
      this.measureOutputs.push(o);
    }
    const keys = this.outputs.map((o) => o.key);
    if (new Set(keys).size !== keys.length) fail('An aggregate is listed twice');
    for (const h of def.having) {
      const o = this.measureOutputs.find((m) => m.key === h.field) ?? fail(`"${h.field}" is not a total of this report`);
      const n = (v: number) => (o.type === 'money' ? Math.round(v * 100) : v);
      if (h.op === 'between') {
        if (!Array.isArray(h.value)) fail('"between" needs two numbers');
        const [lo, hi] = h.value as number[];
        this.having.push(sql`(${o.sql}) between ${n(lo)} and ${n(hi)}`);
      } else {
        if (Array.isArray(h.value)) fail(`"${h.op}" takes one number`);
        const cmp = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }[h.op];
        this.having.push(sql`(${o.sql}) ${sql.raw(cmp)} ${n(h.value as number)}`);
      }
    }
  }

  private aggregateOutput(fn: (typeof AGGREGATES)[number], fieldKey: string | undefined, lang: Lang): Output {
    if (fn === 'count' && !fieldKey) return { key: 'count', label: word(WORDS.count, lang), type: 'int', sql: sql`count(*)::int`, dim: false, additive: true };
    if (fn === 'pct' && !fieldKey) return { key: 'pct', label: word(WORDS.pct, lang), type: 'percent', sql: sql`round(count(*) * 100.0 / nullif(sum(count(*)) over (), 0), 1)`, dim: false, additive: true };
    if (!fieldKey) return fail(`${fn} needs a column`);
    const x = this.field(fieldKey);
    if (fn === 'measure') {
      if (!x.measure) fail(`"${x.label}" is not a summary formula`);
      return { key: x.key, label: x.label, type: x.type, sql: x.sql, dim: false };
    }
    if (x.measure) fail(`"${x.label}" is a summary formula: add it as its own aggregate`);
    const key = fn === 'count' ? `count_${x.key}` : `${fn}_${x.key}`;
    switch (fn) {
      case 'count':
        return { key, label: word(WORDS.countOf, lang, x.label), type: 'int', sql: sql`count(${x.sql})::int`, dim: false, additive: true };
      case 'count_distinct':
        return { key, label: word(WORDS.count_distinct, lang, x.label), type: 'int', sql: sql`count(distinct ${x.sql})::int`, dim: false };
      case 'sum':
      case 'avg':
        if (!NUMERIC.includes(x.type)) fail(`${fn} works on numbers, and "${x.label}" is not one`);
        if (fn === 'sum' && !x.aggregatable) fail(`"${x.label}" cannot be added up; try the average, lowest or highest`);
        return fn === 'sum'
          ? { key, label: word(WORDS.sum, lang, x.label), type: x.type, sql: sql`sum(${x.sql})`, dim: false, additive: true }
          : { key, label: word(WORDS.avg, lang, x.label), type: x.type === 'int' ? 'number' : x.type, sql: sql`round(avg(${x.sql})::numeric, 2)`, dim: false };
      case 'min':
      case 'max':
        if (x.type === 'bool') fail(`${fn} does not work on yes/no columns`);
        return { key, label: word(WORDS[fn], lang, x.label), type: x.type, sql: sql`${sql.raw(fn)}(${x.sql})`, dim: false };
      case 'pct':
        if (!NUMERIC.includes(x.type) || !x.aggregatable) fail(`"% of total" works on amounts and counts, and "${x.label}" is not one`);
        return { key, label: word(WORDS.pctOf, lang, x.label), type: 'percent', sql: sql`round(sum(${x.sql}) * 100.0 / nullif(sum(sum(${x.sql})) over (), 0), 1)`, dim: false, additive: true };
      case 'pct_true':
        if (x.type === 'bool') return { key, label: word(WORDS.pct_true, lang, x.label), type: 'percent', sql: sql`round(avg(case when ${x.sql} then 100.0 else 0 end), 1)`, dim: false };
        if (x.type === 'int' || x.type === 'number') return { key, label: word(WORDS.pct_true, lang, x.label), type: 'percent', sql: sql`round(avg(${x.sql}) * 100.0, 1)`, dim: false };
        return fail(`"% yes" works on yes/no columns, and "${x.label}" is not one`);
    }
    return fail(`Unknown aggregate ${fn}`);
  }

  private addFilter(f: Filter) {
    const r = this.field(f.field);
    if (r.measure) fail(`"${r.label}" is a summary: use a condition on totals instead`);
    const lang = this.ctx.lang;
    const label = r.label;
    const values = f.value === undefined ? [] : Array.isArray(f.value) ? f.value : [f.value];
    const one = (): string | number | boolean => {
      if (f.value === undefined) return fail(`"${label}" needs a value`);
      if (Array.isArray(f.value)) return fail(`"${f.op}" takes one value`);
      return f.value;
    };
    const e = r.sql;
    const describe = (v: string) => this.filterText.push(`${label} ${word(OP_WORDS[f.op], lang)}${v ? ` ${v}` : ''}`);
    const show = (v: unknown) => (typeof v === 'boolean' ? word(v ? WORDS.yes : WORDS.no, lang) : String(v));

    switch (f.op) {
      case 'is_null':
        this.wheres.push(sql`${e} is null`);
        return describe('');
      case 'not_null':
        this.wheres.push(sql`${e} is not null`);
        return describe('');
      case 'is_true':
      case 'is_false':
        if (r.type !== 'bool') fail(`"${label}" is not a yes/no column`);
        this.wheres.push(f.op === 'is_true' ? sql`coalesce(${e}, false)` : sql`not coalesce(${e}, false)`);
        return describe('');
      case 'relative': {
        if (r.type !== 'date') fail(`"${label}" is not a date`);
        const v = one();
        if (!(RELATIVE as readonly string[]).includes(String(v))) fail(`"${String(v)}" is not a period; use ${RELATIVE.join(', ')}`);
        const range = relativeRange(v as Relative, this.ctx);
        if (range.from) this.wheres.push(sql`${e} >= ${range.from}::date`);
        if (range.to) this.wheres.push(sql`${e} <= ${range.to}::date`);
        return describe(`${word(RELATIVE_WORDS[v as Relative], lang)}${range.from && range.to ? ` (${range.from} – ${range.to})` : ''}`);
      }
      case 'contains':
      case 'not_contains':
      case 'starts_with': {
        const v = String(one());
        const esc = v.replace(/[\\%_]/g, '\\$&');
        const pat = f.op === 'starts_with' ? `${esc}%` : `%${esc}%`;
        this.wheres.push(f.op === 'not_contains' ? sql`coalesce(${e}::text, '') not ilike ${pat}` : sql`${e}::text ilike ${pat}`);
        return describe(`"${v}"`);
      }
      case 'in':
      case 'not_in':
      case 'eq':
      case 'neq': {
        if (f.op === 'in' || f.op === 'not_in') {
          if (values.length === 0) fail('The list of values is empty');
        } else one();
        // A picker sends record ids: compare the id, not the name.
        if (r.idSql && values.every((v) => typeof v === 'string' && UUID.test(v))) {
          const ids = values as string[];
          const neg = f.op === 'neq' || f.op === 'not_in';
          this.wheres.push(neg ? sql`(${r.idSql} is null or ${r.idSql} not in (${sql.join(ids.map((v) => sql`${v}::uuid`), sql`, `)}))` : sql`${r.idSql} in (${sql.join(ids.map((v) => sql`${v}::uuid`), sql`, `)})`);
          this.idFilters.push({ label, op: f.op, ids, field: r });
          return;
        }
        const vals = values.map((v) => this.scalar(r, v));
        if (r.type === 'bool' && vals.length === 1) {
          this.wheres.push(f.op === 'neq' ? sql`${e} is distinct from ${vals[0]}` : sql`${e} = ${vals[0]}`);
          return describe(show(values[0]));
        }
        const list = sql.join(vals.map((v) => (r.type === 'date' ? sql`${v}::date` : sql`${v}`)), sql`, `);
        this.wheres.push(f.op === 'eq' || f.op === 'in' ? sql`${e} in (${list})` : sql`(${e} is null or ${e} not in (${list}))`);
        return describe(values.map(show).join(', '));
      }
      case 'between': {
        if (values.length !== 2) fail(`"between" needs two values for "${label}"`);
        const [lo, hi] = values.map((v) => this.scalar(r, v));
        if (r.type === 'bool') fail('Yes/no columns cannot be between values');
        this.wheres.push(r.type === 'date' ? sql`${e} between ${lo}::date and ${hi}::date` : sql`${e} between ${lo} and ${hi}`);
        return describe(`${show(values[0])} – ${show(values[1])}`);
      }
      default: {
        const v = this.scalar(r, one());
        if (r.type === 'bool') fail('Yes/no columns can only be compared for equality');
        const cmp = { gt: '>', gte: '>=', lt: '<', lte: '<=' }[f.op];
        this.wheres.push(r.type === 'date' ? sql`${e} ${sql.raw(cmp)} ${v}::date` : sql`${e} ${sql.raw(cmp)} ${v}`);
        return describe(show(one()));
      }
    }
  }

  /** A filter value of the field's type; money is typed in rupees and stored in paise. */
  private scalar(x: Resolved, v: unknown): string | number | boolean {
    if (x.type === 'bool') {
      if (typeof v === 'boolean') return v;
      if (v === 'true' || v === 'false') return v === 'true';
      return fail(`"${x.label}" is yes or no`);
    }
    if (x.type === 'date') {
      if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) return fail(`"${x.label}" needs a date like 2026-10-15`);
      return v;
    }
    if (NUMERIC.includes(x.type)) {
      const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
      if (!Number.isFinite(n)) return fail(`"${x.label}" needs a number`);
      return x.type === 'money' ? Math.round(n * 100) : n;
    }
    return String(v);
  }

  /** `from … joins` with only the joins this query uses (and the joins those need). */
  fromSql(extraRaws: string[] = []): SQL {
    const ds = this.ds;
    const need = new Set<string>();
    const scan = (s: string) => {
      for (const j of ds.joins) if (new RegExp(`\\b${j.alias}\\.`).test(s)) need.add(j.alias);
    };
    [...this.raws, ...extraRaws].forEach(scan);
    let size = -1;
    while (size !== need.size) {
      size = need.size;
      for (const j of ds.joins) if (need.has(j.alias)) scan(j.sql);
    }
    const joins = ds.joins.filter((j) => need.has(j.alias)).map((j) => j.sql);
    return sql.raw([ds.from, ...joins].join(' '));
  }

  whereSql(): SQL {
    return sql.join(this.wheres, sql` and `);
  }

  /** ORDER BY for the main query: the requested sorts, else groupings in their natural order. */
  orderSql(outs: Output[], allowFields: boolean): SQL {
    const parts: SQL[] = [];
    for (const s of this.def.sort) {
      const o = outs.find((x) => x.key === s.field);
      if (o) {
        parts.push(sql`${sql.identifier(o.key)} ${sql.raw(s.dir)} nulls last`);
        continue;
      }
      const r = this.fields.get(s.field);
      if (r && !r.measure && allowFields && !this.aggregate) {
        this.field(s.field);
        parts.push(sql`${r.sql} ${sql.raw(s.dir)} nulls last`);
        continue;
      }
      // Summaries may sort by a number or date that is not shown (its lowest value per group): a funnel's stage order.
      if (r && !r.measure && this.aggregate && (NUMERIC.includes(r.type) || r.type === 'date')) {
        this.field(s.field);
        parts.push(sql`min(${r.sql}) ${sql.raw(s.dir)} nulls last`);
        continue;
      }
      fail(`Cannot sort by "${s.field}": it is not in the result`);
    }
    if (parts.length === 0) {
      const dims = outs.filter((o) => o.dim);
      for (const d of dims) parts.push(d.sortSql && this.aggregate ? sql`min(${d.sortSql}) asc nulls last, ${sql.identifier(d.key)} asc nulls last` : sql`${sql.identifier(d.key)} asc nulls last`);
      if (dims.length === 0 && outs[0]) parts.push(sql`${sql.identifier(outs[0].key)} asc nulls last`);
    }
    return sql.join(parts, sql`, `);
  }
}

// ----- running ----------------------------------------------------------------------------------------

const rowsOf = async (tx: Tx, q: SQL): Promise<Record<string, unknown>[]> => (await tx.execute(q)).rows as Record<string, unknown>[];

function cellOf(type: FieldType, v: unknown): Cell {
  if (v === null || v === undefined) return null;
  if (NUMERIC.includes(type)) return Number(v);
  if (type === 'bool') return typeof v === 'boolean' ? v : v === 't' || v === 'true';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return typeof v === 'boolean' ? v : String(v);
}

const selectOf = (outs: Output[]) => sql.join(outs.map((o) => sql`${o.type === 'date' ? sql`(${o.sql})::text` : o.sql} as ${sql.identifier(o.key)}`), sql`, `);
const groupOf = (n: number) => (n > 0 ? sql` group by ${sql.raw(Array.from({ length: n }, (_, i) => String(i + 1)).join(', '))}` : sql``);

const MAX_PIVOT = 40;

/** The institution's academic years, for "this academic year" filters. */
export async function academicYearsOf(tx: Tx): Promise<RunCtx['academicYears']> {
  const r = await rowsOf(tx, sql`select starts_on::text as f, ends_on::text as t, is_current as c from academic_years order by starts_on desc limit 20`);
  return r.map((x) => ({ from: String(x.f), to: String(x.t), current: x.c === true }));
}

/** Runs a definition as `who` and returns columns, rows, totals and the filters in words. */
export async function runDefinition(tx: Tx, ds: SemDataset, def: Definition, who: Caller, ctx: RunCtx, opts: RunOptions = {}): Promise<StudioResult> {
  const plan = new Plan(ds, def, who, ctx, opts);
  await tx.execute(sql`set local statement_timeout = 20000`);
  const limit = opts.limit ?? def.limit;
  const filters = [...plan.filterText, ...(await namedIdFilters(tx, plan))];
  const base = { dataset: { key: ds.key, label: ds.label[ctx.lang] }, filters, chart: def.chart ?? null, formatting: def.formatting };
  const where = plan.whereSql();

  if (!plan.aggregate) {
    const outs = plan.outputs;
    const order = plan.orderSql(outs, true);
    const from = plan.fromSql();
    const raw = await rowsOf(tx, sql`select ${selectOf(outs)} from ${from} where ${where} order by ${order} limit ${limit + 1}`);
    const rows = raw.slice(0, limit).map((r) => Object.fromEntries(outs.map((o) => [o.key, cellOf(o.type, r[o.key])])));
    // Totals of the money and count columns over every matching row, not only those shown.
    const sums = def.totals ? outs.filter((o) => o.type !== 'percent' && plan.fields.get(o.key)?.aggregatable) : [];
    let totals: Row | null = null;
    if (sums.length) {
      const [t] = await rowsOf(tx, sql`select ${sql.join(sums.map((o) => sql`sum(${o.sql}) as ${sql.identifier(o.key)}`), sql`, `)} from ${from} where ${where}`);
      totals = Object.fromEntries(outs.map((o, i) => [o.key, sums.includes(o) ? cellOf(o.type, t[o.key]) : i === 0 ? word(WORDS.total, ctx.lang) : null]));
    }
    return { ...base, columns: outs.map(col), rows, totals, truncated: raw.length > limit, pivot: null };
  }

  const groups = plan.groupOutputs;
  const measures = plan.measureOutputs;
  const having = plan.having.length ? sql` having ${sql.join(plan.having, sql` and `)}` : sql``;

  if (!plan.pivot) {
    const outs = plan.outputs;
    const from = plan.fromSql();
    const raw = await rowsOf(tx, sql`select ${selectOf(outs)} from ${from} where ${where}${groupOf(groups.length)}${having} order by ${plan.orderSql(outs, false)} limit ${limit + 1}`);
    const rows = raw.slice(0, limit).map((r) => Object.fromEntries(outs.map((o) => [o.key, cellOf(o.type, r[o.key])])));
    let totals: Row | null = null;
    if (def.totals && groups.length > 0 && plan.having.length === 0) {
      const [t] = await rowsOf(tx, sql`select ${selectOf(measures)} from ${from} where ${where}`);
      totals = Object.fromEntries(outs.map((o, i) => [o.key, o.dim ? (i === 0 ? word(WORDS.total, ctx.lang) : null) : cellOf(o.type, t?.[o.key])]));
    }
    return { ...base, columns: outs.map(col), rows, totals, truncated: raw.length > limit, pivot: null };
  }

  // A cross-tab: group by the rows and the pivot column, then spread the pivot values across.
  const pv = plan.pivot;
  const from = plan.fromSql();
  const pvSort = pv.sortSql ? sql`, min(${pv.sortSql}) as "__pv_sort"` : sql``;
  const all = [...groups, pv, ...measures];
  const raw = await rowsOf(tx, sql`select ${selectOf(all)}${pvSort} from ${from} where ${where}${groupOf(groups.length + 1)}${having} limit 50001`);
  if (raw.length > 50000) fail('This cross-tab has too many cells; add a filter or group by fewer columns');
  const order = new Map<string, number>();
  for (const r of raw) {
    const v = r[pv.key] === null ? '' : String(r[pv.key]);
    const s = r.__pv_sort === undefined || r.__pv_sort === null ? 0 : Number(r.__pv_sort);
    order.set(v, Math.min(order.get(v) ?? Infinity, s));
  }
  const allValues = [...order.keys()].sort((a, b) => order.get(a)! - order.get(b)! || a.localeCompare(b, 'en', { numeric: true }));
  const values = allValues.slice(0, MAX_PIVOT);
  const blank = word(WORDS.empty, ctx.lang);
  const columns: OutColumn[] = groups.map(col);
  values.forEach((v, i) => {
    for (const m of measures) columns.push({ key: `${m.key}__p${i}`, label: measures.length === 1 ? v || blank : `${v || blank} · ${m.label}`, type: m.type, kind: kindOf(m.type), dim: false, pivotValue: v, measure: m.key });
  });
  for (const m of measures) columns.push({ key: `${m.key}__total`, label: measures.length === 1 ? word(WORDS.total, ctx.lang) : `${word(WORDS.total, ctx.lang)} · ${m.label}`, type: m.type, kind: kindOf(m.type), dim: false, measure: m.key });

  const rowKey = (r: Record<string, unknown>) => JSON.stringify(groups.map((g) => r[g.key] ?? null));
  const byRow = new Map<string, Row>();
  for (const r of raw) {
    const k = rowKey(r);
    let row = byRow.get(k);
    if (!row) {
      row = Object.fromEntries(groups.map((g) => [g.key, cellOf(g.type, r[g.key])]));
      byRow.set(k, row);
    }
    const i = values.indexOf(r[pv.key] === null ? '' : String(r[pv.key]));
    if (i < 0) continue;
    for (const m of measures) row[`${m.key}__p${i}`] = cellOf(m.type, r[m.key]);
  }
  // Row totals and the grand total come from SQL, so averages and distinct counts are right too.
  const rowTotals = groups.length ? await rowsOf(tx, sql`select ${selectOf([...groups, ...measures])} from ${from} where ${where}${groupOf(groups.length)}`) : [];
  for (const t of rowTotals) {
    const row = byRow.get(rowKey(t));
    if (row) for (const m of measures) row[`${m.key}__total`] = cellOf(m.type, t[m.key]);
  }
  let rows = [...byRow.values()];
  if (groups.length === 0) rows = [Object.fromEntries(columns.map((c) => [c.key, null]))];
  // Sorting a cross-tab: by a grouping, or by a total; else the groupings' natural order.
  const sorts = def.sort.length ? def.sort : groups.map((g) => ({ field: g.key, dir: 'asc' as const }));
  const groupOrder = groups.length ? await groupSortKeys(tx, plan, from, where) : new Map<string, number>();
  rows.sort((a, b) => {
    for (const s of sorts) {
      const key = columns.some((c) => c.key === s.field) ? s.field : measures.some((m) => m.key === s.field) ? `${s.field}__total` : null;
      if (!key) continue;
      const g = groups.find((x) => x.key === key);
      const av = g?.sortSql ? (groupOrder.get(`${g.key}|${String(a[key])}`) ?? 0) : a[key];
      const bv = g?.sortSql ? (groupOrder.get(`${g.key}|${String(b[key])}`) ?? 0) : b[key];
      const c = compareCells(av, bv);
      if (c) return s.dir === 'desc' ? -c : c;
    }
    return 0;
  });
  const truncated = rows.length > limit;
  rows = rows.slice(0, limit);
  let totals: Row | null = null;
  if (def.totals) {
    const colTotals = await rowsOf(tx, sql`select ${selectOf([pv, ...measures])} from ${from} where ${where}${groupOf(1)}`);
    const [grand] = await rowsOf(tx, sql`select ${selectOf(measures)} from ${from} where ${where}`);
    totals = Object.fromEntries(columns.map((c, i) => [c.key, i === 0 && groups.length ? word(WORDS.total, ctx.lang) : null]));
    for (const t of colTotals) {
      const i = values.indexOf(t[pv.key] === null ? '' : String(t[pv.key]));
      if (i >= 0) for (const m of measures) totals[`${m.key}__p${i}`] = cellOf(m.type, t[m.key]);
    }
    for (const m of measures) totals[`${m.key}__total`] = cellOf(m.type, grand?.[m.key]);
    if (groups.length === 0) {
      rows = [totals];
      totals = null;
    }
  }
  return { ...base, columns, rows, totals, truncated, pivot: { column: pv.ref ?? pv.key, label: pv.label, truncated: allValues.length > MAX_PIVOT } };
}

function compareCells(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'en', { numeric: true });
}

/** The natural order of grouped values that have one (stages, ageing buckets, weekdays). */
async function groupSortKeys(tx: Tx, plan: Plan, from: SQL, where: SQL): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const g of plan.groupOutputs.filter((x) => x.sortSql)) {
    const r = await rowsOf(tx, sql`select ${g.sql} as v, min(${g.sortSql}) as s from ${from} where ${where} group by 1`);
    for (const x of r) out.set(`${g.key}|${String(x.v)}`, Number(x.s));
  }
  return out;
}

const col = (o: Output): OutColumn => ({ key: o.key, label: o.label, type: o.type, kind: kindOf(o.type), dim: o.dim });

/** Picker filters name their records ("Class is BCom Sem 3 A"), not their ids. */
async function namedIdFilters(tx: Tx, plan: Plan): Promise<string[]> {
  const out: string[] = [];
  for (const f of plan.idFilters) {
    const ids = f.ids.slice(0, 50);
    const r = await rowsOf(tx, sql`select distinct ${f.field.sql} as name from ${plan.fromSql(f.field.raw)} where ${f.field.idSql!} in (${sql.join(ids.map((v) => sql`${v}::uuid`), sql`, `)}) and ${sql.raw(`${plan.ds.base}.tenant_id`)} = ${plan.who.tenantId}::uuid limit 50`);
    const names = r.map((x) => String(x.name)).sort();
    out.push(`${f.label} ${word(OP_WORDS[f.op], plan.ctx.lang)} ${names.join(', ') || '-'}`);
  }
  return out;
}

/** The values a field takes (for filter pickers), as `{ value, label }`: ids for record pickers. */
export async function fieldValues(tx: Tx, ds: SemDataset, key: string, who: Caller, ctx: RunCtx, q?: string): Promise<{ value: string; label: string }[]> {
  const plan = new Plan(ds, { ...DefinitionSchema.parse({}), columns: [key] }, who, ctx);
  const r = plan.field(key);
  if (r.type === 'bool') return [{ value: 'true', label: word(WORDS.yes, ctx.lang) }, { value: 'false', label: word(WORDS.no, ctx.lang) }];
  if (r.measure) fail('A summary formula has no list of values');
  const search = q?.trim() ? sql` and (${r.sql})::text ilike ${`%${q.trim().replace(/[\\%_]/g, '\\$&')}%`}` : sql``;
  await tx.execute(sql`set local statement_timeout = 10000`);
  const id = r.idSql ? sql`(${r.idSql})::text` : sql`(${r.sql})::text`;
  const rows = await rowsOf(tx, sql`select ${id} as value, (${r.sql})::text as label from ${plan.fromSql()} where ${plan.whereSql()} and (${r.sql}) is not null${search} group by 1, 2 order by 2 limit 300`);
  return rows.map((x) => ({ value: String(x.value), label: String(x.label) }));
}

/** Checks a definition without running it (save, schedule): 400/403 when it would not run. */
export function validateDefinition(ds: SemDataset, def: Definition, who: Caller, ctx: RunCtx): Plan {
  return new Plan(ds, def, who, ctx);
}

/** The fields a definition reads, for checking that the people a report is sent to may see them all. */
export function fieldsUsed(ds: SemDataset, def: Definition): SemField[] {
  const keys = new Set<string>();
  const add = (k?: string) => k && keys.add(k.split(':')[0]);
  def.columns.forEach(add);
  def.groupBy.forEach(add);
  add(def.pivot?.column);
  def.filters.forEach((f) => add(f.field));
  def.aggregates.forEach((a) => add(a.field));
  if (!def.groupBy.length && !def.aggregates.length && !def.pivot && !def.columns.length) ds.detail.forEach(add);
  for (const c of def.calculated) for (const m of c.expr.toLowerCase().matchAll(/[a-z_][a-z0-9_]*/g)) add(m[0]);
  return ds.fields.filter((x) => keys.has(x.key));
}

/** The people (by roles) a definition may be shown to: every role that may use the dataset and see every field it reads. */
export function rolesAllowed(ds: SemDataset, def: Definition): RoleName[] {
  const used = fieldsUsed(ds, def);
  return ds.roles.filter((r) => used.every((x) => maySeeField(x, [r])));
}
