'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import { isLibraryPassPost } from '@/lib/library-pass';
import type { ActionResult } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CARD = /^[A-Za-z0-9/._-]{1,60}$/;

/** Reserves a book whose copies are all out: for oneself, or (at the desk) for the member whose card is given. */
export async function reserveBook(bookId: string, memberCode: string): Promise<ActionResult<Record<string, unknown>>> {
  const code = memberCode.trim();
  if (!UUID.test(bookId) || (code && !CARD.test(code))) return { ok: false, error: (await getI18n()).t('error.generic') };
  const res = await act(() => api<Record<string, unknown>>('/v1/library/reservations', { method: 'POST', body: { bookId, ...(code ? { memberCode: code } : {}) } }));
  if (res.ok) revalidatePath('/library/opac');
  return res;
}

/** Renews one's own loan, or cancels one's own reservation. */
export async function myLibrary(kind: 'renew' | 'cancel', id: string): Promise<ActionResult<Record<string, unknown>>> {
  const path = kind === 'renew' ? `/v1/library/loans/${id}/renew` : `/v1/library/reservations/${id}/cancel`;
  if (!UUID.test(id) || !isLibraryPassPost(path)) return { ok: false, error: (await getI18n()).t('error.generic') };
  const res = await act(() => api<Record<string, unknown>>(path, { method: 'POST' }));
  if (res.ok) revalidatePath('/library/opac');
  return res;
}
