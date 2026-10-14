// The shape of an accreditation or statutory-return framework: framework -> criteria -> key indicators -> metrics.
// Catalogues live in code (one file per body) so a change to a manual is a reviewed code change with a test, and every
// tenant reads the same seed. Institutions override benchmarks and weights per framework (accreditation_settings).

export type Scoring = 'naac' | 'nba' | 'nirf' | 'none';
export type Body = 'naac' | 'nba' | 'nirf' | 'aishe' | 'udise' | 'aicte' | 'ugc' | 'cbse';

/** How the year-wise values of a metric become the one figure that is filed. */
export type Combine =
  /** Mean of the years that have a value (NAAC "average percentage ... during the last five years"). */
  | 'avg'
  /** Total over the years (NAAC "number of ... during the last five years"). */
  | 'sum'
  /** The latest year that has a value (ratios "for the latest completed academic year"). */
  | 'latest'
  /** Inputs summed over the years first, then the formula applied once (papers per teacher over five years). */
  | 'pool';

export interface InputDef {
  key: string;
  label: string;
  /** Key of a live ERP source (sources.ts) that fills this input for a year; absent = entered by hand. */
  source?: string;
  /** When rows of the metric's data template are entered for a year, the input is read from them: their count, or the sum of a column. */
  fromRows?: { op: 'count' } | { op: 'sum'; column: string } | { op: 'distinct'; column: string };
  /** For metrics combined with 'pool': how the input's years merge (default the total; 'avg' for denominators such as teachers). */
  pool?: 'sum' | 'avg' | 'latest';
}

export interface MetricDef {
  code: string;
  kind: 'QnM' | 'QlM';
  title: string;
  unit: string;
  /** Marks for NBA and NIRF, metric weightage for NAAC (the metric weights of a framework add up to its total). */
  weight: number;
  /** The formula as the manual states it, for the person filling it in and the reviewer. */
  formula: string;
  inputs: InputDef[];
  /** The figure for one year (or for the pooled inputs) from the inputs; null when an input is missing. */
  calc?: (v: Record<string, number>) => number | null;
  combine: Combine;
  /** Years the metric covers, counted back from the cycle (5 for NAAC SSR five-year metrics, 1 for latest-year metrics). */
  years: number;
  /** Data template columns, in the order the official template lists them. */
  columns: string[];
  /** Documents the institution uploads as evidence. */
  evidence: string[];
  /** Value that earns the full points or marks. */
  bench?: number;
  /** 'low' when a smaller figure is better (ratios, days). */
  dir?: 'high' | 'low';
  /** Choice metrics (NAAC "A. All of the above ... E. None"): the items ticked. */
  options?: string[];
  /** Key of an ERP narrative (auto.ts) that helps write a qualitative metric. */
  narrative?: string;
  /** Source key whose records fill the data template rows for a year (drill-down and SSR template export). */
  rowsSource?: string;
  /**
   * Score from the filed value: marks out of `weight` for NBA and NIRF, points out of 4 for NAAC. `inputs` are the combined
   * inputs (pooled or latest). Without it NAAC scores against `bench` or the options ticked, NBA and NIRF linearly against `bench`.
   */
  marks?: (value: number, bench: number | undefined, inputs: Record<string, number>, weight: number) => number;
}

export interface IndicatorDef {
  id: string;
  title: string;
  /** Sum of its metrics' weights (filled by `define`). */
  weight: number;
  metrics: MetricDef[];
}

export interface CriterionDef {
  id: string;
  title: string;
  /** NAAC criterion weightage, NBA criterion marks, NIRF parameter weight in percent; 0 for unscored blocks (extended profile, returns). */
  weight: number;
  indicators: IndicatorDef[];
}

export interface FrameworkDef {
  key: string;
  body: Body;
  title: string;
  /** Institution type or category the catalogue is for. */
  variant: string;
  /** Manual or methodology the numbering and formulas follow. */
  source: string;
  scoring: Scoring;
  /** Years a full submission covers (the window of the year-wise grid). */
  years: number;
  criteria: CriterionDef[];
  /** Earlier keys that still resolve to this framework. */
  aliases?: string[];
}

/** A metric with its place in the tree, as the engine and exports use it. */
export interface FlatMetric extends MetricDef {
  criterion: string;
  indicator: string;
}

export const flatten = (f: FrameworkDef): FlatMetric[] => f.criteria.flatMap((c) => c.indicators.flatMap((k) => k.metrics.map((m) => ({ ...m, criterion: c.id, indicator: k.id }))));

// ---- builders shared by the catalogues -----------------------------------------------------------------------------

type MetricOpts = Partial<Omit<MetricDef, 'code' | 'kind' | 'title' | 'unit' | 'weight'>>;

/** A quantitative metric. Defaults: five-year average, no inputs (entered as a figure per year). */
export const qn = (code: string, title: string, unit: string, weight: number, o: MetricOpts = {}): MetricDef => ({
  code,
  kind: 'QnM',
  title,
  unit,
  weight,
  formula: o.formula ?? title,
  inputs: o.inputs ?? [{ key: 'value', label: title }],
  calc: o.calc ?? (o.inputs ? undefined : (v) => v.value ?? null),
  combine: o.combine ?? 'avg',
  years: o.years ?? 5,
  columns: o.columns ?? ['Year', 'Particulars', 'Number or amount', 'Link to the relevant document'],
  evidence: o.evidence ?? ['Any additional information'],
  ...o,
});

/** A qualitative metric: a narrative of up to about 500 words with its supporting documents. */
export const ql = (code: string, title: string, weight: number, o: MetricOpts = {}): MetricDef => ({
  code,
  kind: 'QlM',
  title,
  unit: '',
  weight,
  formula: 'Descriptive: up to 500 words, assessed by the peer team',
  inputs: [],
  combine: 'latest',
  years: 1,
  columns: [],
  evidence: o.evidence ?? ['Upload any additional information', 'Link for additional information'],
  ...o,
});

/** A NAAC choice metric ("A. Any 4 or all of the above ... E. None of the above"). */
export const choice = (code: string, title: string, weight: number, options: string[], o: MetricOpts = {}): MetricDef => ({
  code,
  kind: 'QnM',
  title,
  unit: 'options',
  weight,
  formula: `Options ticked out of ${options.length}: A = ${Math.min(4, options.length)} or more (4 points), B = 3, C = 2, D = 1, E = none (0)`,
  inputs: [],
  combine: 'latest',
  years: 1,
  columns: ['Option', 'Available (Yes/No)', 'Link to the relevant document'],
  evidence: o.evidence ?? ['Upload supporting documents for each option ticked'],
  options,
  ...o,
});

/** A percentage of one input over another (both summed when pooled). */
export const pct = (num: string, den: string) => (v: Record<string, number>) => (v[den] ? (100 * (v[num] ?? 0)) / v[den] : null);
/** One input over another. */
export const per = (num: string, den: string) => (v: Record<string, number>) => (v[den] ? (v[num] ?? 0) / v[den] : null);

/** Builds a framework from criteria whose indicator weights are the sum of their metric weights. */
export function define(f: Omit<FrameworkDef, 'criteria'> & { criteria: { id: string; title: string; weight?: number; indicators: { id: string; title: string; metrics: MetricDef[] }[] }[] }): FrameworkDef {
  return {
    ...f,
    criteria: f.criteria.map((c) => {
      const indicators = c.indicators.map((k) => ({ ...k, weight: k.metrics.reduce((a, m) => a + m.weight, 0) }));
      return { id: c.id, title: c.title, weight: c.weight ?? indicators.reduce((a, k) => a + k.weight, 0), indicators };
    }),
  };
}
