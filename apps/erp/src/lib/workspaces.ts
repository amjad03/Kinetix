// Workspaces: the same ERP seen as separate consoles (academic office, finance and operations, quality, content and knowledge, AI).
// A workspace only chooses which pages the menu lists; the API still decides what a role may open.

import type { Section } from './access';

export const WORKSPACES = ['all', 'academic', 'finance_ops', 'quality', 'content', 'ai'] as const;
export type Workspace = (typeof WORKSPACES)[number];
export const WORKSPACE_COOKIE = 'kx_ws';

export const isWorkspace = (v: unknown): v is Workspace => typeof v === 'string' && (WORKSPACES as readonly string[]).includes(v);

const COMMON: Section[] = ['dashboard', 'settings', 'institutionSetup', 'tasks', 'workflows', 'delegations', 'audit'];

/** The sections each console lists (the dashboard, settings and work queues are in all of them). */
export const WORKSPACE_SECTIONS: Record<Exclude<Workspace, 'all'>, readonly Section[]> = {
  academic: [
    ...COMMON,
    'admissions', 'admissionsTools', 'students', 'mentoring', 'diary', 'ptm', 'earlyYears', 'health', 'documents',
    'school', 'syllabus', 'curriculum', 'schoolMode', 'university', 'departments', 'courseRegistration', 'timetable', 'calendar', 'scheduling',
    'exams', 'evaluation', 'evaluationDesk', 'results', 'courses', 'learningSupport', 'assessmentTools', 'conversations', 'placements', 'alumni', 'research', 'grievances', 'campusLife', 'skills', 'integrity',
  ],
  finance_ops: [
    ...COMMON,
    'fees', 'finance', 'payroll', 'payslips', 'hr', 'appraisal', 'transport', 'hostel', 'canteen', 'library', 'inventory', 'assets', 'import', 'connectors', 'dpdp', 'reports', 'billing', 'governance',
  ],
  quality: [
    ...COMMON,
    'obe', 'academicAudit', 'courseFiles', 'surveys', 'reports', 'department', 'curriculum', 'university', 'grievances', 'dpdp', 'connectors', 'governance', 'aiAudit',
  ],
  content: [
    ...COMMON,
    'syllabus', 'topicVideos', 'courses', 'questionBank', 'curriculum', 'learningSupport', 'assessmentTools', 'skills', 'library', 'boards', 'devices', 'trainings', 'live',
  ],
  ai: [...COMMON, 'ai', 'aiAudit', 'reports', 'department', 'topicVideos'],
};

/** Whether a page appears in the chosen workspace. */
export function inWorkspace(section: string, workspace: Workspace): boolean {
  return workspace === 'all' || (WORKSPACE_SECTIONS[workspace] as readonly string[]).includes(section);
}
