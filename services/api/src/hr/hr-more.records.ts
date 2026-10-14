import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { and, eq, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import type { RoleName } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { staffTransfers } from '../db/schema-assist.js';
import { leaveEncashments, serviceBookEntries } from '../db/schema-hrpay.js';
import { appraisalCycles, approvalDelegations, departments, designations, leaveTypes, onboardingItems, payrollRuns, separations, staffProfiles, trainingRecords, users } from '../db/schema.js';
import { fail, outcome } from '../import/row-helpers.js';
import { RecordRegistry, type FieldOption, type KitCtx, type RecordEntity } from '../records/entity.js';
import { DateText, Text } from '../records/helpers.js';
import { eachRow } from '../records/import.js';
import { TASK_ROLES } from '../tasks/tasks.controller.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { HR_ROLES, isHr, isPayrollStaff, PAYROLL_APPROVERS, PAYROLL_ROLES, STAFF_ROLES } from './hr.access.js';
import { decideEncashment, requestEncashment } from './hr-workflows.controller.js';
import { LeaveService } from './leave.service.js';
import { HrService } from './hr.service.js';
import { choiceFilter, DateOnly, labelOf, opts, ownRows, rupeesOf, staffDepartmentFilter, staffFilter, staffOptions } from './kit-shared.js';

const sel = (o: FieldOption[]) => z.enum(o.map((x) => x.value) as [string, ...string[]]);
const ADMIN: RoleName[] = ['tenant_admin', 'principal'];
const TRAINING_KINDS = opts([
  ['fdp', 'Faculty development programme'],
  ['workshop', 'Workshop'],
  ['conference', 'Conference'],
  ['course', 'Course (MOOC, refresher)'],
]);
const CYCLE_STATUS = opts([
  ['open', 'Open'],
  ['closed', 'Closed'],
]);
export const BOOK_KINDS = opts([
  ['appointment', 'Appointment'],
  ['confirmation', 'Confirmation'],
  ['promotion', 'Promotion'],
  ['increment', 'Increment'],
  ['transfer', 'Transfer'],
  ['award', 'Award'],
  ['penalty', 'Penalty'],
  ['deputation', 'Deputation'],
  ['remark', 'Remark'],
]);
const ENCASH_STATUS = opts([
  ['pending', 'Waiting'],
  ['approved', 'Approved'],
  ['rejected', 'Rejected'],
]);
const SEPARATION_STATUS = opts([
  ['submitted', 'Submitted'],
  ['accepted', 'Accepted'],
  ['clearance', 'Clearance'],
  ['settled', 'Settled'],
  ['relieved', 'Relieved'],
  ['withdrawn', 'Withdrawn'],
]);
const TRANSFER_STATUS = opts([
  ['scheduled', 'Scheduled'],
  ['applied', 'Done'],
  ['cancelled', 'Cancelled'],
]);
const DELEGATION_SCOPES = opts([
  ['all', 'All approvals'],
  ['workflows', 'Workflow approvals'],
  ['leave', 'Leave approvals'],
]);
const RUN_STATUS = opts([
  ['draft', 'Draft'],
  ['verified', 'Verified'],
  ['approved', 'Approved'],
  ['locked', 'Locked'],
  ['reversed', 'Reversed'],
]);
const RUN_KINDS = opts([
  ['regular', 'Regular'],
  ['supplementary', 'Supplementary'],
]);

const from = alias(departments, 'from_dept');
const to = alias(departments, 'to_dept');
const fromDes = alias(designations, 'from_des');
const toDes = alias(designations, 'to_des');
const delegate = alias(users, 'delegate');

async function colleagues(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx.execute<{ id: string; full_name: string }>(sql`select distinct u.id, u.full_name from users u join user_roles r on r.user_id = u.id where u.status = 'active' and r.role::text in (${sql.join(
    TASK_ROLES.map((x) => sql`${x}`),
    sql`, `,
  )}) and u.id <> ${ctx.p.userId}::uuid order by u.full_name`);
  return rows.rows.map((r) => ({ value: r.id, label: r.full_name }));
}

/** Training records, appraisal cycles, the service book, leave encashment, onboarding, exits, transfers, delegations and payroll runs on the record kit. */
@Injectable()
export class HrMoreRecords implements OnModuleInit {
  constructor(
    private readonly registry: RecordRegistry,
    private readonly hr: HrService,
    private readonly leave: LeaveService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    for (const e of [this.training(), this.cycles(), this.serviceBook(), this.encashments(), this.onboarding(), this.separations(), this.transfers(), this.runs()]) this.registry.register(e);
  }

  private training(): RecordEntity {
    const r = trainingRecords;
    return {
      key: 'training-records',
      module: 'hr',
      table: r,
      subjectType: 'training_record',
      roles: { read: [...STAFF_ROLES], write: [...STAFF_ROLES] },
      label: (x) => String(x.title),
      list: {
        select: { id: r.id, userId: r.userId, staffName: users.fullName, employeeCode: staffProfiles.employeeCode, departmentName: departments.name, title: r.title, kind: r.kind, organiser: r.organiser, startsOn: r.startsOn, endsOn: r.endsOn, hours: r.hours, certificateRef: r.certificateRef, hasCertificate: sql<boolean>`(${r.certificateKey} is not null)`, verified: r.verified, createdAt: r.createdAt },
        joins: (q) => q.innerJoin(users, eq(users.id, r.userId)).leftJoin(staffProfiles, eq(staffProfiles.userId, r.userId)).leftJoin(departments, eq(departments.id, staffProfiles.departmentId)),
        search: [users.fullName, staffProfiles.employeeCode, r.title, r.organiser],
        scope: ownRows(r.userId),
        filters: {
          kind: choiceFilter('Kind', TRAINING_KINDS, r.kind),
          verified: { label: 'Verified', options: opts([['yes', 'Verified'], ['no', 'Not verified']]), where: (v) => (v === 'yes' ? eq(r.verified, true) : v === 'no' ? eq(r.verified, false) : undefined) },
          fy: { label: 'Financial year', where: (v) => (/^\d{4}$/.test(v) ? sql`${r.startsOn} between ${`${v}-04-01`}::date and ${`${Number(v) + 1}-03-31`}::date` : undefined) },
          user: staffFilter(r.userId),
          department: staffDepartmentFilter(r.userId),
        },
        sorts: { starts: r.startsOn, staff: users.fullName, hours: r.hours, title: r.title },
        defaultSort: { id: 'starts', dir: 'desc' },
      },
      fields: {
        userId: { label: 'Staff member', type: 'select', schema: z.union([z.uuid(), z.literal(''), z.null()]).transform((v) => v || null), options: staffOptions, edit: false, help: 'Leave empty for yourself' },
        title: { label: 'Programme', type: 'text', schema: Text(200), column: r.title, required: true },
        kind: { label: 'Kind', type: 'select', schema: sel(TRAINING_KINDS), column: r.kind, options: TRAINING_KINDS, required: true, bulk: true },
        organiser: { label: 'Organised by', type: 'text', schema: z.string().trim().max(200).nullable().default(null), column: r.organiser },
        startsOn: { label: 'From', type: 'date', schema: DateOnly, column: r.startsOn, required: true },
        endsOn: { label: 'To', type: 'date', schema: DateOnly, column: r.endsOn, required: true },
        hours: { label: 'Hours', type: 'number', schema: z.coerce.number().min(0).max(1000), column: r.hours, required: true },
        certificateRef: { label: 'Certificate number', type: 'text', schema: z.string().trim().max(200).nullable().default(null), column: r.certificateRef },
      },
      create: async (ctx, v) => {
        const userId = (isHr(ctx.p) && (v.userId as string | null)) || ctx.p.userId;
        if (String(v.endsOn) < String(v.startsOn)) throw new BadRequestException('The programme cannot end before it starts');
        const [row] = await ctx.tx
          .insert(r)
          .values({ tenantId: ctx.p.tenantId, userId, title: String(v.title), kind: String(v.kind), organiser: (v.organiser as string | null) ?? null, startsOn: String(v.startsOn), endsOn: String(v.endsOn), hours: Number(v.hours), certificateRef: (v.certificateRef as string | null) ?? null, verified: isHr(ctx.p) })
          .returning({ id: r.id });
        return row.id;
      },
      remove: { guard: async (ctx, id) => (isHr(ctx.p) ? null : (await ctx.tx.select({ v: r.verified }).from(r).where(eq(r.id, id)))[0]?.v ? 'A verified record can be removed only by HR' : null) },
      actions: {
        verify: {
          label: 'Mark verified',
          roles: HR_ROLES,
          apply: async (ctx, id) => {
            const [x] = await ctx.tx.select({ verified: r.verified }).from(r).where(eq(r.id, id));
            if (x?.verified) return 'Already verified';
            await ctx.tx.update(r).set({ verified: true }).where(eq(r.id, id));
            await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: 'hr.training_verified.v1', subjectType: 'training_record', subjectId: id, changes: { verified: { before: false, after: true } } });
          },
        },
      },
      columns: [
        { key: 'staffName', header: 'Staff member' },
        { key: 'employeeCode', header: 'Employee code' },
        { key: 'title', header: 'Programme' },
        { key: 'kind', header: 'Kind', value: (x) => labelOf(TRAINING_KINDS, x.kind) },
        { key: 'organiser', header: 'Organised by' },
        { key: 'startsOn', header: 'From' },
        { key: 'endsOn', header: 'To' },
        { key: 'hours', header: 'Hours' },
        { key: 'verified', header: 'Verified', value: (x) => (x.verified ? 'Yes' : 'No') },
      ],
      import: {
        columns: [
          { key: 'employee_code', header: 'Employee code', required: true, example: 'EMP/0001' },
          { key: 'title', header: 'Programme', required: true, example: 'AICTE FDP on outcome-based education' },
          { key: 'kind', header: 'Kind', options: TRAINING_KINDS.map((k) => k.value), example: 'fdp' },
          { key: 'organiser', header: 'Organised by', example: 'AICTE Training and Learning Academy' },
          { key: 'starts_on', header: 'From', required: true, example: '2026-06-01' },
          { key: 'ends_on', header: 'To', required: true, example: '2026-06-05' },
          { key: 'hours', header: 'Hours', required: true, example: '30' },
        ],
        key: [],
        exists: async () => false,
        run: (ctx, rows) =>
          eachRow(ctx.tx, rows, async (tx, x) => {
            if (!isHr(ctx.p)) fail('Only HR can import');
            const [who] = await tx.select({ id: staffProfiles.userId }).from(staffProfiles).where(eq(staffProfiles.employeeCode, x.get('employee_code')));
            if (!who) fail('No staff member has this employee code', x.get('employee_code') || '(empty)');
            const kind = x.get('kind') || 'fdp';
            if (!TRAINING_KINDS.some((k) => k.value === kind)) fail('Choose one of the listed values', kind);
            const s = x.get('starts_on');
            const e = x.get('ends_on');
            if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e) || e < s) fail('This value is not valid', `${s} – ${e}`);
            const hours = Number(x.get('hours'));
            if (!(hours >= 0 && hours <= 1000)) fail('This value is not valid', x.get('hours'));
            await tx.insert(r).values({ tenantId: ctx.p.tenantId, userId: who!.id, title: x.get('title') || fail('This value is required', 'title'), kind, organiser: x.get('organiser') || null, startsOn: s, endsOn: e, hours, verified: true });
            return outcome(true, false, [x.get('employee_code'), x.get('title')]);
          }),
      },
    };
  }

  private cycles(): RecordEntity {
    const c = appraisalCycles;
    const counts = (st: string) => sql<number>`(select count(*)::int from appraisals a where a.cycle_id = appraisal_cycles.id and a.status = ${st})`;
    const total = sql<number>`(select count(*)::int from appraisals a where a.cycle_id = appraisal_cycles.id)`;
    return {
      key: 'appraisal-cycles',
      module: 'hr',
      table: c,
      subjectType: 'appraisal_cycle',
      roles: { read: [...STAFF_ROLES], write: HR_ROLES },
      label: (x) => String(x.period),
      list: {
        select: { id: c.id, period: c.period, opensOn: c.opensOn, closesOn: c.closesOn, status: c.status, total, submitted: counts('self_submitted'), reviewed: counts('hod_reviewed'), committee: counts('committee_reviewed'), finalised: counts('finalised'), createdAt: c.createdAt },
        search: [c.period],
        filters: { status: choiceFilter('Status', CYCLE_STATUS, c.status) },
        sorts: { opens: c.opensOn, period: c.period },
        defaultSort: { id: 'opens', dir: 'desc' },
      },
      fields: {
        period: { label: 'Period', type: 'text', schema: z.string().trim().min(4).max(20), column: c.period, required: true, help: 'Like 2026-27' },
        opensOn: { label: 'Opens on', type: 'date', schema: DateOnly, column: c.opensOn, required: true },
        closesOn: { label: 'Closes on', type: 'date', schema: DateOnly, column: c.closesOn, required: true },
      },
      create: async (ctx, v) => {
        if (String(v.closesOn) < String(v.opensOn)) throw new BadRequestException('The cycle cannot close before it opens');
        const [row] = await ctx.tx.insert(c).values({ tenantId: ctx.p.tenantId, period: String(v.period), opensOn: String(v.opensOn), closesOn: String(v.closesOn) }).returning({ id: c.id });
        return row.id;
      },
      remove: { guard: async (ctx, id) => ((await ctx.tx.execute(sql`select 1 from appraisals where cycle_id = ${id}::uuid and status <> 'draft' limit 1`)).rows.length ? 'Appraisals were submitted in this cycle' : null) },
      actions: {
        close: {
          label: 'Close',
          apply: async (ctx, id) => {
            const [x] = await ctx.tx.select({ status: c.status }).from(c).where(eq(c.id, id));
            if (x?.status === 'closed') return 'Already closed';
            await ctx.tx.update(c).set({ status: 'closed' }).where(eq(c.id, id));
            await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: 'hr.appraisal_cycle_closed.v1', subjectType: 'appraisal_cycle', subjectId: id, changes: { status: { before: 'open', after: 'closed' } } });
          },
        },
        reopen: {
          label: 'Reopen',
          apply: async (ctx, id) => {
            const [x] = await ctx.tx.select({ status: c.status }).from(c).where(eq(c.id, id));
            if (x?.status === 'open') return 'Already open';
            await ctx.tx.update(c).set({ status: 'open' }).where(eq(c.id, id));
            await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: 'appraisal_cycle.updated', subjectType: 'appraisal_cycle', subjectId: id, changes: { status: { before: 'closed', after: 'open' } } });
          },
        },
      },
      columns: [
        { key: 'period', header: 'Period' },
        { key: 'opensOn', header: 'Opens on' },
        { key: 'closesOn', header: 'Closes on' },
        { key: 'status', header: 'Status', value: (x) => labelOf(CYCLE_STATUS, x.status) },
        { key: 'total', header: 'Appraisals' },
        { key: 'finalised', header: 'Finalised' },
      ],
    };
  }

  private serviceBook(): RecordEntity {
    const b = serviceBookEntries;
    return {
      key: 'service-book',
      module: 'hr',
      table: b,
      subjectType: 'service_book_entry',
      roles: { read: [...PAYROLL_ROLES, 'hod'], write: HR_ROLES },
      label: (x) => `${x.staffName ?? ''} · ${x.title ?? ''}`,
      list: {
        select: { id: b.id, userId: b.userId, staffName: users.fullName, employeeCode: staffProfiles.employeeCode, kind: b.kind, onDate: b.onDate, title: b.title, details: b.details, orderNo: b.orderNo, createdAt: b.createdAt },
        joins: (q) => q.innerJoin(users, eq(users.id, b.userId)).leftJoin(staffProfiles, eq(staffProfiles.userId, b.userId)),
        search: [users.fullName, staffProfiles.employeeCode, b.title, b.orderNo],
        filters: { kind: choiceFilter('Kind', BOOK_KINDS, b.kind), user: staffFilter(b.userId), department: staffDepartmentFilter(b.userId) },
        sorts: { date: b.onDate, staff: users.fullName },
        defaultSort: { id: 'date', dir: 'desc' },
      },
      fields: {
        userId: { label: 'Staff member', type: 'select', schema: z.uuid(), column: b.userId, options: staffOptions, required: true, edit: false },
        kind: { label: 'Kind', type: 'select', schema: sel(BOOK_KINDS), column: b.kind, options: BOOK_KINDS, required: true },
        onDate: { label: 'Date', type: 'date', schema: DateOnly, column: b.onDate, required: true },
        title: { label: 'Entry', type: 'text', schema: Text(160), column: b.title, required: true },
        details: { label: 'Details', type: 'textarea', schema: z.string().trim().max(2000).default(''), column: b.details },
        orderNo: { label: 'Order number', type: 'text', schema: z.string().trim().max(60).nullable().default(null), column: b.orderNo },
      },
      create: async (ctx, v) => {
        const [row] = await ctx.tx.insert(b).values({ tenantId: ctx.p.tenantId, userId: String(v.userId), kind: String(v.kind), onDate: String(v.onDate), title: String(v.title), details: String(v.details ?? ''), orderNo: (v.orderNo as string | null) ?? null, createdBy: ctx.p.userId }).returning({ id: b.id });
        return row.id;
      },
      columns: [
        { key: 'staffName', header: 'Staff member' },
        { key: 'employeeCode', header: 'Employee code' },
        { key: 'onDate', header: 'Date' },
        { key: 'kind', header: 'Kind', value: (x) => labelOf(BOOK_KINDS, x.kind) },
        { key: 'title', header: 'Entry' },
        { key: 'orderNo', header: 'Order number' },
        { key: 'details', header: 'Details' },
      ],
    };
  }

  private encashments(): RecordEntity {
    const e = leaveEncashments;
    return {
      key: 'leave-encashments',
      module: 'hr',
      table: e,
      subjectType: 'leave_encashment',
      roles: { read: [...STAFF_ROLES], write: [...STAFF_ROLES] },
      label: (x) => `${x.staffName ?? ''} · ${x.days ?? ''} days`,
      list: {
        select: { id: e.id, userId: e.userId, staffName: users.fullName, employeeCode: staffProfiles.employeeCode, typeCode: leaveTypes.code, year: e.year, days: e.days, amount: rupeesOf(e.amountPaise), payMonth: e.payMonth, status: e.status, decisionNote: e.decisionNote, createdAt: e.createdAt },
        joins: (q) => q.innerJoin(users, eq(users.id, e.userId)).innerJoin(leaveTypes, eq(leaveTypes.id, e.leaveTypeId)).leftJoin(staffProfiles, eq(staffProfiles.userId, e.userId)),
        search: [users.fullName, staffProfiles.employeeCode],
        scope: ownRows(e.userId, ['accountant']),
        filters: { status: choiceFilter('Status', ENCASH_STATUS, e.status), user: staffFilter(e.userId), year: { label: 'Year', where: (v) => (/^\d{4}$/.test(v) ? eq(e.year, Number(v)) : undefined) } },
        sorts: { created: e.createdAt, staff: users.fullName, month: e.payMonth },
        defaultSort: { id: 'created', dir: 'desc' },
      },
      fields: {
        userId: { label: 'Staff member', type: 'select', schema: z.union([z.uuid(), z.literal(''), z.null()]).transform((v) => v || null), options: staffOptions, edit: false, help: 'Leave empty for yourself' },
        leaveTypeId: { label: 'Leave type', type: 'select', schema: z.uuid(), options: async (ctx) => (await ctx.tx.select({ id: leaveTypes.id, code: leaveTypes.code, name: leaveTypes.name }).from(leaveTypes).where(and(eq(leaveTypes.encashable, true), eq(leaveTypes.active, true)))).map((x) => ({ value: x.id, label: `${x.code} · ${x.name}` })), required: true, edit: false },
        days: { label: 'Days', type: 'number', schema: z.coerce.number().positive().max(365).multipleOf(0.5), required: true, edit: false },
        payMonth: { label: 'Pay in month', type: 'text', schema: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month like 2026-10'), required: true, edit: false, help: 'YYYY-MM' },
      },
      create: async (ctx, v) => (await requestEncashment(ctx.tx, ctx.p, this.leave, { userId: (v.userId as string | null) ?? undefined, leaveTypeId: String(v.leaveTypeId), days: Number(v.days), payMonth: String(v.payMonth) })).id,
      remove: {
        guard: async (ctx, id) => {
          const [x] = await ctx.tx.select({ s: e.status, userId: e.userId }).from(e).where(eq(e.id, id));
          if (x?.s === 'approved') return 'An approved encashment is paid through payroll';
          if (x && x.userId !== ctx.p.userId && !isPayrollStaff(ctx.p)) return 'Not your request';
          return null;
        },
      },
      actions: {
        approve: { label: 'Approve', roles: PAYROLL_APPROVERS, params: z.object({ note: z.string().trim().max(300).default('') }), apply: async (ctx, id, p) => void (await decideEncashment(ctx.tx, ctx.p, this.notifications, id, 'approve', (p as { note: string }).note)) },
        reject: { label: 'Reject', roles: PAYROLL_APPROVERS, tone: 'danger', params: z.object({ note: z.string().trim().min(3, 'Give a reason for rejecting').max(300) }), apply: async (ctx, id, p) => void (await decideEncashment(ctx.tx, ctx.p, this.notifications, id, 'reject', (p as { note: string }).note)) },
      },
      columns: [
        { key: 'staffName', header: 'Staff member' },
        { key: 'employeeCode', header: 'Employee code' },
        { key: 'typeCode', header: 'Leave' },
        { key: 'days', header: 'Days' },
        { key: 'amount', header: 'Amount (₹)' },
        { key: 'payMonth', header: 'Pay month' },
        { key: 'status', header: 'Status', value: (x) => labelOf(ENCASH_STATUS, x.status) },
      ],
    };
  }

  private onboarding(): RecordEntity {
    const o = onboardingItems;
    const tick = (done: boolean) => async (ctx: KitCtx, id: string) => {
      const [x] = await ctx.tx.select().from(o).where(eq(o.id, id));
      if (!x) throw new NotFoundException('Item not found');
      if (!isHr(ctx.p) && !(x.userId === ctx.p.userId && x.owner === 'Employee')) throw new ForbiddenException('This item is not yours to tick');
      if (x.done === done) return 'No change';
      await ctx.tx.update(o).set({ done, doneAt: done ? new Date() : null, doneBy: done ? ctx.p.userId : null }).where(eq(o.id, id));
      await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: 'hr.onboarding_item_ticked.v1', subjectType: 'onboarding_item', subjectId: id, changes: { done: { before: x.done, after: done } } });
    };
    const OWNERS = opts([['HR', 'HR'], ['Employee', 'Employee'], ['IT', 'IT'], ['Department', 'Department'], ['Accounts', 'Accounts']]);
    return {
      key: 'onboarding-items',
      module: 'hr',
      table: o,
      subjectType: 'onboarding_item',
      roles: { read: [...STAFF_ROLES], write: HR_ROLES },
      label: (x) => `${x.staffName ?? ''} · ${x.title ?? ''}`,
      list: {
        select: { id: o.id, userId: o.userId, staffName: users.fullName, employeeCode: staffProfiles.employeeCode, title: o.title, owner: o.owner, dueOn: o.dueOn, done: o.done, doneAt: o.doneAt, overdue: sql<boolean>`(not ${o.done} and ${o.dueOn} < current_date)`, createdAt: o.createdAt },
        joins: (q) => q.innerJoin(users, eq(users.id, o.userId)).leftJoin(staffProfiles, eq(staffProfiles.userId, o.userId)),
        search: [users.fullName, o.title],
        scope: ownRows(o.userId),
        filters: { done: { label: 'Done', options: opts([['yes', 'Done'], ['no', 'To do'], ['overdue', 'Overdue']]), where: (v) => (v === 'yes' ? eq(o.done, true) : v === 'no' ? eq(o.done, false) : v === 'overdue' ? sql`not ${o.done} and ${o.dueOn} < current_date` : undefined) }, owner: choiceFilter('Owner', OWNERS, o.owner), user: staffFilter(o.userId) },
        sorts: { due: o.dueOn, staff: users.fullName },
        defaultSort: { id: 'due', dir: 'asc' },
      },
      fields: {
        userId: { label: 'Staff member', type: 'select', schema: z.uuid(), column: o.userId, options: staffOptions, required: true, edit: false },
        title: { label: 'Task', type: 'text', schema: Text(200), column: o.title, required: true },
        owner: { label: 'Owner', type: 'select', schema: sel(OWNERS), column: o.owner, options: OWNERS, required: true, bulk: true },
        dueOn: { label: 'Due on', type: 'date', schema: DateText, column: o.dueOn, bulk: true },
      },
      actions: { done: { label: 'Mark done', roles: [...STAFF_ROLES], apply: tick(true) }, undo: { label: 'Mark not done', roles: [...STAFF_ROLES], apply: tick(false) } },
      columns: [
        { key: 'staffName', header: 'Staff member' },
        { key: 'title', header: 'Task' },
        { key: 'owner', header: 'Owner' },
        { key: 'dueOn', header: 'Due on' },
        { key: 'done', header: 'Done', value: (x) => (x.done ? 'Yes' : 'No') },
      ],
    };
  }

  private separations(): RecordEntity {
    const s = separations;
    const pending = sql<number>`(select count(*)::int from exit_clearances c where c.separation_id = ${s.id} and c.status = 'pending')`;
    return {
      key: 'separations',
      module: 'hr',
      table: s,
      subjectType: 'separation',
      roles: { read: HR_ROLES, write: HR_ROLES },
      label: (x) => `${x.staffName ?? ''} · ${x.resignedOn ?? ''}`,
      list: {
        select: { id: s.id, userId: s.userId, staffName: users.fullName, employeeCode: staffProfiles.employeeCode, departmentName: departments.name, resignedOn: s.resignedOn, noticeDays: s.noticeDays, lastWorkingDay: s.lastWorkingDay, reason: s.reason, status: s.status, shortfall: s.noticeShortfallDays, settlement: rupeesOf(s.settlementPaise), relievedOn: s.relievedOn, pendingClearances: pending, createdAt: s.createdAt },
        joins: (q) => q.innerJoin(users, eq(users.id, s.userId)).leftJoin(staffProfiles, eq(staffProfiles.userId, s.userId)).leftJoin(departments, eq(departments.id, staffProfiles.departmentId)),
        search: [users.fullName, staffProfiles.employeeCode, s.reason],
        filters: { status: { label: 'Status', options: [{ value: 'open', label: 'In progress' }, ...SEPARATION_STATUS], where: (v) => (v === 'open' ? sql`${s.status} in ('submitted', 'accepted', 'clearance', 'settled')` : SEPARATION_STATUS.some((o) => o.value === v) ? eq(s.status, v) : undefined) }, department: staffDepartmentFilter(s.userId) },
        sorts: { lwd: s.lastWorkingDay, staff: users.fullName, resigned: s.resignedOn },
        defaultSort: { id: 'resigned', dir: 'desc' },
      },
      remove: { guard: async (ctx, id) => ((await ctx.tx.select({ st: s.status }).from(s).where(eq(s.id, id)))[0]?.st === 'withdrawn' ? null : 'Only a withdrawn resignation can be deleted') },
      columns: [
        { key: 'staffName', header: 'Staff member' },
        { key: 'employeeCode', header: 'Employee code' },
        { key: 'departmentName', header: 'Department' },
        { key: 'resignedOn', header: 'Resigned on' },
        { key: 'lastWorkingDay', header: 'Last working day' },
        { key: 'status', header: 'Status', value: (x) => labelOf(SEPARATION_STATUS, x.status) },
        { key: 'pendingClearances', header: 'Clearances pending' },
        { key: 'settlement', header: 'Settlement (₹)' },
        { key: 'reason', header: 'Reason' },
      ],
    };
  }

  private transfers(): RecordEntity {
    const t = staffTransfers;
    return {
      key: 'staff-transfers',
      module: 'hr',
      table: t,
      subjectType: 'staff_transfer',
      roles: { read: HR_ROLES, write: HR_ROLES },
      label: (x) => `${x.staffName ?? ''} · ${x.effectiveOn ?? ''}`,
      list: {
        select: { id: t.id, userId: t.userId, staffName: users.fullName, employeeCode: staffProfiles.employeeCode, fromDepartment: from.name, toDepartment: to.name, fromDesignation: fromDes.name, toDesignation: toDes.name, effectiveOn: t.effectiveOn, reason: t.reason, status: t.status, createdAt: t.createdAt },
        joins: (q) => q.innerJoin(users, eq(users.id, t.userId)).leftJoin(staffProfiles, eq(staffProfiles.userId, t.userId)).leftJoin(from, eq(from.id, t.fromDepartmentId)).leftJoin(to, eq(to.id, t.toDepartmentId)).leftJoin(fromDes, eq(fromDes.id, t.fromDesignationId)).leftJoin(toDes, eq(toDes.id, t.toDesignationId)),
        search: [users.fullName, staffProfiles.employeeCode, t.reason],
        filters: { status: choiceFilter('Status', TRANSFER_STATUS, t.status), user: staffFilter(t.userId), kind: { label: 'Kind', options: opts([['promotion', 'Promotions'], ['transfer', 'Transfers']]), where: (v) => (v === 'promotion' ? sql`${t.reason} like 'Promotion%'` : v === 'transfer' ? sql`${t.reason} not like 'Promotion%'` : undefined) } },
        sorts: { effective: t.effectiveOn, staff: users.fullName },
        defaultSort: { id: 'effective', dir: 'desc' },
      },
      remove: { guard: async (ctx, id) => ((await ctx.tx.select({ st: t.status }).from(t).where(eq(t.id, id)))[0]?.st === 'applied' ? 'A transfer that took effect stays in the service record' : null) },
      actions: {
        cancel: {
          label: 'Cancel',
          tone: 'danger',
          apply: async (ctx, id) => {
            const [row] = await ctx.tx.update(t).set({ status: 'cancelled' }).where(and(eq(t.id, id), eq(t.status, 'scheduled'))).returning({ id: t.id });
            if (!row) throw new ConflictException('Only a transfer that has not started can be cancelled');
            await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: 'hr.transfer_cancelled.v1', subjectType: 'staff_transfer', subjectId: id, changes: { status: { before: 'scheduled', after: 'cancelled' } } });
          },
        },
      },
      columns: [
        { key: 'staffName', header: 'Staff member' },
        { key: 'employeeCode', header: 'Employee code' },
        { key: 'fromDepartment', header: 'From department' },
        { key: 'toDepartment', header: 'To department' },
        { key: 'fromDesignation', header: 'From designation' },
        { key: 'toDesignation', header: 'To designation' },
        { key: 'effectiveOn', header: 'Effective on' },
        { key: 'status', header: 'Status', value: (x) => labelOf(TRANSFER_STATUS, x.status) },
        { key: 'reason', header: 'Reason' },
      ],
    };
  }

  private runs(): RecordEntity {
    const r = payrollRuns;
    const sum = (col: string) => sql<number>`(select coalesce(sum(p.${sql.raw(col)}), 0)::float8 / 100 from payslips p where p.run_id = payroll_runs.id)`;
    const n = sql<number>`(select count(*)::int from payslips p where p.run_id = payroll_runs.id)`;
    return {
      key: 'payroll-runs',
      module: 'payroll',
      table: r,
      subjectType: 'payroll_run',
      roles: { read: PAYROLL_ROLES, write: PAYROLL_ROLES },
      label: (x) => `${x.month}${x.kind === 'supplementary' ? ` supplementary ${Number(x.seq) - 1}` : ''}`,
      list: {
        select: { id: r.id, month: r.month, kind: r.kind, seq: r.seq, status: r.status, version: r.version, staffCount: n, gross: sum('gross_paise'), deductions: sum('deductions_paise'), net: sum('net_paise'), cost: sum('employer_cost_paise'), note: r.note, lockedAt: r.lockedAt, publishedAt: r.publishedAt, reversalReason: r.reversalReason, createdAt: r.createdAt },
        search: [r.month, r.note],
        filters: { status: choiceFilter('Status', RUN_STATUS, r.status), kind: choiceFilter('Kind', RUN_KINDS, r.kind), fy: { label: 'Financial year', where: (v) => (/^\d{4}$/.test(v) ? sql`${r.month} between ${`${v}-04`} and ${`${Number(v) + 1}-03`}` : undefined) } },
        sorts: { month: sql`${r.month} || lpad(${r.seq}::text, 2, '0')`, created: r.createdAt },
        defaultSort: { id: 'month', dir: 'desc' },
      },
      remove: { guard: async (ctx, id) => (['draft', 'verified'].includes((await ctx.tx.select({ s: r.status }).from(r).where(eq(r.id, id)))[0]?.s ?? '') ? null : 'Only a draft run can be deleted; reverse a locked one') },
      columns: [
        { key: 'month', header: 'Month' },
        { key: 'kind', header: 'Kind', value: (x) => labelOf(RUN_KINDS, x.kind) },
        { key: 'status', header: 'Status', value: (x) => labelOf(RUN_STATUS, x.status) },
        { key: 'staffCount', header: 'Payslips' },
        { key: 'gross', header: 'Gross (₹)' },
        { key: 'deductions', header: 'Deductions (₹)' },
        { key: 'net', header: 'Net (₹)' },
        { key: 'cost', header: 'Cost to institution (₹)' },
      ],
    };
  }
}

