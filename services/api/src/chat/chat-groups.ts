import { localParts } from '../common/time.js';

/** Whether a local time (HH:MM) falls in a quiet window that may run past midnight ("21:00" to "07:00"). */
export function inQuietHours(hm: string, start: string | null, end: string | null): boolean {
  if (!start || !end || start === end) return false;
  return start < end ? hm >= start && hm < end : hm >= start || hm < end;
}

/**
 * Why a member may not post now, or null. Owners and admins always may; in an admins-only group nobody else may;
 * in quiet hours members wait until the window ends.
 */
export function postRefusal(thread: { postPolicy: string; quietStart: string | null; quietEnd: string | null }, role: string, at: Date, timeZone: string): string | null {
  if (role === 'owner' || role === 'admin') return null;
  if (thread.postPolicy === 'admins') return 'Only the group’s admins can post here';
  if (inQuietHours(localParts(at, timeZone).time.slice(0, 5), thread.quietStart, thread.quietEnd)) return `The group is quiet until ${thread.quietEnd}`;
  return null;
}
