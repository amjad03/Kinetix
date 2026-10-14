import type { AttendanceRules } from '../db/schema-hrpay.js';

/** The attendance rules with the newer settings filled in (older institutions' settings lack them). */
export interface FullAttendanceRules extends AttendanceRules {
  /** When the working day ends (HH:MM). */
  officeEnd: string;
  /** Every this many late arrivals in a month cost half a day's pay (0: late arrivals cost nothing). */
  lateMarksPerHalfDay: number;
}

export const DEFAULT_ATTENDANCE_RULES: FullAttendanceRules = { officeStart: '09:00', graceMinutes: 10, halfDayAfterMinutes: 120, minHoursFullDay: 6, officeEnd: '17:00', lateMarksPerHalfDay: 3 };

export const fullRules = (r: Partial<FullAttendanceRules> | null | undefined): FullAttendanceRules => ({ ...DEFAULT_ATTENDANCE_RULES, ...(r ?? {}) });

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};

/**
 * A day from its punches (local times): late minutes past the start (counted only beyond the grace period),
 * minutes left before the end of the day, and the status. Arriving later than `halfDayAfterMinutes` past the
 * start, or working fewer than `minHoursFullDay` hours, makes it a half day.
 */
export function dayFromPunches(rules: FullAttendanceRules, inTime: string | null, outTime: string | null): { status: 'present' | 'half_day'; lateMinutes: number | null; earlyMinutes: number | null } {
  if (!inTime) return { status: 'present', lateMinutes: null, earlyMinutes: null };
  const start = minutes(rules.officeStart);
  const end = minutes(rules.officeEnd);
  const arrived = minutes(inTime);
  const after = arrived - start;
  const lateMinutes = after > rules.graceMinutes ? after : 0;
  let earlyMinutes: number | null = null;
  let half = after > rules.halfDayAfterMinutes;
  if (outTime) {
    const left = minutes(outTime);
    earlyMinutes = left < end ? end - left : 0;
    if (left - arrived < rules.minHoursFullDay * 60) half = true;
  }
  return { status: half ? 'half_day' : 'present', lateMinutes, earlyMinutes };
}

/** Days of pay lost to late arrivals in a month: half a day for every `lateMarksPerHalfDay` late marks. */
export const lateLop = (lateMarks: number, perHalfDay: number) => (perHalfDay > 0 ? Math.floor(lateMarks / perHalfDay) * 0.5 : 0);
