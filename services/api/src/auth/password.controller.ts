import { BadRequestException, Body, Controller, ForbiddenException, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { audit } from '../common/audit.js';
import { RateLimiter } from '../common/rate-limiter.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { users } from '../db/schema.js';
import { AllowDuringPasswordChange, Auth, CurrentPrincipal, STAFF_ADMIN_ROLES } from './auth.decorators.js';
import { passwordProblem, temporaryPassword } from './password-policy.js';
import type { UserPrincipal } from './principal.js';
import { userRoleNames } from './sign-in.js';
import { TokensService } from './tokens.service.js';

const ChangeBody = z.object({
  /** Required when the account has a password; omitted to set a first one on a phone-code-only account. */
  currentPassword: z.string().min(1).max(200).optional(),
  newPassword: z.string().min(1).max(200),
});

export interface PasswordChangedResponse {
  /** A new token without the temporary-password restriction: replace the old one with it. */
  accessToken: string;
  mustChangePassword: false;
}

/** Changing one's own password (also the forced change after a temporary password). */
@Controller('v1/me')
export class MePasswordController {
  constructor(
    private readonly db: DbService,
    private readonly tokens: TokensService,
    private readonly limiter: RateLimiter,
  ) {}

  @Post('password')
  @HttpCode(200)
  @Auth('user')
  @AllowDuringPasswordChange()
  async change(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ChangeBody)) body: z.infer<typeof ChangeBody>): Promise<PasswordChangedResponse> {
    // The same limit as sign-in: guessing the current password here is no easier than at login.
    await this.limiter.hit(`password:${p.tenantId}:${p.userId}`, 10, 60_000);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, p.userId));
      if (!user) throw new NotFoundException('User not found');
      if (user.passwordHash) {
        if (body.currentPassword === undefined) throw new BadRequestException('Enter your current password');
        if (!(await argon2.verify(user.passwordHash, body.currentPassword))) throw new ForbiddenException('Your current password is wrong');
      }
      const problem = passwordProblem(body.newPassword, { email: user.email, current: user.passwordHash ? body.currentPassword : undefined });
      if (problem) throw new BadRequestException(problem);
      await tx
        .update(users)
        .set({ passwordHash: await argon2.hash(body.newPassword), passwordMustChange: false, updatedAt: new Date() })
        .where(eq(users.id, user.id));
      await audit(tx, {
        tenantId: p.tenantId,
        actorType: 'user',
        actorId: p.userId,
        action: 'auth.password_changed',
        subjectType: 'user',
        subjectId: user.id,
        data: { wasTemporary: user.passwordMustChange, firstPassword: !user.passwordHash },
      });
      const roles = await userRoleNames(tx, user.id);
      return { accessToken: this.tokens.signUser({ sub: user.id, tid: p.tenantId, roles }), mustChangePassword: false };
    });
  }
}

export interface PasswordResetResponse {
  userId: string;
  /** Shown once: give it to the person, who must change it when they next sign in. */
  temporaryPassword: string;
  mustChangePassword: true;
}

/** The principal or administrator gives a member of the institution a new temporary password. */
@Controller('v1/admin/users')
export class PasswordResetController {
  constructor(private readonly db: DbService) {}

  @Post(':id/reset-password')
  @HttpCode(200)
  @Auth('user', STAFF_ADMIN_ROLES)
  async reset(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string): Promise<PasswordResetResponse> {
    if (id === p.userId) throw new BadRequestException('You cannot reset your own password here. Use Change password.');
    const password = temporaryPassword();
    const hash = await argon2.hash(password);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.id, id));
      if (!user) throw new NotFoundException('User not found');
      // A principal may not take over the administrator's account.
      const targetRoles = await userRoleNames(tx, id);
      if (targetRoles.includes('tenant_admin') && !p.roles.includes('tenant_admin')) {
        throw new ForbiddenException("Only the institution's administrator can reset an administrator's password");
      }
      await tx.update(users).set({ passwordHash: hash, passwordMustChange: true, updatedAt: new Date() }).where(eq(users.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'auth.password_reset', subjectType: 'user', subjectId: id });
      return { userId: id, temporaryPassword: password, mustChangePassword: true };
    });
  }
}
