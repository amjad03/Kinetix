import { Body, Controller, ForbiddenException, HttpCode, Post } from '@nestjs/common';
import { and, eq, gt } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { BoardPrincipal, DevicePrincipal } from '../auth/principal.js';
import { boardSessions } from '../db/schema.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { SyncService } from './sync.service.js';

const PushBody = z.object({
  /**
   * The class session the ops were recorded in. Needed with a device token: a board that
   * restarted, or whose class has ended, still sends what it queued during that class.
   */
  sessionId: z.uuid().optional(),
  ops: z
    .array(
      z.object({
        opId: z.uuid(),
        type: z.string().max(64),
        occurredAt: z.iso.datetime({ offset: true }),
        payload: z.record(z.string(), z.unknown()),
      }),
    )
    .max(500),
});

/** How long a board may hold on to ops from a class before they are refused. */
const LATE_OPS_DAYS = 7;

@Controller('v1/sync')
export class SyncController {
  constructor(
    private readonly db: DbService,
    private readonly sync: SyncService,
  ) {}

  @Post('push')
  @HttpCode(200)
  @Auth(['board', 'device'])
  async push(@CurrentPrincipal() caller: BoardPrincipal | DevicePrincipal, @Body(new ZodBody(PushBody)) body: z.infer<typeof PushBody>) {
    const results = await this.db.withTenant(caller.tenantId, async (tx) => {
      let p: BoardPrincipal;
      if (caller.kind === 'board' && (!body.sessionId || body.sessionId === caller.sessionId)) {
        p = caller;
      } else {
        // Ops from an earlier session on this same board, up to a week old.
        if (!body.sessionId) throw new ForbiddenException('sessionId is required with a device token');
        const [s] = await tx
          .select()
          .from(boardSessions)
          .where(and(eq(boardSessions.id, body.sessionId), eq(boardSessions.deviceId, caller.deviceId), gt(boardSessions.startedAt, new Date(Date.now() - LATE_OPS_DAYS * 86400_000))));
        if (!s) throw new ForbiddenException('That class session is not from this board, or is too old to sync');
        p = { kind: 'board', tenantId: caller.tenantId, deviceId: caller.deviceId, campusId: caller.campusId, teacherId: s.teacherId, sessionId: s.id };
      }
      return this.sync.push(tx, p, body.ops);
    });
    return { results, serverTime: new Date().toISOString() };
  }
}
