import { DocumentEngine } from '../documents/document-engine.service.js';
import { studentBlock } from '../documents/doc-data.js';
import { longDate } from '../documents/render.js';
import { Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Day, orConflict } from '../common/ops.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { clubActivities, clubActivityAttendance, clubMembers, clubs, students } from '../db/schema.js';
import { found, hasRole } from '../placements/placements.access.js';
import { FAMILY, LIFE_STAFF } from './campus-life.access.js';
import { CampusLifeService } from './campus-life.service.js';

const CATEGORIES = ['academic', 'cultural', 'sports', 'service', 'technical', 'general'] as const;
const ClubBody = z.object({ name: z.string().trim().min(2).max(120), category: z.enum(CATEGORIES).default('general'), description: z.string().trim().max(2000).default(''), facultyCoordinatorId: z.uuid().nullable().optional() });
const ClubPatch = z.object({ name: z.string().trim().min(2).max(120), category: z.enum(CATEGORIES), description: z.string().trim().max(2000), facultyCoordinatorId: z.uuid().nullable(), active: z.boolean() }).partial();
const JoinBody = z.object({ studentId: z.uuid().optional() });
const AddMemberBody = z.object({ studentId: z.uuid(), role: z.enum(['member', 'lead']).default('member') });
const DecisionBody = z.object({ decision: z.enum(['approve', 'reject']), role: z.enum(['member', 'lead']).optional() });
const RoleBody = z.object({ role: z.enum(['member', 'lead']) });
const ActivityBody = z.object({ title: z.string().trim().min(2).max(160), description: z.string().trim().max(2000).default(''), activityOn: Day, points: z.number().int().min(0).max(1000).default(0) });
const AttendanceBody = z.object({ studentIds: z.array(z.uuid()).min(1).max(500) });

/** Clubs and associations: the master, membership requests, activities with attendance and points, and participation certificates. */
@Controller('v1/campus-life')
export class ClubsController {
  constructor(
    private readonly db: DbService,
    private readonly svc: CampusLifeService,
    private readonly engine: DocumentEngine,
  ) {}

  // ---- staff: club master ------------------------------------------------------------------

  @Post('clubs')
  @Auth('user', LIFE_STAFF)
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ClubBody)) b: z.infer<typeof ClubBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await orConflict('A club with this name already exists', () => tx.insert(clubs).values({ tenantId: p.tenantId, ...b, facultyCoordinatorId: b.facultyCoordinatorId ?? null }).returning());
      await auditUser(tx, p, 'club.created', 'club', row.id, { name: b.name });
      return row;
    });
  }

  @Patch('clubs/:id')
  @Auth('user', LIFE_STAFF)
  update(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ClubPatch)) b: z.infer<typeof ClubPatch>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await orConflict('A club with this name already exists', () => tx.update(clubs).set(b).where(eq(clubs.id, id)).returning());
      found(row, 'Club');
      await auditUser(tx, p, 'club.updated', 'club', id, b);
      return row;
    });
  }

  /** Every club with its member count and the requests waiting. */
  @Get('clubs')
  @Auth('user', LIFE_STAFF)
  list(@CurrentPrincipal() p: UserPrincipal, @Query('category') category?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select().from(clubs).where(category ? eq(clubs.category, category) : undefined).orderBy(asc(clubs.name));
      const counts = await tx.select({ clubId: clubMembers.clubId, status: clubMembers.status, n: sql<number>`count(*)::int` }).from(clubMembers).groupBy(clubMembers.clubId, clubMembers.status);
      return rows.map((c) => ({ ...c, members: counts.find((x) => x.clubId === c.id && x.status === 'active')?.n ?? 0, pending: counts.find((x) => x.clubId === c.id && x.status === 'requested')?.n ?? 0 }));
    });
  }

  // ---- staff: membership -------------------------------------------------------------------

  @Get('clubs/:id/members')
  @Auth('user', LIFE_STAFF)
  members(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Query('status') status?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ m: clubMembers, fullName: students.fullName, rollNo: students.rollNo })
        .from(clubMembers)
        .innerJoin(students, eq(students.id, clubMembers.studentId))
        .where(and(eq(clubMembers.clubId, id), status ? eq(clubMembers.status, status) : undefined))
        .orderBy(asc(students.fullName));
      const points = await this.pointsByStudent(tx, id);
      return rows.map((r) => ({ ...r.m, fullName: r.fullName, rollNo: r.rollNo, points: points.get(r.m.studentId) ?? 0 }));
    });
  }

  /** The coordinator adds a student directly, without a request. */
  @Post('clubs/:id/members')
  @Auth('user', LIFE_STAFF)
  addMember(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(AddMemberBody)) b: z.infer<typeof AddMemberBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      found((await tx.select().from(clubs).where(eq(clubs.id, id)))[0], 'Club');
      found((await tx.select({ id: students.id }).from(students).where(eq(students.id, b.studentId)))[0], 'Student');
      const [row] = await tx
        .insert(clubMembers)
        .values({ tenantId: p.tenantId, clubId: id, studentId: b.studentId, role: b.role, status: 'active', decidedBy: p.userId, decidedAt: this.svc.now() })
        .onConflictDoUpdate({ target: [clubMembers.clubId, clubMembers.studentId], set: { status: 'active', role: b.role, decidedBy: p.userId, decidedAt: this.svc.now() } })
        .returning();
      await auditUser(tx, p, 'club.member_added', 'club', id, { studentId: b.studentId });
      return row;
    });
  }

  /** Approve or reject a join request. */
  @Post('clubs/:id/members/:memberId/decision')
  @Auth('user', LIFE_STAFF)
  @HttpCode(200)
  decide(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('memberId', ParseUUIDPipe) memberId: string, @Body(new ZodBody(DecisionBody)) b: z.infer<typeof DecisionBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cur = found((await tx.select().from(clubMembers).where(and(eq(clubMembers.id, memberId), eq(clubMembers.clubId, id))).for('update'))[0], 'Membership request');
      if (cur.status !== 'requested') throw new ConflictException(`This request is already ${cur.status}`);
      const [row] = await tx.update(clubMembers).set({ status: b.decision === 'approve' ? 'active' : 'rejected', role: b.role ?? cur.role, decidedBy: p.userId, decidedAt: this.svc.now() }).where(eq(clubMembers.id, memberId)).returning();
      await auditUser(tx, p, `club.member_${row.status}`, 'club', id, { studentId: cur.studentId });
      return row;
    });
  }

  /** Make a member a student lead (or back to a plain member). */
  @Patch('clubs/:id/members/:memberId')
  @Auth('user', LIFE_STAFF)
  setRole(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('memberId', ParseUUIDPipe) memberId: string, @Body(new ZodBody(RoleBody)) b: z.infer<typeof RoleBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(clubMembers).set({ role: b.role }).where(and(eq(clubMembers.id, memberId), eq(clubMembers.clubId, id), eq(clubMembers.status, 'active'))).returning();
      found(row, 'Member');
      await auditUser(tx, p, 'club.member_role', 'club', id, { studentId: row.studentId, role: b.role });
      return row;
    });
  }

  // ---- staff: activities, attendance, points -----------------------------------------------

  @Post('clubs/:id/activities')
  @Auth('user', LIFE_STAFF)
  addActivity(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ActivityBody)) b: z.infer<typeof ActivityBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      found((await tx.select().from(clubs).where(eq(clubs.id, id)))[0], 'Club');
      const [row] = await tx.insert(clubActivities).values({ tenantId: p.tenantId, clubId: id, createdBy: p.userId, ...b }).returning();
      await auditUser(tx, p, 'club.activity_created', 'club', id, { activityId: row.id, title: b.title });
      return row;
    });
  }

  @Get('clubs/:id/activities')
  @Auth('user', LIFE_STAFF)
  activities(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select().from(clubActivities).where(eq(clubActivities.clubId, id)).orderBy(desc(clubActivities.activityOn));
      const att = rows.length ? await tx.select({ activityId: clubActivityAttendance.activityId, n: sql<number>`count(*)::int` }).from(clubActivityAttendance).where(inArray(clubActivityAttendance.activityId, rows.map((r) => r.id))).groupBy(clubActivityAttendance.activityId) : [];
      return rows.map((a) => ({ ...a, attended: att.find((x) => x.activityId === a.id)?.n ?? 0 }));
    });
  }

  /** Marks who attended and gives each the activity's points. Only active members can attend; marking twice changes nothing. */
  @Post('activities/:activityId/attendance')
  @Auth('user', LIFE_STAFF)
  @HttpCode(200)
  attendance(@CurrentPrincipal() p: UserPrincipal, @Param('activityId', ParseUUIDPipe) activityId: string, @Body(new ZodBody(AttendanceBody)) b: z.infer<typeof AttendanceBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const act = found((await tx.select().from(clubActivities).where(eq(clubActivities.id, activityId)))[0], 'Activity');
      const active = await tx.select({ studentId: clubMembers.studentId }).from(clubMembers).where(and(eq(clubMembers.clubId, act.clubId), eq(clubMembers.status, 'active'), inArray(clubMembers.studentId, b.studentIds)));
      const ok = new Set(active.map((r) => r.studentId));
      const skipped = b.studentIds.filter((s) => !ok.has(s));
      let marked = 0;
      if (ok.size) {
        const ins = await tx.insert(clubActivityAttendance).values([...ok].map((studentId) => ({ tenantId: p.tenantId, activityId, studentId, points: act.points }))).onConflictDoNothing().returning({ id: clubActivityAttendance.id });
        marked = ins.length;
      }
      await auditUser(tx, p, 'club.attendance_marked', 'club', act.clubId, { activityId, marked });
      return { marked, skipped };
    });
  }

  /** The club's points table, highest first. */
  @Get('clubs/:id/points')
  @Auth('user', LIFE_STAFF)
  points(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ studentId: clubActivityAttendance.studentId, fullName: students.fullName, rollNo: students.rollNo, points: sql<number>`sum(${clubActivityAttendance.points})::int`, activities: sql<number>`count(*)::int` })
        .from(clubActivityAttendance)
        .innerJoin(clubActivities, eq(clubActivities.id, clubActivityAttendance.activityId))
        .innerJoin(students, eq(students.id, clubActivityAttendance.studentId))
        .where(eq(clubActivities.clubId, id))
        .groupBy(clubActivityAttendance.studentId, students.fullName, students.rollNo)
        .orderBy(desc(sql`sum(${clubActivityAttendance.points})`), asc(students.fullName)),
    );
  }

  /** A participation certificate (PDF) for a member who attended at least one activity; staff or the student's family. */
  @Get('clubs/:id/members/:studentId/certificate')
  @Auth('user')
  async certificate(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('studentId', ParseUUIDPipe) studentId: string, @Res() res: Response) {
    const buf = await this.db.withTenant(p.tenantId, async (tx) => {
      if (!hasRole(p, LIFE_STAFF)) {
        if (!hasRole(p, FAMILY) || !(await this.svc.familyStudents(tx, p)).includes(studentId)) throw new ForbiddenException('Not allowed');
      }
      const club = found((await tx.select().from(clubs).where(eq(clubs.id, id)))[0], 'Club');
      const member = (await tx.select().from(clubMembers).where(and(eq(clubMembers.clubId, id), eq(clubMembers.studentId, studentId), eq(clubMembers.status, 'active'))))[0];
      if (!member) throw new NotFoundException('This student is not an active member');
      const stu = found((await tx.select({ fullName: students.fullName, rollNo: students.rollNo }).from(students).where(eq(students.id, studentId)))[0], 'Student');
      const att = await tx
        .select({ title: clubActivities.title, on: clubActivities.activityOn, points: clubActivityAttendance.points })
        .from(clubActivityAttendance)
        .innerJoin(clubActivities, eq(clubActivities.id, clubActivityAttendance.activityId))
        .where(and(eq(clubActivities.clubId, id), eq(clubActivityAttendance.studentId, studentId)))
        .orderBy(asc(clubActivities.activityOn));
      if (att.length === 0) throw new ConflictException('The student has not attended any activity yet');
      await auditUser(tx, p, 'club.certificate_issued', 'club', id, { studentId });
      const points = att.reduce((s, a) => s + a.points, 0);
      const role = member.role === 'lead' ? 'student lead' : 'member';
      const citation = `for taking part, as a ${role} of the **${club.name}**, in ${att.length} activit${att.length === 1 ? 'y' : 'ies'} and earning **${points} activity points**.`;
      const out = await this.engine.produce(tx, p, {
        docType: 'generic_certificate',
        title: 'Certificate of Participation',
        subject: { type: 'student', id: studentId, name: stu.fullName },
        source: { type: 'club_certificate', id: `${id}:${studentId}` },
        data: { ...(await studentBlock(tx, studentId)), award: { title: 'Certificate of Participation', kind: 'Participation', recipient: stu.fullName, citation, event: club.name, date: longDate(this.svc.now().toISOString().slice(0, 10)), position: role } },
        keyFields: [{ label: 'Awarded to', value: `${stu.fullName} (${stu.rollNo})` }, { label: 'Club', value: club.name }, { label: 'Activities', value: String(att.length) }, { label: 'Points', value: String(points) }],
        photo: null,
      });
      return out.pdf;
    });
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', `inline; filename="club-certificate-${studentId.slice(0, 8)}.pdf"`);
    res.end(buf);
  }

  // ---- Student App -------------------------------------------------------------------------

  /** Active clubs with this student's membership status and points. */
  @Get('me/clubs')
  @Auth('user', FAMILY)
  myClubs(@CurrentPrincipal() p: UserPrincipal, @Query('studentId') studentId?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const sid = await this.svc.actingStudent(tx, p, studentId);
      const rows = await tx.select().from(clubs).where(eq(clubs.active, true)).orderBy(asc(clubs.name));
      const mine = await tx.select().from(clubMembers).where(eq(clubMembers.studentId, sid));
      const pts = await tx.select({ clubId: clubActivities.clubId, points: sql<number>`sum(${clubActivityAttendance.points})::int` }).from(clubActivityAttendance).innerJoin(clubActivities, eq(clubActivities.id, clubActivityAttendance.activityId)).where(eq(clubActivityAttendance.studentId, sid)).groupBy(clubActivities.clubId);
      return rows.map((c) => {
        const m = mine.find((x) => x.clubId === c.id);
        return { id: c.id, name: c.name, category: c.category, description: c.description, membership: m ? { status: m.status, role: m.role } : null, points: pts.find((x) => x.clubId === c.id)?.points ?? 0 };
      });
    });
  }

  /** Asks to join a club; a coordinator approves. */
  @Post('clubs/:id/join')
  @Auth('user', FAMILY)
  join(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(JoinBody)) b: z.infer<typeof JoinBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const sid = await this.svc.actingStudent(tx, p, b.studentId);
      const club = found((await tx.select().from(clubs).where(eq(clubs.id, id)))[0], 'Club');
      if (!club.active) throw new ConflictException('This club is closed');
      const cur = (await tx.select().from(clubMembers).where(and(eq(clubMembers.clubId, id), eq(clubMembers.studentId, sid))).for('update'))[0];
      if (cur && cur.status !== 'left' && cur.status !== 'rejected') throw new ConflictException(cur.status === 'active' ? 'Already a member' : 'A request is already waiting');
      const [row] = cur
        ? await tx.update(clubMembers).set({ status: 'requested', role: 'member', decidedBy: null, decidedAt: null }).where(eq(clubMembers.id, cur.id)).returning()
        : await tx.insert(clubMembers).values({ tenantId: p.tenantId, clubId: id, studentId: sid }).returning();
      await auditUser(tx, p, 'club.join_requested', 'club', id, { studentId: sid });
      return row;
    });
  }

  @Post('clubs/:id/leave')
  @Auth('user', FAMILY)
  @HttpCode(200)
  leave(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(JoinBody)) b: z.infer<typeof JoinBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const sid = await this.svc.actingStudent(tx, p, b.studentId);
      const [row] = await tx.update(clubMembers).set({ status: 'left' }).where(and(eq(clubMembers.clubId, id), eq(clubMembers.studentId, sid), inArray(clubMembers.status, ['requested', 'active']))).returning();
      found(row, 'Membership');
      await auditUser(tx, p, 'club.left', 'club', id, { studentId: sid });
      return row;
    });
  }

  private async pointsByStudent(tx: Tx, clubId: string) {
    const rows = await tx.select({ studentId: clubActivityAttendance.studentId, points: sql<number>`sum(${clubActivityAttendance.points})::int` }).from(clubActivityAttendance).innerJoin(clubActivities, eq(clubActivities.id, clubActivityAttendance.activityId)).where(eq(clubActivities.clubId, clubId)).groupBy(clubActivityAttendance.studentId);
    return new Map(rows.map((r) => [r.studentId, r.points]));
  }
}
