'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import type { ActionResult, Audience, DeliveryReport, Priority } from '@/lib/types';
import type { AnnAudience, AnnChannel, Announcement, AnnPreview, AnnRecipient, AnnTemplate, AppChannel, FileInput, PeopleResult } from '@/lib/communication';

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
  const { t } = await getI18n();
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title || title.length > 120) return { ok: false, error: t('msg.err.titleServer') };
  if (!body || body.length > 2000) return { ok: false, error: t('msg.err.bodyServer') };
  if (!['info', 'important', 'emergency'].includes(input.priority)) return { ok: false, error: t('msg.err.priority') };
  const ids = (xs?: string[]) => (xs ?? []).filter((x) => UUID.test(x));
  const audience: Audience = input.audience.all
    ? { all: true }
    : { programIds: ids(input.audience.programIds), sectionIds: ids(input.audience.sectionIds) };
  if (!audience.all && !audience.programIds?.length && !audience.sectionIds?.length) return { ok: false, error: t('msg.err.who') };

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
  if (!UUID.test(id)) return { ok: false, error: (await getI18n()).t('msg.err.unknown') };
  const res = await act(() => api(`/v1/broadcasts/${id}/clear`, { method: 'POST' }));
  if (res.ok) revalidatePath('/messages');
  return res.ok ? { ok: true, data: null } : res;
}

export async function deliveryReport(id: string): Promise<ActionResult<DeliveryReport>> {
  if (!UUID.test(id)) return { ok: false, error: (await getI18n()).t('msg.err.unknown') };
  return act(() => api<DeliveryReport>(`/v1/broadcasts/${id}/delivery`));
}

// ---- Announcements: boards and the Teacher, Student and Parent apps ----

export interface AnnouncementWrite {
  title: string;
  body: string;
  priority: 'normal' | 'important';
  channels: AnnChannel[];
  audience: AnnAudience;
  requiresAck: boolean;
  sendAt: string | null;
  expiresAt: string | null;
  attachments: FileInput[];
  keepAttachmentIds: string[];
  mode: 'draft' | 'send';
}

const ann = (id: string) => `/v1/announcements/${id}`;

/** Creates (no id) or edits a message; `mode: send` sends it now or at `sendAt`. */
export async function saveAnnouncement(id: string | null, input: AnnouncementWrite): Promise<ActionResult<Announcement>> {
  if (id !== null && !UUID.test(id)) return { ok: false, error: (await getI18n()).t('msg.err.unknown') };
  const res = await act(() => api<Announcement>(id ? ann(id) : '/v1/announcements', { method: id ? 'PATCH' : 'POST', body: input }));
  if (res.ok) revalidatePath('/messages');
  return res;
}

async function annAction<T>(id: string, path: string, method: 'POST' | 'DELETE' | 'GET' = 'POST'): Promise<ActionResult<T>> {
  if (!UUID.test(id)) return { ok: false, error: (await getI18n()).t('msg.err.unknown') };
  const res = await act(() => api<T>(`${ann(id)}${path}`, { method }));
  if (res.ok && method !== 'GET') revalidatePath('/messages');
  return res;
}

export async function sendAnnouncementNow(id: string) {
  return annAction<Announcement>(id, '/send');
}
export async function recallAnnouncement(id: string) {
  return annAction<Announcement>(id, '/recall');
}
export async function duplicateAnnouncement(id: string) {
  return annAction<Announcement>(id, '/duplicate');
}
export async function deleteAnnouncement(id: string) {
  return annAction<null>(id, '', 'DELETE');
}
export async function remindUnread(id: string) {
  return annAction<{ reminded: number }>(id, '/remind');
}
export async function announcementDetail(id: string) {
  return annAction<Announcement>(id, '', 'GET');
}

export async function announcementRecipients(id: string, filter: 'all' | 'unread' | 'unacknowledged' | 'undelivered', channel: AppChannel | ''): Promise<ActionResult<AnnRecipient[]>> {
  if (!UUID.test(id)) return { ok: false, error: (await getI18n()).t('msg.err.unknown') };
  const q = new URLSearchParams({ ...(filter !== 'all' ? { filter } : {}), ...(channel ? { channel } : {}) });
  return act(() => api<AnnRecipient[]>(`${ann(id)}/recipients?${q}`));
}

export async function previewAudience(channels: AnnChannel[], audience: AnnAudience): Promise<ActionResult<AnnPreview>> {
  return act(() => api<AnnPreview>('/v1/announcements/preview', { method: 'POST', body: { channels, audience } }));
}

export async function searchPeople(q: string): Promise<ActionResult<PeopleResult>> {
  return act(() => api<PeopleResult>(`/v1/announcements/people?q=${encodeURIComponent(q.slice(0, 60))}`));
}

export async function saveTemplate(id: string | null, body: Omit<AnnTemplate, 'id' | 'builtIn'>): Promise<ActionResult<AnnTemplate>> {
  if (id !== null && !UUID.test(id)) return { ok: false, error: (await getI18n()).t('msg.err.unknown') };
  const res = await act(() => api<AnnTemplate>(id ? `/v1/announcements/templates/${id}` : '/v1/announcements/templates', { method: id ? 'PATCH' : 'POST', body }));
  if (res.ok) revalidatePath('/messages');
  return res;
}

export async function deleteTemplate(id: string): Promise<ActionResult<null>> {
  if (!UUID.test(id)) return { ok: false, error: (await getI18n()).t('msg.err.unknown') };
  const res = await act(() => api<null>(`/v1/announcements/templates/${id}`, { method: 'DELETE' }));
  if (res.ok) revalidatePath('/messages');
  return res;
}
