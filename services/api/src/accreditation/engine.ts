// The accreditation engine: for a framework and the academic year a submission ends with, every metric's inputs year by
// year (entered by hand, read from the data template rows, or computed live from ERP data), the year values and the filed
// value by the metric's rule, the score, completeness and the criterion and framework estimates.
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { accreditationEntries, accreditationSettings, dvvQueries } from '../db/schema-accreditation.js';
import { obeEvidence } from '../db/schema.js';
import { computeAuto } from './auto.js';
import { metricsOf } from './frameworks/index.js';
import { naacGrade } from './frameworks/naac.js';
import type { FlatMetric, FrameworkDef, InputDef } from './frameworks/types.js';
import { SourceCache, windowOf, type AcademicYear } from './sources.js';

type Entry = typeof accreditationEntries.$inferSelect;
export type InputSource = 'manual' | 'rows' | 'auto' | 'none';

export interface YearInput {
  key: string;
  value: number | null;
  source: InputSource;
  /** Records behind an automatic value (count only here; the metric detail lists them). */
  records: number;
}
export interface YearCell {
  year: string;
  /** Inside the years the metric covers. */
  required: boolean;
  entryId: string | null;
  inputs: YearInput[];
  value: number | null;
  /** 'manual' when a figure was entered for the year, 'computed' from the inputs, 'none'. */
  source: 'manual' | 'computed' | 'none';
  /** The year has data that the institution or the ERP actually holds (not just zero from empty tables). */
  hasData: boolean;
  rows: number;
  evidence: number;
}

export interface MetricResult {
  code: string;
  criterion: string;
  indicator: string;
  kind: 'QnM' | 'QlM';
  title: string;
  unit: string;
  weight: number;
  formula: string;
  combine: string;
  yearsRequired: number;
  bench: number | null;
  dir: 'high' | 'low';
  inputs: { key: string; label: string; auto: boolean; source: string | null }[];
  columns: string[];
  evidenceRequired: string[];
  options: { labels: string[]; selected: number[] | null } | null;
  years: YearCell[];
  /** The filed value from the year values by the metric's rule. */
  value: number | null;
  valueSource: 'manual' | 'auto' | 'mixed' | 'none';
  /** The inputs as combined for the filed value (summed, averaged, pooled or the latest year's). */
  combinedInputs: Record<string, number>;
  narrative: string;
  autoNarrative: string;
  selfScore: number | null;
  note: string;
  /** NAAC points out of 4, NBA and NIRF marks out of the metric's weight. */
  score: number | null;
  maxScore: number;
  evidence: number;
  completeness: number;
  complete: boolean;
  task: { id: string; status: string; ownerId: string | null; ownerName: string | null; departmentId: string | null; departmentName: string | null; dueOn: string | null; scope: string } | null;
  dvvOpen: number;
}

export interface CriterionResult {
  id: string;
  title: string;
  weight: number;
  metrics: number;
  complete: number;
  completeness: number;
  scored: number;
  /** NAAC: grade point (0-4) over scored metrics; NBA: marks; NIRF: parameter score out of 100. */
  score: number | null;
  /** NAAC: grade point counting unscored metrics as zero; NBA and NIRF: maximum marks. */
  floor: number | null;
  max: number;
  indicators: { id: string; title: string; weight: number; metrics: string[] }[];
}

export interface Estimate {
  scoring: FrameworkDef['scoring'];
  /** NAAC CGPA over scored metrics, NBA marks, NIRF score out of 100. */
  value: number | null;
  /** NAAC CGPA counting unscored metrics as zero; NBA and NIRF the same figure with unscored metrics at zero. */
  floor: number | null;
  max: number;
  grade: string | null;
  floorGrade: string | null;
  /**
   * NAAC binary accreditation readiness: the data set is complete and the floor CGPA clears the qualifying 1.51. Reasons are
   * codes: ep:<metrics> (extended profile incomplete), qn:<n> (quantitative metrics short of years), ql:<n> (narratives
   * missing), ev:<n> (metrics without evidence), floor (floor CGPA below 1.51).
   */
  binary: { ready: boolean; reasons: string[] } | null;
}

export interface Assessment {
  framework: { key: string; title: string; body: string; variant: string; source: string; scoring: string; years: number };
  cycle: string;
  window: string[];
  criteria: CriterionResult[];
  metrics: MetricResult[];
  completeness: { complete: number; total: number; percent: number };
  estimate: Estimate;
}

const r2 = (v: number | null) => (v === null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);
const r4 = (v: number | null) => (v === null || !Number.isFinite(v) ? null : Math.round(v * 10000) / 10000);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** The academic year in force on a date (June to May), for example 2026-27. */
export const cycleOn = (d: Date): string => {
  const y = d.getUTCMonth() >= 5 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
};

/** A number read from a data template cell ("1,20,000.50" or "12 lakhs"). */
const cellNumber = (s: unknown): number | null => {
  if (s === null || s === undefined) return null;
  const m = /-?\d+(\.\d+)?/.exec(String(s).replace(/,/g, ''));
  return m ? Number(m[0]) : null;
};

/** An input of one year from the data template rows entered for that year. */
function fromRows(def: InputDef, columns: string[], rows: string[][]): number | null {
  if (!def.fromRows || !rows.length) return null;
  const op = def.fromRows;
  if (op.op === 'count') return rows.filter((r) => r.some((c) => String(c ?? '').trim() !== '')).length;
  const at = columns.findIndex((c) => c.toLowerCase() === op.column.toLowerCase());
  if (at < 0) return null;
  if (op.op === 'distinct') return new Set(rows.map((r) => String(r[at] ?? '').trim()).filter(Boolean)).size;
  return r4(rows.reduce((a, r) => a + (cellNumber(r[at]) ?? 0), 0));
}

/** The figure for one set of inputs. */
function apply(m: FlatMetric, inputs: Record<string, number>): number | null {
  if (m.calc) {
    const v = m.calc(inputs);
    return v === null || !Number.isFinite(v) ? null : r4(v);
  }
  if (m.inputs.length === 1) return inputs[m.inputs[0].key] ?? null;
  return null;
}

/** Score of a metric: NAAC points out of 4, NBA and NIRF marks out of the weight. */
export function scoreOf(f: FrameworkDef, m: FlatMetric & { bench?: number }, value: number | null, inputs: Record<string, number>, selfScore: number | null, weight: number): number | null {
  if (f.scoring === 'none') return null;
  const max = f.scoring === 'naac' ? 4 : weight;
  if (selfScore !== null) return r2(Math.max(0, Math.min(max, selfScore)));
  if (value === null) return null;
  if (m.marks) return r2(Math.max(0, Math.min(max, m.marks(value, m.bench, inputs, weight))));
  if (m.options) return r2(f.scoring === 'naac' ? Math.min(4, value) : (weight * value) / Math.max(1, m.options.length));
  if (m.bench === undefined || m.bench <= 0) return null;
  const ratio = m.dir === 'low' ? (value <= 0 ? 1 : m.bench / value) : value / m.bench;
  return r2(clamp01(ratio) * max);
}

export interface EngineOptions {
  /** Only these metric codes (a metric detail page); all when absent. */
  only?: string[];
  /** The academic year of today, so records without dates count in the current year only. */
  today: string;
}

/** Runs a framework for the window ending with `cycle`. */
export async function assess(tx: Tx, f: FrameworkDef, cycle: string, o: EngineOptions, cache = new SourceCache(tx)): Promise<Assessment> {
  const window = windowOf(cycle, f.years, o.today);
  const labels = window.map((y) => y.label);
  const all = metricsOf(f);
  const defs = o.only ? all.filter((m) => o.only!.includes(m.code)) : all;

  const [settings] = await tx.select().from(accreditationSettings).where(eq(accreditationSettings.framework, f.key));
  const benchOf = (m: FlatMetric) => settings?.bench?.[m.code] ?? m.bench;
  const weightOf = (m: FlatMetric) => settings?.weight?.[m.code] ?? m.weight;

  const entries = await tx.select().from(accreditationEntries).where(and(eq(accreditationEntries.body, f.key), inArray(accreditationEntries.cycle, labels)));
  const entryAt = new Map(entries.map((e) => [`${e.metricCode}@${e.cycle}`, e]));
  const evidence = entries.length
    ? await tx.select({ targetId: obeEvidence.targetId, n: sql<number>`count(*)::int` }).from(obeEvidence).where(and(eq(obeEvidence.scope, 'metric'), inArray(obeEvidence.targetId, entries.map((e) => e.id)))).groupBy(obeEvidence.targetId)
    : [];
  const evN = new Map(evidence.map((x) => [x.targetId, Number(x.n)]));
  const tasks = (await tx.execute(sql`select t.id, t.scope, t.status, t.owner_id, u.full_name as owner_name, t.department_id, d.name as department_name, t.due_on::text as due_on
      from accreditation_tasks t left join users u on u.id = t.owner_id left join departments d on d.id = t.department_id
      where t.framework = ${f.key} and t.cycle = ${cycle}`)).rows as Record<string, string | null>[];
  const taskBy = new Map(tasks.map((t) => [String(t.scope), t]));
  const dvv = await tx.select({ code: dvvQueries.metricCode, n: sql<number>`count(*)::int` }).from(dvvQueries).where(and(eq(dvvQueries.framework, f.key), eq(dvvQueries.cycle, cycle), inArray(dvvQueries.status, ['open', 'rejected']))).groupBy(dvvQueries.metricCode);
  const dvvN = new Map(dvv.map((d) => [d.code, Number(d.n)]));
  const narratives = await computeAuto(tx, [...new Set(defs.map((m) => m.narrative).filter((x): x is string => !!x))]);

  const metrics: MetricResult[] = [];
  for (const m of defs) {
    const weight = weightOf(m);
    const bench = benchOf(m);
    const required = new Set(labels.slice(-Math.min(m.years, labels.length)));
    const years: YearCell[] = [];
    for (const y of window) {
      const e: Entry | undefined = entryAt.get(`${m.code}@${y.label}`);
      const rows = ((e?.dataRows ?? []) as string[][]) || [];
      const inputs: YearInput[] = [];
      if (required.has(y.label) && !m.options && m.kind === 'QnM') {
        for (const def of m.inputs) inputs.push(await yearInput(cache, def, y, e, m.columns, rows));
      }
      const vals: Record<string, number> = {};
      for (const i of inputs) if (i.value !== null) vals[i.key] = i.value;
      const manual = num(e?.value);
      // A zero computed while an ERP input has no records for the year means "not recorded", not a real zero.
      const raw = inputs.length ? apply(m, vals) : null;
      const computed = raw === 0 && inputs.some((i) => i.source === 'auto' && i.records === 0) ? null : raw;
      const value = manual ?? computed;
      const hasData = manual !== null || inputs.some((i) => i.source === 'manual' || i.source === 'rows' || (i.source === 'auto' && i.records > 0));
      years.push({ year: y.label, required: required.has(y.label), entryId: e?.id ?? null, inputs, value: required.has(y.label) ? value : null, source: manual !== null ? 'manual' : computed !== null ? 'computed' : 'none', hasData: required.has(y.label) && value !== null && hasData, rows: rows.length, evidence: e ? (evN.get(e.id) ?? 0) : 0 });
    }

    const latestEntry = [...window].reverse().map((y) => entryAt.get(`${m.code}@${y.label}`)).find(Boolean);
    const cycleEntry = entryAt.get(`${m.code}@${cycle}`);
    const inScope = years.filter((c) => c.required);
    const { value, combined } = combine(m, inScope);
    const options = m.options ? ((cycleEntry?.options as number[] | null | undefined) ?? null) : null;
    const filed = m.options ? (options ? options.length : null) : m.kind === 'QlM' ? null : value;
    const narrativeText = cycleEntry?.textValue ?? latestEntry?.textValue ?? '';
    const auto = m.narrative ? (narratives.get(m.narrative)?.text ?? '') : '';
    const selfScore = num(cycleEntry?.selfScore);
    const score = scoreOf(f, { ...m, bench }, filed, combined, selfScore, weight);
    const evidenceCount = years.reduce((a, c) => a + c.evidence, 0);
    const dataShare = m.options ? (options !== null ? 1 : 0) : m.kind === 'QlM' ? (narrativeText.trim() ? 1 : 0) : inScope.length ? inScope.filter((c) => c.hasData).length / inScope.length : 0;
    const evidenceShare = m.evidence.length === 0 || evidenceCount > 0 ? 1 : 0;
    const completeness = Math.round(80 * dataShare + 20 * evidenceShare);
    const manualYears = inScope.filter((c) => c.source === 'manual' || c.inputs.some((i) => i.source === 'manual' || i.source === 'rows')).length;
    const autoYears = inScope.filter((c) => c.inputs.some((i) => i.source === 'auto' && i.records > 0)).length;
    const t = taskBy.get(m.code) ?? taskBy.get(m.criterion);
    metrics.push({
      code: m.code,
      criterion: m.criterion,
      indicator: m.indicator,
      kind: m.kind,
      title: m.title,
      unit: m.unit,
      weight,
      formula: m.formula,
      combine: m.combine,
      yearsRequired: required.size,
      bench: bench ?? null,
      dir: m.dir ?? 'high',
      inputs: m.inputs.map((i) => ({ key: i.key, label: i.label, auto: !!i.source, source: i.source ?? null })),
      columns: m.columns,
      evidenceRequired: m.evidence,
      options: m.options ? { labels: m.options, selected: options } : null,
      years,
      value: m.kind === 'QlM' ? null : filed,
      valueSource: m.kind === 'QlM' || filed === null ? (narrativeText ? 'manual' : 'none') : manualYears && autoYears ? 'mixed' : manualYears || m.options ? 'manual' : autoYears ? 'auto' : 'none',
      combinedInputs: combined,
      narrative: narrativeText,
      autoNarrative: auto,
      selfScore,
      note: cycleEntry?.note ?? '',
      score,
      maxScore: f.scoring === 'naac' ? 4 : f.scoring === 'none' ? 0 : weight,
      evidence: evidenceCount,
      completeness,
      complete: completeness === 100,
      task: t ? { id: String(t.id), status: String(t.status), ownerId: t.owner_id, ownerName: t.owner_name, departmentId: t.department_id, departmentName: t.department_name, dueOn: t.due_on, scope: String(t.scope) } : null,
      dvvOpen: dvvN.get(m.code) ?? 0,
    });
  }

  const criteria = f.criteria.map((c) => rollup(f, c, metrics));
  const done = metrics.filter((x) => x.complete).length;
  const percent = metrics.length ? Math.round((10 * metrics.reduce((a, x) => a + x.completeness, 0)) / metrics.length) / 10 : 0;
  return {
    framework: { key: f.key, title: f.title, body: f.body, variant: f.variant, source: f.source, scoring: f.scoring, years: f.years },
    cycle,
    window: labels,
    criteria,
    metrics,
    completeness: { complete: done, total: metrics.length, percent },
    estimate: estimateOf(f, criteria, metrics, o.only !== undefined),
  };
}

async function yearInput(cache: SourceCache, def: InputDef, y: AcademicYear, e: Entry | undefined, columns: string[], rows: string[][]): Promise<YearInput> {
  const manual = num((e?.inputs as Record<string, unknown> | undefined)?.[def.key]);
  if (manual !== null) return { key: def.key, value: manual, source: 'manual', records: 0 };
  const fr = fromRows(def, columns, rows);
  if (fr !== null) return { key: def.key, value: fr, source: 'rows', records: rows.length };
  if (def.source) {
    const s = await cache.get(def.source, y);
    return { key: def.key, value: s.value, source: s.value === null ? 'none' : 'auto', records: s.rows.length };
  }
  return { key: def.key, value: null, source: 'none', records: 0 };
}

/** The filed value and the combined inputs from the years in scope. */
function combine(m: FlatMetric, cells: YearCell[]): { value: number | null; combined: Record<string, number> } {
  const withValue = cells.filter((c) => c.value !== null);
  const inputsOf = (c: YearCell) => Object.fromEntries(c.inputs.filter((i) => i.value !== null).map((i) => [i.key, i.value as number]));
  const merge = (how: (xs: number[], def?: InputDef) => number | null) => {
    const out: Record<string, number> = {};
    for (const def of m.inputs) {
      const xs = cells.map((c) => c.inputs.find((i) => i.key === def.key)?.value).filter((x): x is number => x !== null && x !== undefined);
      const v = xs.length ? how(xs, def) : null;
      if (v !== null) out[def.key] = v;
    }
    return out;
  };
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const mean = (xs: number[]) => sum(xs) / xs.length;
  switch (m.combine) {
    case 'latest': {
      const last = withValue[withValue.length - 1];
      return { value: last?.value ?? null, combined: last ? inputsOf(last) : {} };
    }
    case 'sum':
      return { value: withValue.length ? r4(sum(withValue.map((c) => c.value as number))) : null, combined: merge(sum) };
    case 'avg':
      return { value: withValue.length ? r4(mean(withValue.map((c) => c.value as number))) : null, combined: merge(mean) };
    case 'pool': {
      const pooled = merge((xs, def) => (def?.pool === 'avg' ? mean(xs) : def?.pool === 'latest' ? xs[xs.length - 1] : sum(xs)));
      const manualYears = withValue.filter((c) => c.source === 'manual');
      // A figure entered by hand for every year overrides pooling; otherwise the pooled inputs decide.
      if (manualYears.length && manualYears.length === withValue.length) return { value: r4(sum(manualYears.map((c) => c.value as number))), combined: pooled };
      return { value: apply(m, pooled), combined: pooled };
    }
  }
}

function rollup(f: FrameworkDef, c: FrameworkDef['criteria'][number], metrics: MetricResult[]): CriterionResult {
  const mine = metrics.filter((x) => x.criterion === c.id);
  const scored = mine.filter((x) => x.score !== null);
  const weightAll = mine.reduce((a, x) => a + x.weight, 0);
  const weightScored = scored.reduce((a, x) => a + x.weight, 0);
  let score: number | null = null;
  let floor: number | null = null;
  let max = c.weight;
  if (f.scoring === 'naac') {
    const pts = scored.reduce((a, x) => a + x.weight * (x.score as number), 0);
    score = weightScored ? r2(pts / weightScored) : null;
    floor = weightAll ? r2(pts / weightAll) : null;
    max = 4;
  } else if (f.scoring === 'nba' || f.scoring === 'nirf') {
    score = scored.length ? r2(scored.reduce((a, x) => a + (x.score as number), 0)) : null;
    floor = r2(scored.reduce((a, x) => a + (x.score as number), 0));
    max = f.scoring === 'nirf' ? weightAll : c.weight;
  }
  return {
    id: c.id,
    title: c.title,
    weight: c.weight,
    metrics: mine.length,
    complete: mine.filter((x) => x.complete).length,
    completeness: mine.length ? Math.round(mine.reduce((a, x) => a + x.completeness, 0) / mine.length) : 0,
    scored: scored.length,
    score,
    floor,
    max,
    indicators: c.indicators.map((k) => ({ id: k.id, title: k.title, weight: k.weight, metrics: k.metrics.map((x) => x.code).filter((code) => mine.some((y) => y.code === code)) })),
  };
}

function estimateOf(f: FrameworkDef, criteria: CriterionResult[], metrics: MetricResult[], partial: boolean): Estimate {
  if (f.scoring === 'naac') {
    const scored = metrics.filter((x) => x.score !== null && x.weight > 0);
    const pts = scored.reduce((a, x) => a + x.weight * (x.score as number), 0);
    const ws = scored.reduce((a, x) => a + x.weight, 0);
    const total = f.criteria.reduce((a, c) => a + c.weight, 0);
    const value = ws ? r2(pts / ws) : null;
    const floor = total ? r2(pts / total) : null;
    const reasons: string[] = [];
    if (!partial) {
      const ep = metrics.filter((x) => x.criterion === 'EP' && !x.complete).map((x) => x.code);
      if (ep.length) reasons.push(`ep:${ep.join(',')}`);
      const qn = metrics.filter((x) => x.criterion !== 'EP' && x.kind === 'QnM' && x.completeness < 80).length;
      if (qn) reasons.push(`qn:${qn}`);
      const ql = metrics.filter((x) => x.kind === 'QlM' && !x.narrative.trim()).length;
      if (ql) reasons.push(`ql:${ql}`);
      const ev = metrics.filter((x) => x.evidenceRequired.length && x.evidence === 0).length;
      if (ev) reasons.push(`ev:${ev}`);
      if ((floor ?? 0) < 1.51) reasons.push('floor');
    }
    return { scoring: 'naac', value, floor, max: 4, grade: naacGrade(value), floorGrade: naacGrade(floor), binary: partial ? null : { ready: reasons.length === 0, reasons } };
  }
  if (f.scoring === 'nba') {
    const v = r2(criteria.reduce((a, c) => a + (c.score ?? 0), 0));
    return { scoring: 'nba', value: criteria.some((c) => c.score !== null) ? v : null, floor: v, max: criteria.reduce((a, c) => a + c.weight, 0), grade: null, floorGrade: null, binary: null };
  }
  if (f.scoring === 'nirf') {
    const v = r2(criteria.reduce((a, c) => a + (c.weight * (c.score ?? 0)) / Math.max(1, c.max), 0));
    return { scoring: 'nirf', value: criteria.some((c) => c.score !== null) ? v : null, floor: v, max: 100, grade: null, floorGrade: null, binary: null };
  }
  return { scoring: 'none', value: null, floor: null, max: 0, grade: null, floorGrade: null, binary: null };
}

/** The records behind each automatic input of a metric for each year in scope (the drill-down). */
export async function drillDown(tx: Tx, f: FrameworkDef, m: FlatMetric, cycle: string, today: string, cache = new SourceCache(tx), limit = 500) {
  const window = windowOf(cycle, f.years, today).slice(-Math.min(m.years, f.years));
  const out: { year: string; input: string; label: string; columns: string[]; rows: (string | number | null)[][]; total: number }[] = [];
  const keys = new Set<string>();
  for (const y of window) {
    for (const i of m.inputs.filter((x) => x.source)) {
      const s = await cache.get(i.source!, y);
      out.push({ year: y.label, input: i.key, label: i.label, columns: s.columns, rows: s.rows.slice(0, limit), total: s.rows.length });
      keys.add(i.source!);
    }
    if (m.rowsSource && !keys.has(m.rowsSource)) {
      const s = await cache.get(m.rowsSource, y);
      out.push({ year: y.label, input: '', label: 'Records', columns: s.columns, rows: s.rows.slice(0, limit), total: s.rows.length });
    }
  }
  return out;
}

export type { Entry };
