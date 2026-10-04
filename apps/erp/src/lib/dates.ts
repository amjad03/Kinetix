// Calendar-date helpers. Dates are plain `YYYY-MM-DD` strings in the school's time zone.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(s: unknown): s is string {
  if (typeof s !== 'string' || !ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Today's date in a time zone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: string): number {
  const w = new Date(`${date}T00:00:00Z`).getUTCDay();
  return w === 0 ? 7 : w;
}

export function formatDate(date: string, style: 'long' | 'short' | 'weekday' = 'long'): string {
  const d = new Date(`${date}T00:00:00Z`);
  const opts: Intl.DateTimeFormatOptions =
    style === 'long'
      ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
      : style === 'weekday'
        ? { weekday: 'long' }
        : { weekday: 'short', day: 'numeric', month: 'short' };
  return new Intl.DateTimeFormat('en-IN', { ...opts, timeZone: 'UTC' }).format(d);
}

/** "09:00:00" → "09:00". */
export function hhmm(time: string | null | undefined): string {
  return time ? time.slice(0, 5) : '';
}

/** Days from `from` to `to` (both YYYY-MM-DD). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** "3 min ago", "2 h ago", "yesterday", or a date. */
export function relativeTime(iso: string, now: Date = new Date(), timeZone = 'Asia/Kolkata'): string {
  const diff = Math.round((now.getTime() - Date.parse(iso)) / 1000);
  if (diff < 0) {
    const ahead = -diff;
    if (ahead < 3600) return `in ${Math.max(1, Math.round(ahead / 60))} min`;
    if (ahead < 86_400) return `in ${Math.round(ahead / 3600)} h`;
    return `in ${Math.round(ahead / 86_400)} days`;
  }
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.round(diff / 60)} min ago`;
  if (diff < 86_400) return `${Math.round(diff / 3600)} h ago`;
  if (diff < 2 * 86_400) return 'yesterday';
  return formatDateTime(iso, timeZone, false);
}

export function formatDateTime(iso: string, timeZone = 'Asia/Kolkata', withTime = true): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone,
    day: 'numeric',
    month: 'short',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  }).format(new Date(iso));
}

export function formatTime(iso: string, timeZone = 'Asia/Kolkata'): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}
