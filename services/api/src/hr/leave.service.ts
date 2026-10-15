import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { LeaveBalance, LeaveRequest, LeaveType } from '@zynetix/shared';
import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, sql } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { DelegationService } from '../delegation/delegation.service.js';
import type { Tx } from '../db/db.service.js';
import { leaveEncashments } from '../db/schema-hrpay.js';
import { compOffCredits } from '../db/schema-hr2.js';
import { approvalDelegations, leaveBalances, leaveRequests, leaveTypes, staffProfiles, teacherSubstitutions, timetableSlots, users } from '../db/schema.js';
import { SubstitutionsService } from '../timetable/substitutions.service.js';
import { eachDay } from './dates.js';
import { hrModuleSettings } from './hr-settings.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { texts } from '../notifications/texts.js';
import { HrService } from './hr.service.js';
import { HR_ROLES, isHr } from './hr.access.js';
import { accruedDays, availableDays, compOffAccrued, leaveRuleProblem, UNLIMITED_KINDS } from './leave-math.js';

type Who = { id: string | null; fullName: string | null };
import { workingDays } from './lop.js';

export const DEFAULT_LEAVE_TYPES = [
  { code: 'CL', name: 'Casual leave', paid: true, annualDays: 12, accrual: 'monthly', carryForwardMax: 0 },
  { code: 'SL', name: 'Sick leave', paid: true, annualDays: 10, accrual: 'yearly', carryForwardMax: 0 },
  { code: 'EL', name: 'Earned leave', paid: true, annualDays: 15, accrual: 'monthly', carryForwardMax: 30 },
  { code: 'LOP', name: 'Leave without pay', paid: false, annualDays: 0, accrual: 'yearly', carryForwardMax: 0, kind: 'unpaid' },
  { code: 'DL', name: 'Duty leave', paid: true, annualDays: 0, accrual: 'yearly', carryForwardMax: 0, kind: 'duty' },
  { code: 'CO', name: 'Compensatory off', paid: true, annualDays: 0, accrual: 'yearly', carryForwardMax: 0, kind: 'comp_off' },
  { code: 'ML', name: 'Maternity leave', paid: true, annualDays: 182, accrual: 'yearly', carryForwardMax: 0, kind: 'maternity', gender: 'female', countsHolidays: true, halfDayAllowed: false },
].map((t, i) => ({ ...t, sortOrder: (i + 1) * 10 }));

type TypeRow = typeof leaveTypes.$inferSelect;
const typeView = (t: TypeRow): LeaveType => ({
  id: t.id,
  code: t.code,
  name: t.name,
  paid: t.paid,
  annualDays: t.annualDays,
  accrual: t.accrual as LeaveType['accrual'],
  carryForwardMax: t.carryForwardMax,
  active: t.active,
  encashable: t.encashable,
  kind: t.kind,
  maxPerRequest: t.maxPerRequest,
  minNoticeDays: t.minNoticeDays,
  requiresDocument: t.requiresDocument,
  gender: t.gender,
  countsHolidays: t.countsHolidays,
  halfDayAllowed: t.halfDayAllowed,
  validDays: t.validDays,
});
/** A supporting document is asked for before approving requests of a type that needs one and are longer than this. */
export const DOCUMENT_AFTER_DAYS = 2;

@Injectable()
export class LeaveService {
  constructor(
    private readonly hr: HrService,
    private readonly delegation: DelegationService,
    private readonly notifications: NotificationsService,
    private readonly substitutions: SubstitutionsService,
  ) {}

  async types(tx: Tx, tenantId: string): Promise<TypeRow[]> {
    const existing = await tx.select().from(leaveTypes).limit(1);
    if (existing.length === 0) await tx.insert(leaveTypes).values(DEFAULT_LEAVE_TYPES.map((t) => ({ ...t, tenantId }))).onConflictDoNothing();
    return tx.select().from(leaveTypes).orderBy(asc(leaveTypes.sortOrder), asc(leaveTypes.code));
  }

  async balances(tx: Tx, tenantId: string, userId: string, year: number): Promise<LeaveBalance[]> {
    const types = (await this.types(tx, tenantId)).filter((t) => t.active && !['duty', 'special'].includes(t.kind));
    const [prof] = await tx.select({ joined: staffProfiles.dateOfJoining }).from(staffProfiles).where(eq(staffProfiles.userId, userId));
    const credits = await tx
      .select({ days: compOffCredits.days, expiresOn: compOffCredits.expiresOn })
      .from(compOffCredits)
      .where(and(eq(compOffCredits.userId, userId), eq(compOffCredits.status, 'approved'), gte(compOffCredits.workedOn, `${year}-01-01`), lte(compOffCredits.workedOn, `${year}-12-31`)));
    const opening = new Map((await tx.select().from(leaveBalances).where(and(eq(leaveBalances.userId, userId), eq(leaveBalances.year, year)))).map((b) => [b.leaveTypeId, b.opening]));
    const reqs = await tx
      .select({ typeId: leaveRequests.leaveTypeId, status: leaveRequests.status, days: leaveRequests.days })
      .from(leaveRequests)
      .where(and(eq(leaveRequests.userId, userId), inArray(leaveRequests.status, ['approved', 'pending', 'recommended']), gte(leaveRequests.fromDate, `${year}-01-01`), lte(leaveRequests.fromDate, `${year}-12-31`)));
    // Encashed days leave the balance: approved ones as used, pending ones as pending.
    const enc = await tx.select({ typeId: leaveEncashments.leaveTypeId, status: leaveEncashments.status, days: leaveEncashments.days }).from(leaveEncashments).where(and(eq(leaveEncashments.userId, userId), eq(leaveEncashments.year, year), inArray(leaveEncashments.status, ['approved', 'pending'])));
    const today = await this.hr.today(tx);
    return types.map((t) => {
      const sum = (...st: string[]) => [...reqs, ...enc].filter((r) => r.typeId === t.id && st.includes(r.status)).reduce((s, r) => s + r.days, 0);
      const used = sum('approved');
      const pending = sum('pending', 'recommended');
      const accrued =
        t.kind === 'comp_off'
          ? compOffAccrued(
              credits.filter((c) => c.expiresOn >= today).reduce((a, c) => a + c.days, 0),
              credits.filter((c) => c.expiresOn < today).reduce((a, c) => a + c.days, 0),
              used + pending,
            )
          : accruedDays({ annualDays: t.annualDays, accrual: t.accrual as 'yearly' }, year, today, prof?.joined ?? null);
      const b = { opening: opening.get(t.id) ?? 0, accrued, used, pending };
      return { leaveType: { id: t.id, code: t.code, name: t.name, paid: t.paid }, year, ...b, available: t.paid ? availableDays(b) : 0 };
    });
  }

  /** Next year's opening = min(closing balance, carry-forward cap) for paid types; idempotent. */
  async carryForward(tx: Tx, tenantId: string, fromYear: number): Promise<number> {
    const types = (await this.types(tx, tenantId)).filter((t) => t.active && t.paid && t.carryForwardMax > 0);
    const staff = await tx.select({ userId: staffProfiles.userId, joined: staffProfiles.dateOfJoining }).from(staffProfiles).where(ne(staffProfiles.status, 'exited'));
    let n = 0;
    for (const s of staff) {
      for (const t of types) {
        const [open] = await tx.select({ o: leaveBalances.opening }).from(leaveBalances).where(and(eq(leaveBalances.userId, s.userId), eq(leaveBalances.leaveTypeId, t.id), eq(leaveBalances.year, fromYear)));
        const [used] = await tx
          .select({ d: sql<number>`coalesce(sum(${leaveRequests.days}), 0)::float`.mapWith(Number) })
          .from(leaveRequests)
          .where(and(eq(leaveRequests.userId, s.userId), eq(leaveRequests.leaveTypeId, t.id), eq(leaveRequests.status, 'approved'), gte(leaveRequests.fromDate, `${fromYear}-01-01`), lte(leaveRequests.fromDate, `${fromYear}-12-31`)));
        const closing = (open?.o ?? 0) + accruedDays({ annualDays: t.annualDays, accrual: t.accrual as 'yearly' }, fromYear, `${fromYear}-12-31`, s.joined) - used.d;
        const carry = Math.min(Math.max(closing, 0), t.carryForwardMax);
        await tx
          .insert(leaveBalances)
          .values({ tenantId, userId: s.userId, leaveTypeId: t.id, year: fromYear + 1, opening: carry })
          .onConflictDoUpdate({ target: [leaveBalances.userId, leaveBalances.leaveTypeId, leaveBalances.year], set: { opening: carry } });
        n++;
      }
    }
    return n;
  }

  private select(tx: Tx) {
    return tx
      .select({
        r: leaveRequests,
        t: leaveTypes,
        u: { id: users.id, fullName: users.fullName },
        d: { id: sql<string | null>`d.id`, fullName: sql<string | null>`d.full_name` },
        rb: { id: sql<string | null>`rb.id`, fullName: sql<string | null>`rb.full_name` },
        ab: { id: sql<string | null>`ab.id`, fullName: sql<string | null>`ab.full_name` },
        dg: { id: sql<string | null>`dg.id`, fullName: sql<string | null>`dg.full_name` },
      })
      .from(leaveRequests)
      .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
      .innerJoin(users, eq(users.id, leaveRequests.userId))
      .leftJoin(sql`users d`, sql`d.id = ${leaveRequests.decidedBy}`)
      .leftJoin(sql`users rb`, sql`rb.id = ${leaveRequests.recommendedBy}`)
      .leftJoin(sql`users ab`, sql`ab.id = ${leaveRequests.appliedBy}`)
      .leftJoin(sql`users dg`, sql`dg.id = ${leaveRequests.delegateId}`);
  }

  private view(x: { r: typeof leaveRequests.$inferSelect; t: TypeRow; u: { id: string; fullName: string }; d: Who; rb: Who; ab: Who; dg: Who }): LeaveRequest {
    return {
      id: x.r.id,
      user: x.u,
      leaveType: { id: x.t.id, code: x.t.code, name: x.t.name, paid: x.t.paid },
      fromDate: x.r.fromDate,
      toDate: x.r.toDate,
      halfDay: x.r.halfDay,
      days: x.r.days,
      reason: x.r.reason,
      status: x.r.status as LeaveRequest['status'],
      decidedBy: x.d.id ? { id: x.d.id, fullName: x.d.fullName! } : null,
      decidedAt: x.r.decidedAt?.toISOString() ?? null,
      decisionNote: x.r.decisionNote,
      recommendedBy: x.rb.id ? { id: x.rb.id, fullName: x.rb.fullName! } : null,
      recommendedAt: x.r.recommendedAt?.toISOString() ?? null,
      recommendNote: x.r.recommendNote,
      appliedBy: x.ab.id ? { id: x.ab.id, fullName: x.ab.fullName! } : null,
      delegate: x.dg.id ? { id: x.dg.id, fullName: x.dg.fullName! } : null,
      hasDocument: !!x.r.documentKey,
      documentName: x.r.documentName,
      revokedReason: x.r.revokedReason,
      createdAt: x.r.createdAt.toISOString(),
    };
  }

  async get(tx: Tx, id: string): Promise<LeaveRequest> {
    const [x] = await this.select(tx).where(eq(leaveRequests.id, id));
    if (!x) throw new NotFoundException('Leave request not found');
    return this.view(x);
  }

  /** HR sees every request; a head of department those of the departments they head; others only their own. */
  async list(tx: Tx, p: UserPrincipal, filter: { status?: string; userId?: string; mine?: boolean }): Promise<LeaveRequest[]> {
    const conds = [filter.status ? eq(leaveRequests.status, filter.status) : undefined, filter.userId ? eq(leaveRequests.userId, filter.userId) : undefined];
    if (filter.mine || !(isHr(p) || p.roles.includes('hod'))) conds.push(eq(leaveRequests.userId, p.userId));
    else if (!isHr(p)) {
      const heads = await this.headedStaff(tx, p.userId);
      conds.push(inArray(leaveRequests.userId, heads.length ? heads : ['00000000-0000-0000-0000-000000000000']));
    }
    const rows = await this.select(tx).where(and(...conds)).orderBy(desc(leaveRequests.createdAt)).limit(500);
    return rows.map((x) => this.view(x));
  }

  /** Staff of the departments a user heads. */
  async headedStaff(tx: Tx, headId: string): Promise<string[]> {
    const rows = await tx.execute<{ user_id: string }>(sql`
      select sp.user_id from staff_profiles sp join departments d on d.id = sp.department_id where d.head_user_id = ${headId}::uuid
      union select ds.user_id from department_staff ds join departments d on d.id = ds.department_id where d.head_user_id = ${headId}::uuid`);
    return rows.rows.map((r) => r.user_id);
  }

  async apply(tx: Tx, p: UserPrincipal, body: { leaveTypeId: string; fromDate: string; toDate: string; halfDay: boolean; reason: string; userId?: string; delegateId?: string | null }): Promise<LeaveRequest> {
    const applicant = body.userId ?? p.userId;
    const onBehalf = applicant !== p.userId;
    if (onBehalf && !isHr(p)) throw new ForbiddenException("Only HR can apply for leave on someone else's behalf");
    if (onBehalf && !(await this.hr.isStaff(tx, applicant))) throw new NotFoundException('Staff member not found');
    if (body.delegateId === applicant) throw new BadRequestException('Choose a colleague other than the applicant to approve in their place');
    if (body.delegateId && !(await this.hr.isStaff(tx, body.delegateId))) throw new NotFoundException('Colleague not found');
    if (body.toDate < body.fromDate) throw new BadRequestException('The end date is before the start date');
    if (body.halfDay && body.fromDate !== body.toDate) throw new BadRequestException('A half day is a single day');
    if (body.fromDate.slice(0, 4) !== body.toDate.slice(0, 4)) throw new BadRequestException('Apply separately for each calendar year');
    await this.hr.assertMonthOpen(tx, body.fromDate);
    if (body.toDate.slice(0, 7) !== body.fromDate.slice(0, 7)) await this.hr.assertMonthOpen(tx, body.toDate);
    const [type] = await tx.select().from(leaveTypes).where(and(eq(leaveTypes.id, body.leaveTypeId), eq(leaveTypes.active, true)));
    if (!type) throw new NotFoundException('Leave type not found');
    const settings = await this.hr.settings(tx, p.tenantId);
    const holidays = new Set((await this.hr.holidayDates(tx, body.fromDate, body.toDate)).map((h) => h.date));
    const working = type.countsHolidays ? eachDay(body.fromDate, body.toDate).length : workingDays(body.fromDate, body.toDate, settings.weeklyOffs, holidays);
    if (working === 0) throw new BadRequestException('Those dates are weekly offs or holidays: no leave is needed');
    const days = body.halfDay ? 0.5 : working;
    const [who] = await tx.select({ gender: staffProfiles.gender }).from(staffProfiles).where(eq(staffProfiles.userId, applicant));
    const today = await this.hr.today(tx);
    const problem = leaveRuleProblem(type, { days, halfDay: body.halfDay, noticeDays: Math.round((Date.parse(body.fromDate) - Date.parse(today)) / 86_400_000), gender: who?.gender ?? null, onBehalf });
    if (problem) throw new BadRequestException(problem);
    const [overlap] = await tx
      .select({ id: leaveRequests.id })
      .from(leaveRequests)
      .where(and(eq(leaveRequests.userId, applicant), inArray(leaveRequests.status, ['pending', 'recommended', 'approved']), lte(leaveRequests.fromDate, body.toDate), gte(leaveRequests.toDate, body.fromDate)));
    if (overlap) throw new ConflictException(onBehalf ? 'This staff member already has leave on some of these dates' : 'You already have leave on some of these dates');
    if (type.paid && !UNLIMITED_KINDS.includes(type.kind)) {
      const bal = (await this.balances(tx, p.tenantId, applicant, Number(body.fromDate.slice(0, 4)))).find((b) => b.leaveType.id === type.id);
      if (!bal || bal.available < days) throw new ConflictException(`Not enough ${type.name} left (${bal?.available ?? 0} days available)`);
    }
    const [row] = await tx
      .insert(leaveRequests)
      .values({ tenantId: p.tenantId, userId: applicant, leaveTypeId: type.id, fromDate: body.fromDate, toDate: body.toDate, halfDay: body.halfDay, days, reason: body.reason, appliedBy: onBehalf ? p.userId : null, delegateId: body.delegateId ?? null })
      .returning();
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'leave.applied', subjectType: 'leave_request', subjectId: row.id, data: { type: type.code, from: body.fromDate, to: body.toDate, days, ...(onBehalf ? { onBehalfOf: applicant } : {}) } });
    const approvers = (await this.approvers(tx, applicant)).filter((x) => x !== p.userId);
    const [me] = await tx.select({ fullName: users.fullName }).from(users).where(eq(users.id, applicant));
    await this.notifications.notifyUsers(tx, approvers, { kind: 'leave', text: texts.leaveRequested({ name: me.fullName, from: body.fromDate, to: body.toDate, days }), data: { leaveRequestId: row.id }, dedupeKey: `leave-req:${row.id}` });
    return this.get(tx, row.id);
  }

  /** HR roles plus the head of the applicant's department(s). */
  private async approvers(tx: Tx, applicantId: string): Promise<string[]> {
    const rows = await tx.execute<{ id: string }>(sql`
      select distinct ur.user_id as id from user_roles ur where ur.role in ('hr_manager', 'principal', 'tenant_admin')
      union select d.head_user_id from departments d where d.head_user_id is not null and (
        d.id in (select department_id from staff_profiles where user_id = ${applicantId}::uuid)
        or d.id in (select department_id from department_staff where user_id = ${applicantId}::uuid))`);
    return rows.rows.map((r) => r.id).filter((id) => id !== applicantId);
  }

  async decide(tx: Tx, p: UserPrincipal, id: string, status: 'approved' | 'rejected', note: string | null): Promise<LeaveRequest> {
    const [req] = await tx.select().from(leaveRequests).where(eq(leaveRequests.id, id)).for('update');
    if (!req) throw new NotFoundException('Leave request not found');
    if (req.userId === p.userId) throw new ForbiddenException('You cannot decide your own leave');
    let onBehalfOf: string | null = null;
    let asHr = isHr(p);
    if (!isHr(p) && !(await this.headedStaff(tx, p.userId)).includes(req.userId)) {
      // Not mine to decide, unless a colleague who can has delegated their approvals to me for these dates.
      for (const d of await this.delegation.activeDelegators(tx, p.userId, 'leave')) {
        if (d.id === req.userId) continue;
        if (d.roles.some((r) => HR_ROLES.includes(r)) || (await this.headedStaff(tx, d.id)).includes(req.userId)) {
          onBehalfOf = d.id;
          asHr = d.roles.some((r) => HR_ROLES.includes(r));
          break;
        }
      }
      if (!onBehalfOf) {
        if (!p.roles.includes('hod')) throw new ForbiddenException('Only HR, a head of department or a delegate can decide leave');
        throw new NotFoundException('Leave request not found');
      }
    }
    // With two approval levels the head of department recommends and the principal or HR approves.
    const twoLevel = (await hrModuleSettings(tx, p.tenantId)).leaveLevels === 2;
    if (!(req.status === 'pending' || (req.status === 'recommended' && asHr))) throw new ConflictException(req.status === 'recommended' ? 'This request is waiting for the principal or HR' : `This request is already ${req.status}`);
    if (status === 'approved' && twoLevel && !asHr) {
      await tx.update(leaveRequests).set({ status: 'recommended', recommendedBy: p.userId, recommendedAt: new Date(), recommendNote: note }).where(eq(leaveRequests.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'leave.recommended', subjectType: 'leave_request', subjectId: id, data: { applicant: req.userId, from: req.fromDate, to: req.toDate, days: req.days, ...(onBehalfOf ? { onBehalfOf } : {}) } });
      const [me] = await tx.select({ fullName: users.fullName }).from(users).where(eq(users.id, req.userId));
      const hr = await tx.execute<{ id: string }>(sql`select distinct user_id as id from user_roles where role in ('hr_manager', 'principal', 'tenant_admin')`);
      await this.notifications.notifyUsers(tx, hr.rows.map((r) => r.id).filter((x) => x !== req.userId), { kind: 'leave', text: texts.leaveRecommended({ name: me?.fullName ?? '', from: req.fromDate, to: req.toDate, days: req.days }), data: { leaveRequestId: id }, dedupeKey: `leave-rec:${id}` });
      return this.get(tx, id);
    }
    let delegationId: string | null = null;
    if (status === 'approved') {
      await this.hr.assertMonthOpen(tx, req.fromDate);
      await this.hr.assertMonthOpen(tx, req.toDate);
      const [type] = await tx.select({ requiresDocument: leaveTypes.requiresDocument, name: leaveTypes.name }).from(leaveTypes).where(eq(leaveTypes.id, req.leaveTypeId));
      if (type?.requiresDocument && req.days > DOCUMENT_AFTER_DAYS && !req.documentKey) throw new ConflictException(`Attach the supporting document before approving ${type.name} of more than ${DOCUMENT_AFTER_DAYS} days`);
      if (req.delegateId) {
        const [d] = await tx.insert(approvalDelegations).values({ tenantId: p.tenantId, delegatorId: req.userId, delegateId: req.delegateId, scope: 'all', startsOn: req.fromDate, endsOn: req.toDate, reason: `On leave ${req.fromDate} to ${req.toDate}` }).returning({ id: approvalDelegations.id });
        delegationId = d.id;
        await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'delegation.created', subjectType: 'approval_delegation', subjectId: d.id, data: { delegateId: req.delegateId, scope: 'all', from: req.fromDate, to: req.toDate, leaveRequestId: id } });
      }
    }
    await tx.update(leaveRequests).set({ status, decidedBy: p.userId, decidedAt: new Date(), decisionNote: note, ...(delegationId ? { delegationId } : {}) }).where(eq(leaveRequests.id, id));
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: `leave.${status}`, subjectType: 'leave_request', subjectId: id, data: { applicant: req.userId, from: req.fromDate, to: req.toDate, days: req.days, ...(onBehalfOf ? { onBehalfOf } : {}) } });
    await this.notifications.notifyUsers(tx, [req.userId], { kind: 'leave', text: texts.leaveDecided({ status, from: req.fromDate, to: req.toDate, note }), data: { leaveRequestId: id }, dedupeKey: `leave-dec:${id}` }, { replace: true });
    return this.get(tx, id);
  }

  async cancel(tx: Tx, p: UserPrincipal, id: string): Promise<LeaveRequest> {
    const [req] = await tx.select().from(leaveRequests).where(and(eq(leaveRequests.id, id), eq(leaveRequests.userId, p.userId))).for('update');
    if (!req) throw new NotFoundException('Leave request not found');
    const today = await this.hr.today(tx);
    if (!(req.status === 'pending' || (req.status === 'approved' && req.fromDate > today))) throw new ConflictException('This leave can no longer be cancelled');
    await this.hr.assertMonthOpen(tx, req.fromDate);
    await tx.update(leaveRequests).set({ status: 'cancelled', decidedAt: new Date() }).where(eq(leaveRequests.id, id));
    await this.endDelegation(tx, p, req.delegationId);
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'leave.cancelled', subjectType: 'leave_request', subjectId: id, data: { was: req.status } });
    return this.get(tx, id);
  }

  private async endDelegation(tx: Tx, p: UserPrincipal, delegationId: string | null) {
    if (!delegationId) return;
    const [d] = await tx.update(approvalDelegations).set({ revokedAt: new Date(), revokedBy: p.userId }).where(and(eq(approvalDelegations.id, delegationId), isNull(approvalDelegations.revokedAt))).returning({ id: approvalDelegations.id });
    if (d) await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'delegation.revoked', subjectType: 'approval_delegation', subjectId: d.id, data: { reason: 'leave cancelled' } });
  }

  /**
   * HR withdraws approved leave (the person came back early, or it was granted by mistake), even when it has
   * started, as long as payroll for those months is not locked. Substitutes still to come are released.
   */
  async revoke(tx: Tx, p: UserPrincipal, id: string, reason: string): Promise<LeaveRequest> {
    if (!isHr(p)) throw new ForbiddenException('Only HR can withdraw approved leave');
    const [req] = await tx.select().from(leaveRequests).where(eq(leaveRequests.id, id)).for('update');
    if (!req) throw new NotFoundException('Leave request not found');
    if (req.status !== 'approved') throw new ConflictException('Only approved leave can be withdrawn');
    if (req.userId === p.userId) throw new ForbiddenException('You cannot withdraw your own leave this way: cancel it instead');
    await this.hr.assertMonthOpen(tx, req.fromDate);
    await this.hr.assertMonthOpen(tx, req.toDate);
    await tx.update(leaveRequests).set({ status: 'cancelled', revokedReason: reason, decidedBy: p.userId, decidedAt: new Date() }).where(eq(leaveRequests.id, id));
    await this.endDelegation(tx, p, req.delegationId);
    const today = await this.hr.today(tx);
    await tx.update(teacherSubstitutions).set({ status: 'cancelled' }).where(and(eq(teacherSubstitutions.leaveRequestId, id), eq(teacherSubstitutions.status, 'assigned'), gte(teacherSubstitutions.date, today)));
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'leave.revoked', subjectType: 'leave_request', subjectId: id, data: { reason, from: req.fromDate, to: req.toDate } });
    await this.notifications.notifyUsers(tx, [req.userId], { kind: 'leave', text: texts.leaveDecided({ status: 'rejected', from: req.fromDate, to: req.toDate, note: reason }), data: { leaveRequestId: id }, dedupeKey: `leave-rev:${id}` });
    return this.get(tx, id);
  }

  /**
   * Covers the periods of approved leave with substitutes: for each day still to come and each timetable period
   * of the teacher that nobody covers yet, the best free colleague (same subject first, then the same department,
   * then the lightest day). Periods nobody is free for are reported.
   */
  async arrangeSubstitutes(tx: Tx, p: UserPrincipal, id: string) {
    const [req] = await tx.select().from(leaveRequests).where(eq(leaveRequests.id, id));
    if (!req) throw new NotFoundException('Leave request not found');
    if (req.status !== 'approved') throw new ConflictException('Substitutes are arranged for approved leave');
    const today = await this.hr.today(tx);
    const from = req.fromDate > today ? req.fromDate : today;
    if (from > req.toDate) throw new ConflictException('This leave is already over');
    const slots = await tx.select({ id: timetableSlots.id, day: timetableSlots.dayOfWeek }).from(timetableSlots).where(and(eq(timetableSlots.teacherId, req.userId), isNull(timetableSlots.archivedAt)));
    const done = await tx
      .select({ slotId: teacherSubstitutions.slotId, date: teacherSubstitutions.date })
      .from(teacherSubstitutions)
      .where(and(eq(teacherSubstitutions.originalTeacherId, req.userId), eq(teacherSubstitutions.status, 'assigned'), gte(teacherSubstitutions.date, from), lte(teacherSubstitutions.date, req.toDate)));
    const covered = new Set(done.map((c) => `${c.slotId}:${c.date}`));
    const assigned: { date: string; slotId: string; subject: string; section: string; substitute: string }[] = [];
    const uncovered: { date: string; slotId: string; subject: string; section: string }[] = [];
    for (const date of eachDay(from, req.toDate)) {
      const isoDay = ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
      for (const s of slots.filter((x) => x.day === isoDay)) {
        if (covered.has(`${s.id}:${date}`)) continue;
        const sug = await this.substitutions.suggest(tx, s.id, date);
        const pick = sug.candidates[0];
        if (!pick) {
          uncovered.push({ date, slotId: s.id, subject: sug.subject, section: sug.section });
          continue;
        }
        await this.substitutions.assign(tx, { tenantId: p.tenantId, userId: p.userId }, { slotId: s.id, date, substituteTeacherId: pick.id, reason: 'Leave arrangement' });
        assigned.push({ date, slotId: s.id, subject: sug.subject, section: sug.section, substitute: pick.fullName });
      }
    }
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'leave.substitutes_arranged', subjectType: 'leave_request', subjectId: id, data: { assigned: assigned.length, uncovered: uncovered.length } });
    return { assigned, uncovered };
  }


  typeView = typeView;
}
