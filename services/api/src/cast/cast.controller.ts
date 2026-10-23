import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, HttpException, HttpStatus, Ip, Post, Query } from '@nestjs/common';
import type { CastJoinCode } from '@kinetix/shared';
import { z } from 'zod';
import type { BoardPrincipal, DevicePrincipal } from '../auth/principal.js';
import { ZodBody } from '../common/zod-body.js';
import { CastService } from './cast.service.js';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { Auth, CurrentPrincipal, TEACHING_ROLES } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { Clock } from '../common/time.js';
import { DbService } from '../db/db.service.js';
import { boardSessions, devices, rooms, sections, students, subjects, users } from '../db/schema.js';

const GuestBody = z.object({ code: z.string().trim().min(4).max(20), name: z.string().trim().min(1).max(60) });

/** Boards a person can cast to now: a teacher sees every board with a class open, a student the board of their own class. */
@Controller('v1/cast')
export class CastController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly cast: CastService,
  ) {}

  /** Wrong codes tried per address in the last ten minutes (guessing a code should take forever). */
  private readonly tries = new Map<string, { at: number; n: number }>();

  /** The board's join code for guests (shown with a QR of the /cast page). `fresh=1` replaces it. */
  @Get('join-code')
  @Auth(['device', 'board'])
  async joinCode(@CurrentPrincipal() p: DevicePrincipal | BoardPrincipal, @Query('fresh') fresh?: string): Promise<CastJoinCode> {
    const r = await this.cast.joinCode(p.tenantId, p.deviceId, fresh === '1' || fresh === 'true');
    if ('error' in r) throw new ForbiddenException(r.error);
    return { code: r.code, expiresAt: r.expiresAt.toISOString(), url: r.url };
  }

  /** A guest's browser: the code on the board and their name give a short-lived token for casting to that board. */
  @Post('guest')
  @HttpCode(200)
  async guest(@Ip() ip: string, @Body(new ZodBody(GuestBody)) b: z.infer<typeof GuestBody>) {
    const now = Date.now();
    const t = this.tries.get(ip);
    if (t && now - t.at < 10 * 60_000 && t.n >= 20) throw new HttpException('Too many wrong codes. Wait a few minutes and try again.', HttpStatus.TOO_MANY_REQUESTS);
    const r = await this.cast.redeem(b.code, b.name);
    if ('error' in r) {
      this.tries.set(ip, t && now - t.at < 10 * 60_000 ? { at: t.at, n: t.n + 1 } : { at: now, n: 1 });
      throw new BadRequestException(r.error);
    }
    return r;
  }

  @Get('boards')
  @Auth('user')
  boards(@CurrentPrincipal() p: UserPrincipal) {
    const teaching = p.roles.some((r) => TEACHING_ROLES.includes(r));
    const student = p.roles.includes('student');
    if (!teaching && !student) return [];
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({
          deviceId: devices.id,
          name: devices.name,
          room: rooms.name,
          teacherId: boardSessions.teacherId,
          teacher: users.fullName,
          sectionId: boardSessions.sectionId,
          section: sections.displayName,
          subject: subjects.name,
        })
        .from(boardSessions)
        .innerJoin(devices, eq(devices.id, boardSessions.deviceId))
        .innerJoin(users, eq(users.id, boardSessions.teacherId))
        .leftJoin(rooms, eq(rooms.id, devices.roomId))
        .leftJoin(sections, eq(sections.id, boardSessions.sectionId))
        .leftJoin(subjects, eq(subjects.id, boardSessions.subjectId))
        .where(and(isNull(boardSessions.endedAt), gt(boardSessions.expiresAt, this.clock.now())));
      let mine: string | null = null;
      if (!teaching) {
        const [s] = await tx.select({ sectionId: students.sectionId }).from(students).where(eq(students.userId, p.userId));
        mine = s?.sectionId ?? null;
      }
      return rows
        .filter((r) => teaching || (mine !== null && r.sectionId === mine))
        .map(({ teacherId, sectionId: _s, ...r }) => ({ ...r, needsApproval: teacherId !== p.userId }));
    });
  }
}
