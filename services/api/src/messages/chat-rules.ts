import { localParts } from '../common/time.js';
import type { ChatSettings } from '../db/schema.js';

export type OfficeHours = NonNullable<ChatSettings['officeHours']>;

/** Roles that are a family, not staff. Everyone else is staff. */
export const FAMILY_ROLES = ['guardian', 'student'];

/** Students write for themselves by default only at colleges and universities. */
export function studentChatEnabled(settings: ChatSettings | undefined, kind: 'school' | 'college' | 'university'): boolean {
  return settings?.studentChat ?? kind !== 'school';
}

/** Whether `at` falls outside the office hours (false when none are set). */
export function outsideOfficeHours(at: Date, timeZone: string, hours: OfficeHours | null | undefined): boolean {
  if (!hours) return false;
  const { time, isoWeekday } = localParts(at, timeZone);
  const hm = time.slice(0, 5);
  if (!hours.days.includes(isoWeekday)) return true;
  return hm < hours.start || hm >= hours.end;
}

/** A sender's tick for one of their messages: read by the other side, delivered to their app, or only sent. */
export function tick(createdAt: Date, other: { readAt: Date | null; deliveredAt: Date | null }): 'read' | 'delivered' | 'sent' {
  if (other.readAt && other.readAt >= createdAt) return 'read';
  if (other.deliveredAt && other.deliveredAt >= createdAt) return 'delivered';
  return 'sent';
}

/** Validates "HH:MM" office hours: start before end, at least one day. */
export function validOfficeHours(h: OfficeHours): boolean {
  const re = /^([01]\d|2[0-3]):[0-5]\d$/;
  return re.test(h.start) && re.test(h.end) && h.start < h.end && h.days.length > 0 && h.days.every((d) => d >= 1 && d <= 7);
}
