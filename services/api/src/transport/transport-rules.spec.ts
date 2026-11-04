import { describe, expect, it } from 'vitest';
import { cancelCredit, changeDelta, lateMinutes, monthsBetween, moveDelta, occupancyPct, offRouteM, overlappingSlabs, parsePassCode, passValidUntil, routeSuggestions, seatDays, seatFee, slabFee, toSegmentM } from './transport-rules.js';

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

  it('credits the days given up and charges a move in a month already billed', () => {
    // Billed a full October at ₹3,100; the seat ends on the 21st (rides 1-20): 11 days come back, ₹1,100.
    expect(cancelCredit('2026-10', 3_100_00, '2026-06-01', '2026-10-21')).toBe(1_100_00);
    expect(cancelCredit('2026-10', 3_100_00, '2026-06-01', '2026-11-01')).toBe(0);
    // A seat that began on the 11th and ends on the 21st: billed 21 days (₹2,100), keeps 10 (₹1,000).
    expect(cancelCredit('2026-10', 3_100_00, '2026-10-11', '2026-10-21')).toBe(1_100_00);
    // A later month billed in advance comes back whole.
    expect(cancelCredit('2026-11', 3_000_00, '2026-06-01', '2026-10-21')).toBe(3_000_00);
    // Move on the 11th from ₹3,100 to ₹4,650: 21 days at the new rate (₹3,150) less 21 days given up (₹2,100).
    expect(moveDelta('2026-10', 3_100_00, 4_650_00, '2026-06-01', '2026-10-11')).toBe(1_050_00);
    expect(moveDelta('2026-10', 4_650_00, 3_100_00, '2026-06-01', '2026-10-11')).toBe(-1_050_00);
    // Billed old seat plus the move's delta equals what the month run gives both seats pro rata.
    const month = seatFee('2026-10', 3_100_00, '2026-06-01', null) + moveDelta('2026-10', 3_100_00, 4_650_00, '2026-06-01', '2026-10-11');
    expect(month).toBe(seatFee('2026-10', 3_100_00, '2026-06-01', '2026-10-11') + seatFee('2026-10', 4_650_00, '2026-10-11', null));
    expect(monthsBetween('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
    expect(monthsBetween('2026-11', '2026-10')).toEqual([]);
  });

  it('picks the fare slab by distance and finds overlapping slabs', () => {
    const slabs = [
      { fromKm: 0, toKm: 5, monthlyFeePaise: 1_200_00 },
      { fromKm: 5, toKm: 10, monthlyFeePaise: 1_800_00 },
      { fromKm: 10, toKm: 20, monthlyFeePaise: 2_400_00 },
    ];
    expect(slabFee(slabs, 0)).toBe(1_200_00);
    expect(slabFee(slabs, 5)).toBe(1_200_00);
    expect(slabFee(slabs, 5.01)).toBe(1_800_00);
    expect(slabFee(slabs, 20)).toBe(2_400_00);
    expect(slabFee(slabs, 21)).toBeNull();
    expect(slabFee(slabs, null)).toBeNull();
    expect(overlappingSlabs(slabs)).toEqual([]);
    expect(overlappingSlabs([...slabs, { fromKm: 8, toKm: 12, monthlyFeePaise: 1 }])).toEqual([[1, 3], [2, 3]]);
  });

  it('works out lateness, the pass code and occupancy suggestions', () => {
    expect(lateMinutes('07:20', 12, '07:25')).toBe(7);
    expect(lateMinutes('07:00', 5, '07:25')).toBe(0);
    expect(lateMinutes('07:00', null, '07:25')).toBeNull();
    expect(lateMinutes('07:00', 5, null)).toBeNull();
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
    const st = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
    expect(parsePassCode(`KXBUS:${id}:${st}`)).toEqual({ assignmentId: id, studentId: st });
    expect(parsePassCode('KXLIB:123')).toBeNull();
    expect(occupancyPct(30, 40)).toBe(75);
    expect(occupancyPct(3, null)).toBeNull();
    const here = [{ lat: 12.97, lng: 77.59 }];
    const near = [{ lat: 12.975, lng: 77.59 }];
    const far = [{ lat: 13.5, lng: 77.59 }];
    const s = routeSuggestions(
      [
        { id: 'a', name: 'A', vehicleId: 'v1', regNo: 'V1', capacity: 40, riders: 44, stops: here },
        { id: 'b', name: 'B', vehicleId: 'v2', regNo: 'V2', capacity: 52, riders: 30, stops: near },
        { id: 'c', name: 'C', vehicleId: 'v3', regNo: 'V3', capacity: 32, riders: 8, stops: far },
        { id: 'd', name: 'D', vehicleId: null, regNo: null, capacity: null, riders: 5, stops: far },
      ],
      [{ id: 'v9', regNo: 'V9', capacity: 17 }],
    );
    expect(s).toEqual([
      { kind: 'over', routeId: 'a', riders: 44, capacity: 40, moveTo: { routeId: 'b', seats: 22 } },
      { kind: 'low', routeId: 'c', riders: 8, capacity: 32, vehicle: { id: 'v9', regNo: 'V9', capacity: 17 } },
      { kind: 'no_vehicle', routeId: 'd', riders: 5, vehicle: { id: 'v9', regNo: 'V9', capacity: 17 } },
    ]);
    // An over-full route and an under-used one whose vehicles fit each other's riders: swap them.
    expect(routeSuggestions([{ id: 'a', name: 'A', vehicleId: 'v1', regNo: 'V1', capacity: 17, riders: 20, stops: here }, { id: 'b', name: 'B', vehicleId: 'v2', regNo: 'V2', capacity: 52, riders: 12, stops: far }], [])).toEqual([{ kind: 'swap', routeId: 'a', withRouteId: 'b' }]);
  });
});

describe('passValidUntil', () => {
  it('runs whole calendar months to the day before the same date', () => {
    expect(passValidUntil('2026-06-01', 12)).toBe('2027-05-31');
    expect(passValidUntil('2026-06-15', 1)).toBe('2026-07-14');
  });
  it('clamps a month-end start to the shorter month, and handles leap years', () => {
    expect(passValidUntil('2026-01-31', 1)).toBe('2026-02-28');
    expect(passValidUntil('2027-12-31', 2)).toBe('2028-02-29');
    expect(passValidUntil('2028-01-30', 1)).toBe('2028-02-29');
    expect(passValidUntil('2026-01-28', 1)).toBe('2026-02-27');
  });
});
