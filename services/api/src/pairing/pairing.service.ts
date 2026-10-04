import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PairingClaimedEvent } from '@kinetix/shared';
import { RealtimeEvents } from '@kinetix/shared';
import { and, eq, gt, inArray, isNull } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { TokensService } from '../auth/tokens.service.js';
import { audit } from '../common/audit.js';
import { hmac, safeEqual } from '../common/crypto.js';
import { RateLimiter } from '../common/rate-limiter.js';
import { Clock } from '../common/time.js';
import { ENV, type Env } from '../config/env.js';
import { DbService } from '../db/db.service.js';
import { boardSessions, devices, pairingCodes, userRoles, users } from '../db/schema.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { SessionsService } from '../sessions/sessions.service.js';
import { TimetableService } from '../timetable/timetable.service.js';

/** Sessions without a timetable period (extra class, substitution) last this long. */
const AD_HOC_SESSION_MS = 2 * 3600_000;
/** Grace after the period ends before the board signs the teacher out. */
const PERIOD_GRACE_MS = 15 * 60_000;
const TEACHING_ROLES = ['teacher', 'hod', 'principal'] as const;

export interface ClaimInput {
  /** Typed 6-digit code. */
  code?: string;
  /** Scanned QR payload: kinetix://pair?c=…&s=…&d=… */
  qr?: string;
}

@Injectable()
export class PairingService {
  constructor(
    private readonly db: DbService,
    private readonly tokens: TokensService,
    private readonly timetable: TimetableService,
    private readonly sessions: SessionsService,
    private readonly realtime: RealtimeGateway,
    private readonly limiter: RateLimiter,
    private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async claim(p: UserPrincipal, input: ClaimInput) {
    const parsed = this.parse(input);
    // Typed codes are guessable in principle, so they get a much tighter budget than scans.
    if (parsed.secret) await this.limiter.hit(`claim-qr:${p.userId}`, 20, 60_000);
    else await this.limiter.hit(`claim-code:${p.userId}`, 5, 60_000);

    const result = await this.db.withTenant(p.tenantId, async (tx) => {
      const now = this.clock.now();
      const invalid = new NotFoundException('This code is invalid or has expired. Use the new code on the board.');

      const conditions = [eq(pairingCodes.codeHash, this.hash(parsed.code)), isNull(pairingCodes.claimedAt), gt(pairingCodes.expiresAt, now)];
      if (parsed.deviceId) conditions.push(eq(pairingCodes.deviceId, parsed.deviceId));
      const [code] = await tx.select().from(pairingCodes).where(and(...conditions));
      if (!code) throw invalid;
      if (parsed.secret && !safeEqual(code.secretHash, this.hash(parsed.secret))) throw invalid;

      const [device] = await tx.select().from(devices).where(eq(devices.id, code.deviceId));
      if (!device) throw invalid;

      const [teacher] = await tx.select().from(users).where(eq(users.id, p.userId));
      if (!teacher || teacher.status !== 'active') throw new ForbiddenException('Your account is not active');
      const roles = await tx
        .select({ campusId: userRoles.campusId })
        .from(userRoles)
        .where(and(eq(userRoles.userId, p.userId), inArray(userRoles.role, [...TEACHING_ROLES])));
      if (!roles.some((r) => r.campusId === null || r.campusId === device.campusId)) {
        throw new ForbiddenException('You are not a teacher at the campus this board belongs to');
      }

      // Single use: whoever flips claimed_at first wins.
      const [won] = await tx
        .update(pairingCodes)
        .set({ claimedAt: now, claimedBy: p.userId })
        .where(and(eq(pairingCodes.id, code.id), isNull(pairingCodes.claimedAt)))
        .returning({ id: pairingCodes.id });
      if (!won) throw invalid;

      const replaced = await this.sessions.endActiveOnDevice(tx, p.tenantId, device.id, 'taken_over');

      const slot = await this.timetable.currentSlotForTeacher(tx, p.userId, device.roomId);
      const expiresAt = slot
        ? new Date(slot.endsAtInstant.getTime() + PERIOD_GRACE_MS)
        : new Date(now.getTime() + AD_HOC_SESSION_MS);

      const [session] = await tx
        .insert(boardSessions)
        .values({
          tenantId: p.tenantId,
          deviceId: device.id,
          teacherId: p.userId,
          timetableSlotId: slot?.id,
          sectionId: slot?.sectionId,
          subjectId: slot?.subjectId,
          startedAt: now,
          expiresAt,
        })
        .returning();

      await audit(tx, {
        tenantId: p.tenantId,
        actorType: 'user',
        actorId: p.userId,
        action: 'board.paired',
        subjectType: 'device',
        subjectId: device.id,
        data: { sessionId: session.id, method: parsed.secret ? 'qr' : 'code', replacedSessions: replaced },
      });

      const context = await this.sessions.context(tx, session.id);
      const sessionToken = this.tokens.signBoard(
        { sub: p.userId, tid: p.tenantId, did: device.id, cid: device.campusId, sid: session.id },
        expiresAt,
      );
      return { device, context, sessionToken };
    });

    const event: PairingClaimedEvent = { sessionToken: result.sessionToken, session: result.context };
    this.realtime.toDevices([result.device.id], RealtimeEvents.PairingClaimed, event);

    return {
      board: { id: result.device.id, name: result.device.name },
      session: result.context,
    };
  }

  private parse(input: ClaimInput): { code: string; secret?: string; deviceId?: string } {
    if (input.qr) {
      let url: URL;
      try {
        url = new URL(input.qr);
      } catch {
        throw new BadRequestException('Not a KINETIX pairing QR code');
      }
      const code = url.searchParams.get('c');
      const secret = url.searchParams.get('s');
      const deviceId = url.searchParams.get('d');
      if (url.protocol !== 'kinetix:' || url.host !== 'pair' || !code || !secret || !deviceId) {
        throw new BadRequestException('Not a KINETIX pairing QR code');
      }
      return { code, secret, deviceId };
    }
    const code = input.code?.replace(/\s+/g, '');
    if (!code || !/^\d{6}$/.test(code)) throw new BadRequestException('Enter the 6-digit code shown on the board');
    return { code };
  }

  private hash(value: string): string {
    return hmac(this.env.PAIRING_HMAC_SECRET, `pair:${value}`);
  }
}
