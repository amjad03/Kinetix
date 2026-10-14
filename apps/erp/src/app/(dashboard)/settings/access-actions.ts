'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import { ACCESS_LEVELS, type AccessLevel, type AccessUser, type DataExport } from '@/lib/governance-access';
import type { ActionResult } from '@/lib/types';

/**
 * Users and access, roles and permissions, notifications and data exports: server actions that send the change to
 * the API as the signed-in user. The API checks who may and every value.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[a-z][a-zA-Z_]{1,40}$/;
const bad = async (): Promise<ActionResult<never>> => ({ ok: false, error: (await getI18n()).t('error.generic') });
const okList = (v: unknown, max: number): v is string[] => Array.isArray(v) && v.length <= max && v.every((x) => typeof x === 'string' && KEY.test(x));

export async function getAccessUser(id: string): Promise<ActionResult<AccessUser>> {
  if (!UUID.test(id)) return bad();
  return act(() => api<AccessUser>(`/v1/admin/access/users/${id}`));
}

/** Sets a person's roles; the API signs them out so the change applies at once. */
export async function setUserRoles(id: string, roles: string[]): Promise<ActionResult<{ before: string[]; after: string[]; signedOut: number }>> {
  if (!UUID.test(id) || !okList(roles, 40)) return bad();
  const res = await act(() => api<{ before: string[]; after: string[]; signedOut: number }>(`/v1/admin/access/users/${id}/roles`, { method: 'PUT', body: { roles } }));
  if (res.ok) revalidatePath('/settings/users');
  return res;
}

export async function signOutUser(id: string): Promise<ActionResult<{ signedOut: number }>> {
  if (!UUID.test(id)) return bad();
  const res = await act(() => api<{ signedOut: number }>(`/v1/admin/access/users/${id}/sign-out`, { method: 'POST' }));
  if (res.ok) revalidatePath('/settings/users');
  return res;
}

export async function revokeUserSession(id: string, sessionId: string): Promise<ActionResult<null>> {
  if (!UUID.test(id) || !UUID.test(sessionId)) return bad();
  const res = await act(async () => {
    await api(`/v1/admin/access/users/${id}/sessions/${sessionId}`, { method: 'DELETE' });
    return null;
  });
  if (res.ok) revalidatePath('/settings/users');
  return res;
}

/** A new temporary password, shown once; the person must choose their own at their next sign-in. */
export async function resetUserPassword(id: string): Promise<ActionResult<{ temporaryPassword: string }>> {
  if (!UUID.test(id)) return bad();
  return act(() => api<{ temporaryPassword: string }>(`/v1/admin/users/${id}/reset-password`, { method: 'POST' }));
}

export async function resetUserMfa(id: string): Promise<ActionResult<null>> {
  if (!UUID.test(id)) return bad();
  const res = await act(async () => {
    await api(`/v1/admin/users/${id}/mfa/reset`, { method: 'POST' });
    return null;
  });
  if (res.ok) revalidatePath('/settings/users');
  return res;
}

// ---- roles and permissions ---------------------------------------------------------------------------------------

export async function saveRoleAccess(role: string, changes: { module: string; access: AccessLevel }[]): Promise<ActionResult<{ role: string; changed: number }>> {
  if (!KEY.test(role) || !Array.isArray(changes) || !changes.length || changes.length > 100 || !changes.every((c) => KEY.test(c.module) && ACCESS_LEVELS.includes(c.access))) return bad();
  const res = await act(() => api<{ role: string; changed: number }>('/v1/admin/access/matrix', { method: 'PUT', body: { role, changes } }));
  if (res.ok) revalidatePath('/settings/roles');
  return res;
}

export async function copyRoleAccess(from: string, to: string): Promise<ActionResult<{ role: string; changed: number }>> {
  if (!KEY.test(from) || !KEY.test(to)) return bad();
  const res = await act(() => api<{ role: string; changed: number }>('/v1/admin/access/matrix/copy', { method: 'POST', body: { from, to } }));
  if (res.ok) revalidatePath('/settings/roles');
  return res;
}

export async function resetRoleAccess(role?: string): Promise<ActionResult<{ roles: number; changed: number }>> {
  if (role !== undefined && !KEY.test(role)) return bad();
  const res = await act(() => api<{ roles: number; changed: number }>('/v1/admin/access/matrix/reset', { method: 'POST', body: role ? { role } : {} }));
  if (res.ok) revalidatePath('/settings/roles');
  return res;
}

// ---- notifications -----------------------------------------------------------------------------------------------

export async function saveNotificationSettings(off: string[], pushOff: string[]): Promise<ActionResult<{ off: string[]; pushOff: string[] }>> {
  if (!okList(off, 40) || !okList(pushOff, 40)) return bad();
  const res = await act(() => api<{ off: string[]; pushOff: string[] }>('/v1/admin/notification-settings', { method: 'PUT', body: { off, pushOff } }));
  if (res.ok) revalidatePath('/settings/notifications');
  return res;
}

/** Which channels the institution uses to reach people (Institution setup policy). */
export async function saveChannels(channels: { push: boolean; sms: boolean; email: boolean; whatsapp: boolean }): Promise<ActionResult<null>> {
  if (!channels || !['push', 'sms', 'email', 'whatsapp'].every((k) => typeof channels[k as keyof typeof channels] === 'boolean')) return bad();
  const res = await act(async () => {
    await api('/v1/admin/institution/setup', { method: 'PUT', body: { commsChannels: { push: channels.push, sms: channels.sms, email: channels.email, whatsapp: channels.whatsapp } } });
    return null;
  });
  if (res.ok) revalidatePath('/settings/notifications');
  return res;
}

// ---- data exports ------------------------------------------------------------------------------------------------

export async function requestDataExport(note: string): Promise<ActionResult<DataExport>> {
  if (typeof note !== 'string' || note.length > 200) return bad();
  const res = await act(() => api<DataExport>('/v1/admin/data-exports', { method: 'POST', body: { note: note.trim() } }));
  if (res.ok) revalidatePath('/settings/data-export');
  return res;
}

export async function deleteDataExport(id: string): Promise<ActionResult<null>> {
  if (!UUID.test(id)) return bad();
  const res = await act(async () => {
    await api(`/v1/admin/data-exports/${id}`, { method: 'DELETE' });
    return null;
  });
  if (res.ok) revalidatePath('/settings/data-export');
  return res;
}
