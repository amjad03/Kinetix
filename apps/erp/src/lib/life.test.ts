import { describe, expect, it } from 'vitest';
import { zonedIso } from './life';

describe('zonedIso', () => {
  it('reads a form date-time in the school time zone', () => {
    expect(zonedIso('2026-10-20T10:00', 'Asia/Kolkata')).toBe('2026-10-20T04:30:00.000Z');
    expect(zonedIso('2026-10-20T03:00', 'Asia/Kolkata')).toBe('2026-10-19T21:30:00.000Z');
    expect(zonedIso('2026-10-20T10:00', 'UTC')).toBe('2026-10-20T10:00:00.000Z');
  });

  it('leaves zoned, empty and unreadable values alone', () => {
    expect(zonedIso('2026-10-20T10:00:00Z', 'Asia/Kolkata')).toBe('2026-10-20T10:00:00Z');
    expect(zonedIso('2026-10-20T10:00+05:30', 'Asia/Kolkata')).toBe('2026-10-20T10:00+05:30');
    expect(zonedIso('', 'Asia/Kolkata')).toBeUndefined();
    expect(zonedIso(undefined, 'Asia/Kolkata')).toBeUndefined();
    expect(zonedIso('soon', 'Asia/Kolkata')).toBe('soon');
  });
});
