import { noteSignInDevice } from '../trust/trust.controller.js';
import { Body, Controller, Headers, HttpCode, Ip, Post, UnauthorizedException } from '@nestjs/common';
import argon2 from 'argon2';
import { eq, or } from 'drizzle-orm';
import { z } from 'zod';
import { RateLimiter } from '../common/rate-limiter.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { users } from '../db/schema.js';
import { SystemLookups } from '../db/system-lookups.service.js';
import { OtpService } from './otp.service.js';
import { normalizePhone } from './phone.js';
import { signInResponse } from './sign-in.js';
import { MfaService } from './mfa.service.js';
import { Clock } from '../common/time.js';

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

const MfaVerifyBody = z.object({ mfaToken: z.string().min(10).max(2000), code: z.string().trim().min(6).max(20) });

const OtpVerifyBody =OtpRequestBody.extend({ code: z.string().trim().min(1).max(10) });

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
  ) {}

  @Post('login')
  async login(@Body(new ZodBody(LoginBody)) body: z.infer<typeof LoginBody>, @Ip() ip: string, @Headers('user-agent') userAgent?: string, @Headers('x-device-name') deviceName?: string, @Headers('x-device-id') deviceId?: string) {
    await this.limiter.hit(`login:${body.tenant}:${body.login}`, 10, 60_000);
    const fail = new UnauthorizedException('Wrong institution, login or password');

    const tenant = await this.system.tenantBySlug(body.tenant);
    if (!tenant) throw fail;

    return this.db.withTenant(tenant.id, async (tx) => {
      const [user] = await tx
        .select()
        .from(users)
        .where(or(eq(users.email, body.login.trim().toLowerCase()), eq(users.phone, normalizePhone(body.login))));
      if (!user?.passwordHash || user.status !== 'active') throw fail;
      if (!(await argon2.verify(user.passwordHash, body.password))) throw fail;
      await noteSignInDevice(tx, tenant.id, user.id, deviceId);
      return signInResponse(tx, this.mfa, tenant.id, user, 'password', { ip, userAgent, deviceName });
    });
  }

  /** Second step for a user with two-factor on: the `mfaToken` from login plus an authenticator or backup code. */
  @Post('mfa/verify')
  async verifyMfa(@Body(new ZodBody(MfaVerifyBody)) body: z.infer<typeof MfaVerifyBody>, @Ip() ip: string, @Headers('user-agent') userAgent?: string, @Headers('x-device-name') deviceName?: string) {
    const challenge = this.mfa.tokens.verifyMfaChallenge(body.mfaToken);
    await this.limiter.hit(`mfa:${challenge.tid}:${challenge.sub}`, 10, 5 * 60_000);
    const result = await this.db.withTenant(challenge.tid, (tx) => this.mfa.completeMfa(tx, challenge, body.code, { ip, userAgent, deviceName }, this.clock.now()));
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
  verifyOtp(@Body(new ZodBody(OtpVerifyBody)) body: z.infer<typeof OtpVerifyBody>, @Ip() ip: string, @Headers('user-agent') userAgent?: string, @Headers('x-device-name') deviceName?: string) {
    return this.otp.verify(body.tenant, body.phone, body.code, ip, { userAgent, deviceName });
  }
}
