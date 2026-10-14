import { describe, expect, it } from 'vitest';
import { driveMoves, inRound, offerable, type Registration, type Round } from './placements-depth';

const round = (seq: number): Round => ({ id: `r${seq}`, seq, name: `Round ${seq}`, kind: 'interview', scheduledOn: null });
const reg = (id: string, status: Registration['status'], results: [string, 'pass' | 'fail' | 'absent'][] = []): Registration => ({ id, studentId: `s-${id}`, fullName: id, rollNo: id, status, cgpaAt: 8, backlogsAt: 0, rounds: results.map(([roundId, result]) => ({ roundId, result, note: '' })) });

describe('drive moves', () => {
  it('follows the API: a draft opens, a closed drive completes, a finished one goes nowhere', () => {
    expect(driveMoves('draft')).toEqual(['open', 'cancelled']);
    expect(driveMoves('closed')).toContain('completed');
    expect(driveMoves('completed')).toEqual([]);
    expect(driveMoves('nonsense')).toEqual([]);
  });
});

describe('who sits a round and who gets an offer', () => {
  const rounds = [round(1), round(2)];
  const regs = [reg('a', 'shortlisted', [['r1', 'pass'], ['r2', 'pass']]), reg('b', 'shortlisted', [['r1', 'pass']]), reg('c', 'rejected', [['r1', 'fail']]), reg('d', 'registered'), reg('e', 'withdrawn')];

  it('takes into round 2 only those who passed round 1', () => {
    expect(inRound(regs, rounds, rounds[1]).map((r) => r.id)).toEqual(['a', 'b']);
    expect(inRound(regs, rounds, rounds[0]).map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('offers only to those through the final round, once', () => {
    expect(offerable(regs, rounds, []).map((r) => r.id)).toEqual(['a']);
    expect(offerable(regs, rounds, [{ registrationId: 'a' }])).toEqual([]);
    expect(offerable([reg('x', 'shortlisted')], [], []).map((r) => r.id)).toEqual(['x']);
  });
});
