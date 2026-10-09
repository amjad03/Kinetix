import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { libraryBooks, libraryLoans } from '../db/schema.js';
import { libraryReservations } from '../db/schema-depth.js';

/** A reserved copy is held for this many days once it is back on the shelf. */
export const HOLD_DAYS = 3;
export const MAX_RENEWALS = 2;

/** Copies out on loan now. */
export async function copiesOut(tx: Tx, bookId: string): Promise<number> {
  const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(libraryLoans).where(and(eq(libraryLoans.bookId, bookId), isNull(libraryLoans.returnedAt)));
  return r?.n ?? 0;
}

/** Copies held for students whose reservation is ready (other than `exceptStudent`). */
export async function copiesHeld(tx: Tx, bookId: string, exceptStudent?: string): Promise<number> {
  const rows = await tx.select({ studentId: libraryReservations.studentId }).from(libraryReservations).where(and(eq(libraryReservations.bookId, bookId), eq(libraryReservations.status, 'ready')));
  return rows.filter((r) => r.studentId !== exceptStudent).length;
}

/** After a copy comes back: the first student waiting is told it is ready and has a few days to collect it. */
export async function promoteNext(tx: Tx, bookId: string, now: Date): Promise<string | null> {
  const [book] = await tx.select({ copies: libraryBooks.copies }).from(libraryBooks).where(eq(libraryBooks.id, bookId));
  if (!book) return null;
  const free = book.copies - (await copiesOut(tx, bookId)) - (await copiesHeld(tx, bookId));
  if (free <= 0) return null;
  const [next] = await tx.select().from(libraryReservations).where(and(eq(libraryReservations.bookId, bookId), eq(libraryReservations.status, 'waiting'))).orderBy(asc(libraryReservations.createdAt)).limit(1);
  if (!next) return null;
  await tx.update(libraryReservations).set({ status: 'ready', readyAt: now, expiresAt: new Date(now.getTime() + HOLD_DAYS * 86_400_000) }).where(eq(libraryReservations.id, next.id));
  return next.studentId;
}

/** Holds that were not collected in time go back to the queue's next student. */
export async function expireHolds(tx: Tx, now: Date): Promise<number> {
  const stale = await tx.select().from(libraryReservations).where(and(eq(libraryReservations.status, 'ready'), sql`${libraryReservations.expiresAt} < ${now.toISOString()}`));
  for (const r of stale) {
    await tx.update(libraryReservations).set({ status: 'expired' }).where(eq(libraryReservations.id, r.id));
    await promoteNext(tx, r.bookId, now);
  }
  return stale.length;
}
