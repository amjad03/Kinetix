import { and, eq, gte, isNull, lte, sql, type SQL } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { calendarEvents } from '../db/schema.js';

/**
 * Days the library is closed and the late fine they do not count: the academic calendar's published, institution-wide
 * holidays (calendar events of kind holiday for every programme) and the weekdays the library settings close it on.
 */
export interface Closures {
  weekdays: Set<number>;
  holidays: Set<string>;
}

export const NO_CLOSURES: Closures = { weekdays: new Set(), holidays: new Set() };

const DAY = 86_400_000;
const toTime = (d: string) => Date.parse(`${d}T00:00:00Z`);
const toDate = (t: number) => new Date(t).toISOString().slice(0, 10);

/** "0,6" → {0, 6}; anything that is not a weekday number is ignored. */
export function parseWeekdays(text: string): Set<number> {
  return new Set(
    String(text ?? '')
      .split(',')
      .map((x) => x.trim())
      .filter((x) => /^[0-6]$/.test(x))
      .map(Number),
  );
}

export const isClosed = (date: string, c: Closures) => c.weekdays.has(new Date(toTime(date)).getUTCDay()) || c.holidays.has(date);

/**
 * The days a late return is fined for: every day after the due date up to and including the day it came back, less
 * the closed days. A return within the grace period (counted in open days) is not fined at all; after it, the whole
 * late period counts (Koha's grace period).
 */
export function chargeableDays(dueOn: string, back: string, c: Closures, graceDays = 0): number {
  if (back <= dueOn) return 0;
  let n = 0;
  for (let t = toTime(dueOn) + DAY, end = toTime(back); t <= end; t += DAY) if (!isClosed(toDate(t), c)) n++;
  return n <= graceDays ? 0 : n;
}

/** The fine for those days at the per-day rate, capped (0 = no cap). Integer paise. */
export function lateFine(days: number, perDayPaise: number, capPaise = 0): number {
  const f = Math.max(0, days) * Math.max(0, perDayPaise);
  return capPaise > 0 ? Math.min(f, capPaise) : f;
}

/** A due date moved past closed days to the next day the library is open (at most 60 days on). */
export function nextOpenDay(date: string, c: Closures): string {
  let t = toTime(date);
  for (let i = 0; i < 60 && isClosed(toDate(t), c); i++) t += DAY;
  return toDate(t);
}

/** The closures between two dates (inclusive), from the calendar and the library settings. */
export async function loadClosures(tx: Tx, from: string, to: string, rules: { fineSkipsHolidays?: unknown; closedWeekdays?: unknown }): Promise<Closures> {
  if (rules.fineSkipsHolidays === false) return NO_CLOSURES;
  const weekdays = parseWeekdays(String(rules.closedWeekdays ?? ''));
  const holidays = new Set<string>();
  if (to >= from) {
    const rows = await tx
      .select({ startsOn: calendarEvents.startsOn, endsOn: calendarEvents.endsOn })
      .from(calendarEvents)
      .where(and(eq(calendarEvents.kind, 'holiday'), eq(calendarEvents.published, true), isNull(calendarEvents.programIds), lte(calendarEvents.startsOn, to), gte(calendarEvents.endsOn, from)));
    for (const r of rows) for (let t = Math.max(toTime(r.startsOn), toTime(from)), end = Math.min(toTime(r.endsOn), toTime(to)); t <= end; t += DAY) holidays.add(toDate(t));
  }
  return { weekdays, holidays };
}

/**
 * SQL for the open days between a due date and `today` (the fine-so-far of a loan still out), for list pages: the same
 * count as {@link chargeableDays} without the grace period, worked out in the database so a page of loans is one query.
 */
export function openDaysLateSql(due: SQL | unknown, today: SQL | string, rules: { fineSkipsHolidays?: unknown; closedWeekdays?: unknown }): SQL<number> {
  const t = typeof today === 'string' ? sql`${today}::date` : today;
  if (rules.fineSkipsHolidays === false) return sql<number>`greatest(0, ${t} - ${due})::int`;
  const closed = [...parseWeekdays(String(rules.closedWeekdays ?? ''))];
  const dow = closed.length ? sql`and extract(dow from d)::int not in (${sql.join(closed.map((n) => sql`${n}`), sql`, `)})` : sql``;
  return sql<number>`(select count(*)::int from generate_series(${due} + 1, ${t}, interval '1 day') d
    where true ${dow} and not exists (select 1 from calendar_events e where e.kind = 'holiday' and e.published and e.program_ids is null and d::date between e.starts_on and e.ends_on))`;
}
