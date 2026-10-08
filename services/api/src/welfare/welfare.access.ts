import type { RoleName } from '../auth/principal.js';

/** General grievances: assign, comment, resolve. They never see committee matters. */
export const GRIEVANCE_STAFF: RoleName[] = ['tenant_admin', 'principal', 'grievance_officer'];
/**
 * The anti-ragging, ICC and POSH committees. Deliberately narrow: the principal chairs, and
 * committee members are named by role. The administrator and the grievance officer are NOT here.
 */
export const COMMITTEE_ROLES: RoleName[] = ['principal', 'icc_member'];
/** Who can report a student incident. */
export const INCIDENT_REPORTERS: RoleName[] = ['tenant_admin', 'principal', 'hod', 'teacher', 'hostel_warden'];
/** Who reads the discipline register. */
export const DISCIPLINE_VIEW: RoleName[] = ['tenant_admin', 'principal', 'hod'];
/** Who decides discipline actions and appeals. */
export const DISCIPLINE_DECIDERS: RoleName[] = ['tenant_admin', 'principal'];
/** Counselling: sessions and notes. The principal sees schedules but never notes. */
export const COUNSELLING_STAFF: RoleName[] = ['counsellor'];
export const COUNSELLING_OVERSIGHT: RoleName[] = ['counsellor', 'principal', 'tenant_admin'];
/** Scholarships, fee waivers and aid. */
export const WELFARE_ROLES: RoleName[] = ['tenant_admin', 'principal', 'grievance_officer'];
