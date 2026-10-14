import type { RoleName } from '../auth/principal.js';

/**
 * The institution's own access rules ("roles and permissions"): for each staff role and each module, the role keeps
 * what it normally has (full), may only look (read: GET requests), or loses the module (none). Rules only narrow
 * access; the API's own role checks still apply, so a rule never grants a role more than it already has. Settings,
 * users, audit and sign-in are not in the catalog, so nobody can lock the institution out of fixing a rule.
 */

export const ACCESS_LEVELS = ['full', 'read', 'none'] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

/** The roles a rule may narrow: staff roles other than the institution's administrator (who can always fix a rule). */
export const RULE_ROLES = [
  'principal',
  'hod',
  'teacher',
  'librarian',
  'accountant',
  'admissions_officer',
  'hr_manager',
  'exam_controller',
  'examiner',
  'quality_officer',
  'placement_officer',
  'research_coordinator',
  'grievance_officer',
  'counsellor',
  'icc_member',
  'mentor',
  'transport_manager',
  'driver',
  'hostel_warden',
  'canteen_manager',
  'store_keeper',
  'university_admin',
  'external_examiner',
  'accreditation_reviewer',
] as const satisfies readonly RoleName[];
export type RuleRole = (typeof RULE_ROLES)[number];

export interface AccessModule {
  /** The ERP section of the same name, so a module a person cannot use is hidden from their menu. */
  key: string;
  label: string;
  group: 'students' | 'academics' | 'exams' | 'finance' | 'people' | 'campus' | 'engagement' | 'quality' | 'work';
  /** First path segments after `/v1/` that belong to the module. */
  prefixes: string[];
  /** The roles that normally use it (the others have nothing to narrow). */
  usedBy: RoleName[];
}

const LEADERS: RoleName[] = ['principal'];
const STAFF_DESKS: RoleName[] = ['principal', 'hod', 'teacher', 'librarian', 'accountant', 'admissions_officer', 'hr_manager', 'exam_controller', 'examiner', 'quality_officer', 'placement_officer', 'research_coordinator', 'grievance_officer', 'counsellor', 'icc_member', 'mentor', 'transport_manager', 'driver', 'hostel_warden', 'canteen_manager', 'store_keeper', 'university_admin'];

export const ACCESS_MODULES: AccessModule[] = [
  { key: 'admissions', label: 'Admissions', group: 'students', prefixes: ['admissions'], usedBy: [...LEADERS, 'admissions_officer'] },
  { key: 'students', label: 'Students', group: 'students', prefixes: ['students', 'student-leave'], usedBy: [...LEADERS, 'hod', 'teacher', 'admissions_officer', 'accountant'] },
  { key: 'attendance', label: 'Attendance', group: 'students', prefixes: ['attendance'], usedBy: [...LEADERS, 'hod', 'teacher'] },
  { key: 'health', label: 'Student health', group: 'students', prefixes: ['student-health'], usedBy: [...LEADERS, 'counsellor'] },
  { key: 'timetable', label: 'Timetable and scheduling', group: 'academics', prefixes: ['timetable', 'scheduling'], usedBy: [...LEADERS, 'hod', 'teacher'] },
  { key: 'curriculum', label: 'Curriculum', group: 'academics', prefixes: ['curriculum'], usedBy: [...LEADERS, 'hod', 'teacher', 'quality_officer', 'exam_controller', 'university_admin', 'accreditation_reviewer'] },
  { key: 'courses', label: 'Courses and learning', group: 'academics', prefixes: ['lms', 'content', 'homework'], usedBy: [...LEADERS, 'hod', 'teacher'] },
  { key: 'courseRegistration', label: 'Course registration', group: 'academics', prefixes: ['course-registration'], usedBy: [...LEADERS, 'hod'] },
  { key: 'questionBank', label: 'Question bank', group: 'exams', prefixes: ['question-bank'], usedBy: [...LEADERS, 'hod', 'teacher'] },
  { key: 'exams', label: 'Examinations', group: 'exams', prefixes: ['exams', 'exam-sessions', 'exam-office', 'external-examiners'], usedBy: [...LEADERS, 'hod', 'teacher', 'exam_controller'] },
  { key: 'evaluation', label: 'Evaluation', group: 'exams', prefixes: ['evaluation'], usedBy: [...LEADERS, 'exam_controller', 'examiner', 'hod', 'external_examiner'] },
  { key: 'results', label: 'Marks and results', group: 'exams', prefixes: ['marks', 'university-results'], usedBy: [...LEADERS, 'hod', 'teacher', 'exam_controller'] },
  { key: 'fees', label: 'Fees', group: 'finance', prefixes: ['fees', 'fee-accounts'], usedBy: [...LEADERS, 'accountant'] },
  { key: 'finance', label: 'Finance and accounts', group: 'finance', prefixes: ['finance', 'tally'], usedBy: [...LEADERS, 'accountant'] },
  { key: 'payroll', label: 'Payroll', group: 'finance', prefixes: ['payroll'], usedBy: [...LEADERS, 'hr_manager', 'accountant'] },
  { key: 'hr', label: 'HR and leave', group: 'people', prefixes: ['hr'], usedBy: STAFF_DESKS },
  { key: 'documents', label: 'Certificates and documents', group: 'people', prefixes: ['documents', 'academic-docs'], usedBy: [...LEADERS, 'accountant', 'hr_manager', 'admissions_officer'] },
  { key: 'library', label: 'Library', group: 'campus', prefixes: ['library'], usedBy: [...LEADERS, 'librarian', 'teacher'] },
  { key: 'hostel', label: 'Hostel', group: 'campus', prefixes: ['hostel'], usedBy: [...LEADERS, 'hostel_warden'] },
  { key: 'transport', label: 'Transport', group: 'campus', prefixes: ['transport'], usedBy: [...LEADERS, 'transport_manager', 'driver'] },
  { key: 'canteen', label: 'Canteen', group: 'campus', prefixes: ['canteen'], usedBy: [...LEADERS, 'canteen_manager'] },
  { key: 'inventory', label: 'Inventory and purchase', group: 'campus', prefixes: ['inventory'], usedBy: [...LEADERS, 'store_keeper'] },
  { key: 'assets', label: 'Assets', group: 'campus', prefixes: ['assets', 'asset-ops'], usedBy: [...LEADERS, 'store_keeper'] },
  { key: 'placements', label: 'Placements', group: 'engagement', prefixes: ['placements'], usedBy: [...LEADERS, 'placement_officer', 'hod'] },
  { key: 'careers', label: 'Careers', group: 'engagement', prefixes: ['careers'], usedBy: [...LEADERS, 'placement_officer', 'hod'] },
  { key: 'alumni', label: 'Alumni', group: 'engagement', prefixes: ['alumni'], usedBy: [...LEADERS, 'placement_officer', 'accountant'] },
  { key: 'research', label: 'Research', group: 'engagement', prefixes: ['research'], usedBy: [...LEADERS, 'research_coordinator', 'hod', 'teacher'] },
  { key: 'projects', label: 'Projects', group: 'engagement', prefixes: ['projects', 'impact'], usedBy: [...LEADERS, 'research_coordinator', 'hod'] },
  { key: 'campusLife', label: 'Campus life', group: 'engagement', prefixes: ['campus-life', 'houses'], usedBy: [...LEADERS, 'hod', 'teacher'] },
  { key: 'comms', label: 'Announcements and broadcasts', group: 'engagement', prefixes: ['comms', 'broadcasts', 'announcements'], usedBy: [...LEADERS, 'hod', 'teacher'] },
  { key: 'chat', label: 'Chat', group: 'engagement', prefixes: ['chat', 'conversations'], usedBy: STAFF_DESKS },
  { key: 'surveys', label: 'Surveys and polls', group: 'engagement', prefixes: ['surveys', 'polls'], usedBy: [...LEADERS, 'hod', 'teacher', 'quality_officer'] },
  { key: 'grievances', label: 'Grievances and welfare', group: 'engagement', prefixes: ['grievances', 'welfare', 'counselling', 'discipline'], usedBy: [...LEADERS, 'grievance_officer', 'icc_member', 'counsellor'] },
  { key: 'mentoring', label: 'Mentoring', group: 'engagement', prefixes: ['mentoring'], usedBy: [...LEADERS, 'hod', 'teacher', 'mentor', 'counsellor'] },
  { key: 'obe', label: 'Outcome-based education', group: 'quality', prefixes: ['obe'], usedBy: [...LEADERS, 'hod', 'teacher', 'quality_officer'] },
  { key: 'accreditation', label: 'Accreditation and IQAC', group: 'quality', prefixes: ['accreditation', 'quality', 'quality-hub', 'academic-audit'], usedBy: [...LEADERS, 'hod', 'teacher', 'quality_officer', 'accreditation_reviewer'] },
  { key: 'reports', label: 'Reports and analytics', group: 'quality', prefixes: ['analytics'], usedBy: [...LEADERS, 'hod', 'accountant', 'hr_manager', 'exam_controller', 'admissions_officer', 'librarian', 'hostel_warden', 'transport_manager', 'store_keeper', 'placement_officer'] },
  { key: 'workflows', label: 'Approvals and workflows', group: 'work', prefixes: ['workflows'], usedBy: STAFF_DESKS },
  { key: 'tasks', label: 'Tasks', group: 'work', prefixes: ['tasks'], usedBy: STAFF_DESKS },
];

const BY_PREFIX = new Map<string, AccessModule>(ACCESS_MODULES.flatMap((m) => m.prefixes.map((p) => [p, m] as const)));
const BY_KEY = new Map<string, AccessModule>(ACCESS_MODULES.map((m) => [m.key, m]));

export const accessModule = (key: string) => BY_KEY.get(key);

/**
 * The module a request path belongs to. `/v1/records/<entity>` belongs to the entity's module (given by `entityModule`),
 * when that is a module of the catalog.
 */
export function accessModuleOfPath(path: string, entityModule?: (entity: string) => string | undefined): AccessModule | null {
  const parts = path.split('?')[0].replace(/^\/+/, '').split('/');
  if (parts[0] !== 'v1') return null;
  if (parts[1] === 'records' && parts[2] && entityModule) {
    const m = entityModule(parts[2]);
    return (m && BY_KEY.get(m)) || null;
  }
  return BY_PREFIX.get(parts[1]) ?? null;
}

/** A person's access to a module: the most any of their roles has. Roles outside the rules (the administrator) keep full access. */
export function effectiveAccess(roles: readonly string[], module: string, rules: ReadonlyMap<string, AccessLevel>): AccessLevel {
  const rank: Record<AccessLevel, number> = { none: 0, read: 1, full: 2 };
  let best: AccessLevel = 'none';
  for (const r of roles) {
    const level = (RULE_ROLES as readonly string[]).includes(r) ? (rules.get(`${r}:${module}`) ?? 'full') : 'full';
    if (rank[level] > rank[best]) best = level;
    if (best === 'full') break;
  }
  return roles.length ? best : 'full';
}

/** Whether a request with this method is allowed at this level. */
export const allows = (level: AccessLevel, method: string) => level === 'full' || (level === 'read' && (method === 'GET' || method === 'HEAD'));
