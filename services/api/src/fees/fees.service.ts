import { randomUUID } from 'node:crypto';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, lte, sql } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { localParts } from '../common/time.js';
import type { Tx } from '../db/db.service.js';
import { feeInvoices, feePayments, guardians, sections, students, tenants } from '../db/schema.js';
import { feeReceipts } from '../db/schema-fee-depth.js';
import { DomainEvents, EventBus } from '../events/events.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { RoleName } from '../auth/principal.js';
import { allocatePayment } from './fee-lines.js';
import { nextReceiptNo, postPayment, prefixFor } from './receipts.js';

export const FEE_ROLES: RoleName[] = ['tenant_admin', 'principal', 'accountant'];

/** "2026-27" for a date in the Indian financial year (April to March). */
export function financialYear(date: string): string {
  const [y, m] = date.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

@Injectable()
export class FeesService {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly events: EventBus,
  ) {}

  isFeeStaff(p: UserPrincipal): boolean {
    return p.roles.some((r) => FEE_ROLES.includes(r));
  }

  /** Fee staff, the student, or one of their guardians. 404 otherwise. */
  async assertCanSee(tx: Tx, p: UserPrincipal, studentId: string): Promise<void> {
    if (this.isFeeStaff(p)) {
      const [s] = await tx.select({ id: students.id }).from(students).where(eq(students.id, studentId));
      if (!s) throw new NotFoundException('Student not found');
      return;
    }
    const [own] = await tx.select({ id: students.id }).from(students).where(and(eq(students.id, studentId), eq(students.userId, p.userId)));
    if (own) return;
    const [g] = await tx.select({ id: guardians.id }).from(guardians).where(and(eq(guardians.studentId, studentId), eq(guardians.userId, p.userId)));
    if (!g) throw new NotFoundException('Student not found');
  }

  /**
   * Marks a payment paid, numbers its receipt and credits the invoice. Idempotent: the
   * checkout confirmation and the gateway's webhook may both arrive. The payment's split over the invoice's heads is
   * recorded (the given one from the counter, or by head priority), and it posts to each head's ledger. A payment
   * that is part of a receipt made at the counter (several fees or modes) takes that receipt's number; any other gets
   * a receipt of its own.
   */
  async markPaid(tx: Tx, paymentId: string, details: { providerPaymentId?: string; allocations?: { lineId: string; headCode: string; paise: number }[]; notify?: boolean; date?: string } = {}) {
    const [payment] = await tx.select().from(feePayments).where(eq(feePayments.id, paymentId)).for('update');
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status === 'paid') return payment;

    const [tenant] = await tx.select({ timezone: tenants.timezone }).from(tenants);
    const today = details.date ?? localParts(new Date(), tenant?.timezone ?? 'Asia/Kolkata').date;
    const pieces = await allocatePayment(tx, payment, details.allocations);
    let receiptNo: string;
    let receiptId = payment.receiptId;
    if (receiptId) {
      const [r] = await tx.select({ no: feeReceipts.receiptNo }).from(feeReceipts).where(eq(feeReceipts.id, receiptId));
      receiptNo = r.no;
    } else {
      receiptNo = await nextReceiptNo(tx, payment.tenantId, today, await prefixFor(tx, payment.tenantId, pieces.map((x) => x.headCode)));
      const [r] = await tx
        .insert(feeReceipts)
        .values({ tenantId: payment.tenantId, receiptNo, studentId: payment.studentId, totalPaise: payment.amountPaise, modes: [{ method: payment.method, amountPaise: payment.amountPaise, reference: payment.reference ?? details.providerPaymentId ?? null }], collectedBy: payment.recordedBy, collectedOn: today })
        .returning();
      receiptId = r.id;
    }

    const [paid] = await tx
      .update(feePayments)
      .set({ status: 'paid', paidAt: new Date(), receiptNo, receiptId, providerPaymentId: details.providerPaymentId ?? payment.providerPaymentId })
      .where(eq(feePayments.id, paymentId))
      .returning();
    const [invoice] = await tx
      .update(feeInvoices)
      .set({
        paidPaise: sql`${feeInvoices.paidPaise} + ${payment.amountPaise}`,
        status: sql`case when ${feeInvoices.paidPaise} + ${payment.amountPaise} >= ${feeInvoices.amountPaise} then 'paid'::invoice_status else ${feeInvoices.status} end`,
        updatedAt: new Date(),
      })
      .where(eq(feeInvoices.id, payment.invoiceId))
      .returning();
    const [student] = await tx.select({ fullName: students.fullName }).from(students).where(eq(students.id, payment.studentId));
    await this.events.emit(tx, payment.tenantId, { type: DomainEvents.FeePaid, aggregateType: 'fee_payment', aggregateId: paymentId, payload: { invoiceId: payment.invoiceId, studentId: payment.studentId, amountPaise: payment.amountPaise, receiptNo, method: payment.method } });
    if (details.notify !== false)
      await this.notifications.feePaid(tx, {
        paymentId,
        studentId: payment.studentId,
        studentName: student?.fullName ?? 'your child',
        title: invoice.title,
        amountPaise: payment.amountPaise,
        receiptNo,
      });
    await postPayment(tx, paid, receiptNo, today, payment.recordedBy);
    return paid;
  }

  /**
   * Charges fees to individual students (transport, hostel, mess). One invoice per student;
   * a student who already has an invoice with the same title is skipped, so reruns are safe.
   */
  async chargeStudents(tx: Tx, p: UserPrincipal, title: string, dueOn: string, charges: { studentId: string; amountPaise: number }[]): Promise<{ charged: number; skipped: number }> {
    const due = charges.filter((c) => c.amountPaise > 0);
    if (due.length === 0) return { charged: 0, skipped: charges.length };
    const ids = due.map((c) => c.studentId);
    const rows = await tx
      .select({ id: students.id, sectionId: students.sectionId })
      .from(students)
      .where(sql`${students.id} in (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})`);
    const have = await tx
      .select({ studentId: feeInvoices.studentId })
      .from(feeInvoices)
      .where(and(eq(feeInvoices.title, title), sql`${feeInvoices.studentId} in (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})`));
    const skip = new Set(have.map((h) => h.studentId));
    const batchId = randomUUID();
    const sectionOf = new Map(rows.map((r) => [r.id, r.sectionId]));
    const fresh = due.filter((c) => !skip.has(c.studentId) && sectionOf.has(c.studentId));
    if (fresh.length > 0) {
      await tx.insert(feeInvoices).values(fresh.map((c) => ({ tenantId: p.tenantId, studentId: c.studentId, sectionId: sectionOf.get(c.studentId)!, batchId, title, amountPaise: c.amountPaise, dueOn, createdBy: p.userId })));
      for (const c of fresh) await this.notifications.feeIssued(tx, { batchId: `${batchId}:${c.studentId}`, title, amountPaise: c.amountPaise, dueOn, studentIds: [c.studentId] });
    }
    return { charged: fresh.length, skipped: charges.length - fresh.length };
  }

  async receipt(tx: Tx, p: UserPrincipal, paymentId: string) {
    const [r] = await tx
      .select({
        payment: feePayments,
        invoice: { id: feeInvoices.id, title: feeInvoices.title, amountPaise: feeInvoices.amountPaise, paidPaise: feeInvoices.paidPaise },
        student: { id: students.id, fullName: students.fullName, rollNo: students.rollNo },
        className: sections.displayName,
        institution: tenants.name,
      })
      .from(feePayments)
      .innerJoin(feeInvoices, eq(feeInvoices.id, feePayments.invoiceId))
      .innerJoin(students, eq(students.id, feePayments.studentId))
      .innerJoin(sections, eq(sections.id, feeInvoices.sectionId))
      .innerJoin(tenants, eq(tenants.id, feePayments.tenantId))
      .where(eq(feePayments.id, paymentId));
    if (!r) throw new NotFoundException('Receipt not found');
    await this.assertCanSee(tx, p, r.student.id);
    if (r.payment.status !== 'paid') throw new ForbiddenException('This payment has not gone through');
    // The balance as it stood after this payment, not today's, so old receipts stay true.
    const [paidBy] = await tx
      .select({ paise: sql<number>`coalesce(sum(${feePayments.amountPaise}), 0)::bigint`.mapWith(Number) })
      .from(feePayments)
      .where(and(eq(feePayments.invoiceId, r.invoice.id), eq(feePayments.status, 'paid'), lte(feePayments.paidAt, r.payment.paidAt!)));
    return {
      paymentId: r.payment.id,
      receiptNo: r.payment.receiptNo,
      institution: r.institution,
      student: r.student,
      className: r.className,
      invoice: { id: r.invoice.id, title: r.invoice.title, amountPaise: r.invoice.amountPaise, balancePaise: Math.max(0, r.invoice.amountPaise - paidBy.paise) },
      amountPaise: r.payment.amountPaise,
      method: r.payment.method,
      reference: r.payment.reference ?? r.payment.providerPaymentId,
      paidAt: r.payment.paidAt,
    };
  }
}
