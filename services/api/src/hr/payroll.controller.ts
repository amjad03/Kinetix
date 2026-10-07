import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, Res, StreamableFile } from '@nestjs/common';
import type { PayrollSettings, PtSlab, SalaryComponent, SalaryStructure } from '@kinetix/shared';
import { eq } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { payrollSettings, salaryComponents, tenants } from '../db/schema.js';
import { monthEnd } from './dates.js';
import { bankTransferCsv, statutoryCsv, tallyXml, type StatRow, type TallyTotals } from './exports.js';
import { PAYROLL_APPROVERS, PAYROLL_ROLES, STAFF_ROLES, hasAnyRole } from './hr.access.js';
import { HrService } from './hr.service.js';
import { PayrollService } from './payroll.service.js';
import { monthLabel, payslipPdf } from './payslip-pdf.js';

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15');
const Paise = z.number().int().min(0).max(100_000_000_00);
const ComponentBody = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{1,12}$/, 'Use up to 12 letters or digits'),
  name: z.string().trim().min(1).max(60),
  kind: z.enum(['earning', 'deduction']),
  pfWage: z.boolean().default(false),
  taxable: z.boolean().default(true),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(100).default(0),
});
const StructureBody = z.object({ effectiveFrom: Day, lines: z.array(z.object({ componentId: z.uuid(), monthlyPaise: z.number().int().min(1).max(100_000_000_00) })).min(1).max(30) });
const Ledger = z.string().trim().min(1).max(100);
const SettingsBody = z.object({
  pfCapAtCeiling: z.boolean(),
  pfWageCeilingPaise: Paise.min(100_000),
  esiGrossLimitPaise: Paise.min(100_000),
  ptState: z.string().trim().min(1).max(40),
  ptSlabs: z.array(z.object({ minGrossPaise: Paise, amountPaise: Paise, februaryAmountPaise: Paise.optional() })).min(1).max(12),
  weeklyOffs: z.array(z.number().int().min(0).max(6)).max(3),
  ledgers: z.object({ salaryExpense: Ledger, employerPfExpense: Ledger, employerEsiExpense: Ledger, pfPayable: Ledger, esiPayable: Ledger, ptPayable: Ledger, tdsPayable: Ledger, salaryPayable: Ledger, otherDeductions: Ledger }),
});
const RunBody = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month like 2026-10') });
const VersionBody = z.object({ expectedVersion: z.number().int().min(1) });
const RecomputeBody = z.object({ expectedVersion: z.number().int().min(1).optional() });

/** Salary structures, monthly payroll runs, payslips and the bank/statutory/Tally exports. */
@Controller('v1/payroll')
export class PayrollController {
  constructor(
    private readonly db: DbService,
    private readonly hr: HrService,
    private readonly payroll: PayrollService,
  ) {}

  // ----- settings ----------------------------------------------------------------------------------

  @Get('settings')
  @Auth('user', PAYROLL_ROLES)
  settings(@CurrentPrincipal() p: UserPrincipal): Promise<PayrollSettings> {
    return this.db.withTenant(p.tenantId, (tx) => this.hr.settings(tx, p.tenantId));
  }

  /** Statutory rates and ledger names: the principal or administrator only. */
  @Put('settings')
  @Auth('user', PAYROLL_APPROVERS)
  saveSettings(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(SettingsBody)) b: z.infer<typeof SettingsBody>): Promise<PayrollSettings> {
    const slabs = [...b.ptSlabs].sort((x, y) => x.minGrossPaise - y.minGrossPaise);
    if (slabs[0].minGrossPaise !== 0) throw new BadRequestException('The first Professional Tax slab must start at 0');
    if (new Set(slabs.map((s) => s.minGrossPaise)).size !== slabs.length) throw new BadRequestException('Two Professional Tax slabs start at the same salary');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const before = await this.hr.settings(tx, p.tenantId);
      await tx.update(payrollSettings).set({ ...b, ptSlabs: slabs as PtSlab[], updatedAt: new Date() }).where(eq(payrollSettings.tenantId, p.tenantId));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'payroll.settings_updated', subjectType: 'payroll_settings', data: { before: { pfCap: before.pfCapAtCeiling, pt: before.ptSlabs }, after: { pfCap: b.pfCapAtCeiling, pt: slabs } } });
      return this.hr.settings(tx, p.tenantId);
    });
  }

  // ----- components and structures -------------------------------------------------------------------

  @Get('components')
  @Auth('user', PAYROLL_ROLES)
  components(@CurrentPrincipal() p: UserPrincipal): Promise<SalaryComponent[]> {
    return this.db.withTenant(p.tenantId, (tx) => this.payroll.components(tx, p.tenantId));
  }

  @Post('components')
  @Auth('user', PAYROLL_ROLES)
  createComponent(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ComponentBody)) b: z.infer<typeof ComponentBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if ((await this.payroll.components(tx, p.tenantId)).some((c) => c.code === b.code)) throw new ConflictException('That component code is already in use');
      const [row] = await tx.insert(salaryComponents).values({ tenantId: p.tenantId, ...b }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'payroll.component_created', subjectType: 'salary_component', subjectId: row.id, data: b });
      return (await this.payroll.components(tx, p.tenantId)).find((c) => c.id === row.id);
    });
  }

  @Put('components/:id')
  @Auth('user', PAYROLL_ROLES)
  updateComponent(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ComponentBody)) b: z.infer<typeof ComponentBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(salaryComponents).set(b).where(eq(salaryComponents.id, id)).returning({ id: salaryComponents.id });
      if (!row) throw new NotFoundException('Salary component not found');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'payroll.component_updated', subjectType: 'salary_component', subjectId: id, data: b });
      return (await this.payroll.components(tx, p.tenantId)).find((c) => c.id === id);
    });
  }

  /** The structure in force today and every revision. */
  @Get('structures/:userId')
  @Auth('user', PAYROLL_ROLES)
  structures(@CurrentPrincipal() p: UserPrincipal, @Param('userId', ParseUUIDPipe) userId: string): Promise<{ current: SalaryStructure | null; history: SalaryStructure[] }> {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const history = await this.payroll.structures(tx, userId);
      const today = await this.hr.today(tx);
      return { current: history.find((s) => s.effectiveFrom <= today) ?? null, history };
    });
  }

  @Put('structures/:userId')
  @Auth('user', PAYROLL_ROLES)
  saveStructure(@CurrentPrincipal() p: UserPrincipal, @Param('userId', ParseUUIDPipe) userId: string, @Body(new ZodBody(StructureBody)) b: z.infer<typeof StructureBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.payroll.saveStructure(tx, p, userId, b.effectiveFrom, b.lines));
  }

  // ----- runs ----------------------------------------------------------------------------------------

  @Get('runs')
  @Auth('user', PAYROLL_ROLES)
  runs(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.payroll.list(tx));
  }

  @Post('runs')
  @Auth('user', PAYROLL_ROLES)
  createRun(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(RunBody)) b: z.infer<typeof RunBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.payroll.createRun(tx, p, b.month));
  }

  @Get('runs/:id')
  @Auth('user', PAYROLL_ROLES)
  run(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.payroll.detail(tx, id));
  }

  @Post('runs/:id/recompute')
  @HttpCode(200)
  @Auth('user', PAYROLL_ROLES)
  recompute(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(RecomputeBody)) b: z.infer<typeof RecomputeBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.payroll.recompute(tx, p, id, b.expectedVersion));
  }

  @Post('runs/:id/approve')
  @HttpCode(200)
  @Auth('user', PAYROLL_APPROVERS)
  approve(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(VersionBody)) b: z.infer<typeof VersionBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.payroll.transition(tx, p, id, 'approve', b.expectedVersion));
  }

  @Post('runs/:id/lock')
  @HttpCode(200)
  @Auth('user', PAYROLL_APPROVERS)
  lock(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(VersionBody)) b: z.infer<typeof VersionBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.payroll.transition(tx, p, id, 'lock', b.expectedVersion));
  }

  @Post('runs/:id/reopen')
  @HttpCode(200)
  @Auth('user', PAYROLL_APPROVERS)
  reopen(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(VersionBody)) b: z.infer<typeof VersionBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.payroll.transition(tx, p, id, 'reopen', b.expectedVersion));
  }

  // ----- exports (approved or locked runs; every download is audited) ---------------------------------

  /** Account numbers are decrypted here and nowhere else; staff without bank details are listed in X-Missing-Bank. */
  @Get('runs/:id/bank-transfer.csv')
  @Auth('user', PAYROLL_ROLES)
  bank(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { run, rows } = await this.payroll.exportRows(tx, p.tenantId, id);
      const ok: Parameters<typeof bankTransferCsv>[0] = [];
      const missing: string[] = [];
      for (const { d, prof } of rows) {
        if (d.netPaise <= 0) continue;
        if (!prof?.bankAccountEnc || !prof.bankIfsc) missing.push(d.user.fullName);
        else ok.push({ name: prof.bankAccountHolder ?? d.user.fullName, account: this.hr.accountNumber(p.tenantId, d.user.id, prof.bankAccountEnc), ifsc: prof.bankIfsc, netPaise: d.netPaise, narration: `Salary ${monthLabel(run.month)}` });
      }
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'payroll.export_bank', subjectType: 'payroll_run', subjectId: id, data: { month: run.month, version: run.version, rows: ok.length, missing: missing.length } });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="bank-transfer-${run.month}.csv"`);
      if (missing.length) res.setHeader('X-Missing-Bank', encodeURIComponent(missing.join(', ')));
      return bankTransferCsv(ok);
    });
  }

  @Get('runs/:id/statutory.csv')
  @Auth('user', PAYROLL_ROLES)
  statutory(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Query('kind') kind: string, @Res({ passthrough: true }) res: Response) {
    const k = z.enum(['pf', 'esi', 'pt', 'tds']).safeParse(kind);
    if (!k.success) throw new BadRequestException('kind must be pf, esi, pt or tds');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { run, settings, rows } = await this.payroll.exportRows(tx, p.tenantId, id);
      const stat: StatRow[] = rows.map(({ d }) => ({
        name: d.user.fullName,
        employeeCode: d.user.employeeCode,
        uan: d.uan,
        esiNumber: d.esiNumber,
        pan: d.pan,
        regime: d.taxRegime,
        grossPaise: d.grossPaise,
        lopDays: d.lopDays,
        daysInMonth: d.daysInMonth,
        pfWagePaise: d.pfWagePaise,
        pfCeilingPaise: settings.pfWageCeilingPaise,
        pfCapAtCeiling: settings.pfCapAtCeiling,
        employeePfPaise: d.employeePfPaise,
        epsPaise: d.employer.epsPaise,
        epfPaise: d.employer.epfPaise,
        esiEmployeePaise: d.esiPaise,
        esiEmployerPaise: d.employer.esiPaise,
        ptPaise: d.ptPaise,
        tdsPaise: d.tdsPaise,
      }));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: `payroll.export_${k.data}`, subjectType: 'payroll_run', subjectId: id, data: { month: run.month, version: run.version } });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${k.data}-${run.month}.csv"`);
      return statutoryCsv(k.data, stat);
    });
  }

  @Get('runs/:id/tally.xml')
  @Auth('user', PAYROLL_ROLES)
  tally(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { run, settings, rows } = await this.payroll.exportRows(tx, p.tenantId, id);
      const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + f(r), 0);
      const totals: TallyTotals = {
        grossPaise: sum((r) => r.d.grossPaise),
        employeePfPaise: sum((r) => r.d.employeePfPaise),
        employerPfPaise: sum((r) => r.d.employer.epfPaise + r.d.employer.epsPaise),
        employeeEsiPaise: sum((r) => r.d.esiPaise),
        employerEsiPaise: sum((r) => r.d.employer.esiPaise),
        ptPaise: sum((r) => r.d.ptPaise),
        tdsPaise: sum((r) => r.d.tdsPaise),
        otherDeductionsPaise: 0,
        netPaise: sum((r) => r.d.netPaise),
      };
      totals.otherDeductionsPaise = sum((r) => r.d.deductionsPaise) - totals.employeePfPaise - totals.employeeEsiPaise - totals.ptPaise - totals.tdsPaise;
      const [t] = await tx.select({ name: tenants.name }).from(tenants);
      const xml = tallyXml({ company: t?.name ?? '', month: run.month, lastDay: monthEnd(run.month), narration: `Salary for ${monthLabel(run.month)}`, totals, ledgers: settings.ledgers });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'payroll.export_tally', subjectType: 'payroll_run', subjectId: id, data: { month: run.month, version: run.version } });
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="tally-${run.month}.xml"`);
      return xml;
    });
  }

  // ----- payslips ------------------------------------------------------------------------------------

  /** The caller's own payslips from locked runs. */
  @Get('payslips/me')
  @Auth('user', STAFF_ROLES)
  mine(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.payroll.myPayslips(tx, p.userId));
  }

  @Get('payslips/:id')
  @Auth('user', STAFF_ROLES)
  payslip(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => (await this.payroll.payslip(tx, id, { userId: p.userId, payroll: hasAnyRole(p, PAYROLL_ROLES) })).payslip);
  }

  @Get('payslips/:id/pdf')
  @Auth('user', STAFF_ROLES)
  pdf(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { payslip, institution } = await this.payroll.payslip(tx, id, { userId: p.userId, payroll: hasAnyRole(p, PAYROLL_ROLES) });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'payroll.payslip_downloaded', subjectType: 'payslip', subjectId: id });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="payslip-${payslip.month}.pdf"`);
      return new StreamableFile(payslipPdf(institution, payslip));
    });
  }
}
