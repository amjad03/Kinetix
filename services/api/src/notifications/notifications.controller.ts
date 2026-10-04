import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { DbService } from '../db/db.service.js';
import { notifications } from '../db/schema.js';

/** The signed-in user's own notifications (parents, students; staff later). */
@Controller('v1/notifications')
export class NotificationsController {
  constructor(private readonly db: DbService) {}

  @Get()
  @Auth('user')
  list(@CurrentPrincipal() p: UserPrincipal, @Query('limit') limit?: string) {
    const n = Math.min(Math.max(Number(limit) || 50, 1), 200);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const mine = and(eq(notifications.userId, p.userId), isNull(notifications.retractedAt));
      const items = await tx
        .select({
          id: notifications.id,
          kind: notifications.kind,
          title: notifications.title,
          body: notifications.body,
          data: notifications.data,
          createdAt: notifications.createdAt,
          readAt: notifications.readAt,
        })
        .from(notifications)
        .where(mine)
        .orderBy(desc(notifications.createdAt))
        .limit(n);
      const [{ unread }] = await tx.select({ unread: count() }).from(notifications).where(and(mine, isNull(notifications.readAt)));
      return { unread, items };
    });
  }

  @Post(':id/read')
  @HttpCode(204)
  @Auth('user')
  async read(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    await this.db.withTenant(p.tenantId, (tx) =>
      tx
        .update(notifications)
        .set({ readAt: new Date() })
        .where(and(eq(notifications.id, id), eq(notifications.userId, p.userId), isNull(notifications.readAt))),
    );
  }

  @Post('read-all')
  @HttpCode(204)
  @Auth('user')
  async readAll(@CurrentPrincipal() p: UserPrincipal) {
    await this.db.withTenant(p.tenantId, (tx) =>
      tx.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, p.userId), isNull(notifications.readAt))),
    );
  }
}
