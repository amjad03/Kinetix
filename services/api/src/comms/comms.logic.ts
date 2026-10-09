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

/** A phone number in E.164 form (a bare 10-digit Indian number gets +91), or null. */
export function toE164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, '');
  if (/^\+\d{10,14}$/.test(digits)) return digits;
  if (/^\d{10}$/.test(digits)) return `+91${digits}`;
  if (/^91\d{10}$/.test(digits)) return `+${digits}`;
  return null;
}
