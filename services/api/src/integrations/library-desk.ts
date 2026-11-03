import { HttpException } from '@nestjs/common';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import type { Clock } from '../common/time.js';
import type { Tx } from '../db/db.service.js';
import { libraryBooks, libraryLoans } from '../db/schema.js';
import { libraryCopies } from '../db/schema-lht.js';
import { addCopies, ensureStudentMember, issueCopy, returnLoan, type Member } from '../library/circulation.js';
import type { NotificationsService } from '../notifications/notifications.service.js';

export type DeskResult = { ok: true; loanId: string; dueOn?: string; fineP?: number; title: string } | { ok: false; reason: string };

const reasonOf = (e: unknown) => (e instanceof HttpException ? String((e.getResponse() as { message?: unknown }).message ?? e.message) : 'error').replace(/\s+/g, '_').toLowerCase().slice(0, 80);

/**
 * Library issue and return for machines (RFID readers and self-check kiosks over SIP2). They go through the same
 * circulation as the desk: copies from the accession register, the member's category and the rules matrix, unpaid-fine
 * blocks, reservations and holiday-aware fines.
 */
export class LibraryDesk {
  constructor(
    private readonly clock: Clock,
    private readonly notifications: NotificationsService,
  ) {}

  /** The machine acts as the librarian who registered it. */
  private principal(tenantId: string, actorId: string): UserPrincipal {
    return { kind: 'user', tenantId, userId: actorId, roles: ['librarian'] };
  }

  /** A copy of a book on the shelf; books catalogued before the accession register get their copies first. */
  private async shelfCopy(tx: Tx, tenantId: string, bookId: string) {
    const [any] = await tx.select({ id: libraryCopies.id }).from(libraryCopies).where(eq(libraryCopies.bookId, bookId)).limit(1);
    if (!any) {
      const [b] = await tx.select({ copies: libraryBooks.copies, price: libraryBooks.pricePaise }).from(libraryBooks).where(eq(libraryBooks.id, bookId));
      if (b && b.copies > 0) await addCopies(tx, tenantId, bookId, b.copies, { pricePaise: b.price });
    }
    const [c] = await tx.select().from(libraryCopies).where(and(eq(libraryCopies.bookId, bookId), eq(libraryCopies.status, 'available'))).orderBy(asc(libraryCopies.accessionNo)).limit(1);
    return c ?? null;
  }

  /** Issues a copy (or, given a book, a copy of it on the shelf) to a student. */
  async issue(tx: Tx, tenantId: string, actorId: string, bookId: string, studentId: string, copyId?: string): Promise<DeskResult> {
    return this.issueTo(tx, tenantId, actorId, bookId, await ensureStudentMember(tx, tenantId, studentId), copyId);
  }

  async issueTo(tx: Tx, tenantId: string, actorId: string, bookId: string, member: Member, copyId?: string): Promise<DeskResult> {
    const [book] = await tx.select({ title: libraryBooks.title }).from(libraryBooks).where(eq(libraryBooks.id, bookId));
    if (!book) return { ok: false, reason: 'unknown_item_or_patron' };
    const copy = copyId ? (await tx.select().from(libraryCopies).where(eq(libraryCopies.id, copyId)))[0] : await this.shelfCopy(tx, tenantId, bookId);
    if (!copy) return { ok: false, reason: 'no_copy_available' };
    try {
      const loan = await tx.transaction((sp) => issueCopy(sp, this.principal(tenantId, actorId), this.clock.now(), this.notifications, { member, copy, via: 'sip2' }));
      return { ok: true, loanId: loan.id, dueOn: loan.dueOn, title: book.title };
    } catch (e) {
      return { ok: false, reason: reasonOf(e) };
    }
  }

  /** Returns the open loan of a copy (or of a book, optionally only if held by `studentId`). */
  async giveBack(tx: Tx, tenantId: string, actorId: string, bookId: string, studentId?: string, copyId?: string): Promise<DeskResult> {
    const [loan] = await tx
      .select({ id: libraryLoans.id })
      .from(libraryLoans)
      .where(and(copyId ? eq(libraryLoans.copyId, copyId) : eq(libraryLoans.bookId, bookId), isNull(libraryLoans.returnedAt), studentId ? eq(libraryLoans.studentId, studentId) : undefined))
      .orderBy(sql`${libraryLoans.issuedAt}`)
      .limit(1);
    const [book] = await tx.select({ title: libraryBooks.title }).from(libraryBooks).where(eq(libraryBooks.id, bookId));
    if (!loan || !book) return { ok: false, reason: 'not_on_loan' };
    try {
      const done = await tx.transaction((sp) => returnLoan(sp, this.principal(tenantId, actorId), this.clock.now(), loan.id, { via: 'sip2', notify: this.notifications }));
      return { ok: true, loanId: done.id, fineP: done.finePaise, title: book.title };
    } catch (e) {
      return { ok: false, reason: reasonOf(e) };
    }
  }
}
