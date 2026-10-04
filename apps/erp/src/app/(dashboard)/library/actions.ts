'use server';

import { revalidatePath } from 'next/cache';
import { act, api } from '@/lib/api';
import { isIsoDate } from '@/lib/dates';
import type { ActionResult, LibraryBook, LibraryLoan, ReturnedLoan } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function addBook(input: { title: string; author: string; callNo: string; isbn: string; copies: number }): Promise<ActionResult<LibraryBook>> {
  const title = input.title.trim();
  const author = input.author.trim();
  const callNo = input.callNo.trim();
  const isbn = input.isbn.replace(/[\s-]/g, '');
  if (!title || title.length > 300) return { ok: false, error: 'Enter the title (up to 300 characters).' };
  if (author.length > 200) return { ok: false, error: 'Keep the author under 200 characters.' };
  if (callNo.length > 40) return { ok: false, error: 'Keep the call number under 40 characters.' };
  if (isbn && !/^(\d{9}[\dX]|\d{13})$/i.test(isbn)) return { ok: false, error: 'An ISBN has 10 or 13 digits.' };
  if (!Number.isInteger(input.copies) || input.copies < 1 || input.copies > 500) return { ok: false, error: 'Copies must be between 1 and 500.' };
  const res = await act(() =>
    api<LibraryBook>('/v1/library/books', { method: 'POST', body: { title, author, copies: input.copies, ...(callNo ? { callNo } : {}), ...(isbn ? { isbn } : {}) } }),
  );
  if (res.ok) revalidatePath('/library');
  return res;
}

export async function issueBook(input: { bookId: string; studentId: string; dueOn: string }): Promise<ActionResult<LibraryLoan>> {
  if (!UUID.test(input.bookId)) return { ok: false, error: 'Choose a book.' };
  if (!UUID.test(input.studentId)) return { ok: false, error: 'Choose a student.' };
  if (!isIsoDate(input.dueOn)) return { ok: false, error: 'Choose the due date.' };
  const res = await act(() => api<LibraryLoan>('/v1/library/loans', { method: 'POST', body: input }));
  if (res.ok) revalidatePath('/library');
  return res;
}

export async function returnBook(loanId: string): Promise<ActionResult<ReturnedLoan>> {
  if (!UUID.test(loanId)) return { ok: false, error: 'Unknown loan.' };
  const res = await act(() => api<ReturnedLoan>(`/v1/library/loans/${loanId}/return`, { method: 'POST' }));
  if (res.ok) revalidatePath('/library');
  return res;
}
