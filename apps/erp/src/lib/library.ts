// Library desk helpers: availability, due dates and late fines, student search. Pure, so the
// client components and tests can use them.

import type { TFunction } from '@/i18n/translate';
import { daysBetween } from './dates';
import type { LibraryBook, LibraryLoan } from './types';

/** The API's loan period and late fine (library.controller.ts). */
export const LOAN_DAYS = 14;
export const FINE_PAISE_PER_DAY = 200;

export function availableCopies(book: Pick<LibraryBook, 'copies' | 'onLoan'>): number {
  return Math.max(0, book.copies - book.onLoan);
}

/** Whole days past the due date (0 when not late). */
export function daysLate(dueOn: string, today: string): number {
  return Math.max(0, daysBetween(dueOn, today));
}

/** The fine the API will charge if the book comes back today. */
export function finePreview(dueOn: string, today: string): number {
  return daysLate(dueOn, today) * FINE_PAISE_PER_DAY;
}

/** "Due today", "Due in 3 days", "4 days late"; in the ERP language with `t`. */
export function dueLabel(dueOn: string, today: string, t?: TFunction): string {
  const n = daysBetween(today, dueOn);
  if (t) return n === 0 ? t('lib.dueToday') : n < 0 ? t.plural('lib.late', -n) : t.plural('lib.dueIn', n);
  if (n === 0) return 'Due today';
  if (n < 0) return `${-n} day${n === -1 ? '' : 's'} late`;
  return `Due in ${n} day${n === 1 ? '' : 's'}`;
}

/** The API searches students from two characters. */
export const STUDENT_QUERY_MIN = 2;

export function canSearchStudents(query: string): boolean {
  return query.trim().length >= STUDENT_QUERY_MIN;
}

/** Fines charged on returns and not collected yet. */
export function unpaidFines(loans: Pick<LibraryLoan, 'finePaise' | 'finePaidAt'>[]): { count: number; paise: number } {
  const open = loans.filter((l) => l.finePaise > 0 && !l.finePaidAt);
  return { count: open.length, paise: open.reduce((s, l) => s + l.finePaise, 0) };
}

/** "Unpaid", "Paid", or null when the loan carries no fine. */
export function fineStatus(loan: Pick<LibraryLoan, 'finePaise' | 'finePaidAt'>): 'paid' | 'unpaid' | null {
  if (loan.finePaise <= 0) return null;
  return loan.finePaidAt ? 'paid' : 'unpaid';
}
