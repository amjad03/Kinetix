import { randomUUID } from 'node:crypto';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, lte, sql } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { localParts } from '../common/time.js';
import type { Tx } from '../db/db.service.js';
import { feeInvoices, feePayments, guardians, receiptCounters, sections, students, tenants } from '../db/schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { RoleName } from '../auth/principal.js';

export const FEE_ROLES: RoleName[] = ['tenant_admin', 'principal', 'accountant'];

/** "2026-27" for a date in the Indian financial year (April to March). */
export function financialYear(date: string): string {
  const [y, m] = date.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

@Injectable()
export class FeesService {
  constructor(private readonly notifications: NotificationsService) {}

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
   * checkout confirmation and the gateway's webhook may both arrive.
   */
  async markPaid(tx: Tx, paymentId: string, details: { providerPaymentId?: string } = {}) {
    const [payment] = await tx.select().from(feePayments).where(eq(feePayments.id, paymentId)).for('update');
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status === 'paid') return payment;

    const [tenant] = await tx.select({ timezone: tenants.timezone }).from(tenants);
    const today = localParts(new Date(), tenant?.timezone ?? 'Asia/Kolkata').date;
    const fy = financialYear(today);
    const [counter] = await tx
      .insert(receiptCounters)
      .values({ tenantId: payment.tenantId, financialYear: fy, lastNo: 1 })
      .onConflictDoUpdate({ target: [receiptCounters.tenantId, receiptCounters.financialYear], set: { lastNo: sql`${receiptCounters.lastNo} + 1` } })
      .returning();
    const receiptNo = `RCPT/${fy}/${String(counter.lastNo).padStart(5, '0')}`;

    const [paid] = await tx
      .update(feePayments)
      .set({ status: 'paid', paidAt: new Date(), receiptNo, providerPaymentId: details.providerPaymentId ?? payment.providerPaymentId })
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
    await this.notifications.feePaid(tx, {
      paymentId,
      studentId: payment.studentId,
      studentName: student?.fullName ?? 'your child',
      title: invoice.title,
      amountPaise: payment.amountPaise,
      receiptNo,
    });
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
