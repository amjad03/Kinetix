import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import type { Tx } from '../db/db.service.js';
import { payrollRuns, staffProfiles, users } from '../db/schema.js';
import { payrollAdjustments } from '../db/schema-depth.js';
import { reimbursementClaims } from '../db/schema-hr3.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { texts } from '../notifications/texts.js';
import { monthTakesAdjustments } from './hr-depth.controller.js';
import { hasAnyRole, PAYROLL_ROLES } from './hr.access.js';
import { HrService } from './hr.service.js';
import { hrModuleSettings } from './hr-settings.js';
import { fyLabel, fyOfDate } from './tax-declarations.service.js';

export const CLAIM_CATEGORIES = ['travel', 'conference', 'books', 'telephone', 'medical', 'fuel', 'other'] as const;
export type ClaimCategory = (typeof CLAIM_CATEGORIES)[number];

/**
 * Bills for official travel, conferences, books and journals, and telephone are reimbursed tax free (section 10(14));
 * medical, fuel and anything else is taxable salary. None of it is wages for ESI or professional tax.
 */
export const TAX_FREE: ClaimCategory[] = ['travel', 'conference', 'books', 'telephone'];

type Claim = typeof reimbursementClaims.$inferSelect;

/** Shown status: an approved claim is paid once the payroll run carrying it is locked. */
export const claimStatusSql = sql<string>`case when ${reimbursementClaims.status} = 'approved' and exists (select 1 from payroll_adjustments a join payroll_runs r on r.id = a.run_id where a.id = ${reimbursementClaims.adjustmentId} and r.status = 'locked') then 'paid' else ${reimbursementClaims.status} end`;

@Injectable()
export class ReimbursementsService {
  constructor(
    private readonly hr: HrService,
    private readonly notifications: NotificationsService,
  ) {}

  async view(tx: Tx, c: Claim) {
    const [u] = await tx.select({ fullName: users.fullName, code: staffProfiles.employeeCode }).from(users).leftJoin(staffProfiles, eq(staffProfiles.userId, users.id)).where(eq(users.id, c.userId));
    const paid = c.adjustmentId ? (await tx.select({ status: payrollRuns.status }).from(payrollAdjustments).innerJoin(payrollRuns, eq(payrollRuns.id, payrollAdjustments.runId)).where(eq(payrollAdjustments.id, c.adjustmentId)))[0]?.status === 'locked' : false;
    return {
      id: c.id,
      claimNo: c.claimNo,
      userId: c.userId,
      fullName: u?.fullName ?? '',
      employeeCode: u?.code ?? null,
      category: c.category,
      taxFree: TAX_FREE.includes(c.category as ClaimCategory),
      spentOn: c.spentOn,
      amountPaise: c.amountPaise,
      approvedPaise: c.approvedPaise,
      description: c.description,
      billName: c.billName,
      hasBill: !!c.billKey,
      status: c.status === 'approved' && paid ? 'paid' : c.status,
      payMonth: c.payMonth,
      decisionNote: c.decisionNote,
      decidedAt: c.decidedAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
    };
  }

  async load(tx: Tx, id: string, forUpdate = false): Promise<Claim> {
    const q = tx.select().from(reimbursementClaims).where(eq(reimbursementClaims.id, id));
    const [c] = forUpdate ? await q.for('update') : await q;
    if (!c) throw new NotFoundException('Claim not found');
    return c;
  }

  /** What a staff member has claimed (not rejected or cancelled) in a category this financial year. */
  private async claimedThisYear(tx: Tx, userId: string, category: string, fy: number, except?: string) {
    const [r] = await tx
      .select({ n: sql<number>`coalesce(sum(coalesce(${reimbursementClaims.approvedPaise}, ${reimbursementClaims.amountPaise})), 0)::bigint`.mapWith(Number) })
      .from(reimbursementClaims)
      .where(and(eq(reimbursementClaims.userId, userId), eq(reimbursementClaims.category, category), inArray(reimbursementClaims.status, ['submitted', 'approved']), gte(reimbursementClaims.spentOn, `${fy}-04-01`), lte(reimbursementClaims.spentOn, `${fy + 1}-03-31`), except ? ne(reimbursementClaims.id, except) : undefined));
    return r?.n ?? 0;
  }

  async create(tx: Tx, p: UserPrincipal, b: { category: ClaimCategory; spentOn: string; amountPaise: number; description: string }) {
    if (!(await this.hr.isStaff(tx, p.userId))) throw new ForbiddenException('Only staff claim reimbursements');
    const today = await this.hr.today(tx);
    if (b.spentOn > today) throw new BadRequestException('The bill date is in the future');
    const fy = fyOfDate(b.spentOn);
    if (fy < fyOfDate(today) - 1) throw new BadRequestException('Bills from before last financial year cannot be claimed');
    const limit = (await hrModuleSettings(tx, p.tenantId)).reimbursementLimits?.[b.category];
    if (limit !== undefined) {
      const used = await this.claimedThisYear(tx, p.userId, b.category, fy);
      if (used + b.amountPaise > limit) throw new ConflictException(`This takes your ${b.category} claims past the yearly limit of ₹${(limit / 100).toLocaleString('en-IN')} (₹${(used / 100).toLocaleString('en-IN')} claimed)`);
    }
    // Claim numbers run per financial year; the advisory lock keeps two claims from taking the same one.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${p.tenantId}:reimbursement`}))`);
    const prefix = `RB/${fyLabel(fyOfDate(today))}/`;
    const [n] = await tx.select({ n: sql<number>`count(*)::int` }).from(reimbursementClaims).where(sql`${reimbursementClaims.claimNo} like ${`${prefix}%`}`);
    const claimNo = `${prefix}${String((n?.n ?? 0) + 1).padStart(4, '0')}`;
    const [c] = await tx.insert(reimbursementClaims).values({ tenantId: p.tenantId, claimNo, userId: p.userId, category: b.category, spentOn: b.spentOn, amountPaise: b.amountPaise, description: b.description }).returning();
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'reimbursement.claimed', subjectType: 'reimbursement_claim', subjectId: c.id, after: { claimNo, category: b.category, amountPaise: b.amountPaise, spentOn: b.spentOn } });
    const [me] = await tx.select({ fullName: users.fullName }).from(users).where(eq(users.id, p.userId));
    const approvers = (await tx.execute<{ id: string }>(sql`select distinct user_id as id from user_roles where role in ('hr_manager', 'principal')`)).rows.map((r) => r.id).filter((x) => x !== p.userId);
    await this.notifications.notifyUsers(tx, approvers, { kind: 'task', text: texts.reimbursementSubmitted({ name: me.fullName, claimNo, amountPaise: b.amountPaise }), data: { claimId: c.id }, dedupeKey: `reimb:${c.id}` });
    return c;
  }

  async cancel(tx: Tx, p: UserPrincipal, id: string) {
    const c = await this.load(tx, id, true);
    if (c.userId !== p.userId) throw new NotFoundException('Claim not found');
    if (c.status !== 'submitted') throw new ConflictException(`A ${c.status} claim cannot be cancelled`);
    await tx.update(reimbursementClaims).set({ status: 'cancelled' }).where(eq(reimbursementClaims.id, id));
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'reimbursement.cancelled', subjectType: 'reimbursement_claim', subjectId: id, changes: { status: { before: c.status, after: 'cancelled' } } });
    return this.load(tx, id);
  }

  /**
   * Approves a claim (for the amount the bill supports) onto a pay month: it becomes an approved payroll adjustment,
   * paid on that month's payslip, tax free or taxable by category. Rejecting needs a note.
   */
  async decide(tx: Tx, p: UserPrincipal, id: string, b: { approve: boolean; approvedPaise?: number; payMonth?: string; note: string }) {
    const c = await this.load(tx, id, true);
    if (c.userId === p.userId) throw new ForbiddenException('Someone else decides your own claim');
    if (c.status !== 'submitted') throw new ConflictException(`This claim is already ${c.status}`);
    const now = new Date();
    if (!b.approve) {
      if (b.note.length < 3) throw new BadRequestException('Say why the claim is rejected');
      await tx.update(reimbursementClaims).set({ status: 'rejected', decidedBy: p.userId, decidedAt: now, decisionNote: b.note }).where(eq(reimbursementClaims.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'reimbursement.rejected', subjectType: 'reimbursement_claim', subjectId: id, changes: { status: { before: 'submitted', after: 'rejected' } }, data: { note: b.note } });
      await this.notifications.notifyUsers(tx, [c.userId], { kind: 'task', text: texts.reimbursementDecided({ approved: false, claimNo: c.claimNo, amountPaise: c.amountPaise, note: b.note }), data: { claimId: id }, dedupeKey: `reimb-dec:${id}` });
      return this.load(tx, id);
    }
    const amount = b.approvedPaise ?? c.amountPaise;
    if (amount <= 0 || amount > c.amountPaise) throw new BadRequestException('Approve up to the amount claimed');
    const payMonth = b.payMonth ?? (await this.hr.today(tx)).slice(0, 7);
    if (!(await monthTakesAdjustments(tx, payMonth))) throw new ConflictException(`The payroll of ${payMonth} is locked: choose a later month`);
    const taxFree = TAX_FREE.includes(c.category as ClaimCategory);
    const [adj] = await tx
      .insert(payrollAdjustments)
      .values({ tenantId: p.tenantId, userId: c.userId, kind: 'reimbursement', payMonth, amountPaise: amount, reason: `${c.claimNo} ${c.category}${c.description ? `: ${c.description.slice(0, 80)}` : ''}`, status: 'approved', taxable: !taxFree, wage: false, createdBy: p.userId, decidedBy: p.userId, decidedAt: now })
      .returning({ id: payrollAdjustments.id });
    await tx.update(reimbursementClaims).set({ status: 'approved', approvedPaise: amount, payMonth, adjustmentId: adj.id, decidedBy: p.userId, decidedAt: now, decisionNote: b.note }).where(eq(reimbursementClaims.id, id));
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'reimbursement.approved', subjectType: 'reimbursement_claim', subjectId: id, changes: { status: { before: 'submitted', after: 'approved' } }, data: { approvedPaise: amount, payMonth, taxable: !taxFree, adjustmentId: adj.id } });
    await this.notifications.notifyUsers(tx, [c.userId], { kind: 'task', text: texts.reimbursementDecided({ approved: true, claimNo: c.claimNo, amountPaise: amount, payMonth, note: b.note }), data: { claimId: id }, dedupeKey: `reimb-dec:${id}` });
    return this.load(tx, id);
  }

  /** A claim for its owner or payroll staff. */
  async visible(tx: Tx, p: UserPrincipal, id: string) {
    const c = await this.load(tx, id);
    if (c.userId !== p.userId && !hasAnyRole(p, PAYROLL_ROLES)) throw new NotFoundException('Claim not found');
    return c;
  }

  /**
   * Approved claims set to be paid in a month after `lastMonth` (when the staff member is no longer on payroll), for the
   * full and final settlement. Claims due by the last month go on its payslip as usual.
   */
  async unpaidAfter(tx: Tx, userId: string, lastMonth: string): Promise<number> {
    const rows = await tx
      .select({ amount: reimbursementClaims.approvedPaise, runStatus: payrollRuns.status, payMonth: reimbursementClaims.payMonth })
      .from(reimbursementClaims)
      .leftJoin(payrollAdjustments, eq(payrollAdjustments.id, reimbursementClaims.adjustmentId))
      .leftJoin(payrollRuns, eq(payrollRuns.id, payrollAdjustments.runId))
      .where(and(eq(reimbursementClaims.userId, userId), eq(reimbursementClaims.status, 'approved')));
    return rows.filter((r) => r.runStatus !== 'locked' && (r.payMonth ?? '') > lastMonth).reduce((n, r) => n + (r.amount ?? 0), 0);
  }
}
