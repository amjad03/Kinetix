import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { readSettings } from '../campus-ops/settings.js';
import { auditUser } from '../common/audit.js';
import { qual } from '../common/lht-kit.js';
import { nextNumber } from '../common/ops.js';
import { localParts } from '../common/time.js';
import type { Tx } from '../db/db.service.js';
import { libraryBooks, libraryLoans, sections, students, tenants } from '../db/schema.js';
import { libraryReservations } from '../db/schema-depth.js';
import { libraryCopies, libraryMemberCategories, libraryMembers } from '../db/schema-lht.js';
import type { NotificationsService } from '../notifications/notifications.service.js';
import { copiesHeld, promoteNext } from './reservations.js';

/**
 * Circulation shared by the desk, the record lists, self-checkout and the drop box: who a member is and which
 * rules apply to them, which copy a code names, what a member owes, and issuing and returning a copy.
 */

/** Copies that count as the library's stock on the shelf or out on loan. */
export const CIRCULATING = ['available', 'on_loan'] as const;

export type Member = typeof libraryMembers.$inferSelect;
export type Copy = typeof libraryCopies.$inferSelect;
export type Loan = typeof libraryLoans.$inferSelect;

export interface LoanRules {
  loanDays: number;
  maxBooks: number;
  finePerDay: number;
  maxRenewals: number;
  canReserve: boolean;
  /** Unpaid fines at or above this stop new loans (0 = any unpaid fine). */
  blockAtPaise: number;
  bookBankDays: number;
}

export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
export const plusDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export async function tenantToday(tx: Tx, now: Date): Promise<string> {
  const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
  return localParts(now, t?.tz ?? 'Asia/Kolkata').date;
}

/** The local date of an instant in the institution's time zone. */
export async function localDate(tx: Tx, at: Date): Promise<string> {
  return tenantToday(tx, at);
}

/** The rules for a member: their category's, or the library settings' defaults. */
export async function rulesFor(tx: Tx, tenantId: string, member: Pick<Member, 'categoryId'> | null): Promise<LoanRules> {
  const s = (await readSettings(tx, tenantId, 'library')).rules;
  const base: LoanRules = {
    loanDays: Number(s.loanDays),
    maxBooks: Number(s.maxBooksPerStudent),
    finePerDay: Number(s.finePaisePerDay),
    maxRenewals: Number(s.maxRenewals),
    canReserve: true,
    blockAtPaise: Number(s.blockIssueAtFinePaise ?? 0),
    bookBankDays: Number(s.bookBankDays ?? 150),
  };
  if (!member?.categoryId) return base;
  const [c] = await tx.select().from(libraryMemberCategories).where(eq(libraryMemberCategories.id, member.categoryId));
  if (!c) return base;
  return { ...base, loanDays: c.loanDays, maxBooks: c.maxBooks, finePerDay: c.finePaisePerDay, maxRenewals: c.maxRenewals, canReserve: c.canReserve, bookBankDays: c.kind === 'book_bank' ? c.loanDays : base.bookBankDays };
}

/** The default category for a kind of member (the first of that kind in the list's order), if any. */
async function defaultCategory(tx: Tx, kind: string): Promise<string | null> {
  const [c] = await tx.select({ id: libraryMemberCategories.id }).from(libraryMemberCategories).where(eq(libraryMemberCategories.kind, kind)).orderBy(asc(libraryMemberCategories.sortOrder), asc(libraryMemberCategories.name)).limit(1);
  return c?.id ?? null;
}

/** A new card number from the institution's MEM series. */
export const nextCardNo = (tx: Tx, tenantId: string) => nextNumber(tx, tenantId, 'MEM');

/** The student's library card, made on first use (every student is a member). */
export async function ensureStudentMember(tx: Tx, tenantId: string, studentId: string): Promise<Member> {
  const [have] = await tx.select().from(libraryMembers).where(eq(libraryMembers.studentId, studentId));
  if (have) return have;
  const [s] = await tx.select({ id: students.id, fullName: students.fullName }).from(students).where(eq(students.id, studentId));
  if (!s) throw new NotFoundException('Student not found');
  const [m] = await tx
    .insert(libraryMembers)
    .values({ tenantId, cardNo: await nextCardNo(tx, tenantId), kind: 'student', studentId, fullName: s.fullName, categoryId: await defaultCategory(tx, 'student') })
    .onConflictDoNothing()
    .returning();
  if (m) return m;
  const [again] = await tx.select().from(libraryMembers).where(eq(libraryMembers.studentId, studentId));
  return again;
}

/** A member by card number, roll number (exact) or id. */
export async function findMember(tx: Tx, tenantId: string, code: string): Promise<Member> {
  const c = code.trim();
  if (!c) throw new BadRequestException('Give a card or roll number');
  const [byCard] = await tx.select().from(libraryMembers).where(sql`lower(${libraryMembers.cardNo}) = ${c.toLowerCase()}`);
  if (byCard) return byCard;
  if (/^[0-9a-f-]{36}$/i.test(c)) {
    const [byId] = await tx.select().from(libraryMembers).where(eq(libraryMembers.id, c));
    if (byId) return byId;
  }
  const roll = await tx.select({ id: students.id }).from(students).where(and(sql`lower(${students.rollNo}) = ${c.toLowerCase()}`, eq(students.status, 'active'))).limit(2);
  if (roll.length === 1) return ensureStudentMember(tx, tenantId, roll[0].id);
  if (roll.length > 1) throw new BadRequestException('More than one student has this roll number; use the library card number');
  throw new NotFoundException('No member has this card or roll number');
}

/** A copy by barcode, accession number or RFID tag. */
export async function findCopy(tx: Tx, code: string): Promise<Copy> {
  const c = code.trim().toLowerCase();
  if (!c) throw new BadRequestException('Scan or type the copy’s barcode or accession number');
  const [copy] = await tx.select().from(libraryCopies).where(sql`lower(${libraryCopies.barcode}) = ${c} or lower(${libraryCopies.accessionNo}) = ${c} or lower(${libraryCopies.rfid}) = ${c}`).limit(1);
  if (!copy) throw new NotFoundException('No copy carries this code');
  return copy;
}

/** Keeps the book's copy count equal to its copies on the shelf or out on loan. */
export async function syncCopies(tx: Tx, bookId: string): Promise<number> {
  const [{ n, all }] = await tx
    .select({ n: sql<number>`count(*) filter (where ${libraryCopies.status} in ('available', 'on_loan'))::int`, all: sql<number>`count(*)::int` })
    .from(libraryCopies)
    .where(eq(libraryCopies.bookId, bookId));
  if (all > 0) await tx.update(libraryBooks).set({ copies: n }).where(eq(libraryBooks.id, bookId));
  return n;
}

/** Adds copies of a book to the accession register (ACC series) and returns them. */
export async function addCopies(
  tx: Tx,
  tenantId: string,
  bookId: string,
  count: number,
  o: { branchId?: string | null; pricePaise?: number; source?: string; acquiredOn?: string | null; vendor?: string; invoiceNo?: string; acquisitionId?: string | null; shelf?: string } = {},
): Promise<Copy[]> {
  const out: Copy[] = [];
  for (let i = 0; i < count; i++) {
    const acc = await nextNumber(tx, tenantId, 'ACC');
    const [c] = await tx
      .insert(libraryCopies)
      .values({ tenantId, bookId, accessionNo: acc, barcode: acc, branchId: o.branchId ?? null, atBranchId: o.branchId ?? null, pricePaise: o.pricePaise ?? 0, source: o.source ?? 'purchase', acquiredOn: o.acquiredOn ?? null, vendor: o.vendor ?? '', invoiceNo: o.invoiceNo ?? '', acquisitionId: o.acquisitionId ?? null, shelf: o.shelf ?? '' })
      .returning();
    out.push(c);
  }
  await syncCopies(tx, bookId);
  return out;
}

/** Fines not yet settled: charged on return, less any waiver, not paid at the desk and not sent to fees. */
export const unpaidFineSql = sql<number>`greatest(0, ${libraryLoans.finePaise} - ${libraryLoans.fineWaivedPaise})`;

/** What a member owes and has out now. */
export async function memberStanding(tx: Tx, member: Pick<Member, 'id' | 'studentId'>, today: string) {
  const who = member.studentId ? sql`(${libraryLoans.memberId} = ${member.id} or ${libraryLoans.studentId} = ${member.studentId})` : eq(libraryLoans.memberId, member.id);
  const [r] = await tx
    .select({
      out: sql<number>`count(*) filter (where ${libraryLoans.returnedAt} is null)::int`,
      overdue: sql<number>`count(*) filter (where ${libraryLoans.returnedAt} is null and ${libraryLoans.dueOn} < ${today}::date)::int`,
      unpaidPaise: sql<number>`coalesce(sum(${unpaidFineSql}) filter (where ${libraryLoans.finePaidAt} is null and ${libraryLoans.fineInvoiceTitle} is null), 0)::bigint`.mapWith(Number),
    })
    .from(libraryLoans)
    .where(who);
  return r;
}

export interface IssueInput {
  member: Member;
  copy: Copy;
  dueOn?: string;
  via?: 'desk' | 'self' | 'kiosk';
  bookBank?: boolean;
  branchId?: string | null;
}

/**
 * Lends a copy to a member, under the member's rules: the card must be active and in date, unpaid fines must be
 * under the limit, the member must have room for another book, the copy must be on the shelf, and the copies left
 * must not be held for students who reserved the book.
 */
export async function issueCopy(tx: Tx, p: UserPrincipal, now: Date, notifications: NotificationsService | null, input: IssueInput): Promise<Loan> {
  const { member } = input;
  const [copy] = await tx.select().from(libraryCopies).where(eq(libraryCopies.id, input.copy.id)).for('update');
  const today = await tenantToday(tx, now);
  if (member.status !== 'active') throw new ConflictException(member.status === 'blocked' ? `This card is blocked${member.blockedReason ? `: ${member.blockedReason}` : ''}` : 'This card is not active');
  if (member.validUntil && member.validUntil < today) throw new ConflictException('This card has expired; renew it first');
  const rules = await rulesFor(tx, p.tenantId, member);
  const standing = await memberStanding(tx, member, today);
  if (standing.unpaidPaise > 0 && standing.unpaidPaise >= rules.blockAtPaise) throw new ConflictException(`Unpaid library fines of ₹${(standing.unpaidPaise / 100).toFixed(2)} must be cleared before another book is issued`);
  if (standing.out >= rules.maxBooks) throw new ConflictException(`This member can borrow ${rules.maxBooks} books at a time`);
  if (copy.status !== 'available') throw new ConflictException(copy.status === 'on_loan' ? 'This copy is already out on loan' : copy.status === 'in_transit' ? 'This copy is on its way back to its own branch; receive it there first' : `This copy is ${copy.status.replace('_', ' ')} and cannot be issued`);
  const [book] = await tx.select().from(libraryBooks).where(eq(libraryBooks.id, copy.bookId)).for('update');
  if (book.status === 'withdrawn') throw new ConflictException('This title has been withdrawn');
  const [{ shelf }] = await tx.select({ shelf: sql<number>`count(*)::int` }).from(libraryCopies).where(and(eq(libraryCopies.bookId, book.id), eq(libraryCopies.status, 'available')));
  const held = await copiesHeld(tx, book.id, member.studentId ?? undefined);
  if (shelf - held <= 0) throw new ConflictException('The copies on the shelf are held for students who reserved this book');
  const dueOn = input.dueOn ?? plusDays(today, input.bookBank ? rules.bookBankDays : rules.loanDays);
  if (dueOn < today) throw new BadRequestException('The due date has already passed');
  const [loan] = await tx
    .insert(libraryLoans)
    .values({ tenantId: p.tenantId, bookId: book.id, studentId: member.studentId, memberId: member.id, copyId: copy.id, dueOn, issuedBy: p.userId, issuedAt: now, bookBank: !!input.bookBank, via: input.via ?? 'desk', branchId: input.branchId ?? copy.atBranchId ?? copy.branchId })
    .returning();
  await tx.update(libraryCopies).set({ status: 'on_loan' }).where(eq(libraryCopies.id, copy.id));
  if (member.studentId) await tx.update(libraryReservations).set({ status: 'fulfilled', loanId: loan.id }).where(and(eq(libraryReservations.bookId, book.id), eq(libraryReservations.studentId, member.studentId), sql`${libraryReservations.status} in ('waiting', 'ready')`));
  await auditUser(tx, p, 'library_loan.issued', 'library_loan', loan.id, { copy: copy.accessionNo, member: member.cardNo, dueOn, via: loan.via, bookBank: loan.bookBank });
  if (member.studentId && notifications) await notifications.libraryIssued(tx, { loanId: loan.id, studentId: member.studentId, studentName: member.fullName, title: book.title, dueOn });
  return loan;
}

/**
 * Takes a copy back. The late fine runs to the day it came back (the drop box gives the time it was dropped). A copy
 * returned at another branch than its own is held there "in transit" until it is received back home.
 */
export async function returnLoan(tx: Tx, p: UserPrincipal, now: Date, loanId: string, o: { at?: Date; branchId?: string | null; via?: 'desk' | 'dropbox' | 'kiosk' | 'self' } = {}): Promise<Loan> {
  const [loan] = await tx.select().from(libraryLoans).where(eq(libraryLoans.id, loanId)).for('update');
  if (!loan) throw new NotFoundException('Loan not found');
  if (loan.returnedAt) throw new ConflictException('This book has already been returned');
  const at = o.at ?? now;
  if (at > now) throw new BadRequestException('The return time is in the future');
  if (at < loan.issuedAt) throw new BadRequestException('The return time is before the book was issued');
  const back = await localDate(tx, at);
  const member = loan.memberId ? (await tx.select().from(libraryMembers).where(eq(libraryMembers.id, loan.memberId)))[0] : null;
  const rules = await rulesFor(tx, p.tenantId, member ?? null);
  const late = Math.max(0, daysBetween(loan.dueOn, back));
  const [done] = await tx
    .update(libraryLoans)
    .set({ returnedAt: at, finePaise: late * rules.finePerDay, returnedVia: o.via ?? 'desk', returnedBranchId: o.branchId ?? null })
    .where(eq(libraryLoans.id, loanId))
    .returning();
  if (loan.copyId) {
    const [copy] = await tx.select().from(libraryCopies).where(eq(libraryCopies.id, loan.copyId));
    const away = !!(o.branchId && copy?.branchId && copy.branchId !== o.branchId);
    await tx.update(libraryCopies).set({ status: away ? 'in_transit' : 'available', atBranchId: o.branchId ?? copy?.branchId ?? null }).where(eq(libraryCopies.id, loan.copyId));
    await syncCopies(tx, loan.bookId);
  }
  await auditUser(tx, p, 'library_loan.returned', 'library_loan', loanId, { daysLate: late, finePaise: done.finePaise, via: o.via ?? 'desk' });
  await promoteNext(tx, loan.bookId, now);
  return done;
}

/**
 * Extends a loan by another loan period, up to the member's renewal limit, unless it is overdue or another student is
 * waiting for the book.
 */
export async function renewLoan(tx: Tx, p: UserPrincipal, now: Date, loanId: string): Promise<Loan> {
  const [loan] = await tx.select().from(libraryLoans).where(eq(libraryLoans.id, loanId)).for('update');
  if (!loan) throw new NotFoundException('Loan not found');
  if (loan.returnedAt) throw new ConflictException('This book has already been returned');
  const member = loan.memberId ? (await tx.select().from(libraryMembers).where(eq(libraryMembers.id, loan.memberId)))[0] : null;
  const rules = await rulesFor(tx, p.tenantId, member ?? null);
  if (loan.bookBank) throw new ConflictException('Book bank loans run for the semester and are not renewed');
  if (loan.renewCount >= rules.maxRenewals) throw new ConflictException(`A loan can be renewed ${rules.maxRenewals} times`);
  const today = await tenantToday(tx, now);
  if (loan.dueOn < today) throw new ConflictException('Overdue books cannot be renewed; return the book at the desk');
  const [waiting] = await tx.select({ id: libraryReservations.id }).from(libraryReservations).where(and(eq(libraryReservations.bookId, loan.bookId), sql`${libraryReservations.status} in ('waiting', 'ready')`)).limit(1);
  if (waiting) throw new ConflictException('Another student has reserved this book');
  const [row] = await tx.update(libraryLoans).set({ dueOn: plusDays(loan.dueOn > today ? loan.dueOn : today, rules.loanDays), renewCount: loan.renewCount + 1 }).where(eq(libraryLoans.id, loanId)).returning();
  await auditUser(tx, p, 'library.renewed', 'library_loan', loanId, { renewCount: row.renewCount, dueOn: row.dueOn });
  return row;
}

/**
 * A copy reported lost (the loan closes; the fine is the late fine plus the book's price or the charge given; the copy
 * leaves the stock) or returned damaged (the loan closes with the assessed charge; the copy comes back to the shelf).
 */
export async function settleLoan(tx: Tx, p: UserPrincipal, now: Date, loanId: string, kind: 'lost' | 'damaged', note: string, amountPaise?: number): Promise<Loan> {
  const [loan] = await tx.select().from(libraryLoans).where(eq(libraryLoans.id, loanId)).for('update');
  if (!loan) throw new NotFoundException('Loan not found');
  if (loan.returnedAt) throw new ConflictException('This book has already been returned');
  const [book] = await tx.select().from(libraryBooks).where(eq(libraryBooks.id, loan.bookId)).for('update');
  const copy = loan.copyId ? (await tx.select().from(libraryCopies).where(eq(libraryCopies.id, loan.copyId)))[0] : undefined;
  const charge = amountPaise ?? (kind === 'lost' ? (copy?.pricePaise || book.pricePaise) : 0);
  if (kind === 'lost' && charge <= 0) throw new BadRequestException("Give the charge for the lost book (or record the book's price)");
  const member = loan.memberId ? (await tx.select().from(libraryMembers).where(eq(libraryMembers.id, loan.memberId)))[0] : null;
  const late = Math.max(0, daysBetween(loan.dueOn, await tenantToday(tx, now))) * (await rulesFor(tx, p.tenantId, member ?? null)).finePerDay;
  const [row] = await tx.update(libraryLoans).set({ returnedAt: now, finePaise: late + charge, condition: kind, conditionNote: note }).where(eq(libraryLoans.id, loanId)).returning();
  if (copy) {
    await tx.update(libraryCopies).set({ status: kind === 'lost' ? 'lost' : 'available', note }).where(eq(libraryCopies.id, copy.id));
    await syncCopies(tx, book.id);
  } else if (kind === 'lost') await tx.update(libraryBooks).set({ copies: Math.max(0, book.copies - 1) }).where(eq(libraryBooks.id, book.id));
  if (kind !== 'lost') await promoteNext(tx, book.id, now);
  await auditUser(tx, p, `library.${kind}`, 'library_loan', loanId, { chargePaise: charge });
  return row;
}

/** An available copy of a book for the old book-level desk (no copy scanned), skipping copies held for reservations. */
export async function pickCopy(tx: Tx, bookId: string): Promise<Copy | null> {
  const [c] = await tx.select().from(libraryCopies).where(and(eq(libraryCopies.bookId, bookId), eq(libraryCopies.status, 'available'))).orderBy(asc(libraryCopies.accessionNo)).limit(1).for('update');
  return c ?? null;
}

/** Students' class names for member lists. */
export const memberClass = sql<string | null>`(select ${qual(sections.displayName)} from ${students} join ${sections} on ${qual(sections.id)} = ${qual(students.sectionId)} where ${qual(students.id)} = ${qual(libraryMembers.studentId)})`;

/** Loans still out for a set of members (refusing deposit refunds, clearances and the like). */
export async function openLoans(tx: Tx, memberIds: string[]): Promise<number> {
  if (!memberIds.length) return 0;
  const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(libraryLoans).where(and(inArray(libraryLoans.memberId, memberIds), isNull(libraryLoans.returnedAt)));
  return r.n;
}

export const notWithdrawn = ne(libraryCopies.status, 'withdrawn');
