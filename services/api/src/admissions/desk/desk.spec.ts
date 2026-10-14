import { describe, expect, it } from 'vitest';
import { nextInTurn, ruleMatches } from './assignment.js';
import { daysFrom, quoteRefund, slabFor, UGC_SLABS } from './refund.js';

describe('refund slabs (UGC defaults)', () => {
  it('counts days from the last date of admission', () => {
    expect(daysFrom('2026-07-31', '2026-07-01')).toBe(-30);
    expect(daysFrom('2026-07-31', '2026-08-10')).toBe(10);
  });

  it('picks the slab covering the day, the open-ended one last', () => {
    expect(slabFor(UGC_SLABS, -20)?.percent).toBe(100);
    expect(slabFor(UGC_SLABS, -15)?.percent).toBe(100);
    expect(slabFor(UGC_SLABS, -14)?.percent).toBe(90);
    expect(slabFor(UGC_SLABS, 0)?.percent).toBe(80);
    expect(slabFor(UGC_SLABS, 30)?.percent).toBe(50);
    expect(slabFor(UGC_SLABS, 31)?.percent).toBe(0);
  });

  it('takes the processing charge (5%, at most Rs 5,000) only from a full refund', () => {
    expect(quoteRefund(UGC_SLABS, 100_000, '2026-07-31', '2026-07-01')).toMatchObject({ percent: 100, deductionPaise: 5_000, refundPaise: 95_000 });
    expect(quoteRefund(UGC_SLABS, 50_000_000, '2026-07-31', '2026-07-01')).toMatchObject({ deductionPaise: 500_000, refundPaise: 49_500_000 });
    expect(quoteRefund(UGC_SLABS, 100_000, '2026-07-31', '2026-08-20')).toMatchObject({ percent: 50, refundPaise: 50_000 });
    expect(quoteRefund(UGC_SLABS, 0, '2026-07-31', '2026-07-01').refundPaise).toBe(0);
    // An institution with no slabs of its own gets the UGC ones.
    expect(quoteRefund([], 100_000, '2026-07-31', '2026-09-30').percent).toBe(0);
  });
});

describe('counsellor assignment rules', () => {
  const lead = { programId: 'p1', source: 'fair', city: 'Mysuru', region: 'Karnataka' };
  it('matches every condition a rule sets, the place against the city or the region', () => {
    expect(ruleMatches({ programId: null, source: null, region: null, active: true }, lead)).toBe(true);
    expect(ruleMatches({ programId: 'p1', source: 'fair', region: 'mysuru', active: true }, lead)).toBe(true);
    expect(ruleMatches({ programId: null, source: null, region: 'karnataka', active: true }, lead)).toBe(true);
    expect(ruleMatches({ programId: 'p2', source: null, region: null, active: true }, lead)).toBe(false);
    expect(ruleMatches({ programId: null, source: 'web', region: null, active: true }, lead)).toBe(false);
    expect(ruleMatches({ programId: null, source: null, region: null, active: false }, lead)).toBe(false);
  });

  it('takes turns, skipping counsellors no longer active', () => {
    const active = new Set(['a', 'c']);
    expect(nextInTurn(['a', 'b', 'c'], 0, active)).toEqual({ id: 'a', next: 1 });
    expect(nextInTurn(['a', 'b', 'c'], 1, active)).toEqual({ id: 'c', next: 0 });
    expect(nextInTurn(['a', 'b', 'c'], 2, new Set())).toBeNull();
  });
});
