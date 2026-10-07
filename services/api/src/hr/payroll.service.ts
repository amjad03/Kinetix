import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Payslip, PayrollRunDetail, PayrollRunSummary, SalaryComponent, SalaryStructure } from '@kinetix/shared';
import { and, asc, desc, eq, gte, inArray, lt, lte, ne, sql } from 'drizzle-orm';
import { audit } from '../common/audit.js';
import type { UserPrincipal } from '../auth/principal.js';
import type { Tx } from '../db/db.service.js';
import { payrollRuns, payslips, salaryComponents, salaryStructureLines, salaryStructures, staffProfiles, tenants } from '../db/schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { texts } from '../notifications/texts.js';
import { monthEnd, monthStart } from './dates.js';
import { HrService } from './hr.service.js';
import { requireVersion } from './hr.access.js';
import { computePayslip, daysInMonth, fyStart, type StructureLine } from './payroll-math.js';
import { monthLabel } from './payslip-pdf.js';

export const DEFAULT_COMPONENTS = [
  { code: 'BASIC', name: 'Basic pay', kind: 'earning', pfWage: true, taxable: true, sortOrder: 1 },
  { code: 'HRA', name: 'House rent allowance', kind: 'earning', pfWage: false, taxable: true, sortOrder: 2 },
  { code: 'SPL', name: 'Special allowance', kind: 'earning', pfWage: false, taxable: true, sortOrder: 3 },
  { code: 'LOAN', name: 'Loan recovery', kind: 'deduction', pfWage: false, taxable: false, sortOrder: 10 },
] as const;

type Run = typeof payrollRuns.$inferSelect;
type StoredPayslip = Omit<Payslip, 'id' | 'runId' | 'month' | 'runStatus'> & { pfWagePaise: number; esiPaise: number; ptPaise: number; tdsPaise: number; employeePfPaise: number; pan: string | null; uan: string | null; esiNumber: string | null; employerCostPaise: number };

@Injectable()
export class PayrollService {
  constructor(
    private readonly hr: HrService,
    private readonly notifications: NotificationsService,
  ) {}

  // ----- components and structures ----------------------------------------------------------------

  async components(tx: Tx, tenantId: string): Promise<SalaryComponent[]> {
    const any = await tx.select({ id: salaryComponents.id }).from(salaryComponents).limit(1);
    if (!any.length) await tx.insert(salaryComponents).values(DEFAULT_COMPONENTS.map((c) => ({ ...c, tenantId }))).onConflictDoNothing();
    return (await tx.select().from(salaryComponents).orderBy(asc(salaryComponents.sortOrder), asc(salaryComponents.code))).map((c) => ({ id: c.id, code: c.code, name: c.name, kind: c.kind as SalaryComponent['kind'], pfWage: c.pfWage, taxable: c.taxable, active: c.active, sortOrder: c.sortOrder }));
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
    await tx.insert(salaryStructureLines).values(lines.map((l) => ({ tenantId: p.tenantId, structureId: structure.id, componentId: l.componentId, monthlyPaise: l.monthlyPaise })));
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'payroll.structure_saved', subjectType: 'user', subjectId: userId, data: { effectiveFrom, lines: lines.length } });
    return this.structureView(tx, userId, structure);
  }

  // ----- runs -----------------------------------------------------------------------------------

  async createRun(tx: Tx, p: UserPrincipal, month: string): Promise<PayrollRunDetail> {
    const today = await this.hr.today(tx);
    if (month > today.slice(0, 7)) throw new ConflictException('Payroll cannot be run for a future month');
    const [dup] = await tx.select({ id: payrollRuns.id }).from(payrollRuns).where(eq(payrollRuns.month, month));
    if (dup) throw new ConflictException('There is already a payroll run for that month');
    const [run] = await tx.insert(payrollRuns).values({ tenantId: p.tenantId, month, createdBy: p.userId }).returning();
    await this.compute(tx, p.tenantId, run);
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'payroll.run_created', subjectType: 'payroll_run', subjectId: run.id, data: { month } });
    return this.detail(tx, run.id);
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
          .select({ structureId: salaryStructureLines.structureId, code: salaryComponents.code, name: salaryComponents.name, kind: salaryComponents.kind, pfWage: salaryComponents.pfWage, taxable: salaryComponents.taxable, monthlyPaise: salaryStructureLines.monthlyPaise, sort: salaryComponents.sortOrder })
          .from(salaryStructureLines)
          .innerJoin(salaryComponents, eq(salaryComponents.id, salaryStructureLines.componentId))
          .where(inArray(salaryStructureLines.structureId, structures.map((s) => s.id)))
          .orderBy(asc(salaryComponents.sortOrder))
      : [];
    // Year to date from locked runs of this financial year (TDS is a running figure).
    const fy = fyStart(month);
    const ytdRows = await tx
      .select({ userId: payslips.userId, taxable: sql<number>`sum(${payslips.taxableGrossPaise})::bigint`.mapWith(Number), pt: sql<number>`sum(${payslips.ptPaise})::bigint`.mapWith(Number), pf: sql<number>`sum(${payslips.employeePfPaise})::bigint`.mapWith(Number), tds: sql<number>`sum(${payslips.tdsPaise})::bigint`.mapWith(Number) })
      .from(payslips)
      .innerJoin(payrollRuns, eq(payrollRuns.id, payslips.runId))
      .where(and(eq(payrollRuns.status, 'locked'), gte(payrollRuns.month, `${fy}-04`), lt(payrollRuns.month, month)))
      .groupBy(payslips.userId);
    const ytd = new Map(ytdRows.map((r) => [r.userId, r]));

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
      if (!structure) {
        skipped.push({ userId: s.userId, fullName: s.fullName, reason: 'No salary structure' });
        continue;
      }
      const lines: StructureLine[] = lineRows.filter((l) => l.structureId === structure.id).map((l) => ({ code: l.code, name: l.name, kind: l.kind as 'earning', monthlyPaise: l.monthlyPaise, pfWage: l.pfWage, taxable: l.taxable }));
      const y = ytd.get(s.userId);
      const c = computePayslip({
        month,
        daysInMonth: days,
        lopDays: lop.get(s.userId) ?? 0,
        lines,
        pf: { capAtCeiling: settings.pfCapAtCeiling, wageCeilingPaise: settings.pfWageCeilingPaise },
        esiLimitPaise: settings.esiGrossLimitPaise,
        ptSlabs: settings.ptSlabs,
        staff: { regime: prof.taxRegime as 'new', pfEnabled: prof.pfEnabled, esiEnabled: prof.esiEnabled, ptEnabled: prof.ptEnabled, tax80cPaise: prof.tax80cPaise, taxOtherDeductionsPaise: prof.taxOtherDeductionsPaise },
        ytd: { grossTaxablePaise: y?.taxable ?? 0, ptPaise: y?.pt ?? 0, employeePfPaise: y?.pf ?? 0, tdsPaise: y?.tds ?? 0 },
      });
      const employerCost = c.grossPaise + c.employer.epfPaise + c.employer.epsPaise + c.employer.esiPaise;
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
        tdsPaise: c.tdsPaise,
        employeePfPaise: c.employeePfPaise,
        pan: prof.pan,
        uan: prof.uan,
        esiNumber: prof.esiNumber,
        employerCostPaise: employerCost,
      };
      await tx.insert(payslips).values({ tenantId, runId: run.id, userId: s.userId, grossPaise: c.grossPaise, deductionsPaise: c.deductionsPaise, netPaise: c.netPaise, employerCostPaise: employerCost, taxableGrossPaise: c.taxableGrossPaise, ptPaise: c.ptPaise, employeePfPaise: c.employeePfPaise, tdsPaise: c.tdsPaise, data });
    }
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
      .orderBy(desc(payrollRuns.month));
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
    if (run.status !== 'draft') throw new ConflictException('Only a draft run can be recomputed');
    requireVersion(run.version, expected);
    await this.compute(tx, p.tenantId, run);
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'payroll.run_recomputed', subjectType: 'payroll_run', subjectId: id, data: { month: run.month } });
    return this.detail(tx, id);
  }

  /** draft → approved (approve), approved → locked (lock), approved → draft (reopen). */
  async transition(tx: Tx, p: UserPrincipal, id: string, action: 'approve' | 'lock' | 'reopen', expected: number): Promise<PayrollRunDetail> {
    const [run] = await tx.select().from(payrollRuns).where(eq(payrollRuns.id, id)).for('update');
    if (!run) throw new NotFoundException('Payroll run not found');
    const from = action === 'approve' ? 'draft' : 'approved';
    if (run.status !== from) throw new ConflictException(`A ${run.status} run cannot be ${{ approve: 'approved', lock: 'locked', reopen: 'reopened' }[action]}`);
    requireVersion(run.version, expected);
    const now = new Date();
    if (action === 'approve') {
      const [n] = await tx.select({ n: sql<number>`count(*)::int` }).from(payslips).where(eq(payslips.runId, id));
      if (n.n === 0) throw new ConflictException('This run has no payslips');
      await tx.update(payrollRuns).set({ status: 'approved', approvedBy: p.userId, approvedAt: now, version: run.version + 1 }).where(eq(payrollRuns.id, id));
    } else if (action === 'lock') {
      // TDS projections build on the year to date, which only counts locked runs: lock in order.
      const [earlier] = await tx.select({ month: payrollRuns.month }).from(payrollRuns).where(and(ne(payrollRuns.status, 'locked'), lt(payrollRuns.month, run.month), gte(payrollRuns.month, `${fyStart(run.month)}-04`)));
      if (earlier) throw new ConflictException(`Lock ${earlier.month} first`);
      await tx.update(payrollRuns).set({ status: 'locked', lockedBy: p.userId, lockedAt: now, version: run.version + 1 }).where(eq(payrollRuns.id, id));
      const rows = await tx.select({ userId: payslips.userId, id: payslips.id }).from(payslips).where(eq(payslips.runId, id));
      for (const r of rows) await this.notifications.notifyUsers(tx, [r.userId], { kind: 'payslip', text: texts.payslipReady({ month: monthLabel(run.month) }), data: { payslipId: r.id, month: run.month }, dedupeKey: `payslip:${r.id}` });
    } else {
      await tx.update(payrollRuns).set({ status: 'draft', approvedBy: null, approvedAt: null, version: run.version + 1 }).where(eq(payrollRuns.id, id));
    }
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: { approve: 'payroll.run_approved', lock: 'payroll.run_locked', reopen: 'payroll.run_reopened' }[action], subjectType: 'payroll_run', subjectId: id, data: { month: run.month, version: run.version } });
    return this.detail(tx, id);
  }

  // ----- payslips and exports -----------------------------------------------------------------------

  async myPayslips(tx: Tx, userId: string): Promise<Payslip[]> {
    const rows = await tx.select({ s: payslips, r: payrollRuns }).from(payslips).innerJoin(payrollRuns, eq(payrollRuns.id, payslips.runId)).where(and(eq(payslips.userId, userId), eq(payrollRuns.status, 'locked'))).orderBy(desc(payrollRuns.month));
    return rows.map((x) => this.payslipView(x.s, x.r));
  }

  /** A payslip for its owner (locked runs only) or payroll staff (any run). */
  async payslip(tx: Tx, id: string, viewer: { userId: string; payroll: boolean }): Promise<{ payslip: Payslip; institution: string }> {
    const [x] = await tx.select({ s: payslips, r: payrollRuns, institution: tenants.name }).from(payslips).innerJoin(payrollRuns, eq(payrollRuns.id, payslips.runId)).innerJoin(tenants, eq(tenants.id, payslips.tenantId)).where(eq(payslips.id, id));
    if (!x || (!viewer.payroll && (x.s.userId !== viewer.userId || x.r.status !== 'locked'))) throw new NotFoundException('Payslip not found');
    return { payslip: this.payslipView(x.s, x.r), institution: x.institution };
  }

  /** All the figures an export needs, with identity details from the stored payslips. */
  async exportRows(tx: Tx, tenantId: string, id: string) {
    const run = await this.run(tx, id);
    if (run.status === 'draft') throw new ConflictException('Approve the run before exporting');
    const settings = await this.hr.settings(tx, tenantId);
    const rows = await tx.select().from(payslips).where(eq(payslips.runId, id));
    const profiles = new Map((await tx.select().from(staffProfiles)).map((r) => [r.userId, r]));
    return { run, settings, rows: rows.map((r) => ({ row: r, d: r.data as StoredPayslip, prof: profiles.get(r.userId) })) };
  }
}
