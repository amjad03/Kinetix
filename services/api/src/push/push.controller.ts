import { Body, Controller, Delete, HttpCode, Post } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { pushDevices } from '../db/schema.js';

const RegisterBody = z.object({
  token: z.string().min(10).max(4096),
  platform: z.enum(['android', 'ios', 'web']),
  app: z.enum(['parent', 'student', 'teacher']),
});

/** Apps register their push token after sign-in and remove it on sign-out. */
@Controller('v1/push/devices')
export class PushController {
  constructor(private readonly db: DbService) {}

  @Post()
  @HttpCode(204)
  @Auth('user')
  async register(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(RegisterBody)) body: z.infer<typeof RegisterBody>) {
    await this.db.withTenant(p.tenantId, (tx) =>
      tx
        .insert(pushDevices)
        .values({ tenantId: p.tenantId, userId: p.userId, ...body })
        // The same phone signing in as someone else now belongs to them.
        .onConflictDoUpdate({ target: [pushDevices.tenantId, pushDevices.token], set: { userId: p.userId, app: body.app, platform: body.platform, lastSeenAt: sql`now()` } }),
    );
  }

  @Delete()
  @HttpCode(204)
  @Auth('user')
  async remove(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(RegisterBody.pick({ token: true }))) body: { token: string }) {
    await this.db.withTenant(p.tenantId, (tx) => tx.delete(pushDevices).where(and(eq(pushDevices.token, body.token), eq(pushDevices.userId, p.userId))));
  }
}
