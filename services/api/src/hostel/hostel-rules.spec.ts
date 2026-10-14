import { describe, expect, it } from 'vitest';
import { genderFits, messBill, overlapDays, priority, settle } from './hostel-rules.js';

describe('hostel rules', () => {
  it('ranks by distance, merit and seniority with the weights', () => {
    const w = { distance: 1, merit: 1, seniority: 1 };
    expect(priority({ distanceKm: 300, meritScore: 80, term: 1 }, w)).toBe(30 + 80 + 10);
    expect(priority({ distanceKm: 5000, meritScore: 120, term: 3 }, w)).toBe(100 + 100 + 30);
    expect(priority({ distanceKm: null, meritScore: null, term: 1 }, { distance: 2, merit: 0, seniority: 0.5 })).toBe(5);
  });

  it('counts overlapping days', () => {
    expect(overlapDays('2026-10-10', null, '2026-10-01', '2026-10-31')).toBe(22);
    expect(overlapDays('2026-09-01', '2026-10-05', '2026-10-01', '2026-10-31')).toBe(5);
    expect(overlapDays('2026-11-01', null, '2026-10-01', '2026-10-31')).toBe(0);
  });

  it('settles a mid-month vacate: unused fee and deposit back, damages and dues kept', () => {
    expect(settle({ vacatedOn: '2026-10-10', monthlyFeePaise: 31_000_00, refundUnusedFee: true, depositPaise: 5_000_00, damagesPaise: 1_000_00, duesPaise: 0 })).toEqual({ daysUsed: 10, daysInMonth: 31, prorataRefundPaise: 21_000_00, netRefundPaise: 25_000_00 });
    expect(settle({ vacatedOn: '2026-02-28', monthlyFeePaise: 28_000_00, refundUnusedFee: true, depositPaise: 0, damagesPaise: 0, duesPaise: 500_00 }).netRefundPaise).toBe(-500_00);
    expect(settle({ vacatedOn: '2026-10-10', monthlyFeePaise: 31_000_00, refundUnusedFee: false, depositPaise: 0, damagesPaise: 0, duesPaise: 0 }).prorataRefundPaise).toBe(0);
  });

  it('bills the mess with rebates only for long enough leave', () => {
    const fixed = { billing: 'fixed', monthlyFeePaise: 3_100_00, perDayPaise: 0, rebateMinDays: 3, rebatePerDayPaise: 0 };
    expect(messBill('2026-10', { startsOn: '2026-01-01', endedOn: null }, fixed, [])).toEqual({ days: 31, leaveDays: 0, rebateDays: 0, grossPaise: 3_100_00, rebatePaise: 0, netPaise: 3_100_00 });
    // 5 days of leave earn a rebate at the day's share; 2 days do not.
    const b = messBill('2026-10', { startsOn: '2026-01-01', endedOn: null }, fixed, [
      { fromOn: '2026-10-03', toOn: '2026-10-07' },
      { fromOn: '2026-10-20', toOn: '2026-10-21' },
    ]);
    expect(b).toMatchObject({ leaveDays: 7, rebateDays: 5, rebatePaise: 500_00, netPaise: 2_600_00 });
    // Joined mid-month on a per-day plan; a leave running into next month counts its days in this month.
    const perDay = { billing: 'per_day', monthlyFeePaise: 0, perDayPaise: 120_00, rebateMinDays: 3, rebatePerDayPaise: 100_00 };
    expect(messBill('2026-10', { startsOn: '2026-10-22', endedOn: null }, perDay, [{ fromOn: '2026-10-29', toOn: '2026-11-04' }])).toEqual({ days: 10, leaveDays: 3, rebateDays: 3, grossPaise: 1_200_00, rebatePaise: 300_00, netPaise: 900_00 });
    // A fixed plan for part of a month is charged pro rata.
    expect(messBill('2026-10', { startsOn: '2026-10-17', endedOn: null }, fixed, []).grossPaise).toBe(1_500_00);
  });

  it('matches gender rules', () => {
    expect(genderFits('boys', 'male')).toBe(true);
    expect(genderFits('boys', 'female')).toBe(false);
    expect(genderFits('girls', 'Female')).toBe(true);
    expect(genderFits('mixed', 'female')).toBe(true);
    expect(genderFits('girls', null)).toBe(true);
  });
});
