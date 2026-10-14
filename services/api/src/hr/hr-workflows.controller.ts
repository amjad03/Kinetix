import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { payrollAdjustments } from '../db/schema-depth.js';
import { hrSettings, leaveEncashments, serviceBookEntries, staffLoans } from '../db/schema-hrpay.js';
import { auditLog, jobOpenings, leaveTypes, payrollRuns, salaryComponents, salaryStructureLines, salaryStructures, users } from '../db/schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { rupees, texts } from '../notifications/texts.js';
import { HR_ROLES, PAYROLL_APPROVERS, PAYROLL_ROLES, STAFF_ROLES, hasAnyRole, isPayrollStaff } from './hr.access.js';
import { formatSeries, hrModuleSettings } from './hr-settings.js';
import { LeaveService } from './leave.service.js';

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15');
const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month like 2026-10');
const Series = z.object({ prefix: z.string().max(20), next: z.number().int().min(1).max(99_999_999), digits: z.number().int().min(1).max(10), suffix: z.string().max(20).default('') });
const SettingsBody = z.object({
  employeeSeries: Series,
  payslipSeries: Series,
  leaveLevels: z.union([z.literal(1), z.literal(2)]),
  encashment: z.object({ maxDaysPerYear: z.number().min(0).max(365), minBalanceAfter: z.number().min(0).max(365) }),
  attendance: z.object({
    officeStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 09:00'),
    graceMinutes: z.number().int().min(0).max(120),
    halfDayAfterMinutes: z.number().int().min(0).max(480),
    minHoursFullDay: z.number().min(1).max(12),
    officeEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 17:00').default('17:00'),
    lateMarksPerHalfDay: z.number().int().min(0).max(31).default(3),
  }),
  loans: z.object({ maxInstallments: z.number().int().min(1).max(120), maxAdvancePaise: z.number().int().min(0), maxLoanPaise: z.number().int().min(0) }),
});
const LoanBody = z.object({ userId: z.uuid().optional(), kind: z.enum(['advance', 'loan']), amountPaise: z.number().int().min(100_00), installments: z.number().int().min(1).max(120), startMonth: Month, purpose: z.string().trim().min(3).max(300) });
const DecideBody = z.object({ decision: z.enum(['approve', 'reject']), note: z.string().trim().max(500).default('') });
const EncashBody = z.object({ userId: z.uuid().optional(), leaveTypeId: z.uuid(), days: z.number().min(0.5).max(365).multipleOf(0.5), payMonth: Month });
const EntryBody = z.object({ kind: z.enum(['appointment', 'confirmation', 'promotion', 'increment', 'transfer', 'award', 'penalty', 'deputation', 'remark']), onDate: Day, title: z.string().trim().min(2).max(160), details: z.string().trim().max(2000).default(''), orderNo: z.string().trim().max(60).nullish() });
const RequisitionBody = z.object({
  title: z.string().trim().min(1).max(120),
  departmentId: z.uuid().nullable().optional(),
  designationId: z.uuid().nullable().optional(),
  positions: z.number().int().min(1).max(500).default(1),
  description: z.string().trim().max(5000).default(''),
  justification: z.string().trim().min(5).max(2000),
  closesOn: Day.nullable().optional(),
});
const HISTORY_SUBJECTS = ['user', 'leave_request', 'payroll_run', 'payslip', 'job_opening', 'job_applicant', 'appraisal', 'appraisal_cycle', 'training_record', 'separation', 'staff_loan', 'leave_encashment', 'offer_letter'];

type LoanRow = typeof staffLoans.$inferSelect;

/** One day's pay for encashment: basic and DA (the PF wage components) of the current structure over 30 days. */
export async function encashDayRate(tx: Tx, userId: string, month: string): Promise<number> {
  const [s] = await tx.select({ id: salaryStructures.id }).from(salaryStructures).where(and(eq(salaryStructures.userId, userId), sql`${salaryStructures.effectiveFrom} <= ${`${month}-28`}`)).orderBy(desc(salaryStructures.effectiveFrom)).limit(1);
  if (!s) throw new BadRequestException('This staff member has no salary structure yet');
  const lines = await tx.select({ paise: salaryStructureLines.monthlyPaise, pfWage: salaryComponents.pfWage, kind: salaryComponents.kind }).from(salaryStructureLines).innerJoin(salaryComponents, eq(salaryComponents.id, salaryStructureLines.componentId)).where(eq(salaryStructureLines.structureId, s.id));
  const base = lines.filter((l) => l.kind === 'earning' && l.pfWage).reduce((a, l) => a + l.paise, 0) || lines.filter((l) => l.kind === 'earning').reduce((a, l) => a + l.paise, 0);
  return Math.round(base / 30);
}


/** A leave encashment request: an encashable type, within the yearly cap and leaving the minimum balance; priced at a day's basic and DA. */
export async function requestEncashment(tx: Tx, p: UserPrincipal, leave: LeaveService, b: { userId?: string; leaveTypeId: string; days: number; payMonth: string }) {
  const userId = b.userId ?? p.userId;
  if (userId !== p.userId && !isPayrollStaff(p)) throw new ForbiddenException('You can only encash your own leave');
  const [type] = await tx.select().from(leaveTypes).where(eq(leaveTypes.id, b.leaveTypeId));
  if (!type?.encashable) throw new BadRequestException('This leave type cannot be encashed');
  const rules = (await hrModuleSettings(tx, p.tenantId)).encashment;
  const year = Number(b.payMonth.slice(0, 4));
  const [done] = await tx.select({ d: sql<number>`coalesce(sum(${leaveEncashments.days}), 0)::float` }).from(leaveEncashments).where(and(eq(leaveEncashments.userId, userId), eq(leaveEncashments.year, year), inArray(leaveEncashments.status, ['pending', 'approved'])));
  if (done.d + b.days > rules.maxDaysPerYear) throw new BadRequestException(`At most ${rules.maxDaysPerYear} days can be encashed in a year`);
  const bal = (await leave.balances(tx, p.tenantId, userId, year)).find((x) => x.leaveType.id === type.id);
  if (!bal || bal.available - b.days < rules.minBalanceAfter) throw new BadRequestException(`Not enough balance: ${bal?.available ?? 0} days available and ${rules.minBalanceAfter} must remain`);
  const amountPaise = Math.round((await encashDayRate(tx, userId, b.payMonth)) * b.days);
  const [row] = await tx.insert(leaveEncashments).values({ tenantId: p.tenantId, userId, leaveTypeId: type.id, year, days: b.days, amountPaise, payMonth: b.payMonth, createdBy: p.userId }).returning();
  await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'leave.encashment_requested', subjectType: 'leave_encashment', subjectId: row.id, data: { userId, days: b.days, amountPaise } });
  return row;
}

/** Approve (a payroll adjustment pays it in its month) or reject (with a reason) a pending encashment. */
export async function decideEncashment(tx: Tx, p: UserPrincipal, notifications: NotificationsService, id: string, decision: 'approve' | 'reject', note: string | undefined): Promise<void> {
  const [e] = await tx.select().from(leaveEncashments).where(eq(leaveEncashments.id, id)).for('update');
  if (!e) throw new NotFoundException('Encashment not found');
  if (e.status !== 'pending') throw new ConflictException(`This request is already ${e.status}`);
  if (decision === 'reject' && !note) throw new BadRequestException('Give a reason for rejecting');
  const status = decision === 'approve' ? 'approved' : 'rejected';
  let adjustmentId: string | null = null;
  if (status === 'approved') {
    const [adj] = await tx.insert(payrollAdjustments).values({ tenantId: p.tenantId, userId: e.userId, kind: 'encashment', payMonth: e.payMonth, amountPaise: e.amountPaise, reason: `Leave encashment: ${e.days} days`, status: 'approved', createdBy: e.createdBy, decidedBy: p.userId, decidedAt: new Date() }).returning({ id: payrollAdjustments.id });
    adjustmentId = adj.id;
  }
  await tx.update(leaveEncashments).set({ status, adjustmentId, decidedBy: p.userId, decidedAt: new Date(), decisionNote: note || null }).where(eq(leaveEncashments.id, id));
  await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: `leave.encashment_${status}`, subjectType: 'leave_encashment', subjectId: id, data: { note: note } });
  await notifications.notifyUsers(tx, [e.userId], { kind: 'leave', text: texts.hrRequestDecided({ what: 'encashment', approved: status === 'approved', detail: `${e.days} · ${rupees(e.amountPaise)} · ${e.payMonth}` }), data: { encashmentId: id }, dedupeKey: `encash:${id}` });
}

/** Records a loan or advance request after checking the institution's limits. */
export async function createLoan(tx: Tx, p: UserPrincipal, b: { userId?: string; kind: 'advance' | 'loan'; amountPaise: number; installments: number; startMonth: string; purpose: string }): Promise<LoanRow> {
  const userId = b.userId ?? p.userId;
  if (userId !== p.userId && !isPayrollStaff(p)) throw new ForbiddenException('You can only request a loan for yourself');
  const rules = (await hrModuleSettings(tx, p.tenantId)).loans;
  const cap = b.kind === 'advance' ? rules.maxAdvancePaise : rules.maxLoanPaise;
  if (b.amountPaise > cap) throw new BadRequestException(`The most you can request as ${b.kind === 'advance' ? 'an advance' : 'a loan'} is ${rupees(cap)}`);
  if (b.installments > rules.maxInstallments) throw new BadRequestException(`Repay in at most ${rules.maxInstallments} instalments`);
  const [open] = await tx.select({ id: staffLoans.id }).from(staffLoans).where(and(eq(staffLoans.userId, userId), eq(staffLoans.kind, b.kind), eq(staffLoans.status, 'pending')));
  if (open) throw new ConflictException('There is already a pending request of this kind');
  const [n] = await tx.select({ n: sql<number>`count(*)::int` }).from(staffLoans);
  const loanNo = formatSeries({ prefix: b.kind === 'advance' ? 'ADV/{FY}/' : 'LN/{FY}/', next: n.n + 1, digits: 4, suffix: '' });
  const emi = loanSchedule(b.amountPaise, b.installments, b.startMonth)[0].amountPaise;
  const [row] = await tx.insert(staffLoans).values({ tenantId: p.tenantId, loanNo, userId, kind: b.kind, amountPaise: b.amountPaise, installments: b.installments, emiPaise: emi, startMonth: b.startMonth, purpose: b.purpose, createdBy: p.userId }).returning();
  await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'payroll.loan_requested', subjectType: 'staff_loan', subjectId: row.id, data: { userId, kind: b.kind, amountPaise: b.amountPaise, installments: b.installments } });
  return row;
}

/** Approves (instalments become approved payroll recoveries) or rejects a pending loan. */
export async function decideLoan(tx: Tx, p: UserPrincipal, notifications: NotificationsService, id: string, decision: 'approve' | 'reject', note: string): Promise<LoanRow> {
  const [l] = await tx.select().from(staffLoans).where(eq(staffLoans.id, id)).for('update');
  if (!l) throw new NotFoundException('Loan not found');
  if (l.status !== 'pending') throw new ConflictException(`This request is already ${l.status}`);
  if (l.userId === p.userId) throw new ForbiddenException('You cannot decide your own request');
  if (decision === 'reject' && !note) throw new BadRequestException('Give a reason for rejecting');
  const status = decision === 'approve' ? 'approved' : 'rejected';
  if (status === 'approved') {
    const [locked] = await tx.select({ month: payrollRuns.month }).from(payrollRuns).where(and(eq(payrollRuns.month, l.startMonth), eq(payrollRuns.kind, 'regular'), inArray(payrollRuns.status, ['approved', 'locked'])));
    if (locked) throw new ConflictException(`Payroll for ${l.startMonth} is already approved; start recovery in a later month`);
    const sched = loanSchedule(l.amountPaise, l.installments, l.startMonth);
    await tx.insert(payrollAdjustments).values(sched.map((s) => ({ tenantId: p.tenantId, userId: l.userId, kind: 'recovery', payMonth: s.month, amountPaise: s.amountPaise, reason: `${l.loanNo} instalment`, status: 'approved', loanId: l.id, createdBy: l.createdBy, decidedBy: p.userId, decidedAt: new Date() })));
  }
  await tx.update(staffLoans).set({ status, decidedBy: p.userId, decidedAt: new Date(), decisionNote: note || null }).where(eq(staffLoans.id, id));
  await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: `payroll.loan_${status}`, subjectType: 'staff_loan', subjectId: id, data: { note } });
  await notifications.notifyUsers(tx, [l.userId], { kind: 'payslip', text: texts.hrRequestDecided({ what: l.kind as 'loan', approved: status === 'approved', detail: `${l.loanNo} · ${rupees(l.amountPaise)}${note ? ` · ${note}` : ''}` }), data: { loanId: id }, dedupeKey: `loan:${id}` });
  return (await tx.select().from(staffLoans).where(eq(staffLoans.id, id)))[0];
}

/** Closes an approved loan early: instalments not yet paid through a locked payroll are removed. */
export async function closeLoanEarly(tx: Tx, p: UserPrincipal, id: string, note: string): Promise<LoanRow> {
  const [l] = await tx.select().from(staffLoans).where(eq(staffLoans.id, id)).for('update');
  if (!l) throw new NotFoundException('Loan not found');
  if (l.status !== 'approved') throw new ConflictException('Only an approved loan can be closed');
  const open = await tx
    .select({ id: payrollAdjustments.id, runId: payrollAdjustments.runId, runStatus: payrollRuns.status })
    .from(payrollAdjustments)
    .leftJoin(payrollRuns, eq(payrollRuns.id, payrollAdjustments.runId))
    .where(eq(payrollAdjustments.loanId, id));
  const drop = open.filter((a) => a.runStatus !== 'locked' && a.runStatus !== 'approved').map((a) => a.id);
  if (!drop.length) throw new ConflictException('Every instalment is already paid');
  await tx.delete(payrollAdjustments).where(inArray(payrollAdjustments.id, drop));
  await tx.update(staffLoans).set({ status: 'closed', closedAt: new Date(), closeNote: note }).where(eq(staffLoans.id, id));
  await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'payroll.loan_closed', subjectType: 'staff_loan', subjectId: id, changes: { status: { before: 'approved', after: 'closed' } }, data: { note, instalmentsDropped: drop.length } });
  return (await tx.select().from(staffLoans).where(eq(staffLoans.id, id)))[0];
}

/** Splits a loan into monthly instalments; the last one takes the rounding difference. */
export function loanSchedule(amountPaise: number, installments: number, startMonth: string): { month: string; amountPaise: number }[] {
  const emi = Math.ceil(amountPaise / installments / 100) * 100;
  const [y, m] = startMonth.split('-').map(Number);
  return Array.from({ length: installments }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    return { month, amountPaise: i === installments - 1 ? amountPaise - emi * (installments - 1) : emi };
  }).filter((x) => x.amountPaise > 0);
}

/** Module settings, loans and advances, leave encashment, the service book, staff requisitions and record history. */
@Controller('v1/hr')
export class HrWorkflowsController {
  constructor(
    private readonly db: DbService,
    private readonly notifications: NotificationsService,
    private readonly leave: LeaveService,
  ) {}

  // ----- module settings ------------------------------------------------------------------------------

  @Get('module-settings')
  @Auth('user', PAYROLL_ROLES)
  settings(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await hrModuleSettings(tx, p.tenantId);
      return { ...s, preview: { employeeCode: formatSeries(s.employeeSeries), payslipNo: formatSeries(s.payslipSeries) } };
    });
  }

  @Put('module-settings')
  @Auth('user', HR_ROLES)
  saveSettings(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(SettingsBody)) b: z.infer<typeof SettingsBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const before = await hrModuleSettings(tx, p.tenantId);
      await tx.update(hrSettings).set({ ...b, updatedAt: new Date() }).where(eq(hrSettings.tenantId, p.tenantId));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'hr.settings_updated', subjectType: 'hr_settings', data: { leaveLevels: { before: before.leaveLevels, after: b.leaveLevels } } });
      const s = await hrModuleSettings(tx, p.tenantId);
      return { ...s, preview: { employeeCode: formatSeries(s.employeeSeries), payslipNo: formatSeries(s.payslipSeries) } };
    });
  }

  // ----- loans and advances ------------------------------------------------------------------------------

  private async loanView(tx: Tx, l: LoanRow) {
    const [u] = await tx.select({ fullName: users.fullName }).from(users).where(eq(users.id, l.userId));
    const sched = await tx
      .select({ id: payrollAdjustments.id, month: payrollAdjustments.payMonth, amountPaise: payrollAdjustments.amountPaise, runStatus: payrollRuns.status })
      .from(payrollAdjustments)
      .leftJoin(payrollRuns, eq(payrollRuns.id, payrollAdjustments.runId))
      .where(eq(payrollAdjustments.loanId, l.id))
      .orderBy(asc(payrollAdjustments.payMonth));
    const recovered = sched.filter((s) => s.runStatus === 'locked').reduce((a, s) => a + s.amountPaise, 0);
    const decidedBy = l.decidedBy ? (await tx.select({ fullName: users.fullName }).from(users).where(eq(users.id, l.decidedBy)))[0]?.fullName ?? null : null;
    const status = l.status === 'approved' && sched.length > 0 && recovered >= l.amountPaise ? 'closed' : l.status;
    return {
      id: l.id,
      loanNo: l.loanNo,
      user: { id: l.userId, fullName: u?.fullName ?? '' },
      kind: l.kind,
      amountPaise: l.amountPaise,
      installments: l.installments,
      emiPaise: l.emiPaise,
      startMonth: l.startMonth,
      purpose: l.purpose,
      status,
      decidedBy,
      decidedAt: l.decidedAt?.toISOString() ?? null,
      decisionNote: l.decisionNote,
      createdAt: l.createdAt.toISOString(),
      recoveredPaise: recovered,
      outstandingPaise: l.status === 'approved' ? l.amountPaise - recovered : 0,
      schedule: l.status === 'approved' ? sched.map((s) => ({ month: s.month, amountPaise: s.amountPaise, recovered: s.runStatus === 'locked' })) : loanSchedule(l.amountPaise, l.installments, l.startMonth).map((s) => ({ ...s, recovered: false })),
    };
  }

  /** Payroll staff see every loan; everyone else their own. */
  @Get('loans')
  @Auth('user', STAFF_ROLES)
  loans(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string, @Query('mine') mine?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const own = mine === '1' || !isPayrollStaff(p);
      const rows = await tx.select().from(staffLoans).where(and(own ? eq(staffLoans.userId, p.userId) : undefined, status ? eq(staffLoans.status, status) : undefined)).orderBy(desc(staffLoans.createdAt)).limit(500);
      return Promise.all(rows.map((r) => this.loanView(tx, r)));
    });
  }

  @Get('loans/:id')
  @Auth('user', STAFF_ROLES)
  loan(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => this.loanView(tx, await this.ownLoan(tx, p, id)));
  }

  private async ownLoan(tx: Tx, p: UserPrincipal, id: string, lock = false): Promise<LoanRow> {
    const q = tx.select().from(staffLoans).where(eq(staffLoans.id, id));
    const [l] = lock ? await q.for('update') : await q;
    if (!l || (l.userId !== p.userId && !isPayrollStaff(p))) throw new NotFoundException('Loan not found');
    return l;
  }

  /** Staff request for themselves; payroll staff may raise one for a colleague. */
  @Post('loans')
  @Auth('user', STAFF_ROLES)
  requestLoan(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(LoanBody)) b: z.infer<typeof LoanBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => this.loanView(tx, await createLoan(tx, p, b)));
  }

  /** The principal approves (instalments become approved payroll recoveries) or rejects. */
  @Post('loans/:id/decide')
  @HttpCode(200)
  @Auth('user', PAYROLL_APPROVERS)
  decideLoan(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DecideBody)) b: z.infer<typeof DecideBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.ownLoan(tx, p, id);
      return this.loanView(tx, await decideLoan(tx, p, this.notifications, id, b.decision, b.note));
    });
  }

  /** Closes an approved loan early (repaid in cash or written off): instalments not yet in a locked payroll are dropped. */
  @Post('loans/:id/close')
  @HttpCode(200)
  @Auth('user', PAYROLL_APPROVERS)
  closeLoan(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ note: z.string().trim().min(3, 'Say how the rest was settled').max(300) }))) b: { note: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => this.loanView(tx, await closeLoanEarly(tx, p, id, b.note)));
  }

  @Post('loans/:id/cancel')
  @HttpCode(200)
  @Auth('user', STAFF_ROLES)
  cancelLoan(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const l = await this.ownLoan(tx, p, id, true);
      if (l.status !== 'pending') throw new ConflictException('Only a pending request can be withdrawn');
      await tx.update(staffLoans).set({ status: 'cancelled' }).where(eq(staffLoans.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'payroll.loan_cancelled', subjectType: 'staff_loan', subjectId: id });
      return this.loanView(tx, { ...l, status: 'cancelled' });
    });
  }

  // ----- leave encashment -----------------------------------------------------------------------------------

  private async encashView(tx: Tx, rows: (typeof leaveEncashments.$inferSelect)[]) {
    if (!rows.length) return [];
    const us = new Map((await tx.select({ id: users.id, fullName: users.fullName }).from(users).where(inArray(users.id, [...new Set(rows.flatMap((r) => [r.userId, r.decidedBy].filter((x): x is string => !!x)))]))).map((u) => [u.id, u.fullName]));
    const ts = new Map((await tx.select().from(leaveTypes)).map((t) => [t.id, t]));
    return rows.map((r) => ({ id: r.id, user: { id: r.userId, fullName: us.get(r.userId) ?? '' }, leaveType: { id: r.leaveTypeId, code: ts.get(r.leaveTypeId)?.code ?? '', name: ts.get(r.leaveTypeId)?.name ?? '' }, year: r.year, days: r.days, amountPaise: r.amountPaise, payMonth: r.payMonth, status: r.status, decidedBy: r.decidedBy ? (us.get(r.decidedBy) ?? null) : null, decidedAt: r.decidedAt?.toISOString() ?? null, decisionNote: r.decisionNote, createdAt: r.createdAt.toISOString() }));
  }

  @Get('leave/encashments')
  @Auth('user', STAFF_ROLES)
  encashments(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => this.encashView(tx, await tx.select().from(leaveEncashments).where(isPayrollStaff(p) ? undefined : eq(leaveEncashments.userId, p.userId)).orderBy(desc(leaveEncashments.createdAt)).limit(500)));
  }

  @Post('leave/encashments')
  @Auth('user', STAFF_ROLES)
  requestEncashment(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(EncashBody)) b: z.infer<typeof EncashBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const row = await requestEncashment(tx, p, this.leave, b);
      return (await this.encashView(tx, [row]))[0];
    });
  }

  @Post('leave/encashments/:id/decide')
  @HttpCode(200)
  @Auth('user', PAYROLL_APPROVERS)
  decideEncashment(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DecideBody)) b: z.infer<typeof DecideBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await decideEncashment(tx, p, this.notifications, id, b.decision, b.note);
      return (await this.encashView(tx, (await tx.select().from(leaveEncashments).where(eq(leaveEncashments.id, id)))))[0];
    });
  }

  // ----- service book -------------------------------------------------------------------------------------

  /** The service book: manual entries plus everything the system already knows, oldest first. */
  @Get('staff/:userId/service-book')
  @Auth('user', STAFF_ROLES)
  serviceBook(@CurrentPrincipal() p: UserPrincipal, @Param('userId', ParseUUIDPipe) userId: string) {
    if (userId !== p.userId && !hasAnyRole(p, [...PAYROLL_ROLES, 'hod'])) throw new NotFoundException('Staff member not found');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.execute<{ id: string; kind: string; on_date: string; title: string; details: string; order_no: string | null; source: string }>(sql`
        select id::text, kind, on_date::text, title, details, order_no, 'manual' as source from service_book_entries where user_id = ${userId}::uuid
        union all select user_id::text, 'appointment', date_of_joining::text, 'Joined service', coalesce(employment_type, ''), employee_code, 'profile' from staff_profiles where user_id = ${userId}::uuid and date_of_joining is not null
        union all select id::text, 'transfer', effective_on::text, 'Transfer / redesignation', coalesce((select name from departments where id = to_department_id), '') || case when to_designation_id is not null then ' · ' || coalesce((select name from designations where id = to_designation_id), '') else '' end || case when reason <> '' then ' · ' || reason else '' end, null, 'transfer' from staff_transfers where user_id = ${userId}::uuid and status = 'applied'
        union all select id::text, case when status = 'confirmed' then 'confirmation' else 'probation' end, coalesce(decided_at::date, due_on)::text, case when status = 'confirmed' then 'Confirmed in service' else 'Probation extended' end, coalesce(decision_remarks, ''), letter_no, 'probation' from probation_reviews where user_id = ${userId}::uuid and status in ('confirmed', 'extended')
        union all select id::text, 'increment', effective_from::text, 'Pay fixed / revised', '', null, 'salary' from salary_structures where user_id = ${userId}::uuid
        union all select id::text, 'training', starts_on::text, title, kind || ' · ' || hours || ' h' || coalesce(' · ' || organiser, ''), null, 'training' from training_records where user_id = ${userId}::uuid
        union all select a.id::text, 'appraisal', a.updated_at::date::text, 'Appraisal ' || c.period, coalesce('Grade ' || a.grade, ''), null, 'appraisal' from appraisals a join appraisal_cycles c on c.id = a.cycle_id where a.user_id = ${userId}::uuid and a.status = 'finalised'
        union all select id::text, 'leave', from_date::text, 'Leave ' || days || ' day(s)', reason, null, 'leave' from leave_requests where user_id = ${userId}::uuid and status = 'approved' and days >= 5
        union all select id::text, 'exit', resigned_on::text, 'Resignation', reason, null, 'separation' from separations where user_id = ${userId}::uuid
        order by 3, 1`);
      return rows.rows.map((r) => ({ id: r.id, kind: r.kind, onDate: r.on_date, title: r.title, details: r.details, orderNo: r.order_no, source: r.source }));
    });
  }

  @Post('staff/:userId/service-book')
  @Auth('user', HR_ROLES)
  addEntry(@CurrentPrincipal() p: UserPrincipal, @Param('userId', ParseUUIDPipe) userId: string, @Body(new ZodBody(EntryBody)) b: z.infer<typeof EntryBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.insert(serviceBookEntries).values({ tenantId: p.tenantId, userId, kind: b.kind, onDate: b.onDate, title: b.title, details: b.details, orderNo: b.orderNo ?? null, createdBy: p.userId }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'hr.service_book_entry', subjectType: 'user', subjectId: userId, data: { kind: b.kind, title: b.title, onDate: b.onDate } });
      return { id: row.id, kind: row.kind, onDate: row.onDate, title: row.title, details: row.details, orderNo: row.orderNo, source: 'manual' };
    });
  }

  // ----- staff requisitions: requested → approved (posted as an opening) or rejected ---------------------------

  @Post('openings/requisitions')
  @Auth('user', [...HR_ROLES, 'hod'])
  requisition(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(RequisitionBody)) b: z.infer<typeof RequisitionBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.insert(jobOpenings).values({ tenantId: p.tenantId, ...b, status: 'requested', departmentId: b.departmentId ?? null, designationId: b.designationId ?? null, closesOn: b.closesOn ?? null, createdBy: p.userId }).returning({ id: jobOpenings.id, status: jobOpenings.status });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'recruitment.requisition_raised', subjectType: 'job_opening', subjectId: row.id, data: { title: b.title, positions: b.positions } });
      return row;
    });
  }

  @Post('openings/:id/decide')
  @HttpCode(200)
  @Auth('user', PAYROLL_APPROVERS)
  decideRequisition(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DecideBody)) b: z.infer<typeof DecideBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [o] = await tx.select().from(jobOpenings).where(eq(jobOpenings.id, id)).for('update');
      if (!o) throw new NotFoundException('Opening not found');
      if (o.status !== 'requested') throw new ConflictException('This requisition has already been decided');
      if (b.decision === 'reject' && !b.note) throw new BadRequestException('Give a reason for rejecting');
      const status = b.decision === 'approve' ? 'open' : 'rejected';
      await tx.update(jobOpenings).set({ status, approvedBy: p.userId, approvedAt: new Date(), decisionNote: b.note || null }).where(eq(jobOpenings.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: status === 'open' ? 'recruitment.requisition_approved' : 'recruitment.requisition_rejected', subjectType: 'job_opening', subjectId: id, data: { note: b.note } });
      if (o.createdBy && o.createdBy !== p.userId) await this.notifications.notifyUsers(tx, [o.createdBy], { kind: 'task', text: texts.hrRequestDecided({ what: 'requisition', approved: status === 'open', detail: `${o.title} (${o.positions})` }), data: { openingId: id }, dedupeKey: `req:${id}` });
      return { id, status };
    });
  }

  // ----- record pages --------------------------------------------------------------------------------------

  /** One leave request: the applicant, HR roles, or the head of the applicant's department. */
  @Get('leave/requests/:id')
  @Auth('user', STAFF_ROLES)
  leaveRequest(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = await this.leave.get(tx, id);
      if (r.user.id !== p.userId && !isPayrollStaff(p) && !(await this.leave.headedStaff(tx, p.userId)).includes(r.user.id)) throw new NotFoundException('Leave request not found');
      return r;
    });
  }

  /** The audit trail of an HR record, newest first, for the record page's Activity tab. */
  @Get('history/:subjectType/:subjectId')
  @Auth('user', [...PAYROLL_ROLES, 'hod'])
  history(@CurrentPrincipal() p: UserPrincipal, @Param('subjectType') subjectType: string, @Param('subjectId', ParseUUIDPipe) subjectId: string) {
    if (!HISTORY_SUBJECTS.includes(subjectType)) throw new NotFoundException('Unknown record type');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select({ id: auditLog.id, at: auditLog.at, action: auditLog.action, data: auditLog.data, actor: users.fullName }).from(auditLog).leftJoin(users, eq(users.id, auditLog.actorId)).where(and(eq(auditLog.subjectType, subjectType), eq(auditLog.subjectId, subjectId))).orderBy(desc(auditLog.at)).limit(200);
      return rows.map((r) => ({ id: String(r.id), at: r.at.toISOString(), action: r.action, actor: r.actor ?? 'System', data: r.data }));
    });
  }
}
