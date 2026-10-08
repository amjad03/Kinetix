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

async function flow(id: string, path: string, body?: unknown, method: 'POST' | 'PUT' = 'POST'): Promise<ActionResult<AssessmentDetail>> {
  if (!UUID.test(id)) return { ok: false, error: (await getI18n()).t('results.unknown') };
  const res = await act(() => api<AssessmentDetail>(`/v1/assessments/${id}/${path}`, { method, body }));
  if (res.ok) {
    revalidatePath('/results');
    revalidatePath(`/results/${id}`);
  }
  return res;
}

/** Type in or correct marks for the class (only while the marks are still a draft). */
export async function enterMarks(id: string, entries: { studentId: string; marks: number | null; absent: boolean }[]): Promise<ActionResult<AssessmentDetail>> {
  const { t } = await getI18n();
  if (entries.length === 0 || entries.some((e) => !UUID.test(e.studentId) || (e.marks !== null && (!Number.isFinite(e.marks) || e.marks < 0)))) return { ok: false, error: t('results.entry.invalid') };
  return flow(id, 'marks', { entries: entries.map((e) => ({ studentId: e.studentId, marks: e.absent ? null : e.marks, absent: e.absent })) }, 'PUT');
}
export async function submitMarks(id: string) {
  return flow(id, 'submit');
}
export async function verifyMarks(id: string) {
  return flow(id, 'verify');
}
export async function reopenMarks(id: string) {
  return flow(id, 'reopen');
}
export async function moderateMarks(id: string, adjustments: { studentId: string; moderatedMarks: number; note: string }[]): Promise<ActionResult<AssessmentDetail>> {
  const { t } = await getI18n();
  if (adjustments.length === 0 || adjustments.some((a) => !UUID.test(a.studentId) || !Number.isFinite(a.moderatedMarks) || a.moderatedMarks < 0 || !a.note.trim())) return { ok: false, error: t('results.moderate.invalid') };
  return flow(id, 'moderate', { adjustments: adjustments.map((a) => ({ ...a, note: a.note.trim() })) });
}
