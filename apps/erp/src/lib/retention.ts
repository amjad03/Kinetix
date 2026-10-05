// Recording retention: GET /v1/admin/recordings/retention and the grace period setting
// (recordingRetentionGraceDays in PUT /v1/admin/settings). Recordings are deleted after their
// semester ends plus the grace period, unless the teacher keeps them.

export const GRACE_MIN = 0;
export const GRACE_MAX = 90;
export const GRACE_DEFAULT = 7;

export interface RetentionClass {
  sectionId: string;
  sectionName: string;
  total: number;
  kept: number;
  /** Deleted within the next 30 days. */
  expiringSoon: number;
  nextExpiresOn: string | null;
}

export interface RetentionOverview {
  today: string;
  graceDays: number;
  classes: RetentionClass[];
  /** Recordings without a class or a term: kept until a term covers them. */
  noTerm: { count: number; recordings: { id: string; title: string; startedAt: string; sectionName: string | null; teacherName: string }[] };
}

/** The grace period typed in the form, or null when it is not a whole number from 0 to 90. */
export function parseGraceDays(value: string): number | null {
  const v = value.trim();
  if (!/^\d{1,3}$/.test(v)) return null;
  const n = Number(v);
  return n >= GRACE_MIN && n <= GRACE_MAX ? n : null;
}

/** Classes with recordings due for deletion in the next 30 days first, then by name. */
export function expiringFirst(classes: RetentionClass[]): RetentionClass[] {
  return [...classes].sort((a, b) => b.expiringSoon - a.expiringSoon || a.sectionName.localeCompare(b.sectionName));
}

/** Recordings deleted in the next 30 days, across classes. */
export function totalExpiring(classes: RetentionClass[]): number {
  return classes.reduce((n, c) => n + c.expiringSoon, 0);
}
