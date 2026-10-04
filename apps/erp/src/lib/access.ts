// Which parts of the ERP each role sees. The API enforces the same rules; this decides what to
// show and where to send someone who opens a page that is not theirs.

import type { RoleName } from './types';

export type Section = 'school' | 'boards' | 'live' | 'fees' | 'syllabus' | 'ai' | 'library' | 'results' | 'timetable' | 'conversations' | 'department' | 'departments' | 'calendar' | 'settings' | 'import';

/** Roles for each section. Matches the API's guards (services/api). */
export const SECTION_ROLES: Record<Section, readonly RoleName[]> = {
  // Today, Classes, Attendance, Homework, Messages: v1/admin/*
  school: ['principal', 'tenant_admin', 'hod'],
  boards: ['principal', 'tenant_admin', 'hod'],
  // realtime.gateway.ts LIVE_VIEW_ROLES
  live: ['principal', 'tenant_admin', 'hod'],
  // fees.service.ts FEE_ROLES
  fees: ['principal', 'tenant_admin', 'accountant'],
  // Reading the library is open to staff; linking subjects needs principal/admin (checked on the page).
  syllabus: ['principal', 'tenant_admin', 'hod'],
  // GET /v1/ai/usage: STAFF_ADMIN_ROLES
  ai: ['principal', 'tenant_admin'],
  // library.controller.ts LIBRARY_ROLES
  library: ['librarian', 'principal', 'tenant_admin'],
  // marks.controller.ts: staff who teach the class, principal and admin. HODs also see their department's classes.
  results: ['principal', 'tenant_admin', 'hod'],
  // timetable-admin.controller.ts: STAFF_ADMIN_ROLES
  timetable: ['principal', 'tenant_admin'],
  // messages.controller.ts: GET /v1/conversations?all=true is for isSchoolAdmin (principal, admin)
  conversations: ['principal', 'tenant_admin'],
  // departments.controller.ts: a head of department's view (the principal and admin see any)
  department: ['hod', 'principal', 'tenant_admin'],
  // departments.controller.ts DepartmentsAdminController: STAFF_ADMIN_ROLES
  departments: ['principal', 'tenant_admin'],
  // calendar.controller.ts: GET /v1/calendar is open to everyone signed in (staff see every entry)
  calendar: ['principal', 'tenant_admin', 'hod', 'accountant', 'librarian'],
  // SettingsController and ConsentAdminController: STAFF_ADMIN_ROLES
  settings: ['principal', 'tenant_admin'],
  // import.controller.ts (bulk import from CSV): STAFF_ADMIN_ROLES
  import: ['principal', 'tenant_admin'],
};

/** Everyone who can use some part of the ERP. */
export const ERP_ROLES: readonly RoleName[] = [...new Set(Object.values(SECTION_ROLES).flat())];

export function canSee(roles: readonly RoleName[], section: Section): boolean {
  return roles.some((r) => SECTION_ROLES[section].includes(r));
}

export function canUseErp(roles: readonly RoleName[]): boolean {
  return roles.some((r) => ERP_ROLES.includes(r));
}

/** Principal and administrator: link subjects to courses (PUT /v1/admin/subjects/:id/course). */
export function canLinkSubjects(roles: readonly RoleName[]): boolean {
  return roles.some((r) => r === 'principal' || r === 'tenant_admin');
}

/** Principal and administrator publish marks from the ERP (teachers publish from the Teacher App). */
export function canPublishMarks(roles: readonly RoleName[]): boolean {
  return roles.some((r) => r === 'principal' || r === 'tenant_admin');
}

/** Principal and administrator keep the academic calendar (CalendarAdminController: STAFF_ADMIN_ROLES). */
export function canEditCalendar(roles: readonly RoleName[]): boolean {
  return roles.some((r) => r === 'principal' || r === 'tenant_admin');
}

/** Own topics: teaching staff and administrators (content.controller.ts EDITORS). */
export function canEditTopics(roles: readonly RoleName[]): boolean {
  return roles.some((r) => ['teacher', 'hod', 'principal', 'tenant_admin'].includes(r));
}

/** The section a path belongs to, or null for pages everyone signed in may open. */
export function sectionOf(pathname: string): Section | null {
  const first = pathname.split('/')[1] ?? '';
  switch (first) {
    case '':
    case 'classes':
    case 'attendance':
    case 'homework':
    case 'messages':
      return 'school';
    case 'boards':
      return 'boards';
    case 'live':
      return 'live';
    case 'fees':
      return 'fees';
    case 'syllabus':
      return 'syllabus';
    case 'ai':
      return 'ai';
    case 'library':
      return 'library';
    case 'results':
      return 'results';
    case 'timetable':
      return 'timetable';
    case 'conversations':
      return 'conversations';
    case 'department':
      return 'department';
    case 'departments':
      return 'departments';
    case 'calendar':
      return 'calendar';
    case 'settings':
      return 'settings';
    case 'import':
      return 'import';
    default:
      return null;
  }
}

/** A head of department who is not also the principal or an administrator. */
export function isOnlyHod(roles: readonly RoleName[]): boolean {
  return roles.includes('hod') && !roles.some((r) => r === 'principal' || r === 'tenant_admin');
}

/**
 * Where a role lands after signing in: Department for a head of department, Today for the
 * principal and administrator, Fees for the accounts office, Library for the librarian.
 */
export function homeFor(roles: readonly RoleName[]): string {
  if (isOnlyHod(roles)) return '/department';
  if (canSee(roles, 'school')) return '/';
  if (canSee(roles, 'fees')) return '/fees';
  if (canSee(roles, 'library')) return '/library';
  return '/login';
}

/** A `next` path is followed only when it is local and the role may open it. */
export function landingFor(roles: readonly RoleName[], next: string | null | undefined): string {
  if (next && next.startsWith('/') && !next.startsWith('//')) {
    const section = sectionOf(next.split('?')[0]);
    if (section === null || canSee(roles, section)) return next;
  }
  return homeFor(roles);
}

/**
 * Heads of department and the principal (and administrator) review lesson plans
 * (POST /v1/lesson-plans/:id/review). The API also checks that a head heads the subject.
 */
export function canReviewLessonPlans(roles: readonly RoleName[]): boolean {
  return roles.some((r) => r === 'hod' || r === 'principal' || r === 'tenant_admin');
}
