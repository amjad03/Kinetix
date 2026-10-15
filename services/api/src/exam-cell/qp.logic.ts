/**
 * Pure rules of question paper setting: what a set covers (course outcomes, Bloom levels, units, difficulty) against
 * its blueprint, how far a setter has got, and the draw of the set that is used.
 */
import type { BlueprintSection } from '../db/schema.js';

export interface SetItem {
  section: number;
  marks: number;
  bloom: string;
  difficulty: string;
  coCode: string | null;
  unit: string | null;
}

export interface Coverage {
  totalMarks: number;
  questions: number;
  /** Marks per course outcome code ("none" for untagged questions). */
  byCo: Record<string, number>;
  byBloom: Record<string, number>;
  byUnit: Record<string, number>;
  byDifficulty: Record<string, number>;
  /** Share of marks at Bloom levels apply and above (higher-order thinking). */
  higherOrderPercent: number;
}

const add = (m: Record<string, number>, k: string, v: number) => {
  m[k] = (m[k] ?? 0) + v;
};

/** Marks of a set by outcome, Bloom level, unit and difficulty. */
export function coverage(items: SetItem[]): Coverage {
  const c: Coverage = { totalMarks: 0, questions: items.length, byCo: {}, byBloom: {}, byUnit: {}, byDifficulty: {}, higherOrderPercent: 0 };
  let higher = 0;
  for (const i of items) {
    c.totalMarks += i.marks;
    add(c.byCo, i.coCode ?? 'none', i.marks);
    add(c.byBloom, i.bloom, i.marks);
    add(c.byUnit, i.unit?.trim() || 'none', i.marks);
    add(c.byDifficulty, i.difficulty, i.marks);
    if (['apply', 'analyze', 'evaluate', 'create'].includes(i.bloom)) higher += i.marks;
  }
  c.higherOrderPercent = c.totalMarks ? Math.round((higher / c.totalMarks) * 1000) / 10 : 0;
  return c;
}

/**
 * Where a set departs from its blueprint (question counts by Bloom level and difficulty per section, and the outcomes
 * each section must cover) and from the course's outcomes (an outcome no question tests). Empty when it complies.
 */
export function blueprintGaps(sections: BlueprintSection[], items: (SetItem & { coId: string | null })[], courseCoCodes: { id: string; code: string }[]): string[] {
  const out: string[] = [];
  sections.forEach((s, idx) => {
    const mine = items.filter((i) => i.section === idx);
    const at = `Section ${idx + 1} (${s.name})`;
    if (mine.length !== s.count) out.push(`${at}: ${mine.length} questions, the blueprint asks for ${s.count}`);
    for (const [b, n] of Object.entries(s.bloom ?? {})) {
      const have = mine.filter((i) => i.bloom === b).length;
      if (have !== n) out.push(`${at}: ${have} ${b} question(s), the blueprint asks for ${n}`);
    }
    for (const [d, n] of Object.entries(s.difficulty ?? {})) {
      const have = mine.filter((i) => i.difficulty === d).length;
      if (have !== n) out.push(`${at}: ${have} ${d} question(s), the blueprint asks for ${n}`);
    }
    for (const co of s.coverage ?? []) if (!mine.some((i) => i.coId === co)) out.push(`${at}: ${courseCoCodes.find((c) => c.id === co)?.code ?? 'an outcome'} is not covered`);
  });
  const tested = new Set(items.map((i) => i.coId).filter(Boolean));
  for (const co of courseCoCodes) if (!tested.has(co.id)) out.push(`${co.code} is not tested anywhere in the paper`);
  return out;
}

/** Share of questions two sets have in common (0-100), so the office sees whether the sets really differ. */
export function overlapPercent(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const sb = new Set(b);
  const common = a.filter((x) => sb.has(x)).length;
  return Math.round((common / Math.min(a.length, b.length)) * 1000) / 10;
}

/** A setter's progress on an appointment, from the sets made for the subject. */
export function setterProgress(status: string, setsRequired: number, sets: { status: string }[]): 'appointed' | 'accepted' | 'declined' | 'cancelled' | 'in_progress' | 'submitted' | 'completed' {
  if (status === 'declined' || status === 'cancelled' || status === 'appointed') return status;
  const handedIn = sets.filter((s) => ['scrutiny', 'approved', 'locked'].includes(s.status)).length;
  const locked = sets.filter((s) => s.status === 'locked').length;
  if (locked >= setsRequired) return 'completed';
  if (handedIn >= setsRequired) return 'submitted';
  return sets.length ? 'in_progress' : 'accepted';
}

/** The next free set label (A, B, C ...). */
export function nextSetLabel(taken: (string | null)[]): string {
  const have = new Set(taken.filter(Boolean));
  for (let i = 0; i < 26; i++) {
    const l = String.fromCharCode(65 + i);
    if (!have.has(l)) return l;
  }
  return `S${have.size + 1}`;
}

/** Picks one of `n` sets from a random number in [0, 1). */
export const drawIndex = (n: number, r: number) => Math.min(n - 1, Math.floor(r * n));
