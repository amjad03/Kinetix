import { describe, expect, it } from 'vitest';
import { allocatePaid, daysBetween, lateFee, planProblem, splitInstalments } from '../fees/fees-depth.logic.js';
import { cqiState, frameworkScore, leafScore, scoreTree } from '../obe/quality.logic.js';
import { compositeScore, financialYearOf, fyMonths, loadBand, monthsBetween, overtimeAmount, quarterOf, ratingAverage, slotHours } from './hr-depth.logic.js';

describe('teaching evaluation', () => {
  it('weights the kinds of rater and leaves out kinds with no ratings', () => {
    expect(compositeScore([{ kind: 'student', count: 10, average: 4 }, { kind: 'hod', count: 1, average: 5 }, { kind: 'peer', count: 2, average: 3 }, { kind: 'self', count: 1, average: 5 }])).toBe(4.3);
    expect(compositeScore([{ kind: 'student', count: 10, average: 4 }, { kind: 'hod', count: 0, average: 0 }, { kind: 'peer', count: 0, average: 0 }, { kind: 'self', count: 1, average: 5 }])).toBe(4.27);
    expect(compositeScore([])).toBeNull();
    expect(ratingAverage({ a: 4, b: 5 })).toBe(4.5);
  });
});

describe('workload', () => {
  it('adds up period lengths and bands the load within 10% of the norm', () => {
    expect(slotHours('10:00:00', '10:55:00')).toBeCloseTo(0.9167, 3);
    expect(loadBand(15, 16)).toBe('within');
    expect(loadBand(14, 16)).toBe('under');
    expect(loadBand(18, 16)).toBe('over');
  });
});

describe('pay adjustments and the tax year', () => {
  it('works overtime from monthly gross at double the hourly rate, to the whole rupee', () => {
    expect(overtimeAmount(6_000_000, 10)).toBe(576_900);
    expect(overtimeAmount(6_000_000, 10, 1.5)).toBe(432_700);
  });
  it('counts the months of arrears and the financial year', () => {
    expect(monthsBetween('2026-08', '2026-10')).toBe(2);
    expect(monthsBetween('2026-10', '2026-08')).toBe(0);
    expect(financialYearOf('2026-03')).toBe('2025-26');
    expect(financialYearOf('2026-04')).toBe('2026-27');
    expect(fyMonths('2026-27')).toEqual(['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03']);
    expect([quarterOf('2026-04'), quarterOf('2026-09'), quarterOf('2026-12'), quarterOf('2027-02')]).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
  });
});

describe('fee instalments and late fees', () => {
  it('checks the plan, splits with the rounding on the last instalment, and allocates payments in order', () => {
    expect(planProblem([{ percent: 60, dueAfterDays: 0 }, { percent: 30, dueAfterDays: 30 }])).toMatch(/90%/);
    expect(planProblem([{ percent: 50, dueAfterDays: 30 }, { percent: 50, dueAfterDays: 30 }])).toMatch(/after/);
    expect(planProblem([{ percent: 50, dueAfterDays: 0 }, { percent: 50, dueAfterDays: 30 }])).toBeNull();
    const parts = splitInstalments(1_000_001, '2026-11-10', [{ percent: 33.33, dueAfterDays: 0 }, { percent: 33.33, dueAfterDays: 30 }, { percent: 33.34, dueAfterDays: 60 }]);
    expect(parts.reduce((a, p) => a + p.amountPaise, 0)).toBe(1_000_001);
    expect(parts.map((p) => p.dueOn)).toEqual(['2026-11-10', '2026-12-10', '2027-01-09']);
    const status = allocatePaid([{ seq: 1, dueOn: '2026-10-01', amountPaise: 100 }, { seq: 2, dueOn: '2026-10-30', amountPaise: 100 }, { seq: 3, dueOn: '2026-12-01', amountPaise: 100 }], 150, '2026-10-20').map((i) => i.status);
    expect(status).toEqual(['paid', 'partial', 'due']);
    expect(allocatePaid([{ seq: 1, dueOn: '2026-10-01', amountPaise: 100 }], 0, '2026-10-20')[0].status).toBe('overdue');
  });
  it('charges nothing in the grace days, then a flat fine plus a daily amount up to the cap', () => {
    const rule = { graceDays: 3, flatPaise: 5000, perDayPaise: 1000, capPaise: 20000 };
    expect(lateFee(rule, 3)).toEqual({ daysLate: 0, amountPaise: 0 });
    expect(lateFee(rule, 10)).toEqual({ daysLate: 7, amountPaise: 12000 });
    expect(lateFee(rule, 60)).toEqual({ daysLate: 57, amountPaise: 20000 });
    expect(lateFee({ ...rule, capPaise: null }, 60).amountPaise).toBe(62000);
    expect(daysBetween('2026-10-10', '2026-10-20')).toBe(10);
  });
});

describe('accreditation scoring and the CQI loop', () => {
  const node = (id: string, parentId: string | null, weight: number, target: number | null, actual: number | null) => ({ id, parentId, weight, target, actual });
  it('scores a leaf by the share of its target and caps it at 100', () => {
    expect(leafScore(90, 45)).toBe(50);
    expect(leafScore(90, 200)).toBe(100);
    expect(leafScore(null, 5)).toBeNull();
    expect(leafScore(0, 5)).toBeNull();
  });
  it('rolls scores up by weight, ignoring criteria with no figure', () => {
    const tree = [node('r1', null, 30, null, null), node('a', 'r1', 1, 10, 10), node('b', 'r1', 3, 10, 5), node('c', 'r1', 1, 10, null), node('r2', null, 10, 10, 0)];
    const scores = scoreTree(tree);
    expect(scores.get('r1')).toBe(62.5); // (100 x 1 + 50 x 3) / 4
    expect(scores.get('r2')).toBe(0);
    expect(frameworkScore(tree)).toBe(46.9); // (62.5 x 30 + 0 x 10) / 40
    expect(frameworkScore([])).toBeNull();
  });
  it('names where a CQI action stands', () => {
    const today = '2026-10-20';
    expect(cqiState({ status: 'open', remeasuredValue: null, targetValue: 65, remeasureOn: '2026-12-01' }, today)).toBe('planned');
    expect(cqiState({ status: 'in_progress', remeasuredValue: null, targetValue: 65, remeasureOn: null }, today)).toBe('in_progress');
    expect(cqiState({ status: 'in_progress', remeasuredValue: null, targetValue: 65, remeasureOn: '2026-10-01' }, today)).toBe('awaiting_remeasure');
    expect(cqiState({ status: 'done', remeasuredValue: 70, targetValue: 65, remeasureOn: null }, today)).toBe('effective');
    expect(cqiState({ status: 'in_progress', remeasuredValue: 60, targetValue: 65, remeasureOn: null }, today)).toBe('not_effective');
  });
});
