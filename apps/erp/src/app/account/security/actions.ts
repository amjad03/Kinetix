'use server';

import { revalidatePath } from 'next/cache';
import { act, api } from '@/lib/api';
import { storeSession } from '@/lib/session';
import type { ActionResult } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE = /^[0-9a-fA-F -]{6,20}$/;

export async function startMfa(): Promise<ActionResult<{ secret: string; otpauthUri: string }>> {
  return act(() => api<{ secret: string; otpauthUri: string }>('/v1/me/mfa/enrol', { method: 'POST' }));
}

/** Turns two-step sign-in on. The API answers with a token without the set-up restriction, which replaces the session. */
export async function confirmMfa(code: string): Promise<ActionResult<{ backupCodes: string[] }>> {
  if (!CODE.test(code.trim())) return { ok: false, error: 'Enter the 6-digit code.' };
  const res = await act(() => api<{ backupCodes: string[]; accessToken: string }>('/v1/me/mfa/confirm', { method: 'POST', body: { code: code.trim() } }));
  if (!res.ok) return res;
  await storeSession(res.data.accessToken);
  revalidatePath('/account/security');
  return { ok: true, data: { backupCodes: res.data.backupCodes } };
}

export async function newBackupCodes(code: string): Promise<ActionResult<{ backupCodes: string[] }>> {
  if (!CODE.test(code.trim())) return { ok: false, error: 'Enter a code.' };
  const res = await act(() => api<{ backupCodes: string[] }>('/v1/me/mfa/backup-codes', { method: 'POST', body: { code: code.trim() } }));
  if (res.ok) revalidatePath('/account/security');
  return res;
}

export async function disableMfa(code: string): Promise<ActionResult> {
  if (!CODE.test(code.trim())) return { ok: false, error: 'Enter a code.' };
  const res = await act(() => api('/v1/me/mfa', { method: 'DELETE', body: { code: code.trim() } }));
  if (res.ok) revalidatePath('/account/security');
  return res.ok ? { ok: true, data: undefined } : res;
}

export async function revokeSession(id: string): Promise<ActionResult> {
  if (!UUID.test(id)) return { ok: false, error: 'Not found.' };
  const res = await act(() => api(`/v1/me/sessions/${id}`, { method: 'DELETE' }));
  if (res.ok) revalidatePath('/account/security');
  return res.ok ? { ok: true, data: undefined } : res;
}

export async function revokeOtherSessions(): Promise<ActionResult> {
  const res = await act(() => api('/v1/me/sessions/revoke-others', { method: 'POST' }));
  if (res.ok) revalidatePath('/account/security');
  return res.ok ? { ok: true, data: undefined } : res;
}
