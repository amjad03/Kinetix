'use server';

import { revalidatePath } from 'next/cache';
import { act, api } from '@/lib/api';
import type { ActionResult, Audience, DeliveryReport, Priority } from '@/lib/types';

export interface BroadcastInput {
  title: string;
  body: string;
  priority: Priority;
  requiresAck: boolean;
  ttlMinutes: number;
  audience: Audience;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function sendBroadcast(input: BroadcastInput): Promise<ActionResult<{ id: string; targetedBoards: number }>> {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title || title.length > 120) return { ok: false, error: 'Give the message a title of up to 120 characters.' };
  if (!body || body.length > 2000) return { ok: false, error: 'Write a message of up to 2,000 characters.' };
  if (!['info', 'important', 'emergency'].includes(input.priority)) return { ok: false, error: 'Choose a priority.' };
  const ids = (xs?: string[]) => (xs ?? []).filter((x) => UUID.test(x));
  const audience: Audience = input.audience.all
    ? { all: true }
    : { programIds: ids(input.audience.programIds), sectionIds: ids(input.audience.sectionIds) };
  if (!audience.all && !audience.programIds?.length && !audience.sectionIds?.length) return { ok: false, error: 'Choose who receives the message.' };

  const res = await act(() =>
    api<{ id: string; targetedBoards: number }>('/v1/broadcasts', {
      method: 'POST',
      body: {
        title,
        body,
        priority: input.priority,
        requiresAck: input.requiresAck || input.priority === 'emergency',
        ttlMinutes: Math.min(Math.max(Math.round(input.ttlMinutes), 1), 7 * 24 * 60),
        audience,
      },
    }),
  );
  if (res.ok) revalidatePath('/messages');
  return res.ok ? { ok: true, data: { id: res.data.id, targetedBoards: res.data.targetedBoards } } : res;
}

export async function clearBroadcast(id: string): Promise<ActionResult<null>> {
  if (!UUID.test(id)) return { ok: false, error: 'Unknown message.' };
  const res = await act(() => api(`/v1/broadcasts/${id}/clear`, { method: 'POST' }));
  if (res.ok) revalidatePath('/messages');
  return res.ok ? { ok: true, data: null } : res;
}

export async function deliveryReport(id: string): Promise<ActionResult<DeliveryReport>> {
  if (!UUID.test(id)) return { ok: false, error: 'Unknown message.' };
  return act(() => api<DeliveryReport>(`/v1/broadcasts/${id}/delivery`));
}
