import { describe, expect, it } from 'vitest';
import { expiringFirst, parseGraceDays, totalExpiring, type RetentionClass } from './retention';

const cls = (sectionName: string, expiringSoon: number): RetentionClass => ({ sectionId: sectionName, sectionName, total: 10, kept: 0, expiringSoon, nextExpiresOn: null });

describe('recording retention', () => {
  it('reads the grace period: whole days from 0 to 90', () => {
    expect(parseGraceDays('7')).toBe(7);
    expect(parseGraceDays(' 0 ')).toBe(0);
    expect(parseGraceDays('90')).toBe(90);
    expect(parseGraceDays('91')).toBeNull();
    expect(parseGraceDays('-1')).toBeNull();
    expect(parseGraceDays('2.5')).toBeNull();
    expect(parseGraceDays('')).toBeNull();
  });

  it('lists classes with recordings about to go first', () => {
    const list = [cls('BCom Sem 3 A', 0), cls('BCA Sem 1 A', 4), cls('MCom Sem 1 A', 4)];
    expect(expiringFirst(list).map((c) => c.sectionName)).toEqual(['BCA Sem 1 A', 'MCom Sem 1 A', 'BCom Sem 3 A']);
    expect(totalExpiring(list)).toBe(8);
  });
});
