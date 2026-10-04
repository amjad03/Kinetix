'use server';

import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { getI18n } from '@/i18n/server';
import { api, ApiError } from '@/lib/api';
import { REMARK_MAX, reviewErrorText } from '@/lib/plans';
import type { ActionResult, LessonPlan } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Head of department or principal: marks a lesson plan as reviewed, with an optional remark. */
export async function reviewLessonPlan(id: string, remark: string): Promise<ActionResult<LessonPlan>> {
  const { t } = await getI18n();
  if (!UUID.test(id)) return { ok: false, error: t('error.NOT_FOUND') };
  const text = remark.trim();
  if (text.length > REMARK_MAX) return { ok: false, error: t('plan.review.tooLong', { n: REMARK_MAX }) };
  try {
    const plan = await api<LessonPlan>(`/v1/lesson-plans/${id}/review`, { method: 'POST', body: text ? { remark: text } : {} });
    revalidatePath('/department/plan');
    return { ok: true, data: plan };
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: e instanceof ApiError ? reviewErrorText(e, t) : t('error.generic') };
  }
}
