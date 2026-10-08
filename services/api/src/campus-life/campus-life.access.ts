import type { RoleName } from '../auth/principal.js';

/** Clubs and events: the office and the teachers who coordinate them (the Teacher App uses the same API). */
export const LIFE_STAFF: RoleName[] = ['tenant_admin', 'principal', 'hod', 'teacher'];
/** Committees, their meetings and minutes. Only the office writes. */
export const COMMITTEE_STAFF: RoleName[] = ['tenant_admin', 'principal', 'hod'];
/** Students and their parents, the Student App side. */
export const FAMILY: RoleName[] = ['student', 'guardian'];
