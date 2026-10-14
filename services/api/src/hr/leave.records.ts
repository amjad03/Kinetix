import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { and, asc, eq, inArray, ne, or, sql, type AnyColumn } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { audit } from '../common/audit.js';
import { zonedToInstant } from '../common/time.js';
import { attendanceRegularisations, compOffCredits } from '../db/schema-hr2.js';
import { departments, leaveRequests, leaveTypes, staffAttendance, staffProfiles, users } from '../db/schema.js';
import { fail, outcome } from '../import/row-helpers.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { texts } from '../notifications/texts.js';
import { RecordRegistry, type FieldOption, type KitCtx, type RecordEntity, type RecordField } from '../records/entity.js';
import { copyName, Text } from '../records/helpers.js';
import { eachRow } from '../records/import.js';
import { addDays } from './dates.js';
import { HR_ROLES, isHr, STAFF_ROLES } from './hr.access.js';
import { HrService } from './hr.service.js';
import { choiceFilter, DateOnly, labelOf, opts, staffDepartmentFilter, staffFilter, staffOptions } from './kit-shared.js';
import { LeaveService } from './leave.service.js';
import { workingDays } from './lop.js';

export const LEAVE_KINDS = opts([
  ['regular', 'Regular (with a balance)'],
  ['unpaid', 'Unpaid'],
  ['duty', 'Duty / on duty'],
  ['vacation', 'Vacation'],
  ['comp_off', 'Compensatory off'],
  ['maternity', 'Maternity'],
  ['paternity', 'Paternity'],
  ['study', 'Study'],
  ['special', 'Special'],
]);
const ACCRUALS = opts([
  ['yearly', 'All at the start of the year'],
  ['monthly', 'Month by month'],
]);
const GENDERS = opts([
  ['any', 'Everyone'],
  ['female', 'Women'],
  ['male', 'Men'],
]);
export const LEAVE_STATUS = opts([
  ['pending', 'Waiting'],
  ['recommended', 'Recommended'],
  ['approved', 'Approved'],
  ['rejected', 'Rejected'],
  ['cancelled', 'Cancelled'],
]);
const DECISION = opts([
  ['pending', 'Waiting'],
  ['approved', 'Approved'],
  ['rejected', 'Rejected'],
]);
export const REG_KINDS = opts([
  ['missed_punch', 'Missed punch'],
  ['late_arrival', 'Late arrival on work'],
  ['early_departure', 'Left early on work'],
  ['on_duty', 'On duty outside'],
  ['work_from_home', 'Worked from home'],
  ['other', 'Other'],
]);
const REQ_STATUS = opts([
  ['present', 'Present'],
  ['half_day', 'Half day'],
]);
const TIME = z
  .union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 09:15'), z.literal(''), z.null()])
  .transform((v) => (v ? v : null));
const sel = (o: FieldOption[]) => z.enum(o.map((x) => x.value) as [string, ...string[]]);
const Days = z.coerce.number().min(0).max(366).multipleOf(0.5);
const OptDays = z.union([z.coerce.number().min(0.5).max(366).multipleOf(0.5), z.literal(''), z.null()]).transform((v) => (v === '' || v === null ? null : v));
const Bool = z.coerce.boolean();

const decider = alias(users, 'decider');

async function typeOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx.select({ id: leaveTypes.id, name: leaveTypes.name, code: leaveTypes.code }).from(leaveTypes).where(eq(leaveTypes.active, true)).orderBy(asc(leaveTypes.sortOrder), asc(leaveTypes.code));
  return rows.map((r) => ({ value: r.id, label: `${r.name} (${r.code})` }));
}

/** Colleagues who can be handed approvals while someone is away. */
async function colleagueOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx.select({ id: users.id, name: users.fullName }).from(staffProfiles).innerJoin(users, eq(users.id, staffProfiles.userId)).where(and(ne(staffProfiles.status, 'exited'), eq(users.status, 'active'))).orderBy(asc(users.fullName));
  return rows.map((r) => ({ value: r.id, label: r.name }));
}

/** HR sees everything; a head of department their department's staff and themselves; anyone else only their own. */
const deptScope = (col: AnyColumn) => (ctx: KitCtx) => {
  if (isHr(ctx.p)) return undefined;
  if (ctx.p.roles.includes('hod'))
    return or(
      eq(col, ctx.p.userId),
      sql`${col} in (select sp.user_id from staff_profiles sp join departments d on d.id = sp.department_id where d.head_user_id = ${ctx.p.userId}::uuid union select ds.user_id from department_staff ds join departments d on d.id = ds.department_id where d.head_user_id = ${ctx.p.userId}::uuid)`,
    );
  return eq(col, ctx.p.userId);
};

/** True when the person heads a department of the staff member. */
async function heads(ctx: KitCtx, staffId: string) {
  const r = await ctx.tx.execute(sql`select 1 from departments d where d.head_user_id = ${ctx.p.userId}::uuid and (d.id in (select department_id from staff_profiles where user_id = ${staffId}::uuid) or d.id in (select department_id from department_staff where user_id = ${staffId}::uuid)) limit 1`);
  return r.rows.length > 0;
}

/** Fields of a request that can change only while it waits for a decision (and never by the decider's colleagues). */
function pendingField(table: typeof compOffCredits | typeof attendanceRegularisations, prop: string, f: Omit<RecordField, 'apply' | 'column'>): RecordField {
  return {
    ...f,
    apply: async (ctx, id, v) => {
      const [r] = await ctx.tx.select({ status: table.status, userId: table.userId }).from(table).where(eq(table.id, id));
      if (r?.status !== 'pending') throw new ConflictException('Only a request waiting for a decision can be changed');
      if (r.userId !== ctx.p.userId && !isHr(ctx.p)) throw new ForbiddenException('You can change your own requests only');
      await ctx.tx.update(table).set({ [prop]: v }).where(eq(table.id, id));
    },
  };
}

@Injectable()
export class LeaveRecords implements OnModuleInit {
  constructor(
    private readonly registry: RecordRegistry,
    private readonly leave: LeaveService,
    private readonly hr: HrService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    for (const e of [this.types(), this.requests(), this.compOff(), this.regularisations()]) this.registry.register(e);
  }

  // ---- leave types --------------------------------------------------------------------------------------------

  private types(): RecordEntity {
    const t = leaveTypes;
    return {
      key: 'leave-types',
      module: 'hr',
      table: t,
      subjectType: 'leave_type',
      roles: { read: [...STAFF_ROLES], write: HR_ROLES },
      label: (r) => `${r.name} (${r.code})`,
      list: {
        select: { id: t.id, code: t.code, name: t.name, kind: t.kind, paid: t.paid, annualDays: t.annualDays, accrual: t.accrual, carryForwardMax: t.carryForwardMax, encashable: t.encashable, maxPerRequest: t.maxPerRequest, minNoticeDays: t.minNoticeDays, requiresDocument: t.requiresDocument, gender: t.gender, countsHolidays: t.countsHolidays, halfDayAllowed: t.halfDayAllowed, validDays: t.validDays, active: t.active, sortOrder: t.sortOrder },
        search: [t.code, t.name],
        filters: { kind: choiceFilter('Kind', LEAVE_KINDS, t.kind), active: { label: 'In use', options: opts([['yes', 'In use'], ['no', 'Retired']]), where: (v) => (v === 'yes' ? eq(t.active, true) : v === 'no' ? eq(t.active, false) : undefined) } },
        sorts: { code: t.code, name: t.name, days: t.annualDays },
        defaultSort: { id: 'code', dir: 'asc' },
      },
      fields: {
        code: { label: 'Code', type: 'text', schema: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{1,10}$/, 'Use up to 10 letters or digits'), column: t.code, required: true },
        name: { label: 'Name', type: 'text', schema: Text(60), column: t.name, required: true },
        kind: { label: 'Kind', type: 'select', schema: sel(LEAVE_KINDS), column: t.kind, options: LEAVE_KINDS, required: true },
        paid: { label: 'Paid', type: 'boolean', schema: Bool, column: t.paid, bulk: true },
        annualDays: { label: 'Days a year', type: 'number', schema: Days, column: t.annualDays, required: true },
        accrual: { label: 'Accrual', type: 'select', schema: sel(ACCRUALS), column: t.accrual, options: ACCRUALS, required: true, bulk: true },
        carryForwardMax: { label: 'Carry forward up to (days)', type: 'number', schema: Days, column: t.carryForwardMax, bulk: true },
        encashable: { label: 'Can be encashed', type: 'boolean', schema: Bool, column: t.encashable, bulk: true },
        maxPerRequest: { label: 'Most days at a time', type: 'number', schema: OptDays, column: t.maxPerRequest, bulk: true, help: 'Empty: no limit' },
        minNoticeDays: { label: 'Apply this many days ahead', type: 'number', schema: z.coerce.number().int().min(0).max(90), column: t.minNoticeDays, bulk: true },
        requiresDocument: { label: 'Needs a supporting document', type: 'boolean', schema: Bool, column: t.requiresDocument, bulk: true, help: 'For requests longer than 2 days (a medical certificate)' },
        gender: { label: 'For', type: 'select', schema: sel(GENDERS), column: t.gender, options: GENDERS, bulk: true },
        countsHolidays: { label: 'Count holidays inside the leave', type: 'boolean', schema: Bool, column: t.countsHolidays, bulk: true, help: 'The sandwich rule' },
        halfDayAllowed: { label: 'Half days allowed', type: 'boolean', schema: Bool, column: t.halfDayAllowed, bulk: true },
        validDays: { label: 'Credit valid for (days)', type: 'number', schema: z.coerce.number().int().min(1).max(366), column: t.validDays, help: 'Compensatory off only' },
        active: { label: 'In use', type: 'boolean', schema: Bool, column: t.active, bulk: true },
      },
      order: { column: t.sortOrder },
      duplicate: async (ctx, row) => {
        const base = String(row.code).slice(0, 7);
        for (let n = 2; n < 100; n++) {
          const code = `${base}${n}`;
          const [hit] = await ctx.tx.select({ id: t.id }).from(t).where(eq(t.code, code));
          if (!hit) return { code, name: await copyName(ctx.tx, t, t.name, String(row.name)) };
        }
        throw new ConflictException('No free code for the copy');
      },
      remove: {
        guard: async (ctx, id) => {
          const [used] = await ctx.tx.select({ id: leaveRequests.id }).from(leaveRequests).where(eq(leaveRequests.leaveTypeId, id)).limit(1);
          return used ? 'Leave has been taken under this type: mark it not in use instead' : null;
        },
      },
      columns: [
        { key: 'code', header: 'Code' },
        { key: 'name', header: 'Name' },
        { key: 'kind', header: 'Kind', value: (r) => labelOf(LEAVE_KINDS, r.kind) },
        { key: 'paid', header: 'Paid', value: (r) => (r.paid ? 'Yes' : 'No') },
        { key: 'annualDays', header: 'Days a year' },
        { key: 'accrual', header: 'Accrual', value: (r) => labelOf(ACCRUALS, r.accrual) },
        { key: 'carryForwardMax', header: 'Carry forward' },
        { key: 'encashable', header: 'Encashable', value: (r) => (r.encashable ? 'Yes' : 'No') },
        { key: 'maxPerRequest', header: 'Most at a time' },
        { key: 'minNoticeDays', header: 'Notice (days)' },
        { key: 'gender', header: 'For', value: (r) => labelOf(GENDERS, r.gender) },
        { key: 'active', header: 'In use', value: (r) => (r.active ? 'Yes' : 'No') },
      ],
      import: {
        columns: [
          { key: 'code', header: 'Code', required: true, help: 'Rows are matched on the code', example: 'SPL' },
          { key: 'name', header: 'Name', required: true, example: 'Special casual leave' },
          { key: 'kind', header: 'Kind', options: LEAVE_KINDS.map((k) => k.value), example: 'special' },
          { key: 'paid', header: 'Paid', options: ['yes', 'no'], example: 'yes' },
          { key: 'annual_days', header: 'Days a year', example: '5' },
          { key: 'accrual', header: 'Accrual', options: ['yearly', 'monthly'], example: 'yearly' },
          { key: 'carry_forward', header: 'Carry forward up to', example: '0' },
        ],
        key: ['code'],
        exists: async (ctx, r) => !!(await ctx.tx.select({ id: t.id }).from(t).where(eq(t.code, r.get('code').toUpperCase())))[0],
        run: (ctx, rows) =>
          eachRow(ctx.tx, rows, async (tx, r) => {
            const code = r.get('code').toUpperCase();
            if (!/^[A-Z0-9_]{1,10}$/.test(code)) fail('This value is not valid', code || '(empty)');
            const name = r.get('name') || fail('This value is required', 'name');
            const kind = r.get('kind') || 'regular';
            if (!LEAVE_KINDS.some((k) => k.value === kind)) fail('Choose one of the listed values', kind);
            const num = (k: string, d: number) => {
              const v = r.get(k);
              if (!v) return d;
              const n = Number(v);
              if (!Number.isFinite(n) || n < 0 || n > 366) fail('This value is not valid', v);
              return n;
            };
            const values = { name, kind, paid: !/^(no|n|false|0)$/i.test(r.get('paid')), annualDays: num('annual_days', 0), accrual: r.get('accrual') === 'monthly' ? 'monthly' : 'yearly', carryForwardMax: num('carry_forward', 0) };
            const [found] = await tx.select().from(t).where(eq(t.code, code));
            if (!found) {
              await tx.insert(t).values({ tenantId: ctx.p.tenantId, code, ...values, sortOrder: 1_000_000 });
              return outcome(true, false, [code, name]);
            }
            await tx.update(t).set(values).where(eq(t.id, found.id));
            return outcome(false, true, [code, name]);
          }),
      },
    };
  }

  // ---- leave requests ----------------------------------------------------------------------------------------

  private requests(): RecordEntity {
    const r = leaveRequests;
    const lt = leaveTypes;
    const Note = z.object({ note: z.string().trim().max(500).optional() });
    return {
      key: 'leave-requests',
      module: 'hr',
      table: r,
      subjectType: 'leave_request',
      roles: { read: [...STAFF_ROLES], write: [...STAFF_ROLES] },
      label: (x) => `${x.staffName ?? ''} · ${x.typeCode ?? ''} ${x.fromDate ?? ''}${x.toDate && x.toDate !== x.fromDate ? ` to ${x.toDate}` : ''}`,
      list: {
        select: {
          id: r.id,
          userId: r.userId,
          staffName: users.fullName,
          employeeCode: staffProfiles.employeeCode,
          departmentName: departments.name,
          leaveTypeId: r.leaveTypeId,
          typeCode: lt.code,
          typeName: lt.name,
          paid: lt.paid,
          fromDate: r.fromDate,
          toDate: r.toDate,
          halfDay: r.halfDay,
          days: r.days,
          reason: r.reason,
          status: r.status,
          decidedByName: decider.fullName,
          decidedAt: r.decidedAt,
          decisionNote: r.decisionNote,
          hasDocument: sql<boolean>`(${r.documentKey} is not null)`,
          delegateId: r.delegateId,
          appliedBy: r.appliedBy,
          revokedReason: r.revokedReason,
          createdAt: r.createdAt,
        },
        joins: (q) => q.innerJoin(users, eq(users.id, r.userId)).innerJoin(lt, eq(lt.id, r.leaveTypeId)).leftJoin(staffProfiles, eq(staffProfiles.userId, r.userId)).leftJoin(departments, eq(departments.id, staffProfiles.departmentId)).leftJoin(decider, eq(decider.id, r.decidedBy)),
        search: [users.fullName, staffProfiles.employeeCode, r.reason, lt.code, lt.name],
        scope: deptScope(r.userId),
        filters: {
          status: { label: 'Status', options: [{ value: 'open', label: 'Waiting for a decision' }, ...LEAVE_STATUS], where: (v) => (v === 'open' ? inArray(r.status, ['pending', 'recommended']) : LEAVE_STATUS.some((s) => s.value === v) ? eq(r.status, v) : undefined) },
          type: { label: 'Leave type', options: typeOptions, where: (v) => (z.uuid().safeParse(v).success ? eq(r.leaveTypeId, v) : undefined) },
          user: staffFilter(r.userId),
          department: staffDepartmentFilter(r.userId),
          month: { label: 'Month', where: (v) => (/^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? sql`${r.fromDate} <= (date_trunc('month', ${`${v}-01`}::date) + interval '1 month - 1 day')::date and ${r.toDate} >= ${`${v}-01`}::date` : undefined) },
          mine: { label: 'Whose', options: opts([['me', 'My own']]), where: (v, ctx) => (v === 'me' ? eq(r.userId, ctx.p.userId) : undefined) },
        },
        sorts: { from: r.fromDate, applied: r.createdAt, staff: users.fullName, days: r.days, status: r.status },
        defaultSort: { id: 'applied', dir: 'desc' },
      },
      fields: {
        userId: { label: 'Staff member', type: 'select', schema: z.union([z.uuid(), z.literal(''), z.null()]).transform((v) => v || null), options: staffOptions, edit: false, help: 'HR only: apply on their behalf. Leave empty for yourself' },
        leaveTypeId: { label: 'Leave type', type: 'select', schema: z.uuid(), options: typeOptions, required: true, edit: false },
        fromDate: { label: 'From', type: 'date', schema: DateOnly, required: true, edit: false },
        toDate: { label: 'To', type: 'date', schema: DateOnly, required: true, edit: false },
        halfDay: { label: 'Half day', type: 'boolean', schema: Bool, edit: false },
        reason: { label: 'Reason', type: 'textarea', schema: z.string().trim().max(500).default(''), edit: false },
        delegateId: { label: 'Approvals handled by', type: 'select', schema: z.union([z.uuid(), z.literal(''), z.null()]).transform((v) => v || null), options: colleagueOptions, edit: false, help: 'A colleague who decides requests in your place while you are away' },
      },
      create: async (ctx, v) => {
        const res = await this.leave.apply(ctx.tx, ctx.p, {
          leaveTypeId: String(v.leaveTypeId),
          fromDate: String(v.fromDate),
          toDate: String(v.toDate),
          halfDay: !!v.halfDay,
          reason: String(v.reason ?? ''),
          userId: (v.userId as string | null) ?? undefined,
          delegateId: (v.delegateId as string | null) ?? null,
        });
        return res.id;
      },
      remove: {
        guard: async (ctx, id) => {
          const [x] = await ctx.tx.select({ status: r.status, userId: r.userId }).from(r).where(eq(r.id, id));
          if (x && ['pending', 'recommended', 'approved'].includes(x.status)) return 'Cancel or withdraw the leave before deleting it';
          if (x && !isHr(ctx.p)) return 'Only HR can delete leave records';
          return null;
        },
      },
      actions: {
        approve: { label: 'Approve', roles: [...STAFF_ROLES], params: Note, apply: async (ctx, id, p) => void (await this.leave.decide(ctx.tx, ctx.p, id, 'approved', (p as z.infer<typeof Note>)?.note ?? null)) },
        reject: { label: 'Reject', roles: [...STAFF_ROLES], tone: 'danger', params: Note, apply: async (ctx, id, p) => void (await this.leave.decide(ctx.tx, ctx.p, id, 'rejected', (p as z.infer<typeof Note>)?.note ?? null)) },
        cancel: {
          label: 'Cancel my leave',
          roles: [...STAFF_ROLES],
          apply: async (ctx, id) => void (await this.leave.cancel(ctx.tx, ctx.p, id)),
        },
        revoke: { label: 'Withdraw approved leave', roles: HR_ROLES, tone: 'danger', params: z.object({ reason: z.string().trim().min(3, 'Give a reason').max(500) }), apply: async (ctx, id, p) => void (await this.leave.revoke(ctx.tx, ctx.p, id, (p as { reason: string }).reason)) },
        arrange: {
          label: 'Arrange substitutes',
          roles: [...HR_ROLES, 'hod'],
          apply: async (ctx, id) => {
            const res = await this.leave.arrangeSubstitutes(ctx.tx, ctx.p, id);
            return `${res.assigned.length} periods covered${res.uncovered.length ? `, ${res.uncovered.length} without a free teacher` : ''}`;
          },
        },
      },
      columns: [
        { key: 'staffName', header: 'Staff member' },
        { key: 'employeeCode', header: 'Employee code' },
        { key: 'departmentName', header: 'Department' },
        { key: 'typeCode', header: 'Leave' },
        { key: 'fromDate', header: 'From' },
        { key: 'toDate', header: 'To' },
        { key: 'days', header: 'Days' },
        { key: 'reason', header: 'Reason' },
        { key: 'status', header: 'Status', value: (x) => labelOf(LEAVE_STATUS, x.status) },
        { key: 'decidedByName', header: 'Decided by' },
        { key: 'decisionNote', header: 'Note' },
      ],
    };
  }

  // ---- compensatory off -------------------------------------------------------------------------------------

  private async decideOwn(ctx: KitCtx, staffId: string) {
    if (staffId === ctx.p.userId) throw new ForbiddenException('Someone else must decide your own request');
    if (!isHr(ctx.p) && !(await heads(ctx, staffId))) throw new ForbiddenException('Only HR or the head of their department can decide this');
  }

  private compOff(): RecordEntity {
    const c = compOffCredits;
    const Note = z.object({ note: z.string().trim().max(500).optional() });
    const decide = (approve: boolean) => async (ctx: KitCtx, id: string, p: unknown) => {
      const [x] = await ctx.tx.select().from(c).where(eq(c.id, id)).for('update');
      if (!x) throw new NotFoundException('Not found');
      if (x.status !== 'pending') throw new ConflictException(`This request is already ${x.status}`);
      await this.decideOwn(ctx, x.userId);
      const note = (p as z.infer<typeof Note> | undefined)?.note ?? null;
      if (!approve && !note) throw new BadRequestException('Give a reason for rejecting');
      const status = approve ? 'approved' : 'rejected';
      await ctx.tx.update(c).set({ status, decidedBy: ctx.p.userId, decidedAt: new Date(), decisionNote: note }).where(eq(c.id, id));
      await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: `comp_off_credit.${status}`, subjectType: 'comp_off_credit', subjectId: id, changes: { status: { before: 'pending', after: status } }, data: { note } });
      await this.notifications.notifyUsers(ctx.tx, [x.userId], { kind: 'leave', text: texts.hrRequestDecided({ what: 'compoff', approved: approve, detail: `${x.workedOn} · ${x.days}` }), data: { compOffId: id }, dedupeKey: `compoff:${id}` });
    };
    return {
      key: 'comp-off-credits',
      module: 'hr',
      table: c,
      subjectType: 'comp_off_credit',
      roles: { read: [...STAFF_ROLES], write: [...STAFF_ROLES] },
      label: (x) => `${x.staffName ?? ''} · ${x.workedOn ?? ''}`,
      list: {
        select: { id: c.id, userId: c.userId, staffName: users.fullName, employeeCode: staffProfiles.employeeCode, departmentName: departments.name, workedOn: c.workedOn, days: c.days, reason: c.reason, status: c.status, expiresOn: c.expiresOn, decidedByName: decider.fullName, decisionNote: c.decisionNote, createdAt: c.createdAt },
        joins: (q) => q.innerJoin(users, eq(users.id, c.userId)).leftJoin(staffProfiles, eq(staffProfiles.userId, c.userId)).leftJoin(departments, eq(departments.id, staffProfiles.departmentId)).leftJoin(decider, eq(decider.id, c.decidedBy)),
        search: [users.fullName, staffProfiles.employeeCode, c.reason],
        scope: deptScope(c.userId),
        filters: {
          status: choiceFilter('Status', DECISION, c.status),
          user: staffFilter(c.userId),
          department: staffDepartmentFilter(c.userId),
          validity: { label: 'Validity', options: opts([['valid', 'Still valid'], ['expired', 'Expired']]), where: (v) => (v === 'valid' ? sql`${c.expiresOn} >= current_date` : v === 'expired' ? sql`${c.expiresOn} < current_date` : undefined) },
        },
        sorts: { worked: c.workedOn, staff: users.fullName, expires: c.expiresOn, applied: c.createdAt },
        defaultSort: { id: 'worked', dir: 'desc' },
      },
      fields: {
        userId: { label: 'Staff member', type: 'select', schema: z.union([z.uuid(), z.literal(''), z.null()]).transform((v) => v || null), options: staffOptions, edit: false, help: 'Leave empty for yourself' },
        workedOn: { label: 'Worked on', type: 'date', schema: DateOnly, required: true, edit: false, help: 'A weekly off or holiday' },
        days: pendingField(c, 'days', { label: 'Days earned', type: 'select', schema: z.coerce.number().refine((n) => n === 0.5 || n === 1, 'Half a day or one day'), options: opts([['1', 'One day'], ['0.5', 'Half a day']]), required: true }),
        reason: pendingField(c, 'reason', { label: 'Work done', type: 'textarea', schema: Text(500), required: true }),
      },
      create: async (ctx, v) => {
        const userId = (isHr(ctx.p) && (v.userId as string | null)) || ctx.p.userId;
        if (!(await this.hr.isStaff(ctx.tx, userId))) throw new NotFoundException('Staff member not found');
        const workedOn = String(v.workedOn);
        const today = await this.hr.today(ctx.tx);
        if (workedOn > today) throw new BadRequestException('Compensatory off is claimed after the day is worked');
        const settings = await this.hr.settings(ctx.tx, ctx.p.tenantId);
        const holidays = new Set((await this.hr.holidayDates(ctx.tx, workedOn, workedOn)).map((h) => h.date));
        if (workingDays(workedOn, workedOn, settings.weeklyOffs, holidays) > 0) throw new BadRequestException('That day is a working day: compensatory off is earned on a weekly off or holiday');
        const [type] = await ctx.tx.select({ validDays: leaveTypes.validDays }).from(leaveTypes).where(and(eq(leaveTypes.kind, 'comp_off'), eq(leaveTypes.active, true))).limit(1);
        if (!type) throw new ConflictException('Add a compensatory off leave type first');
        const [dup] = await ctx.tx.select({ id: c.id }).from(c).where(and(eq(c.userId, userId), eq(c.workedOn, workedOn), ne(c.status, 'rejected')));
        if (dup) throw new ConflictException('Compensatory off for that day is already claimed');
        const [row] = await ctx.tx.insert(c).values({ tenantId: ctx.p.tenantId, userId, workedOn, days: Number(v.days), reason: String(v.reason), expiresOn: addDays(workedOn, type.validDays), createdBy: ctx.p.userId }).returning({ id: c.id });
        return row.id;
      },
      remove: {
        guard: async (ctx, id) => {
          const [x] = await ctx.tx.select({ status: c.status, userId: c.userId }).from(c).where(eq(c.id, id));
          if (x?.status === 'approved' && !isHr(ctx.p)) return 'An approved credit can be removed only by HR';
          return null;
        },
      },
      actions: {
        approve: { label: 'Approve', roles: [...HR_ROLES, 'hod'], apply: decide(true) },
        reject: { label: 'Reject', roles: [...HR_ROLES, 'hod'], tone: 'danger', params: Note, apply: decide(false) },
      },
      columns: [
        { key: 'staffName', header: 'Staff member' },
        { key: 'employeeCode', header: 'Employee code' },
        { key: 'workedOn', header: 'Worked on' },
        { key: 'days', header: 'Days' },
        { key: 'reason', header: 'Work done' },
        { key: 'status', header: 'Status', value: (x) => labelOf(DECISION, x.status) },
        { key: 'expiresOn', header: 'Use by' },
        { key: 'decidedByName', header: 'Decided by' },
      ],
    };
  }

  // ---- attendance regularisation ------------------------------------------------------------------------------

  private regularisations(): RecordEntity {
    const g = attendanceRegularisations;
    const Note = z.object({ note: z.string().trim().max(500).optional() });
    const decide = (approve: boolean) => async (ctx: KitCtx, id: string, p: unknown) => {
      const [x] = await ctx.tx.select().from(g).where(eq(g.id, id)).for('update');
      if (!x) throw new NotFoundException('Not found');
      if (x.status !== 'pending') throw new ConflictException(`This request is already ${x.status}`);
      await this.decideOwn(ctx, x.userId);
      const note = (p as z.infer<typeof Note> | undefined)?.note ?? null;
      if (!approve && !note) throw new BadRequestException('Give a reason for rejecting');
      const status = approve ? 'approved' : 'rejected';
      if (approve) {
        await this.hr.assertMonthOpen(ctx.tx, x.date);
        const tz = await this.hr.timezone(ctx.tx);
        const at = (t: string | null) => (t ? zonedToInstant(x.date, `${t}:00`, tz) : null);
        const [before] = await ctx.tx.select().from(staffAttendance).where(and(eq(staffAttendance.userId, x.userId), eq(staffAttendance.date, x.date)));
        const patch = {
          status: x.requestedStatus,
          regularised: true,
          note: `Regularised: ${labelOf(REG_KINDS, x.kind)}`,
          markedBy: ctx.p.userId,
          lateMinutes: x.kind === 'late_arrival' ? 0 : (before?.lateMinutes ?? null),
          earlyMinutes: x.kind === 'early_departure' ? 0 : (before?.earlyMinutes ?? null),
          ...(x.inTime ? { checkInAt: at(x.inTime) } : {}),
          ...(x.outTime ? { checkOutAt: at(x.outTime) } : {}),
        };
        await ctx.tx
          .insert(staffAttendance)
          .values({ tenantId: ctx.p.tenantId, userId: x.userId, date: x.date, source: 'manual', ...patch })
          .onConflictDoUpdate({ target: [staffAttendance.userId, staffAttendance.date], set: { ...patch, source: 'manual', updatedAt: new Date() } });
      }
      await ctx.tx.update(g).set({ status, decidedBy: ctx.p.userId, decidedAt: new Date(), decisionNote: note }).where(eq(g.id, id));
      await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: `attendance_regularisation.${status}`, subjectType: 'attendance_regularisation', subjectId: id, changes: { status: { before: 'pending', after: status } }, data: { note, date: x.date } });
      await this.notifications.notifyUsers(ctx.tx, [x.userId], { kind: 'leave', text: texts.hrRequestDecided({ what: 'regularisation', approved: approve, detail: x.date }), data: { regularisationId: id }, dedupeKey: `reg:${id}` });
    };
    return {
      key: 'attendance-regularisations',
      module: 'hr',
      table: g,
      subjectType: 'attendance_regularisation',
      roles: { read: [...STAFF_ROLES], write: [...STAFF_ROLES] },
      label: (x) => `${x.staffName ?? ''} · ${x.date ?? ''}`,
      list: {
        select: {
          id: g.id,
          userId: g.userId,
          staffName: users.fullName,
          employeeCode: staffProfiles.employeeCode,
          departmentName: departments.name,
          date: g.date,
          kind: g.kind,
          inTime: g.inTime,
          outTime: g.outTime,
          requestedStatus: g.requestedStatus,
          reason: g.reason,
          status: g.status,
          markedStatus: sql<string | null>`(select a.status from staff_attendance a where a.user_id = ${g.userId} and a.date = ${g.date})`,
          decidedByName: decider.fullName,
          decisionNote: g.decisionNote,
          createdAt: g.createdAt,
        },
        joins: (q) => q.innerJoin(users, eq(users.id, g.userId)).leftJoin(staffProfiles, eq(staffProfiles.userId, g.userId)).leftJoin(departments, eq(departments.id, staffProfiles.departmentId)).leftJoin(decider, eq(decider.id, g.decidedBy)),
        search: [users.fullName, staffProfiles.employeeCode, g.reason],
        scope: deptScope(g.userId),
        filters: {
          status: choiceFilter('Status', DECISION, g.status),
          kind: choiceFilter('Kind', REG_KINDS, g.kind),
          user: staffFilter(g.userId),
          department: staffDepartmentFilter(g.userId),
          month: { label: 'Month', where: (v) => (/^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? sql`to_char(${g.date}, 'YYYY-MM') = ${v}` : undefined) },
        },
        sorts: { date: g.date, staff: users.fullName, applied: g.createdAt },
        defaultSort: { id: 'date', dir: 'desc' },
      },
      fields: {
        userId: { label: 'Staff member', type: 'select', schema: z.union([z.uuid(), z.literal(''), z.null()]).transform((v) => v || null), options: staffOptions, edit: false, help: 'Leave empty for yourself' },
        date: { label: 'Date', type: 'date', schema: DateOnly, required: true, edit: false },
        kind: pendingField(g, 'kind', { label: 'What happened', type: 'select', schema: sel(REG_KINDS), options: REG_KINDS, required: true }),
        inTime: pendingField(g, 'inTime', { label: 'In at', type: 'text', schema: TIME, help: 'HH:MM, 24-hour' }),
        outTime: pendingField(g, 'outTime', { label: 'Out at', type: 'text', schema: TIME, help: 'HH:MM, 24-hour' }),
        requestedStatus: pendingField(g, 'requestedStatus', { label: 'Mark the day as', type: 'select', schema: sel(REQ_STATUS), options: REQ_STATUS, required: true }),
        reason: pendingField(g, 'reason', { label: 'Reason', type: 'textarea', schema: Text(500), required: true }),
      },
      create: async (ctx, v) => {
        const userId = (isHr(ctx.p) && (v.userId as string | null)) || ctx.p.userId;
        if (!(await this.hr.isStaff(ctx.tx, userId))) throw new NotFoundException('Staff member not found');
        const date = String(v.date);
        const today = await this.hr.today(ctx.tx);
        if (date > today) throw new BadRequestException('Attendance can be corrected only for a day that has passed or today');
        if (date < addDays(today, -45)) throw new BadRequestException('Corrections older than 45 days are not accepted');
        await this.hr.assertMonthOpen(ctx.tx, date);
        if (v.inTime && v.outTime && String(v.outTime) <= String(v.inTime)) throw new BadRequestException('The out time is before the in time');
        const [dup] = await ctx.tx.select({ id: g.id }).from(g).where(and(eq(g.userId, userId), eq(g.date, date), eq(g.status, 'pending')));
        if (dup) throw new ConflictException('A correction for that day is already waiting');
        const [row] = await ctx.tx
          .insert(g)
          .values({ tenantId: ctx.p.tenantId, userId, date, kind: String(v.kind), inTime: (v.inTime as string | null) ?? null, outTime: (v.outTime as string | null) ?? null, requestedStatus: String(v.requestedStatus ?? 'present'), reason: String(v.reason), createdBy: ctx.p.userId })
          .returning({ id: g.id });
        return row.id;
      },
      remove: {
        guard: async (ctx, id) => {
          const [x] = await ctx.tx.select({ status: g.status }).from(g).where(eq(g.id, id));
          if (x?.status === 'approved' && !isHr(ctx.p)) return 'An approved correction can be removed only by HR';
          return null;
        },
      },
      actions: {
        approve: { label: 'Approve', roles: [...HR_ROLES, 'hod'], apply: decide(true) },
        reject: { label: 'Reject', roles: [...HR_ROLES, 'hod'], tone: 'danger', params: Note, apply: decide(false) },
      },
      columns: [
        { key: 'staffName', header: 'Staff member' },
        { key: 'employeeCode', header: 'Employee code' },
        { key: 'date', header: 'Date' },
        { key: 'kind', header: 'What happened', value: (x) => labelOf(REG_KINDS, x.kind) },
        { key: 'inTime', header: 'In' },
        { key: 'outTime', header: 'Out' },
        { key: 'requestedStatus', header: 'Mark as', value: (x) => labelOf(REQ_STATUS, x.requestedStatus) },
        { key: 'reason', header: 'Reason' },
        { key: 'status', header: 'Status', value: (x) => labelOf(DECISION, x.status) },
        { key: 'decidedByName', header: 'Decided by' },
      ],
    };
  }
}

