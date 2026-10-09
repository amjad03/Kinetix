import { describe, expect, it } from 'vitest';
import { chartHref, hallSeats, parseWhole } from './exam-registration';

describe('exam registration helpers', () => {
  it('reads whole numbers within a range, and blank as none', () => {
    expect(parseWhole('', 0, 50)).toBeNull();
    expect(parseWhole(' 3 ', 0, 50)).toBe(3);
    expect(parseWhole('51', 0, 50)).toBeUndefined();
    expect(parseWhole('2.5', 0, 50)).toBeUndefined();
    expect(parseWhole('abc', 0, 50)).toBeUndefined();
  });

  it('counts the seats of a hall and links its chart', () => {
    expect(hallSeats({ rows: 8, benchesPerRow: 4, seatsPerBench: 2 })).toBe(64);
    expect(chartHref('s1', 2, 'r1')).toBe('/api/download?kind=seating-chart&id=s1&slot=2&room=r1');
  });
});
