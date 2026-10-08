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
import { DbService, type Tx } from '../db/db.service.js';
import { boardSessions, deviceProfiles, devices, pairingCodes, userRoles, users } from '../db/schema.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { SessionsService } from '../sessions/sessions.service.js';
import { TimetableService } from '../timetable/timetable.service.js';
import { DomainEvents, EventBus } from '../events/events.js';

/** Sessions without a timetable period (extra class, substitution) last this long. */
const AD_HOC_SESSION_MS = 2 * 3600_000;
/** Grace after the period ends before the board signs the teacher out. */
const PERIOD_GRACE_MS = 15 * 60_000;
const TEACHING_ROLES = ['teacher', 'hod', 'principal'] as const;

type Device = typeof devices.$inferSelect;

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
    private readonly events: EventBus,
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

      await this.checkTeacher(tx, device, p.userId);

      // Single use: whoever flips claimed_at first wins.
      const [won] = await tx
        .update(pairingCodes)
        .set({ claimedAt: now, claimedBy: p.userId })
        .where(and(eq(pairingCodes.id, code.id), isNull(pairingCodes.claimedAt)))
        .returning({ id: pairingCodes.id });
      if (!won) throw invalid;

      const { context, sessionToken } = await this.openSession(tx, device, p.userId, parsed.secret ? 'qr' : 'code');
      return { device, context, sessionToken };
    });

    const event: PairingClaimedEvent = { sessionToken: result.sessionToken, session: result.context };
    this.realtime.toDevices([result.device.id], RealtimeEvents.PairingClaimed, event);

    return {
      board: { id: result.device.id, name: result.device.name },
      session: result.context,
    };
  }

  /** Throws unless [teacherId] is active and may teach at the campus [device] belongs to. */
  async checkTeacher(tx: Tx, device: Device, teacherId: string): Promise<void> {
    const [teacher] = await tx.select().from(users).where(eq(users.id, teacherId));
    if (!teacher || teacher.status !== 'active') throw new ForbiddenException('Your account is not active');
    const roles = await tx
      .select({ campusId: userRoles.campusId })
      .from(userRoles)
      .where(and(eq(userRoles.userId, teacherId), inArray(userRoles.role, [...TEACHING_ROLES])));
    if (!roles.some((r) => r.campusId === null || r.campusId === device.campusId)) {
      throw new ForbiddenException('You are not a teacher at the campus this board belongs to');
    }
  }

  /**
   * Starts a class on [device] for [teacherId], who has proved who they are (a pairing code
   * from the Teacher app, or their PIN on a shared board: board-profiles/) and passed
   * [checkTeacher]. Ends whatever class was open on the board, finds the teacher's period in
   * its room, and keeps the teacher in the board's list of profiles.
   */
  async openSession(tx: Tx, device: Device, teacherId: string, method: 'qr' | 'code' | 'pin') {
    const now = this.clock.now();
    const replaced = await this.sessions.endActiveOnDevice(tx, device.tenantId, device.id, 'taken_over');

    const slot = await this.timetable.currentSlotForTeacher(tx, teacherId, device.roomId);
    const expiresAt = slot
      ? new Date(slot.endsAtInstant.getTime() + PERIOD_GRACE_MS)
      : new Date(now.getTime() + AD_HOC_SESSION_MS);

    const [session] = await tx
      .insert(boardSessions)
      .values({
        tenantId: device.tenantId,
        deviceId: device.id,
        teacherId,
        timetableSlotId: slot?.id,
        sectionId: slot?.sectionId,
        subjectId: slot?.subjectId,
        startedAt: now,
        expiresAt,
      })
      .returning();
    await this.events.emit(tx, device.tenantId, {
      type: DomainEvents.ClassStarted,
      aggregateType: 'board_session',
      aggregateId: session.id,
      actorId: teacherId,
      payload: { deviceId: device.id, sectionId: session.sectionId, subjectId: session.subjectId, timetableSlotId: session.timetableSlotId, method },
    });

    // The board's list of teachers who use it. A full sign-in also lifts a lockout from wrong
    // PINs: the teacher has just proved who they are.
    await tx
      .insert(deviceProfiles)
      .values({ tenantId: device.tenantId, deviceId: device.id, userId: teacherId, lastUsedAt: now })
      .onConflictDoUpdate({
        target: [deviceProfiles.deviceId, deviceProfiles.userId],
        set: method === 'pin' ? { lastUsedAt: now } : { lastUsedAt: now, failedAttempts: 0, lockedAt: null },
      });

    await audit(tx, {
      tenantId: device.tenantId,
      actorType: 'user',
      actorId: teacherId,
      action: 'board.paired',
      subjectType: 'device',
      subjectId: device.id,
      data: { sessionId: session.id, method, replacedSessions: replaced },
    });

    const context = await this.sessions.context(tx, session.id);
    const sessionToken = this.tokens.signBoard(
      { sub: teacherId, tid: device.tenantId, did: device.id, cid: device.campusId, sid: session.id },
      expiresAt,
    );
    return { session, context, sessionToken };
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
