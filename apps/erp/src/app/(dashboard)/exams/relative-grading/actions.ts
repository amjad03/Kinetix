'use server';

import { revalidatePath } from 'next/cache';
import { act, api } from '@/lib/api';
import type { CurvePreview, RelativeSettings } from '@/lib/relative-grading';
import type { ActionResult } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = { ok: false as const, error: 'Not allowed' };

/** Turns relative grading on or off, with the smallest class it applies to. */
export async function saveCurveSettings(enabled: boolean, minClassSize: number | null): Promise<ActionResult<RelativeSettings>> {
  const res = await act(() => api<RelativeSettings>('/v1/relative-grading/settings', { method: 'PUT', body: { enabled, minClassSize } }));
  if (res.ok) revalidatePath('/exams/relative-grading');
  return res;
}

/** What the curve gives for a subject with a moderation shift; saves nothing. */
export async function previewCurve(sessionId: string, subjectId: string, shift: number): Promise<ActionResult<CurvePreview>> {
  if (!UUID.test(sessionId) || !UUID.test(subjectId)) return bad;
  return act(() => api<CurvePreview>(`/v1/relative-grading/sessions/${sessionId}/subjects/${subjectId}/preview`, { method: 'POST', body: { shift } }));
}

/** Applies the curve to a subject; processed results are graded again. */
export async function applyCurve(sessionId: string, subjectId: string, shift: number, note: string): Promise<ActionResult<CurvePreview>> {
  if (!UUID.test(sessionId) || !UUID.test(subjectId)) return bad;
  const res = await act(() => api<CurvePreview>(`/v1/relative-grading/sessions/${sessionId}/subjects/${subjectId}`, { method: 'PUT', body: { shift, note } }));
  if (res.ok) revalidatePath('/exams', 'layout');
  return res;
}

/** Back to the absolute bands for a subject. */
export async function clearCurve(sessionId: string, subjectId: string): Promise<ActionResult<{ cleared: boolean; regraded: number }>> {
  if (!UUID.test(sessionId) || !UUID.test(subjectId)) return bad;
  const res = await act(() => api<{ cleared: boolean; regraded: number }>(`/v1/relative-grading/sessions/${sessionId}/subjects/${subjectId}`, { method: 'DELETE' }));
  if (res.ok) revalidatePath('/exams', 'layout');
  return res;
}
