import type { RoleName } from '../auth/principal.js';

/** Approve proposals, register projects, grants and scholars. */
export const RESEARCH_ROLES: RoleName[] = ['tenant_admin', 'principal', 'research_coordinator'];
export const RESEARCH_VIEW_ROLES: RoleName[] = [...RESEARCH_ROLES, 'hod'];
/** Faculty who submit proposals and record their own publications. */
export const FACULTY_ROLES: RoleName[] = [...RESEARCH_VIEW_ROLES, 'teacher'];

/** Read the research reports (NAAC criterion 3, NIRF, NBA, AISHE, faculty profiles): the IQAC as well. */
export const RESEARCH_REPORT_ROLES: RoleName[] = [...RESEARCH_VIEW_ROLES, 'quality_officer'];
