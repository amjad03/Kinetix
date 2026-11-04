import { describe, expect, it } from 'vitest';
import { attendancePct } from './attendance-rules.js';
import { ruleDate } from './eligibility.js';
import { tallyPct } from './policy.js';

describe('audit: attendance follow-ups', () => {
  it('AT-5: the dated rule is looked up for the institution’s local date, not the UTC date', () => {
    // 00:30 IST on 5 November is still 4 November in UTC.
    expect(ruleDate(undefined, new Date('2026-11-04T19:00:00Z'), 'Asia/Kolkata')).toBe('2026-11-05');
    expect(ruleDate(undefined, new Date('2026-11-04T17:00:00Z'), 'Asia/Kolkata')).toBe('2026-11-04');
    expect(ruleDate('2026-01-01', new Date('2026-11-04T19:00:00Z'), 'Asia/Kolkata')).toBe('2026-01-01');
  });

  it('AT-4: on-duty sessions count as attended when the rule says so, and are left out otherwise', () => {
    // 60 present, 10 absent, 10 on duty.
    expect(attendancePct(60, 0, 10, { onDuty: 10, onDutyCounts: true })).toBe(87.5);
    expect(attendancePct(60, 0, 10, { onDuty: 10, onDutyCounts: false })).toBe(85.7);
    expect(attendancePct(60, 0, 10)).toBe(85.7);
    expect(attendancePct(0, 0, 0, { onDuty: 3, onDutyCounts: false })).toBeNull();
    expect(attendancePct(0, 0, 0, { onDuty: 3, onDutyCounts: true })).toBe(100);
  });

  it('eligibility tallies are cut off, never rounded up (same rule as AT-1)', () => {
    // 599 of 799 = 74.97%: must read 74.9 and stay short of a 75% rule.
    expect(tallyPct(599, 799)).toBe(74.9);
    expect(tallyPct(3, 4)).toBe(75);
    expect(tallyPct(0, 0)).toBeNull();
  });
});
