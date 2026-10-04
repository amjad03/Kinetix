import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { BoardPrincipal, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { boardSessions, students, subjects, users } from '../db/schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { SessionsService } from './sessions.service.js';

@Controller('v1/sessions')
export class SessionsController {
  constructor(
    private readonly db: DbService,
    private readonly sessions: SessionsService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
    private readonly clock: Clock,
  ) {}

  /**
   * "Go live": the students of the class can watch the board from the Student App (they are
   * told by notification). Turning it off sends them away.
   */
  @Post('current/live')
  @HttpCode(200)
  @Auth('board')
  live(@CurrentPrincipal() p: BoardPrincipal, @Body(new ZodBody(z.object({ on: z.boolean() }))) body: { on: boolean }) {
    return this.db
      .withTenant(p.tenantId, async (tx) => {
        const [s] = await tx.select().from(boardSessions).where(eq(boardSessions.id, p.sessionId));
        if (!s?.sectionId) throw new BadRequestException('Open a timetabled class to go live');
        if (s.liveForClass !== body.on) {
          await tx.update(boardSessions).set({ liveForClass: body.on }).where(eq(boardSessions.id, s.id));
          await audit(tx, { tenantId: p.tenantId, actorType: 'device', actorId: p.deviceId, action: body.on ? 'live_class.start' : 'live_class.stop', subjectType: 'board_session', subjectId: s.id });
          if (body.on) {
            const [teacher] = await tx.select({ fullName: users.fullName }).from(users).where(eq(users.id, s.teacherId));
            const [subject] = s.subjectId ? await tx.select({ name: subjects.name }).from(subjects).where(eq(subjects.id, s.subjectId)) : [];
            await this.notifications.liveClass(tx, { sessionId: s.id, sectionId: s.sectionId, subjectName: subject?.name ?? null, teacherName: teacher?.fullName ?? 'Your teacher' });
          }
        }
        return { liveForClass: body.on };
      })
      .then(async (r) => {
        if (!body.on) await this.realtime.endClassLive(p.tenantId, p.deviceId);
        return r;
      });
  }

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

/** For the Student App: is my class live right now, and on which board? */
@Controller('v1/student')
export class StudentLiveController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
  ) {}

  @Get('live')
  @Auth('user', ['student'])
  live(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [me] = await tx.select({ sectionId: students.sectionId }).from(students).where(eq(students.userId, p.userId));
      if (!me) return { live: null };
      const [s] = await tx
        .select({ deviceId: boardSessions.deviceId, sessionId: boardSessions.id, teacher: users.fullName, subject: subjects.name, startedAt: boardSessions.startedAt })
        .from(boardSessions)
        .innerJoin(users, eq(users.id, boardSessions.teacherId))
        .leftJoin(subjects, eq(subjects.id, boardSessions.subjectId))
        .where(
          and(
            eq(boardSessions.sectionId, me.sectionId),
            eq(boardSessions.liveForClass, true),
            isNull(boardSessions.endedAt),
            gt(boardSessions.expiresAt, this.clock.now()),
          ),
        );
      return { live: s ?? null };
    });
  }
}
