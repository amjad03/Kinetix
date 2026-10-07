import { addDays, eachDay, monthEnd, monthStart, weekday } from './dates.js';

export interface LopInput {
  /** YYYY-MM. */
  month: string;
  /** 0 = Sunday … 6 = Saturday. */
  weeklyOffs: number[];
  /** Institution-wide holidays (YYYY-MM-DD). */
  holidays: Set<string>;
  /** Marked days only; an unmarked day counts as present. */
  attendance: Map<string, 'present' | 'absent' | 'half_day' | 'on_leave'>;
  /** Approved leave. */
  leaves: { from: string; to: string; halfDay: boolean; paid: boolean }[];
  dateOfJoining: string | null;
  dateOfLeaving: string | null;
}

/**
 * Loss-of-pay days in a month, in calendar days (a day's pay is salary / days in the month).
 * Per working day: approved unpaid leave counts; an absence not covered by paid leave counts a
 * day, a half day counts half; paid leave and weekly offs/holidays never count. Days before the
 * joining date or after the leaving date are not paid either.
 */
export function lopDays(i: LopInput): number {
  const first = monthStart(i.month);
  const last = monthEnd(i.month);
  let lop = 0;
  for (const d of eachDay(first, last)) {
    if ((i.dateOfJoining && d < i.dateOfJoining) || (i.dateOfLeaving && d > i.dateOfLeaving)) {
      lop += 1;
      continue;
    }
    if (i.weeklyOffs.includes(weekday(d)) || i.holidays.has(d)) continue;
    let paidCover = 0;
    let unpaidCover = 0;
    for (const l of i.leaves) {
      if (l.from <= d && d <= l.to) {
        const f = l.halfDay ? 0.5 : 1;
        if (l.paid) paidCover = Math.min(1, paidCover + f);
        else unpaidCover = Math.min(1, unpaidCover + f);
      }
    }
    const status = i.attendance.get(d);
    const base = status === 'absent' ? 1 : status === 'half_day' ? 0.5 : 0;
    lop += Math.min(1, unpaidCover + Math.max(0, base - paidCover));
  }
  return lop;
}

/** Working days (not a weekly off or holiday) in [from, to]. */
export function workingDays(from: string, to: string, weeklyOffs: number[], holidays: Set<string>): number {
  return eachDay(from, to).filter((d) => !weeklyOffs.includes(weekday(d)) && !holidays.has(d)).length;
}

export { addDays };
