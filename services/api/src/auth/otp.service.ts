import { BadRequestException, Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { audit } from '../common/audit.js';
import { hmac, randomDigits, safeEqual } from '../common/crypto.js';
import { RateLimiter } from '../common/rate-limiter.js';
import { Clock } from '../common/time.js';
import { ENV, type Env } from '../config/env.js';
import { DbService } from '../db/db.service.js';
import { otpCodes, users } from '../db/schema.js';
import { SystemLookups } from '../db/system-lookups.service.js';
import { normalizePhone } from './phone.js';
import { signInResponse } from './sign-in.js';
import { maskPhone, SmsSender } from './sms-sender.js';
import { MfaService, type SignInContext } from './mfa.service.js';

export const OTP_TTL_SECONDS = 300;
export const OTP_RESEND_SECONDS = 30;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_INVALID = 'Wrong or expired code';
export const PHONE_INVALID = 'Enter a valid mobile number';

const TEN_MINUTES = 10 * 60_000;

/** Rate limits (fixed windows). Shared across instances when Redis is configured. */
export const OTP_LIMITS = {
  /** Codes sent to one phone of one institution. */
  requestPerPhone: { limit: 3, windowMs: TEN_MINUTES },
  /** Code requests from one IP address (a school's shared Wi-Fi is one address). */
  requestPerIp: { limit: 30, windowMs: TEN_MINUTES },
  /** Code checks for one phone (5 tries per code × 3 codes). */
  verifyPerPhone: { limit: 15, windowMs: TEN_MINUTES },
  verifyPerIp: { limit: 60, windowMs: TEN_MINUTES },
};

/**
 * Phone sign-in with a one-time code by SMS (teachers, parents, students).
 * See docs/architecture/auth-otp.md for the flow, limits and threat model.
 */
@Injectable()
export class OtpService {
  private readonly log = new Logger(OtpService.name);

  constructor(
    private readonly db: DbService,
    private readonly system: SystemLookups,
    private readonly mfa: MfaService,
    private readonly limiter: RateLimiter,
    private readonly sms: SmsSender,
    private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Always answers the same way, whether or not the institution or phone exists. */
  async request(slug: string, phoneInput: string, ip: string): Promise<{ retryAfterSeconds: number; expiresInSeconds: number }> {
    const phone = this.phone(phoneInput);
    await this.limiter.hit(`otp-req-ip:${ip}`, OTP_LIMITS.requestPerIp.limit, OTP_LIMITS.requestPerIp.windowMs);
    await this.limiter.hit(`otp-gap:${slug}:${phone}`, 1, OTP_RESEND_SECONDS * 1000);
    await this.limiter.hit(`otp-req:${slug}:${phone}`, OTP_LIMITS.requestPerPhone.limit, OTP_LIMITS.requestPerPhone.windowMs);

    const tenant = await this.system.tenantBySlug(slug);
    if (tenant) {
      const toSend = await this.db.withTenant(tenant.id, async (tx) => {
        const [user] = await tx
          .select({ id: users.id, language: users.preferredLanguage })
          .from(users)
          .where(and(eq(users.phone, phone), eq(users.status, 'active')));
        if (!user) return undefined;
        const now = this.clock.now();
        // A new code replaces any earlier one for this phone.
        await tx.update(otpCodes).set({ usedAt: now }).where(and(eq(otpCodes.phone, phone), isNull(otpCodes.usedAt)));
        const code = randomDigits(6);
        await tx.insert(otpCodes).values({ tenantId: tenant.id, userId: user.id, phone, codeHash: this.hash(tenant.id, phone, code), expiresAt: new Date(now.getTime() + OTP_TTL_SECONDS * 1000) });
        await audit(tx, { tenantId: tenant.id, actorType: 'system', action: 'auth.otp_sent', subjectType: 'user', subjectId: user.id });
        return { code, language: user.language };
      });
      // Not awaited: the answer must not take longer when the phone exists.
      if (toSend) {
        void this.sms
          .sendOtp({ to: phone, code: toSend.code, appName: this.env.SMS_APP_NAME, language: toSend.language })
          .catch((e) => this.log.warn(`SMS to ${maskPhone(phone)} failed: ${(e as Error).message}`));
      }
    }
    return { retryAfterSeconds: OTP_RESEND_SECONDS, expiresInSeconds: OTP_TTL_SECONDS };
  }

  /** Checks the latest code for the phone; returns the same body as password login. */
  async verify(slug: string, phoneInput: string, code: string, ip: string, device: Omit<SignInContext, 'ip'> = {}) {
    const phone = this.phone(phoneInput);
    await this.limiter.hit(`otp-verify-ip:${ip}`, OTP_LIMITS.verifyPerIp.limit, OTP_LIMITS.verifyPerIp.windowMs);
    await this.limiter.hit(`otp-verify:${slug}:${phone}`, OTP_LIMITS.verifyPerPhone.limit, OTP_LIMITS.verifyPerPhone.windowMs);
    const fail = new UnauthorizedException(OTP_INVALID);
    const tenant = await this.system.tenantBySlug(slug);
    if (!tenant || !/^\d{6}$/.test(code)) throw fail;

    // A wrong guess must still be counted, so the transaction commits and the error is thrown after it.
    const result = await this.db.withTenant(tenant.id, async (tx) => {
      const now = this.clock.now();
      const [otp] = await tx
        .select()
        .from(otpCodes)
        .where(and(eq(otpCodes.phone, phone), isNull(otpCodes.usedAt)))
        .orderBy(desc(otpCodes.createdAt))
        .limit(1)
        .for('update');
      if (!otp || otp.expiresAt <= now || otp.attempts >= OTP_MAX_ATTEMPTS) return undefined;
      if (!safeEqual(otp.codeHash, this.hash(tenant.id, phone, code))) {
        const attempts = otp.attempts + 1;
        await tx
          .update(otpCodes)
          .set({ attempts, usedAt: attempts >= OTP_MAX_ATTEMPTS ? now : null })
          .where(eq(otpCodes.id, otp.id));
        if (attempts >= OTP_MAX_ATTEMPTS) await audit(tx, { tenantId: tenant.id, actorType: 'system', action: 'auth.otp_burned', subjectType: 'user', subjectId: otp.userId });
        return undefined;
      }
      await tx.update(otpCodes).set({ usedAt: now, attempts: otp.attempts + 1 }).where(eq(otpCodes.id, otp.id));
      const [user] = await tx.select().from(users).where(eq(users.id, otp.userId));
      if (!user || user.status !== 'active' || user.phone !== phone) return undefined;
      return signInResponse(tx, this.mfa, tenant.id, user, 'otp', { ip, ...device });
    });
    if (!result) throw fail;
    return result;
  }

  private phone(input: string): string {
    const phone = normalizePhone(input);
    if (!/^\+\d{8,15}$/.test(phone)) throw new BadRequestException(PHONE_INVALID);
    return phone;
  }

  /** Bound to the institution and phone, so a code is useless anywhere else. */
  private hash(tenantId: string, phone: string, code: string): string {
    return hmac(this.env.PAIRING_HMAC_SECRET, `otp:${tenantId}:${phone}:${code}`);
  }
}
