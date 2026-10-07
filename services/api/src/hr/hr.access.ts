import { ConflictException } from '@nestjs/common';
import type { RoleName, UserPrincipal } from '../auth/principal.js';

/** HR records, attendance, leave administration, recruitment. */
export const HR_ROLES: RoleName[] = ['tenant_admin', 'principal', 'hr_manager'];
/** Payroll drafts, structures and exports. */
export const PAYROLL_ROLES: RoleName[] = ['tenant_admin', 'principal', 'hr_manager', 'accountant'];
/** Approving and locking a payroll run. */
export const PAYROLL_APPROVERS: RoleName[] = ['tenant_admin', 'principal'];
/** Anyone on the staff (not students or guardians). */
export const STAFF_ROLES: RoleName[] = ['tenant_admin', 'principal', 'hod', 'teacher', 'librarian', 'accountant', 'hr_manager'];

export const hasAnyRole = (p: UserPrincipal, roles: RoleName[]) => p.roles.some((r) => roles.includes(r));
export const isHr = (p: UserPrincipal) => hasAnyRole(p, HR_ROLES);
export const isPayrollStaff = (p: UserPrincipal) => hasAnyRole(p, PAYROLL_ROLES);

/** The message (code STALE_VERSION) when a record changed since the caller loaded it. */
export const STALE_VERSION = 'This record changed since you opened it. Reload and try again.';

export function requireVersion(actual: number, expected: number | undefined) {
  if (expected !== undefined && expected !== actual) {
    throw new ConflictException(STALE_VERSION);
  }
}
