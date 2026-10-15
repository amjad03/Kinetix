// The framework catalogue: every accreditation framework and statutory return ZYNETIX seeds, and lookup by key or alias.
import { NAAC_AFFILIATED, NAAC_AUTONOMOUS, NAAC_UNIVERSITY } from './naac.js';
import { NBA_UG_ENGG_T2 } from './nba.js';
import { NBA_PG_MGMT, NBA_UG_ENGG_T1 } from './nba-more.js';
import { AICTE_EOA, CBSE_OASIS, UGC_DISCLOSURE } from './regulatory.js';
import { NIRF_COLLEGE, NIRF_ENGINEERING, NIRF_MANAGEMENT, NIRF_PHARMACY, NIRF_UNIVERSITY } from './nirf.js';
import { AISHE_DCF2, UDISE_PLUS } from './returns.js';
import { flatten, type FlatMetric, type FrameworkDef } from './types.js';

export const FRAMEWORKS: FrameworkDef[] = [NAAC_AFFILIATED, NAAC_AUTONOMOUS, NAAC_UNIVERSITY, NBA_UG_ENGG_T2, NBA_UG_ENGG_T1, NBA_PG_MGMT, NIRF_COLLEGE, NIRF_UNIVERSITY, NIRF_ENGINEERING, NIRF_MANAGEMENT, NIRF_PHARMACY, AISHE_DCF2, UDISE_PLUS, AICTE_EOA, UGC_DISCLOSURE, CBSE_OASIS];

const BY_KEY = new Map<string, FrameworkDef>();
for (const f of FRAMEWORKS) {
  BY_KEY.set(f.key, f);
  for (const a of f.aliases ?? []) BY_KEY.set(a, f);
}
const FLAT = new Map(FRAMEWORKS.map((f) => [f.key, flatten(f)]));

/** The framework for a key or an older alias (naac, nba, nirf, aishe, udise); undefined when unknown. */
export const framework = (key: string): FrameworkDef | undefined => BY_KEY.get(key);
export const metricsOf = (f: FrameworkDef): FlatMetric[] => FLAT.get(f.key)!;

/** A catalogue summary for pickers: key, title, body, variant and counts. */
export const catalogueList = () =>
  FRAMEWORKS.map((f) => {
    const ms = metricsOf(f);
    return { key: f.key, body: f.body, title: f.title, variant: f.variant, source: f.source, scoring: f.scoring, years: f.years, criteria: f.criteria.filter((c) => c.id !== 'EP').length, metrics: ms.length, quantitative: ms.filter((m) => m.kind === 'QnM').length, qualitative: ms.filter((m) => m.kind === 'QlM').length, weight: f.criteria.reduce((a, c) => a + c.weight, 0) };
  });

/** The framework tree as JSON: criteria, key indicators and metrics with their type, formula, inputs, template columns, evidence and weight. */
export const catalogueTree = (f: FrameworkDef, override: { weight?: Record<string, number>; bench?: Record<string, number> } = {}) => ({
  key: f.key,
  body: f.body,
  title: f.title,
  variant: f.variant,
  source: f.source,
  scoring: f.scoring,
  years: f.years,
  criteria: f.criteria.map((c) => ({
    id: c.id,
    title: c.title,
    weight: c.weight,
    indicators: c.indicators.map((k) => ({
      id: k.id,
      title: k.title,
      weight: k.weight,
      metrics: k.metrics.map((m) => ({
        code: m.code,
        kind: m.kind,
        title: m.title,
        unit: m.unit,
        weight: override.weight?.[m.code] ?? m.weight,
        formula: m.formula,
        combine: m.combine,
        years: m.years,
        inputs: m.inputs.map((i) => ({ key: i.key, label: i.label, auto: !!i.source, source: i.source ?? null })),
        columns: m.columns,
        evidence: m.evidence,
        bench: override.bench?.[m.code] ?? m.bench ?? null,
        defaultBench: m.bench ?? null,
        dir: m.dir ?? 'high',
        options: m.options ?? null,
      })),
    })),
  })),
});

export type { FlatMetric, FrameworkDef };
