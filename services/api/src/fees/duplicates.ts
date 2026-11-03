import { and, eq, gte, ne, sql } from 'drizzle-orm';
import { accountByCode, ensureAccount, ensureChart, FEE_ACCOUNTS, postVoucher } from '../books/books.service.js';
import { POSTING } from '../books/books.logic.js';
import type { Tx } from '../db/db.service.js';
import { feeInvoices, feePayments } from '../db/schema.js';
import { studentCredits } from '../db/schema-depth.js';
import { feeAccountsSettings } from '../db/schema-fee-accounts.js';
import { feePaymentFlags } from '../db/schema-fee-flagship.js';
import { accrues } from './accruals.js';
import { accountOfInvoice } from './fee-accounts-core.js';
import { feeClock, unallocate } from './fee-lines.js';

type Payment = typeof feePayments.$inferSelect;

/** Minutes within which the same student, fee, amount and mode again is taken for a double entry. */
export const DUPLICATE_WINDOW_MINUTES = 15;

/**
 * Flags a payment that looks like money already received, without refusing it (the money is real):
 * - paid_twice_online: an online payment of a fee that was already fully paid (two tabs, a retried checkout);
 * - same_reference: another receipt carries the same UTR, UPI or card reference;
 * - same_amount_day: the same student, fee, amount and mode within a few minutes.
 * Returns the flag, or null.
 */
export async function flagDuplicate(tx: Tx, pay: Payment, _today: string) {
  const [inv] = await tx.select({ amount: feeInvoices.amountPaise, paid: feeInvoices.paidPaise }).from(feeInvoices).where(eq(feeInvoices.id, pay.invoiceId));
  let reason: string | null = null;
  let other: string | null = null;
  let amount = pay.amountPaise;
  if (pay.method === 'online' && inv && inv.paid > inv.amount) {
    reason = 'paid_twice_online';
    amount = Math.min(pay.amountPaise, inv.paid - inv.amount);
    const [prev] = await tx.select({ id: feePayments.id }).from(feePayments).where(and(eq(feePayments.invoiceId, pay.invoiceId), eq(feePayments.status, 'paid'), ne(feePayments.id, pay.id))).orderBy(sql`${feePayments.paidAt} desc`).limit(1);
    other = prev?.id ?? null;
  }
  const ref = pay.reference?.trim() || null;
  if (!reason && ref && ['upi', 'card', 'bank_transfer', 'dd', 'cheque'].includes(pay.method)) {
    const [same] = await tx
      .select({ id: feePayments.id })
      .from(feePayments)
      // Payments made in the same collection (one payment split over two fee accounts' receipts) are one payment.
      .where(and(eq(feePayments.status, 'paid'), ne(feePayments.id, pay.id), eq(feePayments.reference, ref), pay.receiptId ? sql`${feePayments.receiptId} is distinct from ${pay.receiptId}::uuid` : undefined, sql`${feePayments.createdAt} <> (select x.created_at from fee_payments x where x.id = ${pay.id}::uuid)`))
      .limit(1);
    if (same) {
      reason = 'same_reference';
      other = same.id;
    }
  }
  if (!reason && pay.method !== 'credit' && pay.method !== 'scholarship') {
    const since = new Date(feeClock.now().getTime() - DUPLICATE_WINDOW_MINUTES * 60_000);
    const [same] = await tx
      .select({ id: feePayments.id })
      .from(feePayments)
      .where(and(eq(feePayments.status, 'paid'), ne(feePayments.id, pay.id), eq(feePayments.invoiceId, pay.invoiceId), eq(feePayments.amountPaise, pay.amountPaise), eq(feePayments.method, pay.method), gte(feePayments.paidAt, since), pay.receiptId ? sql`${feePayments.receiptId} is distinct from ${pay.receiptId}::uuid` : undefined, sql`${feePayments.createdAt} <> (select x.created_at from fee_payments x where x.id = ${pay.id}::uuid)`))
      .limit(1);
    if (same) {
      reason = 'same_amount_day';
      other = same.id;
    }
  }
  if (!reason) return null;
  const [row] = await tx.insert(feePaymentFlags).values({ tenantId: pay.tenantId, paymentId: pay.id, otherPaymentId: other, studentId: pay.studentId, reason, amountPaise: amount }).onConflictDoNothing().returning();
  return row ?? null;
}

/**
 * Settles a flag: not a duplicate (nothing changes), kept as advance (the extra money leaves the fee and becomes the
 * student's advance credit, journalised from the fee to advance fees), or refunded (the refund is made through the
 * refund desk or the gateway; this records the outcome).
 */
export async function resolveFlag(tx: Tx, ctx: { tenantId: string; userId: string }, flag: typeof feePaymentFlags.$inferSelect, resolution: 'not_duplicate' | 'kept_as_advance' | 'refunded', note: string, date: string) {
  if (resolution === 'kept_as_advance') {
    const [pay] = await tx.select().from(feePayments).where(eq(feePayments.id, flag.paymentId)).for('update');
    const amount = Math.min(flag.amountPaise, pay.amountPaise);
    await unallocate(tx, pay, amount);
    await tx
      .update(feeInvoices)
      .set({ paidPaise: sql`${feeInvoices.paidPaise} - ${amount}`, status: sql`case when ${feeInvoices.status} = 'cancelled' then 'cancelled'::invoice_status when ${feeInvoices.paidPaise} - ${amount} >= ${feeInvoices.amountPaise} then 'paid'::invoice_status else 'due'::invoice_status end`, updatedAt: new Date() })
      .where(eq(feeInvoices.id, pay.invoiceId));
    await tx.insert(studentCredits).values({ tenantId: ctx.tenantId, studentId: pay.studentId, amountPaise: amount, kind: 'advance', invoiceId: pay.invoiceId, note: `Duplicate payment ${pay.receiptNo ?? ''} kept as advance`.trim(), createdBy: ctx.userId });
    // The money stays; what it was booked to (fee income, or the receivable on the accrual basis) moves to advance fees.
    try {
      await tx.transaction(async (sp) => {
        await ensureChart(sp, ctx.tenantId);
        const [s] = await sp.select({ m: feeAccountsSettings.mappings }).from(feeAccountsSettings);
        const from = (await accrues(sp, pay.invoiceId)) ? await accountByCode(sp, s?.m?.receivable ?? '1100') : await accountByCode(sp, s?.m?.feeIncome ?? POSTING.feeIncome);
        const adv = await ensureAccount(sp, ctx.tenantId, FEE_ACCOUNTS.advance.code, FEE_ACCOUNTS.advance.name, FEE_ACCOUNTS.advance.group);
        const account = await accountOfInvoice(sp, pay.invoiceId);
        await postVoucher(sp, { tenantId: ctx.tenantId, userId: ctx.userId }, { type: 'journal', date, narration: `Duplicate payment on ${pay.receiptNo ?? 'receipt'} kept as advance`, lines: [{ accountId: from.id, debitPaise: amount, creditPaise: 0 }, { accountId: adv.id, debitPaise: 0, creditPaise: amount }], sourceType: 'fee_duplicate', sourceId: flag.id, fundId: account?.fundId ?? null });
      });
    } catch (e) {
      console.warn(`Books: duplicate ${flag.id} was not moved to advance: ${(e as Error).message}`);
    }
  }
  const [row] = await tx.update(feePaymentFlags).set({ status: 'resolved', resolution, resolvedBy: ctx.userId, resolvedAt: new Date(), note: note || null }).where(eq(feePaymentFlags.id, flag.id)).returning();
  return row;
}
