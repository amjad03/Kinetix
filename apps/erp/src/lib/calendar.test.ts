import { describe, expect, it } from 'vitest';
import { addMonths, calendarProblem, eventDays, eventsInMonth, eventsOn, gridRange, groupByMonth, monthGrid, monthParam, type CalendarEvent } from './calendar';

const ev = (id: string, kind: CalendarEvent['kind'], startsOn: string, endsOn = startsOn, title = id): CalendarEvent => ({ id, kind, title, startsOn, endsOn, programIds: null, programs: null });

describe('calendar', () => {
  it('reads ?month= and falls back to the month of today', () => {
    expect(monthParam('2026-11', '2026-10-04')).toBe('2026-11');
    expect(monthParam(['2026-12'], '2026-10-04')).toBe('2026-12');
    expect(monthParam('2026-13', '2026-10-04')).toBe('2026-10');
    expect(monthParam('nope', '2026-10-04')).toBe('2026-10');
    expect(monthParam(undefined, '2026-10-04')).toBe('2026-10');
  });

  it('moves between months across years', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-10', 14)).toBe('2027-12');
  });

  it('lays a month out in Monday-first weeks', () => {
    const weeks = monthGrid('2026-10'); // 1 Oct 2026 is a Thursday, 31 Oct a Saturday
    expect(weeks[0][0]).toEqual({ date: '2026-09-28', inMonth: false });
    expect(weeks[0][3]).toEqual({ date: '2026-10-01', inMonth: true });
    expect(weeks.at(-1)![6]).toEqual({ date: '2026-11-01', inMonth: false });
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks).toHaveLength(5);
    expect(gridRange('2026-10')).toEqual({ from: '2026-09-28', to: '2026-11-01' });
    // February 2027 starts on a Monday and has exactly four weeks.
    expect(monthGrid('2027-02')).toHaveLength(4);
  });

  it('finds entries on a day, holidays first, including multi-day ones', () => {
    const events = [ev('sports', 'event', '2026-10-20'), ev('dasara', 'holiday', '2026-10-19', '2026-10-21'), ev('exam', 'exam', '2026-10-21')];
    expect(eventsOn('2026-10-20', events).map((e) => e.id)).toEqual(['dasara', 'sports']);
    expect(eventsOn('2026-10-21', events).map((e) => e.id)).toEqual(['dasara', 'exam']);
    expect(eventsOn('2026-10-22', events)).toEqual([]);
  });

  it('keeps entries that overlap the month and groups a list by month', () => {
    const events = [ev('b', 'holiday', '2026-11-01'), ev('a', 'exam', '2026-10-30', '2026-11-02'), ev('c', 'event', '2026-12-12')];
    expect(eventsInMonth('2026-11', events).map((e) => e.id)).toEqual(['b', 'a']);
    expect(eventsInMonth('2026-09', events)).toEqual([]);
    expect(groupByMonth(events).map(([m, list]) => [m, list.map((e) => e.id)])).toEqual([
      ['2026-10', ['a']],
      ['2026-11', ['b']],
      ['2026-12', ['c']],
    ]);
  });

  it('counts days with both ends included', () => {
    expect(eventDays({ startsOn: '2026-10-19', endsOn: '2026-10-21' })).toBe(3);
    expect(eventDays({ startsOn: '2026-12-25', endsOn: '2026-12-25' })).toBe(1);
  });

  it('checks the dialog the way the API does', () => {
    const ok = { title: 'Dasara', startsOn: '2026-10-19', endsOn: '2026-10-21', programIds: null };
    expect(calendarProblem(ok)).toBeNull();
    expect(calendarProblem({ ...ok, title: '  ' })).toBe('title');
    expect(calendarProblem({ ...ok, title: 'x'.repeat(161) })).toBe('titleLong');
    expect(calendarProblem({ ...ok, startsOn: '2026-02-30' })).toBe('startsOn');
    expect(calendarProblem({ ...ok, endsOn: '' })).toBe('endsOn');
    expect(calendarProblem({ ...ok, endsOn: '2026-10-18' })).toBe('range');
    expect(calendarProblem({ ...ok, programIds: [] })).toBe('programs');
    expect(calendarProblem({ ...ok, programIds: ['p1'] })).toBeNull();
  });
});
