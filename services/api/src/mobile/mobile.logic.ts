import { createHash } from 'node:crypto';

/** "1.4.10+23" → [1, 4, 10]; anything after + or - is ignored; missing parts are 0. Null when it is not a version. */
export function parseVersion(v: string): [number, number, number] | null {
  const core = v.trim().split(/[+\s-]/)[0];
  if (!/^\d{1,4}(\.\d{1,4}){0,2}$/.test(core)) return null;
  const [a = 0, b = 0, c = 0] = core.split('.').map(Number);
  return [a, b, c];
}

/** Negative when a is older than b, 0 when equal, positive when newer. Unparseable versions sort as 0.0.0. */
export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a) ?? [0, 0, 0];
  const y = parseVersion(b) ?? [0, 0, 0];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

export type UpdateStatus = 'ok' | 'update_available' | 'update_required';

/** Older than the minimum: must update before using the app; older than the latest: may update. */
export function updateStatus(version: string, minVersion: string, latestVersion: string): UpdateStatus {
  if (compareVersions(version, minVersion) < 0) return 'update_required';
  if (compareVersions(version, latestVersion) < 0) return 'update_available';
  return 'ok';
}

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Minutes since midnight in [timeZone]. */
function minutesIn(at: Date, timeZone: string): number {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at).map((p) => [p.type, p.value]));
  return Number(parts.hour) * 60 + Number(parts.minute);
}

/**
 * When a person's own quiet hours ("22:00"–"06:30" in the institution's time zone) end, if [at] falls inside them;
 * null outside them (and when start equals end). The window may cross midnight.
 */
export function personalQuietUntil(at: Date, timeZone: string, start: string, end: string): Date | null {
  const s = minutes(start);
  const e = minutes(end);
  if (s === e) return null;
  const now = minutesIn(at, timeZone);
  const inside = s < e ? now >= s && now < e : now >= s || now < e;
  if (!inside) return null;
  const wait = (e - now + 24 * 60) % (24 * 60);
  const out = new Date(at.getTime() + wait * 60_000);
  out.setUTCSeconds(0, 0);
  return out;
}

/**
 * Removes what could identify a person from a crash report before it is saved: email addresses, phone numbers,
 * bearer tokens and JWTs, long digit runs (Aadhaar, account numbers), query strings and UUIDs. The shape of the
 * error stays, so reports still group.
 */
export function scrubCrashText(text: string, max: number): string {
  return text
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<jwt>')
    .replace(/\b(bearer|token|authorization|password|otp|code)(["'\s:=]+)[^\s"',;]+/gi, '$1$2<redacted>')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
    .replace(/\?[^\s)'"]*/g, '?<query>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<id>')
    .replace(/\+?\d[\d\s-]{8,}\d/g, '<number>')
    .slice(0, max);
}

/** Groups the same crash across phones: the app, the error's first line without numbers, and the top five frames. */
export function crashFingerprint(app: string, kind: string, message: string, stack: string): string {
  const first = message.split('\n')[0].replace(/\d+/g, '#').trim();
  const frames = stack
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('#') || l.includes('package:') || l.includes('.dart'))
    .slice(0, 5)
    .map((l) => l.replace(/:\d+(:\d+)?\)?$/, '').replace(/^#\d+\s+/, ''))
    .join('|');
  return createHash('sha256').update(`${app}|${kind}|${first}|${frames}`).digest('hex').slice(0, 40);
}
