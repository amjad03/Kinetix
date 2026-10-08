// Server-action plumbing shared by the operations desks.

import { revalidatePath } from 'next/cache';
import { act, api } from '@/lib/api';
import type { ActionResult } from '@/lib/types';

/** Sends a change to the API and refreshes the page it came from. */
export async function send<T = unknown>(path: string, body: unknown, page: string, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE' = 'POST'): Promise<ActionResult<T>> {
  const res = await act(() => api<T>(path, { method, ...(body === undefined ? {} : { body }) }));
  if (res.ok) revalidatePath(page);
  return res;
}

/** A read the page asks for on demand (a detail dialog). */
export const read = <T>(path: string): Promise<ActionResult<T>> => act(() => api<T>(path));

export const num = (s: string | undefined): number => Number(s);
export const optStr = (s: string | undefined): string | undefined => (s && s.trim() ? s.trim() : undefined);
export const optNum = (s: string | undefined): number | undefined => (s && s.trim() ? Number(s) : undefined);
