import { describe, expect, it } from 'vitest';
import { fitGrade, previewOutput } from './tasks.js';

const input = { question: 'Define depreciation.', answerText: 'It is the fall in value.', rubric: [{ criterion: 'Definition', marks: 3 }, { criterion: 'Example', marks: 2 }], maxMarks: 5, language: 'en' as const };

describe('marking drafts', () => {
  it('keeps each criterion inside its marks, in rubric order, in half marks', () => {
    const out = fitGrade(input, { criteria: [{ criterion: 'example', awarded: 9, comment: 'x' }, { criterion: 'Definition', awarded: 2.3, comment: 'y' }], total: 99, rationale: 'r' });
    expect(out.criteria.map((c) => [c.criterion, c.awarded])).toEqual([['Definition', 2.5], ['Example', 2]]);
    expect(out.total).toBe(4.5);
  });

  it('never goes above the marks of the question or below zero', () => {
    const out = fitGrade({ ...input, maxMarks: 4 }, { criteria: [{ criterion: 'Definition', awarded: 3, comment: '' }, { criterion: 'Example', awarded: 2, comment: '' }], total: 5, rationale: 'r' });
    expect(out.total).toBe(4);
    expect(fitGrade(input, { criteria: [{ criterion: 'Definition', awarded: -2, comment: '' }], total: 0, rationale: 'r' }).criteria[1].awarded).toBe(0);
  });

  it('the offline preview awards nothing', () => {
    const out = previewOutput('gradeAssist', input);
    expect(out.total).toBe(0);
    expect(out.criteria).toHaveLength(2);
  });
});
