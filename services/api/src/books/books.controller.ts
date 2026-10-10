import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { Day, Paise } from '../common/ops.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { acctAccounts, acctFyCloses, acctVouchers, tallySyncLog } from '../db/schema.js';
import { FEE_ROLES } from '../fees/fees.service.js';
import { balanceSheet, financialYearOf, fyEnd, fyStart, incomeExpenditure, isFy, naturalBalance, POSTING, trialBalance } from './books.logic.js';
import { accountByCode, accountsList, assertFyOpen, ensureChart, movements, postVoucher, voucherLines } from './books.service.js';

const Group = z.enum(['asset', 'liability', 'equity', 'income', 'expense']);
const AccountBody = z.object({ code: z.string().trim().regex(/^[A-Za-z0-9._-]{1,12}$/, 'Use letters, digits or . _ - (up to 12)'), name: z.string().trim().min(2).max(120), groupType: Group, isCashBank: z.boolean().default(false) });
const AccountPatch = z.object({ name: z.string().trim().min(2).max(120).optional(), active: z.boolean().optional() });
const Line = z.object({ accountId: z.uuid(), debitPaise: Paise.or(z.literal(0)).default(0), creditPaise: Paise.or(z.literal(0)).default(0) });
const VoucherBody = z.object({ type: z.enum(['receipt', 'payment', 'journal', 'contra']), date: Day, narration: z.string().trim().max(300).default(''), lines: z.array(Line).min(2).max(40) });
const OpeningBody = z.object({ balances: z.array(z.object({ accountId: z.uuid(), openingPaise: z.number().int() })).min(1).max(200) });
const FY = z.string().refine(isFy, 'Use a financial year like 2026-27');

/** Chart of accounts, vouchers, ledgers, the day book, trial balance, income and expenditure, balance sheet and year close. */
@Controller('v1/books')
export class BooksController {
  constructor(private readonly db: DbService) {}

  @Get('accounts')
  @Auth('user', FEE_ROLES)
  accounts(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await ensureChart(tx, p.tenantId);
      return accountsList(tx);
    });
  }

  @Post('accounts')
  @Auth('user', FEE_ROLES)
  addAccount(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(AccountBody)) b: z.infer<typeof AccountBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await ensureChart(tx, p.tenantId);
      const [dupe] = await tx.select({ id: acctAccounts.id }).from(acctAccounts).where(eq(acctAccounts.code, b.code));
      if (dupe) throw new ConflictException('That account code is already used');
      const [row] = await tx.insert(acctAccounts).values({ tenantId: p.tenantId, ...b }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'books.account_added', subjectType: 'acct_account', subjectId: row.id, data: { code: b.code } });
      return row;
    });
  }

  @Patch('accounts/:id')
  @Auth('user', FEE_ROLES)
  patchAccount(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(AccountPatch)) b: z.infer<typeof AccountPatch>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(acctAccounts).set(b).where(eq(acctAccounts.id, id)).returning();
      if (!row) throw new NotFoundException('Account not found');
      return row;
    });
  }

  /** Opening balances, debit positive; they must add up to nothing. */
  @Put('opening')
  @Auth('user', FEE_ROLES)
  opening(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(OpeningBody)) b: z.infer<typeof OpeningBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await ensureChart(tx, p.tenantId);
      const all = await accountsList(tx);
      const next = new Map(all.map((a) => [a.id, a.openingPaise]));
      for (const x of b.balances) {
        if (!next.has(x.accountId)) throw new NotFoundException('Account not found');
        next.set(x.accountId, x.openingPaise);
      }
      if ([...next.values()].reduce((s, v) => s + v, 0) !== 0) throw new BadRequestException('Opening balances must add up to nothing (debits equal credits)');
      for (const x of b.balances) await tx.update(acctAccounts).set({ openingPaise: x.openingPaise }).where(eq(acctAccounts.id, x.accountId));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'books.opening_set', subjectType: 'acct_account', data: { accounts: b.balances.length } });
      return accountsList(tx);
    });
  }

  @Post('vouchers')
  @Auth('user', FEE_ROLES)
  postIt(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(VoucherBody)) b: z.infer<typeof VoucherBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const row = await postVoucher(tx, { tenantId: p.tenantId, userId: p.userId }, { type: b.type, date: b.date, narration: b.narration, lines: b.lines });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'books.voucher_posted', subjectType: 'acct_voucher', subjectId: row.id, data: { number: row.number } });
      return row;
    });
  }

  @Post('vouchers/:id/void')
  @Auth('user', FEE_ROLES)
  void(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [v] = await tx.select().from(acctVouchers).where(eq(acctVouchers.id, id));
      if (!v || v.voidedAt) throw new NotFoundException('Voucher not found');
      if (v.isClosing) throw new ConflictException('A year-end closing entry cannot be voided');
      await assertFyOpen(tx, v.financialYear);
      const [row] = await tx.update(acctVouchers).set({ voidedAt: new Date() }).where(eq(acctVouchers.id, id)).returning();
      // A voided voucher is withdrawn from Tally's queue too.
      await tx.delete(tallySyncLog).where(eq(tallySyncLog.refId, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'books.voucher_voided', subjectType: 'acct_voucher', subjectId: id, data: { number: v.number } });
      return row;
    });
  }

  /** The day book: every voucher in a date range with its lines. */
  @Get('daybook')
  @Auth('user', FEE_ROLES)
  daybook(@CurrentPrincipal() p: UserPrincipal, @Query('from') from?: string, @Query('to') to?: string) {
    const f = Day.parse(from ?? new Date().toISOString().slice(0, 10));
    const t = Day.parse(to ?? f);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const vouchers = await voucherLines(tx, { from: f, to: t, includeVoided: true });
      const live = vouchers.filter((v) => !v.voided);
      return { from: f, to: t, vouchers, totalPaise: live.reduce((s, v) => s + v.lines.reduce((x, l) => x + l.debitPaise, 0), 0) };
    });
  }

  /** One account's ledger with a running balance. */
  @Get('ledger/:accountId')
  @Auth('user', FEE_ROLES)
  ledger(@CurrentPrincipal() p: UserPrincipal, @Param('accountId', ParseUUIDPipe) accountId: string, @Query('from') from?: string, @Query('to') to?: string) {
    const f = from ? Day.parse(from) : undefined;
    const t = to ? Day.parse(to) : undefined;
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [acc] = await tx.select().from(acctAccounts).where(eq(acctAccounts.id, accountId));
      if (!acc) throw new NotFoundException('Account not found');
      const before = f ? (await movements(tx, { to: new Date(Date.parse(f) - 86_400_000).toISOString().slice(0, 10) })).find((m) => m.accountId === accountId) : undefined;
      let running = naturalBalance(acc.groupType as never, acc.openingPaise + (before?.debitPaise ?? 0), before?.creditPaise ?? 0);
      const opening = running;
      const rows = (await voucherLines(tx, { from: f, to: t, accountId })).flatMap((v) =>
        v.lines
          .filter((l) => l.accountId === accountId)
          .map((l) => {
            running += naturalBalance(acc.groupType as never, l.debitPaise, l.creditPaise);
            return { date: v.date, number: v.number, voucherType: v.voucherType, narration: v.narration, debitPaise: l.debitPaise, creditPaise: l.creditPaise, balancePaise: running };
          }),
      );
      return { account: acc, openingPaise: opening, rows, closingPaise: running };
    });
  }

  @Get('trial-balance')
  @Auth('user', FEE_ROLES)
  trial(@CurrentPrincipal() p: UserPrincipal, @Query('asOf') asOf?: string) {
    const to = Day.parse(asOf ?? new Date().toISOString().slice(0, 10));
    return this.db.withTenant(p.tenantId, async (tx) => {
      await ensureChart(tx, p.tenantId);
      return { asOf: to, ...trialBalance(await movements(tx, { to })) };
    });
  }

  /** Income and expenditure (profit and loss) for a financial year; closing entries are left out so a closed year still reports. */
  @Get('income-expenditure')
  @Auth('user', FEE_ROLES)
  incomeExpenditure(@CurrentPrincipal() p: UserPrincipal, @Query('fy') fy?: string) {
    const year = FY.parse(fy ?? financialYearOf(new Date().toISOString().slice(0, 10)));
    return this.db.withTenant(p.tenantId, async (tx) => {
      await ensureChart(tx, p.tenantId);
      return { financialYear: year, ...incomeExpenditure(await movements(tx, { from: fyStart(year), to: fyEnd(year), excludeClosing: true })) };
    });
  }

  @Get('balance-sheet')
  @Auth('user', FEE_ROLES)
  balanceSheet(@CurrentPrincipal() p: UserPrincipal, @Query('asOf') asOf?: string) {
    const to = Day.parse(asOf ?? new Date().toISOString().slice(0, 10));
    return this.db.withTenant(p.tenantId, async (tx) => {
      await ensureChart(tx, p.tenantId);
      return { asOf: to, ...balanceSheet(await movements(tx, { to })) };
    });
  }

  @Get('years')
  @Auth('user', FEE_ROLES)
  years(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(acctFyCloses).orderBy(desc(acctFyCloses.financialYear)));
  }

  /**
   * Closes a financial year: income and expenditure move to Reserves and Surplus in one closing
   * journal dated the last day of the year, and nothing more can be posted, voided or edited in it.
   */
  @Post('years/:fy/close')
  @Auth('user', FEE_ROLES)
  close(@CurrentPrincipal() p: UserPrincipal, @Param('fy') fyParam: string) {
    const fy = FY.parse(fyParam);
    return this.db.withTenant(p.tenantId, async (tx) => {
      await ensureChart(tx, p.tenantId);
      await assertFyOpen(tx, fy);
      const ie = (await movements(tx, { from: fyStart(fy), to: fyEnd(fy), excludeClosing: true })).filter((m) => m.groupType === 'income' || m.groupType === 'expense');
      const lines: { accountId: string; debitPaise: number; creditPaise: number }[] = [];
      let surplus = 0;
      for (const m of ie) {
        const net = m.creditPaise - m.debitPaise;
        if (net === 0) continue;
        surplus += net;
        lines.push(net > 0 ? { accountId: m.accountId, debitPaise: net, creditPaise: 0 } : { accountId: m.accountId, debitPaise: 0, creditPaise: -net });
      }
      let closingVoucherId: string | null = null;
      if (lines.length > 0) {
        const reserves = await accountByCode(tx, POSTING.reserves);
        lines.push(surplus >= 0 ? { accountId: reserves.id, debitPaise: 0, creditPaise: surplus } : { accountId: reserves.id, debitPaise: -surplus, creditPaise: 0 });
        const v = await postVoucher(tx, { tenantId: p.tenantId, userId: p.userId }, { type: 'journal', date: fyEnd(fy), narration: `Closing of financial year ${fy}`, lines, isClosing: true, sourceType: 'fy_close', sourceId: fy });
        closingVoucherId = v.id;
      }
      const [row] = await tx.insert(acctFyCloses).values({ tenantId: p.tenantId, financialYear: fy, surplusPaise: surplus, closingVoucherId, closedBy: p.userId }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'books.year_closed', subjectType: 'acct_fy_close', subjectId: row.id, data: { financialYear: fy, surplusPaise: surplus } });
      return row;
    });
  }
}
