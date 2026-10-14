import { describe, expect, it } from 'vitest';
import { loadStatus, parseDays, parsePeriods, periodsText, workingDays } from './planning-rules.js';

describe('planning rules', () => {
  it('reads weekday lists by name, number or range', () => {
    expect(parseDays('Mon,Tue,Wed')).toEqual([1, 2, 3]);
    expect(parseDays('1, 3 5')).toEqual([1, 3, 5]);
    expect(parseDays('Mon-Sat')).toEqual([1, 2, 3, 4, 5, 6]);
    expect(parseDays('monday,friday')).toEqual([1, 5]);
    expect(parseDays('Funday')).toBeNull();
    expect(parseDays('Sat-Mon')).toBeNull();
  });

  it('reads a bell schedule and explains what is wrong with it', () => {
    const p = parsePeriods('P1 9:00-9:55\nP2 09:55-10:50\nShort break 10:50-11:05 break\n11:05-12:00');
    expect(p).toEqual([
      { label: 'P1', startsAt: '09:00', endsAt: '09:55', kind: 'class' },
      { label: 'P2', startsAt: '09:55', endsAt: '10:50', kind: 'class' },
      { label: 'Short break', startsAt: '10:50', endsAt: '11:05', kind: 'break' },
      { label: 'P3', startsAt: '11:05', endsAt: '12:00', kind: 'class' },
    ]);
    expect(periodsText(p as Exclude<typeof p, string>).split('\n')[2]).toBe('Short break 10:50-11:05 break');
    expect(parsePeriods('भोजन 13:00-13:45 विराम')).toEqual([{ label: 'भोजन', startsAt: '13:00', endsAt: '13:45', kind: 'break' }]);
    expect(parsePeriods('ಊಟ 13:00-13:45 ವಿರಾಮ')).toEqual([{ label: 'ಊಟ', startsAt: '13:00', endsAt: '13:45', kind: 'break' }]);
    expect(parsePeriods('P1 10:00-09:00')).toMatch(/end after it starts/);
    expect(parsePeriods('P1 09:00-10:00\nP2 09:30-10:30')).toMatch(/starts before/);
    expect(parsePeriods('lunch')).toMatch(/Line 1/);
    expect(parsePeriods('  ')).toBe('Add at least one period');
  });

  it('counts working days by month, less holidays, plus compensatory days', () => {
    // 2026-11-02 is a Monday; Monday to Friday; the Wednesday is a holiday; the Saturday follows Monday.
    const m = workingDays('2026-11-02', '2026-11-08', [1, 2, 3, 4, 5], (d) => d === '2026-11-04', (d) => d === '2026-11-07');
    expect(m).toEqual([{ month: '2026-11', days: 5, holidays: 1, swaps: 1 }]);
    expect(workingDays('2026-10-30', '2026-11-02', [1, 2, 3, 4, 5], () => false, () => false).map((x) => x.days)).toEqual([1, 1]);
  });

  it('rates teaching load against the norm', () => {
    expect(loadStatus(18, 16)).toBe('over');
    expect(loadStatus(7, 16)).toBe('light');
    expect(loadStatus(16, 16)).toBe('ok');
  });
});
