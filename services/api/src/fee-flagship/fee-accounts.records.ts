import { ConflictException, Injectable, OnModuleInit } from '@nestjs/common';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { acctAccounts } from '../db/schema.js';
import { acctFunds } from '../db/schema-fee-depth.js';
import { feeAccounts } from '../db/schema-fee-flagship.js';
import { FEE_ROLES } from '../fees/fees.service.js';
import { VPA } from '../fees/upi.js';
import { RecordRegistry, type FieldOption, type KitCtx, type RecordEntity } from '../records/entity.js';
import { copyName, OptionalText, Text, uuidEq } from '../records/helpers.js';

const KINDS = ['trust', 'institution', 'hostel', 'transport', 'other'];
const ADMIN: typeof FEE_ROLES = ['principal', 'tenant_admin'];

async function fundOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ id: acctFunds.id, code: acctFunds.code, name: acctFunds.name }).from(acctFunds).orderBy(asc(acctFunds.sortOrder))).map((f) => ({ value: f.id, label: `${f.code} ${f.name}` }));
}
async function moneyOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ id: acctAccounts.id, code: acctAccounts.code, name: acctAccounts.name }).from(acctAccounts).where(eq(acctAccounts.isCashBank, true)).orderBy(asc(acctAccounts.code))).map((a) => ({ value: a.id, label: `${a.code} ${a.name}` }));
}

/** Only one default account: making one the default takes it from the others. */
async function onlyDefault(ctx: KitCtx, id: string, value: unknown) {
  if (value === true) await ctx.tx.update(feeAccounts).set({ isDefault: false }).where(and(eq(feeAccounts.isDefault, true), ne(feeAccounts.id, id)));
  await ctx.tx.update(feeAccounts).set({ isDefault: value === true }).where(eq(feeAccounts.id, id));
}

/**
 * Fee accounts (Accounts → Fee accounts): each collecting entity with its receipt series, books (fund), bank and cash
 * ledgers, UPI id, PAN, GSTIN and 80G registration, and Tally company. The office reads them; the principal and the
 * institution's administrator change them.
 */
export function feeAccountsEntity(): RecordEntity {
  const invoices = sql<number>`(select count(*)::int from fee_invoices i where i.fee_account_id = fee_accounts.id)`;
  return {
    key: 'fee-accounts',
    module: 'accounts',
    table: feeAccounts,
    subjectType: 'fee_account',
    roles: { read: FEE_ROLES, write: ADMIN },
    label: (r) => `${r.code} ${r.name}`,
    list: {
      select: {
        id: feeAccounts.id,
        code: feeAccounts.code,
        name: feeAccounts.name,
        legalName: feeAccounts.legalName,
        kind: feeAccounts.kind,
        pan: feeAccounts.pan,
        gstin: feeAccounts.gstin,
        reg80g: feeAccounts.reg80g,
        address: feeAccounts.address,
        fundId: feeAccounts.fundId,
        fund: sql<string | null>`(select f.code || ' ' || f.name from acct_funds f where f.id = fee_accounts.fund_id)`,
        bankAccountId: feeAccounts.bankAccountId,
        bank: sql<string | null>`(select a.code || ' ' || a.name from acct_accounts a where a.id = fee_accounts.bank_account_id)`,
        cashAccountId: feeAccounts.cashAccountId,
        receiptPrefix: feeAccounts.receiptPrefix,
        upiVpa: feeAccounts.upiVpa,
        upiPayeeName: feeAccounts.upiPayeeName,
        tallyCompany: feeAccounts.tallyCompany,
        isDefault: feeAccounts.isDefault,
        active: feeAccounts.active,
        sortOrder: feeAccounts.sortOrder,
        invoices,
        gateway: sql<string | null>`(select g.provider || ' · ' || g.mode from payment_gateway_accounts g where g.fee_account_id = fee_accounts.id)`,
      },
      search: [feeAccounts.code, feeAccounts.name, feeAccounts.legalName],
      filters: {
        kind: { label: 'Kind', options: KINDS.map((k) => ({ value: k, label: k })), where: (v) => (KINDS.includes(v) ? eq(feeAccounts.kind, v) : undefined) },
        fund: { label: 'Books', options: fundOptions, where: (v) => uuidEq(feeAccounts.fundId, v) },
      },
      sorts: { order: feeAccounts.sortOrder, code: feeAccounts.code, name: feeAccounts.name },
      defaultSort: { id: 'order', dir: 'asc' },
    },
    fields: {
      code: { label: 'Code', type: 'text', schema: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,12}$/, 'Codes are 2 to 12 capital letters or digits'), column: feeAccounts.code, required: true, edit: false },
      name: { label: 'Name', type: 'text', schema: Text(120), column: feeAccounts.name, required: true, help: 'e.g. Soundarya Educational Trust, Soundarya Institute of Management' },
      legalName: { label: 'Legal name (on receipts)', type: 'text', schema: z.string().trim().max(200).default(''), column: feeAccounts.legalName },
      kind: { label: 'Kind', type: 'select', schema: z.enum(KINDS as [string, ...string[]]), column: feeAccounts.kind, options: KINDS.map((k) => ({ value: k, label: k })), required: true, bulk: true },
      pan: { label: 'PAN', type: 'text', schema: z.string().trim().toUpperCase().regex(/^[A-Z]{5}\d{4}[A-Z]$/, 'A PAN is like AAATS1234Q').nullish(), column: feeAccounts.pan },
      gstin: { label: 'GSTIN', type: 'text', schema: z.string().trim().toUpperCase().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'A GSTIN is 15 characters like 29AAATS1234Q1Z5').nullish(), column: feeAccounts.gstin, help: 'Only for accounts that charge GST on taxable heads' },
      reg80g: { label: '80G registration', type: 'text', schema: OptionalText(80), column: feeAccounts.reg80g, help: 'Printed on donation receipts' },
      address: { label: 'Address', type: 'textarea', schema: z.string().trim().max(500).default(''), column: feeAccounts.address },
      fundId: { label: 'Books (fund)', type: 'select', schema: z.uuid().nullish(), column: feeAccounts.fundId, options: fundOptions, help: 'Its vouchers, ledgers, trial balance and statements are kept in this fund' },
      bankAccountId: { label: 'Bank ledger', type: 'select', schema: z.uuid().nullish(), column: feeAccounts.bankAccountId, options: moneyOptions, help: 'Cheques, online payments, UPI and transfers are banked here' },
      cashAccountId: { label: 'Cash ledger', type: 'select', schema: z.uuid().nullish(), column: feeAccounts.cashAccountId, options: moneyOptions },
      receiptPrefix: { label: 'Receipt series', type: 'text', schema: z.string().trim().max(30).regex(/^[A-Za-z0-9/{}_-]*$/, 'Letters, digits, / - _ and {FY}').nullish(), column: feeAccounts.receiptPrefix, help: 'e.g. SET/{FY}/ — numbers restart each financial year' },
      upiVpa: { label: 'UPI id', type: 'text', schema: z.string().trim().regex(VPA, 'A UPI id is like soundarya@sbi').nullish(), column: feeAccounts.upiVpa, help: 'Shown as an amount-bound QR on invoices, receipts and payment links' },
      upiPayeeName: { label: 'UPI payee name', type: 'text', schema: OptionalText(60), column: feeAccounts.upiPayeeName },
      tallyCompany: { label: 'Tally company', type: 'text', schema: OptionalText(200), column: feeAccounts.tallyCompany, help: 'Its vouchers go to this company in Tally Prime' },
      isDefault: { label: 'Default account', type: 'boolean', schema: z.boolean(), apply: onlyDefault, help: 'Takes every fee whose head or structure names no account' },
      active: { label: 'Active', type: 'boolean', schema: z.boolean(), column: feeAccounts.active, bulk: true, create: false },
    },
    order: { column: feeAccounts.sortOrder },
    duplicate: async (ctx, row) => {
      for (let n = 2; n < 100; n++) {
        const code = `${String(row.code).slice(0, 10)}${n}`;
        const [hit] = await ctx.tx.select({ id: feeAccounts.id }).from(feeAccounts).where(eq(feeAccounts.code, code));
        if (!hit) return { code, name: await copyName(ctx.tx, feeAccounts, feeAccounts.name, String(row.name)), isDefault: false, receiptPrefix: null, upiVpa: null };
      }
      throw new ConflictException('No free code for the copy');
    },
    remove: {
      guard: async (ctx, id) => {
        const n = Number((await ctx.tx.execute<{ n: number }>(sql`select (select count(*) from fee_invoices where fee_account_id = ${id}::uuid) + (select count(*) from fee_receipts where fee_account_id = ${id}::uuid) as n`)).rows[0].n);
        return n > 0 ? 'Fees and receipts belong to this account; switch it off instead' : null;
      },
    },
    columns: [
      { key: 'code', header: 'Code' },
      { key: 'name', header: 'Fee account' },
      { key: 'kind', header: 'Kind' },
      { key: 'receiptPrefix', header: 'Receipt series' },
      { key: 'fund', header: 'Books' },
      { key: 'bank', header: 'Bank ledger' },
      { key: 'upiVpa', header: 'UPI id' },
      { key: 'gstin', header: 'GSTIN' },
      { key: 'reg80g', header: '80G' },
      { key: 'gateway', header: 'Gateway' },
      { key: 'isDefault', header: 'Default' },
      { key: 'active', header: 'Active' },
    ],
  };
}

@Injectable()
export class FeeAccountRecords implements OnModuleInit {
  constructor(private readonly registry: RecordRegistry) {}
  onModuleInit() {
    this.registry.register(feeAccountsEntity());
  }
}
