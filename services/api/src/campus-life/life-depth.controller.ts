import { randomBytes } from 'node:crypto';
import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, isNotNull, lt, lte, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit, auditUser } from '../common/audit.js';
import { Day, Paise } from '../common/ops.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { calendarEvents, campusEvents, clubs, eventRegistrations, examSessions, sections, students, users } from '../db/schema.js';
import { activityUnits, clubBudgets, clubExpenseClaims, eventDutyLeaves, eventExternalRegistrations, outreachActivities, studentAchievements, unitActivities, unitHours, unitMembers } from '../db/schema-life.js';
import { found } from '../placements/placements.access.js';
import { COMMITTEE_STAFF, LIFE_STAFF } from './campus-life.access.js';
import { CampusLifeService } from './campus-life.service.js';
import { qualified, yearLabelOf } from './kit-shared.js';
import { CampusDepthService, eventDates } from './life-depth.service.js';

const Hours = z.number().min(0).max(1000);
const MembersBody = z.object({ studentIds: z.array(z.uuid()).min(1).max(500), role: z.string().trim().min(1).max(40).default('member'), enrolledOn: Day });
const MemberPatch = z.object({ role: z.string().trim().min(1).max(40).optional(), status: z.enum(['active', 'left']).optional() });
const ActivityBody = z
  .object({ title: z.string().trim().min(2).max(200), kind: z.enum(['regular', 'camp', 'parade', 'match', 'tournament', 'special']).default('regular'), startsOn: Day, endsOn: Day, place: z.string().trim().max(200).default(''), hours: Hours.default(0), result: z.string().trim().max(500).default(''), description: z.string().trim().max(4000).default('') })
  .refine((b) => b.endsOn >= b.startsOn, { message: 'The activity must end on or after the day it starts', path: ['endsOn'] });
const HoursBody = z.object({ entries: z.array(z.object({ studentId: z.uuid(), hours: Hours })).max(1000) });
const BudgetBody = z.object({ yearLabel: z.string().regex(/^\d{4}-\d{2}$/, 'Use a year like 2026-27'), amountPaise: Paise, notes: z.string().trim().max(1000).default('') });
const DecisionBody = z.object({ decision: z.enum(['approve', 'reject']), note: z.string().trim().max(1000).default('') });
const ReportBody = z.object({ report: z.string().trim().min(10).max(20000), spentPaise: Paise.default(0) });
const PaymentBody = z.object({ paidPaise: Paise, paymentRef: z.string().trim().max(120).default('') });
const ExternalBody = z.object({ fullName: z.string().trim().min(2).max(120), email: z.union([z.email(), z.literal('')]).default(''), phone: z.string().trim().max(20).default(''), institution: z.string().trim().max(200).default(''), paidPaise: Paise.default(0), paymentRef: z.string().trim().max(120).default('') });
const RefundBody = z.object({ refundRef: z.string().trim().max(120).default('') });
const DutyBody = z.object({ studentIds: z.array(z.uuid()).max(2000).optional(), role: z.enum(['participant', 'volunteer', 'organiser']).default('participant') });
const TokenBody = z.object({ token: z.string().trim().min(8).max(100) });

/**
 * Campus life depth: NSS, NCC and sports units with members, activities and hours; club budgets; event proposals
 * and their approval, clash checks, the report afterwards, fees paid at the desk, external registrations, refunds
 * when an event is cancelled and duty leave; and the NAAC registers (5.3, 3.4, 7.1). The lists themselves are
 * record kit entities (life.records.ts).
 */
@Controller('v1/campus-life')
export class LifeDepthController {
  constructor(
    private readonly db: DbService,
    private readonly svc: CampusLifeService,
    private readonly depth: CampusDepthService,
  ) {}

  // ---- units -----------------------------------------------------------------------------------

  /** A unit with its members (hours against the target) and activities. */
  @Get('units/:id')
  @Auth('user', LIFE_STAFF)
  unit(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const u = found((await tx.select().from(activityUnits).where(eq(activityUnits.id, id)))[0], 'Unit');
      const members = await tx
        .select({ id: unitMembers.id, studentId: unitMembers.studentId, fullName: students.fullName, rollNo: students.rollNo, className: sections.displayName, role: unitMembers.role, enrolledOn: unitMembers.enrolledOn, status: unitMembers.status, leftOn: unitMembers.leftOn, hours: sql<number>`(select coalesce(sum(h.hours), 0)::float8 from unit_hours h where h.unit_id = ${id} and h.student_id = ${unitMembers.studentId})` })
        .from(unitMembers)
        .innerJoin(students, eq(students.id, unitMembers.studentId))
        .innerJoin(sections, eq(sections.id, students.sectionId))
        .where(eq(unitMembers.unitId, id))
        .orderBy(asc(sections.displayName), asc(students.rollNo));
      const activities = await tx
        .select({ id: unitActivities.id, title: unitActivities.title, kind: unitActivities.kind, startsOn: unitActivities.startsOn, endsOn: unitActivities.endsOn, place: unitActivities.place, hours: unitActivities.hours, result: unitActivities.result, description: unitActivities.description, attendees: sql<number>`(select count(*)::int from unit_hours h where h.activity_id = ${qualified('unit_activities')})` })
        .from(unitActivities)
        .where(eq(unitActivities.unitId, id))
        .orderBy(desc(unitActivities.startsOn));
      return { unit: u, members: members.map((m) => ({ ...m, targetMet: u.targetHours > 0 ? m.hours >= u.targetHours : null })), activities };
    });
  }

  @Post('units/:id/members')
  @Auth('user', LIFE_STAFF)
  addMembers(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(MembersBody)) b: z.infer<typeof MembersBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      found((await tx.select({ id: activityUnits.id }).from(activityUnits).where(eq(activityUnits.id, id)))[0], 'Unit');
      const known = await tx.select({ id: students.id }).from(students).where(inArray(students.id, b.studentIds));
      if (known.length !== new Set(b.studentIds).size) throw new NotFoundException('Student not found');
      const added = await tx
        .insert(unitMembers)
        .values(b.studentIds.map((studentId) => ({ tenantId: p.tenantId, unitId: id, studentId, role: b.role, enrolledOn: b.enrolledOn })))
        .onConflictDoUpdate({ target: [unitMembers.unitId, unitMembers.studentId], set: { status: 'active', leftOn: null, role: b.role } })
        .returning({ id: unitMembers.id });
      await auditUser(tx, p, 'activity_unit.members_added', 'activity_unit', id, { students: b.studentIds.length, role: b.role });
      return { added: added.length };
    });
  }

  @Patch('unit-members/:memberId')
  @Auth('user', LIFE_STAFF)
  patchMember(@CurrentPrincipal() p: UserPrincipal, @Param('memberId', ParseUUIDPipe) memberId: string, @Body(new ZodBody(MemberPatch)) b: z.infer<typeof MemberPatch>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const m = found((await tx.select().from(unitMembers).where(eq(unitMembers.id, memberId)))[0], 'Member');
      const set = { ...(b.role ? { role: b.role } : {}), ...(b.status ? { status: b.status, leftOn: b.status === 'left' ? new Date().toISOString().slice(0, 10) : null } : {}) };
      const [row] = await tx.update(unitMembers).set(set).where(eq(unitMembers.id, memberId)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'activity_unit.member_updated', subjectType: 'activity_unit', subjectId: m.unitId, before: { role: m.role, status: m.status }, after: { role: row.role, status: row.status } });
      return row;
    });
  }

  @Post('units/:id/activities')
  @Auth('user', LIFE_STAFF)
  addActivity(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ActivityBody)) b: z.infer<typeof ActivityBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      found((await tx.select({ id: activityUnits.id }).from(activityUnits).where(eq(activityUnits.id, id)))[0], 'Unit');
      const [row] = await tx.insert(unitActivities).values({ tenantId: p.tenantId, unitId: id, createdBy: p.userId, ...b }).returning();
      await auditUser(tx, p, 'activity_unit.activity_added', 'activity_unit', id, { activityId: row.id, title: b.title, kind: b.kind });
      return row;
    });
  }

  @Delete('unit-activities/:activityId')
  @Auth('user', LIFE_STAFF)
  dropActivity(@CurrentPrincipal() p: UserPrincipal, @Param('activityId', ParseUUIDPipe) activityId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const a = found((await tx.select().from(unitActivities).where(eq(unitActivities.id, activityId)))[0], 'Activity');
      await tx.delete(unitActivities).where(eq(unitActivities.id, activityId));
      await auditUser(tx, p, 'activity_unit.activity_removed', 'activity_unit', a.unitId, { activityId, title: a.title });
      return { ok: true };
    });
  }

  /** Who attended an activity and the hours each earned (replaces the earlier list). */
  @Get('unit-activities/:activityId/hours')
  @Auth('user', LIFE_STAFF)
  hours(@CurrentPrincipal() p: UserPrincipal, @Param('activityId', ParseUUIDPipe) activityId: string) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select({ studentId: unitHours.studentId, hours: unitHours.hours }).from(unitHours).where(eq(unitHours.activityId, activityId)));
  }

  @Put('unit-activities/:activityId/hours')
  @Auth('user', LIFE_STAFF)
  setHours(@CurrentPrincipal() p: UserPrincipal, @Param('activityId', ParseUUIDPipe) activityId: string, @Body(new ZodBody(HoursBody)) b: z.infer<typeof HoursBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const a = found((await tx.select().from(unitActivities).where(eq(unitActivities.id, activityId)))[0], 'Activity');
      const members = new Set((await tx.select({ s: unitMembers.studentId }).from(unitMembers).where(eq(unitMembers.unitId, a.unitId))).map((r) => r.s));
      const stranger = b.entries.find((e) => !members.has(e.studentId));
      if (stranger) throw new BadRequestException('Hours can only be logged for the unit’s members');
      await tx.delete(unitHours).where(eq(unitHours.activityId, activityId));
      const rows = b.entries.filter((e) => e.hours > 0);
      if (rows.length) await tx.insert(unitHours).values(rows.map((e) => ({ tenantId: p.tenantId, activityId, unitId: a.unitId, studentId: e.studentId, hours: e.hours, recordedBy: p.userId })));
      await auditUser(tx, p, 'activity_unit.hours_logged', 'activity_unit', a.unitId, { activityId, attendees: rows.length, hours: rows.reduce((s, e) => s + e.hours, 0) });
      return { attendees: rows.length };
    });
  }

  /** Every member of every unit (or one kind) with hours against the target: who has completed and who is short. */
  @Get('reports/unit-hours')
  @Auth('user', LIFE_STAFF)
  unitHoursReport(@CurrentPrincipal() p: UserPrincipal, @Query('kind') kind?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ unitId: activityUnits.id, unit: activityUnits.name, kind: activityUnits.kind, target: activityUnits.targetHours, studentId: students.id, fullName: students.fullName, rollNo: students.rollNo, className: sections.displayName, role: unitMembers.role, status: unitMembers.status, hours: sql<number>`(select coalesce(sum(h.hours), 0)::float8 from unit_hours h where h.unit_id = ${activityUnits.id} and h.student_id = ${students.id})`, camps: sql<number>`(select count(*)::int from unit_hours h join unit_activities a on a.id = h.activity_id where h.unit_id = ${activityUnits.id} and h.student_id = ${students.id} and a.kind = 'camp')` })
        .from(unitMembers)
        .innerJoin(activityUnits, eq(activityUnits.id, unitMembers.unitId))
        .innerJoin(students, eq(students.id, unitMembers.studentId))
        .innerJoin(sections, eq(sections.id, students.sectionId))
        .where(kind && ['nss', 'ncc', 'sports', 'other'].includes(kind) ? eq(activityUnits.kind, kind as 'nss') : undefined)
        .orderBy(asc(activityUnits.name), asc(sections.displayName), asc(students.rollNo));
      return rows.map((r) => ({ ...r, complete: r.target > 0 ? r.hours >= r.target : null }));
    });
  }

  // ---- club budgets ----------------------------------------------------------------------------

  /** Every club's budget for a year against approved and paid claims. */
  @Get('club-budgets')
  @Auth('user', LIFE_STAFF)
  budgets(@CurrentPrincipal() p: UserPrincipal, @Query('year') year?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const y = year && /^\d{4}-\d{2}$/.test(year) ? year : yearLabelOf(this.svc.now());
      const rows = await tx
        .select({
          clubId: clubs.id,
          club: clubs.name,
          budgetPaise: sql<number | null>`(select b.amount_paise::float8 from club_budgets b where b.club_id = ${qualified('clubs')} and b.year_label = ${y})`,
          notes: sql<string | null>`(select b.notes from club_budgets b where b.club_id = ${qualified('clubs')} and b.year_label = ${y})`,
          submittedPaise: sql<number>`(select coalesce(sum(c.amount_paise), 0)::float8 from club_expense_claims c where c.club_id = ${qualified('clubs')} and c.year_label = ${y} and c.status = 'submitted')`,
          approvedPaise: sql<number>`(select coalesce(sum(c.amount_paise), 0)::float8 from club_expense_claims c where c.club_id = ${qualified('clubs')} and c.year_label = ${y} and c.status in ('approved', 'paid'))`,
          paidPaise: sql<number>`(select coalesce(sum(c.amount_paise), 0)::float8 from club_expense_claims c where c.club_id = ${qualified('clubs')} and c.year_label = ${y} and c.status = 'paid')`,
        })
        .from(clubs)
        .orderBy(asc(clubs.name));
      return { year: y, clubs: rows.map((r) => ({ ...r, remainingPaise: r.budgetPaise === null ? null : r.budgetPaise - r.approvedPaise })) };
    });
  }

  @Put('clubs/:id/budget')
  @Auth('user', COMMITTEE_STAFF)
  setBudget(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(BudgetBody)) b: z.infer<typeof BudgetBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      found((await tx.select({ id: clubs.id }).from(clubs).where(eq(clubs.id, id)))[0], 'Club');
      const [cur] = await tx.select().from(clubBudgets).where(and(eq(clubBudgets.clubId, id), eq(clubBudgets.yearLabel, b.yearLabel)));
      const [used] = await tx.select({ n: sql<number>`coalesce(sum(${clubExpenseClaims.amountPaise}), 0)::float8` }).from(clubExpenseClaims).where(and(eq(clubExpenseClaims.clubId, id), eq(clubExpenseClaims.yearLabel, b.yearLabel), inArray(clubExpenseClaims.status, ['approved', 'paid'])));
      if (used.n > b.amountPaise) throw new ConflictException('The budget cannot be less than what has already been approved');
      const [row] = cur
        ? await tx.update(clubBudgets).set({ amountPaise: b.amountPaise, notes: b.notes, setBy: p.userId }).where(eq(clubBudgets.id, cur.id)).returning()
        : await tx.insert(clubBudgets).values({ tenantId: p.tenantId, clubId: id, yearLabel: b.yearLabel, amountPaise: b.amountPaise, notes: b.notes, setBy: p.userId }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'club.budget_set', subjectType: 'club', subjectId: id, before: cur ? { amountPaise: cur.amountPaise } : {}, after: { amountPaise: b.amountPaise }, data: { yearLabel: b.yearLabel } });
      return row;
    });
  }

  // ---- event proposals and approval ----------------------------------------------------------------

  /** Sends a draft event for approval (its budget, venue and dates). */
  @Post('events/:id/propose')
  @Auth('user', LIFE_STAFF)
  @HttpCode(200)
  propose(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const ev = found((await tx.select().from(campusEvents).where(eq(campusEvents.id, id)).for('update'))[0], 'Event');
      if (ev.status !== 'draft') throw new ConflictException('Only a draft event can be proposed');
      if (ev.approvalStatus === 'pending') throw new ConflictException('This proposal is already awaiting approval');
      const [row] = await tx.update(campusEvents).set({ approvalStatus: 'pending', approvalNote: '', approvedBy: null, approvedAt: null }).where(eq(campusEvents.id, id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'event.proposed', subjectType: 'event', subjectId: id, changes: { approvalStatus: { before: ev.approvalStatus, after: 'pending' } }, data: { budgetPaise: ev.budgetPaise } });
      return { ...row, clashes: await this.clashesOf(tx, row) };
    });
  }

  /** The principal or office approves or rejects a proposal; never the person who created the event. */
  @Post('events/:id/approval')
  @Auth('user', COMMITTEE_STAFF)
  @HttpCode(200)
  decide(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DecisionBody)) b: z.infer<typeof DecisionBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const ev = found((await tx.select().from(campusEvents).where(eq(campusEvents.id, id)).for('update'))[0], 'Event');
      if (ev.approvalStatus !== 'pending') throw new ConflictException('This event is not awaiting approval');
      if (ev.createdBy === p.userId) throw new ForbiddenException('Someone other than the proposer must decide');
      if (b.decision === 'reject' && !b.note) throw new BadRequestException('Say why the proposal is rejected');
      const status = b.decision === 'approve' ? 'approved' : 'rejected';
      const [row] = await tx.update(campusEvents).set({ approvalStatus: status, approvalNote: b.note, approvedBy: p.userId, approvedAt: this.svc.now() }).where(eq(campusEvents.id, id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: `event.proposal_${status}`, subjectType: 'event', subjectId: id, changes: { approvalStatus: { before: 'pending', after: status } }, data: { note: b.note } });
      return row;
    });
  }

  /** Exams and other events at the same venue that overlap the event's dates. */
  @Get('events/:id/clashes')
  @Auth('user', LIFE_STAFF)
  clashes(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => this.clashesOf(tx, found((await tx.select().from(campusEvents).where(eq(campusEvents.id, id)))[0], 'Event')));
  }

  /** The same check for a date range before an event exists (the add form). */
  @Get('clashes')
  @Auth('user', LIFE_STAFF)
  clashesFor(@CurrentPrincipal() p: UserPrincipal, @Query('startsAt') startsAt: string, @Query('endsAt') endsAt: string, @Query('venue') venue = '') {
    const s = new Date(startsAt);
    const e = new Date(endsAt);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e <= s) throw new BadRequestException('Give a start before the end');
    return this.db.withTenant(p.tenantId, (tx) => this.clashesOf(tx, { id: null, startsAt: s, endsAt: e, venue }));
  }

  private async clashesOf(tx: Tx, ev: { id: string | null; startsAt: Date; endsAt: Date; venue: string }) {
    const { from, to } = eventDates(ev.startsAt, ev.endsAt, await this.depth.timezone(tx));
    const exams = [
      ...(await tx.select({ title: calendarEvents.title, from: calendarEvents.startsOn, to: calendarEvents.endsOn }).from(calendarEvents).where(and(eq(calendarEvents.kind, 'exam'), lte(calendarEvents.startsOn, to), gte(calendarEvents.endsOn, from)))),
      ...(await tx.select({ title: examSessions.name, from: examSessions.startsOn, to: examSessions.endsOn }).from(examSessions).where(and(ne(examSessions.status, 'draft'), lte(examSessions.startsOn, to), gte(examSessions.endsOn, from)))),
    ];
    const venue = ev.venue.trim()
      ? await tx
          .select({ id: campusEvents.id, title: campusEvents.title, startsAt: campusEvents.startsAt, endsAt: campusEvents.endsAt })
          .from(campusEvents)
          .where(and(ne(campusEvents.status, 'cancelled'), sql`lower(${campusEvents.venue}) = ${ev.venue.trim().toLowerCase()}`, lt(campusEvents.startsAt, ev.endsAt), sql`${campusEvents.endsAt} > ${ev.startsAt}`, ev.id ? ne(campusEvents.id, ev.id) : undefined))
      : [];
    return { exams, venue };
  }

  /** The report after the event, with what it actually cost. */
  @Put('events/:id/report')
  @Auth('user', LIFE_STAFF)
  report(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ReportBody)) b: z.infer<typeof ReportBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const ev = found((await tx.select().from(campusEvents).where(eq(campusEvents.id, id)).for('update'))[0], 'Event');
      if (ev.status !== 'published') throw new ConflictException('Only a held event takes a report');
      if (ev.startsAt > this.svc.now()) throw new ConflictException('Write the report once the event has started');
      const [row] = await tx.update(campusEvents).set({ report: b.report, spentPaise: b.spentPaise, reportAt: this.svc.now() }).where(eq(campusEvents.id, id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'event.report_saved', subjectType: 'event', subjectId: id, before: { spentPaise: ev.spentPaise }, after: { spentPaise: b.spentPaise } });
      return row;
    });
  }

  /** A fee paid at the desk for a student's registration. */
  @Post('registrations/:registrationId/payment')
  @Auth('user', [...LIFE_STAFF, 'accountant'])
  @HttpCode(200)
  payment(@CurrentPrincipal() p: UserPrincipal, @Param('registrationId', ParseUUIDPipe) registrationId: string, @Body(new ZodBody(PaymentBody)) b: z.infer<typeof PaymentBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = found((await tx.select().from(eventRegistrations).where(eq(eventRegistrations.id, registrationId)).for('update'))[0], 'Registration');
      if (r.status === 'cancelled') throw new ConflictException('This registration was cancelled');
      const [row] = await tx.update(eventRegistrations).set({ paidPaise: b.paidPaise, paymentRef: b.paymentRef }).where(eq(eventRegistrations.id, registrationId)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'event.fee_recorded', subjectType: 'event', subjectId: r.eventId, before: { paidPaise: r.paidPaise }, after: { paidPaise: b.paidPaise }, data: { registrationId, studentId: r.studentId } });
      return row;
    });
  }

  // ---- external registrations ----------------------------------------------------------------------

  @Get('events/:id/external')
  @Auth('user', LIFE_STAFF)
  externals(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(eventExternalRegistrations).where(eq(eventExternalRegistrations.eventId, id)).orderBy(asc(eventExternalRegistrations.createdAt)));
  }

  /** Registers someone from another institution at the desk (fests and inter-college events), with the fee paid. */
  @Post('events/:id/external')
  @Auth('user', LIFE_STAFF)
  addExternal(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ExternalBody)) b: z.infer<typeof ExternalBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const ev = found((await tx.select().from(campusEvents).where(eq(campusEvents.id, id)).for('update'))[0], 'Event');
      if (ev.status !== 'published') throw new ConflictException('Registration is not open for this event');
      if (!ev.externalRegistration) throw new ConflictException('This event is not open to other institutions');
      if (!b.email && !b.phone) throw new BadRequestException('Give an email or a phone number');
      const [taken] = await tx.select({ n: sql<number>`(select count(*)::int from event_registrations r where r.event_id = ${id} and r.status = 'registered') + (select count(*)::int from event_external_registrations r where r.event_id = ${id} and r.status = 'registered')` }).from(campusEvents).where(eq(campusEvents.id, id));
      if (taken.n >= ev.capacity) throw new ConflictException('The event is full');
      if (ev.feePaise > 0 && b.paidPaise < ev.feePaise) throw new BadRequestException('Record the full fee to register');
      const [row] = await tx.insert(eventExternalRegistrations).values({ tenantId: p.tenantId, eventId: id, ...b, qrToken: randomBytes(16).toString('hex'), createdBy: p.userId }).returning();
      await auditUser(tx, p, 'event.external_registered', 'event', id, { registrationId: row.id, institution: b.institution, paidPaise: b.paidPaise });
      return row;
    });
  }

  @Post('external/:registrationId/cancel')
  @Auth('user', LIFE_STAFF)
  @HttpCode(200)
  cancelExternal(@CurrentPrincipal() p: UserPrincipal, @Param('registrationId', ParseUUIDPipe) registrationId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = found((await tx.select().from(eventExternalRegistrations).where(eq(eventExternalRegistrations.id, registrationId)).for('update'))[0], 'Registration');
      if (r.status === 'cancelled') throw new ConflictException('Already cancelled');
      const [row] = await tx.update(eventExternalRegistrations).set({ status: 'cancelled', refundStatus: r.paidPaise > 0 ? 'due' : 'none' }).where(eq(eventExternalRegistrations.id, registrationId)).returning();
      await auditUser(tx, p, 'event.external_cancelled', 'event', r.eventId, { registrationId });
      return row;
    });
  }

  @Post('events/:id/check-in-external')
  @Auth('user', LIFE_STAFF)
  @HttpCode(200)
  checkInExternal(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(TokenBody)) b: z.infer<typeof TokenBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = (await tx.select().from(eventExternalRegistrations).where(and(eq(eventExternalRegistrations.eventId, id), eq(eventExternalRegistrations.qrToken, b.token))).for('update'))[0];
      if (!r) throw new NotFoundException('This code is not for this event');
      if (r.status !== 'registered') throw new ConflictException('This registration was cancelled');
      if (r.checkedInAt) throw new ConflictException('Already checked in');
      const [row] = await tx.update(eventExternalRegistrations).set({ checkedInAt: this.svc.now() }).where(eq(eventExternalRegistrations.id, r.id)).returning();
      await auditUser(tx, p, 'event.external_checked_in', 'event', id, { registrationId: r.id });
      return row;
    });
  }

  // ---- refunds -----------------------------------------------------------------------------------

  /** Everyone owed or already given a refund for an event. */
  @Get('events/:id/refunds')
  @Auth('user', [...LIFE_STAFF, 'accountant'])
  refunds(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const internal = await tx
        .select({ id: eventRegistrations.id, name: students.fullName, rollNo: students.rollNo, paidPaise: eventRegistrations.paidPaise, paymentRef: eventRegistrations.paymentRef, refundStatus: eventRegistrations.refundStatus, refundRef: eventRegistrations.refundRef, refundedAt: eventRegistrations.refundedAt })
        .from(eventRegistrations)
        .innerJoin(students, eq(students.id, eventRegistrations.studentId))
        .where(and(eq(eventRegistrations.eventId, id), ne(eventRegistrations.refundStatus, 'none')));
      const external = await tx
        .select({ id: eventExternalRegistrations.id, name: eventExternalRegistrations.fullName, institution: eventExternalRegistrations.institution, paidPaise: eventExternalRegistrations.paidPaise, paymentRef: eventExternalRegistrations.paymentRef, refundStatus: eventExternalRegistrations.refundStatus, refundRef: eventExternalRegistrations.refundRef, refundedAt: eventExternalRegistrations.refundedAt })
        .from(eventExternalRegistrations)
        .where(and(eq(eventExternalRegistrations.eventId, id), ne(eventExternalRegistrations.refundStatus, 'none')));
      return [...internal.map((r) => ({ ...r, kind: 'student' as const })), ...external.map((r) => ({ ...r, kind: 'external' as const }))];
    });
  }

  @Post('refunds/:kind/:registrationId')
  @Auth('user', [...COMMITTEE_STAFF, 'accountant'])
  @HttpCode(200)
  refund(@CurrentPrincipal() p: UserPrincipal, @Param('kind') kind: string, @Param('registrationId', ParseUUIDPipe) registrationId: string, @Body(new ZodBody(RefundBody)) b: z.infer<typeof RefundBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const table = kind === 'external' ? eventExternalRegistrations : kind === 'student' ? eventRegistrations : null;
      if (!table) throw new NotFoundException('Not found');
      const [r] = (await tx.select({ id: table.id, eventId: table.eventId, refundStatus: table.refundStatus, paidPaise: table.paidPaise }).from(table).where(eq(table.id, registrationId)).for('update')) as { id: string; eventId: string; refundStatus: string; paidPaise: number }[];
      if (!r) throw new NotFoundException('Registration not found');
      if (r.refundStatus !== 'due') throw new ConflictException(r.refundStatus === 'refunded' ? 'Already refunded' : 'No refund is due');
      await tx.update(table).set({ refundStatus: 'refunded', refundRef: b.refundRef, refundedAt: this.svc.now() }).where(eq(table.id, registrationId));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'event.refunded', subjectType: 'event', subjectId: r.eventId, data: { registrationId, kind, paidPaise: r.paidPaise, refundRef: b.refundRef } });
      return { ok: true };
    });
  }

  // ---- duty leave ----------------------------------------------------------------------------------

  @Get('events/:id/duty-leave')
  @Auth('user', LIFE_STAFF)
  dutyLeaves(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ id: eventDutyLeaves.id, studentId: eventDutyLeaves.studentId, fullName: students.fullName, rollNo: students.rollNo, className: sections.displayName, role: eventDutyLeaves.role, fromDate: eventDutyLeaves.fromDate, toDate: eventDutyLeaves.toDate, excusedCount: eventDutyLeaves.excusedCount, grantedBy: users.fullName, createdAt: eventDutyLeaves.createdAt })
        .from(eventDutyLeaves)
        .innerJoin(students, eq(students.id, eventDutyLeaves.studentId))
        .innerJoin(sections, eq(sections.id, students.sectionId))
        .leftJoin(users, eq(users.id, eventDutyLeaves.grantedBy))
        .where(eq(eventDutyLeaves.eventId, id))
        .orderBy(asc(sections.displayName), asc(students.rollNo)),
    );
  }

  /** Duty leave for the given students, or (none given) everyone checked in at the event. */
  @Post('events/:id/duty-leave')
  @Auth('user', COMMITTEE_STAFF)
  @HttpCode(200)
  grantDuty(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DutyBody)) b: z.infer<typeof DutyBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      found((await tx.select({ id: campusEvents.id }).from(campusEvents).where(eq(campusEvents.id, id)))[0], 'Event');
      const ids = b.studentIds?.length ? b.studentIds : (await tx.select({ s: eventRegistrations.studentId }).from(eventRegistrations).where(and(eq(eventRegistrations.eventId, id), isNotNull(eventRegistrations.checkedInAt)))).map((r) => r.s);
      if (!ids.length) throw new ConflictException('Nobody has checked in at this event yet: choose the students');
      return this.depth.grantDutyLeave({ tx, p }, id, ids, b.role);
    });
  }

  // ---- reports -------------------------------------------------------------------------------------

  /** NAAC 5.3.1 (awards by level), 5.3.3 (sports and cultural events held), 3.4.3/3.4.4 (extension and outreach) and 7.1.1 (gender) for a year. */
  @Get('reports/naac')
  @Auth('user', LIFE_STAFF)
  naac(@CurrentPrincipal() p: UserPrincipal, @Query('year') year?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const start = year && /^\d{4}$/.test(year) ? Number(year) : Number(yearLabelOf(this.svc.now()).slice(0, 4));
      const from = `${start}-06-01`;
      const to = `${start + 1}-05-31`;
      const ach = await tx
        .select({ level: studentAchievements.level, category: studentAchievements.category, position: studentAchievements.position, n: sql<number>`count(*)::int`, students: sql<number>`count(distinct ${studentAchievements.studentId})::int` })
        .from(studentAchievements)
        .where(and(gte(studentAchievements.achievedOn, from), lte(studentAchievements.achievedOn, to), ne(studentAchievements.status, 'rejected')))
        .groupBy(studentAchievements.level, studentAchievements.category, studentAchievements.position);
      const awards = ach.filter((a) => ['sports', 'cultural'].includes(a.category) && ['university', 'state', 'national', 'international'].includes(a.level) && a.position !== 'participation');
      const events = await tx
        .select({ type: campusEvents.eventType, n: sql<number>`count(*)::int` })
        .from(campusEvents)
        .where(and(eq(campusEvents.status, 'published'), sql`${campusEvents.startsAt} >= ${from}::date and ${campusEvents.startsAt} < ${`${start + 1}-06-01`}::date`))
        .groupBy(campusEvents.eventType);
      const outreach = await tx
        .select({ kind: outreachActivities.kind, n: sql<number>`count(*)::int`, students: sql<number>`coalesce(sum(${outreachActivities.studentsCount}), 0)::int`, reached: sql<number>`coalesce(sum(${outreachActivities.beneficiaries}), 0)::int` })
        .from(outreachActivities)
        .where(and(gte(outreachActivities.heldOn, from), lte(outreachActivities.heldOn, to)))
        .groupBy(outreachActivities.kind);
      const sum = <T>(rows: T[], f: (r: T) => number) => rows.reduce((s, r) => s + f(r), 0);
      const ext = outreach.filter((o) => ['extension', 'outreach', 'swachh', 'health'].includes(o.kind));
      return {
        year: yearLabelOf(new Date(Date.UTC(start, 6, 1))),
        m531: { awards: sum(awards, (a) => a.n), byLevel: Object.entries(awards.reduce<Record<string, number>>((m, a) => ({ ...m, [a.level]: (m[a.level] ?? 0) + a.n }), {})).map(([level, n]) => ({ level, n })) },
        m533: { events: sum(events.filter((e) => ['sports', 'fest', 'competition'].includes(e.type)), (e) => e.n), byType: events },
        m343: { programmes: sum(ext, (o) => o.n) },
        m344: { students: sum(ext, (o) => o.students), reached: sum(ext, (o) => o.reached) },
        m711: { gender: sum(outreach.filter((o) => o.kind === 'gender'), (o) => o.n), sustainability: sum(outreach.filter((o) => o.kind === 'sustainability'), (o) => o.n) },
        achievements: ach,
        outreach,
      };
    });
  }

  /** The event register: every event with its numbers, money and whether the report is in. */
  @Get('reports/event-register')
  @Auth('user', LIFE_STAFF)
  register(@CurrentPrincipal() p: UserPrincipal, @Query('year') year?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const start = year && /^\d{4}$/.test(year) ? Number(year) : Number(yearLabelOf(this.svc.now()).slice(0, 4));
      return tx
        .select({
          id: campusEvents.id,
          title: campusEvents.title,
          eventType: campusEvents.eventType,
          startsAt: campusEvents.startsAt,
          venue: campusEvents.venue,
          status: campusEvents.status,
          budgetPaise: campusEvents.budgetPaise,
          spentPaise: campusEvents.spentPaise,
          registered: sql<number>`(select count(*)::int from event_registrations r where r.event_id = ${qualified('campus_events')} and r.status = 'registered')`,
          external: sql<number>`(select count(*)::int from event_external_registrations r where r.event_id = ${qualified('campus_events')} and r.status = 'registered')`,
          attended: sql<number>`(select count(*)::int from event_registrations r where r.event_id = ${qualified('campus_events')} and r.checked_in_at is not null) + (select count(*)::int from event_external_registrations r where r.event_id = ${qualified('campus_events')} and r.checked_in_at is not null)`,
          feesPaise: sql<number>`(select coalesce(sum(r.paid_paise), 0)::float8 from event_registrations r where r.event_id = ${qualified('campus_events')}) + (select coalesce(sum(r.paid_paise), 0)::float8 from event_external_registrations r where r.event_id = ${qualified('campus_events')})`,
          refundsDue: sql<number>`(select count(*)::int from event_registrations r where r.event_id = ${qualified('campus_events')} and r.refund_status = 'due') + (select count(*)::int from event_external_registrations r where r.event_id = ${qualified('campus_events')} and r.refund_status = 'due')`,
          hasReport: sql<boolean>`${campusEvents.reportAt} is not null`,
        })
        .from(campusEvents)
        .where(sql`${campusEvents.startsAt} >= ${`${start}-06-01`}::date and ${campusEvents.startsAt} < ${`${start + 1}-06-01`}::date`)
        .orderBy(asc(campusEvents.startsAt));
    });
  }

  /** Participation by class: students in clubs, units, events attended and with achievements. */
  @Get('reports/participation')
  @Auth('user', LIFE_STAFF)
  participation(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({
          sectionId: sections.id,
          className: sections.displayName,
          students: sql<number>`count(*)::int`,
          inClubs: sql<number>`count(*) filter (where exists (select 1 from club_members m where m.student_id = ${students.id} and m.status = 'active'))::int`,
          inUnits: sql<number>`count(*) filter (where exists (select 1 from unit_members m where m.student_id = ${students.id} and m.status = 'active'))::int`,
          attendedEvents: sql<number>`count(*) filter (where exists (select 1 from event_registrations r where r.student_id = ${students.id} and r.checked_in_at is not null))::int`,
          withAchievements: sql<number>`count(*) filter (where exists (select 1 from student_achievements a where a.student_id = ${students.id} and a.status <> 'rejected'))::int`,
        })
        .from(students)
        .innerJoin(sections, eq(sections.id, students.sectionId))
        .where(eq(students.status, 'active'))
        .groupBy(sections.id, sections.displayName)
        .orderBy(asc(sections.displayName)),
    );
  }
}
