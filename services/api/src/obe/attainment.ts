/**
 * OBE attainment maths. Pure functions: the service gathers evidence, these turn it into levels.
 * Nothing here is an accreditor's constant; every number comes from the framework configuration.
 *
 * Direct CO attainment (per evidence kind, e.g. CIE and SEE, then weighted):
 *   1. per student, pool the marks of every assessment item of that kind mapped to the CO;
 *   2. a student attains the CO when they score ≥ `studentThresholdPercent` of those marks;
 *   3. the share of students who attain gives the level through `levels`
 *      (e.g. ≥70% of students → 3, ≥60% → 2, ≥50% → 1, else 0);
 *   4. direct = Σ(kind weight × kind level) ÷ Σ weights of the kinds that have evidence.
 * Indirect: each survey's mean rating is scaled to the level scale (mean ÷ scale max × level max),
 *   surveys under their minimum response count are ignored, the rest are weight-averaged.
 * Combined = directWeight × direct + indirectWeight × indirect (direct only when no survey qualifies).
 * PO/PSO = Σ(mapping strength × CO attainment) ÷ Σ strength over every mapped CO of the program.
 */

export interface LevelRule {
  level: number;
  /** Minimum percentage of students attaining the threshold for this level. */
  minStudentsPercent: number;
}

export interface AttainmentConfig {
  /** Percentage of the mapped marks a student must score to attain the outcome. */
  studentThresholdPercent: number;
  levels: LevelRule[];
  /** Weight of each evidence kind in direct attainment, e.g. { internal: 30, external: 70 }. */
  evidenceWeights: Record<string, number>;
  directWeight: number;
  indirectWeight: number;
  /** The level the scale tops out at (3 on a 0–3 scale). */
  maxLevel: number;
  /** Target attainment level for COs and POs. */
  targetLevel: number;
  decimals: number;
}

export const DEFAULT_ATTAINMENT_CONFIG: AttainmentConfig = {
  studentThresholdPercent: 60,
  levels: [
    { level: 3, minStudentsPercent: 70 },
    { level: 2, minStudentsPercent: 60 },
    { level: 1, minStudentsPercent: 50 },
  ],
  evidenceWeights: { internal: 30, external: 70 },
  directWeight: 80,
  indirectWeight: 20,
  maxLevel: 3,
  targetLevel: 2,
  decimals: 2,
};

const round = (n: number, d: number) => Math.round((n + Number.EPSILON) * 10 ** d) / 10 ** d;

export interface EvidenceItem {
  /** Assessment (or question) the marks come from. */
  sourceId: string;
  label: string;
  /** Evidence kind: internal / external / practical / project / viva. */
  kind: string;
  /** Marks of this item that count towards the CO, per student (absent = 0 of max). */
  scores: { studentId: string; scored: number | null; max: number }[];
}

export interface KindAttainment {
  kind: string;
  students: number;
  attained: number;
  percentAttained: number;
  averagePercent: number;
  level: number;
  weight: number;
}

export interface DirectAttainment {
  level: number | null;
  byKind: KindAttainment[];
  /** Items whose students mostly missed the threshold (weak questions/assessments). */
  weakItems: { sourceId: string; label: string; percentAttained: number }[];
}

export function levelFor(config: AttainmentConfig, percentStudents: number): number {
  const rule = [...config.levels].sort((a, b) => b.level - a.level).find((r) => percentStudents + 1e-9 >= r.minStudentsPercent);
  return rule ? rule.level : 0;
}

function pooled(items: EvidenceItem[], threshold: number) {
  const per = new Map<string, { scored: number; max: number }>();
  for (const it of items)
    for (const s of it.scores) {
      const p = per.get(s.studentId) ?? { scored: 0, max: 0 };
      p.scored += s.scored ?? 0;
      p.max += s.max;
      per.set(s.studentId, p);
    }
  const rows = [...per.values()].filter((p) => p.max > 0);
  const attained = rows.filter((p) => (p.scored / p.max) * 100 + 1e-9 >= threshold).length;
  const avg = rows.length ? rows.reduce((s, p) => s + p.scored / p.max, 0) / rows.length : 0;
  return { students: rows.length, attained, percentAttained: rows.length ? (attained / rows.length) * 100 : 0, averagePercent: avg * 100 };
}

export function directAttainment(items: EvidenceItem[], config: AttainmentConfig): DirectAttainment {
  const kinds = [...new Set(items.map((i) => i.kind))].sort();
  const byKind: KindAttainment[] = [];
  for (const kind of kinds) {
    const weight = config.evidenceWeights[kind] ?? 0;
    const p = pooled(
      items.filter((i) => i.kind === kind),
      config.studentThresholdPercent,
    );
    if (p.students === 0) continue;
    byKind.push({
      kind,
      students: p.students,
      attained: p.attained,
      percentAttained: round(p.percentAttained, 2),
      averagePercent: round(p.averagePercent, 2),
      level: levelFor(config, p.percentAttained),
      weight,
    });
  }
  const weighted = byKind.filter((k) => k.weight > 0);
  const totalWeight = weighted.reduce((s, k) => s + k.weight, 0);
  const level = totalWeight === 0 ? null : round(weighted.reduce((s, k) => s + k.weight * k.level, 0) / totalWeight, config.decimals);
  const weakItems = items
    .map((i) => ({ sourceId: i.sourceId, label: i.label, percentAttained: round(pooled([i], config.studentThresholdPercent).percentAttained, 2) }))
    .filter((i) => levelFor(config, i.percentAttained) < config.targetLevel)
    .sort((a, b) => a.percentAttained - b.percentAttained);
  return { level, byKind, weakItems };
}

export interface SurveyEvidence {
  surveyId: string;
  title: string;
  /** Mean rating and its scale (e.g. 4.2 on 1–5). */
  meanRating: number;
  scaleMax: number;
  responses: number;
  minResponses: number;
  weight: number;
}

export function indirectAttainment(surveys: SurveyEvidence[], config: AttainmentConfig): { level: number | null; used: string[]; skipped: string[] } {
  const ok = surveys.filter((s) => s.responses >= s.minResponses && s.scaleMax > 0 && s.weight > 0);
  const skipped = surveys.filter((s) => !ok.includes(s)).map((s) => s.surveyId);
  const w = ok.reduce((s, x) => s + x.weight, 0);
  if (w === 0) return { level: null, used: [], skipped };
  const level = ok.reduce((s, x) => s + x.weight * (x.meanRating / x.scaleMax) * config.maxLevel, 0) / w;
  return { level: round(level, config.decimals), used: ok.map((s) => s.surveyId), skipped };
}

export function combinedAttainment(direct: number | null, indirect: number | null, config: AttainmentConfig): number | null {
  if (direct === null && indirect === null) return null;
  if (indirect === null) return direct;
  if (direct === null) return indirect;
  const w = config.directWeight + config.indirectWeight;
  return round((config.directWeight * direct + config.indirectWeight * indirect) / w, config.decimals);
}

/** PO/PSO attainment from mapped CO attainments: Σ(strength × CO) ÷ Σ strength. COs without attainment are left out (and reduce coverage). */
export function programOutcomeAttainment(cells: { coId: string; strength: number; coAttainment: number | null }[], config: AttainmentConfig): { level: number | null; coverage: number; contributors: number } {
  const mapped = cells.filter((c) => c.strength > 0);
  const known = mapped.filter((c) => c.coAttainment !== null);
  const strength = known.reduce((s, c) => s + c.strength, 0);
  return {
    level: strength === 0 ? null : round(known.reduce((s, c) => s + c.strength * (c.coAttainment as number), 0) / strength, config.decimals),
    coverage: mapped.length === 0 ? 0 : round((known.length / mapped.length) * 100, 1),
    contributors: known.length,
  };
}

export interface Gap {
  target: number;
  actual: number | null;
  /** Target − actual (positive = short of the target), null when nothing was measured. */
  gap: number | null;
  met: boolean;
}

export function gapFor(actual: number | null, target: number, decimals = 2): Gap {
  if (actual === null) return { target, actual, gap: null, met: false };
  const gap = round(target - actual, decimals);
  return { target, actual, gap, met: gap <= 0 };
}

/** Trend between two snapshots of the same outcome. */
export function trend(previous: number | null | undefined, current: number | null): 'up' | 'down' | 'flat' | 'new' {
  if (previous === null || previous === undefined || current === null) return 'new';
  if (Math.abs(current - previous) < 0.005) return 'flat';
  return current > previous ? 'up' : 'down';
}

export function validateConfig(c: AttainmentConfig): string | null {
  if (c.levels.length === 0) return 'Add at least one attainment level';
  if (c.levels.some((l) => l.level > c.maxLevel || l.level < 0)) return 'Attainment levels must be within the scale';
  if (c.directWeight < 0 || c.indirectWeight < 0 || c.directWeight + c.indirectWeight === 0) return 'Direct and indirect weights must be positive';
  if (c.targetLevel > c.maxLevel) return 'The target cannot be above the top level';
  if (c.studentThresholdPercent <= 0 || c.studentThresholdPercent > 100) return 'The student threshold must be a percentage';
  return null;
}
