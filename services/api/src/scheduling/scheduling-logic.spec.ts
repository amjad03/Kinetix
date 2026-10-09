import { describe, expect, it } from 'vitest';
import { frequencyProblem, frequencyStatus, generateTimetable, isLatePunch, rollUp, splitYear, type Busy } from './scheduling-logic.js';

describe('term presets', () => {
  it('cuts a year into consecutive terms with no gap or overlap', () => {
    const terms = splitYear('2026-08-01', '2027-05-31', 'trimester');
    expect(terms.map((t) => t.name)).toEqual(['Trimester 1', 'Trimester 2', 'Trimester 3']);
    expect(terms[0].startsOn).toBe('2026-08-01');
    expect(terms[2].endsOn).toBe('2027-05-31');
    for (let i = 1; i < terms.length; i++) {
      const prevEnd = Date.parse(`${terms[i - 1].endsOn}T00:00:00Z`);
      expect(Date.parse(`${terms[i].startsOn}T00:00:00Z`) - prevEnd).toBe(86_400_000);
    }
    expect(splitYear('2026-08-01', '2027-05-31', 'annual')).toEqual([{ name: 'Annual', startsOn: '2026-08-01', endsOn: '2027-05-31' }]);
    expect(splitYear('2026-08-01', '2027-05-31', 'quarter')).toHaveLength(4);
    expect(() => splitYear('2026-08-01', '2026-08-10', 'quarter')).toThrow();
  });
});

describe('timetable generator', () => {
  const periods = [
    { startsAt: '09:00', endsAt: '09:45' },
    { startsAt: '09:45', endsAt: '10:30' },
    { startsAt: '10:30', endsAt: '11:15' },
  ];
  const demands = [
    { subjectId: 'math', subjectName: 'Maths', teacherId: 'T1', perWeek: 4, maxPerDay: 1 },
    { subjectId: 'sci', subjectName: 'Science', teacherId: 'T2', perWeek: 3, maxPerDay: 2 },
  ];

  it('places each period once per day when asked to, without any clash', () => {
    const out = generateTimetable({ days: [1, 2, 3, 4, 5], periods, demands, teacherBusy: new Map(), roomBusy: new Map(), sectionBusy: [] });
    expect(out.unplaced).toEqual([]);
    expect(out.placements).toHaveLength(7);
    const math = out.placements.filter((p) => p.subjectId === 'math');
    expect(new Set(math.map((p) => p.dayOfWeek)).size).toBe(4);
    const cells = out.placements.map((p) => `${p.dayOfWeek}|${p.startsAt}`);
    expect(new Set(cells).size).toBe(cells.length);
  });

  it('keeps clear of a teacher who is busy elsewhere and reports what does not fit', () => {
    const busy: Busy[] = [1, 2, 3].flatMap((d) => periods.map((p) => ({ dayOfWeek: d, ...p })));
    const out = generateTimetable({ days: [1, 2, 3], periods, demands: [demands[0]], teacherBusy: new Map([['T1', busy]]), roomBusy: new Map(), sectionBusy: [] });
    expect(out.placements).toHaveLength(0);
    expect(out.unplaced).toEqual([{ subjectId: 'math', subjectName: 'Maths', missing: 4 }]);
  });

  it('is deterministic and respects periods the class already has', () => {
    const keep: Busy[] = [{ dayOfWeek: 1, startsAt: '09:00', endsAt: '09:45' }];
    const a = generateTimetable({ days: [1, 2], periods: periods.slice(0, 1), demands: [demands[1]], teacherBusy: new Map(), roomBusy: new Map(), sectionBusy: keep });
    const b = generateTimetable({ days: [1, 2], periods: periods.slice(0, 1), demands: [demands[1]], teacherBusy: new Map(), roomBusy: new Map(), sectionBusy: keep });
    expect(a).toEqual(b);
    expect(a.placements).toHaveLength(1);
    expect(a.placements[0].dayOfWeek).toBe(2);
    expect(a.unplaced[0].missing).toBe(2);
  });
});

describe('frequency and roll-up', () => {
  it('refuses a period beyond the weekly or daily limit', () => {
    const rule = { minPerWeek: 2, maxPerWeek: 4, maxPerDay: 1 };
    expect(frequencyProblem(rule, 3, 0)).toBeNull();
    expect(frequencyProblem(rule, 4, 0)).toContain('limit is 4');
    expect(frequencyProblem(rule, 1, 1)).toContain('that day');
    expect(frequencyProblem(undefined, 99, 99)).toBeNull();
    expect(frequencyStatus(rule, 1)).toBe('under');
    expect(frequencyStatus(rule, 3)).toBe('ok');
    expect(frequencyStatus(rule, 5)).toBe('over');
  });

  it('counts present and late as attended and leaves excused out of the percentage', () => {
    const cells = rollUp([
      { key: 'm', label: 'Maths', status: 'present', n: 6 },
      { key: 'm', label: 'Maths', status: 'late', n: 2 },
      { key: 'm', label: 'Maths', status: 'absent', n: 2 },
      { key: 'm', label: 'Maths', status: 'excused', n: 5 },
      { key: 's', label: 'Science', status: 'excused', n: 1 },
    ]);
    expect(cells.find((c) => c.key === 'm')).toMatchObject({ total: 15, pct: 80 });
    expect(cells.find((c) => c.key === 's')?.pct).toBeNull();
    expect(isLatePunch('09:31', '09:30')).toBe(true);
    expect(isLatePunch('09:30:00', '09:30')).toBe(false);
  });
});
