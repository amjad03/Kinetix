import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, Res, StreamableFile } from '@nestjs/common';
import type { PayrollSettings, PtSlab, SalaryComponent, SalaryStructure } from '@zynetix/shared';
import { eq } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { payrollRuns, payrollSettings, salaryComponents, tenants } from '../db/schema.js';
import { monthEnd } from './dates.js';
import { bankTransferCsv, ecrText, statutoryCsv, tallyXml, type StatRow } from './exports.js';
import { PAYROLL_APPROVERS, PAYROLL_ROLES, STAFF_ROLES, hasAnyRole } from './hr.access.js';
import { HrService } from './hr.service.js';
import { PayrollService } from './payroll.service.js';
import { monthLabel } from './payslip-pdf.js';
import { DocumentEngine } from '../documents/document-engine.service.js';
import { plainMoney, rupees, rupeeWords, staffBlock } from '../documents/doc-data.js';

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
  calc: z.enum(['fixed', 'percent']).default('fixed'),
  /** The starting rate of a percentage component; revisions go through components/:id/rates. */
  percent: z.number().min(0).max(1000).nullable().optional(),
  baseCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{1,12}$/).default('BASIC'),
});
const RateBody = z.object({
  effectiveMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month like 2026-07'),
  percent: z.number().min(0).max(1000),
  note: z.string().trim().max(300).default(''),
  /** The month the arrears for locked months are paid in (default: this month). */
  arrearsMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month like 2026-10').optional(),
});
const ReverseBody = z.object({ expectedVersion: z.number().int().min(1), reason: z.string().trim().min(5, 'Give the reason').max(500) });
const Q24Body = z.object({ fy: z.coerce.number().int().min(2000).max(2100), quarter: z.coerce.number().int().min(1).max(4), annexure: z.coerce.number().int().min(1).max(2).default(1) });
const StructureBody = z.object({ effectiveFrom: Day, lines: z.array(z.object({ componentId: z.uuid(), monthlyPaise: z.number().int().min(1).max(100_000_000_00) })).min(1).max(30) });
const Ledger = z.string().trim().min(1).max(100);
const SettingsBody = z.object({
  pfCapAtCeiling: z.boolean(),
  pfWageCeilingPaise: Paise.min(100_000),
  esiGrossLimitPaise: Paise.min(100_000),
  ptState: z.string().trim().min(1).max(40),
  ptSlabs: z.array(z.object({ minGrossPaise: Paise, amountPaise: Paise, februaryAmountPaise: Paise.optional() })).min(1).max(12),
  weeklyOffs: z.array(z.number().int().min(0).max(6)).max(3),
  ledgers: z.object({ salaryExpense: Ledger, employerPfExpense: Ledger, employerEsiExpense: Ledger, pfPayable: Ledger, esiPayable: Ledger, ptPayable: Ledger, tdsPayable: Ledger, salaryPayable: Ledger, otherDeductions: Ledger, lwfPayable: Ledger.optional(), employerLwfExpense: Ledger.optional() }),
  lwf: z.object({ enabled: z.boolean(), employeePaise: Paise.max(100_000), employerPaise: Paise.max(100_000), months: z.array(z.number().int().min(1).max(12)).max(12) }).optional(),
});
const RunBody = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month like 2026-10'),
  kind: z.enum(['regular', 'supplementary']).default('regular'),
  /** Supplementary: staff to pay in full (late joiners); everyone else gets only their unpaid adjustments. */
  staffIds: z.array(z.uuid()).max(500).default([]),
  note: z.string().trim().max(300).default(''),
});
const VersionBody = z.object({ expectedVersion: z.number().int().min(1) });
const RecomputeBody = z.object({ expectedVersion: z.number().int().min(1).optional() });

/** Salary structures, monthly payroll runs, payslips and the bank/statutory/Tally exports. */
@Controller('v1/payroll')
export class PayrollController {
  constructor(
    private readonly db: DbService,
    private readonly hr: HrService,
    private readonly payroll: PayrollService,
    private readonly engine: DocumentEngine,
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
      if (b.calc === 'percent' && (b.percent === null || b.percent === undefined)) throw new BadRequestException('Give the percentage');
      if (b.calc === 'percent' && b.baseCode === b.code) throw new BadRequestException('A component cannot be a percentage of itself');
      const [row] = await tx.insert(salaryComponents).values({ tenantId: p.tenantId, ...b, percent: b.calc === 'percent' ? b.percent : null }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'payroll.component_created', subjectType: 'salary_component', subjectId: row.id, data: b });
      return (await this.payroll.components(tx, p.tenantId)).find((c) => c.id === row.id);
    });
  }

  @Put('components/:id')
  @Auth('user', PAYROLL_ROLES)
  updateComponent(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ComponentBody)) b: z.infer<typeof ComponentBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (b.calc === 'percent' && b.baseCode === b.code) throw new BadRequestException('A component cannot be a percentage of itself');
      const [row] = await tx.update(salaryComponents).set({ ...b, percent: b.calc === 'percent' ? (b.percent ?? null) : null }).where(eq(salaryComponents.id, id)).returning({ id: salaryComponents.id });
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
    return this.db.withTenant(p.tenantId, (tx) => this.payroll.createRun(tx, p, b.month, { kind: b.kind, staffIds: b.staffIds, note: b.note }));
  }

  /** Reverses a locked run (principal or administrator), with the reason. */
  @Post('runs/:id/reverse')
  @HttpCode(200)
  @Auth('user', PAYROLL_APPROVERS)
  reverse(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ReverseBody)) b: z.infer<typeof ReverseBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.payroll.reverse(tx, p, id, b.expectedVersion, b.reason));
  }

  /** The rate history of a percentage component (DA). */
  @Get('components/:id/rates')
  @Auth('user', PAYROLL_ROLES)
  rates(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.payroll.rates(tx, id));
  }

  /**
   * Revises a percentage component (a DA revision) from a month. Months already locked are owed the difference:
   * one arrears adjustment per staff member, waiting for approval, paid in `arrearsMonth`.
   */
  @Post('components/:id/rates')
  @Auth('user', PAYROLL_ROLES)
  revise(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(RateBody)) b: z.infer<typeof RateBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.payroll.reviseRate(tx, p, id, b));
  }

  /** Form 24Q: annexure I (deductee details by month of the quarter) or, for the fourth quarter, annexure II (salary details for the year). */
  @Get('24q.csv')
  @Auth('user', PAYROLL_ROLES)
  q24(@CurrentPrincipal() p: UserPrincipal, @Query() q: Record<string, string>, @Res({ passthrough: true }) res: Response) {
    const parsed = Q24Body.safeParse(q);
    if (!parsed.success) throw new BadRequestException('Give fy (like 2026), quarter (1 to 4) and annexure (1 or 2)');
    const { fy, quarter, annexure } = parsed.data;
    if (annexure === 2 && quarter !== 4) throw new BadRequestException('Annexure II is filed with the fourth quarter');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const out = annexure === 1 ? await this.payroll.q24Annexure1(tx, fy, quarter) : await this.payroll.q24Annexure2(tx, fy);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'payroll.export_24q', subjectType: 'payroll_settings', data: { fy, quarter, annexure } });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="24Q-${fy}-${String(fy + 1).slice(2)}-Q${quarter}${annexure === 2 ? '-annexure-II' : ''}.csv"`);
      return out;
    });
  }

  /** The EPFO Electronic Challan cum Return text file (ECR 2.0, #~# separated) of an approved or locked run. */
  @Get('runs/:id/ecr.txt')
  @Auth('user', PAYROLL_ROLES)
  ecr(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { run, settings, rows } = await this.payroll.exportRows(tx, p.tenantId, id);
      const missing = rows.filter(({ d }) => d.employeePfPaise > 0 && !d.uan).map(({ d }) => d.user.fullName);
      const text = ecrText(
        rows.filter(({ d }) => d.employeePfPaise > 0 && d.uan).map(({ d }) => ({ uan: d.uan!, name: d.user.fullName, grossPaise: d.grossPaise, pfWagePaise: d.pfWagePaise, pfCeilingPaise: settings.pfWageCeilingPaise, pfCapAtCeiling: settings.pfCapAtCeiling, employeePfPaise: d.employeePfPaise, epsPaise: d.employer.epsPaise, epfPaise: d.employer.epfPaise, ncpDays: d.lopDays })),
      );
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'payroll.export_ecr', subjectType: 'payroll_run', subjectId: id, data: { month: run.month, version: run.version, missingUan: missing.length } });
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="ECR-${run.month}.txt"`);
      if (missing.length) res.setHeader('X-Missing-Uan', encodeURIComponent(missing.join(', ')));
      return text;
    });
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

  /** HR or accounts confirm the figures before the principal approves. */
  @Post('runs/:id/verify')
  @HttpCode(200)
  @Auth('user', PAYROLL_ROLES)
  verify(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(VersionBody)) b: z.infer<typeof VersionBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.payroll.transition(tx, p, id, 'verify', b.expectedVersion));
  }

  /** Numbers the payslips of a locked run and makes them visible to staff (with a notification each). */
  @Post('runs/:id/publish')
  @HttpCode(200)
  @Auth('user', PAYROLL_ROLES)
  publish(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(VersionBody)) b: z.infer<typeof VersionBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.payroll.transition(tx, p, id, 'publish', b.expectedVersion));
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
      await tx.update(payrollRuns).set({ bankFileAt: new Date() }).where(eq(payrollRuns.id, id));
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
    const k = z.enum(['pf', 'esi', 'pt', 'tds', 'lwf']).safeParse(kind);
    if (!k.success) throw new BadRequestException('kind must be pf, esi, pt, tds or lwf');
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
        lwfEmployeePaise: d.lwfPaise ?? 0,
        lwfEmployerPaise: d.employer.lwfPaise ?? 0,
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
      const { run, settings, totals } = await this.payroll.journalTotals(tx, p.tenantId, id);
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
      const { payslip: s } = await this.payroll.payslip(tx, id, { userId: p.userId, payroll: hasAnyRole(p, PAYROLL_ROLES) });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'payroll.payslip_downloaded', subjectType: 'payslip', subjectId: id });
      const block = await staffBlock(tx, s.user.id);
      const rows = Array.from({ length: Math.max(s.earnings.length, s.deductions.length) }, (_, i) => ({ earning: s.earnings[i]?.name ?? '', earningAmount: s.earnings[i] ? plainMoney(s.earnings[i].amountPaise) : '', deduction: s.deductions[i]?.name ?? '', deductionAmount: s.deductions[i] ? plainMoney(s.deductions[i].amountPaise) : '' }));
      const month = monthLabel(s.month);
      const out = await this.engine.produce(tx, p, {
        docType: 'salary_slip',
        title: 'Salary Slip',
        subject: { type: 'staff', id: s.user.id, name: s.user.fullName },
        source: { type: 'payslip', id },
        serial: s.payslipNo ?? undefined,
        data: {
          staff: { ...(block.staff as object), name: s.user.fullName, employeeCode: s.user.employeeCode ?? '', designation: s.user.designation ?? '', department: s.user.department ?? '' },
          pay: { month, payslipNo: s.payslipNo ?? '', daysInMonth: s.daysInMonth, paidDays: s.paidDays, lopDays: s.lopDays, taxRegime: s.taxRegime === 'new' ? 'New' : 'Old', gross: rupees(s.grossPaise), deductions: rupees(s.deductionsPaise), net: rupees(s.netPaise), netWords: rupeeWords(s.netPaise), employerPf: rupees(s.employer.epfPaise + s.employer.epsPaise), employerEsi: rupees(s.employer.esiPaise), annualTax: rupees(s.annualTaxPaise), rows },
        },
        keyFields: [{ label: 'Employee', value: `${s.user.fullName}${s.user.employeeCode ? ` (${s.user.employeeCode})` : ''}` }, { label: 'Pay period', value: month }, { label: 'Net pay', value: rupees(s.netPaise) }],
        photo: null,
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="payslip-${s.month}.pdf"`);
      return new StreamableFile(out.pdf);
    });
  }
}
