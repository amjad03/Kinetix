import { describe, expect, it } from 'vitest';
import { GenericHttpGpsAdapter } from './gps-adapter.js';

describe('generic HTTP GPS adapter', () => {
  const a = new GenericHttpGpsAdapter();
  it('reads one fix, an array and a positions wrapper, upper-casing the registration', () => {
    expect(a.parse({ vehicle: 'ka01ab1234', lat: 12.9, lng: 77.5, speed: 30 })).toEqual([{ vehicle: 'KA01AB1234', lat: 12.9, lng: 77.5, speedKmh: 30 }]);
    expect(a.parse([{ regNo: 'KA01', lat: 1, lng: 2 }])).toHaveLength(1);
    expect(a.parse({ positions: [{ deviceId: 'KA02', lat: 1, lng: 2, speedKmh: 5 }, { lat: 1, lng: 2 }, { vehicle: 'X', lat: 99, lng: 0 }] })).toEqual([{ vehicle: 'KA02', lat: 1, lng: 2, speedKmh: 5 }]);
    expect(a.parse('nonsense')).toEqual([]);
  });
});
