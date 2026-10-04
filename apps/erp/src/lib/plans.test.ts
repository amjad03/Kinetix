import { describe, expect, it } from 'vitest';
import { MESSAGES } from '@/i18n/messages';
import { createT } from '@/i18n/translate';
import { behindPlan, lessonPlansText, mondayOf, planChip, planWeeks, REMARK_MAX, reviewErrorText, topicState, totalMinutes, weekFrom, weekRange } from './plans';
import type { PlanProgress, YearPlanItem } from './types';

const en = createT('en', MESSAGES.en);
const hi = createT('hi', MESSAGES.hi);
const kn = createT('kn', MESSAGES.kn);
const progress = (p: Partial<PlanProgress>): PlanProgress => ({ total: 8, covered: 0, expected: 0, dueThisWeek: 0, behindBy: 0, status: 'not_started', ...p });
const item = (topicId: string, weekOf: string, extra: Partial<YearPlanItem> = {}): YearPlanItem => ({ topicId, weekOf, periods: 2, title: topicId, chapter: 'Ch', coveredOn: null, late: false, ...extra });

describe('plan weeks', () => {
  it('counts weeks from Monday, as the API does', () => {
    expect(mondayOf('2026-10-04')).toBe('2026-09-28'); // Sunday
    expect(mondayOf('2026-10-05')).toBe('2026-10-05');
    expect(mondayOf('2026-10-07')).toBe('2026-10-05');
  });

  it("takes the URL's week (any day of it), else this week", () => {
    expect(weekFrom('2026-10-08', '2026-10-05')).toBe('2026-10-05');
    expect(weekFrom(undefined, '2026-10-04')).toBe('2026-09-28');
    expect(weekFrom('2026-02-30', '2026-10-07')).toBe('2026-10-05');
    expect(weekFrom('next', '2026-10-07')).toBe('2026-10-05');
    expect(weekRange('2026-10-05')).toEqual({ from: '2026-10-05', to: '2026-10-11' });
    expect(weekRange('2026-12-28')).toEqual({ from: '2026-12-28', to: '2027-01-03' });
  });

  it('says where each topic stands: taught, late, due this week or planned', () => {
    const thisWeek = '2026-10-05';
    expect(topicState(item('a', '2026-09-28', { coveredOn: '2026-09-29' }), thisWeek)).toBe('taught');
    expect(topicState(item('a', '2026-10-19', { coveredOn: '2026-10-01' }), thisWeek)).toBe('taught'); // taught early
    expect(topicState(item('a', '2026-09-28', { late: true }), thisWeek)).toBe('late');
    expect(topicState(item('a', '2026-09-28'), thisWeek)).toBe('late');
    expect(topicState(item('a', thisWeek), thisWeek)).toBe('due');
    expect(topicState(item('a', '2026-10-12'), thisWeek)).toBe('planned');
  });

  it('groups the plan by week, in order, with this week while the plan runs', () => {
    const plan = {
      startsOn: '2026-09-07',
      endsOn: '2026-12-27',
      items: [item('c', '2026-10-26'), item('a', '2026-09-07', { coveredOn: '2026-09-10' }), item('b', '2026-09-28', { late: true }), item('b2', '2026-09-28')],
    };
    const weeks = planWeeks(plan, '2026-10-07');
    expect(weeks.map((w) => w.weekOf)).toEqual(['2026-09-07', '2026-09-28', '2026-10-05', '2026-10-26']);
    expect(weeks.map((w) => w.thisWeek)).toEqual([false, false, true, false]);
    expect(weeks.map((w) => w.past)).toEqual([true, true, false, false]);
    expect(weeks[1].items.map((i) => [i.topicId, i.state])).toEqual([
      ['b', 'late'],
      ['b2', 'late'],
    ]);
    expect(weeks[2].items).toEqual([]);
    expect(weeks[3].items[0].state).toBe('planned');
    // This week already has topics: no extra row. Outside the plan's dates: none either.
    expect(planWeeks(plan, '2026-10-28').filter((w) => w.thisWeek)).toHaveLength(1);
    expect(planWeeks(plan, '2027-02-01').some((w) => w.thisWeek)).toBe(false);
  });
});

describe('plan status', () => {
  it('labels the year plan: on track, behind by N, ahead, not started, no plan', () => {
    expect(planChip(progress({ status: 'on_track', covered: 2, expected: 2 }), en)).toEqual({ status: 'on_track', label: 'On track', tone: 'good' });
    expect(planChip(progress({ status: 'behind', behindBy: 1 }), en)).toEqual({ status: 'behind', label: 'Behind by 1 topic', tone: 'low' });
    expect(planChip(progress({ status: 'behind', behindBy: 3 }), en).label).toBe('Behind by 3 topics');
    expect(planChip(progress({ status: 'ahead', covered: 4 }), en)).toMatchObject({ status: 'ahead', label: 'Ahead', tone: 'good' });
    expect(planChip(progress({}), en)).toMatchObject({ status: 'not_started', label: 'Not started', tone: 'none' });
    expect(planChip(null, en)).toEqual({ status: 'none', label: 'No plan', tone: 'none' });
    expect(planChip(undefined, en).status).toBe('none');
    expect(planChip(progress({ status: 'behind', behindBy: 2 }), hi).label).toBe('2 विषय-वस्तु पीछे');
    expect(planChip(progress({ status: 'behind', behindBy: 2 }), kn).label).toBe('2 ವಿಷಯಗಳು ಹಿಂದೆ');
  });

  it('is behind only with topics missing', () => {
    expect(behindPlan(progress({ status: 'behind', behindBy: 2 }))).toBe(true);
    expect(behindPlan(progress({ status: 'behind', behindBy: 0 }))).toBe(false);
    expect(behindPlan(progress({ status: 'on_track' }))).toBe(false);
    expect(behindPlan(null)).toBe(false);
  });

  it('counts lesson plans against the periods', () => {
    expect(lessonPlansText(0, 0, en)).toBe('—');
    expect(lessonPlansText(3, 8, en)).toBe('3 of 8 periods');
    expect(lessonPlansText(1, 0, en)).toBe('1 of 0 periods');
    expect(lessonPlansText(3, 8, kn)).toBe('8 ಅವಧಿಗಳಲ್ಲಿ 3');
  });
});

describe('lesson plans', () => {
  it("adds up the steps' minutes", () => {
    expect(totalMinutes([])).toBe(0);
    expect(totalMinutes([{ minutes: 5 }, { minutes: 20 }, { minutes: 20 }, { minutes: 10 }])).toBe(55);
  });

  it("shows the API's reason when a review is refused, and words other errors as usual", () => {
    const refused = { status: 403, code: 'FORBIDDEN', message: 'Only the head of department or the principal reviews lesson plans' };
    expect(reviewErrorText(refused, en)).toBe(refused.message);
    expect(reviewErrorText(refused, hi)).toBe(`${MESSAGES.hi['error.FORBIDDEN']} (${refused.message})`);
    expect(reviewErrorText({ status: 403, code: 'FORBIDDEN', message: '' }, en)).toBe(MESSAGES.en['error.FORBIDDEN']);
    expect(reviewErrorText({ status: 404, code: 'NOT_FOUND', message: 'Lesson plan not found' }, kn)).toBe(MESSAGES.kn['error.NOT_FOUND']);
    expect(reviewErrorText({ status: 400, code: 'VALIDATION', message: 'Too long' }, en)).toBe('Too long');
    expect(REMARK_MAX).toBe(1000);
  });
});
