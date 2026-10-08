import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { audit } from '../common/audit.js';
import { RateLimiter } from '../common/rate-limiter.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { users } from '../db/schema.js';
import { tenantSecurityPolicies, userSessions } from '../db/schema-foundation.js';
import { AllowDuringMfaSetup, AllowDuringPasswordChange, Auth, CurrentPrincipal, STAFF_ADMIN_ROLES } from './auth.decorators.js';
import { MFA_POLICY_ROLES, MfaService } from './mfa.service.js';
import type { RoleName, UserPrincipal } from './principal.js';

const CodeBody = z.object({ code: z.string().trim().min(6).max(20) });
const PolicyBody = z.object({ mfaRequiredRoles: z.array(z.enum(MFA_POLICY_ROLES as [RoleName, ...RoleName[]])).max(MFA_POLICY_ROLES.length) });

/** Two-factor set-up and the signed-in devices of the caller (docs/architecture/mfa-sessions.md). */
@Controller('v1/me')
export class MfaController {
  constructor(
    private readonly db: DbService,
    private readonly mfa: MfaService,
    private readonly limiter: RateLimiter,
    private readonly clock: Clock,
  ) {}

  @Get('mfa')
  @Auth('user')
  @AllowDuringMfaSetup()
  status(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.mfa.status(tx, p.tenantId, p.userId, p.roles));
  }

  /** Step 1: a new secret and the otpauth:// link for the QR code. */
  @Post('mfa/enrol')
  @HttpCode(200)
  @Auth('user')
  @AllowDuringMfaSetup()
  enrol(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.mfa.beginEnrol(tx, p.tenantId, p.userId));
  }

  /** Step 2: the first code turns it on. Returns the backup codes (shown once) and a token without the set-up restriction. */
  @Post('mfa/confirm')
  @HttpCode(200)
  @Auth('user')
  @AllowDuringMfaSetup()
  async confirm(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(CodeBody)) body: z.infer<typeof CodeBody>) {
    await this.limiter.hit(`mfa-confirm:${p.tenantId}:${p.userId}`, 10, 5 * 60_000);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const backupCodes = await this.mfa.confirmEnrol(tx, p.tenantId, p.userId, body.code, this.clock.now());
      if (p.sessionId) await tx.update(userSessions).set({ mfaVerified: true }).where(eq(userSessions.id, p.sessionId));
      return { backupCodes, accessToken: this.mfa.tokens.signUser({ sub: p.userId, tid: p.tenantId, roles: p.roles, ...(p.sessionId ? { sid: p.sessionId } : {}), ...(p.mustChangePassword ? { pwc: true as const } : {}) }) };
    });
  }

  @Post('mfa/backup-codes')
  @HttpCode(200)
  @Auth('user')
  async regenerate(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(CodeBody)) body: z.infer<typeof CodeBody>) {
    await this.limiter.hit(`mfa-confirm:${p.tenantId}:${p.userId}`, 10, 5 * 60_000);
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (!(await this.mfa.check(tx, p.tenantId, p.userId, body.code, this.clock.now()))) throw new ForbiddenException({ message: 'That code is wrong or expired', code: 'MFA_CODE_INVALID' });
      return { backupCodes: await this.mfa.regenerateBackupCodes(tx, p.tenantId, p.userId) };
    });
  }

  /** Turns it off (with a current code). Refused while the institution requires it for the caller's role. */
  @Delete('mfa')
  @HttpCode(204)
  @Auth('user')
  async disable(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(CodeBody)) body: z.infer<typeof CodeBody>) {
    await this.limiter.hit(`mfa-confirm:${p.tenantId}:${p.userId}`, 10, 5 * 60_000);
    await this.db.withTenant(p.tenantId, async (tx) => {
      if (await this.mfa.isRequired(tx, p.tenantId, p.roles)) throw new ForbiddenException({ message: 'Your institution requires two-factor authentication for your role', code: 'MFA_REQUIRED_BY_POLICY' });
      if (!(await this.mfa.check(tx, p.tenantId, p.userId, body.code, this.clock.now()))) throw new ForbiddenException({ message: 'That code is wrong or expired', code: 'MFA_CODE_INVALID' });
      await this.mfa.disable(tx, p.tenantId, p.userId, p.userId);
    });
  }

  // ----- sessions and devices ------------------------------------------------------------------------

  @Get('sessions')
  @Auth('user')
  @AllowDuringPasswordChange()
  @AllowDuringMfaSetup()
  sessions(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select().from(userSessions).where(and(eq(userSessions.userId, p.userId), isNull(userSessions.revokedAt))).orderBy(desc(userSessions.lastSeenAt));
      return rows.map((s) => ({ id: s.id, label: s.label, ip: s.ip, mfaVerified: s.mfaVerified, createdAt: s.createdAt.toISOString(), lastSeenAt: s.lastSeenAt.toISOString(), current: s.id === p.sessionId }));
    });
  }

  /** Signs one device out; its token stops working on the next request. */
  @Delete('sessions/:id')
  @HttpCode(204)
  @Auth('user')
  revoke(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.update(userSessions).set({ revokedAt: new Date() }).where(and(eq(userSessions.id, id), eq(userSessions.userId, p.userId), isNull(userSessions.revokedAt))).returning({ id: userSessions.id });
      if (!rows.length) throw new NotFoundException('Session not found');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'auth.session_revoked', subjectType: 'user_session', subjectId: id });
    });
  }

  /** "Sign out everywhere else". */
  @Post('sessions/revoke-others')
  @HttpCode(200)
  @Auth('user')
  revokeOthers(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const revoked = await this.mfa.revokeSessions(tx, p.userId, p.sessionId);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'auth.sessions_revoked_others', subjectType: 'user', subjectId: p.userId, data: { revoked } });
      return { revoked };
    });
  }
}

/** The institution's security policy: which roles must use two-factor, and resetting a colleague's. */
@Controller('v1/admin')
export class SecurityPolicyController {
  constructor(
    private readonly db: DbService,
    private readonly mfa: MfaService,
  ) {}

  @Get('security-policy')
  @Auth('user', STAFF_ADMIN_ROLES)
  async get(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => ({ mfaRequiredRoles: await this.mfa.requiredRoles(tx, p.tenantId), assignableRoles: MFA_POLICY_ROLES }));
  }

  @Put('security-policy')
  @Auth('user', STAFF_ADMIN_ROLES)
  set(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(PolicyBody)) body: z.infer<typeof PolicyBody>) {
    const roles = [...new Set(body.mfaRequiredRoles)];
    return this.db.withTenant(p.tenantId, async (tx) => {
      const before = await this.mfa.requiredRoles(tx, p.tenantId);
      await tx
        .insert(tenantSecurityPolicies)
        .values({ tenantId: p.tenantId, mfaRequiredRoles: roles, updatedBy: p.userId })
        .onConflictDoUpdate({ target: tenantSecurityPolicies.tenantId, set: { mfaRequiredRoles: roles, updatedBy: p.userId, updatedAt: new Date() } });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'security.policy_updated', subjectType: 'tenant', subjectId: p.tenantId, data: { before, after: roles } });
      return { mfaRequiredRoles: roles };
    });
  }

  /** A colleague lost their phone: removes their authenticator and signs them out everywhere. */
  @Post('users/:id/mfa/reset')
  @HttpCode(204)
  @Auth('user', STAFF_ADMIN_ROLES)
  reset(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [u] = await tx.select({ id: users.id }).from(users).where(eq(users.id, id));
      if (!u) throw new NotFoundException('User not found');
      await this.mfa.disable(tx, p.tenantId, id, p.userId);
    });
  }
}
