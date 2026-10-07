import { describe, expect, it } from 'vitest';
import { bookValueAfter, depreciationSchedule, etaMinutes, haversineM } from './ops.js';

const asset = { costPaise: 100_000_00, salvagePaise: 10_000_00, usefulLifeYears: 5, method: 'slm', wdvRatePct: null };

describe('depreciation', () => {
  it('straight line writes off cost minus salvage evenly and ends at salvage', () => {
    const s = depreciationSchedule(asset);
    expect(s.map((r) => r.depreciationPaise)).toEqual([18_000_00, 18_000_00, 18_000_00, 18_000_00, 18_000_00]);
    expect(s[4].bookValuePaise).toBe(10_000_00);
  });
  it('written-down value takes a percentage of the opening book value and stops at salvage', () => {
    const s = depreciationSchedule({ ...asset, method: 'wdv', wdvRatePct: 40 });
    expect(s[0]).toMatchObject({ depreciationPaise: 40_000_00, bookValuePaise: 60_000_00 });
    expect(s[1].depreciationPaise).toBe(24_000_00);
    expect(s.every((r) => r.bookValuePaise >= 10_000_00)).toBe(true);
    expect(s[4].bookValuePaise).toBe(10_000_00);
  });
  it('book value after N years, capped at the useful life', () => {
    expect(bookValueAfter(asset, 0)).toBe(100_000_00);
    expect(bookValueAfter(asset, 2)).toBe(64_000_00);
    expect(bookValueAfter(asset, 9)).toBe(10_000_00);
  });
});

describe('bus maths', () => {
  it('measures distance and an ETA at the bus pace', () => {
    const m = haversineM({ lat: 12.9716, lng: 77.5946 }, { lat: 12.9816, lng: 77.5946 });
    expect(Math.round(m)).toBeGreaterThan(1100);
    expect(Math.round(m)).toBeLessThan(1120);
    expect(etaMinutes(m, 30)).toBe(3);
    expect(etaMinutes(m, 0)).toBe(4);
  });
});
