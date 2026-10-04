import { Body, Controller, Inject, NotFoundException, Post, UnauthorizedException } from '@nestjs/common';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal, STAFF_ADMIN_ROLES } from '../auth/auth.decorators.js';
import type { DevicePrincipal, UserPrincipal } from '../auth/principal.js';
import { TokensService } from '../auth/tokens.service.js';
import { audit } from '../common/audit.js';
import { enrollmentCode, hmac, randomDigits, randomToken } from '../common/crypto.js';
import { RateLimiter } from '../common/rate-limiter.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { ENV, type Env } from '../config/env.js';
import { DbService } from '../db/db.service.js';
import { campuses, devices, pairingCodes } from '../db/schema.js';
import { SystemLookups } from '../db/system-lookups.service.js';

export const PAIRING_TTL_MS = 120_000;
const ENROLLMENT_TTL_MS = 24 * 3600_000;

const CreateDeviceBody = z.object({
  name: z.string().min(1).max(80),
  campusId: z.uuid(),
  roomId: z.uuid().optional(),
});

const EnrollBody = z.object({
  code: z.string().min(4),
  platform: z.enum(['android', 'windows', 'linux', 'web']),
  appVersion: z.string().max(40).optional(),
});

@Controller('v1/devices')
export class DevicesController {
  constructor(
    private readonly db: DbService,
    private readonly system: SystemLookups,
    private readonly tokens: TokensService,
    private readonly limiter: RateLimiter,
    private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Admin registers a board in the ERP and gets a one-time enrolment code to type on it. */
  @Post()
  @Auth('user', STAFF_ADMIN_ROLES)
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(CreateDeviceBody)) body: z.infer<typeof CreateDeviceBody>) {
    const code = enrollmentCode();
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [campus] = await tx.select({ id: campuses.id }).from(campuses).where(eq(campuses.id, body.campusId));
      if (!campus) throw new NotFoundException('Campus not found');
      const [device] = await tx
        .insert(devices)
        .values({
          tenantId: p.tenantId,
          campusId: body.campusId,
          roomId: body.roomId,
          name: body.name,
          enrollmentCodeHash: this.hashEnrollment(code),
          enrollmentExpiresAt: new Date(this.clock.now().getTime() + ENROLLMENT_TTL_MS),
        })
        .returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'device.created', subjectType: 'device', subjectId: device.id });
      return { id: device.id, name: device.name, enrollmentCode: code, enrollmentExpiresAt: device.enrollmentExpiresAt };
    });
  }

  /** The board exchanges its enrolment code for a long-lived device token. */
  @Post('enroll')
  async enroll(@Body(new ZodBody(EnrollBody)) body: z.infer<typeof EnrollBody>) {
    this.limiter.hit('enroll:global', 30, 60_000);
    const fail = new UnauthorizedException('Invalid or expired enrolment code');
    const hash = this.hashEnrollment(body.code.trim().toUpperCase());
    const found = await this.system.tenantForEnrollmentCode(hash);
    if (!found) throw fail;

    return this.db.withTenant(found.tenantId, async (tx) => {
      const [device] = await tx
        .update(devices)
        .set({
          enrollmentCodeHash: null,
          enrollmentExpiresAt: null,
          enrolledAt: this.clock.now(),
          platform: body.platform,
          appVersion: body.appVersion,
        })
        .where(and(eq(devices.id, found.deviceId), eq(devices.enrollmentCodeHash, hash), gt(devices.enrollmentExpiresAt, this.clock.now())))
        .returning();
      if (!device) throw fail;
      await audit(tx, { tenantId: found.tenantId, actorType: 'device', actorId: device.id, action: 'device.enrolled', data: { platform: body.platform } });
      return {
        deviceToken: this.tokens.signDevice({ sub: device.id, tid: device.tenantId, cid: device.campusId, ver: device.tokenVersion }),
        device: { id: device.id, name: device.name, campusId: device.campusId, roomId: device.roomId },
      };
    });
  }

  /**
   * The board asks for a fresh pairing code to show as QR + 6 digits.
   * Older unclaimed codes for this device stop working.
   */
  @Post('me/pairing-codes')
  @Auth('device')
  issuePairingCode(@CurrentPrincipal() p: DevicePrincipal) {
    this.limiter.hit(`pairing-code:${p.deviceId}`, 30, 60_000);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const now = this.clock.now();
      await tx
        .update(pairingCodes)
        .set({ expiresAt: now })
        .where(and(eq(pairingCodes.deviceId, p.deviceId), isNull(pairingCodes.claimedAt), gt(pairingCodes.expiresAt, now)));

      // Avoid two live codes with the same digits inside one tenant.
      let code = randomDigits(6);
      for (let i = 0; i < 5; i++) {
        const [clash] = await tx
          .select({ id: pairingCodes.id })
          .from(pairingCodes)
          .where(and(eq(pairingCodes.codeHash, this.hashPairing(code)), isNull(pairingCodes.claimedAt), gt(pairingCodes.expiresAt, now)));
        if (!clash) break;
        code = randomDigits(6);
      }
      const secret = randomToken(16);
      const expiresAt = new Date(now.getTime() + PAIRING_TTL_MS);
      await tx.insert(pairingCodes).values({
        tenantId: p.tenantId,
        deviceId: p.deviceId,
        codeHash: this.hashPairing(code),
        secretHash: this.hashPairing(secret),
        expiresAt,
      });
      const qrPayload = `kinetix://pair?c=${code}&s=${secret}&d=${p.deviceId}`;
      return { code, qrPayload, expiresAt };
    });
  }

  hashPairing(value: string): string {
    return hmac(this.env.PAIRING_HMAC_SECRET, `pair:${value}`);
  }

  private hashEnrollment(code: string): string {
    return hmac(this.env.PAIRING_HMAC_SECRET, `enroll:${code}`);
  }
}
