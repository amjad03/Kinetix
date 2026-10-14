// Users and access, roles and permissions, and the governance reports (services/api/src/access). Pure, so it is unit-tested.

export type AccessLevel = 'full' | 'read' | 'none';
export const ACCESS_LEVELS: AccessLevel[] = ['full', 'read', 'none'];

export interface AccessModule {
  key: string;
  label: string;
  group: string;
  usedBy: string[];
}
export interface AccessRule {
  role: string;
  module: string;
  access: 'read' | 'none';
  updatedAt: string;
  updatedBy: string | null;
}
export interface AccessMatrix {
  modules: AccessModule[];
  roles: { key: string; label: string; people: number }[];
  levels: AccessLevel[];
  rules: AccessRule[];
}
export interface RulesHistoryEntry {
  id: number;
  at: string;
  actor: string | null;
  data: { role?: string; copiedFrom?: string; changes?: Record<string, { before: AccessLevel; after: AccessLevel }> } | null;
}

/** The module groups in the order the matrix shows them. */
export const MODULE_GROUPS = ['students', 'academics', 'exams', 'finance', 'people', 'campus', 'engagement', 'quality', 'work'] as const;

/** A role's level for a module: its rule, or full when it has none. */
export function levelOf(rules: Pick<AccessRule, 'role' | 'module' | 'access'>[], role: string, module: string): AccessLevel {
  return rules.find((r) => r.role === role && r.module === module)?.access ?? 'full';
}

type MatrixLike = { modules: Pick<AccessModule, 'key'>[]; rules: Pick<AccessRule, 'role' | 'module' | 'access'>[] };

/** One role's levels for every module, as the editor's starting draft. */
export function draftFor(matrix: MatrixLike, role: string): Record<string, AccessLevel> {
  return Object.fromEntries(matrix.modules.map((m) => [m.key, levelOf(matrix.rules, role, m.key)]));
}

/** What the editor changed against the saved rules, as the API's `changes`. */
export function changesOf(matrix: MatrixLike, role: string, draft: Record<string, AccessLevel>): { module: string; access: AccessLevel }[] {
  return matrix.modules.filter((m) => draft[m.key] && draft[m.key] !== levelOf(matrix.rules, role, m.key)).map((m) => ({ module: m.key, access: draft[m.key] }));
}

/** How many modules a role has narrowed (view only or none). */
export function narrowedCount(rules: Pick<AccessRule, 'role'>[], role: string): number {
  return rules.filter((r) => r.role === role).length;
}

/** Modules grouped for display, keeping the catalog's order inside each group. */
export function groupModules<M extends Pick<AccessModule, 'group'>>(modules: M[]): { group: string; modules: M[] }[] {
  return MODULE_GROUPS.map((g) => ({ group: g as string, modules: modules.filter((m) => m.group === g) })).filter((g) => g.modules.length > 0);
}

// ---- users -----------------------------------------------------------------------------------------------------------

export interface AccessSession {
  id: string;
  label: string;
  ip: string | null;
  userAgent: string | null;
  mfaVerified: boolean;
  createdAt: string;
  lastSeenAt: string;
}
export interface AccessUser {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  status: 'active' | 'invited' | 'disabled';
  preferredLanguage: string;
  mustChangePassword: boolean;
  createdAt: string;
  roles: string[];
  assignable: string[];
  mfaOn: boolean;
  sessions: AccessSession[];
  departments: { id: string; name: string }[];
  headOf: { id: string; name: string }[];
  signIns: { at: string; action: string; data: Record<string, unknown> | null }[];
}

/** Roles a person has that this page does not hand out (student, guardian, alumni): shown, never edited here. */
export const FAMILY_ROLES = ['student', 'guardian', 'alumni'];

/** A short name for a browser or app from its user agent: "Chrome on Windows", "KINETIX app on Android". */
export function deviceName(s: Pick<AccessSession, 'label' | 'userAgent'>): string {
  if (s.label) return s.label;
  const ua = s.userAgent ?? '';
  if (!ua) return '';
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iOS/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows' : /Mac OS X|Macintosh/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : '';
  const app = /Dart|okhttp|Flutter/i.test(ua) ? 'App' : /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return [app, os].filter(Boolean).join(' · ') || ua.slice(0, 40);
}

// ---- reports ---------------------------------------------------------------------------------------------------------

export interface SignInReport {
  from: string;
  to: string;
  totals: { ok: number; failed: number; people: number; neverSignedIn: number };
  byDay: { day: string; ok: number; failed: number; people: number }[];
  items: { id: number; at: string; action: string; userId: string | null; name: string | null; email: string | null; ip: string | null; device: string | null; userAgent: string | null; data: { method?: string; ip?: string | null; device?: string | null; mfa?: boolean } | null }[];
  repeatFailures: { userId: string | null; name: string | null; n: number; last: string }[];
}
export interface UsageReport {
  from: string;
  to: string;
  totals: { actions: number; activePeople: number };
  byArea: { area: string; actions: number; people: number; last: string }[];
  byRole: { role: string; actions: number; people: number }[];
  people: { userId: string | null; name: string | null; actions: number; areas: number; last: string }[];
  byDay: { day: string; actions: number; people: number }[];
}
export type ApprovalSource = 'workflow' | 'staff_leave' | 'student_leave' | 'task';
export interface ApprovalsReport {
  summary: { source: ApprovalSource; total: number; oldestDays: number | null; d0_2: number; d3_7: number; d8_30: number; d31: number }[];
  oldest: { source: ApprovalSource; id: string; title: string; waitingOn: string | null; since: string; days: number }[];
  byPerson: { waitingOn: string; total: number; overWeek: number }[];
}
export const AGE_BUCKETS = ['d0_2', 'd3_7', 'd8_30', 'd31'] as const;

/** Where a pending item is decided in the ERP; student leave is decided by class teachers in the Teacher App. */
export function approvalHref(source: ApprovalSource): string | null {
  return source === 'workflow' ? '/workflows' : source === 'staff_leave' ? '/hr/leave' : source === 'task' ? '/tasks' : null;
}

/** A report's date range from the page's search params (YYYY-MM-DD); anything malformed is dropped. */
export function rangeParams(sp: { from?: string; to?: string }): URLSearchParams {
  const q = new URLSearchParams();
  const day = /^\d{4}-\d{2}-\d{2}$/;
  if (sp.from && day.test(sp.from)) q.set('from', sp.from);
  if (sp.to && day.test(sp.to)) q.set('to', sp.to);
  if (q.get('from') && q.get('to') && q.get('from')! > q.get('to')!) q.delete('from');
  return q;
}

// ---- data exports ----------------------------------------------------------------------------------------------------

export interface DataExport {
  id: string;
  status: 'queued' | 'running' | 'ready' | 'failed' | 'expired';
  note: string;
  requestedBy: string | null;
  sizeBytes: number | null;
  tableCount: number | null;
  rowCount: number | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  expiresAt: string | null;
  downloadedAt: string | null;
}

/** "12.4 MB". */
export function formatBytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return '';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? Math.round(v) : Math.round(v * 10) / 10} ${units[i]}`;
}

/** Whether the list still has an export being made (the page then refreshes itself). */
export const exportBusy = (rows: Pick<DataExport, 'status'>[]) => rows.some((r) => r.status === 'queued' || r.status === 'running');

// ---- notification settings -------------------------------------------------------------------------------------------

export interface NotificationKind {
  key: string;
  label: string;
  audience: 'families' | 'staff' | 'everyone';
  locked: boolean;
  sent30: number;
}
export interface NotificationSettings {
  kinds: NotificationKind[];
  off: string[];
  pushOff: string[];
}

/** One kind's switch: sent at all, and with a phone push. Turning sending off clears the push choice. */
export function toggleKind(s: Pick<NotificationSettings, 'off' | 'pushOff'>, key: string, what: 'send' | 'push', on: boolean): { off: string[]; pushOff: string[] } {
  const off = new Set(s.off);
  const pushOff = new Set(s.pushOff);
  if (what === 'send') {
    if (on) off.delete(key);
    else {
      off.add(key);
      pushOff.delete(key);
    }
  } else if (on) pushOff.delete(key);
  else pushOff.add(key);
  return { off: [...off].sort(), pushOff: [...pushOff].sort() };
}

// ---- campuses --------------------------------------------------------------------------------------------------------

export interface CampusOverview {
  today: string;
  campuses: { id: string; name: string; code: string | null; city: string | null; active: boolean; head: string | null; programmes: number; classes: number; students: number; attendanceToday: number | null; feesDuePaise: number; feesOverduePaise: number; buildings: number; rooms: number }[];
  totals: { campuses: number; programmes: number; classes: number; students: number; attendanceToday: number | null; feesDuePaise: number; feesOverduePaise: number; buildings: number; rooms: number };
}
