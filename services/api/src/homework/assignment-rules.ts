/** Pure rules for assignment hand-ins: lateness, the late policy, the hard cut-off, attempts and marks. */

export interface HandInPolicy {
  /** The end of the due day for this student (their extension when they have one). */
  dueEnd: Date;
  /** The end of the cut-off day: nothing at all is taken after it. */
  cutoffEnd: Date | null;
  latePolicy: 'accept' | 'penalty' | 'reject';
  latePenaltyPct: number;
  maxAttempts: number;
}

export interface HandInVerdict {
  refusal: string | null;
  late: boolean;
  penaltyPct: number;
  attempt: number;
}

/** Whether a hand-in now is taken, and how: late, with what penalty, which attempt. Returned work may always be redone. */
export function handInVerdict(p: HandInPolicy, now: Date, prev: { attempts: number; returned: boolean } | null): HandInVerdict {
  const late = now.getTime() >= p.dueEnd.getTime();
  const attempt = prev ? prev.attempts + 1 : 1;
  const out = { late, penaltyPct: late && p.latePolicy === 'penalty' ? p.latePenaltyPct : 0, attempt };
  if (p.cutoffEnd && now.getTime() >= p.cutoffEnd.getTime()) return { ...out, refusal: 'This assignment is closed: the last date for late work has passed' };
  if (late && p.latePolicy === 'reject') return { ...out, refusal: 'The due date has passed and this assignment does not take late work' };
  if (prev && !prev.returned && prev.attempts >= p.maxAttempts) return { ...out, refusal: p.maxAttempts === 1 ? 'This assignment takes one hand-in' : `You have used all ${p.maxAttempts} attempts` };
  return { ...out, refusal: null };
}

/** Marks after the late penalty, rounded to two decimals; never below zero or above the maximum. */
export function markAfterPenalty(raw: number, max: number, penaltyPct: number): number {
  const v = Math.max(0, Math.min(max, raw)) * (1 - penaltyPct / 100);
  return Math.round(v * 100) / 100;
}
