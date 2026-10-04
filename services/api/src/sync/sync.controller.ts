import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { BoardPrincipal } from '../auth/principal.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { SyncService } from './sync.service.js';

const PushBody = z.object({
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

@Controller('v1/sync')
export class SyncController {
  constructor(
    private readonly db: DbService,
    private readonly sync: SyncService,
  ) {}

  @Post('push')
  @HttpCode(200)
  @Auth('board')
  async push(@CurrentPrincipal() p: BoardPrincipal, @Body(new ZodBody(PushBody)) body: z.infer<typeof PushBody>) {
    const results = await this.db.withTenant(p.tenantId, (tx) => this.sync.push(tx, p, body.ops));
    return { results, serverTime: new Date().toISOString() };
  }
}
