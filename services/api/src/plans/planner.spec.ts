import { describe, expect, it } from 'vitest';
import { mondayOf, periodDates, planProgress, spreadTopics } from './planner.js';

describe('planner', () => {
  it('finds the Monday of a week', () => {
    expect(mondayOf('2026-10-07')).toBe('2026-10-05'); // Wednesday
    expect(mondayOf('2026-10-05')).toBe('2026-10-05');
    expect(mondayOf('2026-10-11')).toBe('2026-10-05'); // Sunday
  });

  it('lists every period, skipping days off', () => {
    // Monday twice, Wednesday once; Wednesday 7 Oct is a holiday.
    const dates = periodDates([1, 1, 3], '2026-10-05', '2026-10-14', (d) => d === '2026-10-07');
    expect(dates).toEqual(['2026-10-05', '2026-10-05', '2026-10-12', '2026-10-12', '2026-10-14']);
  });

  it('spreads topics evenly over the periods, in order', () => {
    const periods = ['2026-10-05', '2026-10-06', '2026-10-12', '2026-10-13', '2026-10-19', '2026-10-20'];
    expect(spreadTopics(['a', 'b', 'c'], periods)).toEqual([
      { topicId: 'a', weekOf: '2026-10-05', periods: 2 },
      { topicId: 'b', weekOf: '2026-10-12', periods: 2 },
      { topicId: 'c', weekOf: '2026-10-19', periods: 2 },
    ]);
    // More topics than periods: two share a period, each still counted as one.
    expect(spreadTopics(['a', 'b', 'c'], ['2026-10-05', '2026-10-12']).map((x) => [x.weekOf, x.periods])).toEqual([
      ['2026-10-05', 1],
      ['2026-10-05', 1],
      ['2026-10-12', 1],
    ]);
    expect(spreadTopics(['a'], [])).toEqual([]);
  });

  it('says whether a class is behind, on track or ahead', () => {
    const items = [
      { topicId: 'a', weekOf: '2026-09-28' },
      { topicId: 'b', weekOf: '2026-10-05' },
      { topicId: 'c', weekOf: '2026-10-12' },
    ];
    const today = '2026-10-07';
    expect(planProgress(items, new Set(), today)).toMatchObject({ expected: 1, dueThisWeek: 1, behindBy: 1, status: 'behind' });
    expect(planProgress(items, new Set(['a']), today)).toMatchObject({ covered: 1, status: 'on_track' });
    expect(planProgress(items, new Set(['a', 'b', 'c']), today)).toMatchObject({ covered: 3, status: 'ahead' });
    expect(planProgress(items, new Set(), '2026-09-28')).toMatchObject({ status: 'not_started' });
  });
});
