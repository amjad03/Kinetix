import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Payslip, PayrollRunDetail, PayrollRunSummary, SalaryComponent, SalaryStructure } from '@kinetix/shared';
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, ne, or, sql } from 'drizzle-orm';
import { audit } from '../common/audit.js';
import { DomainEvents, EventBus } from '../events/events.js';
import type { UserPrincipal } from '../auth/principal.js';
import type { Tx } from '../db/db.service.js';
import { payrollAdjustments, tdsChallans } from '../db/schema-depth.js';
import { salaryComponentRates } from '../db/schema-hr2.js';
import { payrollRuns, payslips, salaryComponents, salaryStructureLines, salaryStructures, staffProfiles, tenants } from '../db/schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { texts } from '../notifications/texts.js';
import { monthEnd, monthStart } from './dates.js';
import { HrService } from './hr.service.js';
import { requireVersion } from './hr.access.js';
import { annualTax, computePayslip, daysInMonth, fyStart, resolveLines, type StructureLine } from './payroll-math.js';
import { csv as csvText } from './exports.js';
import { monthTakesAdjustments } from './hr-depth.controller.js';
import { monthLabel } from './payslip-pdf.js';
import { formatSeries, takeNumbers } from './hr-settings.js';
import type { TallyTotals } from './exports.js';

export const DEFAULT_COMPONENTS = [
  { code: 'BASIC', name: 'Basic pay', kind: 'earning', pfWage: true, taxable: true, sortOrder: 1 },
  { code: 'HRA', name: 'House rent allowance', kind: 'earning', pfWage: false, taxable: true, sortOrder: 2 },
  { code: 'SPL', name: 'Special allowance', kind: 'earning', pfWage: false, taxable: true, sortOrder: 3 },
  { code: 'LOAN', name: 'Loan recovery', kind: 'deduction', pfWage: false, taxable: false, sortOrder: 10 },
] as const;

type Run = typeof payrollRuns.$inferSelect;
type StoredPayslip = Omit<Payslip, 'id' | 'runId' | 'month' | 'runStatus'> & { pfWagePaise: number; esiPaise: number; ptPaise: number; lwfPaise?: number; tdsPaise: number; employeePfPaise: number; pan: string | null; uan: string | null; esiNumber: string | null; employerCostPaise: number; taxableGrossPaise?: number };

/** The rate of a percentage component in force in a month (YYYY-MM): the latest revision from that month or before. */
export function rateIn(rates: { componentId: string; effectiveMonth: string; percent: number }[], componentId: string, month: string): number | null {
  const r = rates.filter((x) => x.componentId === componentId && x.effectiveMonth <= month).sort((a, b) => b.effectiveMonth.localeCompare(a.effectiveMonth))[0];
  return r ? r.percent : null;
}

@Injectable()
export class PayrollService {
  constructor(
    private readonly hr: HrService,
    private readonly notifications: NotificationsService,
    private readonly events: EventBus,
  ) {}

  // ----- components and structures ----------------------------------------------------------------

  async components(tx: Tx, tenantId: string): Promise<SalaryComponent[]> {
    const any = await tx.select({ id: salaryComponents.id }).from(salaryComponents).limit(1);
    if (!any.length) await tx.insert(salaryComponents).values(DEFAULT_COMPONENTS.map((c) => ({ ...c, tenantId }))).onConflictDoNothing();
    const rates = await tx.select().from(salaryComponentRates);
    const month = (await this.hr.today(tx)).slice(0, 7);
    return (await tx.select().from(salaryComponents).orderBy(asc(salaryComponents.sortOrder), asc(salaryComponents.code))).map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      kind: c.kind as SalaryComponent['kind'],
      pfWage: c.pfWage,
      taxable: c.taxable,
      active: c.active,
      sortOrder: c.sortOrder,
      calc: c.calc as 'fixed' | 'percent',
      percent: c.calc === 'percent' ? (rateIn(rates, c.id, month) ?? c.percent) : null,
      baseCode: c.baseCode,
    }));
  }

  private async structureView(tx: Tx, userId: string, s: typeof salaryStructures.$inferSelect): Promise<SalaryStructure> {
    const lines = await tx
      .select({ componentId: salaryComponents.id, code: salaryComponents.code, name: salaryComponents.name, kind: salaryComponents.kind, monthlyPaise: salaryStructureLines.monthlyPaise, sort: salaryComponents.sortOrder })
      .from(salaryStructureLines)
      .innerJoin(salaryComponents, eq(salaryComponents.id, salaryStructureLines.componentId))
      .where(eq(salaryStructureLines.structureId, s.id))
      .orderBy(asc(salaryComponents.sortOrder));
    return {
      userId,
      effectiveFrom: s.effectiveFrom,
      lines: lines.map(({ sort: _s, ...l }) => ({ ...l, kind: l.kind as SalaryComponent['kind'] })),
      monthlyGrossPaise: lines.filter((l) => l.kind === 'earning').reduce((t, l) => t + l.monthlyPaise, 0),
    };
  }

  /** Every revision, newest first. */
  async structures(tx: Tx, userId: string): Promise<SalaryStructure[]> {
    const rows = await tx.select().from(salaryStructures).where(eq(salaryStructures.userId, userId)).orderBy(desc(salaryStructures.effectiveFrom));
    return Promise.all(rows.map((r) => this.structureView(tx, userId, r)));
  }

  async saveStructure(tx: Tx, p: UserPrincipal, userId: string, effectiveFrom: string, lines: { componentId: string; monthlyPaise: number }[]): Promise<SalaryStructure> {
    const comps = await this.components(tx, p.tenantId);
    const byId = new Map(comps.map((c) => [c.id, c]));
    if (new Set(lines.map((l) => l.componentId)).size !== lines.length) throw new ConflictException('A component appears twice');
    for (const l of lines) if (!byId.get(l.componentId)?.active) throw new NotFoundException('Salary component not found');
    if (!lines.some((l) => byId.get(l.componentId)!.kind === 'earning')) throw new ConflictException('Add at least one earning');
    const [prof] = await tx.select({ userId: staffProfiles.userId }).from(staffProfiles).where(eq(staffProfiles.userId, userId));
    if (!prof) throw new ConflictException('Create the staff record first');
    // Months already locked keep the figures they were paid with (payslips are the record), so a
    // revision can only take effect from an open month.
    const [locked] = await tx.select({ month: payrollRuns.month }).from(payrollRuns).where(and(eq(payrollRuns.status, 'locked'), gte(payrollRuns.month, effectiveFrom.slice(0, 7))));
    if (locked && effectiveFrom <= monthEnd(locked.month)) throw new ConflictException('That period is already locked in payroll');
    const [existing] = await tx.select().from(salaryStructures).where(and(eq(salaryStructures.userId, userId), eq(salaryStructures.effectiveFrom, effectiveFrom)));
    const structure = existing ?? (await tx.insert(salaryStructures).values({ tenantId: p.tenantId, userId, effectiveFrom, createdBy: p.userId }).returning())[0];
    await tx.delete(salaryStructureLines).where(eq(salaryStructureLines.structureId, structure.id));
    // Percentage lines (DA on basic) are worked out from their base at the rate of the first month; payroll works
    // them out again each month, so a DA revision needs no new structure.
    const rates = await tx.select().from(salaryComponentRates);
    const resolved = resolveLines(
      lines.map((l) => {
        const c = byId.get(l.componentId)!;
        return { code: c.code, name: c.name, kind: c.kind, monthlyPaise: l.monthlyPaise, pfWage: c.pfWage, taxable: c.taxable, calc: c.calc, percent: c.percent, baseCode: c.baseCode, id: c.id };
      }),
      (code) => {
        const c = comps.find((x) => x.code === code);
        return c ? rateIn(rates, c.id, effectiveFrom.slice(0, 7)) : null;
      },
    );
    await tx.insert(salaryStructureLines).values(lines.map((l, k) => ({ tenantId: p.tenantId, structureId: structure.id, componentId: l.componentId, monthlyPaise: Math.max(1, resolved[k].monthlyPaise) })));
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'payroll.structure_saved', subjectType: 'user', subjectId: userId, data: { effectiveFrom, lines: lines.length } });
    return this.structureView(tx, userId, structure);
  }

  // ----- runs -----------------------------------------------------------------------------------

  async createRun(tx: Tx, p: UserPrincipal, month: string, opts: { kind?: 'regular' | 'supplementary'; staffIds?: string[]; note?: string } = {}): Promise<PayrollRunDetail> {
    const today = await this.hr.today(tx);
    if (month > today.slice(0, 7)) throw new ConflictException('Payroll cannot be run for a future month');
    const kind = opts.kind ?? 'regular';
    const live = await tx.select({ id: payrollRuns.id, kind: payrollRuns.kind, status: payrollRuns.status, seq: payrollRuns.seq }).from(payrollRuns).where(and(eq(payrollRuns.month, month), ne(payrollRuns.status, 'reversed')));
    const regular = live.find((r) => r.kind === 'regular');
    let seq = 1;
    if (kind === 'regular') {
      if (regular) throw new ConflictException('There is already a payroll run for that month');
    } else {
      if (regular?.status !== 'locked') throw new ConflictException('A supplementary run follows the locked regular run of the month');
      if (live.some((r) => r.kind === 'supplementary' && r.status !== 'locked')) throw new ConflictException('Finish the open supplementary run of the month first');
      seq = Math.max(...live.map((r) => r.seq)) + 1;
    }
    const [run] = await tx.insert(payrollRuns).values({ tenantId: p.tenantId, month, kind, seq, staffIds: opts.staffIds ?? [], note: opts.note ?? '', createdBy: p.userId }).returning();
    await this.compute(tx, p.tenantId, run);
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'payroll.run_created', subjectType: 'payroll_run', subjectId: run.id, data: { month, kind, seq } });
    return this.detail(tx, run.id);
  }

  /**
   * Reverses a locked run that must be redone (wrong figures, paid in error): its payslips leave the staff's view,
   * its adjustments and loan instalments are released to be paid again, and a new run can be made for the month.
   * Only the latest locked run of the financial year can be reversed (TDS builds on the year to date).
   */
  async reverse(tx: Tx, p: UserPrincipal, id: string, expected: number, reason: string): Promise<PayrollRunDetail> {
    const [run] = await tx.select().from(payrollRuns).where(eq(payrollRuns.id, id)).for('update');
    if (!run) throw new NotFoundException('Payroll run not found');
    if (run.status !== 'locked') throw new ConflictException('Only a locked run is reversed; reopen an unlocked one instead');
    requireVersion(run.version, expected);
    const [later] = await tx
      .select({ month: payrollRuns.month, seq: payrollRuns.seq })
      .from(payrollRuns)
      .where(and(eq(payrollRuns.status, 'locked'), ne(payrollRuns.id, id), or(sql`${payrollRuns.month} > ${run.month}`, and(eq(payrollRuns.month, run.month), sql`${payrollRuns.seq} > ${run.seq}`))));
    if (later) throw new ConflictException(`Reverse the later run of ${later.month} first`);
    await tx.update(payrollRuns).set({ status: 'reversed', reversedBy: p.userId, reversedAt: new Date(), reversalReason: reason, version: run.version + 1 }).where(eq(payrollRuns.id, id));
    const released = await tx.update(payrollAdjustments).set({ runId: null }).where(eq(payrollAdjustments.runId, id)).returning({ id: payrollAdjustments.id });
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'payroll.run_reversed', subjectType: 'payroll_run', subjectId: id, data: { month: run.month, version: run.version, reason, adjustmentsReleased: released.length } });
    const staff = await tx.select({ userId: payslips.userId }).from(payslips).where(eq(payslips.runId, id));
    if (run.publishedAt) for (const s of staff) await this.notifications.notifyUsers(tx, [s.userId], { kind: 'payslip', text: texts.payslipReady({ month: `${monthLabel(run.month)} (withdrawn)` }), data: { runId: id, month: run.month }, dedupeKey: `payslip-rev:${id}:${s.userId}` });
    return this.detail(tx, id);
  }

  /** Recomputes every payslip of a draft run from the current records. */
  async compute(tx: Tx, tenantId: string, run: Run): Promise<void> {
    const month = run.month;
    const settings = await this.hr.settings(tx, tenantId);
    const lop = await this.hr.lopByUser(tx, month, settings);
    const staff = await this.hr.listStaff(tx);
    const profiles = new Map((await tx.select().from(staffProfiles)).map((r) => [r.userId, r]));
    const structures = await tx.select().from(salaryStructures).where(lte(salaryStructures.effectiveFrom, monthEnd(month))).orderBy(desc(salaryStructures.effectiveFrom));
    const lineRows = structures.length
      ? await tx
          .select({ structureId: salaryStructureLines.structureId, componentId: salaryComponents.id, code: salaryComponents.code, name: salaryComponents.name, kind: salaryComponents.kind, pfWage: salaryComponents.pfWage, taxable: salaryComponents.taxable, monthlyPaise: salaryStructureLines.monthlyPaise, sort: salaryComponents.sortOrder, calc: salaryComponents.calc, percent: salaryComponents.percent, baseCode: salaryComponents.baseCode })
          .from(salaryStructureLines)
          .innerJoin(salaryComponents, eq(salaryComponents.id, salaryStructureLines.componentId))
          .where(inArray(salaryStructureLines.structureId, structures.map((s) => s.id)))
          .orderBy(asc(salaryComponents.sortOrder))
      : [];
    const rates = await tx.select().from(salaryComponentRates);
    const supplementary = run.kind === 'supplementary';
    // Year to date from locked runs of this financial year (TDS is a running figure); a supplementary run also
    // counts the month's regular run.
    const fy = fyStart(month);
    const ytdRows = await tx
      .select({ userId: payslips.userId, taxable: sql<number>`sum(${payslips.taxableGrossPaise})::bigint`.mapWith(Number), pt: sql<number>`sum(${payslips.ptPaise})::bigint`.mapWith(Number), pf: sql<number>`sum(${payslips.employeePfPaise})::bigint`.mapWith(Number), tds: sql<number>`sum(${payslips.tdsPaise})::bigint`.mapWith(Number) })
      .from(payslips)
      .innerJoin(payrollRuns, eq(payrollRuns.id, payslips.runId))
      .where(and(eq(payrollRuns.status, 'locked'), gte(payrollRuns.month, `${fy}-04`), supplementary ? lte(payrollRuns.month, month) : lt(payrollRuns.month, month), ne(payrollRuns.id, run.id)))
      .groupBy(payslips.userId);
    const ytd = new Map(ytdRows.map((r) => [r.userId, r]));
    // Who the month's earlier runs already paid in full, and what each was paid (a supplementary run's TDS base).
    const paidThisMonth = supplementary
      ? new Map(
          (
            await tx
              .select({ userId: payslips.userId, taxable: payslips.taxableGrossPaise, data: payslips.data })
              .from(payslips)
              .innerJoin(payrollRuns, eq(payrollRuns.id, payslips.runId))
              .where(and(eq(payrollRuns.month, month), eq(payrollRuns.status, 'locked'), ne(payrollRuns.id, run.id)))
          ).map((r) => [r.userId, r.taxable]),
        )
      : new Map<string, number>();
    const lwfDue = settings.lwf?.enabled && settings.lwf.months.includes(Number(month.slice(5, 7))) ? settings.lwf : null;

    // Approved overtime, arrears, bonuses and recoveries for this month go onto the payslip in full.
    const adjRows = await tx.select().from(payrollAdjustments).where(and(eq(payrollAdjustments.payMonth, month), eq(payrollAdjustments.status, 'approved'), or(isNull(payrollAdjustments.runId), eq(payrollAdjustments.runId, run.id))));
    const ADJ_NAME: Record<string, [string, string]> = { overtime: ['OT', 'Overtime'], arrear: ['ARR', 'Arrears'], bonus: ['BONUS', 'Bonus'], recovery: ['REC', 'Recovery'], encashment: ['LENC', 'Leave encashment'] };

    await tx.delete(payslips).where(eq(payslips.runId, run.id));
    const skipped: Run['skipped'] = [];
    const days = daysInMonth(month);
    for (const s of staff) {
      const prof = profiles.get(s.userId);
      if (!prof) {
        skipped.push({ userId: s.userId, fullName: s.fullName, reason: 'No HR record' });
        continue;
      }
      if (prof.status === 'exited' && prof.dateOfLeaving && prof.dateOfLeaving < monthStart(month)) continue;
      if (prof.dateOfJoining && prof.dateOfJoining > monthEnd(month)) continue;
      const structure = structures.find((x) => x.userId === s.userId);
      const extras = adjRows.filter((a) => a.userId === s.userId);
      // A supplementary run pays in full only the staff it names (late joiners) who were not paid this month,
      // and everyone else only their adjustments.
      const full = supplementary ? run.staffIds.includes(s.userId) && !paidThisMonth.has(s.userId) : true;
      if (supplementary && !full && extras.length === 0) continue;
      if (full && !structure) {
        skipped.push({ userId: s.userId, fullName: s.fullName, reason: 'No salary structure' });
        continue;
      }
      const lines: StructureLine[] = full
        ? resolveLines(
            lineRows.filter((l) => l.structureId === structure!.id).map((l) => ({ code: l.code, name: l.name, kind: l.kind as 'earning', monthlyPaise: l.monthlyPaise, pfWage: l.pfWage, taxable: l.taxable, calc: l.calc, percent: l.percent, baseCode: l.baseCode })),
            (code) => {
              const line = lineRows.find((l) => l.code === code);
              return line ? rateIn(rates, line.componentId, month) : null;
            },
          )
        : [];
      const y = ytd.get(s.userId);
      const c = computePayslip({
        month,
        daysInMonth: days,
        lopDays: full ? (lop.get(s.userId) ?? 0) : 0,
        lines,
        lwf: full && prof.lwfEnabled && lwfDue ? { employeePaise: lwfDue.employeePaise, employerPaise: lwfDue.employerPaise } : null,
        supplementary: supplementary && !full ? { regularMonthTaxablePaise: paidThisMonth.get(s.userId) ?? 0 } : null,
        pf: { capAtCeiling: settings.pfCapAtCeiling, wageCeilingPaise: settings.pfWageCeilingPaise },
        esiLimitPaise: settings.esiGrossLimitPaise,
        ptSlabs: settings.ptSlabs,
        staff: { regime: prof.taxRegime as 'new', pfEnabled: prof.pfEnabled, esiEnabled: prof.esiEnabled, ptEnabled: prof.ptEnabled, tax80cPaise: prof.tax80cPaise, taxOtherDeductionsPaise: prof.taxOtherDeductionsPaise },
        ytd: { grossTaxablePaise: y?.taxable ?? 0, ptPaise: y?.pt ?? 0, employeePfPaise: y?.pf ?? 0, tdsPaise: y?.tds ?? 0 },
        extras: extras.map((a) => ({ code: a.loanId ? 'LADV' : (ADJ_NAME[a.kind]?.[0] ?? 'ADJ'), name: a.loanId ? 'Loan / advance recovery' : (ADJ_NAME[a.kind]?.[1] ?? 'Adjustment'), amountPaise: a.amountPaise, taxable: true, recovery: a.kind === 'recovery' })),
      });
      const employerCost = c.grossPaise + c.employer.epfPaise + c.employer.epsPaise + c.employer.esiPaise + c.employer.lwfPaise;
      const data: StoredPayslip = {
        user: { id: s.userId, fullName: s.fullName, employeeCode: prof.employeeCode, designation: s.designation?.name ?? null, department: s.department?.name ?? null },
        daysInMonth: days,
        lopDays: days - c.paidDays,
        paidDays: c.paidDays,
        earnings: c.earnings,
        deductions: c.deductions,
        grossPaise: c.grossPaise,
        deductionsPaise: c.deductionsPaise,
        netPaise: c.netPaise,
        employer: c.employer,
        taxRegime: prof.taxRegime as 'new',
        annualTaxPaise: c.annualTaxPaise,
        pfWagePaise: c.pfWagePaise,
        esiPaise: c.esiPaise,
        ptPaise: c.ptPaise,
        lwfPaise: c.lwfPaise,
        tdsPaise: c.tdsPaise,
        employeePfPaise: c.employeePfPaise,
        taxableGrossPaise: c.taxableGrossPaise,
        pan: prof.pan,
        uan: prof.uan,
        esiNumber: prof.esiNumber,
        employerCostPaise: employerCost,
      };
      await tx.insert(payslips).values({ tenantId, runId: run.id, userId: s.userId, grossPaise: c.grossPaise, deductionsPaise: c.deductionsPaise, netPaise: c.netPaise, employerCostPaise: employerCost, taxableGrossPaise: c.taxableGrossPaise, ptPaise: c.ptPaise, employeePfPaise: c.employeePfPaise, tdsPaise: c.tdsPaise, data });
    }
    if (adjRows.length) await tx.update(payrollAdjustments).set({ runId: run.id }).where(inArray(payrollAdjustments.id, adjRows.map((a) => a.id)));
    await tx.update(payrollRuns).set({ skipped, version: sql`${payrollRuns.version} + 1` }).where(eq(payrollRuns.id, run.id));
  }

  private async summaries(tx: Tx, where?: ReturnType<typeof eq>): Promise<PayrollRunSummary[]> {
    const rows = await tx
      .select({
        r: payrollRuns,
        n: sql<number>`count(${payslips.id})::int`,
        gross: sql<number>`coalesce(sum(${payslips.grossPaise}), 0)::bigint`.mapWith(Number),
        ded: sql<number>`coalesce(sum(${payslips.deductionsPaise}), 0)::bigint`.mapWith(Number),
        net: sql<number>`coalesce(sum(${payslips.netPaise}), 0)::bigint`.mapWith(Number),
        cost: sql<number>`coalesce(sum(${payslips.employerCostPaise}), 0)::bigint`.mapWith(Number),
      })
      .from(payrollRuns)
      .leftJoin(payslips, eq(payslips.runId, payrollRuns.id))
      .where(where)
      .groupBy(payrollRuns.id)
      .orderBy(desc(payrollRuns.month), desc(payrollRuns.seq), desc(payrollRuns.createdAt));
    return rows.map((x) => ({
      id: x.r.id,
      month: x.r.month,
      status: x.r.status as PayrollRunSummary['status'],
      version: x.r.version,
      staffCount: x.n,
      grossPaise: x.gross,
      deductionsPaise: x.ded,
      netPaise: x.net,
      employerCostPaise: x.cost,
      createdAt: x.r.createdAt.toISOString(),
      approvedAt: x.r.approvedAt?.toISOString() ?? null,
      lockedAt: x.r.lockedAt?.toISOString() ?? null,
      verifiedAt: x.r.verifiedAt?.toISOString() ?? null,
      bankFileAt: x.r.bankFileAt?.toISOString() ?? null,
      publishedAt: x.r.publishedAt?.toISOString() ?? null,
      kind: x.r.kind as 'regular' | 'supplementary',
      seq: x.r.seq,
      note: x.r.note,
      reversedAt: x.r.reversedAt?.toISOString() ?? null,
      reversalReason: x.r.reversalReason,
    }));
  }

  list(tx: Tx) {
    return this.summaries(tx);
  }

  async run(tx: Tx, id: string): Promise<Run> {
    const [r] = await tx.select().from(payrollRuns).where(eq(payrollRuns.id, id));
    if (!r) throw new NotFoundException('Payroll run not found');
    return r;
  }

  private payslipView(row: typeof payslips.$inferSelect, run: Run): Payslip {
    const d = row.data as StoredPayslip;
    return {
      id: row.id,
      payslipNo: row.payslipNo,
      runId: run.id,
      month: run.month,
      runStatus: run.status as Payslip['runStatus'],
      user: d.user,
      daysInMonth: d.daysInMonth,
      lopDays: d.lopDays,
      paidDays: d.paidDays,
      earnings: d.earnings,
      deductions: d.deductions,
      grossPaise: d.grossPaise,
      deductionsPaise: d.deductionsPaise,
      netPaise: d.netPaise,
      employer: d.employer,
      taxRegime: d.taxRegime,
      annualTaxPaise: d.annualTaxPaise,
    };
  }

  async detail(tx: Tx, id: string): Promise<PayrollRunDetail> {
    const run = await this.run(tx, id);
    const [summary] = await this.summaries(tx, eq(payrollRuns.id, id));
    const rows = await tx.select().from(payslips).where(eq(payslips.runId, id));
    return { ...summary, payslips: rows.map((r) => this.payslipView(r, run)).sort((a, b) => a.user.fullName.localeCompare(b.user.fullName)), skipped: run.skipped };
  }

  async recompute(tx: Tx, p: UserPrincipal, id: string, expected?: number): Promise<PayrollRunDetail> {
    const [run] = await tx.select().from(payrollRuns).where(eq(payrollRuns.id, id)).for('update');
    if (!run) throw new NotFoundException('Payroll run not found');
    if (run.status !== 'draft' && run.status !== 'verified') throw new ConflictException('Only a draft run can be recomputed');
    requireVersion(run.version, expected);
    // Recomputing changes the figures, so a verified run goes back to draft to be checked again.
    if (run.status === 'verified') await tx.update(payrollRuns).set({ status: 'draft', verifiedBy: null, verifiedAt: null }).where(eq(payrollRuns.id, id));
    await this.compute(tx, p.tenantId, run);
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'payroll.run_recomputed', subjectType: 'payroll_run', subjectId: id, data: { month: run.month } });
    return this.detail(tx, id);
  }

  /**
   * prepare (draft) → verify (verified, HR or accounts) → approve (approved, principal) → lock (locked) → publish payslips.
   * Reopen sends a verified or approved run back to draft.
   */
  async transition(tx: Tx, p: UserPrincipal, id: string, action: 'verify' | 'approve' | 'lock' | 'reopen' | 'publish', expected: number): Promise<PayrollRunDetail> {
    const [run] = await tx.select().from(payrollRuns).where(eq(payrollRuns.id, id)).for('update');
    if (!run) throw new NotFoundException('Payroll run not found');
    const from = { verify: ['draft'], approve: ['verified'], lock: ['approved'], reopen: ['verified', 'approved'], publish: ['locked'] }[action];
    const verb = { verify: 'verified', approve: 'approved', lock: 'locked', reopen: 'reopened', publish: 'published' }[action];
    if (!from.includes(run.status)) throw new ConflictException(run.status === 'draft' && action === 'approve' ? 'Verify the run before approving it' : `A ${run.status} run cannot be ${verb}`);
    requireVersion(run.version, expected);
    const now = new Date();
    if (action === 'verify') {
      const [n] = await tx.select({ n: sql<number>`count(*)::int` }).from(payslips).where(eq(payslips.runId, id));
      if (n.n === 0) throw new ConflictException('This run has no payslips');
      await tx.update(payrollRuns).set({ status: 'verified', verifiedBy: p.userId, verifiedAt: now, version: run.version + 1 }).where(eq(payrollRuns.id, id));
    } else if (action === 'publish') {
      if (run.publishedAt) throw new ConflictException('These payslips are already published');
      const rows = await tx.select({ userId: payslips.userId, id: payslips.id }).from(payslips).where(eq(payslips.runId, id)).orderBy(asc(payslips.createdAt), asc(payslips.id));
      const { series, first } = await takeNumbers(tx, p.tenantId, 'payslipSeries', rows.length);
      const on = new Date(`${monthEnd(run.month)}T00:00:00Z`);
      for (const [i, r] of rows.entries()) await tx.update(payslips).set({ payslipNo: formatSeries(series, on, first + i) }).where(eq(payslips.id, r.id));
      await tx.update(payrollRuns).set({ publishedBy: p.userId, publishedAt: now, version: run.version + 1 }).where(eq(payrollRuns.id, id));
      for (const r of rows) await this.notifications.notifyUsers(tx, [r.userId], { kind: 'payslip', text: texts.payslipReady({ month: monthLabel(run.month) }), data: { payslipId: r.id, month: run.month }, dedupeKey: `payslip:${r.id}` });
    } else if (action === 'approve') {
      await tx.update(payrollRuns).set({ status: 'approved', approvedBy: p.userId, approvedAt: now, version: run.version + 1 }).where(eq(payrollRuns.id, id));
    } else if (action === 'lock') {
      // TDS projections build on the year to date, which only counts locked runs: lock in order.
      const [earlier] = await tx
        .select({ month: payrollRuns.month })
        .from(payrollRuns)
        .where(and(sql`${payrollRuns.status} not in ('locked', 'reversed')`, ne(payrollRuns.id, id), or(and(lt(payrollRuns.month, run.month), gte(payrollRuns.month, `${fyStart(run.month)}-04`)), and(eq(payrollRuns.month, run.month), sql`${payrollRuns.seq} < ${run.seq}`))));
      if (earlier) throw new ConflictException(`Lock ${earlier.month} first`);
      await tx.update(payrollRuns).set({ status: 'locked', lockedBy: p.userId, lockedAt: now, version: run.version + 1 }).where(eq(payrollRuns.id, id));
      const rows = await tx.select({ userId: payslips.userId, id: payslips.id }).from(payslips).where(eq(payslips.runId, id));
      await this.events.emit(tx, p.tenantId, { type: DomainEvents.PayrollLocked, aggregateType: 'payroll_run', aggregateId: id, actorId: p.userId, payload: { month: run.month, payslips: rows.length } });
    } else {
      await tx.update(payrollRuns).set({ status: 'draft', verifiedBy: null, verifiedAt: null, approvedBy: null, approvedAt: null, version: run.version + 1 }).where(eq(payrollRuns.id, id));
    }
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: `payroll.run_${verb}`, subjectType: 'payroll_run', subjectId: id, data: { month: run.month, version: run.version } });
    return this.detail(tx, id);
  }

  // ----- payslips and exports -----------------------------------------------------------------------

  async myPayslips(tx: Tx, userId: string): Promise<Payslip[]> {
    const rows = await tx.select({ s: payslips, r: payrollRuns }).from(payslips).innerJoin(payrollRuns, eq(payrollRuns.id, payslips.runId)).where(and(eq(payslips.userId, userId), eq(payrollRuns.status, 'locked'), sql`${payrollRuns.publishedAt} is not null`)).orderBy(desc(payrollRuns.month));
    return rows.map((x) => this.payslipView(x.s, x.r));
  }

  /** A payslip for its owner (locked runs only) or payroll staff (any run). */
  async payslip(tx: Tx, id: string, viewer: { userId: string; payroll: boolean }): Promise<{ payslip: Payslip; institution: string }> {
    const [x] = await tx.select({ s: payslips, r: payrollRuns, institution: tenants.name }).from(payslips).innerJoin(payrollRuns, eq(payrollRuns.id, payslips.runId)).innerJoin(tenants, eq(tenants.id, payslips.tenantId)).where(eq(payslips.id, id));
    if (!x || (!viewer.payroll && (x.s.userId !== viewer.userId || x.r.status !== 'locked' || !x.r.publishedAt))) throw new NotFoundException('Payslip not found');
    return { payslip: this.payslipView(x.s, x.r), institution: x.institution };
  }

  /** All the figures an export needs, with identity details from the stored payslips. */
  /** The run's journal totals for Tally and the finance GL export. */
  async journalTotals(tx: Tx, tenantId: string, id: string) {
    const { run, settings, rows } = await this.exportRows(tx, tenantId, id);
    const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + f(r), 0);
    const totals: TallyTotals = {
      grossPaise: sum((r) => r.d.grossPaise),
      employeePfPaise: sum((r) => r.d.employeePfPaise),
      employerPfPaise: sum((r) => r.d.employer.epfPaise + r.d.employer.epsPaise),
      employeeEsiPaise: sum((r) => r.d.esiPaise),
      employerEsiPaise: sum((r) => r.d.employer.esiPaise),
      ptPaise: sum((r) => r.d.ptPaise),
      tdsPaise: sum((r) => r.d.tdsPaise),
      employeeLwfPaise: sum((r) => r.d.lwfPaise ?? 0),
      employerLwfPaise: sum((r) => r.d.employer.lwfPaise ?? 0),
      otherDeductionsPaise: 0,
      netPaise: sum((r) => r.d.netPaise),
    };
    totals.otherDeductionsPaise = sum((r) => r.d.deductionsPaise) - totals.employeePfPaise - totals.employeeEsiPaise - totals.ptPaise - totals.tdsPaise - (totals.employeeLwfPaise ?? 0);
    return { run, settings, totals };
  }

  // ----- DA revisions -----------------------------------------------------------------------------------

  async rates(tx: Tx, componentId: string) {
    const [c] = await tx.select().from(salaryComponents).where(eq(salaryComponents.id, componentId));
    if (!c) throw new NotFoundException('Salary component not found');
    const rows = await tx.select().from(salaryComponentRates).where(eq(salaryComponentRates.componentId, componentId)).orderBy(desc(salaryComponentRates.effectiveMonth));
    return { component: { id: c.id, code: c.code, name: c.name, calc: c.calc, percent: c.percent, baseCode: c.baseCode }, rates: rows.map((r) => ({ id: r.id, effectiveMonth: r.effectiveMonth, percent: r.percent, note: r.note, createdAt: r.createdAt.toISOString() })) };
  }

  async reviseRate(tx: Tx, p: UserPrincipal, componentId: string, b: { effectiveMonth: string; percent: number; note: string; arrearsMonth?: string }) {
    const [c] = await tx.select().from(salaryComponents).where(eq(salaryComponents.id, componentId)).for('update');
    if (!c) throw new NotFoundException('Salary component not found');
    if (c.calc !== 'percent') throw new ConflictException('Only a percentage component (such as DA) has rate revisions');
    const today = await this.hr.today(tx);
    const payIn = b.arrearsMonth ?? today.slice(0, 7);
    if (b.effectiveMonth > payIn) throw new BadRequestException('The arrears month is before the revision');
    const [dup] = await tx.select({ id: salaryComponentRates.id }).from(salaryComponentRates).where(and(eq(salaryComponentRates.componentId, componentId), eq(salaryComponentRates.effectiveMonth, b.effectiveMonth)));
    if (dup) throw new ConflictException('There is already a revision from that month');
    const [rate] = await tx.insert(salaryComponentRates).values({ tenantId: p.tenantId, componentId, effectiveMonth: b.effectiveMonth, percent: b.percent, note: b.note, createdBy: p.userId }).returning();
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'salary_component.rate_revised', subjectType: 'salary_component', subjectId: componentId, data: { effectiveMonth: b.effectiveMonth, percent: b.percent, note: b.note } });
    // Locked months from the revision on were paid at the old rate: the difference is owed as arrears.
    const paid = await tx
      .select({ userId: payslips.userId, month: payrollRuns.month, data: payslips.data })
      .from(payslips)
      .innerJoin(payrollRuns, eq(payrollRuns.id, payslips.runId))
      .where(and(eq(payrollRuns.status, 'locked'), gte(payrollRuns.month, b.effectiveMonth), lt(payrollRuns.month, payIn)));
    const owed = new Map<string, { paise: number; months: Set<string> }>();
    for (const r of paid) {
      const d = r.data as StoredPayslip;
      const line = d.earnings.find((e) => e.code === c.code);
      const base = d.earnings.find((e) => e.code === c.baseCode);
      if (!line || !base) continue;
      const diff = Math.round((base.amountPaise * b.percent) / 10000) * 100 - line.amountPaise;
      if (diff <= 0) continue;
      const o = owed.get(r.userId) ?? { paise: 0, months: new Set<string>() };
      o.paise += diff;
      o.months.add(r.month);
      owed.set(r.userId, o);
    }
    if (owed.size && !(await monthTakesAdjustments(tx, payIn))) throw new ConflictException(`The payroll of ${payIn} is locked: start a supplementary run or choose a later month for the arrears`);
    let total = 0;
    for (const [userId, o] of owed) {
      const [adj] = await tx
        .insert(payrollAdjustments)
        .values({ tenantId: p.tenantId, userId, kind: 'arrear', payMonth: payIn, amountPaise: o.paise, reason: `${c.name} revised to ${b.percent}% from ${b.effectiveMonth}: arrears for ${o.months.size} month(s)`, createdBy: p.userId })
        .returning({ id: payrollAdjustments.id });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'payroll.arrears_computed', subjectType: 'payroll_adjustment', subjectId: adj.id, data: { componentId, months: o.months.size, amountPaise: o.paise } });
      total += o.paise;
    }
    return { rate: { id: rate.id, effectiveMonth: rate.effectiveMonth, percent: rate.percent }, arrears: { staff: owed.size, totalPaise: total, payMonth: payIn } };
  }

  // ----- Form 24Q ----------------------------------------------------------------------------------------

  private async taxRows(tx: Tx, from: string, to: string) {
    return tx
      .select({ userId: payslips.userId, month: payrollRuns.month, gross: payslips.grossPaise, taxable: payslips.taxableGrossPaise, tds: payslips.tdsPaise, pt: payslips.ptPaise, pf: payslips.employeePfPaise, data: payslips.data, pan: staffProfiles.pan, regime: staffProfiles.taxRegime, code: staffProfiles.employeeCode, doj: staffProfiles.dateOfJoining, dol: staffProfiles.dateOfLeaving, c80: staffProfiles.tax80cPaise, other: staffProfiles.taxOtherDeductionsPaise })
      .from(payslips)
      .innerJoin(payrollRuns, eq(payrollRuns.id, payslips.runId))
      .innerJoin(staffProfiles, eq(staffProfiles.userId, payslips.userId))
      .where(and(eq(payrollRuns.status, 'locked'), gte(payrollRuns.month, from), lte(payrollRuns.month, to)))
      .orderBy(asc(payrollRuns.month), asc(staffProfiles.employeeCode));
  }

  /** Annexure I (deductee details): one row per staff member per month of the quarter, with the challan the TDS went in. */
  async q24Annexure1(tx: Tx, fy: number, quarter: number): Promise<string> {
    const first = quarter === 4 ? `${fy + 1}-01` : `${fy}-${String(quarter * 3 + 1).padStart(2, '0')}`;
    const months = [0, 1, 2].map((k) => {
      const [y, m] = first.split('-').map(Number);
      const d = new Date(Date.UTC(y, m - 1 + k, 1));
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    });
    const rows = await this.taxRows(tx, months[0], months[2]);
    const challans = await tx.select().from(tdsChallans).where(inArray(tdsChallans.payMonth, months));
    const byUserMonth = new Map<string, { name: string; code: string; pan: string | null; month: string; gross: number; tds: number }>();
    for (const r of rows) {
      const key = `${r.userId}:${r.month}`;
      const d = r.data as StoredPayslip;
      const x = byUserMonth.get(key) ?? { name: d.user.fullName, code: r.code, pan: r.pan, month: r.month, gross: 0, tds: 0 };
      x.gross += r.gross;
      x.tds += r.tds;
      byUserMonth.set(key, x);
    }
    const out: (string | number)[][] = [['Sr No', 'Employee Code', 'PAN of the Employee', 'Name of the Employee', 'Section Code', 'Date of Payment / Credit', 'Amount Paid / Credited', 'TDS', 'Education Cess', 'Total Tax Deducted', 'Total Tax Deposited', 'Date of Deduction', 'BSR Code', 'Challan Serial No', 'Date of Deposit', 'Remarks']];
    let n = 0;
    for (const x of byUserMonth.values()) {
      const ch = challans.find((c) => c.payMonth === x.month);
      const last = monthEnd(x.month);
      const tax = Math.round(x.tds / 1.04);
      out.push([++n, x.code, x.pan ?? 'PANNOTAVBL', x.name, '192', last, (x.gross / 100).toFixed(2), (tax / 100).toFixed(2), ((x.tds - tax) / 100).toFixed(2), (x.tds / 100).toFixed(2), (x.tds / 100).toFixed(2), last, ch?.bsrCode ?? '', ch?.challanSerial ?? '', ch?.depositedOn ?? '', x.pan ? '' : 'C']);
    }
    return csvText(out);
  }

  /** Annexure II (salary details for the year), filed with the fourth quarter: one row per staff member. */
  async q24Annexure2(tx: Tx, fy: number): Promise<string> {
    const rows = await this.taxRows(tx, `${fy}-04`, `${fy + 1}-03`);
    const by = new Map<string, { name: string; code: string; pan: string | null; regime: string; from: string; to: string; gross: number; taxable: number; pt: number; pf: number; tds: number; c80: number; other: number }>();
    for (const r of rows) {
      const d = r.data as StoredPayslip;
      const x = by.get(r.userId) ?? { name: d.user.fullName, code: r.code, pan: r.pan, regime: r.regime, from: r.doj && r.doj > `${fy}-04-01` ? r.doj : `${fy}-04-01`, to: r.dol && r.dol < `${fy + 1}-03-31` ? r.dol : `${fy + 1}-03-31`, gross: 0, taxable: 0, pt: 0, pf: 0, tds: 0, c80: r.c80, other: r.other };
      x.gross += r.gross;
      x.taxable += r.taxable;
      x.pt += r.pt;
      x.pf += r.pf;
      x.tds += r.tds;
      by.set(r.userId, x);
    }
    const rupee = (p: number) => (p / 100).toFixed(2);
    const out: (string | number)[][] = [['Sr No', 'Employee Code', 'PAN of the Employee', 'Name of the Employee', 'Tax Regime (115BAC)', 'Employed From', 'Employed To', 'Gross Salary', 'Standard Deduction', 'Professional Tax', 'Income Chargeable under Salaries', 'Deductions under Chapter VI-A (80C incl. PF)', 'Other Deductions', 'Total Taxable Income', 'Tax on Total Income', 'TDS Deducted', 'Shortfall / Excess']];
    let n = 0;
    for (const x of by.values()) {
      const regime = x.regime === 'old' ? 'old' : 'new';
      const std = regime === 'new' ? 7_500_000 : 5_000_000;
      const pt = regime === 'old' ? x.pt : 0;
      const c80 = regime === 'old' ? Math.min(x.c80 + x.pf, 15_000_000) : 0;
      const other = regime === 'old' ? x.other : 0;
      const income = Math.max(0, x.taxable - std - pt);
      const total = Math.max(0, income - c80 - other);
      const tax = annualTax(regime, { grossPaise: x.taxable, professionalTaxPaise: x.pt, section80cPaise: x.c80 + x.pf, otherDeductionsPaise: x.other });
      out.push([++n, x.code, x.pan ?? 'PANNOTAVBL', x.name, regime === 'new' ? 'Yes' : 'No', x.from, x.to, rupee(x.gross), rupee(std), rupee(pt), rupee(income), rupee(c80), rupee(other), rupee(total), rupee(tax), rupee(x.tds), rupee(tax - x.tds)]);
    }
    return csvText(out);
  }

  async exportRows(tx: Tx, tenantId: string, id: string) {
    const run = await this.run(tx, id);
    if (run.status === 'draft' || run.status === 'verified') throw new ConflictException('Approve the run before exporting');
    if (run.status === 'reversed') throw new ConflictException('This run was reversed');
    const settings = await this.hr.settings(tx, tenantId);
    const rows = await tx.select().from(payslips).where(eq(payslips.runId, id));
    const profiles = new Map((await tx.select().from(staffProfiles)).map((r) => [r.userId, r]));
    return { run, settings, rows: rows.map((r) => ({ row: r, d: r.data as StoredPayslip, prof: profiles.get(r.userId) })) };
  }
}
