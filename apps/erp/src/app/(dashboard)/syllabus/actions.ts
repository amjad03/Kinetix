'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import type { MessageKey } from '@/i18n/messages';
import { act, api } from '@/lib/api';
import type { ActionResult, Topic } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TopicInput {
  title: string;
  summary: string;
  notes: string[];
  outcomes: string[];
}

/** Trims and checks a topic against the API's limits; returns an error (dictionary key) or the clean body. */
function clean(input: TopicInput): MessageKey | TopicInput {
  const title = input.title.trim();
  const summary = input.summary.trim();
  const notes = input.notes.map((n) => n.trim()).filter(Boolean);
  const outcomes = input.outcomes.map((n) => n.trim()).filter(Boolean);
  if (!title || title.length > 200) return 'syl.err.title';
  if (summary.length > 2000) return 'syl.err.summary';
  if (notes.length > 30) return 'syl.err.notes';
  if (notes.some((n) => n.length > 1000)) return 'syl.err.note';
  if (outcomes.length > 15) return 'syl.err.outcomes';
  if (outcomes.some((n) => n.length > 500)) return 'syl.err.outcome';
  return { title, summary, notes, outcomes };
}

export async function linkSubject(subjectId: string, courseId: string | null): Promise<ActionResult<{ id: string; courseId: string | null }>> {
  if (!UUID.test(subjectId) || (courseId !== null && !UUID.test(courseId))) return { ok: false, error: (await getI18n()).t('syl.err.subject') };
  const res = await act(() => api<{ id: string; name: string; courseId: string | null }>(`/v1/admin/subjects/${subjectId}/course`, { method: 'PUT', body: { courseId } }));
  if (res.ok) revalidatePath('/syllabus', 'layout');
  return res;
}

export async function getTopic(id: string): Promise<ActionResult<Topic>> {
  if (!UUID.test(id)) return { ok: false, error: (await getI18n()).t('syl.err.topic') };
  return act(() => api<Topic>(`/v1/content/topics/${id}`));
}

export async function addTopic(courseId: string, chapterId: string, input: TopicInput): Promise<ActionResult<Topic>> {
  const { t } = await getI18n();
  if (!UUID.test(chapterId) || !UUID.test(courseId)) return { ok: false, error: t('syl.err.chapter') };
  const body = clean(input);
  if (typeof body === 'string') return { ok: false, error: t(body) };
  const res = await act(() => api<Topic>(`/v1/content/chapters/${chapterId}/topics`, { method: 'POST', body }));
  if (res.ok) revalidatePath(`/syllabus/${courseId}`);
  return res;
}

export async function editTopic(courseId: string, id: string, input: TopicInput): Promise<ActionResult<Topic>> {
  const { t } = await getI18n();
  if (!UUID.test(id) || !UUID.test(courseId)) return { ok: false, error: t('syl.err.topic') };
  const body = clean(input);
  if (typeof body === 'string') return { ok: false, error: t(body) };
  const res = await act(() => api<Topic>(`/v1/content/topics/${id}`, { method: 'PATCH', body }));
  if (res.ok) revalidatePath(`/syllabus/${courseId}`);
  return res;
}

export async function deleteTopic(courseId: string, id: string): Promise<ActionResult> {
  if (!UUID.test(id) || !UUID.test(courseId)) return { ok: false, error: (await getI18n()).t('syl.err.topic') };
  const res = await act(() => api<undefined>(`/v1/content/topics/${id}`, { method: 'DELETE' }));
  if (res.ok) revalidatePath(`/syllabus/${courseId}`);
  return res;
}
