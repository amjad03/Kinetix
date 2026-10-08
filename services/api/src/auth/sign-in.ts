import { eq } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { userRoles, users } from '../db/schema.js';
import type { MfaService, SignInContext } from './mfa.service.js';
import type { RoleName } from './principal.js';

export async function userRoleNames(tx: Tx, userId: string): Promise<RoleName[]> {
  const roles = await tx.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId));
  return [...new Set(roles.map((r) => r.role as RoleName))];
}

/**
 * The body of a successful first-factor sign-in (password or phone code); the same for both, and
 * audited. It starts a session (user_sessions) and signs a token pointing at it, or, for a user with
 * two-factor on, asks for the code first (see MfaService.signIn). `mustChangePassword` is true after
 * a password sign-in with a temporary password: the token then carries `pwc` and only lets the user
 * change it (AuthGuard). A phone code never needs it.
 */
export function signInResponse(tx: Tx, mfa: MfaService, tenantId: string, user: typeof users.$inferSelect, method: 'password' | 'otp', ctx: SignInContext = {}) {
  return mfa.signIn(tx, tenantId, user, method, ctx);
}
