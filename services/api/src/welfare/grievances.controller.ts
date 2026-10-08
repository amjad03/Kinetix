import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit, auditUser } from '../common/audit.js';
import { nextNumber } from '../common/ops.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { grievanceEvents, grievanceTickets, userRoles } from '../db/schema.js';
import { found, hasRole } from '../placements/placements.access.js';
import { COMMITTEE_ROLES, GRIEVANCE_STAFF } from './welfare.access.js';
import { WelfareService } from './welfare.service.js';
import { COMMITTEE_STAGES, OPEN_STATUSES, type Committee, type Severity, canAdvanceStage, canMoveTicket, canReopen, committeeFor, effectiveSeverity, escalate, isOverdue, slaDueAt } from './welfare-rules.js';

type Ticket = typeof grievanceTickets.$inferSelect;
type Viewer = 'reporter' | 'staff' | 'committee';

const RaiseBody = z.object({
  category: z.enum(['academic', 'exam', 'fees', 'hostel', 'transport', 'infrastructure', 'staff_conduct', 'ragging', 'harassment', 'other']),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  subject: z.string().trim().min(3).max(200),
  description: z.string().trim().min(10).max(5000),
  anonymous: z.boolean().default(false),
  studentId: z.uuid().optional(),
  committee: z.enum(['icc', 'posh']).optional(),
});
const Text = z.object({ body: z.string().trim().min(1).max(3000) });

/** The institution's reporter-or-staff view of a ticket. Anonymous tickets never reveal who raised them to anyone else. */
function present(t: Ticket, viewer: Viewer) {
  const { raisedBy, studentId, committeeStage, ...rest } = t;
  const identity = viewer === 'reporter' || !t.anonymous ? { raisedBy, studentId } : {};
  return { ...rest, ...identity, committeeStage: t.committee ? committeeStage : null, viewer };
}

/** Grievance tickets with SLA and escalation, and the confidential anti-ragging / ICC / POSH workflow (docs/architecture/placements-research-welfare.md). */
@Controller('v1/grievances')
export class GrievancesController {
  constructor(
    private readonly db: DbService,
    private readonly svc: WelfareService,
  ) {}

  /** Resolves the caller's relationship to a ticket; committee matters are invisible to anyone outside the committee. */
  private async access(tx: Tx, p: UserPrincipal, id: string, lock = false): Promise<{ t: Ticket; viewer: Viewer }> {
    const q = tx.select().from(grievanceTickets).where(eq(grievanceTickets.id, id));
    const t = found((await (lock ? q.for('update') : q))[0], 'Ticket');
    if (t.raisedBy === p.userId) return { t, viewer: 'reporter' };
    if (t.committee) {
      if (!hasRole(p, COMMITTEE_ROLES)) throw new NotFoundException('Ticket not found');
      return { t, viewer: 'committee' };
    }
    if (!hasRole(p, GRIEVANCE_STAFF)) throw new NotFoundException('Ticket not found');
    return { t, viewer: 'staff' };
  }

  private async event(tx: Tx, p: UserPrincipal, t: Ticket, viewer: Viewer, kind: string, body = '', visibility: 'public' | 'internal' = 'public') {
    await tx.insert(grievanceEvents).values({ tenantId: p.tenantId, ticketId: t.id, actorUserId: p.userId, actorRole: viewer, kind, visibility, body });
  }

  /** Staff-side actions only; the reporter never moves their own ticket except by rating and reopening. */
  private staffOnly(viewer: Viewer) {
    if (viewer === 'reporter') throw new ForbiddenException('Only the grievance team can do that');
  }

  /** Moves every open ticket past its SLA up one level and tells the next tier. Returns how many moved. */
  async escalateOverdue(tx: Tx, tenantId: string): Promise<number> {
    const now = this.svc.now();
    const rows = await tx.select().from(grievanceTickets).where(and(inArray(grievanceTickets.status, OPEN_STATUSES), lt(grievanceTickets.slaDueAt, now), lt(grievanceTickets.escalationLevel, 2))).for('update');
    let n = 0;
    for (const t of rows.filter((x) => isOverdue(x, now))) {
      const next = escalate({ escalationLevel: t.escalationLevel, severity: t.severity as Severity }, now);
      await tx.update(grievanceTickets).set({ status: 'escalated', escalationLevel: next.level, escalatedAt: now, slaDueAt: next.dueAt, version: t.version + 1 }).where(eq(grievanceTickets.id, t.id));
      await tx.insert(grievanceEvents).values({ tenantId, ticketId: t.id, actorRole: 'system', kind: 'escalated', visibility: 'public', body: `Escalated to level ${next.level} after the deadline passed` });
      await audit(tx, { tenantId, actorType: 'system', action: 'grievance.escalated', subjectType: 'grievance', subjectId: t.id, data: { level: next.level } });
      const tier = t.committee ? await this.svc.usersWithRole(tx, ['principal']) : await this.svc.usersWithRole(tx, next.level === 1 ? ['principal', 'grievance_officer'] : ['principal', 'tenant_admin']);
      await this.svc.notify(tx, tier, 'grievance', 'A ticket is past its deadline', `${t.ticketNo} was escalated to level ${next.level}`, `grievance:esc:${t.id}:${next.level}`, { ticketId: t.id });
      n++;
    }
    return n;
  }

  // ---- raising and following ----------------------------------------------------------------

  /** Any signed-in student, parent or staff member raises a ticket; a parent names their child. */
  @Post()
  @Auth('user')
  raise(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(RaiseBody)) b: z.infer<typeof RaiseBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      let studentId: string | null = null;
      if (hasRole(p, ['student', 'guardian'])) studentId = await this.svc.actingStudent(tx, p, b.studentId);
      else if (b.studentId) studentId = b.studentId;
      const committee = committeeFor(b.category, b.committee as Committee | undefined);
      const severity = effectiveSeverity(b.category, b.severity);
      const now = this.svc.now();
      const [t] = await tx
        .insert(grievanceTickets)
        .values({ tenantId: p.tenantId, ticketNo: await nextNumber(tx, p.tenantId, 'GRV'), category: b.category, severity, subject: b.subject, description: b.description, anonymous: b.anonymous, committee, committeeStage: committee ? 'received' : null, raisedBy: p.userId, studentId, slaDueAt: slaDueAt(now, severity) })
        .returning();
      await tx.insert(grievanceEvents).values({ tenantId: p.tenantId, ticketId: t.id, actorUserId: p.userId, actorRole: 'reporter', kind: 'raised', visibility: 'public', body: '' });
      // An anonymous report is audited without the reporter's identity.
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: b.anonymous ? undefined : p.userId, action: committee ? 'grievance.committee_raised' : 'grievance.raised', subjectType: 'grievance', subjectId: t.id, data: { category: b.category, severity, anonymous: b.anonymous } });
      const team = committee ? await this.svc.usersWithRole(tx, COMMITTEE_ROLES) : await this.svc.usersWithRole(tx, GRIEVANCE_STAFF);
      await this.svc.notify(tx, team.filter((u) => u !== p.userId), 'grievance', 'New grievance', committee ? `${t.ticketNo}: a confidential matter needs the committee` : `${t.ticketNo}: ${b.subject}`, `grievance:new:${t.id}`, { ticketId: t.id });
      return present(t, 'reporter');
    });
  }

  @Get('mine')
  @Auth('user')
  mine(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => (await tx.select().from(grievanceTickets).where(eq(grievanceTickets.raisedBy, p.userId)).orderBy(desc(grievanceTickets.createdAt))).map((t) => present(t, 'reporter')));
  }

  /** The grievance team's queue. Committee matters appear only for committee members; general tickets only for the grievance team. */
  @Get()
  @Auth('user', [...GRIEVANCE_STAFF, ...COMMITTEE_ROLES])
  list(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string, @Query('category') category?: string, @Query('overdue') overdue?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.escalateOverdue(tx, p.tenantId);
      const general = hasRole(p, GRIEVANCE_STAFF);
      const committee = hasRole(p, COMMITTEE_ROLES);
      const scope = general && committee ? undefined : general ? isNull(grievanceTickets.committee) : isNotNull(grievanceTickets.committee);
      const rows = await tx
        .select()
        .from(grievanceTickets)
        .where(and(scope, status ? eq(grievanceTickets.status, status) : undefined, category ? eq(grievanceTickets.category, category) : undefined, overdue === 'true' ? and(inArray(grievanceTickets.status, OPEN_STATUSES), lt(grievanceTickets.slaDueAt, this.svc.now())) : undefined))
        .orderBy(asc(grievanceTickets.slaDueAt));
      return rows.map((t) => present(t, t.raisedBy === p.userId ? 'reporter' : t.committee ? 'committee' : 'staff'));
    });
  }

  @Post('escalate-overdue')
  @Auth('user', [...GRIEVANCE_STAFF, ...COMMITTEE_ROLES])
  @HttpCode(200)
  escalateNow(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => ({ escalated: await this.escalateOverdue(tx, p.tenantId) }));
  }

  /** Ticket counts, SLA breaches and satisfaction. Committee matters contribute only a count, and only to committee members. */
  @Get('stats')
  @Auth('user', [...GRIEVANCE_STAFF, ...COMMITTEE_ROLES])
  stats(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const general = hasRole(p, GRIEVANCE_STAFF);
      const rows = general ? await tx.select().from(grievanceTickets).where(isNull(grievanceTickets.committee)) : [];
      const now = this.svc.now();
      const count = (key: (t: Ticket) => string) => Object.entries(rows.reduce<Record<string, number>>((m, t) => ({ ...m, [key(t)]: (m[key(t)] ?? 0) + 1 }), {})).map(([name, n]) => ({ name, count: n }));
      const rated = rows.filter((t) => t.rating !== null);
      const resolved = rows.filter((t) => t.resolvedAt);
      const [c] = hasRole(p, COMMITTEE_ROLES) ? await tx.select({ total: sql<number>`count(*)::int`, open: sql<number>`count(*) filter (where status not in ('resolved', 'closed'))::int` }).from(grievanceTickets).where(isNotNull(grievanceTickets.committee)) : [];
      return {
        total: rows.length,
        open: rows.filter((t) => OPEN_STATUSES.includes(t.status)).length,
        overdue: rows.filter((t) => OPEN_STATUSES.includes(t.status) && t.slaDueAt < now).length,
        byStatus: count((t) => t.status),
        byCategory: count((t) => t.category),
        averageRating: rated.length ? Math.round((rated.reduce((s, t) => s + (t.rating ?? 0), 0) / rated.length) * 10) / 10 : null,
        averageResolutionHours: resolved.length ? Math.round(resolved.reduce((s, t) => s + (t.resolvedAt!.getTime() - t.createdAt.getTime()) / 3_600_000, 0) / resolved.length) : null,
        ...(c ? { committee: c } : {}),
      };
    });
  }

  @Get(':id')
  @Auth('user')
  one(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { t, viewer } = await this.access(tx, p, id);
      if (t.committee && viewer === 'committee') await auditUser(tx, p, 'grievance.committee_viewed', 'grievance', id);
      const events = await tx.select().from(grievanceEvents).where(and(eq(grievanceEvents.ticketId, id), viewer === 'reporter' ? eq(grievanceEvents.visibility, 'public') : undefined)).orderBy(asc(grievanceEvents.createdAt));
      const showActor = (e: (typeof events)[number]) => (t.anonymous && e.actorRole === 'reporter' && viewer !== 'reporter' ? null : e.actorUserId);
      return { ...present(t, viewer), timeline: events.map((e) => ({ id: e.id, kind: e.kind, actorRole: e.actorRole, actorUserId: showActor(e), visibility: e.visibility, body: e.body, createdAt: e.createdAt })) };
    });
  }

  // ---- handling -----------------------------------------------------------------------------

  @Post(':id/assign')
  @Auth('user', [...GRIEVANCE_STAFF, ...COMMITTEE_ROLES])
  @HttpCode(200)
  assign(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ assigneeUserId: z.uuid() }))) b: { assigneeUserId: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { t, viewer } = await this.access(tx, p, id, true);
      this.staffOnly(viewer);
      if (['resolved', 'closed'].includes(t.status)) throw new ConflictException(`A ${t.status} ticket cannot be assigned`);
      const allowed = t.committee ? COMMITTEE_ROLES : [...GRIEVANCE_STAFF, 'hod' as const];
      const [r] = await tx.select({ id: userRoles.id }).from(userRoles).where(and(eq(userRoles.userId, b.assigneeUserId), inArray(userRoles.role, allowed)));
      if (!r) throw new ConflictException(t.committee ? 'Only committee members can handle this matter' : 'That person is not on the grievance team');
      if (t.raisedBy === b.assigneeUserId) throw new ConflictException('A person cannot handle their own grievance');
      const [row] = await tx.update(grievanceTickets).set({ assigneeUserId: b.assigneeUserId, status: t.status === 'open' || t.status === 'reopened' ? 'assigned' : t.status, version: t.version + 1 }).where(eq(grievanceTickets.id, id)).returning();
      await this.event(tx, p, t, viewer, 'assigned', '', 'internal');
      await auditUser(tx, p, 'grievance.assigned', 'grievance', id, { assigneeUserId: b.assigneeUserId });
      await this.svc.notify(tx, [b.assigneeUserId], 'grievance', 'A ticket was assigned to you', t.committee ? t.ticketNo : `${t.ticketNo}: ${t.subject}`, `grievance:assign:${id}:${b.assigneeUserId}`, { ticketId: id });
      return present(row, viewer);
    });
  }

  /** A comment; the team may mark it internal (hidden from the reporter). The reporter's comments are always public. */
  @Post(':id/comments')
  @Auth('user')
  @HttpCode(200)
  comment(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(Text.extend({ internal: z.boolean().default(false) }))) b: { body: string; internal: boolean }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { t, viewer } = await this.access(tx, p, id);
      if (t.status === 'closed') throw new ConflictException('This ticket is closed');
      await this.event(tx, p, t, viewer, 'comment', b.body, viewer !== 'reporter' && b.internal ? 'internal' : 'public');
      if (viewer !== 'reporter' && !b.internal) await this.svc.notify(tx, [t.raisedBy], 'grievance', 'Update on your grievance', t.ticketNo, `grievance:reply:${id}:${this.svc.now().getTime()}`, { ticketId: id });
      return { ok: true };
    });
  }

  @Post(':id/status')
  @Auth('user', [...GRIEVANCE_STAFF, ...COMMITTEE_ROLES])
  @HttpCode(200)
  status(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ status: z.enum(['in_progress']) }))) b: { status: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { t, viewer } = await this.access(tx, p, id, true);
      this.staffOnly(viewer);
      if (!canMoveTicket(t.status, b.status)) throw new ConflictException(`A ${t.status} ticket cannot become ${b.status}`);
      const [row] = await tx.update(grievanceTickets).set({ status: b.status, version: t.version + 1 }).where(eq(grievanceTickets.id, id)).returning();
      await this.event(tx, p, t, viewer, 'status', b.status);
      await auditUser(tx, p, 'grievance.status', 'grievance', id, { from: t.status, to: b.status });
      return present(row, viewer);
    });
  }

  @Post(':id/resolve')
  @Auth('user', [...GRIEVANCE_STAFF, ...COMMITTEE_ROLES])
  @HttpCode(200)
  resolve(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ resolution: z.string().trim().min(5).max(3000) }))) b: { resolution: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { t, viewer } = await this.access(tx, p, id, true);
      this.staffOnly(viewer);
      if (!canMoveTicket(t.status, 'resolved')) throw new ConflictException(`A ${t.status} ticket cannot be resolved`);
      if (t.committee && t.committeeStage !== 'action' && t.committeeStage !== 'closed') throw new ConflictException('Take the committee through its stages (inquiry, report, action) before resolving');
      const [row] = await tx.update(grievanceTickets).set({ status: 'resolved', resolution: b.resolution, resolvedAt: this.svc.now(), version: t.version + 1 }).where(eq(grievanceTickets.id, id)).returning();
      await this.event(tx, p, t, viewer, 'resolved', b.resolution);
      await auditUser(tx, p, 'grievance.resolved', 'grievance', id);
      await this.svc.notify(tx, [t.raisedBy], 'grievance', 'Your grievance was resolved', `${t.ticketNo}. Please rate how it went.`, `grievance:resolved:${id}`, { ticketId: id });
      return present(row, viewer);
    });
  }

  /** The committee's stages: received, inquiry, hearing, report, action, closed. Stages only move forward. */
  @Post(':id/committee-stage')
  @Auth('user', COMMITTEE_ROLES)
  @HttpCode(200)
  stage(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ stage: z.enum(COMMITTEE_STAGES), note: z.string().trim().max(3000).default('') }))) b: { stage: string; note: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { t, viewer } = await this.access(tx, p, id, true);
      if (!t.committee || viewer !== 'committee') throw new NotFoundException('Ticket not found');
      if (!canAdvanceStage(t.committeeStage ?? 'received', b.stage)) throw new ConflictException(`The committee cannot go from ${t.committeeStage} to ${b.stage}`);
      if (!t.assigneeUserId && b.stage !== 'inquiry') throw new ConflictException('Assign a committee member before going further');
      const [row] = await tx.update(grievanceTickets).set({ committeeStage: b.stage, status: t.status === 'open' || t.status === 'assigned' ? 'in_progress' : t.status, version: t.version + 1 }).where(eq(grievanceTickets.id, id)).returning();
      await this.event(tx, p, t, viewer, `stage_${b.stage}`, b.note, 'internal');
      await auditUser(tx, p, 'grievance.committee_stage', 'grievance', id, { from: t.committeeStage, to: b.stage });
      return present(row, viewer);
    });
  }

  // ---- the reporter's side ------------------------------------------------------------------

  /** Satisfaction rating after resolution (once); it closes the ticket. */
  @Post(':id/rating')
  @Auth('user')
  @HttpCode(200)
  rate(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().max(1000).optional() }))) b: { rating: number; comment?: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { t, viewer } = await this.access(tx, p, id, true);
      if (viewer !== 'reporter') throw new ForbiddenException('Only the person who raised the ticket can rate it');
      if (t.rating !== null) throw new ConflictException('You have already rated this ticket');
      if (t.status !== 'resolved') throw new ConflictException('You can rate a ticket once it is resolved');
      const [row] = await tx.update(grievanceTickets).set({ rating: b.rating, ratingComment: b.comment ?? null, status: 'closed', version: t.version + 1 }).where(eq(grievanceTickets.id, id)).returning();
      await this.event(tx, p, t, viewer, 'rated', `${b.rating}/5`);
      await auditUser(tx, p, 'grievance.rated', 'grievance', id, { rating: b.rating });
      return present(row, viewer);
    });
  }

  /** The reporter reopens a resolved ticket within a week if the problem persists. */
  @Post(':id/reopen')
  @Auth('user')
  @HttpCode(200)
  reopen(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(Text)) b: { body: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { t, viewer } = await this.access(tx, p, id, true);
      if (viewer !== 'reporter') throw new ForbiddenException('Only the person who raised the ticket can reopen it');
      if (t.status !== 'resolved') throw new ConflictException('Only a resolved ticket can be reopened');
      if (!canReopen(t.resolvedAt, this.svc.now())) throw new ConflictException('The week for reopening has passed. Please raise a new ticket.');
      if (!canMoveTicket(t.status, 'reopened')) throw new BadRequestException('Cannot reopen');
      const [row] = await tx.update(grievanceTickets).set({ status: 'reopened', resolvedAt: null, resolution: null, slaDueAt: slaDueAt(this.svc.now(), t.severity as Severity), escalationLevel: 0, version: t.version + 1 }).where(eq(grievanceTickets.id, id)).returning();
      await this.event(tx, p, t, viewer, 'reopened', b.body);
      await auditUser(tx, p, 'grievance.reopened', 'grievance', id);
      return present(row, viewer);
    });
  }
}
