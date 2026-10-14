import type { BellPeriod } from '../db/schema-academic-ops.js';

/** Pure rules of academic planning: weekday lists, bell schedules, working days and teaching load. */

/** Where transferred credits come from (credit_transfers.source). */
export const TRANSFER_SOURCES: { value: string; label: string }[] = [
  { value: 'abc', label: 'Academic Bank of Credits' },
  { value: 'swayam', label: 'SWAYAM' },
  { value: 'nptel', label: 'NPTEL' },
  { value: 'mooc', label: 'Other MOOC' },
  { value: 'institution', label: 'Another institution' },
];

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** "Mon,Tue,Wed" or "1,2,3" (or "Mon-Sat") → ISO weekdays, sorted; null when something is not a day. */
export function parseDays(text: string): number[] | null {
  const out = new Set<number>();
  for (const raw of text.split(/[,\s]+/).filter(Boolean)) {
    const range = raw.split('-');
    const day = (x: string) => (/^[1-7]$/.test(x) ? Number(x) : WEEKDAYS.findIndex((d) => d.toLowerCase() === x.trim().toLowerCase().slice(0, 3)) + 1);
    if (range.length === 2) {
      const [a, b] = range.map(day);
      if (a < 1 || b < 1 || a > b) return null;
      for (let d = a; d <= b; d++) out.add(d);
    } else {
      const d = day(raw);
      if (d < 1) return null;
      out.add(d);
    }
  }
  return out.size ? [...out].sort((a, b) => a - b) : null;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * A bell schedule from lines like "P1 09:00-09:55" or "Lunch 13:00-13:45 break": in order, each ending after it
 * starts and none overlapping. Returns the periods, or the problem in plain words.
 */
export function parsePeriods(text: string): BellPeriod[] | string {
  const out: BellPeriod[] = [];
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 20) return 'At most 20 periods and breaks';
  for (const [i, line] of lines.entries()) {
    const m = line.match(/^(.*?)\s*(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})\s*(break|विराम|ವಿರಾಮ)?$/iu);
    if (!m) return `Line ${i + 1}: write it like "P1 09:00-09:55"`;
    const pad = (t: string) => t.padStart(5, '0');
    const [startsAt, endsAt] = [pad(m[2]), pad(m[3])];
    if (!TIME.test(startsAt) || !TIME.test(endsAt)) return `Line ${i + 1}: use times like 09:30`;
    if (startsAt >= endsAt) return `Line ${i + 1}: it must end after it starts`;
    const prev = out[out.length - 1];
    if (prev && startsAt < prev.endsAt) return `Line ${i + 1}: it starts before the line above ends`;
    out.push({ label: m[1].trim() || (m[4] ? 'Break' : `P${out.filter((p) => p.kind === 'class').length + 1}`), startsAt, endsAt, kind: m[4] ? 'break' : 'class' });
  }
  return out.length ? out : 'Add at least one period';
}

/** The schedule back as text, one line per period. */
export const periodsText = (periods: BellPeriod[]) => periods.map((p) => `${p.label} ${p.startsAt}-${p.endsAt}${p.kind === 'break' ? ' break' : ''}`).join('\n');

const addDays = (date: string, n: number) => new Date(new Date(`${date}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() || 7;

/**
 * Working days between two dates (inclusive), by month: the institution's weekly working days, less holidays, plus
 * compensatory working days on other days. `holiday(date)` and `swap(date)` say whether a date is off or follows
 * another weekday.
 */
export function workingDays(from: string, to: string, weekly: number[], holiday: (d: string) => boolean, swap: (d: string) => boolean): { month: string; days: number; holidays: number; swaps: number }[] {
  const months = new Map<string, { month: string; days: number; holidays: number; swaps: number }>();
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const m = months.get(d.slice(0, 7)) ?? { month: d.slice(0, 7), days: 0, holidays: 0, swaps: 0 };
    const usual = weekly.includes(weekdayOf(d));
    if (holiday(d)) {
      if (usual) m.holidays++;
    } else if (swap(d) && !usual) {
      m.swaps++;
      m.days++;
    } else if (usual) m.days++;
    months.set(m.month, m);
  }
  return [...months.values()];
}

/** Teaching load against the norm: over it, under half of it, or fine. */
export function loadStatus(hours: number, norm: number): 'over' | 'light' | 'ok' {
  if (hours > norm) return 'over';
  if (hours < norm / 2) return 'light';
  return 'ok';
}
