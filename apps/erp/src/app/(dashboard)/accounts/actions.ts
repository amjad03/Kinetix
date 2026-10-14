'use server';

import { revalidatePath } from 'next/cache';
import { act, api } from '@/lib/api';
import type { ActionResult } from '@/lib/types';

/**
 * Only the fees and accounts endpoints (the desk, fee setup, the counter, bank reconciliation, and the shared fee
 * reminder and late-fee rule) can be reached through these actions.
 */
const ALLOWED = /^\/v1\/(fee-accounts\/[a-z0-9/-]+|fee-setup\/[a-z0-9/-]+|fee-collect\/[a-z0-9/-]+|accounts-depth\/[a-z0-9/-]+|fees\/reminders|fees\/late-fee-rule|fees\/late-fees\/run)$/;

/** Sends a change to the API and refreshes the fees and accounts pages. */
export async function deskSend<T = unknown>(path: string, body: unknown, method: 'POST' | 'PUT' | 'PATCH' = 'POST'): Promise<ActionResult<T>> {
  if (!ALLOWED.test(path)) return { ok: false, error: 'Not allowed' } as ActionResult<T>;
  const res = await act(() => api<T>(path, { method, body, timeoutMs: 120_000 }));
  if (res.ok) {
    revalidatePath('/accounts', 'layout');
    revalidatePath('/fees', 'layout');
  }
  return res;
}

/** A read the desk asks for on demand (expected cash for a day, a student's dues, a preview). */
export async function deskRead<T = unknown>(path: string): Promise<ActionResult<T>> {
  if (!ALLOWED.test(path.split('?')[0])) return { ok: false, error: 'Not allowed' } as ActionResult<T>;
  return act(() => api<T>(path));
}

/** A computation the desk asks for without saving anything (the counter's split preview). */
export async function deskPeek<T = unknown>(path: string, body: unknown): Promise<ActionResult<T>> {
  if (!ALLOWED.test(path)) return { ok: false, error: 'Not allowed' } as ActionResult<T>;
  return act(() => api<T>(path, { method: 'POST', body }));
}
