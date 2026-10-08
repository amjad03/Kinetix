'use server';

import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import { INSIGHT_PATH, isInsightKind, type InsightResponse } from '@/lib/ai-insight';
import type { ActionResult } from '@/lib/types';

/** Asks KINETIX AI for the finance, admissions or HR summary, in the language of the screen. */
export async function askInsight(kind: string): Promise<ActionResult<InsightResponse>> {
  const { locale, t } = await getI18n();
  if (!isInsightKind(kind)) return { ok: false, error: t('error.NOT_FOUND') };
  return act(() => api<InsightResponse>(INSIGHT_PATH[kind], { method: 'POST', body: { language: locale }, timeoutMs: 90_000 }));
}
