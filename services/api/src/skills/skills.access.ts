import type { RoleName } from '../auth/principal.js';

/** The skill framework, SDG tags and the passport desk: the office and the head of department. */
export const SKILL_ADMIN: RoleName[] = ['tenant_admin', 'principal', 'hod'];
/** Staff who read passports and record manual evidence (teachers and placement officers included). */
export const SKILL_STAFF: RoleName[] = [...SKILL_ADMIN, 'teacher', 'placement_officer'];
/** Students and their parents, the Student App side. */
export const FAMILY: RoleName[] = ['student', 'guardian'];
