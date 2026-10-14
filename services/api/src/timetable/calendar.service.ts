import { Injectable } from '@nestjs/common';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { workingDaySwaps } from '../db/schema-academic-ops.js';
import { calendarEvents } from '../db/schema.js';

export interface Holiday {
  title: string;
  startsOn: string;
  endsOn: string;
  /** Null = the whole institution. */
  programIds: string[] | null;
}

/** Holidays in a date range, and whether a class of a program is off on a day. */
export class Holidays {
  constructor(readonly list: Holiday[]) {}

  /** The holiday that cancels classes of [programId] on [date] (YYYY-MM-DD), if any. */
  on(date: string, programId?: string | null): Holiday | null {
    return this.list.find((h) => h.startsOn <= date && date <= h.endsOn && (h.programIds === null || (programId != null && h.programIds.includes(programId)))) ?? null;
  }

  /** A holiday for everyone on [date]. */
  forAll(date: string): Holiday | null {
    return this.list.find((h) => h.startsOn <= date && date <= h.endsOn && h.programIds === null) ?? null;
  }
}

/** ISO weekday (1 = Monday … 7 = Sunday) of a calendar date. */
const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() || 7;

/** Compensatory working days in a range: on each date the timetable of another weekday meets. */
export class DayOrders {
  constructor(readonly list: { date: string; followsWeekday: number; programIds: string[] | null }[]) {}

  /** The timetable weekday that meets on [date] for a class of [programId]. */
  weekday(date: string, programId?: string | null): number {
    const s = this.list.find((x) => x.date === date && (x.programIds === null || (programId != null && x.programIds.includes(programId))));
    return s ? s.followsWeekday : weekdayOf(date);
  }
}

@Injectable()
export class CalendarService {
  /** Working-day swaps between two dates (inclusive). */
  async dayOrders(tx: Tx, from: string, to: string): Promise<DayOrders> {
    const rows = await tx
      .select({ date: workingDaySwaps.date, followsWeekday: workingDaySwaps.followsWeekday, programIds: workingDaySwaps.programIds })
      .from(workingDaySwaps)
      .where(and(gte(workingDaySwaps.date, from), lte(workingDaySwaps.date, to)));
    return new DayOrders(rows);
  }

  /** Whether a weekly period (of a class in [programId]) meets on [date]: its weekday, or a working day that follows it. */
  async meetsOn(tx: Tx, slot: { dayOfWeek: number }, date: string, programId?: string | null): Promise<boolean> {
    return (await this.dayOrders(tx, date, date)).weekday(date, programId) === slot.dayOfWeek;
  }

  /** Holidays (classes cancelled); with `exam` too, the days a plan should not count on. */
  async holidays(tx: Tx, from: string, to: string, kinds: ('holiday' | 'exam')[] = ['holiday']): Promise<Holidays> {
    const rows = await tx
      .select({ title: calendarEvents.title, startsOn: calendarEvents.startsOn, endsOn: calendarEvents.endsOn, programIds: calendarEvents.programIds, kind: calendarEvents.kind })
      .from(calendarEvents)
      .where(and(lte(calendarEvents.startsOn, to), gte(calendarEvents.endsOn, from), eq(calendarEvents.published, true)))
      .orderBy(asc(calendarEvents.startsOn));
    return new Holidays(rows.filter((r) => (kinds as string[]).includes(r.kind)).map(({ kind: _k, ...h }) => h));
  }
}
