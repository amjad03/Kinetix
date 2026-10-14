import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { ensureChart } from '../books/books.service.js';
import { auditUser } from '../common/audit.js';
import { Day } from '../common/ops.js';
import { Clock, localParts } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { acctBankLines, acctBankStatements, acctFunds } from '../db/schema-fee-depth.js';
import { acctAccounts, acctVouchers, settlementBatches, tenants, users } from '../db/schema.js';
import { autoMatch, parseStatementCsv, type BookEntry } from '../fees/fee-depth.logic.js';
import { FEE_ROLES } from '../fees/fees.service.js';

const ImportBody = z.object({ accountId: z.uuid(), fileName: z.string().trim().min(1).max(200), csv: z.string().min(10).max(5_000_000) });
const MatchBody = z.object({ voucherId: z.uuid() });
const SettleBody = z.object({ batchId: z.uuid() });
const NoteBody = z.object({ note: z.string().trim().min(3).max(300) });

/**
 * Bank reconciliation: a bank statement (CSV from the bank) is imported line by line for a bank ledger, lines are
 * matched to the vouchers on that ledger automatically (same amount and direction within a few days, a shared
 * reference first) or by hand, gateway settlements are matched to the bank credit that paid them, and the
 * reconciliation statement explains the difference between the books and the bank. Also the funds kept as books.
 */
@Controller('v1/accounts-depth')
export class BankController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
  ) {}

  private async today(tx: Tx): Promise<string> {
    const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
    return localParts(this.clock.now(), t?.tz ?? 'Asia/Kolkata').date;
  }

  private async bankAccount(tx: Tx, id: string) {
    const [a] = await tx.select().from(acctAccounts).where(eq(acctAccounts.id, id));
    if (!a || !a.isCashBank) throw new NotFoundException('Bank account not found');
    return a;
  }

  /** The cash and bank ledgers with their bank details and how much of their statements is unmatched. */
  @Get('bank-accounts')
  @Auth('user', FEE_ROLES)
  accounts(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await ensureChart(tx, p.tenantId);
      return tx
        .select({ id: acctAccounts.id, code: acctAccounts.code, name: acctAccounts.name, bankName: acctAccounts.bankName, accountNo: acctAccounts.accountNo, ifsc: acctAccounts.ifsc, unmatched: sql<number>`(select count(*)::int from acct_bank_lines l where l.account_id = ${acctAccounts.id} and l.status = 'unmatched')`, lastStatement: sql<string | null>`(select max(to_date)::text from acct_bank_statements s where s.account_id = ${acctAccounts.id})` })
        .from(acctAccounts)
        .where(and(eq(acctAccounts.isCashBank, true), eq(acctAccounts.active, true)))
        .orderBy(asc(acctAccounts.sortOrder), asc(acctAccounts.code));
    });
  }

  /** The book entries on a bank ledger (vouchers) with their direction, for matching. */
  private async entries(tx: Tx, accountId: string, from: string, to: string): Promise<(BookEntry & { number: string; matched: boolean })[]> {
    const rows = await tx.execute<{ id: string; date: string; number: string; narration: string; dr: string; cr: string; matched: boolean }>(sql`
      select v.id, v.voucher_date::text as date, v.number, v.narration, sum(l.debit_paise)::bigint as dr, sum(l.credit_paise)::bigint as cr,
        exists (select 1 from acct_bank_lines b where b.voucher_id = v.id) as matched
      from acct_vouchers v join acct_voucher_lines l on l.voucher_id = v.id
      where l.account_id = ${accountId}::uuid and v.voided_at is null and v.voucher_date between ${from}::date and ${to}::date
      group by v.id order by v.voucher_date, v.number`);
    return rows.rows.map((r) => ({ voucherId: r.id, date: r.date, inPaise: Number(r.dr), outPaise: Number(r.cr), text: `${r.number} ${r.narration}`, number: r.number, matched: r.matched }));
  }

  /** Matches the account's open lines to its unmatched vouchers, then credits to gateway settlements. Returns how many matched. */
  private async match(tx: Tx, p: UserPrincipal, accountId: string): Promise<number> {
    const open = await tx.select().from(acctBankLines).where(and(eq(acctBankLines.accountId, accountId), eq(acctBankLines.status, 'unmatched')));
    if (!open.length) return 0;
    const from = open.reduce((m, l) => (l.txnDate < m ? l.txnDate : m), open[0].txnDate);
    const to = open.reduce((m, l) => (l.txnDate > m ? l.txnDate : m), open[0].txnDate);
    const pad = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
    const entries = (await this.entries(tx, accountId, pad(from, -10), pad(to, 10))).filter((e) => !e.matched);
    const pairs = autoMatch(open.map((l) => ({ ...l, balancePaise: l.balancePaise })), entries);
    for (const m of pairs) await tx.update(acctBankLines).set({ status: 'matched', voucherId: m.voucherId, matchKind: 'auto', matchedBy: p.userId, matchedAt: new Date() }).where(eq(acctBankLines.id, m.lineId));
    // Gateway payouts: a credit equal to a settlement's net amount within three days of it.
    let settled = 0;
    const still = open.filter((l) => !pairs.some((x) => x.lineId === l.id) && l.creditPaise > 0);
    if (still.length) {
      const batches = await tx.execute<{ id: string; net: string; d: string }>(sql`select b.id, b.net_paise::bigint as net, b.settlement_date::text as d from settlement_batches b where not exists (select 1 from acct_bank_lines l where l.settlement_batch_id = b.id)`);
      const used = new Set<string>();
      for (const l of still) {
        const hit = batches.rows.find((b) => !used.has(b.id) && Number(b.net) === l.creditPaise && Math.abs(Date.parse(b.d) - Date.parse(l.txnDate)) <= 3 * 86_400_000);
        if (!hit) continue;
        used.add(hit.id);
        await tx.update(acctBankLines).set({ status: 'matched', settlementBatchId: hit.id, matchKind: 'auto', matchedBy: p.userId, matchedAt: new Date() }).where(eq(acctBankLines.id, l.id));
        settled++;
      }
    }
    await this.recount(tx, accountId);
    return pairs.length + settled;
  }

  private async recount(tx: Tx, accountId: string) {
    await tx.execute(sql`update acct_bank_statements s set matched_count = (select count(*)::int from acct_bank_lines l where l.statement_id = s.id and l.status <> 'unmatched') where s.account_id = ${accountId}::uuid`);
  }

  /** Imports a statement (CSV) for a bank ledger and matches what it can. A line already imported is skipped. */
  @Post('bank/statements')
  @Auth('user', FEE_ROLES)
  importStatement(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ImportBody)) b: z.infer<typeof ImportBody>) {
    let lines: ReturnType<typeof parseStatementCsv>;
    try {
      lines = parseStatementCsv(b.csv);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    if (!lines.length) throw new BadRequestException('The statement has no transactions');
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.bankAccount(tx, b.accountId);
      const from = lines.reduce((m, l) => (l.txnDate < m ? l.txnDate : m), lines[0].txnDate);
      const to = lines.reduce((m, l) => (l.txnDate > m ? l.txnDate : m), lines[0].txnDate);
      const have = await tx.select().from(acctBankLines).where(and(eq(acctBankLines.accountId, b.accountId), sql`${acctBankLines.txnDate} between ${from}::date and ${to}::date`));
      const key = (l: { txnDate: string; debitPaise: number; creditPaise: number; reference: string; description: string }) => `${l.txnDate}|${l.debitPaise}|${l.creditPaise}|${l.reference}|${l.description}`;
      const seen = new Set(have.map(key));
      const fresh = lines.filter((l) => !seen.has(key(l)));
      const [st] = await tx.insert(acctBankStatements).values({ tenantId: p.tenantId, accountId: b.accountId, fileName: b.fileName, fromDate: from, toDate: to, closingPaise: lines.at(-1)?.balancePaise ?? null, lineCount: fresh.length, importedBy: p.userId }).returning();
      if (fresh.length) await tx.insert(acctBankLines).values(fresh.map((l) => ({ tenantId: p.tenantId, statementId: st.id, accountId: b.accountId, txnDate: l.txnDate, description: l.description.slice(0, 300), reference: l.reference.slice(0, 100), debitPaise: l.debitPaise, creditPaise: l.creditPaise, balancePaise: l.balancePaise })));
      const matched = await this.match(tx, p, b.accountId);
      await auditUser(tx, p, 'bank_statement.imported', 'bank_statement', st.id, { lines: fresh.length, skipped: lines.length - fresh.length, matched });
      return { statementId: st.id, lines: fresh.length, skipped: lines.length - fresh.length, matched };
    });
  }

  @Get('bank/statements')
  @Auth('user', FEE_ROLES)
  statements(@CurrentPrincipal() p: UserPrincipal, @Query('accountId') accountId?: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ s: acctBankStatements, by: users.fullName })
        .from(acctBankStatements)
        .leftJoin(users, eq(users.id, acctBankStatements.importedBy))
        .where(accountId && z.uuid().safeParse(accountId).success ? eq(acctBankStatements.accountId, accountId) : undefined)
        .orderBy(desc(acctBankStatements.createdAt))
        .limit(200)
        .then((rows) => rows.map((x) => ({ ...x.s, importedByName: x.by }))),
    );
  }

  /** Statement lines of a bank ledger (all, or by status), with the voucher or settlement each was matched to. */
  @Get('bank/lines')
  @Auth('user', FEE_ROLES)
  lines(@CurrentPrincipal() p: UserPrincipal, @Query('accountId') accountId?: string, @Query('status') status?: string) {
    if (!accountId || !z.uuid().safeParse(accountId).success) throw new BadRequestException('Choose a bank account');
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.bankAccount(tx, accountId);
      return tx
        .select({ l: acctBankLines, voucherNo: acctVouchers.number, voucherNarration: acctVouchers.narration, settlement: settlementBatches.reference })
        .from(acctBankLines)
        .leftJoin(acctVouchers, eq(acctVouchers.id, acctBankLines.voucherId))
        .leftJoin(settlementBatches, eq(settlementBatches.id, acctBankLines.settlementBatchId))
        .where(and(eq(acctBankLines.accountId, accountId), status && ['unmatched', 'matched', 'ignored'].includes(status) ? eq(acctBankLines.status, status) : undefined))
        .orderBy(desc(acctBankLines.txnDate), asc(acctBankLines.createdAt))
        .limit(2000)
        .then((rows) => rows.map((x) => ({ ...x.l, voucherNo: x.voucherNo, voucherNarration: x.voucherNarration, settlement: x.settlement })));
    });
  }

  /** Vouchers that could be this line: same amount and direction, unmatched, within 30 days. */
  @Get('bank/lines/:id/candidates')
  @Auth('user', FEE_ROLES)
  candidates(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [l] = await tx.select().from(acctBankLines).where(eq(acctBankLines.id, id));
      if (!l) throw new NotFoundException('Line not found');
      const pad = (n: number) => new Date(Date.parse(`${l.txnDate}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
      const all = await this.entries(tx, l.accountId, pad(-30), pad(30));
      return all.filter((e) => !e.matched && (l.creditPaise > 0 ? e.inPaise === l.creditPaise : e.outPaise === l.debitPaise)).map((e) => ({ voucherId: e.voucherId, number: e.number, date: e.date, text: e.text, amountPaise: e.inPaise || e.outPaise }));
    });
  }

  @Post('bank/auto-match')
  @HttpCode(200)
  @Auth('user', FEE_ROLES)
  autoMatch(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(z.object({ accountId: z.uuid() }))) b: { accountId: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.bankAccount(tx, b.accountId);
      const matched = await this.match(tx, p, b.accountId);
      await auditUser(tx, p, 'bank_statement.auto_matched', 'bank_statement', undefined, { accountId: b.accountId, matched });
      return { matched };
    });
  }

  /** Matches a line to a voucher by hand; the amounts and the direction must agree. */
  @Post('bank/lines/:id/match')
  @HttpCode(200)
  @Auth('user', FEE_ROLES)
  matchOne(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(MatchBody)) b: z.infer<typeof MatchBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [l] = await tx.select().from(acctBankLines).where(eq(acctBankLines.id, id)).for('update');
      if (!l) throw new NotFoundException('Line not found');
      if (l.status === 'matched') throw new ConflictException('This line is already matched; unmatch it first');
      const [e] = (await this.entries(tx, l.accountId, '1900-01-01', '2999-12-31')).filter((x) => x.voucherId === b.voucherId);
      if (!e) throw new NotFoundException('That voucher does not touch this bank account');
      if (e.matched) throw new ConflictException('That voucher is matched to another line');
      if (l.creditPaise > 0 ? e.inPaise !== l.creditPaise : e.outPaise !== l.debitPaise) throw new BadRequestException('The voucher’s amount or direction differs from the bank line');
      const [row] = await tx.update(acctBankLines).set({ status: 'matched', voucherId: b.voucherId, matchKind: 'manual', matchedBy: p.userId, matchedAt: new Date() }).where(eq(acctBankLines.id, id)).returning();
      await this.recount(tx, l.accountId);
      await auditUser(tx, p, 'bank_line.matched', 'bank_line', id, { voucherId: b.voucherId });
      return row;
    });
  }

  /** Matches a credit to a gateway settlement (the payout of online fees). */
  @Post('bank/lines/:id/settlement')
  @HttpCode(200)
  @Auth('user', FEE_ROLES)
  settle(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(SettleBody)) b: z.infer<typeof SettleBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [l] = await tx.select().from(acctBankLines).where(eq(acctBankLines.id, id)).for('update');
      if (!l) throw new NotFoundException('Line not found');
      if (l.status === 'matched') throw new ConflictException('This line is already matched; unmatch it first');
      const [batch] = await tx.select().from(settlementBatches).where(eq(settlementBatches.id, b.batchId));
      if (!batch) throw new NotFoundException('Settlement not found');
      if (batch.netPaise !== l.creditPaise) throw new BadRequestException('The settlement’s net amount differs from the bank credit');
      const [taken] = await tx.select({ id: acctBankLines.id }).from(acctBankLines).where(eq(acctBankLines.settlementBatchId, batch.id));
      if (taken) throw new ConflictException('That settlement is matched to another line');
      const [row] = await tx.update(acctBankLines).set({ status: 'matched', settlementBatchId: batch.id, matchKind: 'manual', matchedBy: p.userId, matchedAt: new Date() }).where(eq(acctBankLines.id, id)).returning();
      await this.recount(tx, l.accountId);
      await auditUser(tx, p, 'bank_line.settled', 'bank_line', id, { batchId: batch.id });
      return row;
    });
  }

  @Post('bank/lines/:id/unmatch')
  @HttpCode(200)
  @Auth('user', FEE_ROLES)
  unmatch(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [l] = await tx.select().from(acctBankLines).where(eq(acctBankLines.id, id)).for('update');
      if (!l) throw new NotFoundException('Line not found');
      if (l.status === 'unmatched') throw new ConflictException('This line is not matched');
      const [row] = await tx.update(acctBankLines).set({ status: 'unmatched', voucherId: null, settlementBatchId: null, matchKind: null, matchedBy: null, matchedAt: null, note: null }).where(eq(acctBankLines.id, id)).returning();
      await this.recount(tx, l.accountId);
      await auditUser(tx, p, 'bank_line.unmatched', 'bank_line', id, { voucherId: l.voucherId, batchId: l.settlementBatchId });
      return row;
    });
  }

  /** Bank charges or interest the books do not have yet: marked with a note (post a voucher for them, then match). */
  @Post('bank/lines/:id/ignore')
  @HttpCode(200)
  @Auth('user', FEE_ROLES)
  ignore(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(NoteBody)) b: z.infer<typeof NoteBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [l] = await tx.select().from(acctBankLines).where(eq(acctBankLines.id, id)).for('update');
      if (!l) throw new NotFoundException('Line not found');
      if (l.status === 'matched') throw new ConflictException('Unmatch the line first');
      const [row] = await tx.update(acctBankLines).set({ status: 'ignored', note: b.note, matchedBy: p.userId, matchedAt: new Date() }).where(eq(acctBankLines.id, id)).returning();
      await this.recount(tx, l.accountId);
      await auditUser(tx, p, 'bank_line.ignored', 'bank_line', id, { note: b.note });
      return row;
    });
  }

  /**
   * The bank reconciliation statement on a date: the balance in the books, deposits not yet credited by the bank,
   * payments not yet presented, and bank entries not in the books; the result should equal the bank's balance.
   */
  @Get('bank/reconciliation')
  @Auth('user', FEE_ROLES)
  brs(@CurrentPrincipal() p: UserPrincipal, @Query('accountId') accountId?: string, @Query('asOn') asOn?: string) {
    if (!accountId || !z.uuid().safeParse(accountId).success) throw new BadRequestException('Choose a bank account');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const a = await this.bankAccount(tx, accountId);
      const on = asOn ? Day.parse(asOn) : await this.today(tx);
      const [bk] = (await tx.execute<{ dr: string; cr: string }>(sql`select coalesce(sum(l.debit_paise), 0)::bigint as dr, coalesce(sum(l.credit_paise), 0)::bigint as cr from acct_voucher_lines l join acct_vouchers v on v.id = l.voucher_id where l.account_id = ${accountId}::uuid and v.voided_at is null and v.voucher_date <= ${on}::date`)).rows;
      const booksPaise = a.openingPaise + Number(bk.dr) - Number(bk.cr);
      const entries = await this.entries(tx, accountId, '1900-01-01', on);
      const statements = await tx.select({ from: sql<string>`min(${acctBankStatements.fromDate})::text` }).from(acctBankStatements).where(eq(acctBankStatements.accountId, accountId));
      const since = statements[0]?.from ?? on;
      // Only entries from the first imported statement on can be "not yet in the bank".
      const pending = entries.filter((e) => !e.matched && e.date >= since);
      const depositsNotCredited = pending.filter((e) => e.inPaise > 0).map((e) => ({ voucherId: e.voucherId, date: e.date, number: e.number, text: e.text, amountPaise: e.inPaise }));
      const paymentsNotPresented = pending.filter((e) => e.outPaise > 0).map((e) => ({ voucherId: e.voucherId, date: e.date, number: e.number, text: e.text, amountPaise: e.outPaise }));
      const bankOnly = (await tx.select().from(acctBankLines).where(and(eq(acctBankLines.accountId, accountId), sql`${acctBankLines.status} <> 'matched'`, sql`${acctBankLines.txnDate} <= ${on}::date`))).map((l) => ({ id: l.id, date: l.txnDate, text: `${l.reference} ${l.description}`.trim(), creditPaise: l.creditPaise, debitPaise: l.debitPaise, status: l.status, note: l.note }));
      const sum = (r: { amountPaise: number }[]) => r.reduce((s, x) => s + x.amountPaise, 0);
      const bankComputed = booksPaise - sum(depositsNotCredited) + sum(paymentsNotPresented) + bankOnly.reduce((s, x) => s + x.creditPaise - x.debitPaise, 0);
      const [last] = await tx.select({ balance: acctBankLines.balancePaise }).from(acctBankLines).where(and(eq(acctBankLines.accountId, accountId), sql`${acctBankLines.txnDate} <= ${on}::date`, sql`${acctBankLines.balancePaise} is not null`)).orderBy(desc(acctBankLines.txnDate), desc(acctBankLines.createdAt)).limit(1);
      return { account: { id: a.id, code: a.code, name: a.name, bankName: a.bankName, accountNo: a.accountNo }, asOn: on, booksPaise, depositsNotCredited, paymentsNotPresented, bankOnly, bankComputedPaise: bankComputed, bankStatementPaise: last?.balance ?? null, differencePaise: last?.balance != null ? last.balance - bankComputed : null };
    });
  }

  /** Gateway settlements and whether the bank has shown each payout (order → settlement → bank). */
  @Get('settlements/bank-status')
  @Auth('user', FEE_ROLES)
  settlementBank(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ id: settlementBatches.id, provider: settlementBatches.provider, reference: settlementBatches.reference, settlementDate: settlementBatches.settlementDate, netPaise: settlementBatches.netPaise, exceptions: settlementBatches.exceptionCount, bankLineId: acctBankLines.id, bankDate: acctBankLines.txnDate })
        .from(settlementBatches)
        .leftJoin(acctBankLines, eq(acctBankLines.settlementBatchId, settlementBatches.id))
        .orderBy(desc(settlementBatches.settlementDate))
        .limit(200),
    );
  }

  /** Funds (separate books) for pickers. */
  @Get('funds')
  @Auth('user', FEE_ROLES)
  funds(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(acctFunds).where(eq(acctFunds.active, true)).orderBy(asc(acctFunds.sortOrder), asc(acctFunds.code)));
  }
}
