/**
 * Index marks: the single number an admission rank list is sorted on. Each programme family has its own
 * formula (entrance plus board marks for engineering, national test plus board marks for medicine, best-of
 * subjects for degree courses). A formula is plain data so a cycle can store it and a registry rule can retune the weights.
 */

export interface IndexComponent {
  key: string;
  label: string;
  /** Highest mark the applicant can score in this component (the marks are scaled to `weight`). */
  max: number;
  /** Points this component contributes to the index mark when the applicant scores full marks. */
  weight: number;
}

/** Best N of a group of subjects, averaged, then scaled to `weight` (degree admissions on Plus Two marks). */
export interface BestOfGroup {
  keys: string[];
  count: number;
  max: number;
  weight: number;
}

export interface IndexFormula {
  preset: string;
  components: IndexComponent[];
  bestOf?: BestOfGroup;
  /** Added after scaling and capped at `bonusCap`: sports, NCC, rural or defence-ward weightage. */
  bonusKeys?: string[];
  bonusCap?: number;
  /** Component keys compared in order when two applicants have the same index mark; the older applicant wins the last tie. */
  tieBreak: string[];
  /**
   * Rank-based entrance tests (COMEDK UGET, the KEA's KCET rank, JEE Main CRL): the authority's rank is the merit order
   * itself, lowest first. The index mark is then that rank and the components are ignored.
   */
  rankBy?: { key: string; label: string; max: number };
  /** The entrance test this formula is built on (kcet, comedk, neet, jee_main, pgcet, kmat), for the forms and reports. */
  exam?: string;
}

export const INDEX_PRESETS: Record<string, { label: string; formula: IndexFormula }> = {
  engineering: {
    label: 'Engineering: entrance 300 + Maths 100 + Physics 50 + Chemistry 50',
    formula: {
      preset: 'engineering',
      components: [
        { key: 'entrance', label: 'Entrance test', max: 300, weight: 300 },
        { key: 'maths', label: 'Mathematics (board)', max: 100, weight: 100 },
        { key: 'physics', label: 'Physics (board)', max: 100, weight: 50 },
        { key: 'chemistry', label: 'Chemistry (board)', max: 100, weight: 50 },
      ],
      tieBreak: ['maths', 'physics', 'chemistry'],
    },
  },
  medical: {
    label: 'Medical: national test 720 scaled to 600 + Biology 100, Physics 50, Chemistry 50',
    formula: {
      preset: 'medical',
      components: [
        { key: 'neet', label: 'National eligibility test', max: 720, weight: 600 },
        { key: 'biology', label: 'Biology (board)', max: 100, weight: 100 },
        { key: 'physics', label: 'Physics (board)', max: 100, weight: 50 },
        { key: 'chemistry', label: 'Chemistry (board)', max: 100, weight: 50 },
      ],
      tieBreak: ['biology', 'chemistry', 'physics'],
    },
  },
  degree: {
    label: 'Degree: best four Plus Two subjects out of 100, scaled to 400, plus bonus up to 15',
    formula: {
      preset: 'degree',
      components: [],
      bestOf: { keys: ['subject1', 'subject2', 'subject3', 'subject4', 'subject5', 'subject6'], count: 4, max: 100, weight: 400 },
      bonusKeys: ['sports', 'ncc', 'nss'],
      bonusCap: 15,
      tieBreak: ['subject1'],
    },
  },
  postgraduate: {
    label: 'Postgraduate: degree percentage 60 + entrance 40, plus bonus up to 5',
    formula: {
      preset: 'postgraduate',
      components: [
        { key: 'degree_percent', label: 'Degree percentage', max: 100, weight: 60 },
        { key: 'entrance', label: 'Entrance test', max: 100, weight: 40 },
      ],
      bonusKeys: ['sports', 'ncc'],
      bonusCap: 5,
      tieBreak: ['entrance', 'degree_percent'],
    },
  },
  kcet_engineering: {
    label: 'KCET engineering (KEA): CET Physics, Chemistry, Mathematics out of 180 at 50% + PUC Physics, Chemistry, Mathematics out of 300 at 50%',
    formula: {
      preset: 'kcet_engineering',
      exam: 'kcet',
      components: [
        { key: 'cet_pcm', label: 'KCET Physics + Chemistry + Mathematics', max: 180, weight: 50 },
        { key: 'puc_pcm', label: 'PUC / 12th Physics + Chemistry + Mathematics', max: 300, weight: 50 },
      ],
      tieBreak: ['cet_pcm', 'cet_maths', 'cet_physics', 'puc_pcm'],
    },
  },
  kcet_rank: {
    label: 'KCET rank as allotted by KEA (lower rank first)',
    formula: { preset: 'kcet_rank', exam: 'kcet', components: [], rankBy: { key: 'kcet_rank', label: 'KCET rank', max: 400000 }, tieBreak: [] },
  },
  comedk_rank: {
    label: 'COMEDK UGET rank (lower rank first)',
    formula: { preset: 'comedk_rank', exam: 'comedk', components: [], rankBy: { key: 'comedk_rank', label: 'COMEDK UGET rank', max: 200000 }, tieBreak: [] },
  },
  jee_main_rank: {
    label: 'JEE Main common rank list (CRL) rank (lower rank first)',
    formula: { preset: 'jee_main_rank', exam: 'jee_main', components: [], rankBy: { key: 'jee_crl_rank', label: 'JEE Main CRL rank', max: 1500000 }, tieBreak: [] },
  },
  neet_score: {
    label: 'NEET (UG) score out of 720; ties by Biology, then Chemistry, then Physics (NTA)',
    formula: {
      preset: 'neet_score',
      exam: 'neet',
      components: [{ key: 'neet', label: 'NEET (UG) total', max: 720, weight: 720 }],
      tieBreak: ['neet_biology', 'neet_chemistry', 'neet_physics'],
    },
  },
  pgcet_mba: {
    label: 'Karnataka PGCET (MBA / MCA) score out of 100; ties by the degree percentage',
    formula: { preset: 'pgcet_mba', exam: 'pgcet', components: [{ key: 'pgcet', label: 'PGCET score', max: 100, weight: 100 }], tieBreak: ['degree_percent'] },
  },
  kmat_mba: {
    label: 'KMAT score out of 100 at 70% + degree percentage at 30% (management quota)',
    formula: {
      preset: 'kmat_mba',
      exam: 'kmat',
      components: [
        { key: 'kmat', label: 'KMAT score', max: 100, weight: 70 },
        { key: 'degree_percent', label: 'Degree percentage', max: 100, weight: 30 },
      ],
      tieBreak: ['kmat', 'degree_percent'],
    },
  },
  simple: {
    label: 'Simple: one percentage out of 100',
    formula: { preset: 'simple', components: [{ key: 'percentage', label: 'Percentage', max: 100, weight: 100 }], tieBreak: ['percentage'] },
  },
};

export interface IndexResult {
  indexMark: number;
  parts: { key: string; scored: number; points: number }[];
  bonus: number;
  /** Marks the applicant has not been given yet; the index is not final until these are filled. */
  missing: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

/** Index mark for one applicant. Marks above a component's maximum are rejected by the caller (see formulaProblems). */
export function computeIndexMark(f: IndexFormula, marks: Record<string, unknown>): IndexResult {
  const parts: IndexResult['parts'] = [];
  const missing: string[] = [];
  if (f.rankBy) {
    const m = num(marks[f.rankBy.key]);
    if (m === null || m < 1 || !Number.isInteger(m)) return { indexMark: 0, parts, bonus: 0, missing: [f.rankBy.key] };
    return { indexMark: m, parts: [{ key: f.rankBy.key, scored: m, points: m }], bonus: 0, missing };
  }
  let total = 0;
  for (const c of f.components) {
    const m = num(marks[c.key]);
    if (m === null) {
      missing.push(c.key);
      continue;
    }
    const pts = (Math.min(m, c.max) / c.max) * c.weight;
    parts.push({ key: c.key, scored: m, points: r2(pts) });
    total += pts;
  }
  if (f.bestOf) {
    const have = f.bestOf.keys.map((k) => num(marks[k])).filter((v): v is number => v !== null).sort((a, b) => b - a);
    if (have.length < f.bestOf.count) missing.push(`${f.bestOf.count - have.length} more subject marks`);
    const top = have.slice(0, f.bestOf.count);
    if (top.length) {
      const pts = (top.reduce((n, v) => n + Math.min(v, f.bestOf!.max), 0) / (f.bestOf.count * f.bestOf.max)) * f.bestOf.weight;
      parts.push({ key: 'bestOf', scored: r2(top.reduce((n, v) => n + v, 0)), points: r2(pts) });
      total += pts;
    }
  }
  let bonus = 0;
  for (const k of f.bonusKeys ?? []) bonus += num(marks[k]) ?? 0;
  bonus = Math.min(bonus, f.bonusCap ?? 0);
  return { indexMark: r2(total + bonus), parts, bonus: r2(bonus), missing };
}

/** Problems with a formula or with the marks entered against it, in plain words. Empty when fine. */
export function formulaProblems(f: IndexFormula, marks?: Record<string, unknown>): string[] {
  const out: string[] = [];
  const keys = f.components.map((c) => c.key);
  if (new Set(keys).size !== keys.length) out.push('A component appears twice');
  if (!f.components.length && !f.bestOf && !f.rankBy) out.push('The formula has no components');
  if (f.rankBy && !(f.rankBy.max >= 1)) out.push(`${f.rankBy.label}: the largest rank must be at least 1`);
  if (marks && f.rankBy) {
    const m = marks[f.rankBy.key];
    if (m !== undefined && m !== null && (num(m) === null || !Number.isInteger(m) || (m as number) < 1 || (m as number) > f.rankBy.max)) out.push(`${f.rankBy.label} must be a whole number from 1 to ${f.rankBy.max}`);
  }
  for (const c of f.components) if (!(c.max > 0) || !(c.weight >= 0)) out.push(`${c.label}: maximum must be above zero`);
  if (marks) {
    for (const c of f.components) {
      const m = marks[c.key];
      if (m !== undefined && m !== null && (num(m) === null || (m as number) > c.max)) out.push(`${c.label} must be between 0 and ${c.max}`);
    }
    for (const k of f.bestOf?.keys ?? []) {
      const m = marks[k];
      if (m !== undefined && m !== null && (num(m) === null || (m as number) > f.bestOf!.max)) out.push(`${k} must be between 0 and ${f.bestOf!.max}`);
    }
  }
  return out;
}

/** Rule `admission/index-mark` {weights: {entrance: 250, ...}}: replaces the weight of the named components. */
export function overlayWeights(f: IndexFormula, params: Record<string, unknown> | null): IndexFormula {
  const w = params?.weights;
  if (!w || typeof w !== 'object') return f;
  const map = w as Record<string, unknown>;
  return { ...f, components: f.components.map((c) => (num(map[c.key]) !== null ? { ...c, weight: map[c.key] as number } : c)) };
}
