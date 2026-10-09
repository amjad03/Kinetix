/** Pure internship rules: working days, attendance share and certificate eligibility. */

/** Share of working days an intern must have attended to earn the completion certificate. */
export const MIN_ATTENDANCE_PERCENT = 75;

const dayMs = 86_400_000;
const parse = (d: string) => Date.parse(`${d}T00:00:00Z`);

/** Monday to Friday days from `from` to `to`, both included. */
export function workingDays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = parse(from); t <= parse(to); t += dayMs) {
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

export interface AttendanceSummary {
  workingDays: number;
  presentDays: number;
  absentDays: number;
  hours: number;
  percent: number;
  eligible: boolean;
}

/**
 * Attendance up to `asOf` (or the internship's end). A day counts as present when attendance says so, or when
 * the intern wrote a diary entry that day and no attendance was marked: the diary stands in for a muster.
 */
export function summariseAttendance(
  internship: { startsOn: string; endsOn: string },
  marks: { onDate: string; present: boolean; hours: number }[],
  diaryDates: string[],
  asOf: string,
): AttendanceSummary {
  const end = asOf < internship.endsOn ? asOf : internship.endsOn;
  const days = end < internship.startsOn ? [] : workingDays(internship.startsOn, end);
  const inRange = new Set(days);
  const marked = new Map(marks.filter((m) => inRange.has(m.onDate)).map((m) => [m.onDate, m]));
  const diary = new Set(diaryDates.filter((d) => inRange.has(d)));
  let present = 0;
  let hours = 0;
  for (const d of days) {
    const m = marked.get(d);
    if (m ? m.present : diary.has(d)) {
      present += 1;
      hours += m ? m.hours : 8;
    }
  }
  const percent = days.length ? Math.round((present / days.length) * 1000) / 10 : 0;
  return { workingDays: days.length, presentDays: present, absentDays: days.length - present, hours, percent, eligible: days.length > 0 && percent >= MIN_ATTENDANCE_PERCENT };
}
