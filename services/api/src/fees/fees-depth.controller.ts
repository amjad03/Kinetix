import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, OnModuleInit, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Clock, localParts } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { feeInvoices, feePayments, students, tenants } from '../db/schema.js';
import { feeInstalmentPlans, feeInstalments, feeLateFeeRules, feeLateFees, studentCredits } from '../db/schema-depth.js';
import { JobsService, type Job } from '../jobs/jobs.service.js';
import { allocatePaid, daysBetween, lateFee, planProblem, splitInstalments } from './fees-depth.logic.js';
import { FEE_ROLES, FeesService } from './fees.service.js';

const LATE_FEE_JOB = 'fees.late_fees';
const APPROVERS: RoleName[] = ['tenant_admin', 'principal'];
const PlanBody = z.object({ name: z.string().trim().min(2).max(80), parts: z.array(z.object({ percent: z.number().gt(0).max(100), dueAfterDays: z.number().int().min(0).max(730) })).min(2).max(12) });
const RuleBody = z.object({ name: z.string().trim().min(2).max(80).default('Late fee'), graceDays: z.number().int().min(0).max(365), flatPaise: z.number().int().min(0), perDayPaise: z.number().int().min(0), capPaise: z.number().int().min(0).nullish() });
const CreditBody = z.object({ studentId: z.uuid(), amountPaise: z.number().int().min(1), kind: z.enum(['advance', 'adjustment']).default('advance'), note: z.string().trim().max(300).default('') });
const RefundBody = z.object({ studentId: z.uuid(), amountPaise: z.number().int().min(1), note: z.string().trim().max(300).default('') });

/** Instalment plans, automatic late fees, and student advance credits (PRD section 34). */
@Controller('v1/fees')
export class FeesDepthController implements OnModuleInit {
  constructor(
    private readonly db: DbService,
    private readonly fees: FeesService,
    private readonly clock: Clock,
    private readonly jobs: JobsService,
  ) {}

  onModuleInit(): void {
    this.jobs.registerDaily(LATE_FEE_JOB, (job: Job) => this.db.withTenant(job.tenantId, (tx) => this.assess(tx, job.tenantId)).then(() => undefined));
  }

  private async today(tx: Tx): Promise<string> {
    const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
    return localParts(this.clock.now(), t?.tz ?? 'Asia/Kolkata').date;
  }

  // ---- instalments -----------------------------------------------------------------------------------------

  @Get('instalment-plans')
  @Auth('user', FEE_ROLES)
  plans(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(feeInstalmentPlans).orderBy(asc(feeInstalmentPlans.name)));
  }

  @Post('instalment-plans')
  @Auth('user', FEE_ROLES)
  createPlan(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(PlanBody)) b: z.infer<typeof PlanBody>) {
    const problem = planProblem(b.parts);
    if (problem) throw new BadRequestException(problem);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.insert(feeInstalmentPlans).values({ tenantId: p.tenantId, name: b.name, parts: b.parts }).returning();
      await auditUser(tx, p, 'fees.instalment_plan_created', 'fee_instalment_plan', row.id);
      return row;
    });
  }

  @Post('instalment-plans/:id/active')
  @HttpCode(200)
  @Auth('user', FEE_ROLES)
  setPlanActive(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ active: z.boolean() }))) b: { active: boolean }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(feeInstalmentPlans).set({ active: b.active }).where(eq(feeInstalmentPlans.id, id)).returning();
      if (!row) throw new NotFoundException('Plan not found');
      return row;
    });
  }

  /** Splits an unpaid invoice into the plan's instalments. */
  @Post('invoices/:id/instalments')
  @Auth('user', FEE_ROLES)
  applyPlan(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ planId: z.uuid() }))) b: { planId: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [inv] = await tx.select().from(feeInvoices).where(eq(feeInvoices.id, id)).for('update');
      if (!inv) throw new NotFoundException('Invoice not found');
      if (inv.status !== 'due') throw new ConflictException('Only an unpaid invoice can be split into instalments');
      if (inv.paidPaise > 0) throw new ConflictException('Part of this invoice is already paid');
      const [plan] = await tx.select().from(feeInstalmentPlans).where(and(eq(feeInstalmentPlans.id, b.planId), eq(feeInstalmentPlans.active, true)));
      if (!plan) throw new NotFoundException('Plan not found');
      const [have] = await tx.select({ n: sql<number>`count(*)::int` }).from(feeInstalments).where(eq(feeInstalments.invoiceId, id));
      if (have.n > 0) throw new ConflictException('This invoice already has an instalment schedule');
      const rows = splitInstalments(inv.amountPaise, inv.dueOn, plan.parts);
      await tx.insert(feeInstalments).values(rows.map((r) => ({ tenantId: p.tenantId, invoiceId: id, planId: plan.id, ...r })));
      await auditUser(tx, p, 'fees.instalments_created', 'fee_invoice', id, { plan: plan.name, parts: rows.length });
      return this.schedule(tx, id);
    });
  }

  private async schedule(tx: Tx, invoiceId: string) {
    const [inv] = await tx.select().from(feeInvoices).where(eq(feeInvoices.id, invoiceId));
    const rows = await tx.select().from(feeInstalments).where(eq(feeInstalments.invoiceId, invoiceId)).orderBy(asc(feeInstalments.seq));
    return { invoiceId, title: inv.title, amountPaise: inv.amountPaise, paidPaise: inv.paidPaise, instalments: allocatePaid(rows.map((r) => ({ seq: r.seq, dueOn: r.dueOn, amountPaise: r.amountPaise })), inv.paidPaise, await this.today(tx)) };
  }

  @Get('invoices/:id/instalments')
  @Auth('user')
  async instalments(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [inv] = await tx.select({ studentId: feeInvoices.studentId }).from(feeInvoices).where(eq(feeInvoices.id, id));
      if (!inv) throw new NotFoundException('Invoice not found');
      await this.fees.assertCanSee(tx, p, inv.studentId);
      return this.schedule(tx, id);
    });
  }

  // ---- late fees ---------------------------------------------------------------------------------------------

  @Get('late-fee-rule')
  @Auth('user', FEE_ROLES)
  rule(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => (await tx.select().from(feeLateFeeRules).where(eq(feeLateFeeRules.active, true)).orderBy(desc(feeLateFeeRules.createdAt)).limit(1))[0] ?? null);
  }

  /** Sets the one rule in force; the older rule is switched off. */
  @Put('late-fee-rule')
  @Auth('user', APPROVERS)
  saveRule(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(RuleBody)) b: z.infer<typeof RuleBody>) {
    if (b.flatPaise === 0 && b.perDayPaise === 0) throw new BadRequestException('Give a flat fine, a daily fine, or both');
    return this.db.withTenant(p.tenantId, async (tx) => {
      await tx.update(feeLateFeeRules).set({ active: false }).where(eq(feeLateFeeRules.active, true));
      const [row] = await tx.insert(feeLateFeeRules).values({ tenantId: p.tenantId, name: b.name, graceDays: b.graceDays, flatPaise: b.flatPaise, perDayPaise: b.perDayPaise, capPaise: b.capPaise ?? null }).returning();
      await auditUser(tx, p, 'fees.late_fee_rule_saved', 'fee_late_fee_rule', row.id);
      return row;
    });
  }

  /** Adds the fine to every overdue unpaid invoice; safe to run again (only the new days are added). */
  private async assess(tx: Tx, tenantId: string): Promise<{ assessed: number; totalPaise: number }> {
    const [rule] = await tx.select().from(feeLateFeeRules).where(eq(feeLateFeeRules.active, true)).orderBy(desc(feeLateFeeRules.createdAt)).limit(1);
    if (!rule) return { assessed: 0, totalPaise: 0 };
    const today = await this.today(tx);
    const overdue = await tx.select().from(feeInvoices).where(and(eq(feeInvoices.status, 'due'), sql`${feeInvoices.dueOn} < ${today}`));
    if (overdue.length === 0) return { assessed: 0, totalPaise: 0 };
    const ids = overdue.map((i) => i.id);
    const inst = await tx.select().from(feeInstalments).where(inArray(feeInstalments.invoiceId, ids));
    const prior = await tx.select().from(feeLateFees).where(inArray(feeLateFees.invoiceId, ids));
    let assessed = 0;
    let total = 0;
    for (const inv of overdue) {
      // With instalments, lateness counts from the first instalment still unpaid and past due.
      const mine = inst.filter((x) => x.invoiceId === inv.id);
      const from = mine.length ? allocatePaid(mine.map((r) => ({ seq: r.seq, dueOn: r.dueOn, amountPaise: r.amountPaise })), inv.paidPaise, today).find((x) => x.status === 'overdue')?.dueOn : inv.dueOn;
      if (!from) continue;
      const fine = lateFee({ graceDays: rule.graceDays, flatPaise: rule.flatPaise, perDayPaise: rule.perDayPaise, capPaise: rule.capPaise }, daysBetween(from, today));
      const before = prior.find((x) => x.invoiceId === inv.id);
      const already = before?.appliedPaise ?? 0;
      if (fine.amountPaise <= already) continue;
      const delta = fine.amountPaise - already;
      await tx.update(feeInvoices).set({ amountPaise: sql`${feeInvoices.amountPaise} + ${delta}`, updatedAt: new Date() }).where(eq(feeInvoices.id, inv.id));
      if (before) await tx.update(feeLateFees).set({ daysLate: fine.daysLate, appliedPaise: fine.amountPaise, lastRunOn: today, ruleId: rule.id }).where(eq(feeLateFees.id, before.id));
      else await tx.insert(feeLateFees).values({ tenantId, invoiceId: inv.id, ruleId: rule.id, daysLate: fine.daysLate, appliedPaise: fine.amountPaise, lastRunOn: today });
      assessed++;
      total += delta;
    }
    return { assessed, totalPaise: total };
  }

  @Post('late-fees/run')
  @HttpCode(200)
  @Auth('user', FEE_ROLES)
  run(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const out = await this.assess(tx, p.tenantId);
      await auditUser(tx, p, 'fees.late_fees_assessed', 'fee_invoice', p.tenantId, out);
      return out;
    });
  }

  @Get('late-fees')
  @Auth('user', FEE_ROLES)
  lateFees(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ f: feeLateFees, title: feeInvoices.title, student: students.fullName, rollNo: students.rollNo, status: feeInvoices.status, dueOn: feeInvoices.dueOn })
        .from(feeLateFees)
        .innerJoin(feeInvoices, eq(feeInvoices.id, feeLateFees.invoiceId))
        .innerJoin(students, eq(students.id, feeInvoices.studentId))
        .orderBy(desc(feeLateFees.lastRunOn))
        .limit(300);
      return rows.map((r) => ({ ...r.f, title: r.title, student: r.student, rollNo: r.rollNo, invoiceStatus: r.status, dueOn: r.dueOn, netPaise: r.f.appliedPaise - r.f.waivedPaise }));
    });
  }

  /** Waives some or all of a fine that has not been paid yet; the invoice drops by the same amount. */
  @Post('late-fees/:id/waive')
  @HttpCode(200)
  @Auth('user', APPROVERS)
  waive(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ amountPaise: z.number().int().min(1).optional(), reason: z.string().trim().min(3).max(300) }))) b: { amountPaise?: number; reason: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [f] = await tx.select().from(feeLateFees).where(eq(feeLateFees.id, id)).for('update');
      if (!f) throw new NotFoundException('Late fee not found');
      const [inv] = await tx.select().from(feeInvoices).where(eq(feeInvoices.id, f.invoiceId)).for('update');
      const open = f.appliedPaise - f.waivedPaise;
      const unpaid = inv.amountPaise - inv.paidPaise;
      const amount = Math.min(b.amountPaise ?? open, open, unpaid);
      if (amount <= 0) throw new ConflictException('There is nothing left to waive');
      await tx.update(feeInvoices).set({ amountPaise: sql`${feeInvoices.amountPaise} - ${amount}`, status: sql`case when ${feeInvoices.amountPaise} - ${amount} <= ${feeInvoices.paidPaise} then 'paid'::invoice_status else ${feeInvoices.status} end`, updatedAt: new Date() }).where(eq(feeInvoices.id, inv.id));
      const [row] = await tx.update(feeLateFees).set({ waivedPaise: f.waivedPaise + amount, waiveReason: b.reason }).where(eq(feeLateFees.id, id)).returning();
      await auditUser(tx, p, 'fees.late_fee_waived', 'fee_late_fee', id, { amountPaise: amount, reason: b.reason });
      return row;
    });
  }

  // ---- advance credit ------------------------------------------------------------------------------------------

  private async balance(tx: Tx, studentId: string): Promise<number> {
    const [r] = await tx.select({ n: sql<number>`coalesce(sum(${studentCredits.amountPaise}), 0)::bigint`.mapWith(Number) }).from(studentCredits).where(eq(studentCredits.studentId, studentId));
    return r?.n ?? 0;
  }

  /** Students holding advance credit. */
  @Get('credits')
  @Auth('user', FEE_ROLES)
  credits(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) =>
      tx
        .select({ studentId: studentCredits.studentId, name: students.fullName, rollNo: students.rollNo, balancePaise: sql<number>`sum(${studentCredits.amountPaise})::bigint`.mapWith(Number) })
        .from(studentCredits)
        .innerJoin(students, eq(students.id, studentCredits.studentId))
        .groupBy(studentCredits.studentId, students.fullName, students.rollNo)
        .having(sql`sum(${studentCredits.amountPaise}) <> 0`)
        .orderBy(asc(students.rollNo)),
    );
  }

  /** One student's balance and ledger: fee staff, the student, or a guardian. */
  @Get('credits/students/:studentId')
  @Auth('user')
  studentCredits(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.fees.assertCanSee(tx, p, studentId);
      const ledger = await tx.select().from(studentCredits).where(eq(studentCredits.studentId, studentId)).orderBy(desc(studentCredits.createdAt)).limit(200);
      return { studentId, balancePaise: await this.balance(tx, studentId), ledger };
    });
  }

  @Post('credits')
  @Auth('user', FEE_ROLES)
  addCredit(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(CreditBody)) b: z.infer<typeof CreditBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [s] = await tx.select({ id: students.id }).from(students).where(eq(students.id, b.studentId));
      if (!s) throw new NotFoundException('Student not found');
      const [row] = await tx.insert(studentCredits).values({ tenantId: p.tenantId, studentId: b.studentId, amountPaise: b.amountPaise, kind: b.kind, note: b.note, createdBy: p.userId }).returning();
      await auditUser(tx, p, 'fees.credit_added', 'student_credit', row.id, { amountPaise: b.amountPaise });
      return { ...row, balancePaise: await this.balance(tx, b.studentId) };
    });
  }

  /** Pays the credit back to the family; the balance drops. */
  @Post('credits/refund')
  @Auth('user', APPROVERS)
  refundCredit(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(RefundBody)) b: z.infer<typeof RefundBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if ((await this.balance(tx, b.studentId)) < b.amountPaise) throw new ConflictException('That is more than the credit held');
      const [row] = await tx.insert(studentCredits).values({ tenantId: p.tenantId, studentId: b.studentId, amountPaise: -b.amountPaise, kind: 'refund', note: b.note, createdBy: p.userId }).returning();
      await auditUser(tx, p, 'fees.credit_refunded', 'student_credit', row.id, { amountPaise: b.amountPaise });
      return { ...row, balancePaise: await this.balance(tx, b.studentId) };
    });
  }

  /** Settles an invoice (fully or in part) from the student's credit; a receipt is issued like any payment. */
  @Post('invoices/:id/apply-credit')
  @HttpCode(200)
  @Auth('user', FEE_ROLES)
  applyCredit(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ amountPaise: z.number().int().min(1).optional() }))) b: { amountPaise?: number }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [inv] = await tx.select().from(feeInvoices).where(eq(feeInvoices.id, id)).for('update');
      if (!inv) throw new NotFoundException('Invoice not found');
      if (inv.status !== 'due') throw new ConflictException('This invoice is not open');
      const balance = await this.balance(tx, inv.studentId);
      const amount = Math.min(b.amountPaise ?? Infinity, balance, inv.amountPaise - inv.paidPaise);
      if (amount <= 0) throw new ConflictException('There is no credit to use on this invoice');
      const [pay] = await tx.insert(feePayments).values({ tenantId: p.tenantId, invoiceId: id, studentId: inv.studentId, amountPaise: amount, method: 'credit', status: 'created', reference: 'Advance credit', recordedBy: p.userId }).returning();
      await this.fees.markPaid(tx, pay.id);
      await tx.insert(studentCredits).values({ tenantId: p.tenantId, studentId: inv.studentId, amountPaise: -amount, kind: 'applied', invoiceId: id, note: inv.title, createdBy: p.userId });
      await auditUser(tx, p, 'fees.credit_applied', 'fee_invoice', id, { amountPaise: amount });
      return { paymentId: pay.id, appliedPaise: amount, balancePaise: balance - amount };
    });
  }
}

