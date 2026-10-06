import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { RealtimeEvents, type BadgeAwardedEvent, type BadgeView, type StudentBadges } from '@kinetix/shared';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal, TEACHING_ROLES } from '../auth/auth.decorators.js';
import type { BoardPrincipal, RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { assertCanSeeStudent } from '../common/student-access.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { BADGE_KINDS, badges, guardians, students, subjects, users } from '../db/schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { isSchoolAdmin, TeacherService } from '../teacher/teacher.service.js';

const AwardBody = z.object({
  studentId: z.uuid(),
  sectionId: z.uuid(),
  badge: z.enum(BADGE_KINDS),
  subjectId: z.uuid().optional(),
  note: z.string().trim().max(200).optional(),
});

/** Staff who may look at any student's badges (teachers, HODs, leaders). */
const STAFF: RoleName[] = [...TEACHING_ROLES, 'tenant_admin'];

/**
 * Badges: a teacher of the class awards one (from the board or the Teacher App); the student
 * and their family are told, and see them in the Student and Parent Apps.
 */
@Controller('v1/badges')
export class BadgesController {
  constructor(
    private readonly db: DbService,
    private readonly teacher: TeacherService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  @Post()
  @Auth(['user', 'board'])
  async award(@CurrentPrincipal() p: UserPrincipal | BoardPrincipal, @Body(new ZodBody(AwardBody)) b: z.infer<typeof AwardBody>): Promise<BadgeView> {
    const teacherId = p.kind === 'board' ? p.teacherId : p.userId;
    const { view, notify } = await this.db.withTenant(p.tenantId, async (tx) => {
      const mayAward = (p.kind === 'user' && isSchoolAdmin(p)) || (await this.teacher.teachesSection(tx, teacherId, b.sectionId));
      if (!mayAward) throw new ForbiddenException('Only the teachers of this class can award badges');
      const [st] = await tx.select({ fullName: students.fullName, sectionId: students.sectionId, status: students.status, userId: students.userId }).from(students).where(eq(students.id, b.studentId));
      if (!st || st.sectionId !== b.sectionId || st.status !== 'active') throw new BadRequestException('This student is not in the class');
      const [row] = await tx
        .insert(badges)
        .values({ tenantId: p.tenantId, studentId: b.studentId, sectionId: b.sectionId, badge: b.badge, awardedBy: teacherId, subjectId: b.subjectId ?? null, note: b.note || null })
        .returning({ id: badges.id });
      const [teacher] = await tx.select({ fullName: users.fullName }).from(users).where(eq(users.id, teacherId));
      await this.notifications.badgeAwarded(tx, { id: row.id, studentId: b.studentId, studentName: st.fullName, badge: b.badge, teacherName: teacher?.fullName ?? '' });
      await audit(tx, {
        tenantId: p.tenantId,
        actorType: p.kind === 'board' ? 'device' : 'user',
        actorId: p.kind === 'board' ? p.deviceId : p.userId,
        action: 'badge.awarded',
        subjectType: 'student',
        subjectId: b.studentId,
        data: { badge: b.badge, teacherId },
      });
      const family = await tx.select({ userId: guardians.userId }).from(guardians).where(eq(guardians.studentId, b.studentId));
      const [view] = await this.list(tx, b.studentId, row.id);
      return { view, notify: [...family.map((f) => f.userId), ...(st.userId ? [st.userId] : [])] };
    });
    this.realtime.toUsers(notify, RealtimeEvents.BadgeAwarded, { studentId: b.studentId, badge: view } satisfies BadgeAwardedEvent);
    return view;
  }

  /** A student's badges: the student, their guardians, and staff. */
  @Get('students/:id')
  @Auth('user')
  forStudent(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) studentId: string): Promise<StudentBadges> {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, STAFF);
      const list = await this.list(tx, studentId);
      const counts: StudentBadges['counts'] = {};
      for (const x of list) counts[x.badge] = (counts[x.badge] ?? 0) + 1;
      return { studentId, badges: list, counts };
    });
  }

  private async list(tx: Tx, studentId: string, id?: string): Promise<BadgeView[]> {
    const rows = await tx
      .select({ b: badges, teacher: users.fullName, subject: subjects.name })
      .from(badges)
      .innerJoin(users, eq(users.id, badges.awardedBy))
      .leftJoin(subjects, eq(subjects.id, badges.subjectId))
      .where(id ? and(eq(badges.studentId, studentId), eq(badges.id, id)) : eq(badges.studentId, studentId))
      .orderBy(desc(badges.awardedAt))
      .limit(200);
    return rows.map(({ b, teacher, subject }) => ({
      id: b.id,
      studentId: b.studentId,
      badge: b.badge,
      awardedAt: b.awardedAt.toISOString(),
      awardedBy: { id: b.awardedBy, fullName: teacher },
      subject: b.subjectId && subject ? { id: b.subjectId, name: subject } : null,
      note: b.note,
    }));
  }
}
