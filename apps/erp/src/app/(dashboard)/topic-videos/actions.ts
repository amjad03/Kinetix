'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import { youtubeId } from '@/lib/concept-videos';
import type { ActionResult, ManagedVideo, VideoLanguage } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LANGS: VideoLanguage[] = ['en', 'hi', 'kn'];
const BASE = '/topic-videos';

async function invalid(): Promise<{ ok: false; error: string }> {
  return { ok: false, error: (await getI18n()).t('error.VALIDATION') };
}

export async function getMine(topicId: string): Promise<ActionResult<ManagedVideo[]>> {
  if (!UUID.test(topicId)) return invalid();
  return act(() => api<ManagedVideo[]>(`/v1/content/topics/${topicId}/videos/mine`));
}

export async function addVideo(
  courseId: string,
  topicId: string,
  input: { url: string; scope: 'institution' | 'teacher'; language: VideoLanguage; title?: string; sectionIds?: string[] },
): Promise<ActionResult<ManagedVideo>> {
  if (!UUID.test(topicId) || !UUID.test(courseId) || !LANGS.includes(input.language) || (input.sectionIds ?? []).some((s) => !UUID.test(s))) return invalid();
  if (!youtubeId(input.url)) return { ok: false, error: (await getI18n()).t('tv.notALink') };
  const title = input.title?.trim().slice(0, 200) || undefined;
  const body = { url: input.url.trim(), scope: input.scope, language: input.language, title, sectionIds: input.sectionIds?.length ? input.sectionIds : undefined };
  const res = await act(() => api<ManagedVideo>(`/v1/content/topics/${topicId}/videos`, { method: 'POST', body }));
  if (res.ok) revalidatePath(`${BASE}/${courseId}`);
  return res;
}

export async function removeVideo(id: string): Promise<ActionResult> {
  if (!UUID.test(id)) return invalid();
  const res = await act(() => api<undefined>(`/v1/content/videos/${id}`, { method: 'DELETE' }));
  if (res.ok) revalidatePath(BASE, 'layout');
  return res;
}

export async function reorderVideos(topicId: string, scope: 'institution' | 'teacher', ids: string[]): Promise<ActionResult<ManagedVideo[]>> {
  if (!UUID.test(topicId) || ids.length === 0 || ids.some((i) => !UUID.test(i))) return invalid();
  return act(() => api<ManagedVideo[]>(`/v1/content/topics/${topicId}/videos/order`, { method: 'PUT', body: { scope, ids } }));
}

export async function shareVideo(id: string): Promise<ActionResult<ManagedVideo>> {
  if (!UUID.test(id)) return invalid();
  const res = await act(() => api<ManagedVideo>(`/v1/content/videos/${id}/share`, { method: 'POST' }));
  if (res.ok) revalidatePath(BASE, 'layout');
  return res;
}

export async function reviewVideo(id: string, decision: 'approve' | 'reject', reason?: string): Promise<ActionResult<ManagedVideo>> {
  if (!UUID.test(id)) return invalid();
  if (decision === 'reject' && !reason?.trim()) return { ok: false, error: (await getI18n()).t('tv.reasonNeeded') };
  const body = decision === 'reject' ? { reason: reason!.trim().slice(0, 500) } : undefined;
  const res = await act(() => api<ManagedVideo>(`/v1/content/videos/${id}/${decision}`, { method: 'POST', body }));
  if (res.ok) revalidatePath(BASE, 'layout');
  return res;
}
