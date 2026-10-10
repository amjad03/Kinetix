import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { acctAccounts, acctFyCloses, acctVoucherLines, acctVouchers, tallySettings, tallySyncLog } from '../db/schema.js';
import { financialYearOf as financialYear } from './books.logic.js';
import { DEFAULT_CHART, type LineInput, type Movement, POSTING, VOUCHER_PREFIX, type VoucherType, voucherProblem, type GroupType } from './books.logic.js';

export interface VoucherInput {
  type: VoucherType;
  date: string;
  narration: string;
  lines: LineInput[];
  sourceType?: string;
  sourceId?: string;
  isClosing?: boolean;
}

/** Seeds the default chart of accounts the first time the books are touched. */
export async function ensureChart(tx: Tx, tenantId: string): Promise<void> {
  const [any] = await tx.select({ id: acctAccounts.id }).from(acctAccounts).limit(1);
  if (any) return;
  await tx.insert(acctAccounts).values(DEFAULT_CHART.map((c) => ({ tenantId, code: c.code, name: c.name, groupType: c.groupType, isCashBank: c.isCashBank ?? false }))).onConflictDoNothing();
}

export async function accountByCode(tx: Tx, code: string) {
  const [a] = await tx.select().from(acctAccounts).where(eq(acctAccounts.code, code));
  if (!a) throw new NotFoundException(`Account ${code} not found`);
  return a;
}

export async function assertFyOpen(tx: Tx, fy: string): Promise<void> {
  const [c] = await tx.select({ id: acctFyCloses.id }).from(acctFyCloses).where(eq(acctFyCloses.financialYear, fy));
  if (c) throw new ConflictException(`The financial year ${fy} is closed`);
}

/** Posts a balanced voucher; posting the same source twice returns the first. */
export async function postVoucher(tx: Tx, ctx: { tenantId: string; userId?: string }, v: VoucherInput) {
  if (v.sourceType && v.sourceId) {
    const [dupe] = await tx.select().from(acctVouchers).where(and(eq(acctVouchers.sourceType, v.sourceType), eq(acctVouchers.sourceId, v.sourceId)));
    if (dupe) return dupe;
  }
  await ensureChart(tx, ctx.tenantId);
  const fy = financialYear(v.date);
  if (!v.isClosing) await assertFyOpen(tx, fy);
  const accounts = new Map((await tx.select().from(acctAccounts)).map((a) => [a.id, { id: a.id, isCashBank: a.isCashBank, active: a.active }]));
  const problem = v.isClosing ? null : voucherProblem(v.type, v.lines, accounts);
  if (problem) throw new BadRequestException(problem);
  // One number sequence per type and year, serialised so two postings never share a number.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${ctx.tenantId}:${fy}:${v.type}`}))`);
  const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(acctVouchers).where(and(eq(acctVouchers.financialYear, fy), eq(acctVouchers.voucherType, v.type)));
  const number = `${VOUCHER_PREFIX[v.type]}/${fy}/${String(n + 1).padStart(5, '0')}`;
  const [row] = await tx
    .insert(acctVouchers)
    .values({ tenantId: ctx.tenantId, financialYear: fy, voucherType: v.type, number, voucherDate: v.date, narration: v.narration, sourceType: v.sourceType ?? null, sourceId: v.sourceId ?? null, isClosing: v.isClosing ?? false, postedBy: ctx.userId ?? null })
    .returning();
  await tx.insert(acctVoucherLines).values(v.lines.map((l) => ({ tenantId: ctx.tenantId, voucherId: row.id, accountId: l.accountId, debitPaise: l.debitPaise, creditPaise: l.creditPaise })));
  // Voucher pushed to Tally later when live sync is on.
  const [tally] = await tx.select({ enabled: tallySettings.enabled }).from(tallySettings);
  if (tally?.enabled) await tx.insert(tallySyncLog).values({ tenantId: ctx.tenantId, kind: 'voucher', refId: row.id, label: `${number} ${v.narration}`.slice(0, 200) }).onConflictDoNothing();
  return row;
}

/**
 * A fee receipt posts itself: money in (cash for cash, the bank for everything else) against fee income.
 * A failure here never stops the receipt (a closed year, say): it runs in a savepoint and is only logged.
 */
export async function postFeeReceipt(tx: Tx, p: { tenantId: string; paymentId: string; date: string; receiptNo: string; method: string; amountPaise: number; student: string }): Promise<void> {
  try {
    await tx.transaction(async (sp) => {
      await ensureChart(sp, p.tenantId);
      const money = await accountByCode(sp, p.method === 'cash' ? POSTING.cash : POSTING.bank);
      const income = await accountByCode(sp, POSTING.feeIncome);
      await postVoucher(sp, { tenantId: p.tenantId }, {
        type: 'receipt',
        date: p.date,
        narration: `Fee receipt ${p.receiptNo} from ${p.student}`,
        lines: [
          { accountId: money.id, debitPaise: p.amountPaise, creditPaise: 0 },
          { accountId: income.id, debitPaise: 0, creditPaise: p.amountPaise },
        ],
        sourceType: 'fee_payment',
        sourceId: p.paymentId,
      });
    });
  } catch (e) {
    console.warn(`Books: fee receipt ${p.receiptNo} was not posted: ${(e as Error).message}`);
  }
}

/** A fee refund posts the refund expense against the bank. */
export async function postFeeRefund(tx: Tx, p: { tenantId: string; userId: string; refundId: string; date: string; amountPaise: number; student: string; reason: string }): Promise<void> {
  try {
    await tx.transaction(async (sp) => {
      await ensureChart(sp, p.tenantId);
      const expense = await accountByCode(sp, POSTING.refunds);
      const bank = await accountByCode(sp, POSTING.bank);
      await postVoucher(sp, { tenantId: p.tenantId, userId: p.userId }, {
        type: 'payment',
        date: p.date,
        narration: `Fee refund to ${p.student}: ${p.reason}`,
        lines: [
          { accountId: expense.id, debitPaise: p.amountPaise, creditPaise: 0 },
          { accountId: bank.id, debitPaise: 0, creditPaise: p.amountPaise },
        ],
        sourceType: 'fee_refund',
        sourceId: p.refundId,
      });
    });
  } catch (e) {
    console.warn(`Books: fee refund ${p.refundId} was not posted: ${(e as Error).message}`);
  }
}

/** Every account with its opening balance and the movement between two dates (inclusive; both optional). */
export async function movements(tx: Tx, opts: { from?: string; to?: string; excludeClosing?: boolean } = {}): Promise<Movement[]> {
  const filters = [sql`v.voided_at is null`];
  if (opts.from) filters.push(sql`v.voucher_date >= ${opts.from}`);
  if (opts.to) filters.push(sql`v.voucher_date <= ${opts.to}`);
  if (opts.excludeClosing) filters.push(sql`v.is_closing = false`);
  const where = sql.join(filters, sql` and `);
  const rows = await tx.execute(sql`
    select a.id as "accountId", a.code, a.name, a.group_type as "groupType", a.opening_paise::bigint as "openingPaise",
           coalesce(sum(l.debit_paise), 0)::bigint as "debitPaise", coalesce(sum(l.credit_paise), 0)::bigint as "creditPaise"
    from acct_accounts a
    left join (select l.* from acct_voucher_lines l join acct_vouchers v on v.id = l.voucher_id where ${where}) l on l.account_id = a.id
    group by a.id order by a.code`);
  return (rows.rows as Record<string, unknown>[]).map((r) => ({
    accountId: String(r.accountId),
    code: String(r.code),
    name: String(r.name),
    groupType: r.groupType as GroupType,
    openingPaise: Number(r.openingPaise),
    debitPaise: Number(r.debitPaise),
    creditPaise: Number(r.creditPaise),
  }));
}

/** Vouchers with their lines for a date range (the day book) or one account (a ledger). */
export async function voucherLines(tx: Tx, opts: { from?: string; to?: string; accountId?: string; includeVoided?: boolean }) {
  const filters = [sql`true`];
  if (!opts.includeVoided) filters.push(sql`v.voided_at is null`);
  if (opts.from) filters.push(sql`v.voucher_date >= ${opts.from}`);
  if (opts.to) filters.push(sql`v.voucher_date <= ${opts.to}`);
  if (opts.accountId) filters.push(sql`v.id in (select voucher_id from acct_voucher_lines where account_id = ${opts.accountId})`);
  const rows = await tx.execute(sql`
    select v.id, v.voucher_type as "voucherType", v.number, v.voucher_date::text as "date", v.narration, v.voided_at as "voidedAt", v.source_type as "sourceType",
           l.account_id as "accountId", a.code, a.name as "accountName", l.debit_paise::bigint as "debitPaise", l.credit_paise::bigint as "creditPaise"
    from acct_vouchers v join acct_voucher_lines l on l.voucher_id = v.id join acct_accounts a on a.id = l.account_id
    where ${sql.join(filters, sql` and `)} order by v.voucher_date, v.created_at, v.number`);
  const out = new Map<string, { id: string; voucherType: string; number: string; date: string; narration: string; voided: boolean; sourceType: string | null; lines: { accountId: string; code: string; accountName: string; debitPaise: number; creditPaise: number }[] }>();
  for (const r of rows.rows as Record<string, any>[]) {
    let v = out.get(r.id);
    if (!v) out.set(r.id, (v = { id: r.id, voucherType: r.voucherType, number: r.number, date: r.date, narration: r.narration, voided: !!r.voidedAt, sourceType: r.sourceType, lines: [] }));
    v.lines.push({ accountId: r.accountId, code: r.code, accountName: r.accountName, debitPaise: Number(r.debitPaise), creditPaise: Number(r.creditPaise) });
  }
  return [...out.values()];
}

export const accountsList = (tx: Tx) => tx.select().from(acctAccounts).orderBy(asc(acctAccounts.code));
