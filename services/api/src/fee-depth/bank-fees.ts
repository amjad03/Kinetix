import { and, eq, inArray, sql } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import type { Tx } from '../db/db.service.js';
import { acctBankLines, feeChallans, feeStudentProfiles } from '../db/schema-fee-depth.js';
import { acctVoucherLines, acctVouchers, bankTransferSubmissions, feeInvoices, feePayments } from '../db/schema.js';
import type { CollectionService } from './collection.service.js';

type Line = typeof acctBankLines.$inferSelect;

/** Challan numbers as the bank writes them in the narration: "CHL/2026-27/00012", "CHL 2026-27 12", "CHL2026-2700012". */
export const challanKey = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
/** UTRs: 12 (IMPS RRN) to 22 characters, letters and digits. */
const UTR = /\b([A-Z]{4}[A-Z0-9]{8,18}|\d{12,16})\b/g;

export interface FeeMatch {
  lineId: string;
  kind: 'challan' | 'transfer' | 'fee_ref';
  receiptNo: string;
  studentId: string;
}

/**
 * Bank credits that are fees, found in an imported statement and receipted on their own:
 * - a bank challan whose number is in the narration and whose amount it is (the challan is then paid);
 * - a family's NEFT/IMPS/RTGS reported in the app, by its UTR and amount (the report is then verified);
 * - a credit quoting a student's fee reference (on challans, the UPI reference and the virtual account), paid
 *   against that student's dues oldest first, with anything more kept as advance.
 * Each line is matched to the receipt it made (and its voucher when that is on this bank ledger). Runs in a
 * savepoint per line, so one bad line leaves the others.
 */
export async function matchFeeCredits(tx: Tx, p: UserPrincipal, accountId: string, lines: Line[], collection: CollectionService): Promise<FeeMatch[]> {
  const credits = lines.filter((l) => l.status === 'unmatched' && l.creditPaise > 0);
  if (!credits.length) return [];
  const challans = await tx.select().from(feeChallans).where(eq(feeChallans.status, 'issued'));
  const transfers = await tx.select().from(bankTransferSubmissions).where(eq(bankTransferSubmissions.status, 'pending'));
  const refs = await tx.select({ studentId: feeStudentProfiles.studentId, ref: feeStudentProfiles.feeRef }).from(feeStudentProfiles).where(sql`${feeStudentProfiles.feeRef} is not null`);
  const out: FeeMatch[] = [];
  for (const l of credits) {
    const text = `${l.description} ${l.reference}`;
    const key = challanKey(text);
    const hit = await tx.transaction(async (sp) => {
      try {
        // 1. A challan.
        const c = challans.find((x) => x.status === 'issued' && key.includes(challanKey(x.number)) && x.amountPaise === l.creditPaise);
        if (c) {
          const v = await collection.collect(sp, p, { studentId: c.studentId, modes: [{ method: 'bank_transfer', amountPaise: c.amountPaise, reference: `Challan ${c.number} ${l.reference}`.trim().slice(0, 100) }], invoiceIds: c.invoiceIds, keepExcess: true, date: l.txnDate, note: `Bank challan ${c.number} (statement)` });
          await sp.update(feeChallans).set({ status: 'paid', paidOn: l.txnDate, bankRef: l.reference || null, receiptId: v.id }).where(eq(feeChallans.id, c.id));
          c.status = 'paid';
          return { kind: 'challan' as const, receiptId: v.id, receiptNo: v.receiptNo, studentId: c.studentId };
        }
        // 2. A transfer the family reported, by UTR.
        const utrs = new Set([...text.toUpperCase().matchAll(UTR)].map((m) => m[1]));
        const t = transfers.find((x) => x.status === 'pending' && utrs.has(x.utr.toUpperCase()) && x.amountPaise === l.creditPaise);
        if (t) {
          const [inv] = await sp.select().from(feeInvoices).where(eq(feeInvoices.id, t.invoiceId));
          const v = await collection.collect(sp, p, { studentId: t.studentId, modes: [{ method: 'bank_transfer', amountPaise: t.amountPaise, reference: t.utr }], invoiceIds: inv?.status === 'due' ? [t.invoiceId] : undefined, keepExcess: true, date: l.txnDate, note: `NEFT ${t.utr} (statement)` });
          const [pay] = await sp.select({ id: feePayments.id }).from(feePayments).where(eq(feePayments.receiptId, v.id)).limit(1);
          await sp.update(bankTransferSubmissions).set({ status: 'verified', reviewedBy: p.userId, reviewedAt: new Date(), reviewNote: 'Matched to the bank statement', paymentId: pay?.id ?? null }).where(eq(bankTransferSubmissions.id, t.id));
          t.status = 'verified';
          return { kind: 'transfer' as const, receiptId: v.id, receiptNo: v.receiptNo, studentId: t.studentId };
        }
        // 3. A student's fee reference.
        const r = refs.find((x) => x.ref && key.includes(challanKey(x.ref)));
        if (r) {
          const v = await collection.collect(sp, p, { studentId: r.studentId, modes: [{ method: 'bank_transfer', amountPaise: l.creditPaise, reference: (l.reference || l.description).slice(0, 100) }], keepExcess: true, date: l.txnDate, note: `Bank credit quoting ${r.ref}` });
          return { kind: 'fee_ref' as const, receiptId: v.id, receiptNo: v.receiptNo, studentId: r.studentId };
        }
        return null;
      } catch (e) {
        console.warn(`Bank line ${l.id} looked like a fee but was not receipted: ${(e as Error).message}`);
        return null;
      }
    });
    if (!hit) continue;
    // The receipt's voucher on this bank ledger, when the money was booked to it.
    const [v] = await tx
      .select({ id: acctVouchers.id })
      .from(acctVouchers)
      .innerJoin(acctVoucherLines, eq(acctVoucherLines.voucherId, acctVouchers.id))
      .where(and(eq(acctVouchers.sourceType, 'fee_payment'), eq(acctVoucherLines.accountId, accountId), inArray(acctVouchers.sourceId, sql`(select id::text from fee_payments where receipt_id = ${hit.receiptId}::uuid)`), sql`not exists (select 1 from acct_bank_lines b where b.voucher_id = ${acctVouchers.id})`))
      .limit(1);
    await tx.update(acctBankLines).set({ status: 'matched', voucherId: v?.id ?? null, receiptId: hit.receiptId, studentId: hit.studentId, matchKind: hit.kind, matchedBy: p.userId, matchedAt: new Date() }).where(eq(acctBankLines.id, l.id));
    l.status = 'matched';
    out.push({ lineId: l.id, kind: hit.kind, receiptNo: hit.receiptNo, studentId: hit.studentId });
  }
  if (out.length) await auditUser(tx, p, 'bank.fee_credits_receipted', 'acct_bank_statement', undefined, { accountId, receipted: out.length, kinds: out.map((o) => o.kind) });
  return out;
}
