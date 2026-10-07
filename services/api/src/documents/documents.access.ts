import type { RoleName, UserPrincipal } from '../auth/principal.js';

/** Issue certificates, print ID cards, handle fee receipts: the institution's office. */
export const OFFICE_ROLES: RoleName[] = ['tenant_admin', 'principal', 'accountant', 'hr_manager'];
/** Approve a student certificate (and edit templates, revoke, bulk issue). */
export const CERT_APPROVERS: RoleName[] = ['tenant_admin', 'principal'];
/** Approve a staff certificate too. */
export const STAFF_CERT_APPROVERS: RoleName[] = ['tenant_admin', 'principal', 'hr_manager'];
/** Student vault managers; staff vault managers add the HR manager. */
export const STUDENT_VAULT_MANAGERS: RoleName[] = ['tenant_admin', 'principal'];
export const STAFF_VAULT_MANAGERS: RoleName[] = ['tenant_admin', 'principal', 'hr_manager'];

export const hasRole = (p: UserPrincipal, roles: RoleName[]) => p.roles.some((r) => roles.includes(r));

export const VAULT_TYPES: Record<string, Buffer> = {
  'application/pdf': Buffer.from('%PDF'),
  'image/jpeg': Buffer.from([0xff, 0xd8, 0xff]),
  'image/png': Buffer.from([0x89, 0x50, 0x4e, 0x47]),
};
export const MAX_VAULT_BYTES = 10 * 1024 * 1024;
