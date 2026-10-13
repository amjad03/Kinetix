'use server';

import { revalidatePath } from 'next/cache';
import { act, api } from '@/lib/api';
import type { ActionResult } from '@/lib/types';

/** Only the desk's own endpoints (and the shared fee reminder) can be reached through these actions. */
const ALLOWED = /^\/v1\/(fee-accounts\/[a-z0-9/-]+|fees\/reminders|fees\/late-fee-rule)$/;

/** Sends a change to the API and refreshes the desk. */
export async function deskSend<T = unknown>(path: string, body: unknown, method: 'POST' | 'PUT' | 'PATCH' = 'POST'): Promise<ActionResult<T>> {
  if (!ALLOWED.test(path)) return { ok: false, error: 'Not allowed' } as ActionResult<T>;
  const res = await act(() => api<T>(path, { method, body }));
  if (res.ok) revalidatePath('/accounts', 'layout');
  return res;
}

/** A read the desk asks for on demand (expected cash for a day). */
export async function deskRead<T = unknown>(path: string): Promise<ActionResult<T>> {
  if (!ALLOWED.test(path.split('?')[0])) return { ok: false, error: 'Not allowed' } as ActionResult<T>;
  return act(() => api<T>(path));
}
