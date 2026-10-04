import { Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { BoardPrincipal, UserPrincipal } from '../auth/principal.js';
import { DbService } from '../db/db.service.js';
import { boardSessions } from '../db/schema.js';
import { SessionsService } from './sessions.service.js';

@Controller('v1/sessions')
export class SessionsController {
  constructor(
    private readonly db: DbService,
    private readonly sessions: SessionsService,
  ) {}

  /** The board's current session: teacher, class, subject, period and roster (for picker and attendance). */
  @Get('current')
  @Auth('board')
  current(@CurrentPrincipal() p: BoardPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const context = await this.sessions.context(tx, p.sessionId);
      const roster = context.section ? await this.sessions.roster(tx, context.section.id) : [];
      return { ...context, roster };
    });
  }

  /** "End class" pressed on the board. */
  @Post('current/end')
  @Auth('board')
  endFromBoard(@CurrentPrincipal() p: BoardPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.sessions.end(tx, p.tenantId, p.sessionId, 'teacher_ended', false);
      return { ended: true };
    });
  }

  /** "End class" pressed in the Teacher App, or an admin signing a board out remotely. */
  @Post(':id/end')
  @Auth('user')
  endFromApp(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [s] = await tx
        .select({ teacherId: boardSessions.teacherId })
        .from(boardSessions)
        .where(and(eq(boardSessions.id, id), isNull(boardSessions.endedAt)));
      if (!s) return { ended: false };
      const isAdmin = p.roles.some((r) => r === 'tenant_admin' || r === 'principal');
      if (s.teacherId !== p.userId && !isAdmin) throw new ForbiddenException();
      await this.sessions.end(tx, p.tenantId, id, s.teacherId === p.userId ? 'teacher_ended' : 'admin_revoked', true);
      return { ended: true };
    });
  }
}
