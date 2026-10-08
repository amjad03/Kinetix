import { Inject, Injectable } from '@nestjs/common';
import { MAX_CASTS_PER_BOARD, type CastEndReason, type CastSenderRole, type IceServer } from '@kinetix/shared';
import { and, eq, gt, inArray, isNull, ne } from 'drizzle-orm';
import { createHmac } from 'node:crypto';
import type { UserPrincipal } from '../auth/principal.js';
import { TEACHING_ROLES } from '../auth/auth.decorators.js';
import { audit } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { ENV, type Env } from '../config/env.js';
import { DbService } from '../db/db.service.js';
import { boardSessions, students, users } from '../db/schema.js';
import { castSessions } from '../db/schema-foundation.js';

export type CastRefusal = { error: string };
export interface CastStarted {
  castId: string;
  name: string;
  role: CastSenderRole;
  approved: boolean;
  endedBefore: string[];
}

/** Screen-share bookkeeping: who may cast to which board, and the limits. Media never touches the server. */
@Injectable()
export class CastService {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * STUN, and TURN with coturn's time-limited credentials (`use-auth-secret`): the username is the
   * expiry timestamp, the credential the base64 HMAC-SHA1 of it with the shared secret.
   */
  iceServers(who: string): IceServer[] {
    const list = (v: string) => v.split(',').map((s) => s.trim()).filter(Boolean);
    const out: IceServer[] = [];
    const stun = list(this.env.CAST_STUN_URLS);
    if (stun.length) out.push({ urls: stun });
    const turn = list(this.env.CAST_TURN_URLS);
    if (turn.length && this.env.CAST_TURN_SECRET) {
      const username = `${Math.floor(this.clock.now().getTime() / 1000) + this.env.CAST_TURN_TTL_S}:${who}`;
      out.push({ urls: turn, username, credential: createHmac('sha1', this.env.CAST_TURN_SECRET).update(username).digest('base64') });
    }
    return out;
  }

  /** A user asks to cast to a board: it must have a class open, and the user must belong to it. */
  start(p: UserPrincipal, deviceId: string): Promise<CastStarted | CastRefusal> {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [session] = await tx
        .select({ id: boardSessions.id, teacherId: boardSessions.teacherId, sectionId: boardSessions.sectionId })
        .from(boardSessions)
        .where(and(eq(boardSessions.deviceId, deviceId), isNull(boardSessions.endedAt), gt(boardSessions.expiresAt, this.clock.now())));
      if (!session) return { error: 'No class is being taught on this board right now' };
      const [me] = await tx.select({ name: users.fullName }).from(users).where(eq(users.id, p.userId));
      const isTeacher = p.roles.some((r) => TEACHING_ROLES.includes(r));
      let role: CastSenderRole;
      if (isTeacher) role = 'teacher';
      else if (p.roles.includes('student')) {
        const [st] = await tx.select({ sectionId: students.sectionId }).from(students).where(eq(students.userId, p.userId));
        if (!st || st.sectionId !== session.sectionId) return { error: 'This is not your class' };
        role = 'student';
      } else return { error: 'Only teachers and students can cast to a board' };

      // One cast per person per board: a new one replaces the old.
      const mine = await tx
        .update(castSessions)
        .set({ state: 'ended', endReason: 'stopped', endedAt: this.clock.now() })
        .where(and(eq(castSessions.deviceId, deviceId), eq(castSessions.userId, p.userId), ne(castSessions.state, 'ended')))
        .returning({ id: castSessions.id });
      const open = await tx.select({ id: castSessions.id }).from(castSessions).where(and(eq(castSessions.deviceId, deviceId), ne(castSessions.state, 'ended')));
      if (open.length >= MAX_CASTS_PER_BOARD) return { error: `This board already shows ${MAX_CASTS_PER_BOARD} screens` };

      const approved = session.teacherId === p.userId;
      const now = this.clock.now();
      const [row] = await tx
        .insert(castSessions)
        .values({ tenantId: p.tenantId, deviceId, boardSessionId: session.id, userId: p.userId, senderName: me?.name ?? 'Someone', senderRole: role, state: approved ? 'active' : 'pending', startedAt: approved ? now : null })
        .returning({ id: castSessions.id });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'cast.requested', subjectType: 'device', subjectId: deviceId, data: { castId: row.id, role, autoApproved: approved } });
      return { castId: row.id, name: me?.name ?? 'Someone', role, approved, endedBefore: mine.map((m) => m.id) };
    });
  }

  /** The board's teacher decision. Returns the sender, or null when the cast is not pending on this board. */
  decide(tenantId: string, deviceId: string, castId: string, approve: boolean): Promise<{ userId: string; name: string; role: string } | null> {
    return this.db.withTenant(tenantId, async (tx) => {
      const now = this.clock.now();
      const [row] = await tx
        .update(castSessions)
        .set(approve ? { state: 'active', startedAt: now } : { state: 'ended', endReason: 'declined', endedAt: now })
        .where(and(eq(castSessions.id, castId), eq(castSessions.deviceId, deviceId), eq(castSessions.state, 'pending')))
        .returning({ userId: castSessions.userId, name: castSessions.senderName, role: castSessions.senderRole });
      if (!row) return null;
      await audit(tx, { tenantId, actorType: 'device', actorId: deviceId, action: approve ? 'cast.approved' : 'cast.declined', subjectType: 'device', subjectId: deviceId, data: { castId } });
      return row;
    });
  }

  /** The cast's board and sender, while it is not over. */
  get(tenantId: string, castId: string) {
    return this.db.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .select({ id: castSessions.id, deviceId: castSessions.deviceId, userId: castSessions.userId, state: castSessions.state, teacherId: boardSessions.teacherId })
        .from(castSessions)
        .innerJoin(boardSessions, eq(boardSessions.id, castSessions.boardSessionId))
        .where(and(eq(castSessions.id, castId), ne(castSessions.state, 'ended'), isNull(boardSessions.endedAt)));
      return row ?? null;
    });
  }

  /** Ends casts matching [where]; returns who to tell. */
  private async endWhere(tenantId: string, cond: ReturnType<typeof and>, reason: CastEndReason, actor: { type: 'user' | 'device' | 'system'; id?: string }) {
    return this.db.withTenant(tenantId, async (tx) => {
      const ended = await tx
        .update(castSessions)
        .set({ state: 'ended', endReason: reason, endedAt: this.clock.now() })
        .where(and(cond, ne(castSessions.state, 'ended')))
        .returning({ id: castSessions.id, deviceId: castSessions.deviceId, userId: castSessions.userId });
      for (const c of ended) await audit(tx, { tenantId, actorType: actor.type, actorId: actor.id, action: 'cast.ended', subjectType: 'device', subjectId: c.deviceId, data: { castId: c.id, reason } });
      return ended;
    });
  }

  end(tenantId: string, castId: string, reason: CastEndReason, actor: { type: 'user' | 'device' | 'system'; id?: string }) {
    return this.endWhere(tenantId, eq(castSessions.id, castId), reason, actor);
  }

  endForDevice(tenantId: string, deviceId: string, reason: CastEndReason) {
    return this.endWhere(tenantId, eq(castSessions.deviceId, deviceId), reason, { type: 'system' });
  }

  endForSender(tenantId: string, userId: string, castIds: string[], reason: CastEndReason) {
    if (!castIds.length) return Promise.resolve([]);
    return this.endWhere(tenantId, and(eq(castSessions.userId, userId), inArray(castSessions.id, castIds)), reason, { type: 'user', id: userId });
  }
}
