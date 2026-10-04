import { describe, expect, it } from 'vitest';
import { distribution, formatMarks, hodResultClass, percent, resultCounts } from './results';

describe('results', () => {
  it('works out percentages and shows marks plainly', () => {
    expect(percent(18.7, 25)).toBeCloseTo(74.8);
    expect(percent(5, 0)).toBe(0);
    expect(formatMarks(19)).toBe('19');
    expect(formatMarks(22.5)).toBe('22.5');
    expect(formatMarks(18.75)).toBe('18.8');
    expect(formatMarks(null)).toBe('—');
  });

  it('bands the class by percentage, leaving absentees out', () => {
    // The seeded unit test, out of 25.
    const d = distribution([19, 22.5, 17, 24, 13, 20, 21.5, null, 16, 23, 18, 11.5], 25);
    expect(d.map((b) => b.count)).toEqual([0, 1, 1, 2, 2, 2, 3]);
    expect(d.reduce((s, b) => s + b.count, 0)).toBe(11);
    expect(d[0].label).toBe('Below 40%');
    expect(d[6].label).toBe('90–100%');
  });

  it('puts full marks and the band edges in the right place', () => {
    const d = distribution([100, 90, 89.9, 40, 39.9, 0], 100);
    expect(d.map((b) => b.count)).toEqual([2, 1, 0, 0, 0, 1, 2]);
  });

  it('counts entered, absent and missing marks', () => {
    const c = resultCounts([
      { id: '1', fullName: 'A', rollNo: '1', marks: 10, absent: false, remark: null },
      { id: '2', fullName: 'B', rollNo: '2', marks: null, absent: true, remark: null },
      { id: '3', fullName: 'C', rollNo: '3', marks: null, absent: false, remark: null },
      { id: '4', fullName: 'D', rollNo: '4', marks: 0, absent: false, remark: null },
    ]);
    expect(c).toEqual({ students: 4, entered: 2, absent: 1, missing: 1 });
  });
});

describe('hodResultClass', () => {
  const taught = new Set(['bca']);
  const dept = new Set(['bcom']);
  it('keeps taught and department classes even without assessments, and other classes only with some', () => {
    expect(hodResultClass('bca', 0, taught, dept)).toBe(true);
    expect(hodResultClass('bcom', 0, taught, dept)).toBe(true);
    expect(hodResultClass('mcom', 0, taught, dept)).toBe(false);
    expect(hodResultClass('mcom', 2, taught, dept)).toBe(true);
  });
});
