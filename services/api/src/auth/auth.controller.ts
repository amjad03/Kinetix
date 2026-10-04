import { Body, Controller, HttpCode, Ip, Post, UnauthorizedException } from '@nestjs/common';
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
import { TokensService } from './tokens.service.js';

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

const OtpVerifyBody = OtpRequestBody.extend({ code: z.string().trim().min(1).max(10) });

/**
 * Sign-in. Staff (ERP, Teacher App) can use a password; teachers, parents and students sign in
 * with their phone and a one-time code by SMS (docs/architecture/auth-otp.md).
 */
@Controller('v1/auth')
export class AuthController {
  constructor(
    private readonly db: DbService,
    private readonly system: SystemLookups,
    private readonly tokens: TokensService,
    private readonly limiter: RateLimiter,
    private readonly otp: OtpService,
  ) {}

  @Post('login')
  async login(@Body(new ZodBody(LoginBody)) body: z.infer<typeof LoginBody>) {
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
      return signInResponse(tx, this.tokens, tenant.id, user, 'password');
    });
  }

  /** Sends a sign-in code if an active user has this phone. Always 202, so it reveals nothing. */
  @Post('otp/request')
  @HttpCode(202)
  requestOtp(@Body(new ZodBody(OtpRequestBody)) body: z.infer<typeof OtpRequestBody>, @Ip() ip: string) {
    return this.otp.request(body.tenant, body.phone, ip);
  }

  /** Exchanges the code for a session: the same body as `login`. */
  @Post('otp/verify')
  verifyOtp(@Body(new ZodBody(OtpVerifyBody)) body: z.infer<typeof OtpVerifyBody>, @Ip() ip: string) {
    return this.otp.verify(body.tenant, body.phone, body.code, ip);
  }
}
