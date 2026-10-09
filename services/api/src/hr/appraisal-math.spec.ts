import { describe, expect, it } from 'vitest';
import { APPRAISAL_MAX, gradeFor, percentOf, scoreProblems } from './appraisal-math.js';

describe('appraisal math', () => {
  it('turns scores into a percentage of the whole form', () => {
    expect(percentOf({ teaching_learning: { score: 100 }, research: { score: 50 } })).toBe(Math.round((150 / APPRAISAL_MAX) * 10000) / 100);
    expect(percentOf({})).toBe(0);
  });
  it('flags unknown categories and scores above the maximum', () => {
    expect(scoreProblems({ teaching_learning: { score: 101 }, made_up: { score: 1 } })).toHaveLength(2);
    expect(scoreProblems({ research: { score: 40 } })).toEqual([]);
  });
  it('grades by band', () => {
    expect([90, 75, 60, 45, 10].map(gradeFor)).toEqual(['Outstanding', 'Very good', 'Good', 'Satisfactory', 'Needs improvement']);
  });
});
