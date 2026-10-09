'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import { isDepthPath } from '@/lib/depth';
import type { ActionResult } from '@/lib/types';

/**
 * One server action for every depth desk: it sends the form or row action to the API as the signed-in user.
 * Only the listed API paths can be reached, and only with POST, PUT or DELETE.
 */
export async function runDepth(method: 'POST' | 'PUT' | 'DELETE', path: string, body: Record<string, unknown>): Promise<ActionResult<Record<string, unknown>>> {
  if (!['POST', 'PUT', 'DELETE'].includes(method) || !isDepthPath(path)) return { ok: false, error: (await getI18n()).t('error.generic') };
  const res = await act(() => api<Record<string, unknown> | null>(path, { method, body: method === 'DELETE' ? undefined : body }));
  if (!res.ok) return res;
  revalidatePath('/', 'layout');
  return { ok: true, data: res.data ?? {} };
}
