'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { act, api } from '@/lib/api';
import { storeSession } from '@/lib/session';
import type { ActionResult } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9-]{1,60}$/;
const TOKEN = /^[A-Za-z0-9_-]{20,60}$/;

export async function inviteInfo(slug: string, token: string) {
  if (!SLUG.test(slug) || !TOKEN.test(token)) return null;
  return api<{ institution: string; name: string; role: string; phone: string }>(`/v1/public/examiner-invite/${slug}/${token}`, { anonymous: true }).catch(() => null);
}

export async function sendInviteCode(slug: string, token: string): Promise<ActionResult<undefined>> {
  if (!SLUG.test(slug) || !TOKEN.test(token)) return { ok: false, error: 'Not found' };
  const r = await act(() => api(`/v1/public/examiner-invite/${slug}/${token}/otp`, { method: 'POST', body: {}, anonymous: true }));
  return r.ok ? { ok: true, data: undefined } : r;
}

/** Checks the code, keeps the session in the httpOnly cookie and opens the portal. */
export async function verifyInviteCode(slug: string, token: string, code: string): Promise<ActionResult<undefined>> {
  if (!SLUG.test(slug) || !TOKEN.test(token) || !/^\d{6}$/.test(code)) return { ok: false, error: 'Not found' };
  const r = await act(() => api<{ accessToken: string }>(`/v1/public/examiner-invite/${slug}/${token}/verify`, { method: 'POST', body: { code }, anonymous: true }));
  if (!r.ok) return r;
  await storeSession(r.data.accessToken);
  redirect(`/examiner/${slug}`);
}

export async function valueScript(id: string, marks: number, remarks: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(id)) return { ok: false, error: 'Not found' };
  const r = await act(() => api(`/v1/examiner-portal/scripts/${id}`, { method: 'PUT', body: { marks, remarks: remarks || undefined } }));
  if (r.ok) revalidatePath('/examiner/[slug]', 'page');
  return r;
}

export async function savePaper(assignmentId: string, title: string, content: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(assignmentId)) return { ok: false, error: 'Not found' };
  const r = await act(() => api(`/v1/examiner-portal/assignments/${assignmentId}/question-paper`, { method: 'PUT', body: { title, content } }));
  if (r.ok) revalidatePath('/examiner/[slug]', 'page');
  return r;
}

export async function movePaper(assignmentId: string, action: 'submit' | 'approve' | 'return', note?: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(assignmentId)) return { ok: false, error: 'Not found' };
  const r = await act(() => api(`/v1/examiner-portal/assignments/${assignmentId}/question-paper/${action}`, { method: 'POST', body: { note } }));
  if (r.ok) revalidatePath('/examiner/[slug]', 'page');
  return r;
}

export async function claimFor(assignmentId: string): Promise<ActionResult<{ amountPaise: number }>> {
  if (!UUID.test(assignmentId)) return { ok: false, error: 'Not found' };
  return act(() => api<{ amountPaise: number }>(`/v1/examiner-portal/assignments/${assignmentId}/claims`, { method: 'POST', body: {} }));
}
