'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import { isIsoDate } from '@/lib/dates';
import { canSearchStudents } from '@/lib/library';
import type { ActionResult, LibraryBook, LibraryLoan, LibraryStudent, ReturnedLoan } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function addBook(input: { title: string; author: string; callNo: string; isbn: string; copies: number }): Promise<ActionResult<LibraryBook>> {
  const title = input.title.trim();
  const author = input.author.trim();
  const callNo = input.callNo.trim();
  const isbn = input.isbn.replace(/[\s-]/g, '');
  const { t } = await getI18n();
  if (!title || title.length > 300) return { ok: false, error: t('lib.err.title') };
  if (author.length > 200) return { ok: false, error: t('lib.err.author') };
  if (callNo.length > 40) return { ok: false, error: t('lib.err.callNo') };
  if (isbn && !/^(\d{9}[\dX]|\d{13})$/i.test(isbn)) return { ok: false, error: t('lib.err.isbn') };
  if (!Number.isInteger(input.copies) || input.copies < 1 || input.copies > 500) return { ok: false, error: t('lib.err.copies') };
  const res = await act(() =>
    api<LibraryBook>('/v1/library/books', { method: 'POST', body: { title, author, copies: input.copies, ...(callNo ? { callNo } : {}), ...(isbn ? { isbn } : {}) } }),
  );
  if (res.ok) revalidatePath('/library');
  return res;
}

export async function issueBook(input: { bookId: string; studentId: string; dueOn: string }): Promise<ActionResult<LibraryLoan>> {
  const { t } = await getI18n();
  if (!UUID.test(input.bookId)) return { ok: false, error: t('lib.err.book') };
  if (!UUID.test(input.studentId)) return { ok: false, error: t('lib.err.student') };
  if (!isIsoDate(input.dueOn)) return { ok: false, error: t('lib.err.due') };
  const res = await act(() => api<LibraryLoan>('/v1/library/loans', { method: 'POST', body: input }));
  if (res.ok) revalidatePath('/library');
  return res;
}

export async function returnBook(loanId: string): Promise<ActionResult<ReturnedLoan>> {
  if (!UUID.test(loanId)) return { ok: false, error: (await getI18n()).t('lib.err.loan') };
  const res = await act(() => api<ReturnedLoan>(`/v1/library/loans/${loanId}/return`, { method: 'POST' }));
  if (res.ok) revalidatePath('/library');
  return res;
}

/** Students to lend to, by name, roll number or class (the API answers from two characters). */
export async function findStudents(query: string): Promise<ActionResult<LibraryStudent[]>> {
  const q = query.trim().slice(0, 80);
  if (!canSearchStudents(q)) return { ok: true, data: [] };
  return act(() => api<LibraryStudent[]>(`/v1/library/students?q=${encodeURIComponent(q)}`));
}

/** The student paid the late fine at the desk. */
export async function markFinePaid(loanId: string): Promise<ActionResult<LibraryLoan>> {
  if (!UUID.test(loanId)) return { ok: false, error: (await getI18n()).t('lib.err.loan') };
  const res = await act(() => api<LibraryLoan>(`/v1/library/loans/${loanId}/fine-paid`, { method: 'POST' }));
  if (res.ok) revalidatePath('/library');
  return res;
}
