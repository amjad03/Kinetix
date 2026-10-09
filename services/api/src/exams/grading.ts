/**
 * Result maths: component scores → subject percentage → grade and grade point → SGPA/CGPA.
 * Pure functions, no database, so the rules can be tested against known values.
 *
 * Everything that differs between boards and universities is configuration:
 * - the components of a subject and their weights (Bangalore University NEP: IA 40 + SEE 60;
 *   CBSE: periodic tests 10 + notebook 5 + enrichment 5 + annual exam 80),
 * - pass minimums per component kind and overall,
 * - the grade scale (bands of percentages) and how grade points are derived
 *   (`band`: the band's point; `percentOver10`: percentage ÷ 10, as BU NEP marks cards print it).
 */

export type ComponentKind = 'internal' | 'external' | 'practical' | 'project' | 'viva' | 'observation' | 'diagnostic' | 'skill';

export interface GradeBand {
  grade: string;
  /** Lowest percentage (inclusive) for this band. */
  minPercent: number;
  gradePoint: number;
  /** False for the failing band(s). */
  pass: boolean;
}

export interface GradeScaleRules {
  bands: GradeBand[];
  pointsMode: 'band' | 'percentOver10';
  /** Decimal places for SGPA/CGPA (2 for most universities). */
  decimals: number;
}

export interface SchemeComponent {
  id: string;
  code: string;
  name: string;
  kind: ComponentKind;
  /** Share of the subject's 100 (weights of a scheme add up to 100). */
  weight: number;
}

export interface PassRules {
  /** Minimum percentage of the internal (non-external) weight, null = none. */
  minInternalPercent: number | null;
  /** Minimum percentage in the external components, null = none. */
  minExternalPercent: number | null;
  /** Minimum overall percentage. */
  minTotalPercent: number;
}

/** Marks a student got in the assessments that make up one component. */
export interface ComponentEvidence {
  componentId: string;
  /** One entry per assessment in the component; absent = scored 0 of max. */
  entries: { scored: number | null; max: number; absent: boolean }[];
}

export interface ComponentResult {
  componentId: string;
  code: string;
  name: string;
  kind: ComponentKind;
  weight: number;
  /** Fraction of the component's maximum (0–1), null when nothing was assessed yet. */
  fraction: number | null;
  /** Weighted contribution to the subject's 100. */
  weighted: number;
}

export interface SubjectResult {
  percent: number;
  grade: string;
  gradePoint: number;
  passed: boolean;
  /** Why it failed (minimums not met). */
  reasons: string[];
  components: ComponentResult[];
  complete: boolean;
}

export const round = (n: number, d = 2) => {
  const f = 10 ** d;
  return Math.round((n + Number.EPSILON) * f) / f;
};

export function validateWeights(components: { weight: number }[]): string | null {
  if (components.length === 0) return 'Add at least one component';
  const total = round(components.reduce((s, c) => s + c.weight, 0), 4);
  return total === 100 ? null : `Component weights must add up to 100 (now ${total})`;
}

export function validateBands(bands: GradeBand[]): string | null {
  if (bands.length === 0) return 'Add at least one grade band';
  const sorted = [...bands].sort((a, b) => b.minPercent - a.minPercent);
  if (sorted[sorted.length - 1].minPercent !== 0) return 'The lowest grade band must start at 0%';
  if (new Set(bands.map((b) => b.minPercent)).size !== bands.length) return 'Two grade bands start at the same percentage';
  if (new Set(bands.map((b) => b.grade)).size !== bands.length) return 'Grade names must be different';
  return null;
}

/** The band a percentage falls in (bands may be given in any order). */
export function gradeFor(rules: GradeScaleRules, percent: number): { grade: string; gradePoint: number; pass: boolean } {
  const band = [...rules.bands].sort((a, b) => b.minPercent - a.minPercent).find((b) => percent >= b.minPercent) ?? rules.bands[0];
  const gradePoint = !band.pass ? 0 : rules.pointsMode === 'percentOver10' ? round(percent / 10, 2) : band.gradePoint;
  return { grade: band.grade, gradePoint, pass: band.pass };
}

/** Weighted subject percentage, grade and pass/fail from the component evidence. */
export function subjectResult(components: SchemeComponent[], evidence: ComponentEvidence[], pass: PassRules, scale: GradeScaleRules): SubjectResult {
  const byId = new Map(evidence.map((e) => [e.componentId, e]));
  let complete = true;
  const results: ComponentResult[] = components.map((c) => {
    const ev = byId.get(c.id);
    const max = ev ? ev.entries.reduce((s, e) => s + e.max, 0) : 0;
    if (!ev || max === 0) {
      complete = false;
      return { componentId: c.id, code: c.code, name: c.name, kind: c.kind, weight: c.weight, fraction: null, weighted: 0 };
    }
    const scored = ev.entries.reduce((s, e) => s + (e.absent || e.scored === null ? 0 : e.scored), 0);
    const fraction = scored / max;
    return { componentId: c.id, code: c.code, name: c.name, kind: c.kind, weight: c.weight, fraction, weighted: fraction * c.weight };
  });
  const percent = round(results.reduce((s, r) => s + r.weighted, 0), 2);
  const reasons: string[] = [];
  const share = (pred: (r: ComponentResult) => boolean) => {
    const rs = results.filter(pred);
    const w = rs.reduce((s, r) => s + r.weight, 0);
    return w === 0 ? null : (rs.reduce((s, r) => s + r.weighted, 0) / w) * 100;
  };
  const internal = share((r) => r.kind !== 'external');
  const external = share((r) => r.kind === 'external');
  if (pass.minInternalPercent !== null && internal !== null && internal + 1e-9 < pass.minInternalPercent) reasons.push('internal');
  if (pass.minExternalPercent !== null && external !== null && external + 1e-9 < pass.minExternalPercent) reasons.push('external');
  if (percent + 1e-9 < pass.minTotalPercent) reasons.push('total');
  const g = gradeFor(scale, percent);
  if (!g.pass) reasons.push('grade');
  const passed = reasons.length === 0;
  const failBand = [...scale.bands].sort((a, b) => a.minPercent - b.minPercent).find((b) => !b.pass);
  return {
    percent,
    grade: passed ? g.grade : (failBand?.grade ?? g.grade),
    gradePoint: passed ? g.gradePoint : 0,
    passed,
    reasons,
    components: results.map((r) => ({ ...r, fraction: r.fraction === null ? null : round(r.fraction, 4), weighted: round(r.weighted, 2) })),
    complete,
  };
}

export interface CreditLine {
  credits: number;
  gradePoint: number;
  passed: boolean;
}

/**
 * SGPA = Σ(credits × grade point) ÷ Σ credits over the term's subjects (failed subjects count with
 * grade point 0, as UGC/BU regulations do). Credits earned counts only passed subjects.
 */
export function sgpa(lines: CreditLine[], decimals = 2): { sgpa: number; creditsAttempted: number; creditsEarned: number; creditPoints: number } {
  const creditsAttempted = lines.reduce((s, l) => s + l.credits, 0);
  const creditPoints = lines.reduce((s, l) => s + l.credits * (l.passed ? l.gradePoint : 0), 0);
  const creditsEarned = lines.filter((l) => l.passed).reduce((s, l) => s + l.credits, 0);
  return { sgpa: creditsAttempted === 0 ? 0 : round(creditPoints / creditsAttempted, decimals), creditsAttempted, creditsEarned, creditPoints: round(creditPoints, 4) };
}

/**
 * CGPA = Σ(credits of term × SGPA of term) ÷ Σ credits, computed from the unrounded credit points
 * (Σ credit points ÷ Σ credits) so rounding each SGPA does not drift the CGPA.
 */
export function cgpa(terms: { creditsAttempted: number; creditPoints: number }[], decimals = 2): number {
  const credits = terms.reduce((s, t) => s + t.creditsAttempted, 0);
  return credits === 0 ? 0 : round(terms.reduce((s, t) => s + t.creditPoints, 0) / credits, decimals);
}

/** Ready-made scales; institutions copy and adjust them. */
export const GRADE_SCALE_PRESETS: Record<string, { name: string } & GradeScaleRules> = {
  'bu-nep': {
    name: 'Bangalore University NEP (10-point)',
    pointsMode: 'percentOver10',
    decimals: 2,
    bands: [
      { grade: 'O', minPercent: 90, gradePoint: 10, pass: true },
      { grade: 'A+', minPercent: 80, gradePoint: 9, pass: true },
      { grade: 'A', minPercent: 70, gradePoint: 8, pass: true },
      { grade: 'B+', minPercent: 60, gradePoint: 7, pass: true },
      { grade: 'B', minPercent: 55, gradePoint: 6, pass: true },
      { grade: 'C', minPercent: 50, gradePoint: 5, pass: true },
      { grade: 'P', minPercent: 40, gradePoint: 4, pass: true },
      { grade: 'F', minPercent: 0, gradePoint: 0, pass: false },
    ],
  },
  'ugc-10': {
    name: 'UGC 10-point (band grade points)',
    pointsMode: 'band',
    decimals: 2,
    bands: [
      { grade: 'O', minPercent: 90, gradePoint: 10, pass: true },
      { grade: 'A+', minPercent: 80, gradePoint: 9, pass: true },
      { grade: 'A', minPercent: 70, gradePoint: 8, pass: true },
      { grade: 'B+', minPercent: 60, gradePoint: 7, pass: true },
      { grade: 'B', minPercent: 50, gradePoint: 6, pass: true },
      { grade: 'C', minPercent: 45, gradePoint: 5, pass: true },
      { grade: 'P', minPercent: 40, gradePoint: 4, pass: true },
      { grade: 'F', minPercent: 0, gradePoint: 0, pass: false },
    ],
  },
  cbse: {
    name: 'CBSE 9-point (A1–E)',
    pointsMode: 'band',
    decimals: 1,
    bands: [
      { grade: 'A1', minPercent: 91, gradePoint: 10, pass: true },
      { grade: 'A2', minPercent: 81, gradePoint: 9, pass: true },
      { grade: 'B1', minPercent: 71, gradePoint: 8, pass: true },
      { grade: 'B2', minPercent: 61, gradePoint: 7, pass: true },
      { grade: 'C1', minPercent: 51, gradePoint: 6, pass: true },
      { grade: 'C2', minPercent: 41, gradePoint: 5, pass: true },
      { grade: 'D', minPercent: 33, gradePoint: 4, pass: true },
      { grade: 'E', minPercent: 0, gradePoint: 0, pass: false },
    ],
  },
};

/** Ready-made component layouts for a subject's scheme. */
export const SCHEME_PRESETS: Record<string, { name: string; components: Omit<SchemeComponent, 'id'>[]; pass: PassRules; credits: number }> = {
  'bu-nep': {
    name: 'BU NEP theory (IA 40 + SEE 60)',
    credits: 4,
    components: [
      { code: 'IA-T', name: 'Internal tests', kind: 'internal', weight: 20 },
      { code: 'IA-A', name: 'Assignment / seminar', kind: 'internal', weight: 10 },
      { code: 'IA-P', name: 'Attendance & participation', kind: 'internal', weight: 10 },
      { code: 'SEE', name: 'Semester end exam', kind: 'external', weight: 60 },
    ],
    pass: { minInternalPercent: null, minExternalPercent: 40, minTotalPercent: 40 },
  },
  cbse: {
    name: 'CBSE secondary (internal 20 + board 80)',
    credits: 1,
    components: [
      { code: 'PT', name: 'Periodic tests', kind: 'internal', weight: 10 },
      { code: 'NB', name: 'Notebook submission', kind: 'internal', weight: 5 },
      { code: 'SE', name: 'Subject enrichment', kind: 'internal', weight: 5 },
      { code: 'AE', name: 'Annual examination', kind: 'external', weight: 80 },
    ],
    pass: { minInternalPercent: null, minExternalPercent: 33, minTotalPercent: 33 },
  },
};
