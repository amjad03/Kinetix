'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import { isCellPath } from '@/lib/exam-cell';
import type { ActionResult } from '@/lib/types';

/**
 * One server action for the exam cell's desks: it sends a decision, a form or a row action to the API as the
 * signed-in user. Only the exam cell's own API paths (lib/exam-cell.ts) can be reached, with POST or PUT.
 */
export async function runCell<T = Record<string, unknown>>(method: 'POST' | 'PUT', path: string, body: Record<string, unknown> = {}): Promise<ActionResult<T>> {
  if ((method !== 'POST' && method !== 'PUT') || !isCellPath(path)) return { ok: false, error: (await getI18n()).t('error.generic') };
  const res = await act(() => api<T>(path, { method, body }));
  if (res.ok) revalidatePath('/exams', 'layout');
  return res;
}

const READS = /^\/v1\/(exam-papers\/[0-9a-f-]{36}\/double-entry|exam-sessions\/[0-9a-f-]{36}\/(runs|revisions|swaps|results\/[0-9a-f-]{36}\/revisions)|valuation-camps\/[0-9a-f-]{36}\/daily)$/;

/** A read a desk asks for on demand (a sheet, a day count, the versions of a result). */
export async function readCell<T>(path: string): Promise<ActionResult<T>> {
  if (!READS.test(path)) return { ok: false, error: (await getI18n()).t('error.generic') };
  return act(() => api<T>(path));
}
