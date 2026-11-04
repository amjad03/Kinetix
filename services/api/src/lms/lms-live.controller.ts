import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { Clock, localParts } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { attendanceRecords, lmsCourses, students, subjects, tenants, timetableSlots } from '../db/schema.js';
import { LIVE_PROVIDERS, type LiveProvider, lmsLiveJoins, lmsLiveSessions } from '../db/schema-lms.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { lmsSettingsOf, lmsTexts } from './lms-settings.js';
import { LMS_STAFF, LmsService } from './lms.service.js';

const JoinUrl = z.url().max(500).refine((u) => /^https:\/\//i.test(u), 'Use the https:// link of the meeting');
const SessionBody = z.object({ title: z.string().trim().min(3).max(160), startsAt: z.coerce.date(), durationMin: z.number().int().min(5).max(600), joinUrl: JoinUrl, provider: z.enum(LIVE_PROVIDERS).optional(), slotId: z.uuid().nullable().optional(), notify: z.boolean().default(true) });
const SessionPatch = z.object({ title: z.string().trim().min(3).max(160).optional(), startsAt: z.coerce.date().optional(), durationMin: z.number().int().min(5).max(600).optional(), joinUrl: JoinUrl.optional(), recordingUrl: JoinUrl.nullable().optional(), status: z.enum(['scheduled', 'cancelled']).optional() }).strict();
const AttendanceBody = z.object({ entries: z.array(z.object({ studentId: z.uuid(), status: z.enum(['present', 'absent', 'late', 'excused']) })).min(1).max(500) });
/** Students may open the link from this long before the start until the end. */
const EARLY_MS = 15 * 60_000;

/** Meet, Zoom, Teams, Jitsi or Webex from the link's host; anything else is "other". */
export function providerOf(url: string): LiveProvider {
  const h = new URL(url).hostname.toLowerCase();
  if (h === 'meet.google.com') return 'meet';
  if (h.endsWith('zoom.us') || h.endsWith('zoom.com')) return 'zoom';
  if (h.endsWith('teams.microsoft.com') || h.endsWith('teams.live.com')) return 'teams';
  if (h.includes('jitsi') || h === 'meet.jit.si') return 'jitsi';
  if (h.endsWith('webex.com')) return 'webex';
  return 'other';
}

/** Suggested attendance from a student's first join: absent without one, late after the grace minutes. */
export function joinStatus(firstJoinedAt: Date | null, startsAt: Date, lateAfterMin: number): 'present' | 'late' | 'absent' {
  if (!firstJoinedAt) return 'absent';
  return firstJoinedAt.getTime() > startsAt.getTime() + lateAfterMin * 60_000 ? 'late' : 'present';
}

/**
 * Live classes of a course on any meeting service: the teacher posts the link, students and families see what is
 * coming, a student joins through ZYNETIX (the join is recorded, then the meeting opens), and the joins become the
 * period's attendance once the teacher confirms them.
 */
@Controller('v1/lms')
export class LmsLiveController {
  constructor(
    private readonly db: DbService,
    private readonly lms: LmsService,
    private readonly clock: Clock,
    private readonly notifications: NotificationsService,
  ) {}

  private async session(tx: Tx, id: string) {
    const [s] = await tx.select().from(lmsLiveSessions).where(eq(lmsLiveSessions.id, id));
    if (!s) throw new NotFoundException('Live class not found');
    return { s, course: await this.lms.course(tx, s.courseId) };
  }

  @Post('courses/:id/live')
  @Auth('user', [...LMS_STAFF])
  create(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(SessionBody)) b: z.infer<typeof SessionBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const c = await this.lms.course(tx, id);
      await this.lms.assertManage(tx, p, c);
      if (b.slotId) {
        const [slot] = await tx.select({ id: timetableSlots.id }).from(timetableSlots).where(and(eq(timetableSlots.id, b.slotId), eq(timetableSlots.sectionId, c.sectionId), eq(timetableSlots.subjectId, c.subjectId)));
        if (!slot) throw new BadRequestException('That period is not this class and subject');
      }
      const [row] = await tx.insert(lmsLiveSessions).values({ tenantId: p.tenantId, courseId: id, title: b.title, startsAt: b.startsAt, durationMin: b.durationMin, joinUrl: b.joinUrl, provider: b.provider ?? providerOf(b.joinUrl), slotId: b.slotId ?? null, createdBy: p.userId }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'lms.live_scheduled', subjectType: 'lms_course', subjectId: id, data: { sessionId: row.id, startsAt: row.startsAt, provider: row.provider } });
      if (b.notify && c.status === 'published') await this.tell(tx, c, row);
      return row;
    });
  }

  private async tell(tx: Tx, c: typeof lmsCourses.$inferSelect, s: typeof lmsLiveSessions.$inferSelect) {
    const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
    const lp = localParts(s.startsAt, t?.tz ?? 'Asia/Kolkata');
    const users = await tx.execute<{ u: string }>(
      // The class and their families.
      sql`select s.user_id as u from students s where s.section_id = ${c.sectionId}::uuid and s.status = 'active' and s.user_id is not null
          union select g.user_id from guardians g join students s on s.id = g.student_id where s.section_id = ${c.sectionId}::uuid and s.status = 'active'`,
    );
    await this.notifications.notifyUsers(tx, users.rows.map((r) => r.u), { kind: 'calendar', text: lmsTexts.liveScheduled({ title: s.title, course: c.title, when: `${lp.date} ${lp.time}` }), data: { liveSessionId: s.id, courseId: c.id }, dedupeKey: `lms-live:${s.id}:${s.startsAt.toISOString()}` });
  }

  /** A course's live classes: staff see all with join counts; the class sees scheduled ones (without the link until it opens). */
  @Get('courses/:id/live')
  @Auth('user')
  list(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const c = await this.lms.course(tx, id);
      const manage = await this.lms.canManage(tx, p, c);
      if (!manage) {
        const kid = (await this.lms.familyStudents(tx, p)).find((s) => s.sectionId === c.sectionId);
        if (!kid || c.status !== 'published') throw new NotFoundException('Course not found');
      }
      const rows = await tx.select().from(lmsLiveSessions).where(eq(lmsLiveSessions.courseId, id)).orderBy(asc(lmsLiveSessions.startsAt)).limit(300);
      const joins = rows.length ? await tx.select({ sessionId: lmsLiveJoins.sessionId, studentId: lmsLiveJoins.studentId }).from(lmsLiveJoins).where(inArray(lmsLiveJoins.sessionId, rows.map((r) => r.id))) : [];
      const now = this.clock.now();
      return rows
        .filter((r) => manage || r.status === 'scheduled' || r.startsAt > new Date(now.getTime() - 7 * 86_400_000))
        .map((r) => ({ ...r, joinUrl: manage ? r.joinUrl : null, joined: joins.filter((j) => j.sessionId === r.id).length, open: r.status === 'scheduled' && now.getTime() >= r.startsAt.getTime() - EARLY_MS && now.getTime() <= r.startsAt.getTime() + r.durationMin * 60_000 }));
    });
  }

  @Patch('live/:id')
  @Auth('user', [...LMS_STAFF])
  update(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(SessionPatch)) b: z.infer<typeof SessionPatch>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { s, course } = await this.session(tx, id);
      await this.lms.assertManage(tx, p, course);
      if (!Object.keys(b).length) throw new BadRequestException('Nothing to change');
      const [row] = await tx.update(lmsLiveSessions).set({ ...b, ...(b.joinUrl ? { provider: providerOf(b.joinUrl) } : {}) }).where(eq(lmsLiveSessions.id, id)).returning();
      const keys = Object.keys(b) as (keyof typeof b)[];
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: b.status === 'cancelled' ? 'lms.live_cancelled' : 'lms.live_updated', subjectType: 'lms_course', subjectId: course.id, before: Object.fromEntries(keys.map((k) => [k, s[k]])), after: Object.fromEntries(keys.map((k) => [k, row[k]])), data: { sessionId: id } });
      if (b.startsAt && course.status === 'published' && row.status === 'scheduled') await this.tell(tx, course, row);
      return row;
    });
  }

  /** The student joins: the join is recorded (first and last time, how many times) and the meeting link is returned. */
  @Post('live/:id/join')
  @Auth('user', ['student'])
  @HttpCode(200)
  join(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { s, course } = await this.session(tx, id);
      const [stu] = await tx.select({ id: students.id, sectionId: students.sectionId }).from(students).where(eq(students.userId, p.userId));
      if (!stu || stu.sectionId !== course.sectionId || course.status !== 'published') throw new NotFoundException('Live class not found');
      if (s.status === 'cancelled') throw new ConflictException('This live class was cancelled');
      const now = this.clock.now();
      if (now.getTime() < s.startsAt.getTime() - EARLY_MS) throw new ConflictException('The class opens 15 minutes before it starts');
      if (now.getTime() > s.startsAt.getTime() + s.durationMin * 60_000) throw new ConflictException('This live class has ended');
      await tx
        .insert(lmsLiveJoins)
        .values({ tenantId: p.tenantId, sessionId: id, studentId: stu.id, firstJoinedAt: now, lastJoinedAt: now })
        .onConflictDoUpdate({ target: [lmsLiveJoins.sessionId, lmsLiveJoins.studentId], set: { lastJoinedAt: now, joins: sql`${lmsLiveJoins.joins} + 1` } });
      return { joinUrl: s.joinUrl, provider: s.provider };
    });
  }

  /** Suggested attendance from the joins: present, late after the grace minutes (LMS settings), absent without a join. */
  @Get('live/:id/attendance')
  @Auth('user', [...LMS_STAFF])
  attendance(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { s, course } = await this.session(tx, id);
      await this.lms.assertManage(tx, p, course);
      const late = (await lmsSettingsOf(tx, p.tenantId)).liveLateAfterMin;
      const roster = await tx.select({ id: students.id, fullName: students.fullName, rollNo: students.rollNo }).from(students).where(and(eq(students.sectionId, course.sectionId), eq(students.status, 'active'))).orderBy(asc(students.rollNo));
      const joins = await tx.select().from(lmsLiveJoins).where(eq(lmsLiveJoins.sessionId, id));
      return {
        sessionId: id,
        slotId: s.slotId,
        attendanceMarkedAt: s.attendanceMarkedAt,
        lateAfterMin: late,
        rows: roster.map((r) => {
          const j = joins.find((x) => x.studentId === r.id);
          return { ...r, firstJoinedAt: j?.firstJoinedAt ?? null, joins: j?.joins ?? 0, suggested: joinStatus(j?.firstJoinedAt ?? null, s.startsAt, late) };
        }),
      };
    });
  }

  /** The teacher's decision, written to the class's attendance for the period this live class stands for. */
  @Post('live/:id/attendance')
  @Auth('user', [...LMS_STAFF])
  @HttpCode(200)
  confirm(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(AttendanceBody)) b: z.infer<typeof AttendanceBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { s, course } = await this.session(tx, id);
      await this.lms.assertManage(tx, p, course);
      if (!s.slotId) throw new BadRequestException('Link the live class to its timetable period to take attendance');
      if (s.status === 'cancelled') throw new ConflictException('This live class was cancelled');
      if (this.clock.now() < s.startsAt) throw new ConflictException('The class has not started yet');
      const [tenant] = await tx.select({ timezone: tenants.timezone }).from(tenants);
      const date = localParts(s.startsAt, tenant?.timezone ?? 'Asia/Kolkata').date;
      const ids = b.entries.map((e) => e.studentId);
      const roster = new Set((await tx.select({ id: students.id }).from(students).where(and(eq(students.sectionId, course.sectionId), inArray(students.id, ids)))).map((x) => x.id));
      if (ids.some((x) => !roster.has(x))) throw new BadRequestException('A student is not in this class');
      const now = this.clock.now();
      await tx
        .insert(attendanceRecords)
        .values(b.entries.map((e) => ({ tenantId: p.tenantId, studentId: e.studentId, sectionId: course.sectionId, date, timetableSlotId: s.slotId!, status: e.status, markedBy: p.userId, occurredAt: now })))
        .onConflictDoUpdate({ target: [attendanceRecords.studentId, attendanceRecords.date, attendanceRecords.timetableSlotId], set: { status: sql`excluded.status`, markedBy: p.userId, occurredAt: now, updatedAt: now } });
      await tx.update(lmsLiveSessions).set({ attendanceMarkedAt: now }).where(eq(lmsLiveSessions.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'lms.live_attendance_marked', subjectType: 'lms_course', subjectId: course.id, data: { sessionId: id, date, marked: b.entries.length, present: b.entries.filter((e) => e.status === 'present').length } });
      return { marked: b.entries.length, date };
    });
  }

  /** Live classes of the next week for a student or their child (with the subject), soonest first. */
  @Get('my-live')
  @Auth('user', ['student', 'guardian'])
  mine(@CurrentPrincipal() p: UserPrincipal, @Query('studentId') studentId?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const kid = (await this.lms.familyStudents(tx, p)).find((s) => !studentId || s.id === studentId);
      if (!kid) throw new NotFoundException('Student not found');
      if (studentId && !p.roles.includes('guardian') && kid.userId !== p.userId) throw new ForbiddenException();
      const now = this.clock.now();
      const rows = await tx
        .select({ s: lmsLiveSessions, course: lmsCourses.title, subject: subjects.name })
        .from(lmsLiveSessions)
        .innerJoin(lmsCourses, eq(lmsCourses.id, lmsLiveSessions.courseId))
        .innerJoin(subjects, eq(subjects.id, lmsCourses.subjectId))
        .where(and(eq(lmsCourses.sectionId, kid.sectionId), eq(lmsCourses.status, 'published'), eq(lmsLiveSessions.status, 'scheduled'), gte(lmsLiveSessions.startsAt, new Date(now.getTime() - 10 * 3_600_000)), lte(lmsLiveSessions.startsAt, new Date(now.getTime() + 7 * 86_400_000))))
        .orderBy(asc(lmsLiveSessions.startsAt))
        .limit(100);
      const joined = rows.length ? new Set((await tx.select({ id: lmsLiveJoins.sessionId }).from(lmsLiveJoins).where(and(eq(lmsLiveJoins.studentId, kid.id), inArray(lmsLiveJoins.sessionId, rows.map((r) => r.s.id))))).map((r) => r.id)) : new Set<string>();
      return rows
        .filter((r) => r.s.startsAt.getTime() + r.s.durationMin * 60_000 > now.getTime())
        .map((r) => ({ id: r.s.id, title: r.s.title, course: r.course, subject: r.subject, courseId: r.s.courseId, startsAt: r.s.startsAt, durationMin: r.s.durationMin, provider: r.s.provider, joined: joined.has(r.s.id), open: now.getTime() >= r.s.startsAt.getTime() - EARLY_MS }));
    });
  }
}
