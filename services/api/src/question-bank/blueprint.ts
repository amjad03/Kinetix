import type { BlueprintSection } from '../db/schema.js';

export const BLOOM = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'] as const;
export const DIFFICULTY = ['easy', 'medium', 'hard'] as const;
export const QUESTION_TYPES = ['mcq', 'short', 'long', 'numerical', 'diagram', 'matching', 'case_study', 'practical_rubric'] as const;
/** Knowledge levels used in outcome-based education, alongside Bloom. */
export const K_LEVELS = ['K1', 'K2', 'K3', 'K4', 'K5', 'K6'] as const;

export interface TypeConfig {
  pairs?: { left: string; right: string }[];
  passage?: string;
  subQuestions?: { text: string; marks: number }[];
  labels?: string[];
  imageUrl?: string;
  rubricId?: string;
}

/** What is wrong with a question's type-specific shape, or null. */
export function typeConfigProblem(type: string, cfg: TypeConfig | null | undefined, marks: number): string | null {
  if (type === 'matching') {
    if (!cfg?.pairs || cfg.pairs.length < 2) return 'A matching question needs at least two pairs';
    if (cfg.pairs.some((p) => !p.left.trim() || !p.right.trim())) return 'Fill in both sides of every pair';
    if (new Set(cfg.pairs.map((p) => p.left.trim().toLowerCase())).size !== cfg.pairs.length) return 'Each item on the left must be different';
  }
  if (type === 'case_study') {
    if (!cfg?.passage || cfg.passage.trim().length < 20) return 'Add the case study passage';
    if (!cfg.subQuestions?.length) return 'Add at least one question on the case';
    const total = cfg.subQuestions.reduce((n, q) => n + q.marks, 0);
    if (total !== marks) return `The parts add up to ${total} marks but the question is worth ${marks}`;
  }
  if (type === 'diagram' && cfg && (!cfg.labels || cfg.labels.length < 1)) return 'List the parts to be labelled';
  if (type === 'practical_rubric' && !cfg?.rubricId) return 'Choose the rubric that marks this practical';
  return null;
}

/** A question that may go on a paper. */
export interface Candidate {
  id: string;
  bloom: string;
  difficulty: string;
  coId: string | null;
  marks: number;
  type: string;
  /** Asked in one of the last few papers: used only when the blueprint cannot be met without it. */
  recent: boolean;
}

/** A small seeded random generator, so the same seed gives the same paper. */
export function seeded(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Problems with a blueprint on its own (before any questions are looked at); empty when it is sound. */
export function blueprintProblems(sections: BlueprintSection[], totalMarks: number): string[] {
  const out: string[] = [];
  let sum = 0;
  sections.forEach((s, i) => {
    const at = `Section ${i + 1} (${s.name})`;
    sum += s.count * s.questionMarks;
    if (Object.values(s.bloom ?? {}).reduce((a, b) => a + b, 0) > s.count) out.push(`${at}: Bloom counts add up to more than ${s.count}`);
    if (Object.values(s.difficulty ?? {}).reduce((a, b) => a + b, 0) > s.count) out.push(`${at}: difficulty counts add up to more than ${s.count}`);
    if (new Set(s.coverage ?? []).size > s.count) out.push(`${at}: more outcomes to cover than questions`);
    for (const k of Object.keys(s.bloom ?? {})) if (!(BLOOM as readonly string[]).includes(k)) out.push(`${at}: unknown Bloom level ${k}`);
    for (const k of Object.keys(s.difficulty ?? {})) if (!(DIFFICULTY as readonly string[]).includes(k)) out.push(`${at}: unknown difficulty ${k}`);
  });
  if (sum !== totalMarks) out.push(`Sections add up to ${sum} marks, not ${totalMarks}`);
  return out;
}

/** Why a section cannot be filled, in plain words (the first shortage found). */
function shortage(pool: Candidate[], s: BlueprintSection): string {
  if (pool.length < s.count) return `needs ${s.count} approved questions of ${s.questionMarks} marks${s.type ? ` (${s.type})` : ''}, only ${pool.length} exist`;
  for (const [b, n] of Object.entries(s.bloom ?? {})) {
    const have = pool.filter((c) => c.bloom === b).length;
    if (have < n) return `needs ${n} ${b} questions, only ${have} exist`;
  }
  for (const [d, n] of Object.entries(s.difficulty ?? {})) {
    const have = pool.filter((c) => c.difficulty === d).length;
    if (have < n) return `needs ${n} ${d} questions, only ${have} exist`;
  }
  for (const co of s.coverage ?? []) if (!pool.some((c) => c.coId === co)) return 'has an outcome with no question to cover it';
  return 'the Bloom, difficulty and outcome requirements cannot all be met together';
}

/**
 * Picks the questions of one section so every count in the blueprint is met exactly. Candidates are
 * shuffled with the seed; those not used recently come first, so repeats happen only when needed.
 */
export function pickSection(all: Candidate[], s: BlueprintSection, rnd: () => number): { ids: string[]; repeats: number } | { error: string } {
  const pool = all.filter((c) => c.marks === s.questionMarks && (!s.type || c.type === s.type));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  pool.sort((a, b) => Number(a.recent) - Number(b.recent));
  const n = pool.length;
  const needB: Record<string, number> = { ...(s.bloom ?? {}) };
  const needD: Record<string, number> = { ...(s.difficulty ?? {}) };
  let freeB = s.count - Object.values(needB).reduce((a, b) => a + b, 0);
  let freeD = s.count - Object.values(needD).reduce((a, b) => a + b, 0);
  const uncovered = new Set(s.coverage ?? []);
  // How many of each kind remain from position i on, to stop searching dead ends early.
  const suffix: Map<string, number>[] = Array.from({ length: n + 1 }, () => new Map());
  for (let i = n - 1; i >= 0; i--) {
    const m = new Map(suffix[i + 1]);
    for (const k of [`b:${pool[i].bloom}`, `d:${pool[i].difficulty}`, ...(pool[i].coId ? [`c:${pool[i].coId}`] : [])]) m.set(k, (m.get(k) ?? 0) + 1);
    suffix[i] = m;
  }
  const chosen: Candidate[] = [];
  let nodes = 0;
  let maxRecent = 0;
  let recentUsed = 0;
  const feasible = (i: number) => {
    if (n - i < s.count - chosen.length) return false;
    for (const [b, k] of Object.entries(needB)) if (k > 0 && (suffix[i].get(`b:${b}`) ?? 0) < k) return false;
    for (const [d, k] of Object.entries(needD)) if (k > 0 && (suffix[i].get(`d:${d}`) ?? 0) < k) return false;
    for (const co of uncovered) if (!suffix[i].get(`c:${co}`)) return false;
    return uncovered.size <= s.count - chosen.length;
  };
  const dfs = (i: number): boolean => {
    if (chosen.length === s.count) return uncovered.size === 0 && Object.values(needB).every((v) => v === 0) && Object.values(needD).every((v) => v === 0);
    if (i >= n || ++nodes > 200_000 || !feasible(i)) return false;
    const c = pool[i];
    const bSpec = c.bloom in needB;
    const dSpec = c.difficulty in needD;
    if ((bSpec ? needB[c.bloom] > 0 : freeB > 0) && (dSpec ? needD[c.difficulty] > 0 : freeD > 0) && (!c.recent || recentUsed < maxRecent)) {
      if (c.recent) recentUsed++;
      const wasUncovered = !!c.coId && uncovered.delete(c.coId);
      if (bSpec) needB[c.bloom]--;
      else freeB--;
      if (dSpec) needD[c.difficulty]--;
      else freeD--;
      chosen.push(c);
      if (dfs(i + 1)) return true;
      chosen.pop();
      if (c.recent) recentUsed--;
      if (bSpec) needB[c.bloom]++;
      else freeB++;
      if (dSpec) needD[c.difficulty]++;
      else freeD++;
      if (wasUncovered && c.coId) uncovered.add(c.coId);
    }
    return dfs(i + 1);
  };
  // Fewest repeats first: allow no recently used question, then one, and so on.
  const recentCount = pool.filter((c) => c.recent).length;
  let ok = false;
  for (maxRecent = 0; maxRecent <= recentCount && !ok; maxRecent++) {
    nodes = 0;
    ok = dfs(0);
  }
  if (!ok) return { error: shortage(pool, s) };
  return { ids: chosen.map((c) => c.id), repeats: chosen.filter((c) => c.recent).length };
}
