'use server';

import { act, api } from '@/lib/api';
import type { ChatThread } from '@/lib/chat';

export async function startThread(body: { kind: 'direct'; userId: string } | { kind: 'group'; title: string; userIds: string[] } | { kind: 'external'; channel: 'email' | 'whatsapp'; contactName: string; contactAddress: string; contactKind: string; userIds: string[] }) {
  return act(() => api<ChatThread>('/v1/chat/threads', { method: 'POST', body }));
}

export async function sendMessage(threadId: string, body: string, attachment?: { filename: string; contentType: string; contentBase64: string }) {
  return act(() => api<{ id: string }>(`/v1/chat/threads/${threadId}/messages`, { method: 'POST', body: { body, attachment } }));
}

export async function markRead(threadId: string) {
  return act(() => api(`/v1/chat/threads/${threadId}/read`, { method: 'POST' }));
}

export async function typing(threadId: string) {
  return act(() => api(`/v1/chat/threads/${threadId}/typing`, { method: 'POST' }));
}

export async function pinThread(threadId: string, pinned: boolean) {
  return act(() => api(`/v1/chat/threads/${threadId}/pin`, { method: 'POST', body: { pinned } }));
}

export async function addMembers(threadId: string, userIds: string[]) {
  return act(() => api(`/v1/chat/threads/${threadId}/members`, { method: 'POST', body: { userIds } }));
}
