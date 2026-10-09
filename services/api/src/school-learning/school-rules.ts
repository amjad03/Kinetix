// Pure rules for school learning support: promotion decisions, board pass rules, activity levels and entrance readiness.

export interface SubjectResult {
  subject: string;
  /** Percentage scored over all assessments of the year, 0-100. */
  pct: number;
}

export interface PromotionRuleFacts {
  minAttendancePct: number;
  subjectPassPct: number;
  maxCompartmentSubjects: number;
  graceMarks: number;
}

export type PromotionDecision = 'promoted' | 'promoted_with_grace' | 'compartment' | 'detained';

export interface PromotionOutcome {
  decision: PromotionDecision;
  failedSubjects: string[];
  graceSubjects: string[];
  reasons: string[];
}

/**
 * The promotion rule engine: attendance below the minimum detains; every subject at or above the pass mark promotes;
 * grace marks (percentage points) may lift a subject that is just short; up to `maxCompartmentSubjects` failed
 * subjects give a supplementary (compartment) chance; more than that detains.
 */
export function decidePromotion(rule: PromotionRuleFacts, attendancePct: number | null, results: SubjectResult[]): PromotionOutcome {
  const reasons: string[] = [];
  const failed: string[] = [];
  const grace: string[] = [];
  for (const r of results) {
    if (r.pct >= rule.subjectPassPct) continue;
    if (rule.graceMarks > 0 && r.pct + rule.graceMarks >= rule.subjectPassPct) {
      grace.push(r.subject);
      continue;
    }
    failed.push(r.subject);
  }
  if (attendancePct !== null && attendancePct < rule.minAttendancePct) {
    reasons.push(`Attendance ${attendancePct}% is below the required ${rule.minAttendancePct}%`);
    if (failed.length) reasons.push(`Failed: ${failed.join(', ')}`);
    return { decision: 'detained', failedSubjects: failed, graceSubjects: grace, reasons };
  }
  if (failed.length === 0) {
    if (grace.length) reasons.push(`Grace marks used in: ${grace.join(', ')}`);
    return { decision: grace.length ? 'promoted_with_grace' : 'promoted', failedSubjects: [], graceSubjects: grace, reasons };
  }
  reasons.push(`Below ${rule.subjectPassPct}% in: ${failed.join(', ')}`);
  if (failed.length <= rule.maxCompartmentSubjects) {
    reasons.push(`Supplementary exam allowed (up to ${rule.maxCompartmentSubjects} subjects)`);
    return { decision: 'compartment', failedSubjects: failed, graceSubjects: grace, reasons };
  }
  reasons.push(`More than ${rule.maxCompartmentSubjects} subjects failed`);
  return { decision: 'detained', failedSubjects: failed, graceSubjects: grace, reasons };
}

export interface BoardPassRules {
  subjectPassPct?: number;
  aggregatePassPct?: number;
  graceMarks?: number;
  maxCompartmentSubjects?: number;
  /** Theory and practical must each reach the pass mark. */
  practicalSeparate?: boolean;
}

export interface BoardSubjectMarks {
  subject: string;
  theory: number;
  theoryMax: number;
  practical?: number;
  practicalMax?: number;
  internal?: number;
  internalMax?: number;
}

export interface BoardResult {
  result: 'pass' | 'compartment' | 'fail';
  aggregatePct: number;
  failedSubjects: string[];
  graceUsed: { subject: string; marks: number }[];
  subjects: { subject: string; obtained: number; max: number; pct: number; passed: boolean }[];
}

/** A board's pass rules applied to one student's subject marks (PUC and board exams). */
export function evaluateBoardPass(rules: BoardPassRules, marks: BoardSubjectMarks[]): BoardResult {
  const pass = rules.subjectPassPct ?? 35;
  const agg = rules.aggregatePassPct ?? 0;
  let grace = rules.graceMarks ?? 0;
  const failedSubjects: string[] = [];
  const graceUsed: { subject: string; marks: number }[] = [];
  let sumObtained = 0;
  let sumMax = 0;
  const subjects = marks.map((m) => {
    let obtained = m.theory + (m.practical ?? 0) + (m.internal ?? 0);
    const max = m.theoryMax + (m.practicalMax ?? 0) + (m.internalMax ?? 0);
    const need = (pass / 100) * max;
    let passed = obtained >= need;
    if (rules.practicalSeparate && m.practicalMax) passed = passed && (m.practical ?? 0) >= (pass / 100) * m.practicalMax && m.theory >= (pass / 100) * m.theoryMax;
    if (!passed && grace > 0 && !rules.practicalSeparate) {
      const gap = Math.ceil(need - obtained);
      if (gap > 0 && gap <= grace) {
        graceUsed.push({ subject: m.subject, marks: gap });
        grace -= gap;
        obtained += gap;
        passed = true;
      }
    }
    if (!passed) failedSubjects.push(m.subject);
    sumObtained += obtained;
    sumMax += max;
    return { subject: m.subject, obtained, max, pct: max ? Math.round((obtained / max) * 1000) / 10 : 0, passed };
  });
  const aggregatePct = sumMax ? Math.round((sumObtained / sumMax) * 1000) / 10 : 0;
  let result: BoardResult['result'] = 'pass';
  if (failedSubjects.length > 0) result = failedSubjects.length <= (rules.maxCompartmentSubjects ?? 0) ? 'compartment' : 'fail';
  else if (aggregatePct < agg) result = 'fail';
  return { result, aggregatePct, failedSubjects, graceUsed, subjects };
}

/** Where a score falls on a mastery scale: used when an activity or worksheet feeds learning-outcome mastery. */
export const MASTERY_ORDER = ['beginning', 'developing', 'proficient', 'mastery'] as const;
export type MasteryLevelName = (typeof MASTERY_ORDER)[number];

export function masteryFromPct(pct: number): MasteryLevelName {
  return pct >= 85 ? 'mastery' : pct >= 65 ? 'proficient' : pct >= 40 ? 'developing' : 'beginning';
}

/** Activity levels are listed best first; the first maps to mastery and the last to beginning, with the rest spread between. */
export function masteryFromLevel(levels: string[], level: string): MasteryLevelName | null {
  const i = levels.indexOf(level);
  if (i < 0) return null;
  if (levels.length === 1) return 'mastery';
  const frac = i / (levels.length - 1);
  return MASTERY_ORDER[Math.min(3, Math.round((1 - frac) * 3))];
}

export interface Mock {
  takenOn: string;
  score: number;
  maxScore: number;
  breakdown: Record<string, number>;
}

export interface Readiness {
  latestPct: number | null;
  averagePct: number | null;
  trend: 'up' | 'flat' | 'down' | null;
  band: 'no_data' | 'on_track' | 'close' | 'behind';
  gapToTarget: number | null;
  weakSubjects: string[];
  tests: number;
}

/** Entrance readiness from mock tests: the average of the last three against the target, the direction of travel, and the weak subjects of the latest mock. */
export function readiness(mocks: Mock[], targetPct: number): Readiness {
  const sorted = [...mocks].sort((a, b) => a.takenOn.localeCompare(b.takenOn));
  if (sorted.length === 0) return { latestPct: null, averagePct: null, trend: null, band: 'no_data', gapToTarget: null, weakSubjects: [], tests: 0 };
  const pcts = sorted.map((m) => (m.maxScore ? (m.score / m.maxScore) * 100 : 0));
  const last3 = pcts.slice(-3);
  const average = last3.reduce((s, x) => s + x, 0) / last3.length;
  const latest = pcts[pcts.length - 1];
  const prev = pcts.length > 1 ? pcts.slice(-4, -1).reduce((s, x) => s + x, 0) / pcts.slice(-4, -1).length : null;
  const trend = prev === null ? null : latest - prev > 2 ? 'up' : latest - prev < -2 ? 'down' : 'flat';
  const gap = Math.round((targetPct - average) * 10) / 10;
  const band = average >= targetPct ? 'on_track' : average >= targetPct - 10 ? 'close' : 'behind';
  const breakdown = sorted[sorted.length - 1].breakdown;
  const weak = Object.entries(breakdown)
    .filter(([, v]) => v < targetPct - 5)
    .sort((a, b) => a[1] - b[1])
    .map(([k]) => k);
  return { latestPct: Math.round(latest * 10) / 10, averagePct: Math.round(average * 10) / 10, trend, band, gapToTarget: gap, weakSubjects: weak, tests: sorted.length };
}

export interface RecommendationInput {
  weakOutcomes: { outcomeId: string; code: string; level: string; topicIds: string[] }[];
  items: { id: string; title: string; kind: string; topicId: string | null; courseId: string }[];
  overdue: { id: string; title: string; dueOn: string }[];
}

/** What a student should do next: items that teach their weakest outcomes first, then overdue work. */
export function recommend(input: RecommendationInput): { kind: 'practice' | 'overdue'; id: string; title: string; reason: string }[] {
  const out: { kind: 'practice' | 'overdue'; id: string; title: string; reason: string }[] = [];
  const order = (l: string) => MASTERY_ORDER.indexOf(l as MasteryLevelName);
  for (const w of [...input.weakOutcomes].sort((a, b) => order(a.level) - order(b.level))) {
    for (const it of input.items.filter((i) => i.topicId && w.topicIds.includes(i.topicId))) {
      if (!out.some((o) => o.id === it.id)) out.push({ kind: 'practice', id: it.id, title: it.title, reason: `Builds ${w.code} (${w.level})` });
    }
  }
  for (const o of input.overdue) out.push({ kind: 'overdue', id: o.id, title: o.title, reason: `Was due ${o.dueOn}` });
  return out.slice(0, 20);
}
