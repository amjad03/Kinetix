/** Quiz rules of the LMS pass: option shuffling per attempt, negative marking, proctoring signals and the review policy. */
import type { QuizEventKind } from '../db/schema-lms.js';
import { gradeAnswer } from './lms-access.js';

/** A shuffled order of n options (Fisher-Yates). `order[shown] = original index`. */
export function permutation(n: number, rand: () => number = Math.random): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** The options a student picked, as positions in the order they were shown, back to the question's own positions. */
export function toOriginal(given: unknown, order: number[] | undefined): unknown {
  if (!order) return given;
  const map = (x: unknown) => (Number.isInteger(Number(x)) && Number(x) >= 0 && Number(x) < order.length ? order[Number(x)] : -1);
  if (Array.isArray(given)) return given.map(map);
  if (given === undefined || given === null || given === '') return given;
  return map(given);
}

const blank = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

export interface ScoredAnswer {
  correct: boolean | null;
  marks: number;
  note?: string;
}

/**
 * Marks one answer. A wrong choice answer loses the question's own negative marks, or the quiz's share of its marks;
 * a question left blank loses nothing; short answers are never marked negative (a typo is not a guess).
 */
export function scoreAnswer(q: { kind: string; options: { text: string; correct: boolean }[]; answer: string; marks: number; negativeMarks?: number | null }, given: unknown, order: number[] | undefined, negativePct: number): ScoredAnswer | null {
  const g = gradeAnswer(q, toOriginal(given, order));
  if (!g) return null;
  if (g.correct) return g;
  if (blank(given)) return { correct: false, marks: 0, note: 'Not answered' };
  if (q.kind !== 'mcq' && q.kind !== 'multi') return g;
  const off = q.negativeMarks !== null && q.negativeMarks !== undefined ? Number(q.negativeMarks) : Math.round(((Number(q.marks) * negativePct) / 100) * 100) / 100;
  return off > 0 ? { correct: false, marks: -off, note: `${off} taken off for a wrong answer` } : g;
}

/** An attempt's total: the sum of its marks, never below zero. */
export const attemptTotal = (marks: number[]) => Math.max(0, Math.round(marks.reduce((s, m) => s + m, 0) * 100) / 100);

/** Signals that count as a violation; a network change is logged but not held against the student. */
export const VIOLATIONS: ReadonlySet<QuizEventKind> = new Set<QuizEventKind>(['tab_hidden', 'window_blur', 'fullscreen_exit', 'copy', 'paste', 'app_background', 'screenshot']);

/** After new signals: the attempt's violation count, whether to flag it for the teacher and whether to submit it now (strict). */
export function proctorVerdict(mode: 'off' | 'record' | 'strict', maxViolations: number, before: number, kinds: QuizEventKind[]): { violations: number; flagged: boolean; submit: boolean } {
  const violations = before + kinds.filter((k) => VIOLATIONS.has(k)).length;
  const over = violations >= maxViolations;
  return { violations, flagged: mode !== 'off' && over, submit: mode === 'strict' && over };
}

/** Whether a student may see the right answers of their submitted attempt now. */
export function canReview(review: 'never' | 'after_submit' | 'after_close', quiz: { status: string; closesAt: Date }, now: Date): boolean {
  if (review === 'never') return false;
  if (review === 'after_submit') return true;
  return quiz.status === 'closed' || now >= quiz.closesAt;
}
