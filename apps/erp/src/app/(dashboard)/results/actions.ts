'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import type { ActionResult, AssessmentDetail } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Principal and administrator: publish marks a teacher has entered. */
export async function publishAssessment(id: string): Promise<ActionResult<AssessmentDetail>> {
  if (!UUID.test(id)) return { ok: false, error: (await getI18n()).t('results.unknown') };
  const res = await act(() => api<AssessmentDetail>(`/v1/assessments/${id}/publish`, { method: 'POST' }));
  if (res.ok) {
    revalidatePath('/results');
    revalidatePath(`/results/${id}`);
  }
  return res;
}
