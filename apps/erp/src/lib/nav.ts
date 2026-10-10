// The ERP's navigation: pages grouped by domain. Which groups and pages a person sees is decided by access.ts.
import type { MessageKey } from '@/i18n/messages';
import { canSee, type Section } from './access';
import type { RoleName } from './types';
import { inWorkspace, type Workspace } from './workspaces';

export type NavIcon =
  | 'dashboard' | 'admissions' | 'students' | 'academics' | 'timetable' | 'attendance' | 'exams' | 'obe' | 'lms' | 'finance' | 'hr' | 'library'
  | 'campus' | 'inventory' | 'communication' | 'reports' | 'settings'
  | 'classes' | 'calendar' | 'homework' | 'results' | 'boards' | 'devices' | 'live' | 'topicVideos' | 'syllabus' | 'departments' | 'documents' | 'payroll' | 'payslips' | 'transport'
  | 'hostel' | 'canteen' | 'campusLife' | 'assets' | 'placements' | 'research' | 'grievances' | 'messages' | 'conversations' | 'ai' | 'department' | 'import' | 'platform' | 'surveys' | 'tasks' | 'work' | 'mentoring' | 'courseFiles' | 'academicAudit' | 'courseRegistration' | 'skills' | 'questionBank' | 'workflows' | 'diary' | 'ptm' | 'earlyYears' | 'health';

export interface NavItem {
  href: string;
  label: MessageKey;
  section: Section | 'platform';
  icon: NavIcon;
}

export interface NavGroup {
  id: string;
  label: MessageKey;
  icon: NavIcon;
  items: NavItem[];
  /** The group has one page by design (its link carries the group's name); a group cut down to one page by access shows that page's name. */
  solo?: boolean;
}

/**
 * Placements is in the product plan but has no page yet, so it is not listed: a group appears only
 * when it has at least one page the person may open.
 */
export const NAV_GROUPS: NavGroup[] = [
  { id: 'dashboard', label: 'grp.dashboard', icon: 'dashboard', items: [{ href: '/', label: 'nav.dashboard', section: 'dashboard', icon: 'dashboard' }] },
  { id: 'admissions', label: 'grp.admissions', icon: 'admissions', items: [{ href: '/admissions', label: 'nav.admissions', section: 'admissions', icon: 'admissions' }, { href: '/admissions-tools', label: 'nav.admissionsTools', section: 'admissionsTools', icon: 'admissions' }] },
  {
    id: 'students',
    label: 'grp.students',
    icon: 'students',
    items: [
      { href: '/students', label: 'nav.students', section: 'students', icon: 'students' },
      { href: '/mentoring', label: 'nav.mentoring', section: 'mentoring', icon: 'mentoring' },
      { href: '/diary', label: 'nav.diary', section: 'diary', icon: 'diary' },
      { href: '/ptm', label: 'nav.ptm', section: 'ptm', icon: 'ptm' },
      { href: '/early-years', label: 'nav.earlyYears', section: 'earlyYears', icon: 'earlyYears' },
      { href: '/health', label: 'nav.health', section: 'health', icon: 'health' },
      { href: '/documents', label: 'nav.documents', section: 'documents', icon: 'documents' },
    ],
  },
  {
    id: 'academics',
    label: 'grp.academics',
    icon: 'academics',
    items: [
      { href: '/classes', label: 'nav.classes', section: 'school', icon: 'classes' },
      { href: '/syllabus', label: 'nav.syllabus', section: 'syllabus', icon: 'syllabus' },
      { href: '/curriculum', label: 'nav.curriculum', section: 'curriculum', icon: 'syllabus' },
      { href: '/school-mode', label: 'nav.schoolMode', section: 'schoolMode', icon: 'classes' },
      { href: '/university', label: 'nav.university', section: 'university', icon: 'departments' },
      { href: '/departments', label: 'nav.departments', section: 'departments', icon: 'departments' },
      { href: '/course-files', label: 'nav.courseFiles', section: 'courseFiles', icon: 'courseFiles' },
      { href: '/academic-audit', label: 'nav.academicAudit', section: 'academicAudit', icon: 'academicAudit' },
      { href: '/course-registration', label: 'nav.courseRegistration', section: 'courseRegistration', icon: 'courseRegistration' },
      { href: '/question-bank', label: 'nav.questionBank', section: 'questionBank', icon: 'questionBank' },
      { href: '/learning-support', label: 'nav.learningSupport', section: 'learningSupport', icon: 'classes' },
      { href: '/assessment-tools', label: 'nav.assessmentTools', section: 'assessmentTools', icon: 'questionBank' },
    ],
  },
  {
    id: 'timetable',
    label: 'grp.timetable',
    icon: 'timetable',
    items: [
      { href: '/timetable', label: 'nav.timetable', section: 'timetable', icon: 'timetable' },
      { href: '/calendar', label: 'nav.calendar', section: 'calendar', icon: 'calendar' },
      { href: '/scheduling', label: 'nav.scheduling', section: 'scheduling', icon: 'timetable' },
    ],
  },
  {
    id: 'attendance',
    label: 'grp.attendance',
    icon: 'attendance',
    items: [
      { href: '/attendance', label: 'nav.attendance', section: 'school', icon: 'attendance' },
      { href: '/attendance/governance', label: 'nav.attendanceGov', section: 'school', icon: 'academicAudit' },
    ],
  },
  {
    id: 'exams',
    label: 'grp.exams',
    icon: 'exams',
    items: [
      { href: '/exams', label: 'nav.exams', section: 'exams', icon: 'exams' },
      { href: '/evaluation', label: 'nav.evaluation', section: 'evaluation', icon: 'exams' },
      { href: '/evaluation/desk', label: 'nav.evaluationDesk', section: 'evaluationDesk', icon: 'exams' },
      { href: '/results', label: 'nav.results', section: 'results', icon: 'results' },
    ],
  },
  { id: 'obe', label: 'grp.obe', icon: 'obe', items: [{ href: '/obe', label: 'nav.obe', section: 'obe', icon: 'obe' }] },
  {
    id: 'lms',
    label: 'grp.lms',
    icon: 'lms',
    items: [
      { href: '/courses', label: 'nav.courses', section: 'courses', icon: 'lms' },
      { href: '/homework', label: 'nav.homework', section: 'school', icon: 'homework' },
      { href: '/topic-videos', label: 'nav.topicVideos', section: 'topicVideos', icon: 'topicVideos' },
      { href: '/boards', label: 'nav.boards', section: 'boards', icon: 'boards' },
      { href: '/devices', label: 'nav.devices', section: 'devices', icon: 'devices' },
      { href: '/trainings', label: 'nav.trainings', section: 'trainings', icon: 'devices' },
      { href: '/live', label: 'nav.live', section: 'live', icon: 'live' },
    ],
  },
  {
    id: 'finance',
    label: 'grp.finance',
    icon: 'finance',
    items: [
      { href: '/fees', label: 'nav.fees', section: 'fees', icon: 'finance' },
      { href: '/scholarships', label: 'nav.scholarships', section: 'finance', icon: 'finance' },
      { href: '/budgets', label: 'nav.budgets', section: 'finance', icon: 'finance' },
      { href: '/gl-export', label: 'nav.glExport', section: 'finance', icon: 'finance' },
    ],
  },
  {
    id: 'hr',
    label: 'grp.hr',
    icon: 'hr',
    items: [
      { href: '/hr', label: 'nav.hr', section: 'hr', icon: 'hr' },
      { href: '/hr/appraisal', label: 'nav.appraisal', section: 'appraisal', icon: 'hr' },
      { href: '/payroll', label: 'nav.payroll', section: 'payroll', icon: 'payroll' },
      { href: '/payroll/payslips', label: 'nav.payslips', section: 'payslips', icon: 'payslips' },
    ],
  },
  {
    id: 'success',
    label: 'grp.success',
    icon: 'placements',
    items: [
      { href: '/placements', label: 'nav.placements', section: 'placements', icon: 'placements' },
      { href: '/alumni', label: 'nav.alumni', section: 'alumni', icon: 'placements' },
      { href: '/research', label: 'nav.research', section: 'research', icon: 'research' },
      { href: '/grievances', label: 'nav.grievances', section: 'grievances', icon: 'grievances' },
    ],
  },
  { id: 'library', label: 'grp.library', icon: 'library', items: [{ href: '/library', label: 'nav.library', section: 'library', icon: 'library' }] },
  {
    id: 'campus',
    label: 'grp.campus',
    icon: 'campus',
    items: [
      { href: '/transport', label: 'nav.transport', section: 'transport', icon: 'transport' },
      { href: '/hostel', label: 'nav.hostel', section: 'hostel', icon: 'hostel' },
      { href: '/canteen', label: 'nav.canteen', section: 'canteen', icon: 'canteen' },
      { href: '/campus-life', label: 'nav.campusLife', section: 'campusLife', icon: 'campusLife' },
      { href: '/skills', label: 'nav.skills', section: 'skills', icon: 'skills' },
      { href: '/projects', label: 'nav.projects', section: 'projects', icon: 'research' },
      { href: '/careers', label: 'nav.careers', section: 'careers', icon: 'placements' },
    ],
  },
  {
    id: 'inventory',
    label: 'grp.inventory',
    icon: 'inventory',
    items: [
      { href: '/inventory', label: 'nav.inventory', section: 'inventory', icon: 'inventory' },
      { href: '/assets', label: 'nav.assets', section: 'assets', icon: 'assets' },
      { href: '/scan', label: 'nav.scan', section: 'assets', icon: 'assets' },
    ],
  },
  {
    id: 'communication',
    label: 'grp.communication',
    icon: 'communication',
    items: [
      { href: '/messages', label: 'nav.messages', section: 'school', icon: 'messages' },
      { href: '/conversations', label: 'nav.conversations', section: 'conversations', icon: 'conversations' },
      { href: '/communication', label: 'nav.comms', section: 'comms', icon: 'messages' },
    ],
  },
  {
    id: 'reports',
    label: 'grp.reports',
    icon: 'reports',
    items: [
      { href: '/reports', label: 'nav.reports', section: 'reports', icon: 'reports' },
      { href: '/department', label: 'nav.department', section: 'department', icon: 'department' },
      { href: '/ai', label: 'nav.ai', section: 'ai', icon: 'ai' },
    ],
  },
  {
    id: 'work',
    label: 'grp.work',
    icon: 'work',
    items: [
      { href: '/tasks', label: 'nav.tasks', section: 'tasks', icon: 'tasks' },
      { href: '/workflows', label: 'nav.workflows', section: 'workflows', icon: 'workflows' },
      { href: '/delegations', label: 'nav.delegations', section: 'delegations', icon: 'workflows' },
      { href: '/surveys', label: 'nav.surveys', section: 'surveys', icon: 'surveys' },
    ],
  },
  {
    id: 'settings',
    label: 'grp.settings',
    icon: 'settings',
    items: [
      { href: '/settings', label: 'nav.settings', section: 'settings', icon: 'settings' },
      { href: '/settings/institution', label: 'nav.institution', section: 'settings', icon: 'departments' },
      { href: '/institution-setup', label: 'nav.institutionSetup', section: 'institutionSetup', icon: 'settings' },
      { href: '/settings/buildings', label: 'nav.buildings', section: 'settings', icon: 'campus' },
      { href: '/audit', label: 'nav.audit', section: 'audit', icon: 'academicAudit' },
      { href: '/governance/rules', label: 'nav.govRules', section: 'governance', icon: 'workflows' },
      { href: '/governance/incidents', label: 'nav.govIncidents', section: 'governance', icon: 'grievances' },
      { href: '/governance/retention', label: 'nav.govRetention', section: 'governance', icon: 'documents' },
      { href: '/billing', label: 'nav.billing', section: 'billing', icon: 'payroll' },
      { href: '/ai/audit', label: 'nav.aiAudit', section: 'aiAudit', icon: 'ai' },
      { href: '/ai/evals', label: 'nav.aiEvals', section: 'aiAudit', icon: 'ai' },
      { href: '/integrity', label: 'nav.integrity', section: 'integrity', icon: 'homework' },
      { href: '/dpdp', label: 'nav.dpdp', section: 'dpdp', icon: 'grievances' },
      { href: '/connectors', label: 'nav.connectors', section: 'connectors', icon: 'import' },
      { href: '/import', label: 'nav.import', section: 'import', icon: 'import' },
      // The KINETIX platform team only (GET /v1/me platformAdmin), not an institution's role.
      { href: '/platform/concept-videos', label: 'nav.conceptVideos', section: 'platform', icon: 'platform' },
    ],
  },
];

/** The groups (and the pages in them) this person may open; empty groups are dropped. */
export function visibleGroups(roles: readonly RoleName[], platformAdmin = false, disabledModules: readonly string[] = [], workspace: Workspace = 'all'): NavGroup[] {
  // Modules the institution switched off (Settings > Institution profile) are hidden from the menu, and so are pages outside the chosen workspace.
  const on = (i: NavItem) => !disabledModules.includes(i.section) && (i.section === 'platform' || inWorkspace(i.section, workspace));
  return NAV_GROUPS.map((g) => ({ ...g, solo: g.items.length === 1, items: g.items.filter((i) => on(i) && (i.section === 'platform' ? platformAdmin : canSee(roles, i.section))) })).filter((g) => g.items.length > 0);
}

export function isActivePath(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

/** The most specific item whose path contains `pathname`, with its group. */
export function findNav(groups: readonly NavGroup[], pathname: string): { group: NavGroup; item: NavItem } | null {
  let best: { group: NavGroup; item: NavItem } | null = null;
  for (const group of groups) {
    for (const item of group.items) {
      if (isActivePath(pathname, item.href) && (!best || item.href.length > best.item.href.length)) best = { group, item };
    }
  }
  return best;
}

export interface Crumb {
  label: MessageKey;
  href?: string;
}

/**
 * Breadcrumbs for a path: Dashboard › Group › Page › Details. The group is left out when it has
 * only that one page, and the dashboard itself has none.
 */
export function crumbsFor(groups: readonly NavGroup[], pathname: string): Crumb[] {
  if (pathname === '/') return [];
  const hit = findNav(groups, pathname);
  if (!hit) return [];
  const out: Crumb[] = [{ label: 'nav.dashboard', href: '/' }];
  if (hit.group.items.length > 1 && hit.group.id !== 'dashboard') out.push({ label: hit.group.label });
  const deeper = pathname !== hit.item.href && pathname.replace(/\/$/, '') !== hit.item.href;
  out.push({ label: hit.item.label, href: deeper ? hit.item.href : undefined });
  if (deeper) out.push({ label: 'ui.crumb.details' });
  return out;
}
