import { Body, Controller, Post, UnauthorizedException } from '@nestjs/common';
import argon2 from 'argon2';
import { eq, or } from 'drizzle-orm';
import { z } from 'zod';
import { RateLimiter } from '../common/rate-limiter.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { userRoles, users } from '../db/schema.js';
import { SystemLookups } from '../db/system-lookups.service.js';
import type { RoleName } from './principal.js';
import { TokensService } from './tokens.service.js';

const LoginBody = z.object({
  tenant: z.string().min(1),
  /** Email address or phone number (E.164). */
  login: z.string().min(3),
  password: z.string().min(1),
});

/**
 * Phone numbers are stored in E.164. Accept what people actually type: "98000 00001",
 * "098000-00001", "919800000001" or "+91 98000 00001" all mean +919800000001.
 */
export function normalizePhone(input: string): string {
  const digits = input.replace(/[\s\-().]/g, '');
  if (/^\+\d{8,15}$/.test(digits)) return digits;
  if (/^0?[6-9]\d{9}$/.test(digits)) return `+91${digits.slice(-10)}`;
  if (/^91[6-9]\d{9}$/.test(digits)) return `+${digits}`;
  return digits;
}

/**
 * Password login for staff (ERP, Teacher App).
 * TODO: phone OTP for teachers, students and parents via an Indian SMS provider (DLT templates).
 */
@Controller('v1/auth')
export class AuthController {
  constructor(
    private readonly db: DbService,
    private readonly system: SystemLookups,
    private readonly tokens: TokensService,
    private readonly limiter: RateLimiter,
  ) {}

  @Post('login')
  async login(@Body(new ZodBody(LoginBody)) body: z.infer<typeof LoginBody>) {
    this.limiter.hit(`login:${body.tenant}:${body.login}`, 10, 60_000);
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

      const roles = await tx.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, user.id));
      const roleNames = [...new Set(roles.map((r) => r.role as RoleName))];
      return {
        accessToken: this.tokens.signUser({ sub: user.id, tid: tenant.id, roles: roleNames }),
        user: { id: user.id, fullName: user.fullName, preferredLanguage: user.preferredLanguage, roles: roleNames },
      };
    });
  }
}
