import { describe, expect, it } from 'vitest';
import { changeDelta, offRouteM, seatDays, seatFee, toSegmentM } from './transport-rules.js';

describe('transport rules', () => {
  it('charges a full month or the days ridden', () => {
    expect(seatDays('2026-10', '2026-06-01', null)).toBe(31);
    expect(seatFee('2026-10', 3_100_00, '2026-06-01', null)).toBe(3_100_00);
    expect(seatDays('2026-10', '2026-10-11', null)).toBe(21);
    expect(seatFee('2026-10', 3_100_00, '2026-10-11', null)).toBe(2_100_00);
    // Moved on the 11th: the old seat counts 1-10, the new one 11-31; together a full month.
    expect(seatDays('2026-10', '2026-06-01', '2026-10-11')).toBe(10);
    expect(seatFee('2026-10', 3_100_00, '2026-06-01', '2026-10-11') + seatFee('2026-10', 3_100_00, '2026-10-11', null)).toBe(3_100_00);
    expect(seatDays('2026-10', '2026-11-01', null)).toBe(0);
    expect(seatDays('2026-10', '2026-01-01', '2026-09-30')).toBe(0);
  });

  it('works out the fee difference for the rest of the month', () => {
    expect(changeDelta('2026-10-11', 3_100_00, 4_650_00)).toBe(1_050_00);
    expect(changeDelta('2026-10-11', 4_650_00, 3_100_00)).toBe(-1_050_00);
    expect(changeDelta('2026-10-01', 1_000_00, 1_000_00)).toBe(0);
  });

  it('measures how far a bus is from its route', () => {
    const a = { lat: 12.96, lng: 77.59 };
    const b = { lat: 12.97, lng: 77.59 };
    expect(toSegmentM({ lat: 12.965, lng: 77.59 }, a, b)).toBeLessThan(1);
    expect(Math.round(toSegmentM({ lat: 12.965, lng: 77.595 }, a, b) / 10) * 10).toBe(540);
    expect(offRouteM({ lat: 12.98, lng: 77.59 }, [a, b])).toBeGreaterThan(1000);
    expect(offRouteM({ lat: 12.98, lng: 77.59 }, [])).toBeNull();
  });
});
