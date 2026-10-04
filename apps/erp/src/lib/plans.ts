// Year plans and lesson plans for heads of department and the principal: weeks, status labels
// and the review error. Pure, so the server page and the client dialog share them.

import { errorText } from '@/i18n/errors';
import type { TFunction } from '@/i18n/translate';
import { addDays, isIsoDate, isoWeekday } from './dates';
import type { PlanProgress, PlanStatus, YearPlan, YearPlanItem } from './types';

/** The API keeps review remarks to this many characters. */
export const REMARK_MAX = 1000;

/** Monday of the week [date] (YYYY-MM-DD) falls in, as the API counts weeks. */
export function mondayOf(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}

/** The week (its Monday) from the URL's `week`, any day of it; otherwise this week. */
export function weekFrom(param: string | undefined, today: string): string {
  return mondayOf(isIsoDate(param) ? param : today);
}

/** Monday to Sunday of the week starting [monday]. */
export function weekRange(monday: string): { from: string; to: string } {
  return { from: monday, to: addDays(monday, 6) };
}

export type PlanTone = 'good' | 'low' | 'none';

export interface PlanChipInfo {
  /** The API's status, or `none` when the class has no year plan. */
  status: PlanStatus | 'none';
  label: string;
  tone: PlanTone;
}

/** The year-plan chip: On track / Behind by N topics / Ahead / Not started / No plan. */
export function planChip(p: PlanProgress | null | undefined, t: TFunction): PlanChipInfo {
  if (!p) return { status: 'none', label: t('plan.status.none'), tone: 'none' };
  switch (p.status) {
    case 'behind':
      return { status: 'behind', label: t.plural('plan.status.behind', p.behindBy), tone: 'low' };
    case 'ahead':
      return { status: 'ahead', label: t('plan.status.ahead'), tone: 'good' };
    case 'on_track':
      return { status: 'on_track', label: t('plan.status.onTrack'), tone: 'good' };
    default:
      return { status: 'not_started', label: t('plan.status.notStarted'), tone: 'none' };
  }
}

/** A class behind its year plan needs attention. */
export function behindPlan(p: PlanProgress | null | undefined): boolean {
  return p?.status === 'behind' && p.behindBy > 0;
}

/** "3 of 8 periods" (lesson plans saved for the range's periods), or "—" with nothing due and nothing planned. */
export function lessonPlansText(plans: number, periods: number, t: TFunction): string {
  if (periods === 0 && plans === 0) return '—';
  return t('plan.lessonsOf', { n: plans, d: periods });
}

/** Where a topic stands: taught, late (an earlier week, not taught), due this week, or planned. */
export type TopicState = 'taught' | 'late' | 'due' | 'planned';

export function topicState(item: Pick<YearPlanItem, 'coveredOn' | 'weekOf' | 'late'>, thisWeek: string): TopicState {
  if (item.coveredOn) return 'taught';
  if (item.late || item.weekOf < thisWeek) return 'late';
  return item.weekOf === thisWeek ? 'due' : 'planned';
}

export interface PlanWeek {
  weekOf: string;
  thisWeek: boolean;
  past: boolean;
  items: (YearPlanItem & { state: TopicState })[];
}

/**
 * The plan's weeks that have topics, in order, and this week too while the plan runs (so the
 * head sees "nothing new this week" rather than no row). The institution's today and week come
 * from the API when it sends them (so the ERP agrees with its `late`), else [today].
 */
export function planWeeks(plan: Pick<YearPlan, 'items' | 'startsOn' | 'endsOn' | 'today' | 'thisWeek'>, fallbackToday: string): PlanWeek[] {
  const today = plan.today ?? fallbackToday;
  const thisWeek = plan.thisWeek ?? mondayOf(today);
  const byWeek = new Map<string, PlanWeek['items']>();
  for (const i of plan.items) {
    const list = byWeek.get(i.weekOf) ?? [];
    list.push({ ...i, state: topicState(i, thisWeek) });
    byWeek.set(i.weekOf, list);
  }
  if (!byWeek.has(thisWeek) && today >= plan.startsOn && today <= plan.endsOn) byWeek.set(thisWeek, []);
  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekOf, items]) => ({ weekOf, thisWeek: weekOf === thisWeek, past: weekOf < thisWeek, items }));
}

/** Minutes of a lesson plan's steps. */
export function totalMinutes(steps: readonly { minutes: number }[]): number {
  return steps.reduce((n, s) => n + (Number.isFinite(s.minutes) ? s.minutes : 0), 0);
}

/**
 * The review's error. The API's refusal (PLAN_REVIEW_NOT_ALLOWED: "Only the head of department or
 * the principal reviews lesson plans") is worded in the user's language. A 403 without that code
 * (an older API) still shows the API's reason: in English as is, in Hindi and Kannada after the
 * translated general line. Other errors as usual.
 */
export function reviewErrorText(e: { status: number; message: string; code?: string }, t: TFunction): string {
  if (e.status === 403 && e.message && e.code !== 'PLAN_REVIEW_NOT_ALLOWED') return t.locale === 'en' ? e.message : `${t('error.FORBIDDEN')} (${e.message})`;
  return errorText(e, t);
}
