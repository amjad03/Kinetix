import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import type { ActiveBoardSession, AttendanceSheet, Homework, MeResponse, RosterStudent, TeacherClass, TeacherTimetableResponse } from '@kinetix/shared';
import { and, asc, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal, TEACHING_ROLES } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { attendanceRecords, boardSessions, devices, homework, sections, subjects, tenants, timetableSlots, userRoles, users } from '../db/schema.js';
import { SessionsService } from '../sessions/sessions.service.js';
import { isoWeekday, isSchoolAdmin, parseDate, TeacherService } from './teacher.service.js';

/** Teaching staff plus admins, who can look at (and correct) any class. */
const CLASS_ROLES: RoleName[] = [...TEACHING_ROLES, 'tenant_admin'];

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-05');

const AttendanceBody = z.object({
  slotId: z.uuid(),
  date: Day,
  records: z
    .array(z.object({ studentId: z.uuid(), status: z.enum(['present', 'absent', 'late', 'excused']) }))
    .min(1)
    .max(500),
});

const HomeworkBody = z.object({
  sectionId: z.uuid(),
  subjectId: z.uuid(),
  title: z.string().trim().min(1).max(200),
  instructions: z.string().trim().max(5000).optional(),
  dueOn: Day,
  boardSessionId: z.uuid().optional(),
});

/** The signed-in user's profile. Used by every app after login. */
@Controller('v1/me')
export class MeController {
  constructor(private readonly db: DbService) {}

  @Get()
  @Auth('user')
  me(@CurrentPrincipal() p: UserPrincipal): Promise<MeResponse> {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [u] = await tx.select().from(users).where(eq(users.id, p.userId));
      if (!u) throw new NotFoundException('User not found');
      const roles = await tx.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, u.id));
      const [tenant] = await tx.select({ name: tenants.name, slug: tenants.slug }).from(tenants);
      return {
        id: u.id,
        fullName: u.fullName,
        email: u.email,
        phone: u.phone,
        preferredLanguage: u.preferredLanguage,
        roles: [...new Set(roles.map((r) => r.role as RoleName))],
        tenant,
      };
    });
  }
}

/** Teacher App: the signed-in teacher's own day, classes, board session and homework. */
@Controller('v1/teacher')
export class TeacherController {
  constructor(
    private readonly db: DbService,
    private readonly teacher: TeacherService,
    private readonly sessions: SessionsService,
    private readonly clock: Clock,
  ) {}

  @Get('timetable')
  @Auth('user', TEACHING_ROLES)
  timetable(@CurrentPrincipal() p: UserPrincipal, @Query('date') date?: string): Promise<TeacherTimetableResponse> {
    return this.db.withTenant(p.tenantId, (tx) => this.teacher.timetableFor(tx, p.userId, date || undefined));
  }

  /** Distinct class + subject pairs from the teacher's timetable (for pickers such as homework). */
  @Get('classes')
  @Auth('user', TEACHING_ROLES)
  classes(@CurrentPrincipal() p: UserPrincipal): Promise<TeacherClass[]> {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .selectDistinct({
          section: { id: sections.id, displayName: sections.displayName },
          subject: { id: subjects.id, code: subjects.code, name: subjects.name },
        })
        .from(timetableSlots)
        .innerJoin(sections, eq(sections.id, timetableSlots.sectionId))
        .innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
        .where(eq(timetableSlots.teacherId, p.userId))
        .orderBy(asc(sections.displayName), asc(subjects.name)),
    );
  }

  /** The teacher's active board session, so the app can show "Connected" and End class. */
  @Get('session')
  @Auth('user', TEACHING_ROLES)
  session(@CurrentPrincipal() p: UserPrincipal): Promise<ActiveBoardSession> {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx
        .select({ id: boardSessions.id, board: { id: devices.id, name: devices.name } })
        .from(boardSessions)
        .innerJoin(devices, eq(devices.id, boardSessions.deviceId))
        .where(and(eq(boardSessions.teacherId, p.userId), isNull(boardSessions.endedAt), gt(boardSessions.expiresAt, this.clock.now())))
        .orderBy(desc(boardSessions.startedAt))
        .limit(1);
      if (!row) return { active: null };
      return { active: { board: row.board, session: await this.sessions.context(tx, row.id) } };
    });
  }

  /** Homework this teacher set recently, newest first. */
  @Get('homework')
  @Auth('user', TEACHING_ROLES)
  homework(@CurrentPrincipal() p: UserPrincipal): Promise<Homework[]> {
    return this.db.withTenant(p.tenantId, (tx) => this.teacher.homeworkList(tx, eq(homework.createdBy, p.userId), 'created'));
  }
}

@Controller('v1/sections')
export class SectionsController {
  constructor(
    private readonly db: DbService,
    private readonly teacher: TeacherService,
    private readonly sessions: SessionsService,
  ) {}

  /** Students in a class. Only for teachers timetabled for it, principals and admins. */
  @Get(':id/roster')
  @Auth('user', CLASS_ROLES)
  roster(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string): Promise<RosterStudent[]> {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.teacher.assertCanSeeSection(tx, p, id);
      return this.sessions.roster(tx, id);
    });
  }
}

@Controller('v1/attendance')
export class AttendanceController {
  constructor(
    private readonly db: DbService,
    private readonly teacher: TeacherService,
    private readonly clock: Clock,
    private readonly notifications: NotificationsService,
  ) {}

  /** Marks already recorded for a period on a date (to reload the sheet). */
  @Get()
  @Auth('user', CLASS_ROLES)
  get(@CurrentPrincipal() p: UserPrincipal, @Query('slotId', ParseUUIDPipe) slotId: string, @Query('date') date: string): Promise<AttendanceSheet> {
    const day = parseDate(date);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [slot] = await tx.select().from(timetableSlots).where(eq(timetableSlots.id, slotId));
      if (!slot) throw new NotFoundException('Period not found');
      await this.teacher.assertCanSeeSection(tx, p, slot.sectionId);
      return this.teacher.attendanceSheet(tx, slotId, day);
    });
  }

  /**
   * Records attendance for one period. Upserts per student with the same last-writer-wins rule
   * as the board's sync outbox, so a mark made later on the board is not overwritten.
   */
  @Post()
  @Auth('user', CLASS_ROLES)
  submit(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(AttendanceBody)) body: z.infer<typeof AttendanceBody>): Promise<AttendanceSheet> {
    const day = parseDate(body.date);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const slot = await this.teacher.slotFor(tx, p, body.slotId);
      if (isoWeekday(day) !== slot.dayOfWeek) throw new BadRequestException('This period is not on that day');
      const now = await this.teacher.localNow(tx);
      if (day > now.date) throw new BadRequestException('Attendance cannot be taken for a future date');

      // One mark per student; the last one in the list wins.
      const marks = new Map(body.records.map((r) => [r.studentId, r.status]));
      // FKs bypass RLS: confirm every student under RLS and in this period's class.
      const valid = await this.teacher.studentsInSection(tx, slot.sectionId, [...marks.keys()]);
      const strangers = [...marks.keys()].filter((id) => !valid.has(id));
      if (strangers.length) throw new BadRequestException({ message: 'Some students are not in this class', studentIds: strangers });

      const occurredAt = this.clock.now();
      for (const [studentId, status] of marks) {
        await tx
          .insert(attendanceRecords)
          .values({ tenantId: p.tenantId, studentId, sectionId: slot.sectionId, date: day, timetableSlotId: slot.id, status, markedBy: p.userId, occurredAt })
          .onConflictDoUpdate({
            target: [attendanceRecords.studentId, attendanceRecords.date, attendanceRecords.timetableSlotId],
            set: { status, markedBy: p.userId, occurredAt, updatedAt: new Date() },
            setWhere: sql`${attendanceRecords.occurredAt} <= excluded.occurred_at`,
          });
      }
      await this.notifications.attendanceChanged(tx, slot.id, day, [...marks.keys()]);
      await audit(tx, {
        tenantId: p.tenantId,
        actorType: 'user',
        actorId: p.userId,
        action: 'attendance.submitted',
        subjectType: 'timetable_slot',
        subjectId: slot.id,
        data: { date: day, count: marks.size },
      });
      return this.teacher.attendanceSheet(tx, slot.id, day);
    });
  }
}

@Controller('v1/homework')
export class HomeworkController {
  constructor(
    private readonly db: DbService,
    private readonly teacher: TeacherService,
    private readonly notifications: NotificationsService,
  ) {}

  @Post()
  @Auth('user', TEACHING_ROLES)
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(HomeworkBody)) body: z.infer<typeof HomeworkBody>): Promise<Homework> {
    const dueOn = parseDate(body.dueOn, 'dueOn');
    return this.db.withTenant(p.tenantId, async (tx) => {
      // Every referenced id is looked up under RLS first: FKs alone would accept another tenant's ids.
      const section = await this.teacher.section(tx, body.sectionId);
      if (!(await this.teacher.teachesSection(tx, p.userId, section.id)) && !isSchoolAdmin(p)) {
        throw new ForbiddenException('You do not teach this class');
      }
      const [subject] = await tx.select().from(subjects).where(eq(subjects.id, body.subjectId));
      if (!subject || subject.programId !== section.programId || subject.term !== section.term) {
        throw new BadRequestException('That subject is not taught in this class');
      }
      if (body.boardSessionId) {
        const [s] = await tx.select({ teacherId: boardSessions.teacherId }).from(boardSessions).where(eq(boardSessions.id, body.boardSessionId));
        if (!s || s.teacherId !== p.userId) throw new BadRequestException('Board session not found');
      }
      const now = await this.teacher.localNow(tx);
      if (dueOn < now.date) throw new BadRequestException('The due date has already passed');

      const [hw] = await tx
        .insert(homework)
        .values({
          tenantId: p.tenantId,
          sectionId: section.id,
          subjectId: subject.id,
          createdBy: p.userId,
          boardSessionId: body.boardSessionId,
          title: body.title,
          instructions: body.instructions ?? '',
          dueOn,
        })
        .returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'homework.created', subjectType: 'homework', subjectId: hw.id });
      await this.notifications.homeworkCreated(tx, { id: hw.id, sectionId: section.id, title: hw.title, dueOn: hw.dueOn, subjectName: subject.name });
      const [created] = await this.teacher.homeworkList(tx, eq(homework.id, hw.id), 'created');
      return created;
    });
  }

  /** Homework set for a class, latest due date first. */
  @Get()
  @Auth('user', CLASS_ROLES)
  list(@CurrentPrincipal() p: UserPrincipal, @Query('sectionId', ParseUUIDPipe) sectionId: string): Promise<Homework[]> {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.teacher.assertCanSeeSection(tx, p, sectionId);
      return this.teacher.homeworkList(tx, eq(homework.sectionId, sectionId), 'due');
    });
  }
}
