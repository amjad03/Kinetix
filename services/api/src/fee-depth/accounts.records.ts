import { ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { assertFyOpen } from '../books/books.service.js';
import { auditUser } from '../common/audit.js';
import { acctAccounts, acctVouchers, budgets, departments, tallySyncLog, users } from '../db/schema.js';
import { acctVoucherRequests } from '../db/schema-fee-accounts.js';
import { acctFunds } from '../db/schema-fee-depth.js';
import { FEE_ROLES } from '../fees/fees.service.js';
import { fail, lc, outcome, required } from '../import/row-helpers.js';
import { RecordRegistry, type FieldOption, type KitCtx, type RecordEntity } from '../records/entity.js';
import { copyName, OptionalText, Text, uuidEq } from '../records/helpers.js';
import { eachRow } from '../records/import.js';
import { never, opts, rowOf, rupeeField, rupeesOf } from './kit.js';

const W = FEE_ROLES;
const GROUPS = ['asset', 'liability', 'equity', 'income', 'expense'];
const FY = z.string().regex(/^\d{4}-\d{2}$/, 'Use a financial year like 2026-27');

async function departmentOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ id: departments.id, name: departments.name }).from(departments).orderBy(asc(departments.sortOrder), asc(departments.name))).map((d) => ({ value: d.id, label: d.name }));
}
async function fundOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ id: acctFunds.id, code: acctFunds.code, name: acctFunds.name }).from(acctFunds).orderBy(asc(acctFunds.sortOrder))).map((f) => ({ value: f.id, label: `${f.code} ${f.name}` }));
}

// Subqueries name the list's own table: a one-table select leaves its columns unqualified.
const entries = sql<number>`(select count(*)::int from acct_voucher_lines l where l.account_id = acct_accounts.id)`;
const balance = sql<number>`(acct_accounts.opening_paise + coalesce((select sum(l.debit_paise - l.credit_paise) from acct_voucher_lines l join acct_vouchers v on v.id = l.voucher_id where l.account_id = acct_accounts.id and v.voided_at is null), 0))::bigint`.mapWith(Number);

/** The chart of accounts: ledgers by group, cash and bank ledgers with their bank details, opening balances, manual order. */
export function ledgersEntity(): RecordEntity {
  return {
    key: 'acct-ledgers',
    module: 'accounts',
    table: acctAccounts,
    subjectType: 'acct_account',
    roles: { read: W, write: W },
    label: (r) => `${r.code} ${r.name}`,
    list: {
      select: { id: acctAccounts.id, code: acctAccounts.code, name: acctAccounts.name, groupType: acctAccounts.groupType, isCashBank: acctAccounts.isCashBank, openingRupees: rupeesOf(acctAccounts.openingPaise), bankName: acctAccounts.bankName, accountNo: acctAccounts.accountNo, ifsc: acctAccounts.ifsc, active: acctAccounts.active, sortOrder: acctAccounts.sortOrder, entries, balancePaise: balance },
      search: [acctAccounts.code, acctAccounts.name, acctAccounts.bankName],
      filters: {
        group: { label: 'Group', options: opts(GROUPS), where: (v) => (GROUPS.includes(v) ? eq(acctAccounts.groupType, v) : undefined) },
        cashBank: { label: 'Cash or bank', options: [{ value: 'yes', label: 'Cash and bank' }, { value: 'no', label: 'Other ledgers' }], where: (v) => (v === 'yes' ? eq(acctAccounts.isCashBank, true) : v === 'no' ? eq(acctAccounts.isCashBank, false) : undefined) },
        active: { label: 'Status', options: [{ value: 'yes', label: 'Active' }, { value: 'no', label: 'Switched off' }], where: (v) => (v === 'yes' ? eq(acctAccounts.active, true) : v === 'no' ? eq(acctAccounts.active, false) : undefined) },
      },
      sorts: { order: acctAccounts.sortOrder, code: acctAccounts.code, name: acctAccounts.name, group: acctAccounts.groupType, balance },
      defaultSort: { id: 'order', dir: 'asc' },
    },
    fields: {
      code: { label: 'Code', type: 'text', schema: z.string().trim().regex(/^[A-Za-z0-9._-]{1,12}$/, 'Use letters, digits or . _ - (up to 12)'), column: acctAccounts.code, required: true, edit: false },
      name: { label: 'Name', type: 'text', schema: Text(120), column: acctAccounts.name, required: true },
      groupType: { label: 'Group', type: 'select', schema: z.enum(GROUPS as [string, ...string[]]), column: acctAccounts.groupType, options: opts(GROUPS), required: true, edit: false },
      isCashBank: { label: 'Cash or bank ledger', type: 'boolean', schema: z.boolean(), column: acctAccounts.isCashBank, edit: false },
      openingRupees: rupeeField('Opening balance (₹, debit positive)', acctAccounts, acctAccounts.openingPaise, 'openingRupees', { schema: z.coerce.number().min(-10_000_000_00).max(10_000_000_00), help: 'Opening balances across the chart must add up to nothing' }),
      bankName: { label: 'Bank', type: 'text', schema: OptionalText(80), column: acctAccounts.bankName },
      accountNo: { label: 'Account number', type: 'text', schema: OptionalText(30), column: acctAccounts.accountNo },
      ifsc: { label: 'IFSC', type: 'text', schema: z.union([z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Use an IFSC like SBIN0001234'), z.literal('')]).nullable().transform((v) => v || null), column: acctAccounts.ifsc },
      active: { label: 'Active', type: 'boolean', schema: z.boolean(), column: acctAccounts.active, bulk: true, create: false },
    },
    order: { column: acctAccounts.sortOrder },
    remove: { guard: async (ctx, id) => (Number((await ctx.tx.execute<{ n: number }>(sql`select count(*)::int as n from acct_voucher_lines where account_id = ${id}::uuid`)).rows[0].n) > 0 ? 'This ledger has entries; switch it off instead' : null) },
    columns: [
      { key: 'code', header: 'Code' },
      { key: 'name', header: 'Ledger' },
      { key: 'groupType', header: 'Group' },
      { key: 'isCashBank', header: 'Cash/bank' },
      { key: 'bankName', header: 'Bank' },
      { key: 'accountNo', header: 'Account number' },
      { key: 'ifsc', header: 'IFSC' },
      { key: 'openingRupees', header: 'Opening (₹)' },
      { key: 'balancePaise', header: 'Balance (₹, debit positive)', value: (r) => Number(r.balancePaise) / 100 },
      { key: 'active', header: 'Active' },
    ],
    import: {
      columns: [
        { key: 'code', header: 'Code', required: true, example: '1020', help: 'Rows are matched on the code' },
        { key: 'name', header: 'Name', required: true, example: 'Canara Bank – Fees collection' },
        { key: 'group', header: 'Group', required: true, options: GROUPS, example: 'asset' },
        { key: 'cash_bank', header: 'Cash or bank', options: ['yes', 'no'], example: 'yes' },
        { key: 'bank', header: 'Bank', example: 'Canara Bank' },
        { key: 'account_no', header: 'Account number', example: '0412101012345' },
        { key: 'ifsc', header: 'IFSC', example: 'CNRB0000412' },
      ],
      key: ['code'],
      exists: async (ctx, r) => !!(await ctx.tx.select({ id: acctAccounts.id }).from(acctAccounts).where(eq(acctAccounts.code, r.get('code'))))[0],
      run: (ctx, rows) =>
        eachRow(ctx.tx, rows, async (tx, r) => {
          const code = required(r, 'code');
          if (!/^[A-Za-z0-9._-]{1,12}$/.test(code)) fail('Use letters, digits or . _ - (up to 12)', code);
          const group = lc(required(r, 'group'));
          if (!GROUPS.includes(group)) fail('Choose one of the listed values', group);
          const ifsc = r.get('ifsc').toUpperCase();
          if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) fail('Use an IFSC like SBIN0001234', ifsc);
          const values = { name: required(r, 'name'), bankName: r.get('bank') || null, accountNo: r.get('account_no') || null, ifsc: ifsc || null };
          const [found] = await tx.select().from(acctAccounts).where(eq(acctAccounts.code, code));
          if (!found) {
            await tx.insert(acctAccounts).values({ tenantId: ctx.p.tenantId, code, groupType: group, isCashBank: ['yes', 'y', 'true', '1'].includes(lc(r.get('cash_bank'))), sortOrder: 1_000_000, ...values });
            return outcome(true, false, [code]);
          }
          if (found.groupType !== group) fail('A ledger’s group cannot change; add a new ledger', code);
          await tx.update(acctAccounts).set(values).where(eq(acctAccounts.id, found.id));
          return outcome(false, true, [code]);
        }),
    },
  };
}

export function fundsEntity(): RecordEntity {
  return {
    key: 'acct-funds',
    module: 'accounts',
    table: acctFunds,
    subjectType: 'acct_fund',
    roles: { read: W, write: W },
    label: (r) => `${r.code} ${r.name}`,
    list: {
      select: { id: acctFunds.id, code: acctFunds.code, name: acctFunds.name, note: acctFunds.note, active: acctFunds.active, sortOrder: acctFunds.sortOrder, vouchers: sql<number>`(select count(*)::int from acct_vouchers v where v.fund_id = acct_funds.id)` },
      search: [acctFunds.code, acctFunds.name],
      filters: { active: { label: 'Status', options: [{ value: 'yes', label: 'Active' }, { value: 'no', label: 'Switched off' }], where: (v) => (v === 'yes' ? eq(acctFunds.active, true) : v === 'no' ? eq(acctFunds.active, false) : undefined) } },
      sorts: { order: acctFunds.sortOrder, code: acctFunds.code, name: acctFunds.name },
      defaultSort: { id: 'order', dir: 'asc' },
    },
    fields: {
      code: { label: 'Code', type: 'text', schema: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,12}$/, 'Codes are 2 to 12 capital letters or digits'), column: acctFunds.code, required: true, edit: false },
      name: { label: 'Name', type: 'text', schema: Text(120), column: acctFunds.name, required: true, help: 'e.g. Trust fund, College fund, Hostel fund' },
      note: { label: 'Note', type: 'textarea', schema: z.string().trim().max(500).default(''), column: acctFunds.note },
      active: { label: 'Active', type: 'boolean', schema: z.boolean(), column: acctFunds.active, bulk: true, create: false },
    },
    order: { column: acctFunds.sortOrder },
    duplicate: async (ctx, row) => {
      for (let n = 2; n < 100; n++) {
        const code = `${String(row.code).slice(0, 10)}${n}`;
        const [hit] = await ctx.tx.select({ id: acctFunds.id }).from(acctFunds).where(eq(acctFunds.code, code));
        if (!hit) return { code, name: await copyName(ctx.tx, acctFunds, acctFunds.name, String(row.name)) };
      }
      throw new ConflictException('No free code for the copy');
    },
    remove: { guard: async (ctx, id) => (Number((await ctx.tx.execute<{ n: number }>(sql`select count(*)::int as n from acct_vouchers where fund_id = ${id}::uuid`)).rows[0].n) > 0 ? 'Vouchers are kept in this fund; switch it off instead' : null) },
    columns: [
      { key: 'code', header: 'Code' },
      { key: 'name', header: 'Fund' },
      { key: 'vouchers', header: 'Vouchers' },
      { key: 'active', header: 'Active' },
      { key: 'note', header: 'Note' },
    ],
  };
}

export function vouchersEntity(): RecordEntity {
  const amount = sql<number>`(select coalesce(sum(l.debit_paise), 0) from acct_voucher_lines l where l.voucher_id = ${acctVouchers.id})::bigint`.mapWith(Number);
  return {
    key: 'acct-vouchers',
    module: 'accounts',
    table: acctVouchers,
    subjectType: 'acct_voucher',
    roles: { read: W, write: W },
    label: (r) => String(r.number),
    list: {
      select: { id: acctVouchers.id, number: acctVouchers.number, voucherType: acctVouchers.voucherType, voucherDate: acctVouchers.voucherDate, financialYear: acctVouchers.financialYear, narration: acctVouchers.narration, sourceType: acctVouchers.sourceType, amountPaise: amount, fund: acctFunds.name, department: departments.name, status: sql<string>`case when ${acctVouchers.voidedAt} is null then 'posted' else 'voided' end`, postedBy: users.fullName, tally: sql<string | null>`(select t.status from tally_sync_log t where t.kind = 'voucher' and t.ref_id = ${acctVouchers.id})` },
      joins: (q) => q.leftJoin(acctFunds, eq(acctFunds.id, acctVouchers.fundId)).leftJoin(departments, eq(departments.id, acctVouchers.departmentId)).leftJoin(users, eq(users.id, acctVouchers.postedBy)),
      search: [acctVouchers.number, acctVouchers.narration],
      filters: {
        type: { label: 'Type', options: opts(['receipt', 'payment', 'journal', 'contra']), where: (v) => eq(acctVouchers.voucherType, v) },
        year: { label: 'Year', options: async (ctx) => (await ctx.tx.selectDistinct({ fy: acctVouchers.financialYear }).from(acctVouchers).orderBy(asc(acctVouchers.financialYear))).map((y) => ({ value: y.fy, label: y.fy })), where: (v) => eq(acctVouchers.financialYear, v) },
        fund: { label: 'Fund', options: fundOptions, where: (v) => uuidEq(acctVouchers.fundId, v) },
        status: { label: 'Status', options: opts(['posted', 'voided']), where: (v) => (v === 'posted' ? sql`${acctVouchers.voidedAt} is null` : v === 'voided' ? sql`${acctVouchers.voidedAt} is not null` : undefined) },
        source: { label: 'Source', options: [{ value: 'manual', label: 'Entered by hand' }, { value: 'fee', label: 'Fee receipts' }, { value: 'reversal', label: 'Reversals' }], where: (v) => (v === 'manual' ? sql`${acctVouchers.sourceType} is null or ${acctVouchers.sourceType} = 'voucher_request'` : v === 'fee' ? sql`${acctVouchers.sourceType} in ('fee_payment', 'fee_advance')` : v === 'reversal' ? sql`${acctVouchers.sourceType} in ('cheque_bounce', 'receipt_cancel', 'fee_refund_revert')` : undefined) },
      },
      sorts: { date: acctVouchers.voucherDate, number: acctVouchers.number, amount },
      defaultSort: { id: 'date', dir: 'desc' },
      tiebreak: [acctVouchers.number],
    },
    remove: { guard: never('Vouchers are never deleted; void it instead') },
    actions: {
      void: {
        label: 'Void',
        tone: 'danger',
        apply: async (ctx, id) => {
          const v = await rowOf<typeof acctVouchers.$inferSelect>(ctx, acctVouchers, id);
          if (v.voidedAt) return 'Already voided';
          if (v.isClosing) throw new ConflictException('A year-end closing entry cannot be voided');
          if (v.sourceType && v.sourceType !== 'voucher_request') throw new ConflictException('This voucher was posted by a receipt or refund; cancel that instead');
          await assertFyOpen(ctx.tx, v.financialYear);
          await ctx.tx.update(acctVouchers).set({ voidedAt: new Date() }).where(eq(acctVouchers.id, id));
          await ctx.tx.delete(tallySyncLog).where(eq(tallySyncLog.refId, id));
          await auditUser(ctx.tx, ctx.p, 'books.voucher_voided', 'acct_voucher', id, { number: v.number });
        },
      },
    },
    columns: [
      { key: 'number', header: 'Number' },
      { key: 'voucherType', header: 'Type' },
      { key: 'voucherDate', header: 'Date' },
      { key: 'narration', header: 'Narration' },
      { key: 'amountPaise', header: 'Amount (₹)', value: (r) => Number(r.amountPaise) / 100 },
      { key: 'fund', header: 'Fund' },
      { key: 'department', header: 'Department' },
      { key: 'status', header: 'Status' },
      { key: 'tally', header: 'Tally' },
    ],
  };
}

export function voucherRequestsEntity(): RecordEntity {
  return {
    key: 'acct-voucher-requests',
    module: 'accounts',
    table: acctVoucherRequests,
    subjectType: 'acct_voucher_request',
    roles: { read: W, write: W },
    label: (r) => String(r.number),
    list: {
      select: { id: acctVoucherRequests.id, number: acctVoucherRequests.number, voucherType: acctVoucherRequests.voucherType, voucherDate: acctVoucherRequests.voucherDate, narration: acctVoucherRequests.narration, amountPaise: acctVoucherRequests.amountPaise, status: acctVoucherRequests.status, requestedBy: users.fullName, department: departments.name, budgetNote: acctVoucherRequests.budgetNote, createdAt: acctVoucherRequests.createdAt },
      joins: (q) => q.leftJoin(users, eq(users.id, acctVoucherRequests.requestedBy)).leftJoin(departments, eq(departments.id, acctVoucherRequests.departmentId)),
      search: [acctVoucherRequests.number, acctVoucherRequests.narration],
      filters: {
        status: { label: 'Status', options: opts(['pending', 'approved', 'rejected']), where: (v) => eq(acctVoucherRequests.status, v) },
        type: { label: 'Type', options: opts(['receipt', 'payment', 'journal', 'contra']), where: (v) => eq(acctVoucherRequests.voucherType, v) },
        budget: { label: 'Budget', options: [{ value: 'over', label: 'Over budget' }], where: (v) => (v === 'over' ? sql`${acctVoucherRequests.budgetNote} is not null` : undefined) },
      },
      sorts: { date: acctVoucherRequests.voucherDate, created: acctVoucherRequests.createdAt, number: acctVoucherRequests.number, amount: acctVoucherRequests.amountPaise },
      defaultSort: { id: 'created', dir: 'desc' },
    },
    remove: { guard: async (ctx, id) => ((await rowOf<{ status: string }>(ctx, acctVoucherRequests, id)).status === 'approved' ? 'An approved voucher is in the books; void the voucher instead' : null) },
    columns: [
      { key: 'number', header: 'Number' },
      { key: 'voucherType', header: 'Type' },
      { key: 'voucherDate', header: 'Date' },
      { key: 'narration', header: 'Narration' },
      { key: 'department', header: 'Department' },
      { key: 'amountPaise', header: 'Amount (₹)', value: (r) => Number(r.amountPaise) / 100 },
      { key: 'requestedBy', header: 'Entered by' },
      { key: 'status', header: 'Status' },
      { key: 'budgetNote', header: 'Budget' },
    ],
  };
}

export function budgetsEntity(): RecordEntity {
  const used = sql<number>`(
    coalesce((select sum(e.amount_paise) from cost_expenses e where e.department_id = ${budgets.departmentId} and e.spent_on between (substr(${budgets.fiscalYear}, 1, 4) || '-04-01')::date and ((substr(${budgets.fiscalYear}, 1, 4)::int + 1) || '-03-31')::date), 0)
    + coalesce((select sum(po.total_paise) from inv_purchase_orders po where po.department_id = ${budgets.departmentId} and po.status <> 'cancelled' and (po.created_at at time zone 'Asia/Kolkata')::date between (substr(${budgets.fiscalYear}, 1, 4) || '-04-01')::date and ((substr(${budgets.fiscalYear}, 1, 4)::int + 1) || '-03-31')::date), 0)
    + coalesce((select sum(l.debit_paise) from acct_vouchers v join acct_voucher_lines l on l.voucher_id = v.id join acct_accounts a on a.id = l.account_id where v.department_id = ${budgets.departmentId} and v.financial_year = ${budgets.fiscalYear} and v.voided_at is null and a.group_type = 'expense'), 0)
  )::bigint`.mapWith(Number);
  return {
    key: 'acct-budgets',
    module: 'accounts',
    table: budgets,
    subjectType: 'budget',
    roles: { read: W, write: W },
    label: (r) => `${r.department} ${r.fiscalYear}`,
    list: {
      select: { id: budgets.id, departmentId: budgets.departmentId, department: departments.name, fiscalYear: budgets.fiscalYear, amountRupees: rupeesOf(budgets.amountPaise), amountPaise: budgets.amountPaise, usedPaise: used, utilisation: sql<number>`case when ${budgets.amountPaise} > 0 then round(${used} * 100.0 / ${budgets.amountPaise}) else 0 end`.mapWith(Number), enforce: budgets.enforce, note: budgets.note },
      joins: (q) => q.innerJoin(departments, eq(departments.id, budgets.departmentId)),
      search: [departments.name, budgets.fiscalYear, budgets.note],
      filters: {
        year: { label: 'Year', options: async (ctx) => (await ctx.tx.selectDistinct({ fy: budgets.fiscalYear }).from(budgets).orderBy(asc(budgets.fiscalYear))).map((y) => ({ value: y.fy, label: y.fy })), where: (v) => eq(budgets.fiscalYear, v) },
        enforce: { label: 'Control', options: [{ value: 'warn', label: 'Warn' }, { value: 'block', label: 'Block' }, { value: 'off', label: 'Off' }], where: (v) => eq(budgets.enforce, v) },
        over: { label: 'Use', options: [{ value: 'over', label: 'Over budget' }, { value: 'near', label: '80% or more used' }], where: (v) => (v === 'over' ? sql`${used} > ${budgets.amountPaise}` : v === 'near' ? sql`${used} >= ${budgets.amountPaise} * 0.8` : undefined) },
      },
      sorts: { department: departments.name, year: budgets.fiscalYear, amount: budgets.amountPaise, used },
      defaultSort: { id: 'department', dir: 'asc' },
      tiebreak: [budgets.fiscalYear],
    },
    fields: {
      departmentId: { label: 'Department', type: 'select', schema: z.uuid(), column: budgets.departmentId, options: departmentOptions, required: true, edit: false },
      fiscalYear: { label: 'Financial year', type: 'text', schema: FY, column: budgets.fiscalYear, required: true, edit: false, help: 'April to March, e.g. 2026-27' },
      amountRupees: rupeeField('Budget (₹)', budgets, budgets.amountPaise, 'amountRupees', { required: true }),
      enforce: { label: 'When spending passes it', type: 'select', schema: z.enum(['warn', 'block', 'off']), column: budgets.enforce, options: [{ value: 'warn', label: 'Warn the approver' }, { value: 'block', label: 'Refuse the voucher' }, { value: 'off', label: 'Do nothing' }], bulk: true },
      note: { label: 'Note', type: 'text', schema: z.string().trim().max(200).default(''), column: budgets.note },
    },
    create: async (ctx, v) => {
      const [d] = await ctx.tx.select({ id: departments.id }).from(departments).where(eq(departments.id, String(v.departmentId)));
      if (!d) throw new NotFoundException('Department not found');
      const [row] = await ctx.tx.insert(budgets).values({ tenantId: ctx.p.tenantId, departmentId: String(v.departmentId), fiscalYear: String(v.fiscalYear), amountPaise: Math.round(Number(v.amountRupees ?? 0) * 100), enforce: String(v.enforce ?? 'warn'), note: String(v.note ?? '') }).returning({ id: budgets.id });
      return row.id;
    },
    duplicate: async (ctx, row) => {
      // A copy for the next financial year.
      const fy = String(row.fiscal_year);
      const start = Number(fy.slice(0, 4)) + 1;
      const next = `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
      const [hit] = await ctx.tx.select({ id: budgets.id }).from(budgets).where(and(eq(budgets.departmentId, String(row.department_id)), eq(budgets.fiscalYear, next)));
      if (hit) throw new ConflictException(`This department already has a ${next} budget`);
      return { fiscal_year: next };
    },
    columns: [
      { key: 'department', header: 'Department' },
      { key: 'fiscalYear', header: 'Year' },
      { key: 'amountRupees', header: 'Budget (₹)' },
      { key: 'usedPaise', header: 'Used (₹)', value: (r) => Number(r.usedPaise) / 100 },
      { key: 'utilisation', header: 'Used %' },
      { key: 'enforce', header: 'Control' },
      { key: 'note', header: 'Note' },
    ],
    import: {
      columns: [
        { key: 'department', header: 'Department', required: true, example: 'Commerce', options: async (ctx) => (await departmentOptions(ctx)).map((d) => d.label) },
        { key: 'fiscal_year', header: 'Financial year', required: true, example: '2026-27' },
        { key: 'amount', header: 'Budget (₹)', required: true, example: '450000' },
        { key: 'control', header: 'Control', options: ['warn', 'block', 'off'], example: 'warn' },
      ],
      key: ['department', 'fiscal_year'],
      exists: async (ctx, r) => !!(await ctx.tx.select({ id: budgets.id }).from(budgets).innerJoin(departments, eq(departments.id, budgets.departmentId)).where(and(sql`lower(${departments.name}) = ${lc(r.get('department'))}`, eq(budgets.fiscalYear, r.get('fiscal_year')))))[0],
      run: async (ctx, rows) => {
        const depts = await departmentOptions(ctx);
        return eachRow(ctx.tx, rows, async (tx, r) => {
          const d = depts.find((x) => lc(x.label) === lc(required(r, 'department')));
          if (!d) fail('No department with this name', r.get('department'));
          const fy = required(r, 'fiscal_year');
          if (!FY.safeParse(fy).success) fail('Use a financial year like 2026-27', fy);
          const amount = Number(required(r, 'amount').replace(/[₹,\s]/g, ''));
          if (!Number.isFinite(amount) || amount < 0) fail('This value is not valid', r.get('amount'));
          const control = lc(r.get('control')) || 'warn';
          if (!['warn', 'block', 'off'].includes(control)) fail('Choose one of the listed values', control);
          const [found] = await tx.select().from(budgets).where(and(eq(budgets.departmentId, d!.value), eq(budgets.fiscalYear, fy)));
          if (!found) {
            await tx.insert(budgets).values({ tenantId: ctx.p.tenantId, departmentId: d!.value, fiscalYear: fy, amountPaise: Math.round(amount * 100), enforce: control });
            return outcome(true, false, [d!.label, fy]);
          }
          await tx.update(budgets).set({ amountPaise: Math.round(amount * 100), enforce: control }).where(eq(budgets.id, found.id));
          return outcome(false, true, [d!.label, fy]);
        });
      },
    },
  };
}

@Injectable()
export class AccountsRecords implements OnModuleInit {
  constructor(private readonly registry: RecordRegistry) {}

  onModuleInit(): void {
    for (const e of [ledgersEntity(), fundsEntity(), vouchersEntity(), voucherRequestsEntity(), budgetsEntity()]) this.registry.register(e);
  }
}
