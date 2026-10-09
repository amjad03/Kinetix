import { describe, expect, it } from 'vitest';
import { typeConfigProblem } from '../question-bank/blueprint.js';
import { integritySeverity, nextAttempt, rubricMax, rubricProblems, scoreRubric, similarity, similarPairs } from './assessment-logic.js';

const rubric = [
  { name: 'Method', levels: [{ label: 'Full', points: 4 }, { label: 'Partial', points: 2 }, { label: 'None', points: 0 }] },
  { name: 'Accuracy', levels: [{ label: 'Full', points: 3 }, { label: 'None', points: 0 }] },
];

describe('rubrics', () => {
  it('totals a marking and knows the most it can award', () => {
    expect(rubricMax(rubric)).toBe(7);
    expect(scoreRubric(rubric, [1, 0])).toEqual({ total: 5, max: 7 });
    expect(() => scoreRubric(rubric, [1])).toThrow(/each of the 2/);
    expect(() => scoreRubric(rubric, [5, 0])).toThrow(/"Method" has no level 6/);
  });
  it('reports a rubric that cannot mark fairly', () => {
    expect(rubricProblems(rubric)).toEqual([]);
    expect(rubricProblems([])).toEqual(['Add at least one criterion']);
    expect(rubricProblems([{ name: 'A', levels: [{ label: 'x', points: 1 }] }])).toEqual(['"A" needs at least two levels']);
    expect(rubricProblems([{ name: 'A', levels: [{ label: 'x', points: 1 }, { label: 'y', points: 1 }] }])).toEqual(['"A" has two levels worth the same points']);
  });
});

describe('reattempts and integrity', () => {
  it('counts the first sitting as an attempt', () => {
    expect(nextAttempt(1, 2)).toEqual({ ok: true, attemptNo: 2 });
    expect(nextAttempt(2, 2)).toMatchObject({ ok: false });
    expect(nextAttempt(1, 1)).toMatchObject({ ok: false, reason: expect.stringContaining('1 attempt ') });
  });
  it('raises severity as an event repeats', () => {
    expect(integritySeverity('tab_switch', 0)).toBe('low');
    expect(integritySeverity('copy_paste', 0)).toBe('medium');
    expect(integritySeverity('tab_switch', 6)).toBe('medium');
    expect(integritySeverity('copy_paste', 9)).toBe('high');
    expect(integritySeverity('network_loss', 0)).toBe('low');
  });
  it('finds copied answers by shared three-word phrases', () => {
    const a = 'The accrual concept requires revenue to be recorded when earned and expenses when incurred regardless of cash movement';
    const copy = 'Accrual concept requires revenue to be recorded when earned and expenses when incurred regardless of cash flow';
    const own = 'Matching principle pairs costs with the income they helped to create in the same period';
    expect(similarity(a, a)).toBe(1);
    expect(similarity(a, copy)).toBeGreaterThan(0.5);
    expect(similarity(a, own)).toBe(0);
    expect(similarity('too short', 'too short')).toBe(0);
    const pairs = similarPairs([{ studentId: 's1', text: a }, { studentId: 's2', text: copy }, { studentId: 's3', text: own }], 0.5);
    expect(pairs).toHaveLength(1);
    expect(similarPairs([{ studentId: 's1', text: a }, { studentId: 's1', text: a }], 0.5)).toEqual([]);
    expect(pairs[0]).toMatchObject({ a: 's1', b: 's2' });
  });
});

describe('question types', () => {
  it('checks the shape of a matching, case-study, diagram and practical question', () => {
    expect(typeConfigProblem('matching', { pairs: [{ left: 'Debit', right: 'Left side' }] }, 2)).toContain('two pairs');
    expect(typeConfigProblem('matching', { pairs: [{ left: 'Debit', right: 'Left' }, { left: 'debit', right: 'Right' }] }, 2)).toContain('different');
    expect(typeConfigProblem('matching', { pairs: [{ left: 'Debit', right: 'Left' }, { left: 'Credit', right: 'Right' }] }, 2)).toBeNull();
    const passage = 'A company issued 1,000 shares of Rs 10 each at a premium of Rs 2.';
    expect(typeConfigProblem('case_study', { passage, subQuestions: [{ text: 'Journal entry', marks: 3 }, { text: 'Premium', marks: 2 }] }, 6)).toContain('add up to 5');
    expect(typeConfigProblem('case_study', { passage, subQuestions: [{ text: 'Journal entry', marks: 3 }, { text: 'Premium', marks: 2 }] }, 5)).toBeNull();
    expect(typeConfigProblem('case_study', { passage: 'short', subQuestions: [] }, 5)).toContain('passage');
    expect(typeConfigProblem('diagram', null, 3)).toBeNull();
    expect(typeConfigProblem('diagram', { labels: [] }, 3)).toContain('parts');
    expect(typeConfigProblem('practical_rubric', {}, 10)).toContain('rubric');
    expect(typeConfigProblem('mcq', null, 1)).toBeNull();
  });
});
