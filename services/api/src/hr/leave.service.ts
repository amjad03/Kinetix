import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { LeaveBalance, LeaveRequest, LeaveType } from '@kinetix/shared';
import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { DelegationService } from '../delegation/delegation.service.js';
import type { Tx } from '../db/db.service.js';
import { leaveBalances, leaveRequests, leaveTypes, staffProfiles, users } from '../db/schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { texts } from '../notifications/texts.js';
import { HrService } from './hr.service.js';
import { HR_ROLES, isHr } from './hr.access.js';
import { accruedDays, availableDays } from './leave-math.js';
import { workingDays } from './lop.js';

export const DEFAULT_LEAVE_TYPES = [
  { code: 'CL', name: 'Casual leave', paid: true, annualDays: 12, accrual: 'monthly', carryForwardMax: 0 },
  { code: 'SL', name: 'Sick leave', paid: true, annualDays: 10, accrual: 'yearly', carryForwardMax: 0 },
  { code: 'EL', name: 'Earned leave', paid: true, annualDays: 15, accrual: 'monthly', carryForwardMax: 30 },
  { code: 'LOP', name: 'Leave without pay', paid: false, annualDays: 0, accrual: 'yearly', carryForwardMax: 0 },
] as const;

type TypeRow = typeof leaveTypes.$inferSelect;
const typeView = (t: TypeRow): LeaveType => ({ id: t.id, code: t.code, name: t.name, paid: t.paid, annualDays: t.annualDays, accrual: t.accrual as LeaveType['accrual'], carryForwardMax: t.carryForwardMax, active: t.active });

@Injectable()
export class LeaveService {
  constructor(
    private readonly hr: HrService,
    private readonly delegation: DelegationService,
    private readonly notifications: NotificationsService,
  ) {}

  async types(tx: Tx, tenantId: string): Promise<TypeRow[]> {
    const existing = await tx.select().from(leaveTypes).limit(1);
    if (existing.length === 0) await tx.insert(leaveTypes).values(DEFAULT_LEAVE_TYPES.map((t) => ({ ...t, tenantId }))).onConflictDoNothing();
    return tx.select().from(leaveTypes).orderBy(asc(leaveTypes.code));
  }

  async balances(tx: Tx, tenantId: string, userId: string, year: number): Promise<LeaveBalance[]> {
    const types = (await this.types(tx, tenantId)).filter((t) => t.active);
    const [prof] = await tx.select({ joined: staffProfiles.dateOfJoining }).from(staffProfiles).where(eq(staffProfiles.userId, userId));
    const opening = new Map((await tx.select().from(leaveBalances).where(and(eq(leaveBalances.userId, userId), eq(leaveBalances.year, year)))).map((b) => [b.leaveTypeId, b.opening]));
    const reqs = await tx
      .select({ typeId: leaveRequests.leaveTypeId, status: leaveRequests.status, days: leaveRequests.days })
      .from(leaveRequests)
      .where(and(eq(leaveRequests.userId, userId), inArray(leaveRequests.status, ['approved', 'pending']), gte(leaveRequests.fromDate, `${year}-01-01`), lte(leaveRequests.fromDate, `${year}-12-31`)));
    const today = await this.hr.today(tx);
    return types.map((t) => {
      const sum = (st: string) => reqs.filter((r) => r.typeId === t.id && r.status === st).reduce((s, r) => s + r.days, 0);
      const b = { opening: opening.get(t.id) ?? 0, accrued: accruedDays({ annualDays: t.annualDays, accrual: t.accrual as 'yearly' }, year, today, prof?.joined ?? null), used: sum('approved'), pending: sum('pending') };
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
      .select({ r: leaveRequests, t: leaveTypes, u: { id: users.id, fullName: users.fullName }, d: { id: sql<string | null>`d.id`, fullName: sql<string | null>`d.full_name` } })
      .from(leaveRequests)
      .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
      .innerJoin(users, eq(users.id, leaveRequests.userId))
      .leftJoin(sql`users d`, sql`d.id = ${leaveRequests.decidedBy}`);
  }

  private view(x: { r: typeof leaveRequests.$inferSelect; t: TypeRow; u: { id: string; fullName: string }; d: { id: string | null; fullName: string | null } }): LeaveRequest {
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

  async apply(tx: Tx, p: UserPrincipal, body: { leaveTypeId: string; fromDate: string; toDate: string; halfDay: boolean; reason: string }): Promise<LeaveRequest> {
    if (body.toDate < body.fromDate) throw new BadRequestException('The end date is before the start date');
    if (body.halfDay && body.fromDate !== body.toDate) throw new BadRequestException('A half day is a single day');
    if (body.fromDate.slice(0, 4) !== body.toDate.slice(0, 4)) throw new BadRequestException('Apply separately for each calendar year');
    await this.hr.assertMonthOpen(tx, body.fromDate);
    if (body.toDate.slice(0, 7) !== body.fromDate.slice(0, 7)) await this.hr.assertMonthOpen(tx, body.toDate);
    const [type] = await tx.select().from(leaveTypes).where(and(eq(leaveTypes.id, body.leaveTypeId), eq(leaveTypes.active, true)));
    if (!type) throw new NotFoundException('Leave type not found');
    const settings = await this.hr.settings(tx, p.tenantId);
    const holidays = new Set((await this.hr.holidayDates(tx, body.fromDate, body.toDate)).map((h) => h.date));
    const working = workingDays(body.fromDate, body.toDate, settings.weeklyOffs, holidays);
    if (working === 0) throw new BadRequestException('Those dates are weekly offs or holidays: no leave is needed');
    const days = body.halfDay ? 0.5 : working;
    const [overlap] = await tx
      .select({ id: leaveRequests.id })
      .from(leaveRequests)
      .where(and(eq(leaveRequests.userId, p.userId), inArray(leaveRequests.status, ['pending', 'approved']), lte(leaveRequests.fromDate, body.toDate), gte(leaveRequests.toDate, body.fromDate)));
    if (overlap) throw new ConflictException('You already have leave on some of these dates');
    if (type.paid) {
      const bal = (await this.balances(tx, p.tenantId, p.userId, Number(body.fromDate.slice(0, 4)))).find((b) => b.leaveType.id === type.id);
      if (!bal || bal.available < days) throw new ConflictException(`Not enough ${type.name} left (${bal?.available ?? 0} days available)`);
    }
    const [row] = await tx.insert(leaveRequests).values({ tenantId: p.tenantId, userId: p.userId, leaveTypeId: type.id, fromDate: body.fromDate, toDate: body.toDate, halfDay: body.halfDay, days, reason: body.reason }).returning();
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'leave.applied', subjectType: 'leave_request', subjectId: row.id, data: { type: type.code, from: body.fromDate, to: body.toDate, days } });
    const approvers = await this.approvers(tx, p.userId);
    const [me] = await tx.select({ fullName: users.fullName }).from(users).where(eq(users.id, p.userId));
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
    if (!isHr(p) && !(await this.headedStaff(tx, p.userId)).includes(req.userId)) {
      // Not mine to decide, unless a colleague who can has delegated their approvals to me for these dates.
      for (const d of await this.delegation.activeDelegators(tx, p.userId, 'leave')) {
        if (d.id === req.userId) continue;
        if (d.roles.some((r) => HR_ROLES.includes(r)) || (await this.headedStaff(tx, d.id)).includes(req.userId)) {
          onBehalfOf = d.id;
          break;
        }
      }
      if (!onBehalfOf) {
        if (!p.roles.includes('hod')) throw new ForbiddenException('Only HR, a head of department or a delegate can decide leave');
        throw new NotFoundException('Leave request not found');
      }
    }
    if (req.status !== 'pending') throw new ConflictException(`This request is already ${req.status}`);
    if (status === 'approved') {
      await this.hr.assertMonthOpen(tx, req.fromDate);
      await this.hr.assertMonthOpen(tx, req.toDate);
    }
    await tx.update(leaveRequests).set({ status, decidedBy: p.userId, decidedAt: new Date(), decisionNote: note }).where(eq(leaveRequests.id, id));
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
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'leave.cancelled', subjectType: 'leave_request', subjectId: id, data: { was: req.status } });
    return this.get(tx, id);
  }

  typeView = typeView;
}
