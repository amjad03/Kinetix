import { ConflictException, NotFoundException } from '@nestjs/common';
import type { RoleName, UserPrincipal } from '../auth/principal.js';

/** Companies, drives, rounds, offers, internships and alumni records. */
export const PLACEMENT_ROLES: RoleName[] = ['tenant_admin', 'principal', 'placement_officer'];
/** Read-only view of drives, registrations, statistics and the alumni directory. */
export const PLACEMENT_VIEW_ROLES: RoleName[] = [...PLACEMENT_ROLES, 'hod'];
/** Faculty who mentor internships. */
export const MENTOR_ROLES: RoleName[] = [...PLACEMENT_VIEW_ROLES, 'teacher'];

export const hasRole = (p: UserPrincipal, roles: RoleName[]) => p.roles.some((r) => roles.includes(r));

export const STALE = 'This record changed since you opened it. Reload and try again.';
export function checkVersion(actual: number, expected: number | undefined) {
  if (expected !== undefined && expected !== actual) throw new ConflictException(STALE);
}

export function found<T>(row: T | undefined, what: string): T {
  if (!row) throw new NotFoundException(`${what} not found`);
  return row;
}
