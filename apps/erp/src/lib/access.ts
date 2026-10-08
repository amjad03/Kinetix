// Which parts of the ERP each role sees. The API enforces the same rules; this decides what to
// show and where to send someone who opens a page that is not theirs.

import type { RoleName } from './types';

export type Section = 'dashboard' | 'school' | 'courses' | 'finance' | 'boards' | 'devices' | 'live' | 'fees' | 'syllabus' | 'ai' | 'library' | 'results' | 'timetable' | 'conversations' | 'department' | 'departments' | 'calendar' | 'settings' | 'import' | 'transport' | 'hostel' | 'canteen' | 'inventory' | 'assets' | 'admissions' | 'students' | 'exams' | 'obe' | 'hr' | 'payroll' | 'payslips' | 'documents' | 'topicVideos' | 'reports' | 'placements' | 'research' | 'grievances' | 'surveys' | 'tasks' | 'campusLife' | 'mentoring' | 'courseFiles' | 'academicAudit' | 'courseRegistration' | 'skills' | 'questionBank' | 'workflows' | 'evaluation' | 'diary' | 'ptm' | 'earlyYears' | 'health' | 'audit' | 'connectors' | 'alumni';
/** Roles for each section. Matches the API's guards (services/api). */
export const SECTION_ROLES: Record<Section, readonly RoleName[]> = {
  // The role dashboard at / (KPIs and pending tasks for the role); other desk roles keep their own desk as home.
  dashboard: ['principal', 'tenant_admin', 'hod', 'accountant', 'admissions_officer', 'hr_manager'],
  // Today, Classes, Attendance, Homework, Messages: v1/admin/*
  school: ['principal', 'tenant_admin', 'hod'],
  // lms.controller.ts: teachers of the class manage in the Teacher App; the ERP is for heads of department and leaders
  courses: ['principal', 'tenant_admin', 'hod'],
  // finance.controller.ts FINANCE_ROLES: scholarships, budgets, GL export (fees.service.ts FEE_ROLES)
  finance: ['principal', 'tenant_admin', 'accountant'],
  boards: ['principal', 'tenant_admin', 'hod'],
  // fleet.controller.ts: STAFF_ADMIN_ROLES (IT console: health, remote actions)
  devices: ['principal', 'tenant_admin'],
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
  // transport.controller.ts TRANSPORT_ROLES (a driver uses the Teacher App, not the ERP)
  transport: ['transport_manager', 'principal', 'tenant_admin'],
  // hostel.controller.ts HOSTEL_ROLES
  hostel: ['hostel_warden', 'principal', 'tenant_admin'],
  // canteen.controller.ts CANTEEN_ROLES
  canteen: ['canteen_manager', 'principal', 'tenant_admin'],
  // inventory.controller.ts and assets.controller.ts STORE_ROLES
  inventory: ['store_keeper', 'principal', 'tenant_admin'],
  assets: ['store_keeper', 'principal', 'tenant_admin'],
  // admissions.controller.ts ADMISSIONS_ROLES
  admissions: ['principal', 'tenant_admin', 'admissions_officer'],
  // students.controller.ts PROFILE_ROLES (status changes and promotion are principal and admin only: LIFECYCLE_ROLES)
  students: ['principal', 'tenant_admin', 'admissions_officer', 'hod', 'accountant'],
  // exams.controller.ts / schemes.controller.ts / results.controller.ts: principal and administrator manage, heads of department read and verify
  exams: ['principal', 'tenant_admin', 'hod'],
  // evaluation.controller.ts: the exam office (ADMIN roles) sets up papers, allocates examiners and pushes marks
  evaluation: ['principal', 'tenant_admin'],
  // audit.controller.ts AUDIT_ROLES (viewing the log is itself audited)
  audit: ['principal', 'tenant_admin'],
  // connectors.controller.ts: the principal reads, the administrator configures
  connectors: ['principal', 'tenant_admin'],
  // alumni-giving.controller.ts GIVING_ROLES (volunteering tab: alumni relations only)
  alumni: ['principal', 'tenant_admin', 'placement_officer', 'accountant'],
  // obe.controller.ts MANAGE: principal, administrator and heads of department
  obe: ['principal', 'tenant_admin', 'hod'],
  // hr.controller.ts, leave.controller.ts, recruitment.controller.ts: HR_ROLES (the head of department decides leave in the API)
  hr: ['principal', 'tenant_admin', 'hr_manager'],
  // payroll.controller.ts PAYROLL_ROLES; approving and locking is for the principal and administrator (canApprovePayroll)
  payroll: ['principal', 'tenant_admin', 'hr_manager', 'accountant'],
  // GET /v1/payroll/payslips/me: a staff member's own payslips (teachers read theirs in the Teacher App)
  // documents.access.ts OFFICE_ROLES: certificates, ID cards, the document vault
  documents: ['principal', 'tenant_admin', 'accountant', 'hr_manager'],
  payslips: ['principal', 'tenant_admin', 'hod', 'hr_manager', 'accountant', 'librarian'],
  // content.controller / concept-videos.controller: the principal and admin manage the institution's videos and approve
  // teachers'; a head of department adds videos for their own classes (teachers do that in the Teacher App).
  topicVideos: ['principal', 'tenant_admin', 'hod'],
  // placements.access.ts PLACEMENT_VIEW_ROLES (the placement cell edits; a head of department reads)
  placements: ['principal', 'tenant_admin', 'placement_officer', 'hod'],
  // research.controller.ts RESEARCH_VIEW_ROLES
  research: ['principal', 'tenant_admin', 'research_coordinator', 'hod'],
  // welfare.access.ts GRIEVANCE_STAFF and COMMITTEE_ROLES (committee matters show only to committee members)
  grievances: ['principal', 'tenant_admin', 'grievance_officer', 'icc_member'],
  // surveys.controller.ts SURVEY_ROLES (teachers build surveys in the Teacher App; the ERP is for leaders and heads of department)
  surveys: ['principal', 'tenant_admin', 'hod'],
  // course-registration.controller.ts REGISTRATION_ADMIN (the principal sets the window; heads approve their department's courses)
  courseRegistration: ['principal', 'tenant_admin', 'hod'],
  // workflows.controller.ts WORKFLOW_ROLES (= TASK_ROLES): every staff role starts requests and decides its own steps; the route editor is for the principal
  workflows: ['principal', 'tenant_admin', 'hod', 'accountant', 'librarian', 'transport_manager', 'hostel_warden', 'canteen_manager', 'store_keeper', 'admissions_officer', 'hr_manager', 'placement_officer', 'research_coordinator', 'grievance_officer', 'counsellor', 'icc_member'],
  // tasks.controller.ts TASK_ROLES: every staff role that signs in to the ERP
  tasks: ['principal', 'tenant_admin', 'hod', 'accountant', 'librarian', 'transport_manager', 'hostel_warden', 'canteen_manager', 'store_keeper', 'admissions_officer', 'hr_manager', 'placement_officer', 'research_coordinator', 'grievance_officer', 'counsellor', 'icc_member'],
  // campus-life: committees are COMMITTEE_STAFF (campus-life.access.ts); teachers run clubs and events in the Teacher App
  campusLife: ['principal', 'tenant_admin', 'hod'],
  // mentoring.controller.ts MENTORING_ADMIN (teachers and counsellors log sessions in the Teacher App)
  mentoring: ['principal', 'tenant_admin', 'hod'],
  // course-files.controller.ts: leaders and the head of department build and review course files here; teachers use the Teacher App
  courseFiles: ['principal', 'tenant_admin', 'hod'],
  // academic-audit.controller.ts AUDITORS: leaders write templates, a head of department audits their own department
  academicAudit: ['principal', 'tenant_admin', 'hod'],
  // skills.access.ts SKILL_ADMIN (teachers record evidence and tag SDGs in the Teacher App)
  skills: ['principal', 'tenant_admin', 'hod'],
  // question-bank.controller.ts EXAM_STAFF: leaders and heads of department run the bank and papers here; teachers write and moderate in the Teacher App
  questionBank: ['principal', 'tenant_admin', 'hod'],
  // school-life/diary.controller.ts DIARY_WRITERS (teachers write in the Teacher App; the ERP is for leaders and heads of department)
  diary: ['principal', 'tenant_admin', 'hod'],
  // school-life/ptm.controller.ts PTM_ORGANISERS (teachers give their slots in the Teacher App)
  ptm: ['principal', 'tenant_admin', 'hod'],
  // school-life/early-years.controller.ts EARLY_YEARS_STAFF
  earlyYears: ['principal', 'tenant_admin', 'hod'],
  // school-life/school-life.service.ts HEALTH_STAFF (no nurse role yet; teachers never see health records)
  health: ['principal', 'tenant_admin', 'counsellor'],
  // analytics.controller.ts ANALYTICS_ROLES: each report then checks its own roles (the catalogue lists only the caller's)
  reports: ['principal', 'tenant_admin', 'hod', 'accountant', 'hr_manager'],
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

/** Principal and administrator change students' status, class and run the yearly promotion (LIFECYCLE_ROLES). */
export function canChangeLifecycle(roles: readonly RoleName[]): boolean {
  return roles.some((r) => r === 'principal' || r === 'tenant_admin');
}

/** The section a path belongs to, or null for pages everyone signed in may open. */
export function sectionOf(pathname: string): Section | null {
  const first = pathname.split('/')[1] ?? '';
  switch (first) {
    case '':
      return 'dashboard';
    case 'classes':
    case 'attendance':
    case 'homework':
    case 'messages':
      return 'school';
    case 'courses':
      return 'courses';
    case 'scholarships':
    case 'budgets':
    case 'gl-export':
      return 'finance';
    case 'boards':
      return 'boards';
    case 'devices':
      return 'devices';
    case 'live':
      return 'live';
    case 'fees':
      return 'fees';
    case 'syllabus':
      return 'syllabus';
    case 'topic-videos':
      return 'topicVideos';
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
    case 'transport':
    case 'hostel':
    case 'canteen':
    case 'inventory':
    case 'assets':
      return first;
    case 'admissions':
      return 'admissions';
    case 'students':
      return 'students';
    case 'exams':
      return 'exams';
    case 'evaluation':
      return 'evaluation';
    case 'obe':
      return 'obe';
    case 'hr':
      return 'hr';
    case 'reports':
      return 'reports';
    case 'surveys':
      return 'surveys';
    case 'tasks':
      return 'tasks';
    case 'workflows':
      return 'workflows';
    case 'audit':
    case 'connectors':
    case 'alumni':
      return first;
    case 'course-registration':
      return 'courseRegistration';
    case 'documents':
      return 'documents';
    case 'skills':
      return 'skills';
    case 'campus-life':
      return 'campusLife';
    case 'placements':
    case 'research':
    case 'grievances':
      return first;
    case 'mentoring':
      return 'mentoring';
    case 'course-files':
      return 'courseFiles';
    case 'question-bank':
      return 'questionBank';
    case 'diary':
      return 'diary';
    case 'ptm':
      return 'ptm';
    case 'early-years':
      return 'earlyYears';
    case 'health':
      return 'health';
    case 'academic-audit':
      return 'academicAudit';
    case 'payroll':
      return pathname.startsWith('/payroll/payslips') ? 'payslips' : 'payroll';
    default:
      return null;
  }
}

/** A head of department who is not also the principal or an administrator. */
export function isOnlyHod(roles: readonly RoleName[]): boolean {
  return roles.includes('hod') && !roles.some((r) => r === 'principal' || r === 'tenant_admin');
}

/**
 * Where a role lands after signing in: their dashboard (/) for the principal, administrator, head of
 * department, accounts office, admissions officer and HR manager; the library for the librarian; and
 * the desk of the transport, hostel, canteen or store role.
 */
export function homeFor(roles: readonly RoleName[]): string {
  if (canSee(roles, 'dashboard')) return '/';
  if (canSee(roles, 'library')) return '/library';
  for (const s of ['transport', 'hostel', 'canteen', 'inventory'] as const) if (canSee(roles, s)) return `/${s}`;
  for (const s of ['placements', 'research', 'grievances'] as const) if (canSee(roles, s)) return `/${s}`;
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

/** Approving, locking and reopening a payroll run, and the statutory rates: principal and administrator. */
export function canApprovePayroll(roles: readonly RoleName[]): boolean {
  return roles.some((r) => r === 'principal' || r === 'tenant_admin');
}

/** Principal and administrator add the institution's topic videos and approve teachers' (STAFF_ADMIN_ROLES). */
export function canReviewVideos(roles: readonly RoleName[]): boolean {
  return roles.some((r) => r === 'principal' || r === 'tenant_admin');
}
