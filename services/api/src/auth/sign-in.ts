import { eq } from 'drizzle-orm';
import { audit } from '../common/audit.js';
import type { Tx } from '../db/db.service.js';
import { userRoles, users } from '../db/schema.js';
import type { RoleName } from './principal.js';
import type { TokensService } from './tokens.service.js';

/** The body of a successful sign-in (password or phone code); the same for both, and audited. */
export async function signInResponse(tx: Tx, tokens: TokensService, tenantId: string, user: typeof users.$inferSelect, method: 'password' | 'otp') {
  const roles = await tx.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, user.id));
  const roleNames = [...new Set(roles.map((r) => r.role as RoleName))];
  await audit(tx, { tenantId, actorType: 'user', actorId: user.id, action: 'auth.sign_in', subjectType: 'user', subjectId: user.id, data: { method } });
  return {
    accessToken: tokens.signUser({ sub: user.id, tid: tenantId, roles: roleNames }),
    user: { id: user.id, fullName: user.fullName, preferredLanguage: user.preferredLanguage, roles: roleNames },
  };
}
