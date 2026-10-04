var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { localParts } from '../common/time.js';
import { feeInvoices, feePayments, guardians, receiptCounters, sections, students, tenants } from '../db/schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';
export const FEE_ROLES = ['tenant_admin', 'principal', 'accountant'];
/** "2026-27" for a date in the Indian financial year (April to March). */
export function financialYear(date) {
    const [y, m] = date.split('-').map(Number);
    const start = m >= 4 ? y : y - 1;
    return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}
let FeesService = class FeesService {
    constructor(notifications) {
        this.notifications = notifications;
    }
    isFeeStaff(p) {
        return p.roles.some((r) => FEE_ROLES.includes(r));
    }
    /** Fee staff, the student, or one of their guardians. 404 otherwise. */
    async assertCanSee(tx, p, studentId) {
        if (this.isFeeStaff(p)) {
            const [s] = await tx.select({ id: students.id }).from(students).where(eq(students.id, studentId));
            if (!s)
                throw new NotFoundException('Student not found');
            return;
        }
        const [own] = await tx.select({ id: students.id }).from(students).where(and(eq(students.id, studentId), eq(students.userId, p.userId)));
        if (own)
            return;
        const [g] = await tx.select({ id: guardians.id }).from(guardians).where(and(eq(guardians.studentId, studentId), eq(guardians.userId, p.userId)));
        if (!g)
            throw new NotFoundException('Student not found');
    }
    /**
     * Marks a payment paid, numbers its receipt and credits the invoice. Idempotent: the
     * checkout confirmation and the gateway's webhook may both arrive.
     */
    async markPaid(tx, paymentId, details = {}) {
        const [payment] = await tx.select().from(feePayments).where(eq(feePayments.id, paymentId)).for('update');
        if (!payment)
            throw new NotFoundException('Payment not found');
        if (payment.status === 'paid')
            return payment;
        const [tenant] = await tx.select({ timezone: tenants.timezone }).from(tenants);
        const today = localParts(new Date(), tenant?.timezone ?? 'Asia/Kolkata').date;
        const fy = financialYear(today);
        const [counter] = await tx
            .insert(receiptCounters)
            .values({ tenantId: payment.tenantId, financialYear: fy, lastNo: 1 })
            .onConflictDoUpdate({ target: [receiptCounters.tenantId, receiptCounters.financialYear], set: { lastNo: sql `${receiptCounters.lastNo} + 1` } })
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
            paidPaise: sql `${feeInvoices.paidPaise} + ${payment.amountPaise}`,
            status: sql `case when ${feeInvoices.paidPaise} + ${payment.amountPaise} >= ${feeInvoices.amountPaise} then 'paid'::invoice_status else ${feeInvoices.status} end`,
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
    async receipt(tx, p, paymentId) {
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
        if (!r)
            throw new NotFoundException('Receipt not found');
        await this.assertCanSee(tx, p, r.student.id);
        if (r.payment.status !== 'paid')
            throw new ForbiddenException('This payment has not gone through');
        return {
            receiptNo: r.payment.receiptNo,
            institution: r.institution,
            student: r.student,
            className: r.className,
            invoice: { id: r.invoice.id, title: r.invoice.title, amountPaise: r.invoice.amountPaise, balancePaise: Math.max(0, r.invoice.amountPaise - r.invoice.paidPaise) },
            amountPaise: r.payment.amountPaise,
            method: r.payment.method,
            reference: r.payment.reference ?? r.payment.providerPaymentId,
            paidAt: r.payment.paidAt,
        };
    }
};
FeesService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [NotificationsService])
], FeesService);
export { FeesService };
//# sourceMappingURL=fees.service.js.map