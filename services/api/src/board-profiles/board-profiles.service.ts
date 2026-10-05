import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { audit } from '../common/audit.js';
import { RateLimiter } from '../common/rate-limiter.js';
import { Clock } from '../common/time.js';
import { DbService, type Tx } from '../db/db.service.js';
import { deviceProfiles, devices, users } from '../db/schema.js';
import { PairingService } from '../pairing/pairing.service.js';
import { hashProfilePin, MAX_PIN_ATTEMPTS, profilePinForBoard, verifyProfilePin } from './profile-pin.js';

export const PROFILE_LOCKED = 'Too many wrong PINs. Sign in with the Teacher app, or ask your administrator to reset your PIN.';
export const PROFILE_NO_PIN = 'No PIN is set for this teacher on this board';
export const PROFILE_WRONG_PIN = 'Wrong PIN';

/**
 * Shared-board profiles (docs/architecture/board-profiles.md): the teachers who have signed in
 * on a board, each with an optional PIN to switch to their profile there instead of a full
 * sign-in with the Teacher app.
 */
@Injectable()
export class BoardProfilesService {
  constructor(
    private readonly db: DbService,
    private readonly pairing: PairingService,
    private readonly limiter: RateLimiter,
    private readonly clock: Clock,
  ) {}

  /**
   * The board's profiles, most recently used first. A PIN's salt and hash go to the board so it
   * can check the PIN offline (as with the kiosk IT PIN); a locked profile's do not.
   */
  async list(tenantId: string, deviceId: string, opts: { forBoard: boolean }) {
    return this.db.withTenant(tenantId, async (tx) => {
      const rows = await this.rows(tx, deviceId);
      return rows.map((r) => ({
        userId: r.userId,
        name: r.name,
        language: r.language,
        pinSet: r.pinHash != null,
        locked: r.lockedAt != null,
        lastUsedAt: r.lastUsedAt,
        ...(opts.forBoard ? { pin: r.lockedAt == null && r.status === 'active' ? profilePinForBoard(r.pinHash) : null } : { pinSetAt: r.pinSetAt, failedAttempts: r.failedAttempts, lockedAt: r.lockedAt }),
      }));
    });
  }

  /** The signed-in teacher sets (or changes) their PIN on this board, which also lifts a lockout. */
  async setPin(tenantId: string, deviceId: string, userId: string, pin: string) {
    const hash = hashProfilePin(pin);
    return this.db.withTenant(tenantId, async (tx) => {
      const now = this.clock.now();
      const [row] = await tx
        .insert(deviceProfiles)
        .values({ tenantId, deviceId, userId, pinHash: hash, pinSetAt: now, lastUsedAt: now })
        .onConflictDoUpdate({
          target: [deviceProfiles.deviceId, deviceProfiles.userId],
          set: { pinHash: hash, pinSetAt: now, failedAttempts: 0, lockedAt: null },
        })
        .returning();
      await audit(tx, { tenantId, actorType: 'user', actorId: userId, action: 'board.profile_pin_set', subjectType: 'device', subjectId: deviceId });
      return { userId, pinSet: true, pinSetAt: row.pinSetAt, pin: profilePinForBoard(hash) };
    });
  }

  /** The teacher takes their profile (and PIN) off this board. */
  async remove(tenantId: string, deviceId: string, userId: string, actor: { type: 'user'; id: string }) {
    await this.db.withTenant(tenantId, async (tx) => {
      const gone = await tx
        .delete(deviceProfiles)
        .where(and(eq(deviceProfiles.deviceId, deviceId), eq(deviceProfiles.userId, userId)))
        .returning({ id: deviceProfiles.id });
      if (!gone.length) throw new NotFoundException('Profile not found');
      await audit(tx, { tenantId, actorType: actor.type, actorId: actor.id, action: 'board.profile_removed', subjectType: 'device', subjectId: deviceId, data: { userId } });
    });
  }

  /**
   * Switches the board to [userId]'s profile with their PIN: a new class session, as after a
   * full sign-in. Wrong PINs are counted (committed before the error is thrown); the fifth
   * locks the profile.
   */
  async unlock(tenantId: string, deviceId: string, userId: string, pin: string) {
    // Per board and per profile, on top of the lockout: slows a script trying PINs on many profiles.
    await this.limiter.hit(`profile-unlock:${deviceId}`, 30, 60_000);
    await this.limiter.hit(`profile-unlock:${deviceId}:${userId}`, 15, 60_000);

    const outcome = await this.db.withTenant(tenantId, async (tx) => {
      const [profile] = await tx
        .select()
        .from(deviceProfiles)
        .where(and(eq(deviceProfiles.deviceId, deviceId), eq(deviceProfiles.userId, userId)));
      if (!profile || !profile.pinHash) return { error: 'no_pin' as const };
      if (profile.lockedAt) return { error: 'locked' as const };

      if (!verifyProfilePin(pin, profile.pinHash)) {
        const [after] = await tx
          .update(deviceProfiles)
          .set({
            failedAttempts: sql`${deviceProfiles.failedAttempts} + 1`,
            lockedAt: sql`case when ${deviceProfiles.failedAttempts} + 1 >= ${MAX_PIN_ATTEMPTS} then now() else null end`,
          })
          .where(eq(deviceProfiles.id, profile.id))
          .returning({ failedAttempts: deviceProfiles.failedAttempts, lockedAt: deviceProfiles.lockedAt });
        await audit(tx, {
          tenantId,
          actorType: 'device',
          actorId: deviceId,
          action: after.lockedAt ? 'board.profile_locked' : 'board.profile_pin_wrong',
          subjectType: 'user',
          subjectId: userId,
          data: { attempts: after.failedAttempts },
        });
        return after.lockedAt ? { error: 'locked' as const } : { error: 'wrong' as const, attemptsLeft: MAX_PIN_ATTEMPTS - after.failedAttempts };
      }

      const [device] = await tx.select().from(devices).where(eq(devices.id, deviceId));
      if (!device) throw new NotFoundException('Board not found');
      await this.pairing.checkTeacher(tx, device, userId);
      await tx.update(deviceProfiles).set({ failedAttempts: 0 }).where(eq(deviceProfiles.id, profile.id));
      const { context, sessionToken } = await this.pairing.openSession(tx, device, userId, 'pin');
      return { sessionToken, session: context };
    });

    if ('error' in outcome) {
      if (outcome.error === 'no_pin') throw new NotFoundException(PROFILE_NO_PIN);
      if (outcome.error === 'locked') throw new ForbiddenException({ message: PROFILE_LOCKED, locked: true });
      throw new UnauthorizedException({ message: PROFILE_WRONG_PIN, attemptsLeft: outcome.attemptsLeft });
    }
    return outcome;
  }

  /** ERP: an admin clears a teacher's PIN and lockout on a board; the teacher sets a new one after signing in. */
  async resetPin(tenantId: string, deviceId: string, userId: string, adminId: string) {
    return this.db.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(deviceProfiles)
        .set({ pinHash: null, pinSetAt: null, failedAttempts: 0, lockedAt: null })
        .where(and(eq(deviceProfiles.deviceId, deviceId), eq(deviceProfiles.userId, userId)))
        .returning({ id: deviceProfiles.id });
      if (!row) throw new NotFoundException('Profile not found');
      await audit(tx, { tenantId, actorType: 'user', actorId: adminId, action: 'device.profile_pin_reset', subjectType: 'device', subjectId: deviceId, data: { userId } });
      return { userId, pinSet: false, locked: false };
    });
  }

  private rows(tx: Tx, deviceId: string) {
    return tx
      .select({
        userId: deviceProfiles.userId,
        name: users.fullName,
        language: users.preferredLanguage,
        status: users.status,
        pinHash: deviceProfiles.pinHash,
        pinSetAt: deviceProfiles.pinSetAt,
        failedAttempts: deviceProfiles.failedAttempts,
        lockedAt: deviceProfiles.lockedAt,
        lastUsedAt: deviceProfiles.lastUsedAt,
      })
      .from(deviceProfiles)
      .innerJoin(users, eq(users.id, deviceProfiles.userId))
      .where(eq(deviceProfiles.deviceId, deviceId))
      .orderBy(desc(deviceProfiles.lastUsedAt));
  }
}
