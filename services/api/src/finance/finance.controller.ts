import { BadRequestException, Body, Controller, Get, NotFoundException, Post, Put, Query, Res } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { Day, Paise } from '../common/ops.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { assetGlPostings, budgets, costExpenses, departmentStaff, departments, feeInvoices, feePayments, feeRefunds, invPurchaseOrders, payrollRuns, payslips, students, tenants } from '../db/schema.js';
import { FEE_ROLES } from '../fees/fees.service.js';
import { monthEnd, requireDay } from '../hr/dates.js';
import { PayrollService } from '../hr/payroll.service.js';
import { balanced, feeReceiptVoucher, feeRefundVoucher, fiscalRange, glCsv, glTallyXml, payrollVoucher, variance, type Voucher } from './gl.js';

const FY = z.string().regex(/^\d{4}-\d{2}$/, 'Use a financial year like 2026-27');
const BudgetBody = z.object({ departmentId: z.uuid(), fiscalYear: FY, amountPaise: Paise, note: z.string().trim().max(200).default('') });
const ExpenseBody = z.object({ departmentId: z.uuid(), spentOn: Day, description: z.string().trim().min(2).max(200), amountPaise: Paise.min(100) });
const RefundBody = z.object({ paymentId: z.uuid(), amountPaise: Paise.min(100), reason: z.string().trim().min(3).max(200) });

/** Budgets by cost centre (department) with actuals, fee refunds, and the general-ledger journal export. */
@Controller('v1/finance')
export class FinanceController {
  constructor(
    private readonly db: DbService,
    private readonly payroll: PayrollService,
  ) {}

  @Put('budgets')
  @Auth('user', FEE_ROLES)
  setBudget(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(BudgetBody)) b: z.infer<typeof BudgetBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [d] = await tx.select({ id: departments.id }).from(departments).where(eq(departments.id, b.departmentId));
      if (!d) throw new NotFoundException('Department not found');
      const [row] = await tx.insert(budgets).values({ tenantId: p.tenantId, ...b }).onConflictDoUpdate({ target: [budgets.departmentId, budgets.fiscalYear], set: { amountPaise: b.amountPaise, note: b.note } }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'budget.set', subjectType: 'budget', subjectId: row.id, data: { fiscalYear: b.fiscalYear, amountPaise: b.amountPaise } });
      return row;
    });
  }

  @Post('expenses')
  @Auth('user', FEE_ROLES)
  addExpense(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ExpenseBody)) b: z.infer<typeof ExpenseBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [d] = await tx.select({ id: departments.id }).from(departments).where(eq(departments.id, b.departmentId));
      if (!d) throw new NotFoundException('Department not found');
      const [row] = await tx.insert(costExpenses).values({ tenantId: p.tenantId, ...b, createdBy: p.userId }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'expense.added', subjectType: 'cost_expense', subjectId: row.id });
      return row;
    });
  }

  /** Every department with its budget for the year, actuals by source (purchase orders, payroll, expenses) and the variance. */
  @Get('budgets')
  @Auth('user', FEE_ROLES)
  budgetReport(@CurrentPrincipal() p: UserPrincipal, @Query('fiscalYear') fiscalYear?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const fy = FY.parse(fiscalYear ?? currentFiscalYear());
      const { from, to } = fiscalRange(fy);
      const depts = await tx.select().from(departments).orderBy(asc(departments.name));
      const set = new Map((await tx.select().from(budgets).where(eq(budgets.fiscalYear, fy))).map((b) => [b.departmentId, b]));
      const po = new Map((await tx.select({ d: invPurchaseOrders.departmentId, t: sql<number>`sum(${invPurchaseOrders.totalPaise})::bigint` }).from(invPurchaseOrders).where(and(ne(invPurchaseOrders.status, 'cancelled'), gte(invPurchaseOrders.createdAt, new Date(`${from}T00:00:00+05:30`)), lte(invPurchaseOrders.createdAt, new Date(`${to}T23:59:59+05:30`)))).groupBy(invPurchaseOrders.departmentId)).map((r) => [r.d, Number(r.t)]));
      const ex = new Map((await tx.select({ d: costExpenses.departmentId, t: sql<number>`sum(${costExpenses.amountPaise})::bigint` }).from(costExpenses).where(and(gte(costExpenses.spentOn, from), lte(costExpenses.spentOn, to))).groupBy(costExpenses.departmentId)).map((r) => [r.d, Number(r.t)]));
      const pay = new Map((await tx
        .select({ d: departmentStaff.departmentId, t: sql<number>`sum(${payslips.employerCostPaise})::bigint` })
        .from(payslips)
        .innerJoin(payrollRuns, eq(payrollRuns.id, payslips.runId))
        .innerJoin(departmentStaff, eq(departmentStaff.userId, payslips.userId))
        .where(and(inArray(payrollRuns.status, ['approved', 'locked']), gte(payrollRuns.month, from.slice(0, 7)), lte(payrollRuns.month, to.slice(0, 7))))
        .groupBy(departmentStaff.departmentId)).map((r) => [r.d, Number(r.t)]));
      return {
        fiscalYear: fy,
        rows: depts.map((d) => {
          const budgetPaise = set.get(d.id)?.amountPaise ?? 0;
          const actuals = { purchaseOrdersPaise: po.get(d.id) ?? 0, payrollPaise: pay.get(d.id) ?? 0, expensesPaise: ex.get(d.id) ?? 0 };
          const actualPaise = actuals.purchaseOrdersPaise + actuals.payrollPaise + actuals.expensesPaise;
          return { departmentId: d.id, department: d.name, budgetPaise, ...actuals, actualPaise, ...variance(budgetPaise, actualPaise) };
        }),
      };
    });
  }

  /** Refunds part or all of a paid fee: the invoice's received amount goes down and it is open again if now short. */
  @Post('refunds')
  @Auth('user', FEE_ROLES)
  refund(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(RefundBody)) b: z.infer<typeof RefundBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [pay] = await tx.select().from(feePayments).where(eq(feePayments.id, b.paymentId)).for('update');
      if (!pay || pay.status !== 'paid') throw new NotFoundException('Paid payment not found');
      const [done] = await tx.select({ t: sql<number>`coalesce(sum(${feeRefunds.amountPaise}), 0)::bigint` }).from(feeRefunds).where(eq(feeRefunds.paymentId, pay.id));
      if (Number(done.t) + b.amountPaise > pay.amountPaise) throw new BadRequestException('That is more than was paid');
      const [row] = await tx.insert(feeRefunds).values({ tenantId: p.tenantId, paymentId: pay.id, invoiceId: pay.invoiceId, studentId: pay.studentId, amountPaise: b.amountPaise, reason: b.reason, refundedBy: p.userId }).returning();
      await tx.update(feeInvoices).set({ paidPaise: sql`${feeInvoices.paidPaise} - ${b.amountPaise}`, status: sql`case when ${feeInvoices.status} = 'paid' then 'due'::invoice_status else ${feeInvoices.status} end`, updatedAt: new Date() }).where(eq(feeInvoices.id, pay.invoiceId));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'fees.refunded', subjectType: 'fee_refund', subjectId: row.id, data: { paymentId: pay.id, amountPaise: b.amountPaise } });
      return row;
    });
  }

  /** The journal for a date range, as data (for the preview). */
  @Get('gl')
  @Auth('user', FEE_ROLES)
  gl(@CurrentPrincipal() p: UserPrincipal, @Query('from') from?: string, @Query('to') to?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => ({ vouchers: await this.vouchers(tx, p.tenantId, requireDay(from, 'from'), requireDay(to, 'to')) }));
  }

  @Get('gl.csv')
  @Auth('user', FEE_ROLES)
  glCsv(@CurrentPrincipal() p: UserPrincipal, @Query('from') from: string | undefined, @Query('to') to: string | undefined, @Res({ passthrough: true }) res: Response) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const v = await this.vouchers(tx, p.tenantId, requireDay(from, 'from'), requireDay(to, 'to'));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'finance.export_gl', subjectType: 'gl', data: { from, to, format: 'csv', vouchers: v.length } });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="gl-${from}-${to}.csv"`);
      return glCsv(v);
    });
  }

  @Get('gl.xml')
  @Auth('user', FEE_ROLES)
  glXml(@CurrentPrincipal() p: UserPrincipal, @Query('from') from: string | undefined, @Query('to') to: string | undefined, @Res({ passthrough: true }) res: Response) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const v = await this.vouchers(tx, p.tenantId, requireDay(from, 'from'), requireDay(to, 'to'));
      const [t] = await tx.select({ name: tenants.name }).from(tenants);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'finance.export_gl', subjectType: 'gl', data: { from, to, format: 'tally', vouchers: v.length } });
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="tally-gl-${from}-${to}.xml"`);
      return glTallyXml(t?.name ?? '', v);
    });
  }

  /** Fee collections and refunds dated in the range (tenant-local days), and each approved or locked payroll run whose month ends in it. */
  private async vouchers(tx: Tx, tenantId: string, from: string, to: string): Promise<Voucher[]> {
    if (to < from) throw new BadRequestException('The end date is before the start');
    const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
    const day = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: t?.tz ?? 'Asia/Kolkata' });
    const lo = new Date(`${from}T00:00:00Z`);
    lo.setUTCDate(lo.getUTCDate() - 1);
    const hi = new Date(`${to}T00:00:00Z`);
    hi.setUTCDate(hi.getUTCDate() + 2);
    const out: Voucher[] = [];
    const pays = await tx.select({ pay: feePayments, name: students.fullName }).from(feePayments).innerJoin(students, eq(students.id, feePayments.studentId)).where(and(eq(feePayments.status, 'paid'), gte(feePayments.paidAt, lo), lte(feePayments.paidAt, hi))).orderBy(asc(feePayments.paidAt));
    for (const { pay, name } of pays) {
      const date = day(pay.paidAt!);
      if (date >= from && date <= to) out.push(feeReceiptVoucher({ date, receiptNo: pay.receiptNo ?? pay.id.slice(0, 8), method: pay.method, amountPaise: pay.amountPaise, student: name }));
    }
    const refs = await tx.select({ r: feeRefunds, name: students.fullName }).from(feeRefunds).innerJoin(students, eq(students.id, feeRefunds.studentId)).where(and(gte(feeRefunds.refundedAt, lo), lte(feeRefunds.refundedAt, hi))).orderBy(desc(feeRefunds.refundedAt));
    for (const { r, name } of refs) {
      const date = day(r.refundedAt);
      if (date >= from && date <= to) out.push(feeRefundVoucher({ date, id: r.id, amountPaise: r.amountPaise, student: name, reason: r.reason }));
    }
    const runs = await tx.select().from(payrollRuns).where(and(inArray(payrollRuns.status, ['approved', 'locked']), gte(payrollRuns.month, from.slice(0, 7)), lte(payrollRuns.month, to.slice(0, 7))));
    for (const run of runs) {
      const date = monthEnd(run.month);
      if (date < from || date > to) continue;
      const { settings, totals } = await this.payroll.journalTotals(tx, tenantId, run.id);
      out.push(payrollVoucher({ date, month: run.month, totals, ledgers: settings.ledgers }));
    }
    const posts = await tx.select().from(assetGlPostings).where(and(gte(assetGlPostings.postedOn, from), lte(assetGlPostings.postedOn, to)));
    for (const g of posts) out.push({ date: g.postedOn, type: 'Journal', number: g.voucherNo, narration: g.narration, lines: g.lines });
    if (!out.every(balanced)) throw new Error('A journal entry does not balance');
    return out.sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number));
  }
}

/** The Indian financial year (April to March) containing today, "2026-27". */
export function currentFiscalYear(now = new Date()): string {
  const y = now.getUTCMonth() >= 3 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}
