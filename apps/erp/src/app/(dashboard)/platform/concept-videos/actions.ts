'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import { youtubeId } from '@/lib/concept-videos';
import type { ActionResult, ConceptVideo, PlatformTopicVideos, PlaylistPreview, VideoLanguage } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LANGS: VideoLanguage[] = ['en', 'hi', 'kn'];
const BASE = '/platform/concept-videos';

async function invalid(): Promise<{ ok: false; error: string }> {
  return { ok: false, error: (await getI18n()).t('error.VALIDATION') };
}

export async function getTopicVideos(topicId: string): Promise<ActionResult<PlatformTopicVideos>> {
  if (!UUID.test(topicId)) return invalid();
  return act(() => api<PlatformTopicVideos>(`/v1/platform/topics/${topicId}/videos`));
}

export async function addVideo(courseId: string, topicId: string, input: { url: string; language: VideoLanguage; title?: string }): Promise<ActionResult<ConceptVideo>> {
  if (!UUID.test(topicId) || !UUID.test(courseId) || !LANGS.includes(input.language)) return invalid();
  if (!youtubeId(input.url)) return { ok: false, error: (await getI18n()).t('pv.notALink') };
  const title = input.title?.trim().slice(0, 200) || undefined;
  const res = await act(() => api<ConceptVideo>(`/v1/platform/topics/${topicId}/videos`, { method: 'POST', body: { url: input.url.trim(), language: input.language, title } }));
  if (res.ok) revalidatePath(`${BASE}/${courseId}`);
  return res;
}

export async function editVideo(id: string, input: { title?: string; language?: VideoLanguage }): Promise<ActionResult<ConceptVideo>> {
  const title = input.title?.trim();
  if (!UUID.test(id) || (input.language && !LANGS.includes(input.language)) || (title !== undefined && (!title || title.length > 200))) return invalid();
  return act(() => api<ConceptVideo>(`/v1/platform/videos/${id}`, { method: 'PATCH', body: { title, language: input.language } }));
}

export async function deleteVideo(courseId: string, id: string): Promise<ActionResult> {
  if (!UUID.test(id) || !UUID.test(courseId)) return invalid();
  const res = await act(() => api<undefined>(`/v1/platform/videos/${id}`, { method: 'DELETE' }));
  if (res.ok) revalidatePath(`${BASE}/${courseId}`);
  return res;
}

export async function reorderVideos(topicId: string, ids: string[]): Promise<ActionResult<ConceptVideo[]>> {
  if (!UUID.test(topicId) || ids.length === 0 || ids.some((i) => !UUID.test(i))) return invalid();
  return act(() => api<ConceptVideo[]>(`/v1/platform/topics/${topicId}/videos/order`, { method: 'PUT', body: { ids } }));
}

export async function previewPlaylist(chapterId: string, url: string): Promise<ActionResult<PlaylistPreview>> {
  if (!UUID.test(chapterId) || !url.trim()) return invalid();
  return act(() => api<PlaylistPreview>('/v1/platform/playlists/preview', { method: 'POST', body: { url: url.trim(), chapterId }, timeoutMs: 30_000 }));
}

export async function importPlaylist(
  courseId: string,
  body: { playlistId: string; chapterId: string; language: VideoLanguage; items: { youtubeVideoId: string; title: string; topicId: string; durationSeconds: number | null }[] },
): Promise<ActionResult<{ added: number; skipped: number }>> {
  if (!UUID.test(courseId) || !UUID.test(body.chapterId) || !LANGS.includes(body.language) || body.items.length === 0) return invalid();
  const res = await act(() => api<{ added: number; skipped: number }>('/v1/platform/playlists/import', { method: 'POST', body, timeoutMs: 30_000 }));
  if (res.ok) revalidatePath(`${BASE}/${courseId}`);
  return res;
}
