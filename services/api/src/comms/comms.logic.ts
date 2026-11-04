/** Pure rules of the communication engine: template filling and the retry schedule. */

/** Attempts before a delivery is left as failed. */
export const MAX_ATTEMPTS = 3;
/** Minutes to wait after the first, second and third failure. */
const BACKOFF_MINUTES = [15, 60, 240];

/** Minutes until the next try after `attempts` failures, or null once the attempts are used up. */
export function retryDelayMinutes(attempts: number): number | null {
  return attempts >= MAX_ATTEMPTS ? null : BACKOFF_MINUTES[Math.max(0, attempts - 1)];
}

/** The `{{name}}` placeholders of a text, in order, without repeats. */
export function placeholders(text: string): string[] {
  return [...new Set([...text.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)].map((m) => m[1]))];
}

/** Fills `{{name}}` placeholders. Names with no value are listed in `missing` and left blank. */
export function fillTemplate(text: string, vars: Record<string, string>): { text: string; missing: string[] } {
  const missing = placeholders(text).filter((k) => vars[k] === undefined);
  return { text: text.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, k: string) => vars[k] ?? ''), missing };
}

export type Repeat = 'none' | 'daily' | 'weekly' | 'monthly';

/**
 * The next send of a recurring campaign, or null when it does not repeat or the next one falls after `until`
 * (a YYYY-MM-DD date, inclusive). A monthly send on the 31st lands on the last day of shorter months.
 */
export function nextOccurrence(at: Date, repeat: Repeat, until: string | null): Date | null {
  if (repeat === 'none') return null;
  const next = new Date(at.getTime());
  if (repeat === 'daily') next.setUTCDate(next.getUTCDate() + 1);
  else if (repeat === 'weekly') next.setUTCDate(next.getUTCDate() + 7);
  else {
    const day = at.getUTCDate();
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    next.setUTCDate(Math.min(day, last));
  }
  if (until && next.toISOString().slice(0, 10) > until) return null;
  return next;
}

/** A phone number in E.164 form (a bare 10-digit Indian number gets +91), or null. */
export function toE164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, '');
  if (/^\+\d{10,14}$/.test(digits)) return digits;
  if (/^\d{10}$/.test(digits)) return `+91${digits}`;
  if (/^91\d{10}$/.test(digits)) return `+${digits}`;
  return null;
}

/** A WhatsApp template's body parameters ({{1}}, {{2}}…) in the order its placeholders appear in our text. */
export function waParams(body: string, vars: Record<string, string>): string[] {
  return placeholders(body).map((k) => vars[k] ?? '');
}

/** Channels the engine can send through. */
export const ENGINE_CHANNELS = ['in_app', 'whatsapp', 'sms', 'email'] as const;
export type EngineChannel = (typeof ENGINE_CHANNELS)[number];

/** The channels a delivery tries in turn: the template's own, then the fallback ones not already in the chain. */
export function channelChain(primary: string, fallback: readonly string[]): string[] {
  const out = [primary];
  for (const c of fallback) if (!out.includes(c)) out.push(c);
  return out;
}

const GSM_BASIC = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXT = '^{}\\[~]|€';

/**
 * SMS parts a text is billed as: GSM-7 text fits 160 characters in one part and 153 per part when longer (extension
 * characters such as € count twice); any character outside GSM-7 (Hindi, Kannada, emoji) makes it Unicode: 70 in one
 * part and 67 per part.
 */
export function smsUnits(text: string): number {
  let len = 0;
  for (const ch of text) {
    if (GSM_BASIC.includes(ch)) len += 1;
    else if (GSM_EXT.includes(ch)) len += 2;
    else {
      const n = [...text].length;
      return n <= 70 ? 1 : Math.ceil(n / 67);
    }
  }
  return len <= 160 ? 1 : Math.ceil(len / 153);
}

/** An address as it may appear in logs and reports: +91******3210, ra***@example.in. */
export function maskAddress(address: string | null | undefined): string {
  if (!address) return '';
  if (address.includes('@')) {
    const [local, domain] = address.split('@');
    return `${local.slice(0, 2)}***@${domain}`;
  }
  return address.length > 7 ? `${address.slice(0, 3)}******${address.slice(-4)}` : '****';
}

/** TRAI DLT: entity and template ids are 19 digits (some operators issue 12 to 20); a header is 6 letters, or 6 digits for promotional text. */
export const DLT_ID = /^\d{12,20}$/;
export const DLT_HEADER = /^([A-Z]{6}|\d{6})$/;

/** Minutes past midnight of a moment in a time zone. */
function minutesIn(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: 'numeric', hourCycle: 'h23', timeZone }).formatToParts(at);
  const get = (k: string) => Number(parts.find((p) => p.type === k)?.value ?? 0);
  return (get('hour') % 24) * 60 + get('minute');
}

/**
 * When a send that falls in the quiet hours [startHour, endHour) may go out: the end of the quiet window, or null
 * when `at` is outside it. The window may run past midnight (21 to 7).
 */
export function quietUntil(at: Date, timeZone: string, startHour: number, endHour: number): Date | null {
  if (startHour === endHour) return null;
  const now = minutesIn(at, timeZone);
  const start = startHour * 60;
  const end = endHour * 60;
  const inside = start < end ? now >= start && now < end : now >= start || now < end;
  if (!inside) return null;
  const wait = (end - now + 24 * 60) % (24 * 60);
  const out = new Date(at.getTime() + wait * 60_000);
  out.setUTCSeconds(0, 0);
  return out;
}

/** A delivery report in the engine's words. */
export type ReportStatus = 'delivered' | 'read' | 'failed' | 'bounced';

/** Words providers use in delivery reports, mapped to the engine's. Unknown words are ignored (null). */
export function reportStatus(raw: string | number | null | undefined): ReportStatus | null {
  const s = String(raw ?? '').trim().toLowerCase();
  if (['1', 'delivered', 'delivrd', 'success', 'deliveredtohandset', 'delivery'].includes(s)) return 'delivered';
  if (['read', 'seen'].includes(s)) return 'read';
  if (['bounce', 'bounced', 'hard_bounce', 'permanent'].includes(s)) return 'bounced';
  if (['2', '9', '16', '17', '25', 'failed', 'fail', 'undeliv', 'undelivered', 'rejected', 'rejectd', 'expired', 'ndnc', 'dnd', 'error'].includes(s)) return 'failed';
  return null;
}

/** STOP-style replies that opt a number out of a channel (TRAI and WhatsApp both expect them honoured). */
export const isStopWord = (text: string) => /^\s*(stop|unsubscribe|stop all|optout|opt out|cancel|band karo|बंद|बंद करो|ನಿಲ್ಲಿಸಿ)\s*[.!]*\s*$/iu.test(text);
/** Replies that opt back in. */
export const isStartWord = (text: string) => /^\s*(start|subscribe|optin|opt in|haan|हाँ|ಹೌದು)\s*[.!]*\s*$/iu.test(text);
