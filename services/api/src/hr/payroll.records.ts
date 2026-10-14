import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { and, desc, eq, lte, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { audit } from '../common/audit.js';
import { staffTransfers } from '../db/schema-assist.js';
import { payrollAdjustments, tdsChallans } from '../db/schema-depth.js';
import { serviceBookEntries, staffLoans } from '../db/schema-hrpay.js';
import { departments, designations, salaryComponents, salaryStructureLines, salaryStructures, staffProfiles, users } from '../db/schema.js';
import { fail, outcome } from '../import/row-helpers.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RecordRegistry, type CustomAction, type FieldOption, type KitCtx, type RecordEntity } from '../records/entity.js';
import { Text } from '../records/helpers.js';
import { eachRow } from '../records/import.js';
import { monthTakesAdjustments } from './hr-depth.controller.js';
import { HR_ROLES, isPayrollStaff, PAYROLL_APPROVERS, PAYROLL_ROLES, STAFF_ROLES } from './hr.access.js';
import { HrService } from './hr.service.js';
import { closeLoanEarly, createLoan, decideLoan } from './hr-workflows.controller.js';
import { choiceFilter, labelOf, opts, ownRows, Rupees, rupeesOf, staffDepartmentFilter, staffFilter, staffOptions } from './kit-shared.js';
import { PayrollService } from './payroll.service.js';

const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month like 2026-10');
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15');
const sel = (o: FieldOption[]) => z.enum(o.map((x) => x.value) as [string, ...string[]]);
const Bool = z.coerce.boolean();
const COMPONENT_KINDS = opts([
  ['earning', 'Earning'],
  ['deduction', 'Deduction'],
]);
const CALCS = opts([
  ['fixed', 'Fixed amount'],
  ['percent', 'Percentage of another component'],
]);
export const ADJ_KINDS = opts([
  ['overtime', 'Overtime'],
  ['arrear', 'Arrears'],
  ['bonus', 'Bonus'],
  ['encashment', 'Leave encashment'],
  ['recovery', 'Recovery'],
]);
const DECISION = opts([
  ['pending', 'Waiting'],
  ['approved', 'Approved'],
  ['rejected', 'Rejected'],
]);
export const LOAN_KINDS = opts([
  ['advance', 'Salary advance'],
  ['loan', 'Loan'],
]);
const LOAN_STATUS = opts([
  ['pending', 'Waiting'],
  ['approved', 'Being repaid'],
  ['rejected', 'Rejected'],
  ['cancelled', 'Withdrawn'],
  ['closed', 'Closed'],
]);

const decider = alias(users, 'decider');
const roundUp = (paise: number, to: number) => Math.ceil(paise / to) * to;

/** Raises basic pay from a date with a new salary structure, and notes it in the service book. */
export async function grantIncrement(ctx: KitCtx, payroll: PayrollService, userId: string, p: { effectiveFrom: string; percent?: number | null; amountPaise?: number | null; roundToPaise: number; note: string }) {
  const [s] = await ctx.tx.select().from(salaryStructures).where(and(eq(salaryStructures.userId, userId), lte(salaryStructures.effectiveFrom, p.effectiveFrom))).orderBy(desc(salaryStructures.effectiveFrom)).limit(1);
  if (!s) throw new ConflictException('No salary structure to raise');
  if (s.effectiveFrom === p.effectiveFrom) throw new ConflictException('There is already a revision on that date');
  const lines = await ctx.tx.select({ componentId: salaryStructureLines.componentId, code: salaryComponents.code, monthlyPaise: salaryStructureLines.monthlyPaise }).from(salaryStructureLines).innerJoin(salaryComponents, eq(salaryComponents.id, salaryStructureLines.componentId)).where(eq(salaryStructureLines.structureId, s.id));
  const basic = lines.find((l) => l.code === 'BASIC');
  if (!basic) throw new ConflictException('The salary structure has no basic pay');
  const raised = p.percent ? roundUp(basic.monthlyPaise * (1 + p.percent / 100), p.roundToPaise) : basic.monthlyPaise + (p.amountPaise ?? 0);
  if (raised <= basic.monthlyPaise) throw new BadRequestException('Give a percentage or an amount to add');
  await payroll.saveStructure(ctx.tx, ctx.p, userId, p.effectiveFrom, lines.map((l) => ({ componentId: l.componentId, monthlyPaise: l.code === 'BASIC' ? raised : l.monthlyPaise })));
  await ctx.tx.insert(serviceBookEntries).values({ tenantId: ctx.p.tenantId, userId, kind: 'increment', onDate: p.effectiveFrom, title: `Increment: basic pay Rs. ${(basic.monthlyPaise / 100).toLocaleString('en-IN')} to Rs. ${(raised / 100).toLocaleString('en-IN')}`, details: p.note, createdBy: ctx.p.userId });
  await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: 'hr.increment_granted', subjectType: 'user', subjectId: userId, changes: { basicPaise: { before: basic.monthlyPaise, after: raised } }, data: { effectiveFrom: p.effectiveFrom, note: p.note } });
  return `Basic pay ${(basic.monthlyPaise / 100).toFixed(0)} → ${(raised / 100).toFixed(0)} from ${p.effectiveFrom}`;
}

/** Promotes to a designation from a date (now, or on the date through a scheduled redesignation), optionally with new basic pay. */
export async function promote(ctx: KitCtx, hr: HrService, payroll: PayrollService, userId: string, p: { designationId: string; effectiveOn: string; basicPaise?: number | null; orderNo?: string | null; note: string }) {
  const [prof] = await ctx.tx.select().from(staffProfiles).where(eq(staffProfiles.userId, userId));
  if (!prof) throw new ConflictException('Create the staff record first');
  if (prof.designationId === p.designationId) throw new ConflictException('Already holds that designation');
  const [d] = await ctx.tx.select({ name: designations.name }).from(designations).where(eq(designations.id, p.designationId));
  if (!d) throw new NotFoundException('Designation not found');
  const today = await hr.today(ctx.tx);
  const now = p.effectiveOn <= today;
  await ctx.tx.insert(staffTransfers).values({ tenantId: ctx.p.tenantId, userId, fromDepartmentId: prof.departmentId, toDepartmentId: null, fromDesignationId: prof.designationId, toDesignationId: p.designationId, effectiveOn: p.effectiveOn, reason: `Promotion${p.note ? `: ${p.note}` : ''}`, status: now ? 'applied' : 'scheduled', appliedAt: now ? new Date() : null, createdBy: ctx.p.userId });
  if (now) await ctx.tx.update(staffProfiles).set({ designationId: p.designationId, updatedAt: new Date() }).where(eq(staffProfiles.userId, userId));
  await ctx.tx.insert(serviceBookEntries).values({ tenantId: ctx.p.tenantId, userId, kind: 'promotion', onDate: p.effectiveOn, title: `Promoted as ${d.name}`, details: p.note, orderNo: p.orderNo ?? null, createdBy: ctx.p.userId });
  if (p.basicPaise) {
    const [s] = await ctx.tx.select().from(salaryStructures).where(and(eq(salaryStructures.userId, userId), lte(salaryStructures.effectiveFrom, p.effectiveOn))).orderBy(desc(salaryStructures.effectiveFrom)).limit(1);
    if (!s) throw new ConflictException('No salary structure to revise');
    const lines = await ctx.tx.select({ componentId: salaryStructureLines.componentId, code: salaryComponents.code, monthlyPaise: salaryStructureLines.monthlyPaise }).from(salaryStructureLines).innerJoin(salaryComponents, eq(salaryComponents.id, salaryStructureLines.componentId)).where(eq(salaryStructureLines.structureId, s.id));
    if (!lines.some((l) => l.code === 'BASIC')) throw new ConflictException('The salary structure has no basic pay');
    await payroll.saveStructure(ctx.tx, ctx.p, userId, p.effectiveOn, lines.map((l) => ({ componentId: l.componentId, monthlyPaise: l.code === 'BASIC' ? p.basicPaise! : l.monthlyPaise })));
  }
  await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: 'hr.promoted', subjectType: 'user', subjectId: userId, changes: { designation_id: { before: prof.designationId, after: p.designationId } }, data: { effectiveOn: p.effectiveOn, orderNo: p.orderNo, basicPaise: p.basicPaise ?? null } });
  return `${d.name} from ${p.effectiveOn}${now ? '' : ' (scheduled)'}`;
}

/** The staff list's own actions: an increment and a promotion, for one person or many. */
export function staffPayActions(hr: HrService, payroll: PayrollService): Record<string, CustomAction> {
  return {
    increment: {
      label: 'Grant increment',
      roles: PAYROLL_APPROVERS,
      params: z.object({ effectiveFrom: Day, percent: z.number().min(0.1).max(100).nullish(), amountRupees: z.number().min(1).max(1_000_000).nullish(), roundTo: z.number().int().min(1).max(1000).default(100), note: z.string().trim().max(300).default('') }).refine((x) => !!x.percent !== !!x.amountRupees, 'Give either a percentage or an amount'),
      apply: (ctx, id, raw) => {
        const p = raw as { effectiveFrom: string; percent?: number | null; amountRupees?: number | null; roundTo: number; note: string };
        return grantIncrement(ctx, payroll, id, { effectiveFrom: p.effectiveFrom, percent: p.percent, amountPaise: p.amountRupees ? Math.round(p.amountRupees * 100) : null, roundToPaise: p.roundTo * 100, note: p.note });
      },
    },
    promote: {
      label: 'Promote',
      roles: HR_ROLES,
      params: z.object({ designationId: z.uuid(), effectiveOn: Day, basicRupees: z.number().min(1).max(10_000_000).nullish(), orderNo: z.string().trim().max(60).nullish(), note: z.string().trim().max(300).default('') }),
      apply: (ctx, id, raw) => {
        const p = raw as { designationId: string; effectiveOn: string; basicRupees?: number | null; orderNo?: string | null; note: string };
        return promote(ctx, hr, payroll, id, { designationId: p.designationId, effectiveOn: p.effectiveOn, basicPaise: p.basicRupees ? Math.round(p.basicRupees * 100) : null, orderNo: p.orderNo, note: p.note });
      },
    },
  };
}

@Injectable()
export class PayrollRecords implements OnModuleInit {
  constructor(
    private readonly registry: RecordRegistry,
    private readonly payroll: PayrollService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    for (const e of [this.components(), this.adjustments(), this.loans(), this.challans()]) this.registry.register(e);
  }

  private components(): RecordEntity {
    const c = salaryComponents;
    const current = sql<number | null>`(case when ${c.calc} = 'percent' then coalesce((select r.percent from salary_component_rates r where r.component_id = salary_components.id and r.effective_month <= to_char(current_date, 'YYYY-MM') order by r.effective_month desc limit 1), ${c.percent}) end)::float8`;
    const used = sql<number>`(select count(distinct s.user_id)::int from salary_structure_lines l join salary_structures s on s.id = l.structure_id where l.component_id = salary_components.id)`;
    return {
      key: 'salary-components',
      module: 'payroll',
      table: c,
      subjectType: 'salary_component',
      roles: { read: PAYROLL_ROLES, write: PAYROLL_ROLES },
      label: (r) => `${r.name} (${r.code})`,
      list: {
        select: { id: c.id, code: c.code, name: c.name, kind: c.kind, pfWage: c.pfWage, taxable: c.taxable, active: c.active, calc: c.calc, percent: current, startPercent: c.percent, baseCode: c.baseCode, sortOrder: c.sortOrder, used },
        search: [c.code, c.name],
        filters: { kind: choiceFilter('Kind', COMPONENT_KINDS, c.kind), calc: choiceFilter('Worked out as', CALCS, c.calc), active: { label: 'In use', options: opts([['yes', 'In use'], ['no', 'Retired']]), where: (v) => (v === 'yes' ? eq(c.active, true) : v === 'no' ? eq(c.active, false) : undefined) } },
        sorts: { code: c.code, name: c.name, kind: c.kind },
        defaultSort: { id: 'code', dir: 'asc' },
      },
      fields: {
        code: { label: 'Code', type: 'text', schema: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{1,12}$/, 'Use up to 12 letters or digits'), column: c.code, required: true, edit: false },
        name: { label: 'Name', type: 'text', schema: Text(60), column: c.name, required: true },
        kind: { label: 'Kind', type: 'select', schema: sel(COMPONENT_KINDS), column: c.kind, options: COMPONENT_KINDS, required: true, edit: false },
        pfWage: { label: 'Counts for PF', type: 'boolean', schema: Bool, column: c.pfWage, bulk: true, help: 'Basic and DA' },
        taxable: { label: 'Taxable', type: 'boolean', schema: Bool, column: c.taxable, bulk: true },
        calc: { label: 'Worked out as', type: 'select', schema: sel(CALCS), column: c.calc, options: CALCS, required: true, edit: false },
        startPercent: { label: 'Percentage', type: 'number', schema: z.union([z.coerce.number().min(0).max(1000), z.literal(''), z.null()]).transform((v) => (v === '' || v === null ? null : v)), column: c.percent, help: 'For a percentage component; revise it later with "Revise rate"' },
        baseCode: { label: 'Percentage of', type: 'text', schema: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{1,12}$/).default('BASIC'), column: c.baseCode, help: 'The code of the component it is a percentage of' },
        active: { label: 'In use', type: 'boolean', schema: Bool, column: c.active, bulk: true },
      },
      create: async (ctx, v) => {
        if (v.calc === 'percent' && (v.startPercent === null || v.startPercent === undefined)) throw new BadRequestException('Give the percentage');
        if (v.calc === 'percent' && v.baseCode === v.code) throw new BadRequestException('A component cannot be a percentage of itself');
        const [row] = await ctx.tx
          .insert(c)
          .values({ tenantId: ctx.p.tenantId, code: String(v.code), name: String(v.name), kind: String(v.kind), pfWage: !!v.pfWage, taxable: v.taxable !== false, active: v.active !== false, calc: String(v.calc ?? 'fixed'), percent: v.calc === 'percent' ? Number(v.startPercent) : null, baseCode: String(v.baseCode ?? 'BASIC') })
          .returning({ id: c.id });
        return row.id;
      },
      order: { column: c.sortOrder },
      remove: {
        guard: async (ctx, id) => {
          const [l] = await ctx.tx.select({ id: salaryStructureLines.componentId }).from(salaryStructureLines).where(eq(salaryStructureLines.componentId, id)).limit(1);
          return l ? 'Salary structures use this component: mark it not in use instead' : null;
        },
      },
      actions: {
        revise: {
          label: 'Revise rate',
          params: z.object({ effectiveMonth: Month, percent: z.number().min(0).max(1000), note: z.string().trim().max(300).default(''), arrearsMonth: Month.optional() }),
          apply: async (ctx, id, raw) => {
            const r = await this.payroll.reviseRate(ctx.tx, ctx.p, id, raw as { effectiveMonth: string; percent: number; note: string; arrearsMonth?: string });
            return `${r.rate.percent}% from ${r.rate.effectiveMonth}; arrears for ${r.arrears.staff} staff`;
          },
        },
      },
      columns: [
        { key: 'code', header: 'Code' },
        { key: 'name', header: 'Name' },
        { key: 'kind', header: 'Kind', value: (r) => labelOf(COMPONENT_KINDS, r.kind) },
        { key: 'calc', header: 'Worked out as', value: (r) => labelOf(CALCS, r.calc) },
        { key: 'percent', header: 'Rate today (%)' },
        { key: 'baseCode', header: 'Of' },
        { key: 'pfWage', header: 'PF wage', value: (r) => (r.pfWage ? 'Yes' : 'No') },
        { key: 'taxable', header: 'Taxable', value: (r) => (r.taxable ? 'Yes' : 'No') },
        { key: 'active', header: 'In use', value: (r) => (r.active ? 'Yes' : 'No') },
        { key: 'used', header: 'Staff' },
      ],
    };
  }

  private adjustments(): RecordEntity {
    const a = payrollAdjustments;
    const Decide = (approve: boolean) => async (ctx: KitCtx, id: string) => {
      const [x] = await ctx.tx.select().from(a).where(eq(a.id, id)).for('update');
      if (!x) throw new NotFoundException('Adjustment not found');
      if (x.status !== 'pending') throw new ConflictException(`This adjustment is already ${x.status}`);
      if (x.userId === ctx.p.userId) throw new ForbiddenException('You cannot decide your own adjustment');
      if (!(await monthTakesAdjustments(ctx.tx, x.payMonth))) throw new ConflictException("That month's payroll is locked: start a supplementary run to pay it");
      const status = approve ? 'approved' : 'rejected';
      await ctx.tx.update(a).set({ status, decidedBy: ctx.p.userId, decidedAt: new Date() }).where(eq(a.id, id));
      await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: 'payroll.adjustment_decided', subjectType: 'payroll_adjustment', subjectId: id, changes: { status: { before: 'pending', after: status } }, data: { approve } });
    };
    const runLabel = sql<string | null>`(select r.month || case when r.kind = 'supplementary' then ' (supplementary ' || (r.seq - 1) || ')' else '' end || ' · ' || r.status from payroll_runs r where r.id = ${a.runId})`;
    return {
      key: 'payroll-adjustments',
      module: 'payroll',
      table: a,
      subjectType: 'payroll_adjustment',
      roles: { read: PAYROLL_ROLES, write: PAYROLL_ROLES },
      label: (r) => `${r.staffName ?? ''} · ${labelOf(ADJ_KINDS, r.kind)} ${r.payMonth ?? ''}`,
      list: {
        select: { id: a.id, userId: a.userId, staffName: users.fullName, employeeCode: staffProfiles.employeeCode, departmentName: departments.name, kind: a.kind, payMonth: a.payMonth, hours: a.hours, amount: rupeesOf(a.amountPaise), reason: a.reason, status: a.status, runId: a.runId, run: runLabel, loanId: a.loanId, decidedByName: decider.fullName, createdAt: a.createdAt },
        joins: (q) => q.innerJoin(users, eq(users.id, a.userId)).leftJoin(staffProfiles, eq(staffProfiles.userId, a.userId)).leftJoin(departments, eq(departments.id, staffProfiles.departmentId)).leftJoin(decider, eq(decider.id, a.decidedBy)),
        search: [users.fullName, staffProfiles.employeeCode, a.reason],
        filters: {
          status: choiceFilter('Status', DECISION, a.status),
          kind: choiceFilter('Kind', ADJ_KINDS, a.kind),
          month: { label: 'Pay month', where: (v) => (/^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? eq(a.payMonth, v) : undefined) },
          paid: { label: 'Paid', options: opts([['yes', 'In a payroll run'], ['no', 'Not yet paid']]), where: (v) => (v === 'yes' ? sql`${a.runId} is not null` : v === 'no' ? sql`${a.runId} is null` : undefined) },
          loans: { label: 'Loan instalments', options: opts([['hide', 'Hide loan instalments'], ['only', 'Only loan instalments']]), where: (v) => (v === 'hide' ? sql`${a.loanId} is null` : v === 'only' ? sql`${a.loanId} is not null` : undefined) },
          user: staffFilter(a.userId),
          department: staffDepartmentFilter(a.userId),
        },
        sorts: { month: a.payMonth, staff: users.fullName, amount: a.amountPaise, created: a.createdAt },
        defaultSort: { id: 'created', dir: 'desc' },
      },
      fields: {
        userId: { label: 'Staff member', type: 'select', schema: z.uuid(), options: staffOptions, required: true, edit: false },
        kind: { label: 'Kind', type: 'select', schema: sel(ADJ_KINDS.filter((k) => k.value !== 'encashment')), options: ADJ_KINDS.filter((k) => k.value !== 'encashment'), required: true, edit: false },
        payMonth: { label: 'Pay month', type: 'text', schema: Month, required: true, help: 'YYYY-MM', apply: (ctx, id, v) => this.pendingSet(ctx, id, { payMonth: String(v) }) },
        amountPaise: { label: 'Amount (₹)', type: 'number', schema: Rupees.refine((v) => v !== null && v > 0, 'Give an amount'), required: true, rowKey: 'amount', apply: (ctx, id, v) => this.pendingSet(ctx, id, { amountPaise: Number(v) }) },
        reason: { label: 'Reason', type: 'textarea', schema: z.string().trim().min(3, 'Give a reason').max(300), required: true, apply: (ctx, id, v) => this.pendingSet(ctx, id, { reason: String(v) }) },
      },
      create: async (ctx, v) => {
        const month = String(v.payMonth);
        if (!(await monthTakesAdjustments(ctx.tx, month))) throw new ConflictException("That month's payroll is locked: start a supplementary run to pay it");
        const [sp] = await ctx.tx.select({ id: staffProfiles.userId }).from(staffProfiles).where(eq(staffProfiles.userId, String(v.userId)));
        if (!sp) throw new NotFoundException('Staff member not found');
        const [row] = await ctx.tx.insert(a).values({ tenantId: ctx.p.tenantId, userId: String(v.userId), kind: String(v.kind), payMonth: month, amountPaise: Number(v.amountPaise), reason: String(v.reason), createdBy: ctx.p.userId }).returning({ id: a.id });
        return row.id;
      },
      remove: {
        guard: async (ctx, id) => {
          const [x] = await ctx.tx.select({ runId: a.runId, loanId: a.loanId, status: a.status }).from(a).where(eq(a.id, id));
          if (x?.runId) return 'This adjustment is on a payroll run';
          if (x?.loanId) return 'A loan instalment goes with its loan: close the loan instead';
          if (x?.status === 'approved' && !ctx.p.roles.some((r) => PAYROLL_APPROVERS.includes(r))) return 'Only the principal can remove an approved adjustment';
          return null;
        },
      },
      actions: {
        approve: { label: 'Approve', roles: PAYROLL_APPROVERS, apply: Decide(true) },
        reject: { label: 'Reject', roles: PAYROLL_APPROVERS, tone: 'danger', apply: Decide(false) },
      },
      columns: [
        { key: 'staffName', header: 'Staff member' },
        { key: 'employeeCode', header: 'Employee code' },
        { key: 'kind', header: 'Kind', value: (r) => labelOf(ADJ_KINDS, r.kind) },
        { key: 'payMonth', header: 'Pay month' },
        { key: 'hours', header: 'Hours' },
        { key: 'amount', header: 'Amount (₹)' },
        { key: 'reason', header: 'Reason' },
        { key: 'status', header: 'Status', value: (r) => labelOf(DECISION, r.status) },
        { key: 'run', header: 'Payroll run' },
      ],
      import: {
        columns: [
          { key: 'employee_code', header: 'Employee code', required: true, example: 'EMP/0001' },
          { key: 'kind', header: 'Kind', required: true, options: ['overtime', 'arrear', 'bonus', 'recovery'], example: 'bonus' },
          { key: 'pay_month', header: 'Pay month', required: true, help: 'YYYY-MM', example: '2026-10' },
          { key: 'amount', header: 'Amount (₹)', required: true, example: '2500' },
          { key: 'reason', header: 'Reason', required: true, example: 'Festival bonus' },
        ],
        key: [],
        exists: async () => false,
        run: (ctx, rows) =>
          eachRow(ctx.tx, rows, async (tx, r) => {
            const code = r.get('employee_code');
            const [who] = await tx.select({ id: staffProfiles.userId }).from(staffProfiles).where(eq(staffProfiles.employeeCode, code));
            if (!who) fail('No staff member has this employee code', code || '(empty)');
            const kind = r.get('kind');
            if (!['overtime', 'arrear', 'bonus', 'recovery'].includes(kind)) fail('Choose one of the listed values', kind || '(empty)');
            const month = r.get('pay_month');
            if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) fail('This value is not valid', month || '(empty)');
            if (!(await monthTakesAdjustments(tx, month))) fail("That month's payroll is locked", month);
            const amount = Number(r.get('amount'));
            if (!(amount > 0)) fail('This value is not valid', r.get('amount') || '(empty)');
            const reason = r.get('reason') || fail('This value is required', 'reason');
            await tx.insert(a).values({ tenantId: ctx.p.tenantId, userId: who!.id, kind, payMonth: month, amountPaise: Math.round(amount * 100), reason, createdBy: ctx.p.userId });
            return outcome(true, false, [code, kind, month]);
          }),
      },
    };
  }

  private async pendingSet(ctx: KitCtx, id: string, set: Partial<typeof payrollAdjustments.$inferInsert>) {
    const [x] = await ctx.tx.select({ status: payrollAdjustments.status, runId: payrollAdjustments.runId, loanId: payrollAdjustments.loanId }).from(payrollAdjustments).where(eq(payrollAdjustments.id, id));
    if (!x) throw new NotFoundException('Adjustment not found');
    if (x.status !== 'pending' || x.runId || x.loanId) throw new ConflictException('Only an adjustment waiting for approval can be changed');
    if (set.payMonth && !(await monthTakesAdjustments(ctx.tx, set.payMonth))) throw new ConflictException("That month's payroll is locked");
    await ctx.tx.update(payrollAdjustments).set(set).where(eq(payrollAdjustments.id, id));
  }

  private loans(): RecordEntity {
    const l = staffLoans;
    const recovered = sql<number>`(select coalesce(sum(x.amount_paise), 0)::bigint from payroll_adjustments x join payroll_runs r on r.id = x.run_id where x.loan_id = ${l.id} and r.status = 'locked')`;
    const Note = z.object({ note: z.string().trim().max(300).default('') });
    return {
      key: 'staff-loans',
      module: 'payroll',
      table: l,
      subjectType: 'staff_loan',
      roles: { read: [...STAFF_ROLES], write: [...STAFF_ROLES] },
      label: (r) => `${r.loanNo} ${r.staffName ?? ''}`,
      list: {
        select: { id: l.id, loanNo: l.loanNo, userId: l.userId, staffName: users.fullName, employeeCode: staffProfiles.employeeCode, kind: l.kind, amount: rupeesOf(l.amountPaise), installments: l.installments, emi: rupeesOf(l.emiPaise), startMonth: l.startMonth, purpose: l.purpose, status: l.status, recovered: sql<number>`(${recovered} / 100.0)::float8`, outstanding: sql<number>`(case when ${l.status} = 'approved' then (${l.amountPaise} - ${recovered}) / 100.0 else 0 end)::float8`, decidedByName: decider.fullName, decisionNote: l.decisionNote, closeNote: l.closeNote, createdAt: l.createdAt },
        joins: (q) => q.innerJoin(users, eq(users.id, l.userId)).leftJoin(staffProfiles, eq(staffProfiles.userId, l.userId)).leftJoin(decider, eq(decider.id, l.decidedBy)),
        search: [users.fullName, staffProfiles.employeeCode, l.loanNo, l.purpose],
        scope: ownRows(l.userId, ['accountant']),
        filters: { status: choiceFilter('Status', LOAN_STATUS, l.status), kind: choiceFilter('Kind', LOAN_KINDS, l.kind), user: staffFilter(l.userId), department: staffDepartmentFilter(l.userId) },
        sorts: { created: l.createdAt, staff: users.fullName, amount: l.amountPaise, start: l.startMonth },
        defaultSort: { id: 'created', dir: 'desc' },
      },
      fields: {
        userId: { label: 'Staff member', type: 'select', schema: z.union([z.uuid(), z.literal(''), z.null()]).transform((v) => v || null), options: staffOptions, edit: false, help: 'Leave empty for yourself' },
        kind: { label: 'Kind', type: 'select', schema: sel(LOAN_KINDS), options: LOAN_KINDS, required: true, edit: false },
        amountPaise: { label: 'Amount (₹)', type: 'number', schema: Rupees.refine((v) => v !== null && v >= 10_000, 'At least Rs. 100'), required: true, edit: false },
        installments: { label: 'Monthly instalments', type: 'number', schema: z.coerce.number().int().min(1).max(120), required: true, edit: false },
        startMonth: { label: 'First instalment in', type: 'text', schema: Month, required: true, edit: false, help: 'YYYY-MM' },
        purpose: { label: 'Purpose', type: 'textarea', schema: z.string().trim().min(3, 'Say what it is for').max(300), required: true, edit: false },
      },
      create: async (ctx, v) => (await createLoan(ctx.tx, ctx.p, { userId: (v.userId as string | null) ?? undefined, kind: v.kind as 'loan', amountPaise: Number(v.amountPaise), installments: Number(v.installments), startMonth: String(v.startMonth), purpose: String(v.purpose) })).id,
      remove: {
        guard: async (ctx, id) => {
          const [x] = await ctx.tx.select({ status: l.status, userId: l.userId }).from(l).where(eq(l.id, id));
          if (x && ['approved', 'closed'].includes(x.status)) return 'A loan that was approved stays on record';
          if (x && x.userId !== ctx.p.userId && !isPayrollStaff(ctx.p)) return 'Not your request';
          return null;
        },
      },
      actions: {
        approve: { label: 'Approve', roles: PAYROLL_APPROVERS, params: Note, apply: async (ctx, id, p) => void (await decideLoan(ctx.tx, ctx.p, this.notifications, id, 'approve', (p as { note: string }).note)) },
        reject: { label: 'Reject', roles: PAYROLL_APPROVERS, tone: 'danger', params: Note, apply: async (ctx, id, p) => void (await decideLoan(ctx.tx, ctx.p, this.notifications, id, 'reject', (p as { note: string }).note)) },
        close: { label: 'Close early', roles: PAYROLL_APPROVERS, params: z.object({ note: z.string().trim().min(3, 'Say how the rest was settled').max(300) }), apply: async (ctx, id, p) => void (await closeLoanEarly(ctx.tx, ctx.p, id, (p as { note: string }).note)) },
      },
      columns: [
        { key: 'loanNo', header: 'Number' },
        { key: 'staffName', header: 'Staff member' },
        { key: 'employeeCode', header: 'Employee code' },
        { key: 'kind', header: 'Kind', value: (r) => labelOf(LOAN_KINDS, r.kind) },
        { key: 'amount', header: 'Amount (₹)' },
        { key: 'installments', header: 'Instalments' },
        { key: 'emi', header: 'Monthly (₹)' },
        { key: 'startMonth', header: 'From' },
        { key: 'recovered', header: 'Recovered (₹)' },
        { key: 'outstanding', header: 'Outstanding (₹)' },
        { key: 'status', header: 'Status', value: (r) => labelOf(LOAN_STATUS, r.status) },
        { key: 'purpose', header: 'Purpose' },
      ],
    };
  }

  private challans(): RecordEntity {
    const c = tdsChallans;
    const deducted = sql<number>`(select coalesce(sum(p.tds_paise), 0)::bigint from payslips p join payroll_runs r on r.id = p.run_id where r.month = tds_challans.pay_month and r.status = 'locked')`;
    return {
      key: 'tds-challans',
      module: 'payroll',
      table: c,
      subjectType: 'tds_challan',
      roles: { read: PAYROLL_ROLES, write: PAYROLL_ROLES },
      label: (r) => `${r.bsrCode}/${r.challanSerial} (${r.payMonth})`,
      list: {
        select: { id: c.id, financialYear: c.financialYear, payMonth: c.payMonth, section: c.section, bsrCode: c.bsrCode, challanSerial: c.challanSerial, depositedOn: c.depositedOn, tds: rupeesOf(c.tdsPaise), interest: rupeesOf(c.interestPaise), deducted: sql<number>`(${deducted} / 100.0)::float8`, createdAt: c.createdAt },
        search: [c.bsrCode, c.challanSerial, c.payMonth],
        filters: { fy: { label: 'Financial year', options: async (ctx) => (await ctx.tx.selectDistinct({ fy: c.financialYear }).from(c).orderBy(desc(c.financialYear))).map((r) => ({ value: r.fy, label: r.fy })), where: (v) => (/^\d{4}-\d{2}$/.test(v) ? eq(c.financialYear, v) : undefined) } },
        sorts: { month: c.payMonth, deposited: c.depositedOn, amount: c.tdsPaise },
        defaultSort: { id: 'month', dir: 'desc' },
      },
      fields: {
        payMonth: { label: 'Month of deduction', type: 'text', schema: Month, column: c.payMonth, required: true, help: 'YYYY-MM' },
        section: { label: 'Section', type: 'text', schema: z.string().trim().max(10).default('192'), column: c.section },
        bsrCode: { label: 'BSR code', type: 'text', schema: z.string().trim().regex(/^\d{7}$/, 'A BSR code has seven digits'), column: c.bsrCode, required: true },
        challanSerial: { label: 'Challan serial number', type: 'text', schema: z.string().trim().min(1).max(20), column: c.challanSerial, required: true },
        depositedOn: { label: 'Deposited on', type: 'date', schema: Day, column: c.depositedOn, required: true },
        tdsPaise: { label: 'TDS deposited (₹)', type: 'number', schema: Rupees.refine((v) => v !== null && v > 0, 'Give the amount'), column: c.tdsPaise, rowKey: 'tds', required: true },
        interestPaise: { label: 'Interest (₹)', type: 'number', schema: Rupees.transform((v) => v ?? 0), column: c.interestPaise, rowKey: 'interest' },
      },
      create: async (ctx, v) => {
        const m = String(v.payMonth);
        const y = Number(m.slice(0, 4));
        const fy = Number(m.slice(5, 7)) >= 4 ? y : y - 1;
        const [row] = await ctx.tx
          .insert(c)
          .values({ tenantId: ctx.p.tenantId, financialYear: `${fy}-${String(fy + 1).slice(2)}`, payMonth: m, section: String(v.section ?? '192'), bsrCode: String(v.bsrCode), challanSerial: String(v.challanSerial), depositedOn: String(v.depositedOn), tdsPaise: Number(v.tdsPaise), interestPaise: Number(v.interestPaise ?? 0), createdBy: ctx.p.userId })
          .returning({ id: c.id });
        return row.id;
      },
      columns: [
        { key: 'financialYear', header: 'Financial year' },
        { key: 'payMonth', header: 'Month' },
        { key: 'section', header: 'Section' },
        { key: 'bsrCode', header: 'BSR code' },
        { key: 'challanSerial', header: 'Challan serial' },
        { key: 'depositedOn', header: 'Deposited on' },
        { key: 'tds', header: 'TDS deposited (₹)' },
        { key: 'interest', header: 'Interest (₹)' },
        { key: 'deducted', header: 'TDS deducted in payroll (₹)' },
      ],
    };
  }
}

