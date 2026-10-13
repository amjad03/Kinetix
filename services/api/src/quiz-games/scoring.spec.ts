import { describe, expect, it } from 'vitest';
import { answerPoints, scoreGame, streakBonus } from './scoring.js';

// The same cases are in apps/board/test/live_quiz_test.dart (the board scores offline games).
describe('Live Quiz scoring', () => {
  it('a right app answer earns 500 plus up to 500 for speed; a card earns 500; a wrong one nothing', () => {
    expect(answerPoints(true, 'app', 0, 20)).toBe(1000);
    expect(answerPoints(true, 'app', 5000, 20)).toBe(875);
    expect(answerPoints(true, 'app', 20_000, 20)).toBe(500);
    expect(answerPoints(true, 'app', 25_000, 20)).toBe(500);
    expect(answerPoints(true, 'card', null, 20)).toBe(500);
    expect(answerPoints(true, 'card', 0, 20)).toBe(500);
    expect(answerPoints(false, 'app', 0, 20)).toBe(0);
  });

  it('a streak adds 100 for each right answer in a row after the first, up to 500', () => {
    expect([1, 2, 3, 6, 7, 20].map(streakBonus)).toEqual([0, 100, 200, 500, 500, 500]);
  });

  it('ranks players by score, breaks streaks on a wrong or missed answer and shares ranks on ties', () => {
    const players = [
      { studentId: 'a', name: 'Asha', rollNo: '1' },
      { studentId: 'b', name: 'Bala', rollNo: '2' },
      { studentId: 'c', name: 'Chitra', rollNo: '3' },
      { studentId: 'd', name: 'Dev', rollNo: '4' },
      { studentId: 'e', name: 'Esha', rollNo: '5' },
    ];
    const answers = [
      // Asha: right fast, right fast, right fast (streak 3).
      { index: 0, studentId: 'a', correct: true, source: 'app' as const, elapsedMs: 0 },
      { index: 1, studentId: 'a', correct: true, source: 'app' as const, elapsedMs: 0 },
      { index: 2, studentId: 'a', correct: true, source: 'app' as const, elapsedMs: 5000 },
      // Bala: cards, right, missed, right.
      { index: 0, studentId: 'b', correct: true, source: 'card' as const, elapsedMs: null },
      { index: 2, studentId: 'b', correct: true, source: 'card' as const, elapsedMs: null },
      // Chitra and Dev the same: one right card answer each.
      { index: 1, studentId: 'c', correct: true, source: 'card' as const, elapsedMs: null },
      { index: 1, studentId: 'd', correct: true, source: 'card' as const, elapsedMs: null },
      // Esha only got it wrong; still on the board, with 0.
      { index: 0, studentId: 'e', correct: false, source: 'app' as const, elapsedMs: 1000 },
    ];
    const { standings, points } = scoreGame([10, 10, 20], 3, answers, players);
    expect(standings.map((s) => [s.name, s.score, s.rank, s.streak, s.correct])).toEqual([
      ['Asha', 1000 + 1100 + 1075, 1, 3, 3],
      ['Bala', 1000, 2, 1, 2],
      ['Chitra', 500, 3, 0, 1],
      ['Dev', 500, 3, 0, 1],
      ['Esha', 0, 5, 0, 0],
    ]);
    expect(points.get('1:a')).toBe(1100);
    expect(points.get('0:e')).toBe(0);
    // Only revealed questions count.
    const early = scoreGame([10, 10, 20], 1, answers, players).standings;
    expect(early.map((s) => s.name)).toEqual(['Asha', 'Bala', 'Esha']);
  });
});
