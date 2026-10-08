'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { api } from '@/lib/api';
import { YEAR_COOKIE } from '@/lib/config';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The top bar's academic-year switcher: remembers the year on this browser (pages that can show another year read it). */
export async function setAcademicYear(id: string): Promise<{ ok: boolean }> {
  const jar = await cookies();
  if (id === '') jar.delete(YEAR_COOKIE);
  else if (UUID.test(id)) jar.set(YEAR_COOKIE, id, { sameSite: 'lax', path: '/', maxAge: 365 * 86_400 });
  else return { ok: false };
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Marks the bell's notifications as read. Best effort: a failure leaves them unread. */
export async function markNotificationsRead(): Promise<{ ok: boolean }> {
  try {
    await api('/v1/notifications/read-all', { method: 'POST' });
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
