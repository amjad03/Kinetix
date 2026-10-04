/** Wall-clock helpers. Timetables are local times in the tenant's timezone (IST by default). */

export interface LocalParts {
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM:SS, 24-hour */
  time: string;
  /** ISO weekday, 1 = Monday … 7 = Sunday */
  isoWeekday: number;
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function localParts(at: Date, timeZone: string): LocalParts {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}:${parts.second}`,
    isoWeekday: WEEKDAYS[parts.weekday],
  };
}

/** Converts a local date + time in `timeZone` to the corresponding instant. */
export function zonedToInstant(date: string, time: string, timeZone: string): Date {
  const asUtc = new Date(`${date}T${time}Z`);
  // The offset of the zone at that moment, found by formatting the UTC guess back into the zone.
  const local = localParts(asUtc, timeZone);
  const localAsUtc = new Date(`${local.date}T${local.time}Z`);
  const offsetMs = localAsUtc.getTime() - asUtc.getTime();
  return new Date(asUtc.getTime() - offsetMs);
}

/** Injectable clock so tests can pin "now". */
export abstract class Clock {
  abstract now(): Date;
}

export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}
