'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import type { ActionResult } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tags a board poll with the course outcomes it measures (an empty list clears the tags). */
export async function tagPoll(pollId: string, coIds: string[]): Promise<ActionResult<{ tagged: number }>> {
  if (!UUID.test(pollId) || !coIds.every((c) => UUID.test(c))) return { ok: false, error: (await getI18n()).t('error.generic') };
  const res = await act(() => api<{ tagged: number }>(`/v1/obe/polls/${pollId}/cos`, { method: 'PUT', body: { coIds } }));
  if (res.ok) revalidatePath('/obe/classroom');
  return res;
}
