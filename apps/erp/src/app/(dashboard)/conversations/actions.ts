'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import type { ChatSettingsView, FamilyMessage, FamilyThread, FileInput, OfficeHours, ThreadStatus } from '@/lib/communication';
import type { ActionResult } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = async <T>(): Promise<ActionResult<T>> => ({ ok: false, error: (await getI18n()).t('fc.err.unknown') });
const conv = (id: string) => `/v1/conversations/${id}`;

export async function sendFamilyMessage(id: string, body: string, attachment?: FileInput): Promise<ActionResult<FamilyMessage & { afterHours: boolean; officeHours: OfficeHours | null }>> {
  if (!UUID.test(id)) return bad();
  return act(() => api(`${conv(id)}/messages`, { method: 'POST', body: { body: body.slice(0, 2000), attachment } }));
}

export async function markFamilyRead(id: string): Promise<ActionResult<null>> {
  if (!UUID.test(id)) return bad();
  return act(() => api<null>(`${conv(id)}/read`, { method: 'POST' }));
}

export async function setThreadStatus(id: string, status: ThreadStatus): Promise<ActionResult<FamilyThread>> {
  if (!UUID.test(id)) return bad();
  const r = await act(() => api<FamilyThread>(`${conv(id)}/status`, { method: 'POST', body: { status } }));
  if (r.ok) revalidatePath('/conversations');
  return r;
}

export async function muteThread(id: string, muted: boolean): Promise<ActionResult<FamilyThread>> {
  if (!UUID.test(id)) return bad();
  return act(() => api<FamilyThread>(`${conv(id)}/mute`, { method: 'POST', body: { muted } }));
}

export async function assignThread(id: string, userId: string): Promise<ActionResult<FamilyThread>> {
  if (!UUID.test(id) || !UUID.test(userId)) return bad();
  const r = await act(() => api<FamilyThread>(`${conv(id)}/assign`, { method: 'POST', body: { userId } }));
  if (r.ok) revalidatePath('/conversations');
  return r;
}

export async function studentFamily(studentId: string): Promise<ActionResult<{ student: { id: string; fullName: string; className: string }; people: { id: string; fullName: string; relation: string }[]; office: boolean }>> {
  if (!UUID.test(studentId)) return bad();
  return act(() => api(`/v1/conversations/families/${studentId}`));
}

export async function startFamilyThread(body: { studentId: string; withUserId: string; office: boolean }): Promise<ActionResult<FamilyThread>> {
  if (!UUID.test(body.studentId) || !UUID.test(body.withUserId)) return bad();
  const r = await act(() => api<FamilyThread>('/v1/conversations', { method: 'POST', body }));
  if (r.ok) revalidatePath('/conversations');
  return r;
}

export async function searchStudents(q: string): Promise<ActionResult<{ id: string; fullName: string; rollNo: string; className: string }[]>> {
  // Leaders and office staff find any student; teachers the students of their classes.
  return act(() => api<{ id: string; fullName: string; rollNo: string; className: string }[]>(`/v1/conversations/students?q=${encodeURIComponent(q.slice(0, 60))}`));
}

export async function saveChatSettings(body: { studentChat?: boolean; officeHours?: OfficeHours | null; officeUserIds?: string[]; officeRoles?: string[] }): Promise<ActionResult<ChatSettingsView>> {
  const r = await act(() => api<ChatSettingsView>('/v1/conversations/settings', { method: 'PUT', body }));
  if (r.ok) revalidatePath('/conversations');
  return r;
}

export async function setClassTeacher(sectionId: string, userId: string | null): Promise<ActionResult<null>> {
  if (!UUID.test(sectionId) || (userId !== null && !UUID.test(userId))) return bad();
  const r = await act(() => api<null>(`/v1/conversations/class-teachers/${sectionId}`, { method: 'PUT', body: { userId } }));
  if (r.ok) revalidatePath('/conversations');
  return r;
}
