import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';
import { readSettings } from '../campus-ops/settings.js';
import type { Tx } from '../db/db.service.js';
import { guardians, libraryBooks, libraryLoans, students } from '../db/schema.js';
import { libraryReservations } from '../db/schema-depth.js';
import { libraryMembers } from '../db/schema-lht.js';
import type { NotificationsService } from '../notifications/notifications.service.js';

/** A reserved copy is held this many days once it is back on the shelf, unless the library settings say otherwise. */
export const HOLD_DAYS = 3;

/** What the hold-ready notice needs from the notifications service. */
export type HoldNotifier = Pick<NotificationsService, 'notifyUsers'>;

/** Who a reservation or loan belongs to: the member's card and, for a student, the student. */
export interface Holder {
  memberId?: string | null;
  studentId?: string | null;
}

/** The reservation rows that are this holder's (by card, or by student for reservations made before cards). */
export function heldBy(h: Holder) {
  const parts = [h.memberId ? eq(libraryReservations.memberId, h.memberId) : undefined, h.studentId ? eq(libraryReservations.studentId, h.studentId) : undefined].filter(Boolean);
  return parts.length ? or(...parts) : sql`false`;
}

/** Copies out on loan now. */
export async function copiesOut(tx: Tx, bookId: string): Promise<number> {
  const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(libraryLoans).where(and(eq(libraryLoans.bookId, bookId), isNull(libraryLoans.returnedAt)));
  return r?.n ?? 0;
}

/** Copies held for members whose reservation is ready (other than `except`, who may collect theirs). */
export async function copiesHeld(tx: Tx, bookId: string, except?: string | Holder): Promise<number> {
  const h: Holder = typeof except === 'string' ? { studentId: except } : (except ?? {});
  const rows = await tx.select({ studentId: libraryReservations.studentId, memberId: libraryReservations.memberId }).from(libraryReservations).where(and(eq(libraryReservations.bookId, bookId), eq(libraryReservations.status, 'ready')));
  return rows.filter((r) => !((h.studentId && r.studentId === h.studentId) || (h.memberId && r.memberId === h.memberId))).length;
}

/**
 * After a copy comes back: the first member waiting is told it is ready and has the hold period (library settings) to
 * collect it. Returns the reservation that became ready, if any.
 */
export async function promoteNext(tx: Tx, bookId: string, now: Date, notify?: HoldNotifier | null): Promise<string | null> {
  const [book] = await tx.select({ copies: libraryBooks.copies, title: libraryBooks.title, tenantId: libraryBooks.tenantId }).from(libraryBooks).where(eq(libraryBooks.id, bookId));
  if (!book) return null;
  const free = book.copies - (await copiesOut(tx, bookId)) - (await copiesHeld(tx, bookId));
  if (free <= 0) return null;
  const [next] = await tx.select().from(libraryReservations).where(and(eq(libraryReservations.bookId, bookId), eq(libraryReservations.status, 'waiting'))).orderBy(asc(libraryReservations.createdAt)).limit(1);
  if (!next) return null;
  const days = Number((await readSettings(tx, book.tenantId, 'library')).rules.holdDays) || HOLD_DAYS;
  const expiresAt = new Date(now.getTime() + days * 86_400_000);
  await tx.update(libraryReservations).set({ status: 'ready', readyAt: now, expiresAt }).where(eq(libraryReservations.id, next.id));
  if (notify) await notifyReady(tx, notify, { ...next, expiresAt }, book.title, now);
  return next.id;
}

/** Tells the member (and a student's family) that their reserved copy is waiting at the desk. Once per hold. */
export async function notifyReady(tx: Tx, notify: HoldNotifier, r: typeof libraryReservations.$inferSelect, title: string, now: Date): Promise<void> {
  const users = new Set<string>();
  let name = '';
  if (r.memberId) {
    const [m] = await tx.select({ userId: libraryMembers.userId, studentId: libraryMembers.studentId, fullName: libraryMembers.fullName }).from(libraryMembers).where(eq(libraryMembers.id, r.memberId));
    if (m?.userId) users.add(m.userId);
    name = m?.fullName ?? '';
  }
  const studentId = r.studentId;
  if (studentId) {
    const [s] = await tx.select({ userId: students.userId, fullName: students.fullName }).from(students).where(eq(students.id, studentId));
    if (s?.userId) users.add(s.userId);
    name ||= s?.fullName ?? '';
    for (const g of await tx.select({ userId: guardians.userId }).from(guardians).where(eq(guardians.studentId, studentId))) if (g.userId) users.add(g.userId);
  }
  if (!users.size) return;
  const until = r.expiresAt ? r.expiresAt.toISOString().slice(0, 10) : '';
  await notify.notifyUsers(tx, [...users], {
    kind: 'announcement',
    text: {
      en: { title: 'Your reserved book is ready', body: `${name}: "${title}" is waiting at the library desk until ${until}.` },
      hi: { title: 'आरक्षित पुस्तक तैयार है', body: `${name}: "${title}" पुस्तकालय काउंटर पर ${until} तक रखी है।` },
      kn: { title: 'ಕಾಯ್ದಿರಿಸಿದ ಪುಸ್ತಕ ಸಿದ್ಧವಿದೆ', body: `${name}: "${title}" ಗ್ರಂಥಾಲಯದ ಕೌಂಟರ್‌ನಲ್ಲಿ ${until} ವರೆಗೆ ಇದೆ.` },
    },
    data: { reservationId: r.id, bookId: r.bookId },
    dedupeKey: `library-hold:${r.id}`,
  });
  await tx.update(libraryReservations).set({ notifiedAt: now }).where(eq(libraryReservations.id, r.id));
}

/** Holds that were not collected in time go back to the queue's next member. */
export async function expireHolds(tx: Tx, now: Date, notify?: HoldNotifier | null): Promise<number> {
  const stale = await tx.select().from(libraryReservations).where(and(eq(libraryReservations.status, 'ready'), sql`${libraryReservations.expiresAt} < ${now.toISOString()}`));
  for (const r of stale) {
    await tx.update(libraryReservations).set({ status: 'expired' }).where(eq(libraryReservations.id, r.id));
    await promoteNext(tx, r.bookId, now, notify);
  }
  return stale.length;
}
