import { eq } from 'drizzle-orm';
import { audit } from '../common/audit.js';
import type { Tx } from '../db/db.service.js';
import { userRoles, users } from '../db/schema.js';
import type { RoleName } from './principal.js';
import type { TokensService } from './tokens.service.js';

export async function userRoleNames(tx: Tx, userId: string): Promise<RoleName[]> {
  const roles = await tx.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId));
  return [...new Set(roles.map((r) => r.role as RoleName))];
}

/**
 * The body of a successful sign-in (password or phone code); the same for both, and audited.
 * `mustChangePassword` is true after a password sign-in with a temporary password: the token then
 * carries `pwc` and only lets the user change it (AuthGuard). A phone code never needs it.
 */
export async function signInResponse(tx: Tx, tokens: TokensService, tenantId: string, user: typeof users.$inferSelect, method: 'password' | 'otp') {
  const roleNames = await userRoleNames(tx, user.id);
  const mustChangePassword = method === 'password' && user.passwordMustChange;
  await audit(tx, { tenantId, actorType: 'user', actorId: user.id, action: 'auth.sign_in', subjectType: 'user', subjectId: user.id, data: { method } });
  return {
    accessToken: tokens.signUser({ sub: user.id, tid: tenantId, roles: roleNames, ...(mustChangePassword ? { pwc: true as const } : {}) }),
    mustChangePassword,
    user: { id: user.id, fullName: user.fullName, preferredLanguage: user.preferredLanguage, roles: roleNames },
  };
}
