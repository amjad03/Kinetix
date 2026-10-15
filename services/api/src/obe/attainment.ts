/**
 * OBE attainment maths. Pure functions: the service gathers evidence, these turn it into levels.
 * Nothing here is an accreditor's constant; every number comes from the attainment policy (institution, programme or
 * course, see ObeService.policy). The defaults are the ones the institution approved:
 *
 * Direct CO attainment (per evidence kind: CIE is "internal", SEE is "external"; then weighted 40 : 60):
 *   1. per student, pool the marks of every question (or assessment share) of that kind tagged to the CO;
 *   2. the "threshold" method: a student attains the CO when they score ≥ `studentThresholdPercent` (60%) of those
 *      marks, and the share of students who attain gives the level through `levels` (≥60% of students → 3,
 *      ≥50% → 2, ≥40% → 1, else 0);
 *      the "class_average" method (NBA's alternative): the class's average percentage on those marks gives the level
 *      through the same bands; the "percentage" method: the level is the share of students attaining × top level
 *      (a continuous value, e.g. 70% of students → 2.1 on a 0-3 scale);
 *   3. direct = Σ(kind weight × kind level) ÷ Σ weights of the kinds that have evidence.
 * Indirect: each survey's mean rating is scaled to the level scale (mean ÷ scale max × level max),
 *   surveys under their minimum response count are ignored, the rest are weight-averaged.
 * Combined = directWeight × direct + indirectWeight × indirect (80 : 20; direct only when no survey qualifies).
 * PO/PSO (direct part), by `poMethod`:
 *   - "course_weighted" (default): for each course, A = Σ(strength × CO attainment) ÷ Σ strength over the course's COs
 *     mapped to the PO, and its articulation P = the average strength of those mappings (the programme articulation
 *     matrix); PO = Σ(P × A) ÷ Σ P over the courses;
 *   - "co_weighted": Σ(strength × CO attainment) ÷ Σ strength over every mapped CO of the programme;
 *   - "course_average": NBA's course-level form, PO = Σ(P × course attainment) ÷ Σ P, the course attainment being the
 *     average of all its measured COs.
 * Apportioning: an assessment whose result arrives as a total (a university SEE) is shared out to the COs of its
 * question paper by the paper's CO weightage ("blueprint": the marks of the questions on each CO), or equally
 * between the COs it tests ("equal"); "off" leaves totals-only results out.
 */

export interface LevelRule {
  level: number;
  /** Minimum percentage (of students attaining the threshold, or the class average) for this level. */
  minStudentsPercent: number;
}

export type CoMethod = 'threshold' | 'class_average' | 'percentage';
export type PoMethod = 'course_weighted' | 'co_weighted' | 'course_average';
export type Apportion = 'blueprint' | 'equal' | 'off';
export const CO_METHODS: CoMethod[] = ['threshold', 'class_average', 'percentage'];
export const PO_METHODS: PoMethod[] = ['course_weighted', 'co_weighted', 'course_average'];
export const APPORTION: Apportion[] = ['blueprint', 'equal', 'off'];

export interface AttainmentConfig {
  /** Percentage of the mapped marks a student must score to attain the outcome. */
  studentThresholdPercent: number;
  levels: LevelRule[];
  /** Weight of each evidence kind in direct attainment, e.g. { internal: 40, external: 60 }. */
  evidenceWeights: Record<string, number>;
  directWeight: number;
  indirectWeight: number;
  /** The level the scale tops out at (3 on a 0–3 scale). */
  maxLevel: number;
  /** Target attainment level for COs and POs. */
  targetLevel: number;
  decimals: number;
  /** How a kind's level is found from the students' scores. */
  coMethod?: CoMethod;
  /** How COs roll up to POs and PSOs. */
  poMethod?: PoMethod;
  /** How a totals-only result is shared out to COs. */
  seeApportion?: Apportion;
  /** LMS quiz questions tagged to a CO count as CIE. */
  includeLms?: boolean;
}

export const DEFAULT_ATTAINMENT_CONFIG: Required<AttainmentConfig> = {
  studentThresholdPercent: 60,
  levels: [
    { level: 3, minStudentsPercent: 60 },
    { level: 2, minStudentsPercent: 50 },
    { level: 1, minStudentsPercent: 40 },
  ],
  evidenceWeights: { internal: 40, external: 60 },
  directWeight: 80,
  indirectWeight: 20,
  maxLevel: 3,
  targetLevel: 2,
  decimals: 2,
  coMethod: 'threshold',
  poMethod: 'course_weighted',
  seeApportion: 'blueprint',
  includeLms: true,
};

/** A stored policy with every rule filled in (older policies predate the methods). */
export function withDefaults(c: Partial<AttainmentConfig> | null | undefined): Required<AttainmentConfig> {
  return { ...DEFAULT_ATTAINMENT_CONFIG, ...(c ?? {}) } as Required<AttainmentConfig>;
}

export const round = (n: number, d: number) => Math.round((n + Number.EPSILON) * 10 ** d) / 10 ** d;

export interface EvidenceItem {
  /** Assessment (or question) the marks come from. */
  sourceId: string;
  label: string;
  /** Evidence kind: internal (CIE) / external (SEE) / classroom / any kind the policy weights. */
  kind: string;
  /** Marks of this item that count towards the CO, per student (absent = 0 of max). */
  scores: { studentId: string; scored: number | null; max: number }[];
  /** How the marks reached the CO: from question marks, apportioned from a total by the paper, or by an assessment share. */
  basis?: 'questions' | 'apportioned' | 'share' | 'lms' | 'poll';
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

export function levelFor(config: AttainmentConfig, percent: number): number {
  const rule = [...config.levels].sort((a, b) => b.level - a.level).find((r) => percent + 1e-9 >= r.minStudentsPercent);
  return rule ? rule.level : 0;
}

/** The level of a pool of students under the policy's CO method. */
export function methodLevel(config: AttainmentConfig, p: { percentAttained: number; averagePercent: number }): number {
  const m = config.coMethod ?? 'threshold';
  if (m === 'class_average') return levelFor(config, p.averagePercent);
  if (m === 'percentage') return round((p.percentAttained / 100) * config.maxLevel, config.decimals);
  return levelFor(config, p.percentAttained);
}

/** Each student's marks and maximum, pooled over the items. */
export function pooledByStudent(items: EvidenceItem[]): Map<string, { scored: number; max: number }> {
  const per = new Map<string, { scored: number; max: number }>();
  for (const it of items)
    for (const s of it.scores) {
      const p = per.get(s.studentId) ?? { scored: 0, max: 0 };
      p.scored += s.scored ?? 0;
      p.max += s.max;
      per.set(s.studentId, p);
    }
  return per;
}

export function pooled(items: EvidenceItem[], threshold: number) {
  const rows = [...pooledByStudent(items).values()].filter((p) => p.max > 0);
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
      level: methodLevel(config, p),
      weight,
    });
  }
  const weighted = byKind.filter((k) => k.weight > 0);
  const totalWeight = weighted.reduce((s, k) => s + k.weight, 0);
  const level = totalWeight === 0 ? null : round(weighted.reduce((s, k) => s + k.weight * k.level, 0) / totalWeight, config.decimals);
  const weakItems = items
    .map((i) => {
      const p = pooled([i], config.studentThresholdPercent);
      return { sourceId: i.sourceId, label: i.label, percentAttained: round(p.percentAttained, 2), level: methodLevel(config, p), n: p.students };
    })
    .filter((i) => i.n > 0 && i.level < config.targetLevel)
    .sort((a, b) => a.percentAttained - b.percentAttained)
    .map(({ sourceId, label, percentAttained }) => ({ sourceId, label, percentAttained }));
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

export interface PoCell {
  coId: string;
  strength: number;
  coAttainment: number | null;
  /** The course (subject) the CO belongs to; needed by the course-wise methods. */
  courseId?: string;
}

export interface PoAttainment {
  level: number | null;
  /** Share of the mapped COs that were measured. */
  coverage: number;
  contributors: number;
  /** Per course: its articulation (average strength) and its attainment towards this PO (the PO attainment tree). */
  byCourse: { courseId: string; articulation: number; attainment: number | null; cos: number }[];
}

/**
 * PO/PSO attainment from mapped CO attainments (see the header for the methods). `courseAverage` (course → the average
 * attainment of all its measured COs) is used by "course_average"; it defaults to the average of the mapped COs.
 */
export function programOutcomeAttainment(cells: PoCell[], config: AttainmentConfig, courseAverage?: Map<string, number | null>): PoAttainment {
  const mapped = cells.filter((c) => c.strength > 0);
  const known = mapped.filter((c) => c.coAttainment !== null);
  const coverage = mapped.length === 0 ? 0 : round((known.length / mapped.length) * 100, 1);
  const courses = [...new Set(mapped.map((c) => c.courseId ?? '_'))];
  const byCourse = courses.map((courseId) => {
    const mine = mapped.filter((c) => (c.courseId ?? '_') === courseId);
    const measured = mine.filter((c) => c.coAttainment !== null);
    const articulation = mine.reduce((s, c) => s + c.strength, 0) / mine.length;
    const sw = measured.reduce((s, c) => s + c.strength, 0);
    const weighted = sw === 0 ? null : measured.reduce((s, c) => s + c.strength * (c.coAttainment as number), 0) / sw;
    const avg = courseAverage?.has(courseId) ? (courseAverage.get(courseId) ?? null) : measured.length ? measured.reduce((s, c) => s + (c.coAttainment as number), 0) / measured.length : null;
    return { courseId, articulation, attainment: config.poMethod === 'course_average' ? avg : weighted, cos: mine.length };
  });
  let level: number | null;
  if ((config.poMethod ?? 'co_weighted') === 'co_weighted') {
    const strength = known.reduce((s, c) => s + c.strength, 0);
    level = strength === 0 ? null : known.reduce((s, c) => s + c.strength * (c.coAttainment as number), 0) / strength;
  } else {
    const usable = byCourse.filter((c) => c.attainment !== null);
    const p = usable.reduce((s, c) => s + c.articulation, 0);
    level = p === 0 ? null : usable.reduce((s, c) => s + c.articulation * (c.attainment as number), 0) / p;
  }
  return {
    level: level === null ? null : round(level, config.decimals),
    coverage,
    contributors: known.length,
    byCourse: byCourse.map((c) => ({ ...c, articulation: round(c.articulation, 2), attainment: c.attainment === null ? null : round(c.attainment, config.decimals) })),
  };
}

/** The programme articulation matrix: course × PO, the average strength of the course's COs mapped to the PO (0 = none). */
export function articulationMatrix(cells: { courseId: string; outcomeId: string; strength: number }[]): Map<string, Map<string, number>> {
  const sums = new Map<string, Map<string, { s: number; n: number }>>();
  for (const c of cells.filter((x) => x.strength > 0)) {
    const row = sums.get(c.courseId) ?? new Map();
    const cur = row.get(c.outcomeId) ?? { s: 0, n: 0 };
    cur.s += c.strength;
    cur.n++;
    row.set(c.outcomeId, cur);
    sums.set(c.courseId, row);
  }
  return new Map([...sums].map(([k, row]) => [k, new Map([...row].map(([o, v]) => [o, round(v.s / v.n, 2)]))]));
}

export interface BlueprintQuestion {
  maxMarks: number;
  cos: { coId: string; weight: number }[];
}

/**
 * The share of a paper's marks that tests each CO. "blueprint": the marks of each question split over its COs by weight,
 * over the marks of the whole paper (questions with no CO count for none). "equal": every CO the paper tests gets the
 * same share. "off": none.
 */
export function blueprintShares(questions: BlueprintQuestion[], mode: Apportion): Map<string, number> {
  const out = new Map<string, number>();
  if (mode === 'off') return out;
  const total = questions.reduce((s, q) => s + q.maxMarks, 0);
  if (total <= 0) return out;
  if (mode === 'equal') {
    const cos = [...new Set(questions.flatMap((q) => q.cos.map((c) => c.coId)))];
    for (const c of cos) out.set(c, 1 / cos.length);
    return out;
  }
  for (const q of questions) {
    const w = q.cos.reduce((s, c) => s + c.weight, 0);
    if (w <= 0) continue;
    for (const c of q.cos) out.set(c.coId, (out.get(c.coId) ?? 0) + (q.maxMarks * c.weight) / w / total);
  }
  return out;
}

/** A student's marks on each CO from their question-wise marks: each question's marks split over its COs by weight. */
export function questionCoMarks(questions: (BlueprintQuestion & { id: string })[], marks: Map<string, number | null>): Map<string, { scored: number; max: number }> {
  const out = new Map<string, { scored: number; max: number }>();
  for (const q of questions) {
    const w = q.cos.reduce((s, c) => s + c.weight, 0);
    if (w <= 0) continue;
    const m = marks.get(q.id) ?? 0;
    for (const c of q.cos) {
      const cur = out.get(c.coId) ?? { scored: 0, max: 0 };
      cur.scored += ((m ?? 0) * c.weight) / w;
      cur.max += (q.maxMarks * c.weight) / w;
      out.set(c.coId, cur);
    }
  }
  return out;
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
  if (Object.values(c.evidenceWeights).every((w) => w <= 0)) return 'Give at least one kind of evidence a weight';
  if (c.coMethod && !CO_METHODS.includes(c.coMethod)) return 'Choose a CO attainment method';
  if (c.poMethod && !PO_METHODS.includes(c.poMethod)) return 'Choose a PO attainment method';
  return null;
}
