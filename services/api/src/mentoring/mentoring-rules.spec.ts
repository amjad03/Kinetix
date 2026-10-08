import { describe, expect, it } from 'vitest';
import { riskOf } from './mentoring-rules.js';

const base = { attendancePct: 90, attendanceDays: 20, failingMarks: 0, overdueFees: 0, openCases: 0 };

describe('riskOf', () => {
  it('is none for a student with no signals', () => {
    expect(riskOf(base, 75)).toMatchObject({ level: 'none', score: 0, signals: [] });
  });
  it('ignores attendance until there are enough days', () => {
    expect(riskOf({ ...base, attendancePct: 0, attendanceDays: 2 }, 75).level).toBe('none');
  });
  it('adds up signals into a level', () => {
    expect(riskOf({ ...base, attendancePct: 70 }, 75).level).toBe('medium');
    expect(riskOf({ ...base, attendancePct: 50, failingMarks: 2 }, 75)).toMatchObject({ level: 'high', score: 5 });
    expect(riskOf({ ...base, overdueFees: 1 }, 75).level).toBe('low');
  });
});
