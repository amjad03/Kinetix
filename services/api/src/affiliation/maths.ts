/**
 * Profile-driven result rules that need no database: the grade scale and pass rules a profile implies,
 * grace marks, the aggregate minimum, class / division, percentage equivalence and register numbers.
 * The per-subject maths stays in exams/grading.ts.
 */
import { gradeFor, round, roundBy, type GradeScaleRules, type PassRules, type SchemeComponent, type SubjectResult } from '../exams/grading.js';
import type { ProfileRules } from './rules.js';

/** The grade scale the exams module uses, from a profile. */
export function scaleOf(rules: ProfileRules): GradeScaleRules {
  return { bands: rules.grading.bands, pointsMode: rules.grading.pointsMode, decimals: rules.gpa.decimals };
}

export function passOf(rules: ProfileRules): PassRules {
  return { minInternalPercent: rules.pass.minInternalPercent, minExternalPercent: rules.pass.minExternalPercent, minTotalPercent: rules.pass.minTotalPercent };
}

/**
 * Percentage points (of the subject's 100) needed to meet every minimum, or null when grace cannot help
 * (absent in the external exam, or short in the internal component, which grace never makes up).
 */
export function graceNeeded(r: SubjectResult, pass: PassRules, scale: GradeScaleRules): number | null {
  if (r.passed) return 0;
  if (r.externalAbsent || r.reasons.includes('internal') || r.reasons.includes('absent') || r.reasons.includes('not_eligible')) return null;
  const ext = r.components.filter((c) => c.kind === 'external');
  const extWeight = ext.reduce((s, c) => s + c.weight, 0);
  let need = 0;
  if (pass.minExternalPercent !== null && extWeight > 0) {
    const have = ext.reduce((s, c) => s + c.weighted, 0);
    need = Math.max(need, (pass.minExternalPercent / 100) * extWeight - have);
  }
  need = Math.max(need, pass.minTotalPercent - r.percent);
  const lowestPass = Math.min(...scale.bands.filter((b) => b.pass).map((b) => b.minPercent));
  if (Number.isFinite(lowestPass)) need = Math.max(need, lowestPass - r.percent);
  // Grace is given in whole marks.
  return Math.max(0, Math.ceil(round(need, 4) - 1e-9));
}

export interface GraceRules {
  enabled: boolean;
  maxPerSubject: number;
  maxTotal: number;
  maxSubjects: number | null;
  allOrNothing: boolean;
}

/**
 * Grace marks over a candidate's subjects for one examination. Failures that grace can cure within the
 * per-subject limit get it, smallest first, within the total and subject-count limits; with `allOrNothing`
 * grace is given only when it clears every failure. Returns new results (inputs are not changed).
 */
export function applyGrace<T extends { result: SubjectResult; pass: PassRules; scale: GradeScaleRules }>(lines: T[], grace: GraceRules): T[] {
  if (!grace.enabled || grace.maxTotal <= 0) return lines;
  const failing = lines.map((l, i) => ({ i, need: graceNeeded(l.result, l.pass, l.scale) })).filter((x) => !lines[x.i].result.passed);
  const curable = failing.filter((x): x is { i: number; need: number } => x.need !== null && x.need > 0 && x.need <= grace.maxPerSubject).sort((a, b) => a.need - b.need);
  if (curable.length === 0) return lines;
  if (grace.allOrNothing) {
    const total = curable.reduce((s, x) => s + x.need, 0);
    if (curable.length !== failing.length || total > grace.maxTotal || (grace.maxSubjects !== null && curable.length > grace.maxSubjects)) return lines;
  }
  const out = [...lines];
  let left = grace.maxTotal;
  let given = 0;
  for (const x of curable) {
    if (x.need > left || (grace.maxSubjects !== null && given >= grace.maxSubjects)) continue;
    left -= x.need;
    given++;
    const l = lines[x.i];
    const percent = round(l.result.percent + x.need, 2);
    const g = gradeFor(l.scale, percent);
    out[x.i] = { ...l, result: { ...l.result, percent, grade: g.grade, gradePoint: g.gradePoint, passed: true, reasons: [], grace: x.need } };
  }
  return out;
}

/** Total marks over the maximum across subjects, for the aggregate minimum and the marks card. */
export function aggregatePercent(lines: { percent: number; weight?: number }[]): number {
  if (lines.length === 0) return 0;
  const w = lines.reduce((s, l) => s + (l.weight ?? 100), 0);
  return round(lines.reduce((s, l) => s + (l.percent * (l.weight ?? 100)) / 100, 0) / (w / 100), 2);
}

/** Whether the candidate passes the examination as a whole: every subject and the aggregate minimum. */
export function examPassed(rules: Pick<ProfileRules, 'pass'>, lines: { percent: number; passed: boolean }[]): { passed: boolean; aggregate: number; reasons: string[] } {
  const aggregate = aggregatePercent(lines);
  const reasons: string[] = [];
  if (lines.some((l) => !l.passed)) reasons.push('subjects');
  if (rules.pass.minAggregatePercent !== null && aggregate + 1e-9 < rules.pass.minAggregatePercent) reasons.push('aggregate');
  return { passed: lines.length > 0 && reasons.length === 0, aggregate, reasons };
}

/** Percentage equivalent printed on the card: marks percentage, or (CGPA − subtract) × multiplier. */
export function percentEquivalent(rules: ProfileRules, facts: { cgpa: number | null; marksPercent: number | null }): number | null {
  if (rules.percentage.basis === 'marks') return facts.marksPercent;
  if (facts.cgpa === null) return null;
  return round(Math.max(0, (facts.cgpa - rules.percentage.cgpaSubtract) * rules.percentage.cgpaMultiplier), 2);
}

/**
 * The class / division awarded, or null (failed, or below every class). `firstAttempt` is false when the
 * candidate needed a supplementary or repeat attempt in any subject; first-attempt-only classes are skipped then.
 */
export function classify(rules: ProfileRules, facts: { passed: boolean; cgpa: number | null; percent: number | null; firstAttempt: boolean }): string | null {
  if (!facts.passed) return null;
  const c = rules.classification;
  const value = c.basis === 'cgpa' ? facts.cgpa : facts.percent;
  if (value === null) return null;
  if (c.minForAward !== null && value + 1e-9 < c.minForAward) return null;
  return c.classes.find((k) => value + 1e-9 >= k.min && (!k.firstAttemptOnly || facts.firstAttempt))?.label ?? null;
}

/** Whether a register number fits the profile's format (always true when the format is not fixed). */
export function registerNoValid(rules: ProfileRules, value: string): boolean {
  if (!rules.registerNumber.pattern) return value.trim().length > 0;
  return new RegExp(rules.registerNumber.pattern, 'i').test(value.trim());
}

/** The theory component layout as scheme components (ids made from the codes). */
export const presetComponents = (rules: ProfileRules, kind: 'theory' | 'practical' = 'theory'): Omit<SchemeComponent, 'id'>[] =>
  (kind === 'practical' ? (rules.assessment.practicalComponents ?? rules.assessment.theoryComponents) : rules.assessment.theoryComponents).map((c) => ({ ...c }));

export { roundBy };
