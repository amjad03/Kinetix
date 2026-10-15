import { ConflictException, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import type { Tx } from '../db/db.service.js';
import { examFeeDues, feeInvoices, feePayments, revaluationRequests, students } from '../db/schema.js';
import { DomainEvents, EventBus } from '../events/events.js';
import { headsOf, raiseInvoice } from '../fees/fee-lines.js';
import { auditCell } from './common.js';

/**
 * Exam and revaluation fees go through the fees module: each is an invoice on the student's account under the exam
 * fee head, paid at the counter, online or from the apps like any other fee. Paying it settles the exam fee due (or
 * lets the revaluation request be decided); `syncExamFees` reads the invoices, and a FeePaid consumer does it at once.
 */

/** The exam head (kind "exam", seeded as EXM), or the general head when an institution removed it. */
async function examHead(tx: Tx, tenantId: string) {
  const heads = await headsOf(tx, tenantId);
  const h = heads.find((x) => x.kind === 'exam') ?? heads.find((x) => x.code === 'EXM') ?? heads[0];
  return h ? { code: h.code, name: h.name, priority: h.sortOrder, gstRate: h.gstRate } : { code: 'EXM', name: 'Examination fee', priority: 30, gstRate: 0 };
}

const inDays = (from: Date, days: number) => new Date(from.getTime() + days * 86_400_000).toISOString().slice(0, 10);

/**
 * Puts the exam fee of a candidate on their fee account: one invoice per session. A changed amount replaces an unpaid
 * invoice (the old one is cancelled); a fee that is already part-paid cannot change here.
 */
export async function chargeExamFee(
  tx: Tx,
  p: UserPrincipal,
  v: { sessionId: string; studentId: string; sessionName: string; papers: number; amountPaise: number; note: string | null; now: Date; dueInDays?: number },
): Promise<{ dueId: string; invoiceId: string | null }> {
  const [st] = await tx.select({ sectionId: students.sectionId }).from(students).where(eq(students.id, v.studentId));
  const [due] = await tx.select().from(examFeeDues).where(and(eq(examFeeDues.sessionId, v.sessionId), eq(examFeeDues.studentId, v.studentId)));
  if (due && due.status !== 'due') {
    if (due.amountPaise === v.amountPaise) return { dueId: due.id, invoiceId: due.feeInvoiceId };
    throw new ConflictException('The exam fee is already settled; the application can no longer change its fee');
  }
  let invoiceId = due?.feeInvoiceId ?? null;
  if (invoiceId) {
    const [inv] = await tx.select().from(feeInvoices).where(eq(feeInvoices.id, invoiceId));
    if (inv && inv.amountPaise === v.amountPaise && inv.status !== 'cancelled') {
      await tx.update(examFeeDues).set({ papers: v.papers, note: v.note }).where(eq(examFeeDues.id, due!.id));
      return { dueId: due!.id, invoiceId };
    }
    if (inv && inv.paidPaise > 0) throw new ConflictException('Part of the exam fee is paid; ask the accounts office to adjust it');
    if (inv) await tx.update(feeInvoices).set({ status: 'cancelled', updatedAt: v.now }).where(eq(feeInvoices.id, inv.id));
    invoiceId = null;
  }
  if (v.amountPaise > 0 && st) {
    const head = await examHead(tx, p.tenantId);
    const inv = await raiseInvoice(tx, { tenantId: p.tenantId, studentId: v.studentId, sectionId: st.sectionId, title: `Examination fee: ${v.sessionName}`.slice(0, 200), dueOn: inDays(v.now, v.dueInDays ?? 7), createdBy: p.userId, kind: 'charge', lines: [{ ...head, amountPaise: v.amountPaise }] });
    invoiceId = inv.id;
  }
  const values = { papers: v.papers, amountPaise: v.amountPaise, status: v.amountPaise > 0 ? 'due' : 'waived', note: v.note ?? (v.amountPaise > 0 ? null : 'No fee for this application'), feeInvoiceId: invoiceId };
  const [row] = await tx
    .insert(examFeeDues)
    .values({ tenantId: p.tenantId, sessionId: v.sessionId, studentId: v.studentId, ...values })
    .onConflictDoUpdate({ target: [examFeeDues.sessionId, examFeeDues.studentId], set: values })
    .returning({ id: examFeeDues.id });
  await auditCell(tx, p, 'exam.fee.charged', 'exam_fee', v.studentId, { data: { sessionId: v.sessionId, amountPaise: v.amountPaise, invoiceId } });
  return { dueId: row.id, invoiceId };
}

/** Raises the invoice for a revaluation, retotalling or photocopy fee and links it to the request. */
export async function chargeRevaluationFee(tx: Tx, p: UserPrincipal, v: { requestId: string; studentId: string; title: string; amountPaise: number; now: Date }): Promise<string | null> {
  if (v.amountPaise <= 0) return null;
  const [st] = await tx.select({ sectionId: students.sectionId }).from(students).where(eq(students.id, v.studentId));
  if (!st) return null;
  const head = await examHead(tx, p.tenantId);
  const inv = await raiseInvoice(tx, { tenantId: p.tenantId, studentId: v.studentId, sectionId: st.sectionId, title: v.title.slice(0, 200), dueOn: inDays(v.now, 3), createdBy: p.userId, kind: 'charge', lines: [{ ...head, amountPaise: v.amountPaise }] });
  await tx.update(revaluationRequests).set({ feeInvoiceId: inv.id }).where(eq(revaluationRequests.id, v.requestId));
  return inv.id;
}

/** The receipt of the latest paid payment of each invoice. */
async function receipts(tx: Tx, invoiceIds: string[]): Promise<Map<string, string | null>> {
  if (!invoiceIds.length) return new Map();
  const rows = await tx.select({ invoiceId: feePayments.invoiceId, receiptNo: feePayments.receiptNo }).from(feePayments).where(and(inArray(feePayments.invoiceId, invoiceIds), eq(feePayments.status, 'paid'))).orderBy(desc(feePayments.paidAt));
  const out = new Map<string, string | null>();
  for (const r of rows) if (!out.has(r.invoiceId)) out.set(r.invoiceId, r.receiptNo);
  return out;
}

/** Settles the exam fee dues whose invoices are paid; returns how many it settled. */
export async function syncExamFees(tx: Tx, scope: { sessionId?: string; studentId?: string; invoiceIds?: string[] } = {}): Promise<number> {
  const rows = await tx
    .select({ id: examFeeDues.id, invoiceId: examFeeDues.feeInvoiceId })
    .from(examFeeDues)
    .innerJoin(feeInvoices, eq(feeInvoices.id, examFeeDues.feeInvoiceId))
    .where(
      and(
        eq(examFeeDues.status, 'due'),
        isNotNull(examFeeDues.feeInvoiceId),
        eq(feeInvoices.status, 'paid'),
        scope.sessionId ? eq(examFeeDues.sessionId, scope.sessionId) : undefined,
        scope.studentId ? eq(examFeeDues.studentId, scope.studentId) : undefined,
        scope.invoiceIds?.length ? inArray(examFeeDues.feeInvoiceId, scope.invoiceIds) : undefined,
      ),
    );
  if (!rows.length) return 0;
  const rc = await receipts(tx, rows.map((r) => r.invoiceId!));
  for (const r of rows) await tx.update(examFeeDues).set({ status: 'paid', receiptNo: rc.get(r.invoiceId!) ?? null, settledAt: new Date() }).where(eq(examFeeDues.id, r.id));
  return rows.length;
}

/** Whether a revaluation request's fee is settled: no fee, no invoice (recorded before invoices), or a paid invoice. */
export async function revaluationFeeState(tx: Tx, r: { feePaise: number; feeInvoiceId: string | null }): Promise<'none' | 'paid' | 'due' | 'cancelled'> {
  if (!r.feeInvoiceId || r.feePaise <= 0) return 'none';
  const [inv] = await tx.select({ status: feeInvoices.status }).from(feeInvoices).where(eq(feeInvoices.id, r.feeInvoiceId));
  return inv?.status === 'paid' ? 'paid' : inv?.status === 'cancelled' ? 'cancelled' : 'due';
}

/** Applies a payment to the exam fee it pays for, as soon as it is received (the dispatcher's transaction, by invoice id). */
@Injectable()
export class ExamFeeSync implements OnApplicationBootstrap {
  constructor(private readonly bus: EventBus) {}

  /** The fees module already tells the family about the payment; this only settles the exam fee due it pays for. */
  onApplicationBootstrap(): void {
    this.bus.subscribe('exam-fees', [DomainEvents.FeePaid], async (e, tx) => {
      const invoiceId = (e.payload as { invoiceId?: string } | null)?.invoiceId;
      if (invoiceId) await syncExamFees(tx, { invoiceIds: [invoiceId] });
    });
  }
}
