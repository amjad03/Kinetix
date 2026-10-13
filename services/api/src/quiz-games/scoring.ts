import type { QuizAnswerSource, QuizStanding } from '@kinetix/shared';

// Live Quiz scoring. The board scores card-only games the same way when it is offline
// (apps/board/lib/features/live_quiz/quiz_scoring.dart): keep the two in step.

/** A right answer is worth this much before the speed bonus. */
export const BASE_POINTS = 500;
/** Up to this much more for answering fast in the Student App: all of it at once, none at the buzzer. */
export const SPEED_POINTS = 500;
/** Each right answer in a row after the first adds this much... */
export const STREAK_STEP = 100;
/** ...up to this much a question. */
export const STREAK_MAX = 500;

/** Points for one answer before the streak bonus: none when wrong; cards score without the speed bonus. */
export function answerPoints(correct: boolean, source: QuizAnswerSource, elapsedMs: number | null, seconds: number): number {
  if (!correct) return 0;
  if (source === 'card' || elapsedMs == null) return BASE_POINTS;
  const left = Math.min(1, Math.max(0, 1 - elapsedMs / (seconds * 1000)));
  return BASE_POINTS + Math.round(SPEED_POINTS * left);
}

/** The bonus for the [streak]th right answer in a row (1 = the first, no bonus). */
export function streakBonus(streak: number): number {
  return streak <= 1 ? 0 : Math.min(STREAK_MAX, (streak - 1) * STREAK_STEP);
}

export interface ScoredAnswer {
  index: number;
  studentId: string;
  correct: boolean;
  source: QuizAnswerSource;
  elapsedMs: number | null;
}

export interface Player {
  studentId: string;
  name: string;
  rollNo: string | null;
}

/**
 * The leaderboard after the first [revealed] questions: everyone who answered at least once,
 * best first (ties share a rank, then by name), and each answer's points by `index:studentId`.
 * A question with no answer from a student breaks their streak.
 */
export function scoreGame(seconds: number[], revealed: number, answers: ScoredAnswer[], players: Player[]): { standings: QuizStanding[]; points: Map<string, number> } {
  const byKey = new Map(answers.map((a) => [`${a.index}:${a.studentId}`, a]));
  const playing = new Set(answers.filter((a) => a.index < revealed).map((a) => a.studentId));
  const points = new Map<string, number>();
  const rows: Omit<QuizStanding, 'rank'>[] = [];
  for (const p of players) {
    if (!playing.has(p.studentId)) continue;
    let score = 0;
    let streak = 0;
    let correct = 0;
    for (let i = 0; i < revealed; i++) {
      const a = byKey.get(`${i}:${p.studentId}`);
      if (!a?.correct) {
        streak = 0;
        if (a) points.set(`${i}:${p.studentId}`, 0);
        continue;
      }
      streak++;
      correct++;
      const got = answerPoints(true, a.source, a.elapsedMs, seconds[i] ?? 20) + streakBonus(streak);
      points.set(`${i}:${p.studentId}`, got);
      score += got;
    }
    rows.push({ ...p, score, correct, streak });
  }
  rows.sort((a, b) => b.score - a.score || b.correct - a.correct || a.name.localeCompare(b.name));
  const standings: QuizStanding[] = [];
  for (const [i, r] of rows.entries()) {
    const prev = standings[i - 1];
    standings.push({ ...r, rank: prev && prev.score === r.score && prev.correct === r.correct ? prev.rank : i + 1 });
  }
  return { standings, points };
}
