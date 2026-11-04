import { localParts } from '../common/time.js';
import type { ChatSettings } from '../db/schema.js';

export type OfficeHours = NonNullable<ChatSettings['officeHours']>;

/** Roles that are a family, not staff. Everyone else is staff. */
export const FAMILY_ROLES = ['guardian', 'student'];

/** Office roles that may answer office threads, and the default when the institution has not chosen. */
export const OFFICE_ROLE_CHOICES = ['accountant', 'admissions_officer', 'hostel_warden', 'transport_manager', 'librarian', 'exam_controller'] as const;
export const DEFAULT_OFFICE_ROLES = ['accountant', 'admissions_officer'];
export const officeRolesOf = (settings: ChatSettings | undefined): string[] => settings?.officeRoles ?? DEFAULT_OFFICE_ROLES;

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

/**
 * Abusive words (English, and Hindi and Kannada as people type them in Latin letters). The filter does not block:
 * it flags the message for the moderators, who decide. Whole words only, so "class" or "Scunthorpe" pass.
 */
const ABUSIVE = ['idiot', 'stupid', 'moron', 'bastard', 'bitch', 'fuck', 'fucking', 'shit', 'asshole', 'dumbass', 'scum', 'useless fellow', 'kamina', 'kameena', 'harami', 'haramkhor', 'kutta', 'kutte', 'saala', 'saali', 'chutiya', 'bewakoof', 'gadha', 'nalayak', 'boli maga', 'sule maga', 'bevarsi', 'loafer'];
const ABUSIVE_RE = new RegExp(`(^|[^\\p{L}])(${ABUSIVE.map((w) => w.replace(/ /g, '\\s+')).join('|')})(?=$|[^\\p{L}])`, 'iu');
const PHONE_RE = /(?:\+?91[\s-]?)?(?<!\d)[6-9]\d{4}[\s-]?\d{5}(?!\d)/;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

/**
 * Why a message should be reviewed, or null: abusive language from anyone, and (safeguarding) staff giving a student
 * a private phone number or email, which moves the conversation where the institution cannot see it.
 */
export function moderationFlag(text: string, staffToStudent: boolean): string | null {
  if (ABUSIVE_RE.test(text)) return 'abusive_language';
  if (staffToStudent && (PHONE_RE.test(text) || EMAIL_RE.test(text))) return 'private_contact';
  return null;
}

/** When the HOD should step in: a family's message unanswered for `hours` (0 = never). */
export function overdueForEscalation(lastFamilyAt: Date | null, lastStaffAt: Date | null, now: Date, hours: number): boolean {
  if (!hours || !lastFamilyAt) return false;
  if (lastStaffAt && lastStaffAt >= lastFamilyAt) return false;
  return now.getTime() - lastFamilyAt.getTime() >= hours * 3600_000;
}

/** Validates "HH:MM" office hours: start before end, at least one day. */
export function validOfficeHours(h: OfficeHours): boolean {
  const re = /^([01]\d|2[0-3]):[0-5]\d$/;
  return re.test(h.start) && re.test(h.end) && h.start < h.end && h.days.length > 0 && h.days.every((d) => d >= 1 && d <= 7);
}
