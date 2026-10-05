import { Injectable } from '@nestjs/common';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { Clock } from '../common/time.js';
import { DbService } from '../db/db.service.js';
import { boardSessions, devices } from '../db/schema.js';

/** How long a phone's right to drive a board is trusted before it is checked again (pointer moves). */
export const REMOTE_RECHECK_MS = 10_000;

export interface RemoteGrant {
  deviceId: string;
  deviceName: string;
  sessionId: string;
  teacherId: string;
}

/**
 * Who may drive a board from their phone: only the teacher whose class is open on it now
 * (they paired the board with the Teacher App). Another teacher, a student, or the same
 * teacher after the class has ended is refused.
 */
@Injectable()
export class RemoteService {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
  ) {}

  /** The board's open class, when [userId] is teaching it. */
  grant(tenantId: string, userId: string, deviceId: string): Promise<RemoteGrant | null> {
    return this.db.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .select({ sessionId: boardSessions.id, teacherId: boardSessions.teacherId, deviceName: devices.name })
        .from(boardSessions)
        .innerJoin(devices, eq(devices.id, boardSessions.deviceId))
        .where(and(eq(boardSessions.deviceId, deviceId), isNull(boardSessions.endedAt), gt(boardSessions.expiresAt, this.clock.now())));
      if (!row || row.teacherId !== userId) return null;
      return { deviceId, deviceName: row.deviceName, sessionId: row.sessionId, teacherId: row.teacherId };
    });
  }

  /** The teacher of the class open on a board now (to send the board's state to their phone). */
  teacherOf(tenantId: string, deviceId: string): Promise<string | null> {
    return this.db.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .select({ teacherId: boardSessions.teacherId })
        .from(boardSessions)
        .where(and(eq(boardSessions.deviceId, deviceId), isNull(boardSessions.endedAt), gt(boardSessions.expiresAt, this.clock.now())));
      return row?.teacherId ?? null;
    });
  }
}
