// Library desk helpers: availability, due dates and late fines, student search. Pure, so the
// client components and tests can use them.

import { daysBetween } from './dates';
import type { LibraryBook, LibraryStudent } from './types';

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

/** "Due today", "Due in 3 days", "4 days late". */
export function dueLabel(dueOn: string, today: string): string {
  const n = daysBetween(today, dueOn);
  if (n === 0) return 'Due today';
  if (n < 0) return `${-n} day${n === -1 ? '' : 's'} late`;
  return `Due in ${n} day${n === 1 ? '' : 's'}`;
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

/** Every word typed must appear in the name, roll number or class. */
export function matchesStudent(s: LibraryStudent, query: string): boolean {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = norm(`${s.fullName} ${s.rollNo ?? ''} ${s.className}`);
  return words.every((w) => hay.includes(w));
}

/** Matches first by roll number, then by name; at most `limit`. */
export function searchStudents(list: LibraryStudent[], query: string, limit = 50): LibraryStudent[] {
  const q = norm(query.trim());
  const hits = list.filter((s) => matchesStudent(s, q));
  const rank = (s: LibraryStudent) => ((s.rollNo ?? '').toLowerCase() === q ? 0 : norm(s.fullName).startsWith(q) ? 1 : 2);
  return hits.sort((a, b) => rank(a) - rank(b) || a.fullName.localeCompare(b.fullName)).slice(0, limit);
}

/** Students known to the library desk, de-duplicated and sorted. */
export function uniqueStudents(list: LibraryStudent[]): LibraryStudent[] {
  const byId = new Map<string, LibraryStudent>();
  for (const s of list) if (!byId.has(s.id)) byId.set(s.id, s);
  return [...byId.values()].sort((a, b) => a.className.localeCompare(b.className) || (a.rollNo ?? '').localeCompare(b.rollNo ?? '') || a.fullName.localeCompare(b.fullName));
}
