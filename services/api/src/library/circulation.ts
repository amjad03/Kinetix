import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
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
import { libraryCircRules } from '../db/schema-library.js';
import type { NotificationsService } from '../notifications/notifications.service.js';
import { chargeableDays, lateFine, loadClosures, nextOpenDay } from './fines.js';
import { copiesHeld, heldBy, promoteNext, type HoldNotifier } from './reservations.js';

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
  /** Items of the loan's material out at once (null: only `maxBooks`). */
  maxItems: number | null;
  finePerDay: number;
  /** Open days after the due date before a late fine starts. */
  graceDays: number;
  /** The most one loan's late fine can reach (0: no cap). */
  maxFinePaise: number;
  maxRenewals: number;
  canReserve: boolean;
  /** Unpaid fines at or above this stop new loans (0 = any unpaid fine). */
  blockAtPaise: number;
  bookBankDays: number;
  /** The library settings the rules came from (closed days, notices). */
  settings: Record<string, unknown>;
  /** The matrix cell that applied, if any. */
  ruleId: string | null;
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

/**
 * The rules for a member borrowing a material: the library settings' defaults, overridden by the member's category,
 * overridden by the most specific cell of the circulation rules matrix (category and material, then category alone,
 * then material alone).
 */
export async function rulesFor(tx: Tx, tenantId: string, member: Pick<Member, 'categoryId'> | null, material?: string | null): Promise<LoanRules> {
  const s = (await readSettings(tx, tenantId, 'library')).rules;
  const out: LoanRules = {
    loanDays: Number(s.loanDays),
    maxBooks: Number(s.maxBooksPerStudent),
    maxItems: null,
    finePerDay: Number(s.finePaisePerDay),
    graceDays: 0,
    maxFinePaise: 0,
    maxRenewals: Number(s.maxRenewals),
    canReserve: true,
    blockAtPaise: Number(s.blockIssueAtFinePaise ?? 0),
    bookBankDays: Number(s.bookBankDays ?? 150),
    settings: s,
    ruleId: null,
  };
  const categoryId = member?.categoryId ?? null;
  if (categoryId) {
    const [c] = await tx.select().from(libraryMemberCategories).where(eq(libraryMemberCategories.id, categoryId));
    if (c) Object.assign(out, { loanDays: c.loanDays, maxBooks: c.maxBooks, finePerDay: c.finePaisePerDay, maxRenewals: c.maxRenewals, canReserve: c.canReserve, bookBankDays: c.kind === 'book_bank' ? c.loanDays : out.bookBankDays });
  }
  const [cell] = await tx
    .select()
    .from(libraryCircRules)
    .where(
      and(
        categoryId ? or(eq(libraryCircRules.categoryId, categoryId), isNull(libraryCircRules.categoryId)) : isNull(libraryCircRules.categoryId),
        material ? or(eq(libraryCircRules.material, material), isNull(libraryCircRules.material)) : isNull(libraryCircRules.material),
        sql`not (${libraryCircRules.categoryId} is null and ${libraryCircRules.material} is null)`,
      ),
    )
    .orderBy(sql`(${libraryCircRules.categoryId} is not null) desc, (${libraryCircRules.material} is not null) desc`)
    .limit(1);
  if (cell) Object.assign(out, { loanDays: cell.loanDays, maxItems: cell.maxItems, finePerDay: cell.finePaisePerDay, graceDays: cell.graceDays, maxFinePaise: cell.maxFinePaise, maxRenewals: cell.maxRenewals, canReserve: cell.canReserve && out.canReserve, ruleId: cell.id });
  return out;
}

/** The late fine for a loan back on `back`: closed days and the grace period are left out and the cap applies. */
export async function fineFor(tx: Tx, rules: LoanRules, dueOn: string, back: string): Promise<{ days: number; paise: number }> {
  if (back <= dueOn) return { days: 0, paise: 0 };
  const closures = await loadClosures(tx, plusDays(dueOn, 1), back, rules.settings);
  const days = chargeableDays(dueOn, back, closures, rules.graceDays);
  return { days, paise: lateFine(days, rules.finePerDay, rules.maxFinePaise) };
}

/** The due date `days` after `from`, moved to the next open day when the settings say so. */
export async function dueDate(tx: Tx, rules: LoanRules, from: string, days: number): Promise<string> {
  const due = plusDays(from, days);
  if (rules.settings.dueOnOpenDay === false) return due;
  return nextOpenDay(due, await loadClosures(tx, due, plusDays(due, 60), rules.settings));
}

/**
 * The signed-in person's own library card: a student's card, or a member of staff's (both made on first use).
 * Guardians and others have none (null).
 */
export async function selfMember(tx: Tx, p: Pick<UserPrincipal, 'tenantId' | 'userId' | 'roles'>): Promise<Member | null> {
  const [s] = await tx.select({ id: students.id }).from(students).where(eq(students.userId, p.userId));
  if (s) return ensureStudentMember(tx, p.tenantId, s.id);
  const [have] = await tx.select().from(libraryMembers).where(eq(libraryMembers.userId, p.userId));
  if (have) return have;
  if (!p.roles.some((r) => r !== 'student' && r !== 'guardian')) return null;
  const [u] = await tx.execute<{ full_name: string; email: string | null }>(sql`select full_name, email from users where id = ${p.userId}::uuid`).then((r) => r.rows);
  return u ? ensureUserMember(tx, p.tenantId, p.userId, u.full_name, u.email ?? '') : null;
}

/** The library card of a staff member (made on first use, in the staff category if there is one). */
export async function ensureUserMember(tx: Tx, tenantId: string, userId: string, fullName: string, email = ''): Promise<Member> {
  const [have] = await tx.select().from(libraryMembers).where(eq(libraryMembers.userId, userId));
  if (have) return have;
  const [m] = await tx
    .insert(libraryMembers)
    .values({ tenantId, cardNo: await nextCardNo(tx, tenantId), kind: 'staff', userId, fullName, email, categoryId: await defaultCategory(tx, 'staff') })
    .onConflictDoNothing()
    .returning();
  return m ?? (await tx.select().from(libraryMembers).where(eq(libraryMembers.userId, userId)))[0];
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

/** What is still owed on the fee invoice a fine was sent to (0 once the fee is paid or the invoice cancelled). */
const feeOwedSql = sql<number>`coalesce((select greatest(0, i.amount_paise - i.paid_paise) from fee_invoices i where i.status = 'due' and (i.id = ${qual(libraryLoans.fineInvoiceId)} or (${qual(libraryLoans.fineInvoiceId)} is null and i.title = ${qual(libraryLoans.fineInvoiceTitle)} and i.student_id = ${qual(libraryLoans.studentId)})) limit 1), 0)`;

/**
 * What a member owes and has out now: books out and overdue, fines not yet settled at the desk or sent to fees, and
 * fines sent to the fee account whose invoice is still unpaid (they count for no-dues until the fee is paid).
 */
export async function memberStanding(tx: Tx, member: Pick<Member, 'id' | 'studentId'>, today: string) {
  const who = member.studentId ? sql`(${libraryLoans.memberId} = ${member.id} or ${libraryLoans.studentId} = ${member.studentId})` : eq(libraryLoans.memberId, member.id);
  const [r] = await tx
    .select({
      out: sql<number>`count(*) filter (where ${libraryLoans.returnedAt} is null)::int`,
      overdue: sql<number>`count(*) filter (where ${libraryLoans.returnedAt} is null and ${libraryLoans.dueOn} < ${today}::date)::int`,
      unpaidPaise: sql<number>`coalesce(sum(${unpaidFineSql}) filter (where ${libraryLoans.finePaidAt} is null and ${libraryLoans.fineInvoiceTitle} is null), 0)::bigint`.mapWith(Number),
      feesPendingPaise: sql<number>`coalesce(sum(${feeOwedSql}) filter (where ${libraryLoans.fineInvoiceTitle} is not null), 0)::bigint`.mapWith(Number),
    })
    .from(libraryLoans)
    .where(who);
  return r;
}

/**
 * Refuses a transfer certificate while the student owes the library (books out, unpaid fines, fines on the fee
 * account not yet paid), when the library settings say a TC needs the library's no-dues (the default). For the
 * certificates office; it reads only, and a student who never borrowed is clear.
 */
export async function assertLibraryClearForTc(tx: Tx, tenantId: string, studentId: string, now: Date): Promise<void> {
  if ((await readSettings(tx, tenantId, 'library')).rules.tcNeedsLibraryClearance === false) return;
  const [m] = await tx.select().from(libraryMembers).where(eq(libraryMembers.studentId, studentId));
  const s = await memberStanding(tx, m ?? { id: '00000000-0000-0000-0000-000000000000', studentId }, await tenantToday(tx, now));
  const owed = [s.out && `${s.out} library books are not returned`, s.unpaidPaise && `library fines of ₹${(s.unpaidPaise / 100).toFixed(2)} are unpaid`, s.feesPendingPaise && `library fines of ₹${(s.feesPendingPaise / 100).toFixed(2)} on the fee account are unpaid`].filter(Boolean);
  if (owed.length) throw new ForbiddenException({ statusCode: 403, error: 'Forbidden', code: 'LIBRARY_DUES', message: `The transfer certificate is held: ${owed.join('; ')}. The library gives its no-dues once they are cleared.` });
}

/** Open loans of a member for one material (the matrix's per-material limit). */
async function outOfMaterial(tx: Tx, member: Pick<Member, 'id' | 'studentId'>, material: string): Promise<number> {
  const who = member.studentId ? sql`(${libraryLoans.memberId} = ${member.id} or ${libraryLoans.studentId} = ${member.studentId})` : eq(libraryLoans.memberId, member.id);
  const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(libraryLoans).innerJoin(libraryBooks, eq(libraryBooks.id, libraryLoans.bookId)).where(and(who, isNull(libraryLoans.returnedAt), eq(libraryBooks.material, material)));
  return r.n;
}

export interface IssueInput {
  member: Member;
  copy: Copy;
  dueOn?: string;
  via?: 'desk' | 'self' | 'kiosk' | 'sip2';
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
  if (copy.status !== 'available') throw new ConflictException(copy.status === 'on_loan' ? 'This copy is already out on loan' : copy.status === 'in_transit' ? 'This copy is on its way back to its own branch; receive it there first' : `This copy is ${copy.status.replace('_', ' ')} and cannot be issued`);
  const [book] = await tx.select().from(libraryBooks).where(eq(libraryBooks.id, copy.bookId)).for('update');
  if (book.status === 'withdrawn') throw new ConflictException('This title has been withdrawn');
  const rules = await rulesFor(tx, p.tenantId, member, book.material);
  const standing = await memberStanding(tx, member, today);
  if (standing.unpaidPaise > 0 && standing.unpaidPaise >= rules.blockAtPaise) throw new ConflictException(`Unpaid library fines of ₹${(standing.unpaidPaise / 100).toFixed(2)} must be cleared before another book is issued`);
  if (standing.out >= rules.maxBooks) throw new ConflictException(`This member can borrow ${rules.maxBooks} books at a time`);
  if (rules.maxItems !== null && (await outOfMaterial(tx, member, book.material)) >= rules.maxItems) throw new ConflictException(rules.maxItems === 0 ? `This member cannot borrow ${book.material} items` : `This member can borrow ${rules.maxItems} ${book.material} items at a time`);
  if (rules.loanDays <= 0 && !input.bookBank) throw new ConflictException('This material is for reading in the library only');
  const [{ shelf }] = await tx.select({ shelf: sql<number>`count(*)::int` }).from(libraryCopies).where(and(eq(libraryCopies.bookId, book.id), eq(libraryCopies.status, 'available')));
  const held = await copiesHeld(tx, book.id, { memberId: member.id, studentId: member.studentId });
  if (shelf - held <= 0) throw new ConflictException('The copies on the shelf are held for members who reserved this book');
  const dueOn = input.dueOn ?? (await dueDate(tx, rules, today, input.bookBank ? rules.bookBankDays : rules.loanDays));
  if (dueOn < today) throw new BadRequestException('The due date has already passed');
  const [loan] = await tx
    .insert(libraryLoans)
    .values({ tenantId: p.tenantId, bookId: book.id, studentId: member.studentId, memberId: member.id, copyId: copy.id, dueOn, issuedBy: p.userId, issuedAt: now, bookBank: !!input.bookBank, via: input.via ?? 'desk', branchId: input.branchId ?? copy.atBranchId ?? copy.branchId })
    .returning();
  await tx.update(libraryCopies).set({ status: 'on_loan' }).where(eq(libraryCopies.id, copy.id));
  await tx.update(libraryReservations).set({ status: 'fulfilled', loanId: loan.id }).where(and(eq(libraryReservations.bookId, book.id), heldBy({ memberId: member.id, studentId: member.studentId }), sql`${libraryReservations.status} in ('waiting', 'ready')`));
  await auditUser(tx, p, 'library_loan.issued', 'library_loan', loan.id, { copy: copy.accessionNo, member: member.cardNo, dueOn, via: loan.via, bookBank: loan.bookBank, ruleId: rules.ruleId });
  if (member.studentId && notifications) await notifications.libraryIssued(tx, { loanId: loan.id, studentId: member.studentId, studentName: member.fullName, title: book.title, dueOn });
  return loan;
}

/**
 * Takes a copy back. The late fine runs to the day it came back (the drop box gives the time it was dropped). A copy
 * returned at another branch than its own is held there "in transit" until it is received back home.
 */
export async function returnLoan(tx: Tx, p: UserPrincipal, now: Date, loanId: string, o: { at?: Date; branchId?: string | null; via?: 'desk' | 'dropbox' | 'kiosk' | 'self' | 'sip2'; notify?: HoldNotifier | null } = {}): Promise<Loan> {
  const [loan] = await tx.select().from(libraryLoans).where(eq(libraryLoans.id, loanId)).for('update');
  if (!loan) throw new NotFoundException('Loan not found');
  if (loan.returnedAt) throw new ConflictException('This book has already been returned');
  const at = o.at ?? now;
  if (at > now) throw new BadRequestException('The return time is in the future');
  if (at < loan.issuedAt) throw new BadRequestException('The return time is before the book was issued');
  const back = await localDate(tx, at);
  const rules = await loanRules(tx, p.tenantId, loan);
  const fine = await fineFor(tx, rules, loan.dueOn, back);
  const late = Math.max(0, daysBetween(loan.dueOn, back));
  const [done] = await tx
    .update(libraryLoans)
    .set({ returnedAt: at, finePaise: fine.paise, fineDays: fine.days, returnedVia: o.via ?? 'desk', returnedBranchId: o.branchId ?? null })
    .where(eq(libraryLoans.id, loanId))
    .returning();
  if (loan.copyId) {
    const [copy] = await tx.select().from(libraryCopies).where(eq(libraryCopies.id, loan.copyId));
    const away = !!(o.branchId && copy?.branchId && copy.branchId !== o.branchId);
    await tx.update(libraryCopies).set({ status: away ? 'in_transit' : 'available', atBranchId: o.branchId ?? copy?.branchId ?? null }).where(eq(libraryCopies.id, loan.copyId));
    await syncCopies(tx, loan.bookId);
  }
  await auditUser(tx, p, 'library_loan.returned', 'library_loan', loanId, { daysLate: late, fineDays: fine.days, finePaise: done.finePaise, via: o.via ?? 'desk' });
  await promoteNext(tx, loan.bookId, now, o.notify);
  return done;
}

/** The rules a loan runs under: its member's, for its book's material. */
export async function loanRules(tx: Tx, tenantId: string, loan: Pick<Loan, 'memberId' | 'studentId' | 'bookId'>): Promise<LoanRules> {
  let member = loan.memberId ? (await tx.select().from(libraryMembers).where(eq(libraryMembers.id, loan.memberId)))[0] : undefined;
  if (!member && loan.studentId) member = (await tx.select().from(libraryMembers).where(eq(libraryMembers.studentId, loan.studentId)))[0];
  const [book] = await tx.select({ material: libraryBooks.material }).from(libraryBooks).where(eq(libraryBooks.id, loan.bookId));
  return rulesFor(tx, tenantId, member ?? null, book?.material ?? null);
}

/**
 * Extends a loan by another loan period, up to the member's renewal limit, unless it is overdue or another student is
 * waiting for the book.
 */
export async function renewLoan(tx: Tx, p: UserPrincipal, now: Date, loanId: string): Promise<Loan> {
  const [loan] = await tx.select().from(libraryLoans).where(eq(libraryLoans.id, loanId)).for('update');
  if (!loan) throw new NotFoundException('Loan not found');
  if (loan.returnedAt) throw new ConflictException('This book has already been returned');
  const rules = await loanRules(tx, p.tenantId, loan);
  if (loan.bookBank) throw new ConflictException('Book bank loans run for the semester and are not renewed');
  if (loan.renewCount >= rules.maxRenewals) throw new ConflictException(`A loan can be renewed ${rules.maxRenewals} times`);
  const today = await tenantToday(tx, now);
  if (loan.dueOn < today) throw new ConflictException('Overdue books cannot be renewed; return the book at the desk');
  const [waiting] = await tx.select({ id: libraryReservations.id }).from(libraryReservations).where(and(eq(libraryReservations.bookId, loan.bookId), sql`${libraryReservations.status} in ('waiting', 'ready')`)).limit(1);
  if (waiting) throw new ConflictException('Another member has reserved this book');
  const [row] = await tx.update(libraryLoans).set({ dueOn: await dueDate(tx, rules, loan.dueOn > today ? loan.dueOn : today, rules.loanDays), renewCount: loan.renewCount + 1 }).where(eq(libraryLoans.id, loanId)).returning();
  await auditUser(tx, p, 'library.renewed', 'library_loan', loanId, { renewCount: row.renewCount, dueOn: row.dueOn });
  return row;
}

/**
 * A copy reported lost (the loan closes; the fine is the late fine plus the book's price or the charge given; the copy
 * leaves the stock) or returned damaged (the loan closes with the assessed charge; the copy comes back to the shelf).
 */
export async function settleLoan(tx: Tx, p: UserPrincipal, now: Date, loanId: string, kind: 'lost' | 'damaged', note: string, amountPaise?: number, notify?: HoldNotifier | null): Promise<Loan> {
  const [loan] = await tx.select().from(libraryLoans).where(eq(libraryLoans.id, loanId)).for('update');
  if (!loan) throw new NotFoundException('Loan not found');
  if (loan.returnedAt) throw new ConflictException('This book has already been returned');
  const [book] = await tx.select().from(libraryBooks).where(eq(libraryBooks.id, loan.bookId)).for('update');
  const copy = loan.copyId ? (await tx.select().from(libraryCopies).where(eq(libraryCopies.id, loan.copyId)))[0] : undefined;
  const charge = amountPaise ?? (kind === 'lost' ? (copy?.pricePaise || book.pricePaise) : 0);
  if (kind === 'lost' && charge <= 0) throw new BadRequestException("Give the charge for the lost book (or record the book's price)");
  const late = await fineFor(tx, await loanRules(tx, p.tenantId, loan), loan.dueOn, await tenantToday(tx, now));
  const [row] = await tx.update(libraryLoans).set({ returnedAt: now, finePaise: late.paise + charge, fineDays: late.days, condition: kind, conditionNote: note }).where(eq(libraryLoans.id, loanId)).returning();
  if (copy) {
    await tx.update(libraryCopies).set({ status: kind === 'lost' ? 'lost' : 'available', note }).where(eq(libraryCopies.id, copy.id));
    await syncCopies(tx, book.id);
  } else if (kind === 'lost') await tx.update(libraryBooks).set({ copies: Math.max(0, book.copies - 1) }).where(eq(libraryBooks.id, book.id));
  if (kind !== 'lost') await promoteNext(tx, book.id, now, notify);
  await auditUser(tx, p, `library.${kind}`, 'library_loan', loanId, { chargePaise: charge, latePaise: late.paise, fineDays: late.days });
  return row;
}

/**
 * The borrower of a lost book brings a new copy of the same title instead of paying for it: the new copy joins the
 * accession register (source "replacement", the lost copy's price) and the book's price is waived from the fine (the
 * late fine stays). Refused once the fine is paid or sent to fees.
 */
export async function replaceLost(tx: Tx, p: UserPrincipal, now: Date, loanId: string, o: { note?: string; branchId?: string | null } = {}): Promise<{ accessionNo: string; waivedPaise: number }> {
  const [loan] = await tx.select().from(libraryLoans).where(eq(libraryLoans.id, loanId)).for('update');
  if (!loan) throw new NotFoundException('Loan not found');
  if (loan.condition !== 'lost') throw new ConflictException('Only a lost book can be replaced');
  if (loan.finePaidAt || loan.fineInvoiceTitle) throw new ConflictException('The fine for this book is already settled');
  const [book] = await tx.select().from(libraryBooks).where(eq(libraryBooks.id, loan.bookId));
  const lost = loan.copyId ? (await tx.select().from(libraryCopies).where(eq(libraryCopies.id, loan.copyId)))[0] : undefined;
  const price = lost?.pricePaise || book.pricePaise;
  const waived = Math.min(price, Math.max(0, loan.finePaise - loan.fineWaivedPaise));
  const [copy] = await addCopies(tx, p.tenantId, book.id, 1, { branchId: o.branchId ?? lost?.branchId ?? null, pricePaise: price, source: 'replacement', acquiredOn: await tenantToday(tx, now), shelf: lost?.shelf ?? '' });
  if (o.note) await tx.update(libraryCopies).set({ note: o.note }).where(eq(libraryCopies.id, copy.id));
  await tx.update(libraryLoans).set({ fineWaivedPaise: loan.fineWaivedPaise + waived, conditionNote: [loan.conditionNote, `Replaced by ${copy.accessionNo}`].filter(Boolean).join('; ') }).where(eq(libraryLoans.id, loanId));
  await auditUser(tx, p, 'library.lost_replaced', 'library_loan', loanId, { accessionNo: copy.accessionNo, waivedPaise: waived, changes: { fineWaivedPaise: { before: loan.fineWaivedPaise, after: loan.fineWaivedPaise + waived } } });
  return { accessionNo: copy.accessionNo, waivedPaise: waived };
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
