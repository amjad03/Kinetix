import { and, eq, sql } from 'drizzle-orm';
import { accountByCode, ensureAccount, ensureChart, FEE_ACCOUNTS, postVoucher } from '../books/books.service.js';
import type { GroupType, LineInput } from '../books/books.logic.js';
import { POSTING } from '../books/books.logic.js';
import type { Tx } from '../db/db.service.js';
import { feeInvoices, students } from '../db/schema.js';
import { feeAccountsSettings } from '../db/schema-fee-accounts.js';
import { feeHeads, feeInvoiceLines } from '../db/schema-fee-depth.js';
import { feeAccruals } from '../db/schema-fee-flagship.js';
import { feeAccountById } from './fee-accounts-core.js';

/**
 * Accrual-basis fee accounting (Settings → books: "accrual"). Every change to what an invoice asks for is journalised
 * when it happens, double entry, in the invoice's fee account's books:
 *
 * | Event | Debit | Credit |
 * |---|---|---|
 * | Fee, fine, cheque-return charge, revision up | Fees receivable | Head's income (GST part to GST payable) |
 * | Concession | Fee concessions | Fees receivable |
 * | Scholarship (institution or government) | Scholarships allowed | Fees receivable |
 * | Fine or fee waived | Fines and fees waived | Fees receivable |
 * | Write-off | Fees written off | Fees receivable |
 * | Withdrawal (refund that stops the charge) | Fee refunds | Fees receivable |
 * | Revision down, invoice cancelled | Head's income (and GST payable) | Fees receivable |
 * | Receipt | Cash / bank (advance, when paid from credit) | Fees receivable |
 * | Refund (dues reopen) | Fees receivable | Bank |
 * | Cheque bounce | the receipt reversed: Fees receivable | Bank |
 *
 * Dues carried into next year's arrears invoice move between invoices without touching the books. What the books
 * were told is kept per invoice and head in fee_accruals, so {@link syncAccruals} posts only the difference and
 * running it twice posts nothing. A posting failure (a closed year) never stops the fee work; it is logged.
 */

export const ACCRUAL_ACCOUNTS: Record<string, { code: string; name: string; group: GroupType }> = {
  concession: { code: '5400', name: 'Fee Concessions', group: 'expense' },
  scholarship: { code: '5410', name: 'Scholarships Allowed', group: 'expense' },
  waiver: { code: '5420', name: 'Fines and Fees Waived', group: 'expense' },
  write_off: { code: '5430', name: 'Fees Written Off', group: 'expense' },
  adjustment: { code: '5440', name: 'Fee Adjustments', group: 'expense' },
};

/** Rows that track what was charged (the rest track reductions); moves between invoices touch no books. */
export const CHARGE_KINDS = ['fee', 'charge', 'fine', 'bounce_charge', 'arrears', 'cancel', 'charge_reversal'];
const NO_BOOKS = new Set(['arrears', 'carry_forward']);
export type ReductionKind = 'concession' | 'scholarship' | 'waiver' | 'write_off' | 'withdrawal' | 'revision' | 'carry_forward' | 'adjustment' | 'cancel';

/** Whether this invoice is booked on the accrual basis (the setting, and raised since it was switched on). */
export async function accrues(tx: Tx, invoiceId: string): Promise<boolean> {
  const [s] = await tx.select({ basis: feeAccountsSettings.basis, since: feeAccountsSettings.accrualSince }).from(feeAccountsSettings);
  if (s?.basis !== 'accrual') return false;
  if (!s.since) return true;
  const [inv] = await tx.select({ at: feeInvoices.createdAt }).from(feeInvoices).where(eq(feeInvoices.id, invoiceId));
  return !!inv && inv.at >= s.since;
}

const receivableCode = async (tx: Tx) => {
  const [s] = await tx.select({ m: feeAccountsSettings.mappings }).from(feeAccountsSettings);
  return s?.m?.receivable ?? '1100';
};

/**
 * Books the difference between what an invoice asks for now (by head: charges raised and reductions given) and what
 * the books were told. `kind` names a reduction made now (a concession, a waiver…); `chargeKind` a charge (fee, fine,
 * bounce_charge). Returns the journals posted.
 */
export async function syncAccruals(tx: Tx, ctx: { tenantId: string; userId?: string | null }, invoiceId: string, date: string, o: { kind?: ReductionKind; chargeKind?: string; note?: string } = {}): Promise<string[]> {
  if (!(await accrues(tx, invoiceId))) return [];
  const [inv] = await tx.select().from(feeInvoices).where(eq(feeInvoices.id, invoiceId)).for('update');
  if (!inv) return [];
  const lines = await tx.select().from(feeInvoiceLines).where(eq(feeInvoiceLines.invoiceId, invoiceId));
  // An invoice raised without lines (an older path) is booked as one charge under its amount.
  const byHead = new Map<string, { gross: number; waived: number; gst: number; name: string }>();
  for (const l of lines) {
    const h = byHead.get(l.headCode) ?? { gross: 0, waived: 0, gst: Number(l.gstRate), name: l.headName };
    h.gross += l.amountPaise;
    h.waived += l.waivedPaise;
    byHead.set(l.headCode, h);
  }
  if (!lines.length) byHead.set('GEN', { gross: inv.amountPaise, waived: 0, gst: 0, name: inv.title });
  const booked = await tx
    .select({
      head: feeAccruals.headCode,
      charged: sql<number>`coalesce(sum(${feeAccruals.paise}) filter (where ${feeAccruals.kind} in (${sql.join(CHARGE_KINDS.map((k) => sql`${k}`), sql`, `)})), 0)::bigint`.mapWith(Number),
      reduced: sql<number>`coalesce(-sum(${feeAccruals.paise}) filter (where ${feeAccruals.kind} not in (${sql.join(CHARGE_KINDS.map((k) => sql`${k}`), sql`, `)})), 0)::bigint`.mapWith(Number),
    })
    .from(feeAccruals)
    .where(eq(feeAccruals.invoiceId, invoiceId))
    .groupBy(feeAccruals.headCode);
  const seen = new Map(booked.map((b) => [b.head, b]));
  for (const b of booked) if (!byHead.has(b.head)) byHead.set(b.head, { gross: 0, waived: 0, gst: 0, name: b.head });
  const cancelled = inv.status === 'cancelled';
  const chargeKind = o.chargeKind ?? (inv.kind === 'arrears' ? 'arrears' : inv.kind === 'charge' ? 'charge' : 'fee');
  const out: string[] = [];
  for (const [head, h] of byHead) {
    const b = seen.get(head) ?? { charged: 0, reduced: 0 };
    // Cancelling undoes what was booked: the charge comes off income, a reduction comes back.
    const chargeDelta = (cancelled ? 0 : h.gross) - b.charged;
    const reduceDelta = (cancelled ? 0 : h.waived) - b.reduced;
    if (chargeDelta !== 0) out.push(...(await book(tx, ctx, inv, head, h, chargeDelta, chargeDelta > 0 ? chargeKind : cancelled ? 'cancel' : 'charge_reversal', date, o.note)));
    if (reduceDelta !== 0) out.push(...(await book(tx, ctx, inv, head, h, -reduceDelta, reduceDelta > 0 ? (o.kind ?? 'adjustment') : 'reinstated', date, o.note)));
  }
  return out;
}

/**
 * One accrual row and its journal: a positive amount charges (receivable against income), a negative one reduces
 * (an expense, or income reversed, against the receivable). Charges reversed (negative charge delta) go back through
 * income too; a reduction taken back (positive reduction delta) reinstates the receivable against the same expense.
 */
async function book(tx: Tx, ctx: { tenantId: string; userId?: string | null }, inv: typeof feeInvoices.$inferSelect, head: string, h: { gst: number; name: string }, paise: number, kind: string, date: string, note?: string): Promise<string[]> {
  const effective = kind === 'reinstated' ? await lastReductionKind(tx, inv.id, head) : kind;
  // Charges, their reversals and revisions go through the head's income; other reductions through their expense.
  const chargeSide = CHARGE_KINDS.includes(effective) || effective === 'revision';
  const [row] = await tx.insert(feeAccruals).values({ tenantId: ctx.tenantId, invoiceId: inv.id, headCode: head, kind, paise, note: (note ?? '').slice(0, 300) }).returning();
  if (NO_BOOKS.has(effective)) return [];
  try {
    return await tx.transaction(async (sp) => {
      await ensureChart(sp, ctx.tenantId);
      const rec = await accountByCode(sp, await receivableCode(sp)).catch(() => accountByCode(sp, '1100'));
      const account = await feeAccountById(sp, inv.feeAccountId);
      const [st] = await sp.select({ name: students.fullName }).from(students).where(eq(students.id, inv.studentId));
      const amount = Math.abs(paise);
      const lines: LineInput[] = [];
      if (chargeSide) {
        // Income (GST split out) against the receivable; reversed when the charge comes off.
        const [hd] = await sp.select({ code: feeHeads.accountCode }).from(feeHeads).where(eq(feeHeads.code, head));
        const income = await accountByCode(sp, hd?.code ?? POSTING.feeIncome).catch(() => accountByCode(sp, POSTING.feeIncome));
        const taxable = h.gst > 0 ? Math.round((amount * 100) / (100 + h.gst)) : amount;
        const up = paise > 0;
        lines.push({ accountId: rec.id, debitPaise: up ? amount : 0, creditPaise: up ? 0 : amount });
        lines.push({ accountId: income.id, debitPaise: up ? 0 : taxable, creditPaise: up ? taxable : 0 });
        if (amount - taxable > 0) {
          const gst = await ensureAccount(sp, ctx.tenantId, FEE_ACCOUNTS.gst.code, FEE_ACCOUNTS.gst.name, FEE_ACCOUNTS.gst.group);
          lines.push({ accountId: gst.id, debitPaise: up ? 0 : amount - taxable, creditPaise: up ? amount - taxable : 0 });
        }
      } else {
        const a = ACCRUAL_ACCOUNTS[effective] ?? ACCRUAL_ACCOUNTS.adjustment;
        const expense = effective === 'withdrawal' ? await accountByCode(sp, POSTING.refunds) : await ensureAccount(sp, ctx.tenantId, a.code, a.name, a.group);
        const reduce = paise < 0;
        lines.push({ accountId: expense.id, debitPaise: reduce ? amount : 0, creditPaise: reduce ? 0 : amount });
        lines.push({ accountId: rec.id, debitPaise: reduce ? 0 : amount, creditPaise: reduce ? amount : 0 });
      }
      const label: Record<string, string> = { fee: 'Fee charged', charge: 'Charge raised', fine: 'Late fee charged', bounce_charge: 'Cheque return charge', revision: 'Fee revised down', charge_reversal: 'Charge taken off', cancel: 'Invoice cancelled', concession: 'Concession allowed', scholarship: 'Scholarship allowed', waiver: 'Waived', write_off: 'Written off', withdrawal: 'Withdrawal: charge stopped', adjustment: 'Fee adjusted', reinstated: 'Reduction taken back' };
      const v = await postVoucher(sp, { tenantId: ctx.tenantId, userId: ctx.userId ?? undefined }, {
        type: 'journal',
        date,
        narration: `${label[kind] ?? kind}: ${h.name} on ${inv.invoiceNo ?? inv.title} (${st?.name ?? 'student'})${note ? ` - ${note}` : ''}`.slice(0, 300),
        lines,
        sourceType: 'fee_accrual',
        sourceId: row.id,
        fundId: account?.fundId ?? null,
      });
      await sp.update(feeAccruals).set({ voucherId: v.id }).where(eq(feeAccruals.id, row.id));
      return [v.id];
    });
  } catch (e) {
    console.warn(`Books: accrual ${kind} on invoice ${inv.id} was not posted: ${(e as Error).message}`);
    return [];
  }
}

async function lastReductionKind(tx: Tx, invoiceId: string, head: string): Promise<string> {
  const [r] = await tx.select({ k: feeAccruals.kind }).from(feeAccruals).where(and(eq(feeAccruals.invoiceId, invoiceId), eq(feeAccruals.headCode, head), sql`${feeAccruals.paise} < 0`, sql`${feeAccruals.kind} not in (${sql.join(CHARGE_KINDS.map((k) => sql`${k}`), sql`, `)}, 'reinstated')`)).orderBy(sql`${feeAccruals.createdAt} desc`).limit(1);
  return r?.k ?? 'adjustment';
}

/** A receipt on the accrual basis: money in (or the advance used) against the receivable; a convenience fee to other income. */
export async function postReceivableCollection(
  tx: Tx,
  p: { tenantId: string; userId?: string | null; paymentId: string; date: string; receiptNo: string; student: string; method: string; moneyAccountCode: string; paise: number; conveniencePaise: number; otherIncomeCode: string; fundId: string | null },
): Promise<void> {
  try {
    await tx.transaction(async (sp) => {
      await ensureChart(sp, p.tenantId);
      const rec = await accountByCode(sp, await receivableCode(sp)).catch(() => accountByCode(sp, '1100'));
      const fromCredit = p.method === 'credit';
      const debit = fromCredit ? await ensureAccount(sp, p.tenantId, FEE_ACCOUNTS.advance.code, FEE_ACCOUNTS.advance.name, FEE_ACCOUNTS.advance.group) : await accountByCode(sp, p.moneyAccountCode).catch(() => accountByCode(sp, POSTING.bank));
      const lines: LineInput[] = [{ accountId: debit.id, debitPaise: p.paise + p.conveniencePaise, creditPaise: 0 }, { accountId: rec.id, debitPaise: 0, creditPaise: p.paise }];
      if (p.conveniencePaise > 0) lines.push({ accountId: (await accountByCode(sp, p.otherIncomeCode).catch(() => accountByCode(sp, '4100'))).id, debitPaise: 0, creditPaise: p.conveniencePaise });
      await postVoucher(sp, { tenantId: p.tenantId, userId: p.userId ?? undefined }, { type: fromCredit ? 'journal' : 'receipt', date: p.date, narration: `Fee receipt ${p.receiptNo} from ${p.student}${fromCredit ? ' (from advance)' : ''}`, lines, sourceType: 'fee_payment', sourceId: p.paymentId, fundId: p.fundId });
    });
  } catch (e) {
    console.warn(`Books: fee receipt ${p.receiptNo} was not posted: ${(e as Error).message}`);
  }
}
