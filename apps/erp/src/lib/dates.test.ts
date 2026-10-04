import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, formatDate, hhmm, isIsoDate, isoWeekday, relativeTime, todayIn } from './dates';

describe('dates', () => {
  it('validates YYYY-MM-DD strictly', () => {
    expect(isIsoDate('2026-10-04')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('4 Oct')).toBe(false);
    expect(isIsoDate(undefined)).toBe(false);
  });

  it('works out today in the school time zone', () => {
    // 20:00 UTC on 3 Oct is 01:30 on 4 Oct in India.
    expect(todayIn('Asia/Kolkata', new Date('2026-10-03T20:00:00Z'))).toBe('2026-10-04');
    expect(todayIn('UTC', new Date('2026-10-03T20:00:00Z'))).toBe('2026-10-03');
  });

  it('steps across month ends and knows Sundays', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30');
    expect(isoWeekday('2026-10-04')).toBe(7);
    expect(isoWeekday('2026-10-05')).toBe(1);
    expect(daysBetween('2026-10-04', '2026-10-06')).toBe(2);
  });

  it('formats for people', () => {
    expect(formatDate('2026-10-04', 'short')).toBe('Sun, 4 Oct');
    expect(formatDate('2026-10-04', 'long')).toBe('Sunday, 4 October 2026');
    expect(hhmm('09:00:00')).toBe('09:00');
    const now = new Date('2026-10-04T12:00:00Z');
    expect(relativeTime('2026-10-04T11:59:40Z', now)).toBe('just now');
    expect(relativeTime('2026-10-04T11:30:00Z', now)).toBe('30 min ago');
    expect(relativeTime('2026-10-04T09:00:00Z', now)).toBe('3 h ago');
  });
});
