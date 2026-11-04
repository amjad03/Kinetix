import { noteSignInDevice } from '../trust/trust.controller.js';
import { Body, ConflictException, Controller, Headers, HttpCode, Inject, Ip, Post, UnauthorizedException } from '@nestjs/common';
import argon2 from 'argon2';
import { eq, or } from 'drizzle-orm';
import { z } from 'zod';
import { audit } from '../common/audit.js';
import { RateLimiter } from '../common/rate-limiter.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { users } from '../db/schema.js';
import { SystemLookups } from '../db/system-lookups.service.js';
import { randomUUID } from 'node:crypto';
import { OtpService } from './otp.service.js';
import { hashPassword, passwordNeedsRehash } from './password-policy.js';
import { normalizePhone } from './phone.js';
import { signInResponse } from './sign-in.js';
import { MfaService } from './mfa.service.js';
import { Clock } from '../common/time.js';
import { ENV, type Env } from '../config/env.js';

export { normalizePhone };

const LoginBody = z.object({
  tenant: z.string().min(1),
  /** Email address or phone number (E.164). */
  login: z.string().min(3),
  password: z.string().min(1),
});

const OtpRequestBody = z.object({
  /** The institution's slug. */
  tenant: z.string().min(1).max(100),
  phone: z.string().min(6).max(30),
});

let dummy: Promise<string> | undefined;
/** A hash of a random password, made once, to verify against when the login is unknown. */
const dummyHash = () => (dummy ??= hashPassword(randomUUID()));

/** Password sign-in limits (the OTP ones are in otp.service.ts). */
export const LOGIN_LIMITS = {
  lockout: { failures: 10, windowMs: 15 * 60_000 },
} as const;

const MfaVerifyBody =z.object({ mfaToken: z.string().min(10).max(2000), code: z.string().trim().min(6).max(20) });

const OtpVerifyBody =OtpRequestBody.extend({ code: z.string().trim().min(1).max(10) });

const RefreshBody = z.object({ refreshToken: z.string().min(40).max(300) });

/**
 * Sign-in. Staff (ERP, Teacher App) can use a password; teachers, parents and students sign in
 * with their phone and a one-time code by SMS (docs/architecture/auth-otp.md).
 */
@Controller('v1/auth')
export class AuthController {
  constructor(
    private readonly db: DbService,
    private readonly system: SystemLookups,
    private readonly mfa: MfaService,
    private readonly limiter: RateLimiter,
    private readonly otp: OtpService,
    private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post('login')
  async login(@Body(new ZodBody(LoginBody)) body: z.infer<typeof LoginBody>, @Ip() ip: string, @Headers('user-agent') userAgent?: string, @Headers('x-device-name') deviceName?: string, @Headers('x-device-id') deviceId?: string, @Headers('x-zynetix-client') client?: string) {
    const account = `${body.tenant.toLowerCase()}:${body.login.trim().toLowerCase()}`;
    // Credential stuffing across many accounts from one address, then guessing one account's password.
    await this.limiter.hit(`login-ip:${ip}`, this.env.LOGIN_PER_IP_PER_MINUTE, 60_000);
    await this.limiter.hit(`login:${account}`, 20, 60_000);
    // Lockout: after 10 wrong passwords in 15 minutes the account refuses even the right one until the window ends.
    await this.limiter.blocked(`login-fail:${account}`, LOGIN_LIMITS.lockout.failures);
    const failed = new UnauthorizedException('Wrong institution, login or password');
    const fail = () => this.limiter.hit(`login-fail:${account}`, Number.MAX_SAFE_INTEGER, LOGIN_LIMITS.lockout.windowMs).then(() => failed);

    const tenant = await this.system.tenantBySlug(body.tenant);
    if (!tenant) throw await fail();

    const result = await this.db.withTenant(tenant.id, async (tx) => {
      const [user] = await tx
        .select()
        .from(users)
        .where(or(eq(users.email, body.login.trim().toLowerCase()), eq(users.phone, normalizePhone(body.login))));
      // The same Argon2 work for an unknown login, so the answer time does not tell which logins exist.
      if (!user?.passwordHash) {
        await argon2.verify(await dummyHash(), body.password);
        return { refused: null };
      }
      // Failed attempts on a real account are kept for the sign-in report (written below, outside this transaction).
      if (user.status === 'disabled') return { refused: { userId: user.id, action: 'auth.sign_in_blocked' } };
      if (user.status !== 'active') return { refused: null };
      if (!(await argon2.verify(user.passwordHash, body.password))) return { refused: { userId: user.id, action: 'auth.sign_in_failed' } };
      if (passwordNeedsRehash(user.passwordHash)) await tx.update(users).set({ passwordHash: await hashPassword(body.password) }).where(eq(users.id, user.id));
      await noteSignInDevice(tx, tenant.id, user.id, deviceId);
      return { ok: await signInResponse(tx, this.mfa, tenant.id, user, 'password', { ip, userAgent, deviceName, client }) };
    });
    if ('ok' in result) return result.ok;
    if (result.refused) {
      const r = result.refused;
      await this.db.withTenant(tenant.id, (tx) => audit(tx, { tenantId: tenant.id, actorType: 'system', action: r.action, subjectType: 'user', subjectId: r.userId, data: { method: 'password', ip: ip ?? null, device: deviceName ?? null } }));
    }
    throw await fail();
  }

  /** Second step for a user with two-factor on: the `mfaToken` from login plus an authenticator or backup code. */
  @Post('mfa/verify')
  async verifyMfa(@Body(new ZodBody(MfaVerifyBody)) body: z.infer<typeof MfaVerifyBody>, @Ip() ip: string, @Headers('user-agent') userAgent?: string, @Headers('x-device-name') deviceName?: string, @Headers('x-zynetix-client') client?: string) {
    const challenge = this.mfa.tokens.verifyMfaChallenge(body.mfaToken);
    await this.limiter.hit(`mfa:${challenge.tid}:${challenge.sub}`, 10, 5 * 60_000);
    const result = await this.db.withTenant(challenge.tid, (tx) => this.mfa.completeMfa(tx, challenge, body.code, { ip, userAgent, deviceName, client }, this.clock.now()));
    if (!result) throw new UnauthorizedException({ message: 'That code is wrong or expired', code: 'MFA_CODE_INVALID' });
    return result;
  }

  /** Sends a sign-in code if an active user has this phone. Always 202, so it reveals nothing. */
  @Post('otp/request')
  @HttpCode(202)
  requestOtp(@Body(new ZodBody(OtpRequestBody)) body: z.infer<typeof OtpRequestBody>, @Ip() ip: string) {
    return this.otp.request(body.tenant, body.phone, ip);
  }

  /** Exchanges the code for a session: the same body as `login`. */
  @Post('otp/verify')
  verifyOtp(@Body(new ZodBody(OtpVerifyBody)) body: z.infer<typeof OtpVerifyBody>, @Ip() ip: string, @Headers('user-agent') userAgent?: string, @Headers('x-device-name') deviceName?: string, @Headers('x-zynetix-client') client?: string) {
    return this.otp.verify(body.tenant, body.phone, body.code, ip, { userAgent, deviceName, client });
  }

  /**
   * The apps: a new access token (and a new refresh token; the old one stops working) for the refresh token a
   * mobile sign-in returned. Rate limited per address and per session.
   */
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body(new ZodBody(RefreshBody)) body: z.infer<typeof RefreshBody>, @Ip() ip: string) {
    await this.limiter.hit(`refresh-ip:${ip}`, 120, 60_000);
    const [tenantId, sessionId, secret] = body.refreshToken.split('.');
    const uuid = z.uuid();
    if (!uuid.safeParse(tenantId).success || !uuid.safeParse(sessionId).success || !secret) throw new UnauthorizedException({ message: 'Sign in again', code: 'REFRESH_INVALID' });
    await this.limiter.hit(`refresh:${sessionId}`, 20, 60_000);
    const r = await this.db.withTenant(tenantId, (tx) => this.mfa.refresh(tx, tenantId, sessionId, secret, this.clock.now(), { ip }));
    if (!r.ok) {
      // Two requests refreshed at once: the app re-reads its newest token. Anything else: sign in again.
      if (r.code === 'REFRESH_RACE') throw new ConflictException({ message: 'Already refreshed', code: r.code });
      throw new UnauthorizedException({ message: 'Sign in again', code: r.code });
    }
    const { ok: _ok, ...session } = r;
    return session;
  }
}
