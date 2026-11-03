import { ConflictException } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import type { Tx } from '../db/db.service.js';
import { feeInvoices, libraryBooks, libraryLoans } from '../db/schema.js';
import { libraryMembers } from '../db/schema-lht.js';
import type { EventBus } from '../events/events.js';
import { DomainEvents } from '../events/events.js';
import type { FeesService } from '../fees/fees.service.js';

/**
 * Puts a returned loan's unpaid fine on the student's fee account as its own invoice ("Library fine: <title>"), so it
 * is paid with fees (at the counter or online) and shows in the student's dues. Idempotent: a fine already sent or
 * paid is refused, and the invoice title is unique per loan.
 */
export async function sendFineToFees(tx: Tx, p: UserPrincipal, fees: FeesService, events: EventBus | null, loanId: string, today: string): Promise<{ title: string; invoiceId: string | null; amountPaise: number }> {
  const [l] = await tx.select({ l: libraryLoans, title: libraryBooks.title }).from(libraryLoans).innerJoin(libraryBooks, eq(libraryBooks.id, libraryLoans.bookId)).where(eq(libraryLoans.id, loanId)).for('update', { of: libraryLoans });
  if (!l) throw new ConflictException('Loan not found');
  if (!l.l.studentId) throw new ConflictException('Only a student’s fine can go on the fee account');
  const due = l.l.finePaise - l.l.fineWaivedPaise;
  if (!l.l.returnedAt || due <= 0) throw new ConflictException('There is no fine to collect');
  if (l.l.finePaidAt || l.l.fineInvoiceTitle) throw new ConflictException('This fine is already settled');
  const title = `Library fine: ${l.title.slice(0, 60)} (${loanId.slice(0, 8)})`;
  const res = await fees.chargeStudents(tx, p, title, today, [{ studentId: l.l.studentId, amountPaise: due }]);
  const [inv] = await tx.select({ id: feeInvoices.id }).from(feeInvoices).where(and(eq(feeInvoices.title, title), eq(feeInvoices.studentId, l.l.studentId))).limit(1);
  if (res.charged === 0 && !inv) throw new ConflictException('The fee account could not be charged');
  await tx.update(libraryLoans).set({ fineInvoiceTitle: title, fineInvoiceId: inv?.id ?? null }).where(eq(libraryLoans.id, loanId));
  await auditUser(tx, p, 'library.fine_sent_to_fees', 'library_loan', loanId, { finePaise: due, title, invoiceId: inv?.id ?? null });
  await events?.emit(tx, p.tenantId, { type: DomainEvents.LibraryFineCharged, aggregateType: 'library_loan', aggregateId: loanId, payload: { studentId: l.l.studentId, amountPaise: due, invoiceId: inv?.id ?? null }, actorId: p.userId });
  return { title, invoiceId: inv?.id ?? null, amountPaise: due };
}

/**
 * Puts every unpaid fine of a student member on the fee account (one invoice per loan, each in its own savepoint so
 * one refusal does not stop the rest). Running it again sends nothing: settled fines are left out.
 */
export async function sendMemberFinesToFees(tx: Tx, p: UserPrincipal, fees: FeesService, events: EventBus | null, memberId: string, today: string) {
  const [m] = await tx.select().from(libraryMembers).where(eq(libraryMembers.id, memberId));
  if (!m) return null;
  if (!m.studentId) throw new ConflictException('Only a student’s fines can go on the fee account');
  const loans = await tx
    .select({ id: libraryLoans.id })
    .from(libraryLoans)
    .where(and(sql`(${libraryLoans.memberId} = ${m.id} or ${libraryLoans.studentId} = ${m.studentId})`, sql`${libraryLoans.returnedAt} is not null`, isNull(libraryLoans.finePaidAt), isNull(libraryLoans.fineInvoiceTitle), sql`${libraryLoans.finePaise} > ${libraryLoans.fineWaivedPaise}`));
  const results: { loanId: string; ok: boolean; amountPaise?: number; title?: string; message?: string }[] = [];
  for (const l of loans) {
    try {
      const r = await tx.transaction((sp) => sendFineToFees(sp, p, fees, events, l.id, today));
      results.push({ loanId: l.id, ok: true, ...r });
    } catch (e) {
      results.push({ loanId: l.id, ok: false, message: (e as Error).message });
    }
  }
  return { sent: results.filter((r) => r.ok).length, totalPaise: results.reduce((s, r) => s + (r.amountPaise ?? 0), 0), results };
}
