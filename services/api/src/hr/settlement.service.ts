import { Injectable } from '@nestjs/common';
import { and, eq, gt, isNotNull, ne, sql } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { exitClearances, payrollRuns, payslips, separations, staffProfiles } from '../db/schema.js';
import { payrollAdjustments } from '../db/schema-depth.js';
import { monthStart } from './dates.js';
import { LeaveService } from './leave.service.js';
import { daysInMonth } from './payroll-math.js';
import { PayrollService } from './payroll.service.js';
import { ReimbursementsService } from './reimbursements.service.js';
import { settlementLines, settlementNet, type SettlementInput, type SettlementLine } from './settlement.js';

type Separation = typeof separations.$inferSelect;

/**
 * Gathers what the full and final settlement is worked from: the salary structure, unpaid days of the last month (none
 * when a payroll run of that month already pays the staff member), encashable leave, loans and reimbursements due after
 * they leave payroll, notice shortfall and clearance dues.
 */
@Injectable()
export class SettlementService {
  constructor(
    private readonly payroll: PayrollService,
    private readonly leave: LeaveService,
    private readonly reimbursements: ReimbursementsService,
  ) {}

  async inputs(tx: Tx, tenantId: string, s: Separation, waiveNotice: boolean): Promise<SettlementInput> {
    const [prof] = await tx.select({ joined: staffProfiles.dateOfJoining }).from(staffProfiles).where(eq(staffProfiles.userId, s.userId));
    const [structure] = await this.payroll.structures(tx, s.userId);
    const lines = structure?.lines ?? [];
    const basicDa = lines.filter((l) => l.code === 'BASIC' || l.code === 'DA').reduce((n, l) => n + l.monthlyPaise, 0);
    const lastMonth = s.lastWorkingDay.slice(0, 7);
    const [paid] = await tx
      .select({ id: payslips.id })
      .from(payslips)
      .innerJoin(payrollRuns, eq(payrollRuns.id, payslips.runId))
      .where(and(eq(payslips.userId, s.userId), eq(payrollRuns.month, lastMonth), eq(payrollRuns.kind, 'regular'), ne(payrollRuns.status, 'reversed')));
    const from = prof?.joined && prof.joined > monthStart(lastMonth) ? prof.joined : monthStart(lastMonth);
    const unpaidDays = paid ? 0 : Math.max(0, Math.round((Date.parse(`${s.lastWorkingDay}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1);
    const types = await this.leave.types(tx, tenantId);
    const encashable = new Set(types.filter((t) => t.encashable).map((t) => t.id));
    const balances = await this.leave.balances(tx, tenantId, s.userId, Number(s.lastWorkingDay.slice(0, 4)));
    const encashableDays = balances.filter((b) => encashable.has(b.leaveType.id)).reduce((n, b) => n + Math.max(0, b.available), 0);
    const [loan] = await tx
      .select({ n: sql<number>`coalesce(sum(${payrollAdjustments.amountPaise}), 0)::bigint`.mapWith(Number) })
      .from(payrollAdjustments)
      .where(and(eq(payrollAdjustments.userId, s.userId), isNotNull(payrollAdjustments.loanId), eq(payrollAdjustments.status, 'approved'), gt(payrollAdjustments.payMonth, lastMonth)));
    const [dues] = await tx.select({ n: sql<number>`coalesce(sum(${exitClearances.duesPaise}), 0)::bigint`.mapWith(Number) }).from(exitClearances).where(eq(exitClearances.separationId, s.id));
    return {
      joinedOn: prof?.joined ?? null,
      lastWorkingDay: s.lastWorkingDay,
      monthlyBasicDaPaise: basicDa,
      monthlyGrossPaise: structure?.monthlyGrossPaise ?? 0,
      unpaidDays: Math.min(unpaidDays, daysInMonth(lastMonth)),
      daysInLastMonth: daysInMonth(lastMonth),
      encashableDays,
      noticeShortfallDays: s.noticeShortfallDays,
      waiveNotice,
      loanOutstandingPaise: loan?.n ?? 0,
      clearanceDuesPaise: dues?.n ?? 0,
      reimbursementsDuePaise: await this.reimbursements.unpaidAfter(tx, s.userId, lastMonth),
    };
  }

  async compute(tx: Tx, tenantId: string, s: Separation, waiveNotice: boolean): Promise<{ inputs: SettlementInput; lines: SettlementLine[]; netPaise: number }> {
    const inputs = await this.inputs(tx, tenantId, s, waiveNotice);
    const lines = settlementLines(inputs);
    return { inputs, lines, netPaise: settlementNet(lines) };
  }

  /**
   * Once the settlement pays the last month's salary and the loan balance, payroll must not pay or recover them again:
   * the loan instalments after the last month are closed here (payroll skips the settled month, payroll.service.ts).
   */
  async closeOut(tx: Tx, s: Separation, lines: SettlementLine[]) {
    if (lines.some((l) => l.code === 'LOAN'))
      await tx
        .update(payrollAdjustments)
        .set({ status: 'rejected', reason: sql`${payrollAdjustments.reason} || ' (recovered in the full and final settlement)'` })
        .where(and(eq(payrollAdjustments.userId, s.userId), isNotNull(payrollAdjustments.loanId), eq(payrollAdjustments.status, 'approved'), gt(payrollAdjustments.payMonth, s.lastWorkingDay.slice(0, 7))));
  }
}
