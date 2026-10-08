import { Controller, Get } from '@nestjs/common';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { Auth, CurrentPrincipal, TEACHING_ROLES } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { Clock } from '../common/time.js';
import { DbService } from '../db/db.service.js';
import { boardSessions, devices, rooms, sections, students, subjects, users } from '../db/schema.js';

/** Boards a person can cast to now: a teacher sees every board with a class open, a student the board of their own class. */
@Controller('v1/cast')
export class CastController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
  ) {}

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
