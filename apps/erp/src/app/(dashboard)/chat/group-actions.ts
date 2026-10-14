'use server';

import { revalidatePath } from 'next/cache';
import { act, api } from '@/lib/api';

/** Opens (or returns) the group chat of a class or club. */
export async function openLinkedGroup(body: { kind: 'section' | 'club'; id: string; postPolicy: 'all' | 'admins'; quietStart: string | null; quietEnd: string | null }) {
  const r = await act(() => api<{ id: string; created: boolean }>('/v1/chat/groups/linked', { method: 'POST', body }));
  if (r.ok) revalidatePath('/chat');
  return r;
}

export async function saveGroupSettings(threadId: string, body: { postPolicy: 'all' | 'admins'; quietStart: string | null; quietEnd: string | null }) {
  return act(() => api(`/v1/chat/threads/${encodeURIComponent(threadId)}/settings`, { method: 'PATCH', body }));
}

export async function syncGroup(threadId: string) {
  return act(() => api<{ members: number; added: number; removed: number }>(`/v1/chat/threads/${encodeURIComponent(threadId)}/sync`, { method: 'POST' }));
}
