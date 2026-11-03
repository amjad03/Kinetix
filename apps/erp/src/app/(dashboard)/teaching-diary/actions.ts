'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import type { ActionResult } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The head of department signs off diary entries (one or many), with an optional remark the teacher is sent. */
export async function reviewEntries(ids: string[], remark: string): Promise<ActionResult<{ reviewed: number; refused: { id: string; reason: string }[] }>> {
  if (!ids.length || ids.length > 200 || !ids.every((x) => UUID.test(x)) || remark.length > 500) return { ok: false, error: (await getI18n()).t('tts2.err.invalid') };
  const res = await act(() => api<{ reviewed: number; refused: { id: string; reason: string }[] }>('/v1/teaching-log/review', { method: 'POST', body: { ids, remark: remark.trim() } }));
  if (res.ok) revalidatePath('/teaching-diary');
  return res;
}
