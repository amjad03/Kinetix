import { describe, expect, it } from 'vitest';
import { dietBill, dietRate, genderFits, messBill, minutesLate, overlapDays, parseCategoryPoints, priority, settle } from './hostel-rules.js';

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

  it('adds reserved-category points to the priority', () => {
    const pts = parseCategoryPoints('SC:20, st : 20, pwd:25, bogus:5, obc:x');
    expect(pts).toEqual({ sc: 20, st: 20, pwd: 25 });
    const w = { distance: 1, merit: 1, seniority: 1 };
    expect(priority({ distanceKm: 300, meritScore: 80, term: 1, category: 'SC' }, w, pts)).toBe(30 + 80 + 10 + 20);
    expect(priority({ distanceKm: 300, meritScore: 80, term: 1, category: 'general' }, w, pts)).toBe(120);
  });

  it('bills the diet system: diets eaten at the month rate plus the establishment charge', () => {
    // 31 days on the plan, 4 days away (two overlapping leaves) → 27 diets at ₹95.50 + ₹600 establishment.
    const b = dietBill('2026-10', { startsOn: '2026-01-01', endedOn: null }, { monthlyFeePaise: 600_00 }, [{ fromOn: '2026-10-03', toOn: '2026-10-05' }, { fromOn: '2026-10-05', toOn: '2026-10-06' }], 95_50);
    expect(b).toMatchObject({ days: 31, leaveDays: 4, diets: 27, dietRatePaise: 95_50, establishmentPaise: 600_00, grossPaise: 27 * 95_50 + 600_00, netPaise: 3_178_50 });
    // Joined on the 17th: 15 days, establishment pro rata (600 × 15/31 = 290.32), leave before joining ignored.
    const j = dietBill('2026-10', { startsOn: '2026-10-17', endedOn: null }, { monthlyFeePaise: 600_00 }, [{ fromOn: '2026-10-10', toOn: '2026-10-18' }], 100_00);
    expect(j).toMatchObject({ days: 15, leaveDays: 2, diets: 13, establishmentPaise: 290_32, netPaise: 13 * 100_00 + 290_32 });
    expect(dietRate(2_57_850_00, 2_700)).toBe(95_50);
    expect(dietRate(1_000_00, 0)).toBe(0);
  });

  it('counts minutes late after curfew, past midnight, or after the pass ran out', () => {
    expect(minutesLate({ time: '20:59:00' }, '21:00')).toBe(0);
    expect(minutesLate({ time: '21:40:30' }, '21:00')).toBe(40);
    expect(minutesLate({ time: '00:15:00' }, '21:00')).toBe(195);
    expect(minutesLate({ time: '07:00:00' }, '21:00')).toBe(0);
    const back = new Date('2026-10-20T12:00:00Z');
    expect(minutesLate({ time: '18:00:00' }, '21:00', back, new Date('2026-10-20T12:30:00Z'))).toBe(30);
  });
});
