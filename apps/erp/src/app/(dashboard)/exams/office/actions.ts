'use server';

import { revalidatePath } from 'next/cache';
import { act, api } from '@/lib/api';
import { KINDS, recordHref, type Kind, type OfficeSettings } from '@/lib/exam-office';
import type { ActionResult } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID = /^[0-9a-f-]{36}(_[0-9a-f-]{36})?$/i;
const ACTION = /^[a-z_]{2,40}$/;

const post = (path: string, body: unknown) => api<unknown>(path, { method: 'POST', body });

/**
 * Runs an action on an exam office record. Most go to the exam office API; result approval, publishing,
 * revaluation decisions and certificates go to the endpoints that own those records.
 */
export async function recordAction(kind: Kind, id: string, action: string, input: { comment?: string; value?: unknown } = {}): Promise<ActionResult<unknown>> {
  if (!(KINDS as readonly string[]).includes(kind) || !ID.test(id) || !ACTION.test(action)) return { ok: false, error: 'Not found' };
  const note = input.comment?.trim() || undefined;
  const res = await act(async () => {
    if (kind === 'session' && action === 'publish') return post(`/v1/exam-sessions/${id}/publish`, {});
    if (kind === 'session' && action === 'request_result_approval') return post(`/v1/exam-sessions/${id}/request-approval`, {});
    if (kind === 'session' && action === 'result_approval_approve') return post(`/v1/exam-sessions/${id}/approve`, { note });
    if (kind === 'session' && action === 'result_approval_reject') return post(`/v1/exam-sessions/${id}/return`, { note });
    if (kind === 'revaluation' && (action === 'approve' || action === 'reject')) return post(`/v1/revaluations/${id}/decide`, { accept: action === 'approve', note });
    if (kind === 'revaluation' && action === 'complete_revaluation') return post(`/v1/revaluations/${id}/complete`, { marks: Number((input.value as { marks?: unknown })?.marks) });
    if (kind === 'certificate' && (action === 'approve' || action === 'reject')) return post(`/v1/academic-docs/requests/${id}/decide`, { approve: action === 'approve', note });
    if (kind === 'certificate' && action === 'issue') return post(`/v1/academic-docs/requests/${id}/issue`, {});
    return post(`/v1/exam-office/records/${kind}/${id}/actions/${action}`, { comment: note, value: input.value });
  });
  if (res.ok) {
    revalidatePath(recordHref(kind, id));
    revalidatePath('/exams/office');
  }
  return res;
}

export async function saveOfficeSettings(s: OfficeSettings): Promise<ActionResult<unknown>> {
  if (s.defaultGradeScaleId && !UUID.test(s.defaultGradeScaleId)) return { ok: false, error: 'Not found' };
  const series = (x: OfficeSettings['hallTicketSeries']) => ({ prefix: x.prefix, next: Math.trunc(x.next), pad: Math.trunc(x.pad), suffix: x.suffix ?? '' });
  const res = await act(() => api<unknown>('/v1/exam-office/settings', { method: 'PUT', body: { ...s, hallTicketSeries: series(s.hallTicketSeries), certificateSeries: series(s.certificateSeries), qpSeries: series(s.qpSeries) } }));
  if (res.ok) revalidatePath('/exams/office/settings');
  return res;
}
