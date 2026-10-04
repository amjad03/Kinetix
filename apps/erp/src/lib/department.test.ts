import { describe, expect, it } from 'vitest';
import { deptQuery, flagsFor, formatPercent, headCandidates, movedSubjects, ofText, rangeFrom, rangeText, toneOf } from './department';

describe('department ranges', () => {
  const today = '2026-10-04'; // a Sunday

  it('defaults to this week, Monday to today', () => {
    expect(rangeFrom({}, today)).toEqual({ key: 'week', from: '2026-09-28', to: today });
    expect(rangeFrom({}, '2026-09-28')).toEqual({ key: 'week', from: '2026-09-28', to: '2026-09-28' });
    expect(rangeFrom({ range: 'nonsense' }, today).key).toBe('week');
  });

  it('has the last 30 days and a term (the 120 days the API allows)', () => {
    expect(rangeFrom({ range: 'month' }, today)).toEqual({ key: 'month', from: '2026-09-05', to: today });
    expect(rangeFrom({ range: 'term' }, today)).toEqual({ key: 'term', from: '2026-06-07', to: today });
  });

  it('takes a custom range, clamped to today and 120 days, either way round', () => {
    expect(rangeFrom({ from: '2026-09-01', to: '2026-09-15' }, today)).toEqual({ key: 'custom', from: '2026-09-01', to: '2026-09-15' });
    expect(rangeFrom({ from: '2026-09-15', to: '2026-09-01' }, today)).toEqual({ key: 'custom', from: '2026-09-01', to: '2026-09-15' });
    expect(rangeFrom({ from: '2026-09-01', to: '2027-01-01' }, today).to).toBe(today);
    expect(rangeFrom({ from: '2025-01-01', to: '2026-10-01' }, today)).toEqual({ key: 'custom', from: '2026-06-04', to: '2026-10-01' });
    expect(rangeFrom({ from: '2026-02-30' }, today).key).toBe('week');
  });

  it('writes the query string', () => {
    expect(deptQuery('d1', { key: 'week', from: 'a', to: 'b' })).toBe('dept=d1');
    expect(deptQuery('d1', { key: 'month', from: 'a', to: 'b' })).toBe('dept=d1&range=month');
    expect(deptQuery(null, { key: 'custom', from: '2026-09-01', to: '2026-09-15' })).toBe('from=2026-09-01&to=2026-09-15');
  });

  it('labels the range', () => {
    expect(rangeText({ from: '2026-09-28', to: '2026-10-04' })).toBe('28 Sept – 4 Oct 2026');
    expect(rangeText({ from: '2025-12-29', to: '2026-01-02' })).toBe('29 Dec 2025 – 2 Jan 2026');
    expect(rangeText({ from: '2026-10-04', to: '2026-10-04' })).toBe('4 Oct 2026');
  });
});

describe('department flags', () => {
  it('flags low rates and never flags nothing-to-measure', () => {
    expect(toneOf(null, 'held')).toBe('none');
    expect(toneOf(74, 'held')).toBe('low');
    expect(toneOf(75, 'held')).toBe('fair');
    expect(toneOf(90, 'attendance')).toBe('good');
    expect(toneOf(39.9, 'marks')).toBe('low');
    expect(toneOf(70, 'marks')).toBe('good');
  });

  it('says why a teacher or class is flagged', () => {
    expect(flagsFor({ scheduled: 0, taughtPercent: null, attendanceTakenPercent: null, attendancePercent: null })).toEqual([]);
    expect(flagsFor({ scheduled: 10, taughtPercent: 0, attendanceTakenPercent: 41, attendancePercent: 95 })).toEqual([
      'Few classes held on the board',
      'Attendance often not taken',
    ]);
    expect(flagsFor({ scheduled: 10, taughtPercent: 100, attendanceTakenPercent: 100, attendancePercent: 60 })).toEqual(['Low attendance']);
  });

  it('formats percentages and counts', () => {
    expect(formatPercent(null)).toBe('—');
    expect(formatPercent(87)).toBe('87%');
    expect(formatPercent(74.66)).toBe('74.7%');
    expect(ofText(3, 0)).toBe('—');
    expect(ofText(3, 5)).toBe('3 of 5');
  });
});

describe('department settings', () => {
  it('offers only HOD staff as heads', () => {
    const staff = [
      { id: 'a', fullName: 'Anita', roles: ['teacher'] },
      { id: 'r', fullName: 'Ravi', roles: ['hod', 'teacher'] },
    ];
    expect(headCandidates(staff).map((s) => s.id)).toEqual(['r']);
  });

  it('lists subjects that would move from another department', () => {
    const depts = [
      { id: 'com', name: 'Commerce', subjects: [{ id: 's1', name: 'Corporate Accounting' }] },
      { id: 'cs', name: 'Computer Science', subjects: [{ id: 's2', name: 'Discrete Mathematics' }] },
    ];
    expect(movedSubjects('com', ['s1', 's2', 's3'], depts)).toEqual([{ id: 's2', name: 'Discrete Mathematics', from: 'Computer Science' }]);
    expect(movedSubjects('com', ['s1'], depts)).toEqual([]);
    expect(movedSubjects(null, ['s1'], depts)).toEqual([{ id: 's1', name: 'Corporate Accounting', from: 'Commerce' }]);
  });
});
