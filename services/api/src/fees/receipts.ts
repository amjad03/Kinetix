import { ConflictException, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { postFeeCollection, reverseSource } from '../books/books.service.js';
import type { Tx } from '../db/db.service.js';
import { feeReceipts, feePaymentAllocations, feeInvoiceLines, acctFunds } from '../db/schema-fee-depth.js';
import { studentCredits } from '../db/schema-depth.js';
import { feeInvoices, feePayments, receiptCounters, students } from '../db/schema.js';
import { DEFAULT_SERIES, formatSeries, fyOf } from '../fee-accounts/fee-accounts.logic.js';
import { settingsOf } from '../fee-accounts/fee-accounts.service.js';
import { headsOf } from './fee-lines.js';

/** Receipt numbers, the books for a payment, and taking a receipt back (cancelled or a bounced cheque). */

/**
 * The next receipt number on `date`: the institution's receipt series, restarting each financial year, or a head's
 * own series (its prefix) when every rupee of the receipt went to that head.
 */
export async function nextReceiptNo(tx: Tx, tenantId: string, date: string, headPrefix?: string | null): Promise<string> {
  const fy = fyOf(date);
  const key = headPrefix ? `${fy}:${headPrefix}` : fy;
  const [counter] = await tx
    .insert(receiptCounters)
    .values({ tenantId, financialYear: key, lastNo: 1 })
    .onConflictDoUpdate({ target: [receiptCounters.tenantId, receiptCounters.financialYear], set: { lastNo: sql`${receiptCounters.lastNo} + 1` } })
    .returning();
  const s = await settingsOf(tx, tenantId);
  const base = s.series.receipt ?? DEFAULT_SERIES.receipt;
  return formatSeries(headPrefix ? { prefix: headPrefix, next: 1, pad: base.pad } : base, date, counter.lastNo);
}

/** The receipt series a set of heads takes: a head's own prefix when they are all that one head. */
export async function prefixFor(tx: Tx, tenantId: string, headCodes: string[]): Promise<string | null> {
  const codes = [...new Set(headCodes)];
  if (codes.length !== 1) return null;
  const h = (await headsOf(tx, tenantId)).find((x) => x.code === codes[0]);
  return h?.receiptPrefix || null;
}

/** The cash or bank ledger a payment mode lands in (Settings → payment modes). */
export function moneyAccountFor(s: Awaited<ReturnType<typeof settingsOf>>, method: string): string {
  const mode = method === 'card' ? 'online' : method === 'scholarship' ? 'bank_transfer' : method;
  return s.paymentModes.find((m) => m.mode === mode)?.accountCode ?? (method === 'cash' ? s.mappings.cash : s.mappings.bank);
}

/** Posts a paid payment to the books from its allocation: each head's income ledger and fund, GST split out. */
export async function postPayment(tx: Tx, pay: typeof feePayments.$inferSelect, receiptNo: string, date: string, userId?: string | null): Promise<void> {
  const s = await settingsOf(tx, pay.tenantId);
  const heads = new Map((await headsOf(tx, pay.tenantId)).map((h) => [h.code, h]));
  const funds = new Map((await tx.select({ id: acctFunds.id, code: acctFunds.code }).from(acctFunds)).map((f) => [f.code, f.id]));
  const allocs = await tx
    .select({ headCode: feePaymentAllocations.headCode, paise: feePaymentAllocations.amountPaise, gst: feeInvoiceLines.gstRate })
    .from(feePaymentAllocations)
    .leftJoin(feeInvoiceLines, eq(feeInvoiceLines.id, feePaymentAllocations.lineId))
    .where(eq(feePaymentAllocations.paymentId, pay.id));
  const credits = allocs.length
    ? allocs.map((a) => {
        const h = heads.get(a.headCode);
        return { accountCode: h?.accountCode ?? s.mappings.feeIncome, fundId: (h?.fundCode && funds.get(h.fundCode)) || null, paise: a.paise, gstRate: Number(a.gst ?? h?.gstRate ?? 0) };
      })
    : [{ accountCode: s.mappings.feeIncome, fundId: null, paise: pay.amountPaise, gstRate: 0 }];
  // A convenience fee the payer added goes to other income (it pays the gateway's charge).
  if (pay.conveniencePaise > 0) credits.push({ accountCode: s.mappings.otherIncome ?? '4100', fundId: null, paise: pay.conveniencePaise, gstRate: 0 });
  const [st] = await tx.select({ name: students.fullName }).from(students).where(eq(students.id, pay.studentId));
  await postFeeCollection(tx, { tenantId: pay.tenantId, userId, paymentId: pay.id, date, receiptNo, student: st?.name ?? 'student', method: pay.method, moneyAccountCode: moneyAccountFor(s, pay.method), credits });
}

/** A student's advance credit balance. */
export async function creditBalance(tx: Tx, studentId: string): Promise<number> {
  const [r] = await tx.select({ n: sql<number>`coalesce(sum(${studentCredits.amountPaise}), 0)::bigint`.mapWith(Number) }).from(studentCredits).where(eq(studentCredits.studentId, studentId));
  return r?.n ?? 0;
}

/**
 * Takes a receipt back: every payment on it stops counting (cancelled, or failed for a bounced cheque), the invoices
 * are due again, money paid from advance credit goes back to the credit, advance taken on the receipt comes off the
 * credit, and the books get reversing vouchers dated `date`. The receipt itself is kept, marked.
 */
export async function reverseReceipt(tx: Tx, ctx: { tenantId: string; userId: string }, receiptId: string, o: { status: 'cancelled' | 'bounced'; date: string; reason: string }): Promise<typeof feeReceipts.$inferSelect> {
  const [r] = await tx.select().from(feeReceipts).where(eq(feeReceipts.id, receiptId)).for('update');
  if (!r) throw new NotFoundException('Receipt not found');
  if (r.status === 'cancelled' || r.status === 'bounced') throw new ConflictException('This receipt has already been taken back');
  if (r.advancePaise > 0 && (await creditBalance(tx, r.studentId)) < r.advancePaise) throw new ConflictException('The advance taken on this receipt has been used against other fees; take those back first');
  const pays = await tx.select().from(feePayments).where(and(eq(feePayments.receiptId, receiptId), eq(feePayments.status, 'paid'))).for('update');
  const refunded = await tx.execute<{ n: number }>(sql`select count(*)::int as n from fee_refunds where payment_id in (${sql.join(pays.length ? pays.map((p) => sql`${p.id}::uuid`) : [sql`null::uuid`], sql`, `)})`);
  if (Number(refunded.rows[0]?.n ?? 0) > 0) throw new ConflictException('Part of this receipt has been refunded; it cannot be taken back');
  const label = o.status === 'bounced' ? 'Cheque returned' : 'Receipt cancelled';
  for (const pay of pays) {
    await tx.update(feePayments).set({ status: o.status === 'bounced' ? 'failed' : 'cancelled' }).where(eq(feePayments.id, pay.id));
    await tx
      .update(feeInvoices)
      .set({ paidPaise: sql`${feeInvoices.paidPaise} - ${pay.amountPaise}`, status: sql`case when ${feeInvoices.status} = 'cancelled' then 'cancelled'::invoice_status when ${feeInvoices.paidPaise} - ${pay.amountPaise} >= ${feeInvoices.amountPaise} then 'paid'::invoice_status else 'due'::invoice_status end`, updatedAt: new Date() })
      .where(eq(feeInvoices.id, pay.invoiceId));
    if (pay.method === 'credit') await tx.insert(studentCredits).values({ tenantId: ctx.tenantId, studentId: pay.studentId, amountPaise: pay.amountPaise, kind: 'adjustment', invoiceId: pay.invoiceId, note: `${label}: ${r.receiptNo}`, createdBy: ctx.userId });
    await reverseSource(tx, ctx, 'fee_payment', pay.id, o.date, `${label} ${r.receiptNo}: ${o.reason}`, o.status === 'bounced' ? 'cheque_bounce' : 'receipt_cancel');
  }
  if (r.advancePaise > 0) {
    await tx.insert(studentCredits).values({ tenantId: ctx.tenantId, studentId: r.studentId, amountPaise: -r.advancePaise, kind: 'adjustment', note: `${label}: ${r.receiptNo}`, createdBy: ctx.userId });
    await reverseSource(tx, ctx, 'fee_advance', r.id, o.date, `${label} ${r.receiptNo}`, o.status === 'bounced' ? 'cheque_bounce' : 'receipt_cancel');
  }
  const [row] = await tx
    .update(feeReceipts)
    .set({ status: o.status, cancelReason: o.reason, cancelledBy: ctx.userId, cancelledAt: new Date() })
    .where(eq(feeReceipts.id, receiptId))
    .returning();
  return row;
}

/** The invoices a receipt paid, for re-collecting them under a new number (reissue). */
export async function receiptInvoices(tx: Tx, receiptId: string) {
  const pays = await tx.select({ invoiceId: feePayments.invoiceId, amountPaise: feePayments.amountPaise, method: feePayments.method }).from(feePayments).where(eq(feePayments.receiptId, receiptId));
  const ids = [...new Set(pays.map((p) => p.invoiceId))];
  return ids.length ? tx.select().from(feeInvoices).where(inArray(feeInvoices.id, ids)) : [];
}
