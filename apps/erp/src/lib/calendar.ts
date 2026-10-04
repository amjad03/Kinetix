// The academic calendar (GET /v1/calendar): holidays, exam days and events, shown as a month.
import { addDays, isIsoDate, isoWeekday } from './dates';

export type CalendarKind = 'holiday' | 'exam' | 'event';
export const CALENDAR_KINDS: CalendarKind[] = ['holiday', 'exam', 'event'];

export interface CalendarEvent {
  id: string;
  kind: CalendarKind;
  title: string;
  startsOn: string;
  endsOn: string;
  /** null: the whole institution. */
  programIds: string[] | null;
  programs: string[] | null;
}

export interface CalendarList {
  from: string;
  to: string;
  today: string;
  events: CalendarEvent[];
}

/** What the add / edit dialog sends (POST / PUT /v1/admin/calendar). */
export interface CalendarInput {
  kind: CalendarKind;
  title: string;
  startsOn: string;
  endsOn: string;
  programIds: string[] | null;
  notify: boolean;
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** `?month=YYYY-MM` if valid, else the month of `today`. */
export function monthParam(value: string | string[] | undefined, today: string): string {
  const v = Array.isArray(value) ? value[0] : value;
  return v && MONTH.test(v) ? v : today.slice(0, 7);
}

/** "2026-10" + 1 → "2026-11". */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const i = y * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * The month as weeks of seven dates, Monday first, padded with the days of the months around
 * it (4–6 weeks). `inMonth` marks the month's own days.
 */
export function monthGrid(month: string): { date: string; inMonth: boolean }[][] {
  const first = `${month}-01`;
  const last = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
  const start = addDays(first, 1 - isoWeekday(first));
  const end = addDays(last, 7 - isoWeekday(last));
  const weeks: { date: string; inMonth: boolean }[][] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (isoWeekday(d) === 1) weeks.push([]);
    weeks[weeks.length - 1].push({ date: d, inMonth: d.startsWith(month) });
  }
  return weeks;
}

/** First and last date shown in the month grid (what to ask the API for). */
export function gridRange(month: string): { from: string; to: string } {
  const weeks = monthGrid(month);
  return { from: weeks[0][0].date, to: weeks[weeks.length - 1][6].date };
}

/** Entries on a date, holidays first. */
export function eventsOn(date: string, events: CalendarEvent[]): CalendarEvent[] {
  const order: Record<CalendarKind, number> = { holiday: 0, exam: 1, event: 2 };
  return events.filter((e) => e.startsOn <= date && date <= e.endsOn).sort((a, b) => order[a.kind] - order[b.kind] || a.title.localeCompare(b.title));
}

/** Entries overlapping a month. */
export function eventsInMonth(month: string, events: CalendarEvent[]): CalendarEvent[] {
  const first = `${month}-01`;
  const last = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
  return events.filter((e) => e.startsOn <= last && e.endsOn >= first);
}

/** Number of days an entry covers (both ends included). */
export function eventDays(e: { startsOn: string; endsOn: string }): number {
  return Math.round((Date.parse(`${e.endsOn}T00:00:00Z`) - Date.parse(`${e.startsOn}T00:00:00Z`)) / 86_400_000) + 1;
}

/** Entries grouped by the month they start in ("2026-10" → […]), in date order. */
export function groupByMonth(events: CalendarEvent[]): [string, CalendarEvent[]][] {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of [...events].sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.title.localeCompare(b.title))) {
    const m = e.startsOn.slice(0, 7);
    map.set(m, [...(map.get(m) ?? []), e]);
  }
  return [...map.entries()];
}

export type CalendarProblem = 'title' | 'titleLong' | 'startsOn' | 'endsOn' | 'range' | 'programs';

/** What is wrong with the dialog's input (the API checks the same), or null. */
export function calendarProblem(i: Pick<CalendarInput, 'title' | 'startsOn' | 'endsOn' | 'programIds'>): CalendarProblem | null {
  if (!i.title.trim()) return 'title';
  if (i.title.trim().length > 160) return 'titleLong';
  if (!isIsoDate(i.startsOn)) return 'startsOn';
  if (!isIsoDate(i.endsOn)) return 'endsOn';
  if (i.endsOn < i.startsOn) return 'range';
  if (i.programIds !== null && i.programIds.length === 0) return 'programs';
  return null;
}
