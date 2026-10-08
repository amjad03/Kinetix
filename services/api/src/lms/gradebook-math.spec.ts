import { describe, expect, it } from 'vitest';
import { letterGrade, percentOf, weightedGrade } from './gradebook-math.js';

describe('gradebook math', () => {
  it('computes percentages and ignores empty categories', () => {
    expect(percentOf(45, 60)).toBe(75);
    expect(percentOf(0, 0)).toBeNull();
  });
  it('weights categories and re-bases when one has no data', () => {
    expect(weightedGrade([{ weight: 40, percent: 80 }, { weight: 60, percent: 60 }])).toBe(68);
    expect(weightedGrade([{ weight: 40, percent: 80 }, { weight: 60, percent: null }])).toBe(80);
    expect(weightedGrade([{ weight: 100, percent: null }])).toBeNull();
  });
  it('maps letters', () => {
    expect([95, 85, 72, 61, 50, 49].map(letterGrade)).toEqual(['A+', 'A', 'B', 'C', 'D', 'F']);
    expect(letterGrade(null)).toBeNull();
  });
});
