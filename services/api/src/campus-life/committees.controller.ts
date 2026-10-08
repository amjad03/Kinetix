import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Day, orConflict } from '../common/ops.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { committeeActionItems, committeeMeetings, committeeMembers, committees, users } from '../db/schema.js';
import { found, hasRole } from '../placements/placements.access.js';
import { COMMITTEE_STAFF } from './campus-life.access.js';
import { CampusLifeService } from './campus-life.service.js';

const CommitteeBody = z.object({ name: z.string().trim().min(2).max(160), statutory: z.boolean().default(false), description: z.string().trim().max(2000).default('') });
const CommitteePatch = z.object({ name: z.string().trim().min(2).max(160), statutory: z.boolean(), description: z.string().trim().max(2000), active: z.boolean() }).partial();
const MemberBody = z.object({ userId: z.uuid(), role: z.enum(['chair', 'secretary', 'member', 'external']).default('member'), tenureStart: Day, tenureEnd: Day.nullable().optional() });
const MemberPatch = z.object({ role: z.enum(['chair', 'secretary', 'member', 'external']), tenureEnd: Day.nullable() }).partial();
const MeetingBody = z.object({ title: z.string().trim().min(2).max(160), meetingOn: Day, agenda: z.string().trim().max(5000).default('') });
const MeetingPatch = z.object({ title: z.string().trim().min(2).max(160), meetingOn: Day, agenda: z.string().trim().max(5000), minutes: z.string().trim().max(20000), status: z.enum(['scheduled', 'held', 'cancelled']) }).partial();
const ActionBody = z.object({ title: z.string().trim().min(2).max(240), ownerUserId: z.uuid(), dueOn: Day });
const ActionStatus = z.object({ status: z.enum(['open', 'in_progress', 'done', 'dropped']) });

/** Committees (IQAC, anti-ragging, exam, grievance and so on): members with tenure, meetings with agenda and minutes, and action items. */
@Controller('v1/campus-life')
export class CommitteesController {
  constructor(
    private readonly db: DbService,
    private readonly svc: CampusLifeService,
  ) {}

  private today() {
    return this.svc.now().toISOString().slice(0, 10);
  }

  @Post('committees')
  @Auth('user', COMMITTEE_STAFF)
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(CommitteeBody)) b: z.infer<typeof CommitteeBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await orConflict('A committee with this name already exists', () => tx.insert(committees).values({ tenantId: p.tenantId, ...b }).returning());
      await auditUser(tx, p, 'committee.created', 'committee', row.id, { name: b.name, statutory: b.statutory });
      return row;
    });
  }

  @Patch('committees/:id')
  @Auth('user', COMMITTEE_STAFF)
  update(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(CommitteePatch)) b: z.infer<typeof CommitteePatch>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await orConflict('A committee with this name already exists', () => tx.update(committees).set(b).where(eq(committees.id, id)).returning());
      found(row, 'Committee');
      await auditUser(tx, p, 'committee.updated', 'committee', id, b);
      return row;
    });
  }

  /** Each committee with its current member count and open action items. */
  @Get('committees')
  @Auth('user', COMMITTEE_STAFF)
  list(@CurrentPrincipal() p: UserPrincipal, @Query('statutory') statutory?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select().from(committees).where(statutory === undefined ? undefined : eq(committees.statutory, statutory === 'true')).orderBy(desc(committees.statutory), asc(committees.name));
      const today = this.today();
      const mem = await tx.select({ committeeId: committeeMembers.committeeId, n: sql<number>`count(*)::int` }).from(committeeMembers).where(sql`${committeeMembers.tenureStart} <= ${today} and (${committeeMembers.tenureEnd} is null or ${committeeMembers.tenureEnd} >= ${today})`).groupBy(committeeMembers.committeeId);
      const open = await tx.select({ committeeId: committeeActionItems.committeeId, n: sql<number>`count(*)::int` }).from(committeeActionItems).where(inArray(committeeActionItems.status, ['open', 'in_progress'])).groupBy(committeeActionItems.committeeId);
      return rows.map((c) => ({ ...c, members: mem.find((x) => x.committeeId === c.id)?.n ?? 0, openActions: open.find((x) => x.committeeId === c.id)?.n ?? 0 }));
    });
  }

  // ---- members -----------------------------------------------------------------------------

  @Post('committees/:id/members')
  @Auth('user', COMMITTEE_STAFF)
  addMember(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(MemberBody)) b: z.infer<typeof MemberBody>) {
    if (b.tenureEnd && b.tenureEnd < b.tenureStart) throw new BadRequestException('The tenure cannot end before it starts');
    return this.db.withTenant(p.tenantId, async (tx) => {
      found((await tx.select().from(committees).where(eq(committees.id, id)))[0], 'Committee');
      found((await tx.select({ id: users.id }).from(users).where(eq(users.id, b.userId)))[0], 'User');
      const [row] = await tx.insert(committeeMembers).values({ tenantId: p.tenantId, committeeId: id, userId: b.userId, role: b.role, tenureStart: b.tenureStart, tenureEnd: b.tenureEnd ?? null }).returning();
      await auditUser(tx, p, 'committee.member_added', 'committee', id, { userId: b.userId, role: b.role });
      return row;
    });
  }

  /** Change a role or end a tenure. */
  @Patch('committees/:id/members/:memberId')
  @Auth('user', COMMITTEE_STAFF)
  updateMember(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('memberId', ParseUUIDPipe) memberId: string, @Body(new ZodBody(MemberPatch)) b: z.infer<typeof MemberPatch>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cur = found((await tx.select().from(committeeMembers).where(and(eq(committeeMembers.id, memberId), eq(committeeMembers.committeeId, id))))[0], 'Member');
      if (b.tenureEnd && b.tenureEnd < cur.tenureStart) throw new BadRequestException('The tenure cannot end before it starts');
      const [row] = await tx.update(committeeMembers).set(b).where(eq(committeeMembers.id, memberId)).returning();
      await auditUser(tx, p, 'committee.member_updated', 'committee', id, { userId: cur.userId, ...b });
      return row;
    });
  }

  /** Members with names; `current=true` keeps only those whose tenure covers today. */
  @Get('committees/:id/members')
  @Auth('user', COMMITTEE_STAFF)
  members(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Query('current') current?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select({ m: committeeMembers, fullName: users.fullName }).from(committeeMembers).innerJoin(users, eq(users.id, committeeMembers.userId)).where(eq(committeeMembers.committeeId, id)).orderBy(asc(committeeMembers.tenureStart));
      const today = this.today();
      const all = rows.map((r) => ({ ...r.m, fullName: r.fullName, current: r.m.tenureStart <= today && (!r.m.tenureEnd || r.m.tenureEnd >= today) }));
      return current === 'true' ? all.filter((m) => m.current) : all;
    });
  }

  // ---- meetings and minutes ----------------------------------------------------------------

  @Post('committees/:id/meetings')
  @Auth('user', COMMITTEE_STAFF)
  addMeeting(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(MeetingBody)) b: z.infer<typeof MeetingBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      found((await tx.select().from(committees).where(eq(committees.id, id)))[0], 'Committee');
      const [row] = await tx.insert(committeeMeetings).values({ tenantId: p.tenantId, committeeId: id, createdBy: p.userId, ...b }).returning();
      await auditUser(tx, p, 'committee.meeting_scheduled', 'committee', id, { meetingId: row.id, meetingOn: b.meetingOn });
      return row;
    });
  }

  @Get('committees/:id/meetings')
  @Auth('user', COMMITTEE_STAFF)
  meetings(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select().from(committeeMeetings).where(eq(committeeMeetings.committeeId, id)).orderBy(desc(committeeMeetings.meetingOn));
      const acts = await tx.select({ meetingId: committeeActionItems.meetingId, n: sql<number>`count(*)::int`, open: sql<number>`count(*) filter (where ${committeeActionItems.status} in ('open','in_progress'))::int` }).from(committeeActionItems).where(eq(committeeActionItems.committeeId, id)).groupBy(committeeActionItems.meetingId);
      return rows.map((m) => ({ ...m, actions: acts.find((a) => a.meetingId === m.id)?.n ?? 0, openActions: acts.find((a) => a.meetingId === m.id)?.open ?? 0 }));
    });
  }

  /** Edit the agenda, record minutes, or mark the meeting held or cancelled. */
  @Patch('meetings/:meetingId')
  @Auth('user', COMMITTEE_STAFF)
  updateMeeting(@CurrentPrincipal() p: UserPrincipal, @Param('meetingId', ParseUUIDPipe) meetingId: string, @Body(new ZodBody(MeetingPatch)) b: z.infer<typeof MeetingPatch>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cur = found((await tx.select().from(committeeMeetings).where(eq(committeeMeetings.id, meetingId)).for('update'))[0], 'Meeting');
      if (cur.status === 'cancelled') throw new ConflictException('A cancelled meeting cannot be changed');
      // Minutes mean the meeting happened.
      const status = b.status ?? (b.minutes && cur.status === 'scheduled' ? 'held' : undefined);
      const [row] = await tx.update(committeeMeetings).set({ ...b, ...(status ? { status } : {}) }).where(eq(committeeMeetings.id, meetingId)).returning();
      await auditUser(tx, p, 'committee.meeting_updated', 'committee', cur.committeeId, { meetingId, status: row.status, minutesChanged: b.minutes !== undefined });
      return row;
    });
  }

  // ---- action items ------------------------------------------------------------------------

  @Post('meetings/:meetingId/actions')
  @Auth('user', COMMITTEE_STAFF)
  addAction(@CurrentPrincipal() p: UserPrincipal, @Param('meetingId', ParseUUIDPipe) meetingId: string, @Body(new ZodBody(ActionBody)) b: z.infer<typeof ActionBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const m = found((await tx.select().from(committeeMeetings).where(eq(committeeMeetings.id, meetingId)))[0], 'Meeting');
      found((await tx.select({ id: users.id }).from(users).where(eq(users.id, b.ownerUserId)))[0], 'Owner');
      const [row] = await tx.insert(committeeActionItems).values({ tenantId: p.tenantId, meetingId, committeeId: m.committeeId, ...b }).returning();
      await auditUser(tx, p, 'committee.action_created', 'committee', m.committeeId, { actionId: row.id, ownerUserId: b.ownerUserId });
      return row;
    });
  }

  /** Action items with owner names. `mine=true` is the signed-in user's; `overdue=true` keeps open items past due. */
  @Get('action-items')
  @Auth('user')
  actions(@CurrentPrincipal() p: UserPrincipal, @Query('committeeId') committeeId?: string, @Query('meetingId') meetingId?: string, @Query('status') status?: string, @Query('mine') mine?: string, @Query('overdue') overdue?: string) {
    const staff = hasRole(p, COMMITTEE_STAFF);
    if (!staff && mine !== 'true') throw new ForbiddenException('Not allowed');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = this.today();
      const rows = await tx
        .select({ a: committeeActionItems, owner: users.fullName, committee: committees.name })
        .from(committeeActionItems)
        .innerJoin(users, eq(users.id, committeeActionItems.ownerUserId))
        .innerJoin(committees, eq(committees.id, committeeActionItems.committeeId))
        .where(
          and(
            committeeId ? eq(committeeActionItems.committeeId, committeeId) : undefined,
            meetingId ? eq(committeeActionItems.meetingId, meetingId) : undefined,
            status ? eq(committeeActionItems.status, status) : undefined,
            mine === 'true' ? eq(committeeActionItems.ownerUserId, p.userId) : undefined,
            overdue === 'true' ? and(inArray(committeeActionItems.status, ['open', 'in_progress']), sql`${committeeActionItems.dueOn} < ${today}`) : undefined,
          ),
        )
        .orderBy(asc(committeeActionItems.dueOn));
      return rows.map((r) => ({ ...r.a, ownerName: r.owner, committeeName: r.committee, overdue: (r.a.status === 'open' || r.a.status === 'in_progress') && r.a.dueOn < today }));
    });
  }

  /** The owner or the office moves an action item along. */
  @Post('action-items/:actionId/status')
  @Auth('user')
  @HttpCode(200)
  setActionStatus(@CurrentPrincipal() p: UserPrincipal, @Param('actionId', ParseUUIDPipe) actionId: string, @Body(new ZodBody(ActionStatus)) b: z.infer<typeof ActionStatus>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cur = found((await tx.select().from(committeeActionItems).where(eq(committeeActionItems.id, actionId)).for('update'))[0], 'Action item');
      if (cur.ownerUserId !== p.userId && !hasRole(p, COMMITTEE_STAFF)) throw new ForbiddenException('Only the owner or the office can update this');
      const [row] = await tx.update(committeeActionItems).set({ status: b.status, completedAt: b.status === 'done' ? this.svc.now() : null }).where(eq(committeeActionItems.id, actionId)).returning();
      await auditUser(tx, p, 'committee.action_status', 'committee', cur.committeeId, { actionId, from: cur.status, to: b.status });
      return row;
    });
  }
}
