'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import { GRACE_MAX, GRACE_MIN } from '@/lib/retention';
import type { ActionResult } from '@/lib/types';

/** How many days class recordings are kept after their semester ends (recordingRetentionGraceDays). */
export async function saveRetentionGraceDays(days: number): Promise<ActionResult<{ recordingRetentionGraceDays: number }>> {
  if (!Number.isInteger(days) || days < GRACE_MIN || days > GRACE_MAX) return { ok: false, error: (await getI18n()).t('retention.graceProblem') };
  const res = await act(() => api<{ recordingRetentionGraceDays: number }>('/v1/admin/settings', { method: 'PUT', body: { recordingRetentionGraceDays: days } }));
  if (res.ok) revalidatePath('/settings');
  return res;
}
