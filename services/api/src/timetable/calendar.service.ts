import { Injectable } from '@nestjs/common';
import { and, asc, gte, lte } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
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

@Injectable()
export class CalendarService {
  /** Holidays (classes cancelled); with `exam` too, the days a plan should not count on. */
  async holidays(tx: Tx, from: string, to: string, kinds: ('holiday' | 'exam')[] = ['holiday']): Promise<Holidays> {
    const rows = await tx
      .select({ title: calendarEvents.title, startsOn: calendarEvents.startsOn, endsOn: calendarEvents.endsOn, programIds: calendarEvents.programIds, kind: calendarEvents.kind })
      .from(calendarEvents)
      .where(and(lte(calendarEvents.startsOn, to), gte(calendarEvents.endsOn, from)))
      .orderBy(asc(calendarEvents.startsOn));
    return new Holidays(rows.filter((r) => (kinds as string[]).includes(r.kind)).map(({ kind: _k, ...h }) => h));
  }
}
