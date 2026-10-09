'use server';

import { getI18n } from '@/i18n/server';
import type { Annotation, NewAnnotation } from '@/lib/annotations';
import type { GradeDraft } from '@/lib/staff-changes';
import { send } from '@/lib/ops-server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = '/evaluation/desk';
const base = (id: string) => `/v1/evaluation/allocations/${encodeURIComponent(id)}`;

/** Saves the examiner's marks and comments for a script; can be called again to resume. */
export async function saveMarks(allocationId: string, entries: { questionId: string; marks: number; comment?: string }[]) {
  if (!UUID.test(allocationId) || entries.length === 0) return { ok: false as const, error: (await getI18n()).t('ev.desk.err.entries') };
  return send(`${base(allocationId)}/marks`, { entries }, PAGE, 'PUT');
}

/** Locks the valuation; the API refuses it while a question has no marks. */
export async function submitValuation(allocationId: string) {
  if (!UUID.test(allocationId)) return { ok: false as const, error: (await getI18n()).t('ev.desk.err.entries') };
  return send<{ total: number; needsThird: boolean }>(`${base(allocationId)}/submit`, undefined, PAGE);
}

/** Places one mark (tick, cross, comment or highlight) on a page of the examiner's script. */
export async function addAnnotation(allocationId: string, body: NewAnnotation) {
  if (!UUID.test(allocationId)) return { ok: false as const, error: (await getI18n()).t('ev.ann.err') };
  return send<Annotation>(`${base(allocationId)}/annotations`, body, PAGE);
}

export async function removeAnnotation(allocationId: string, id: string) {
  if (!UUID.test(allocationId) || !UUID.test(id)) return { ok: false as const, error: (await getI18n()).t('ev.ann.err') };
  return send(`${base(allocationId)}/annotations/${encodeURIComponent(id)}`, undefined, PAGE, 'DELETE');
}

/** Asks the AI for a marking draft for one question. Nothing is entered until the examiner decides. */
export async function suggestGrade(allocationId: string, body: { questionId: string; question: string; answerText: string; rubric?: { criterion: string; marks: number }[] }) {
  if (!UUID.test(allocationId) || !UUID.test(body.questionId)) return { ok: false as const, error: (await getI18n()).t('as.ga.needAnswer') };
  return send<GradeDraft>(`/v1/grading-assist/evaluation/${encodeURIComponent(allocationId)}/suggest`, body, PAGE);
}

/** Accepts, edits or rejects a draft; accepting or editing enters the marks in the open valuation. */
export async function decideGrade(id: string, body: { action: 'accept' | 'edit' | 'reject'; marks?: number }) {
  if (!UUID.test(id)) return { ok: false as const, error: (await getI18n()).t('error.generic') };
  return send<GradeDraft>(`/v1/grading-assist/suggestions/${encodeURIComponent(id)}/decision`, body, PAGE, 'PUT');
}
