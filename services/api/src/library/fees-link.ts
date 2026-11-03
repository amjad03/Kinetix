import { ConflictException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import type { Tx } from '../db/db.service.js';
import { feeInvoices, libraryBooks, libraryLoans } from '../db/schema.js';
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
