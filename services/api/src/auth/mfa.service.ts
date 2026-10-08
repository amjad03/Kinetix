import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { audit } from '../common/audit.js';
import { SecretBox } from '../common/secret-box.js';
import { ENV, type Env } from '../config/env.js';
import type { Tx } from '../db/db.service.js';
import { userRoles, users } from '../db/schema.js';
import { tenantSecurityPolicies, userMfa, userSessions } from '../db/schema-foundation.js';
import type { RoleName } from './principal.js';
import { TokensService } from './tokens.service.js';
import { hashBackupCode, newBackupCode, newTotpSecret, otpauthUri, verifyTotp } from './totp.js';

export interface SignInContext {
  ip?: string;
  userAgent?: string;
  /** From the `x-device-name` header the apps send ("Teacher App on Pixel 7"). */
  deviceName?: string;
}

export const BACKUP_CODE_COUNT = 10;
/** Roles an institution may require a second factor for (the ones that can move money or change anyone's access). */
export const MFA_POLICY_ROLES: RoleName[] = ['tenant_admin', 'principal', 'accountant', 'hr_manager', 'admissions_officer', 'store_keeper'];

/** A short label for the sessions list, from the app's own name or the browser's user agent. */
export function deviceLabel(ctx: SignInContext): string {
  if (ctx.deviceName?.trim()) return ctx.deviceName.trim().slice(0, 80);
  const ua = ctx.userAgent ?? '';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /^Dart|Flutter/i.test(ua) ? 'Flutter app' : ua ? 'Browser' : 'Unknown device';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iOS/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}

/**
 * Staff two-factor sign-in (TOTP + backup codes), the institution's MFA policy, and the
 * user_sessions behind every token (docs/architecture/mfa-sessions.md).
 */
@Injectable()
export class MfaService {
  private readonly box: SecretBox;

  constructor(
    @Inject(ENV) env: Env,
    readonly tokens: TokensService,
  ) {
    // Without a configured secrets key (development) the box is keyed from the JWT secret.
    this.box = SecretBox.fromEnv(env) ?? new SecretBox({ 1: createHash('sha256').update(`kinetix-mfa:${env.JWT_SECRET}`).digest() }, 1);
  }

  private aad = (tenantId: string, userId: string) => `${tenantId}:mfa.${userId}`;

  async requiredRoles(tx: Tx, tenantId: string): Promise<string[]> {
    const [p] = await tx.select().from(tenantSecurityPolicies).where(eq(tenantSecurityPolicies.tenantId, tenantId));
    return p?.mfaRequiredRoles ?? [];
  }

  async isRequired(tx: Tx, tenantId: string, roles: RoleName[]): Promise<boolean> {
    const req = await this.requiredRoles(tx, tenantId);
    return roles.some((r) => req.includes(r));
  }

  async enrolled(tx: Tx, userId: string): Promise<boolean> {
    const [m] = await tx.select({ at: userMfa.confirmedAt }).from(userMfa).where(eq(userMfa.userId, userId));
    return !!m?.at;
  }

  async status(tx: Tx, tenantId: string, userId: string, roles: RoleName[]) {
    const [m] = await tx.select().from(userMfa).where(eq(userMfa.userId, userId));
    return { enrolled: !!m?.confirmedAt, backupCodesLeft: m?.confirmedAt ? m.backupCodes.length : 0, required: await this.isRequired(tx, tenantId, roles) };
  }

  /** Starts (or restarts, until confirmed) enrolment: a fresh secret to put in the authenticator app. */
  async beginEnrol(tx: Tx, tenantId: string, userId: string) {
    const [u] = await tx.select().from(users).where(eq(users.id, userId));
    if (!u) throw new NotFoundException('User not found');
    if (await this.enrolled(tx, userId)) throw new ConflictException('Two-factor authentication is already on');
    const secret = newTotpSecret();
    await tx
      .insert(userMfa)
      .values({ userId, tenantId, secretEnc: this.box.encrypt(secret, this.aad(tenantId, userId)) })
      .onConflictDoUpdate({ target: userMfa.userId, set: { secretEnc: this.box.encrypt(secret, this.aad(tenantId, userId)), confirmedAt: null, backupCodes: [], lastStep: 0 } });
    return { secret, otpauthUri: otpauthUri(secret, u.email ?? u.phone ?? u.fullName, 'KINETIX') };
  }

  private newBackupCodes(): { plain: string[]; hashes: string[] } {
    const plain = Array.from({ length: BACKUP_CODE_COUNT }, newBackupCode);
    return { plain, hashes: plain.map(hashBackupCode) };
  }

  /** Verifies the first code, turns two-factor on and returns the backup codes (shown once). */
  async confirmEnrol(tx: Tx, tenantId: string, userId: string, code: string, now: Date): Promise<string[]> {
    const [m] = await tx.select().from(userMfa).where(eq(userMfa.userId, userId)).for('update');
    if (!m || m.confirmedAt) throw new ConflictException(m ? 'Two-factor authentication is already on' : 'Start by scanning the QR code');
    const step = verifyTotp(this.box.decrypt(m.secretEnc, this.aad(tenantId, userId)), code, now, m.lastStep);
    if (step === null) throw new ForbiddenException({ message: 'That code is wrong or expired', code: 'MFA_CODE_INVALID' });
    const { plain, hashes } = this.newBackupCodes();
    await tx.update(userMfa).set({ confirmedAt: now, lastStep: step, backupCodes: hashes }).where(eq(userMfa.userId, userId));
    await audit(tx, { tenantId, actorType: 'user', actorId: userId, action: 'mfa.enrolled', subjectType: 'user', subjectId: userId });
    return plain;
  }

  /** A TOTP code or an unused backup code. A backup code is consumed; a TOTP step cannot be replayed. */
  async check(tx: Tx, tenantId: string, userId: string, code: string, now: Date): Promise<'totp' | 'backup' | null> {
    const [m] = await tx.select().from(userMfa).where(eq(userMfa.userId, userId)).for('update');
    if (!m?.confirmedAt) return null;
    const clean = code.trim();
    if (/^\d{6}$/.test(clean)) {
      const step = verifyTotp(this.box.decrypt(m.secretEnc, this.aad(tenantId, userId)), clean, now, m.lastStep);
      if (step === null) return null;
      await tx.update(userMfa).set({ lastStep: step }).where(eq(userMfa.userId, userId));
      return 'totp';
    }
    const h = hashBackupCode(clean);
    if (!m.backupCodes.includes(h)) return null;
    await tx.update(userMfa).set({ backupCodes: m.backupCodes.filter((x) => x !== h) }).where(eq(userMfa.userId, userId));
    await audit(tx, { tenantId, actorType: 'user', actorId: userId, action: 'mfa.backup_code_used', subjectType: 'user', subjectId: userId, data: { left: m.backupCodes.length - 1 } });
    return 'backup';
  }

  async regenerateBackupCodes(tx: Tx, tenantId: string, userId: string): Promise<string[]> {
    const { plain, hashes } = this.newBackupCodes();
    await tx.update(userMfa).set({ backupCodes: hashes }).where(eq(userMfa.userId, userId));
    await audit(tx, { tenantId, actorType: 'user', actorId: userId, action: 'mfa.backup_codes_regenerated', subjectType: 'user', subjectId: userId });
    return plain;
  }

  async disable(tx: Tx, tenantId: string, userId: string, actorId: string): Promise<void> {
    await tx.delete(userMfa).where(eq(userMfa.userId, userId));
    await this.revokeSessions(tx, userId);
    await audit(tx, { tenantId, actorType: 'user', actorId, action: actorId === userId ? 'mfa.disabled' : 'mfa.reset', subjectType: 'user', subjectId: userId });
  }

  async revokeSessions(tx: Tx, userId: string, exceptId?: string): Promise<number> {
    const rows = await tx
      .update(userSessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(userSessions.userId, userId), isNull(userSessions.revokedAt), exceptId ? ne(userSessions.id, exceptId) : undefined))
      .returning({ id: userSessions.id });
    return rows.length;
  }

  async roleNames(tx: Tx, userId: string): Promise<RoleName[]> {
    const rows = await tx.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId));
    return [...new Set(rows.map((r) => r.role as RoleName))];
  }

  /**
   * The body of a successful first-factor sign-in (password or phone code), audited.
   * - A user with two-factor on gets `{ mfaRequired, mfaToken }` and no session until `completeMfa`.
   * - A user whose role the institution requires it for, and who has none, gets a token that only
   *   lets them set it up (`mustSetUpMfa`).
   * - `mustChangePassword` is true after a password sign-in with a temporary password.
   */
  async signIn(tx: Tx, tenantId: string, user: typeof users.$inferSelect, method: 'password' | 'otp', ctx: SignInContext = {}) {
    const roles = await this.roleNames(tx, user.id);
    if (await this.enrolled(tx, user.id)) {
      await audit(tx, { tenantId, actorType: 'user', actorId: user.id, action: 'auth.mfa_challenge', subjectType: 'user', subjectId: user.id, data: { method } });
      return { mfaRequired: true as const, mfaToken: this.tokens.signMfaChallenge({ sub: user.id, tid: tenantId, method }) };
    }
    const mustSetUpMfa = await this.isRequired(tx, tenantId, roles);
    return this.issue(tx, tenantId, user, roles, method, ctx, false, mustSetUpMfa);
  }

  /** Second step: a correct code (or backup code) for the challenge from `signIn`. */
  async completeMfa(tx: Tx, challenge: { sub: string; tid: string; method: 'password' | 'otp' }, code: string, ctx: SignInContext, now: Date) {
    const [user] = await tx.select().from(users).where(eq(users.id, challenge.sub));
    if (!user || user.status !== 'active') throw new UnauthorizedException('Invalid or expired token');
    const used = await this.check(tx, challenge.tid, user.id, code, now);
    if (!used) {
      await audit(tx, { tenantId: challenge.tid, actorType: 'user', actorId: user.id, action: 'auth.mfa_failed', subjectType: 'user', subjectId: user.id });
      return null;
    }
    const roles = await this.roleNames(tx, user.id);
    return this.issue(tx, challenge.tid, user, roles, challenge.method, ctx, true, false);
  }

  /** Creates the session row and signs the token that points at it. */
  async issue(tx: Tx, tenantId: string, user: typeof users.$inferSelect, roles: RoleName[], method: 'password' | 'otp', ctx: SignInContext, mfaVerified: boolean, mustSetUpMfa: boolean) {
    const [session] = await tx
      .insert(userSessions)
      .values({ tenantId, userId: user.id, label: deviceLabel(ctx), ip: ctx.ip ?? null, userAgent: ctx.userAgent?.slice(0, 300) ?? null, mfaVerified })
      .returning({ id: userSessions.id });
    const mustChangePassword = method === 'password' && user.passwordMustChange;
    await audit(tx, { tenantId, actorType: 'user', actorId: user.id, action: 'auth.sign_in', subjectType: 'user', subjectId: user.id, data: { method, mfa: mfaVerified, sessionId: session.id } });
    return {
      accessToken: this.tokens.signUser({ sub: user.id, tid: tenantId, roles, sid: session.id, ...(mustChangePassword ? { pwc: true as const } : {}), ...(mustSetUpMfa ? { mfe: true as const } : {}) }),
      mustChangePassword,
      mustSetUpMfa,
      user: { id: user.id, fullName: user.fullName, preferredLanguage: user.preferredLanguage, roles },
    };
  }
}
