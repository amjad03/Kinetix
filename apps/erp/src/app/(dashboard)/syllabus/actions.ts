'use server';

import { revalidatePath } from 'next/cache';
import { act, api } from '@/lib/api';
import type { ActionResult, Topic } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TopicInput {
  title: string;
  summary: string;
  notes: string[];
  outcomes: string[];
}

/** Trims and checks a topic against the API's limits; returns an error message or the clean body. */
function clean(input: TopicInput): string | TopicInput {
  const title = input.title.trim();
  const summary = input.summary.trim();
  const notes = input.notes.map((n) => n.trim()).filter(Boolean);
  const outcomes = input.outcomes.map((n) => n.trim()).filter(Boolean);
  if (!title || title.length > 200) return 'Give the topic a title (up to 200 characters).';
  if (summary.length > 2000) return 'Keep the summary under 2,000 characters.';
  if (notes.length > 30) return 'Up to 30 notes per topic.';
  if (notes.some((n) => n.length > 1000)) return 'Keep each note under 1,000 characters.';
  if (outcomes.length > 15) return 'Up to 15 learning outcomes per topic.';
  if (outcomes.some((n) => n.length > 500)) return 'Keep each outcome under 500 characters.';
  return { title, summary, notes, outcomes };
}

export async function linkSubject(subjectId: string, courseId: string | null): Promise<ActionResult<{ id: string; courseId: string | null }>> {
  if (!UUID.test(subjectId) || (courseId !== null && !UUID.test(courseId))) return { ok: false, error: 'Unknown subject or course.' };
  const res = await act(() => api<{ id: string; name: string; courseId: string | null }>(`/v1/admin/subjects/${subjectId}/course`, { method: 'PUT', body: { courseId } }));
  if (res.ok) revalidatePath('/syllabus', 'layout');
  return res;
}

export async function getTopic(id: string): Promise<ActionResult<Topic>> {
  if (!UUID.test(id)) return { ok: false, error: 'Unknown topic.' };
  return act(() => api<Topic>(`/v1/content/topics/${id}`));
}

export async function addTopic(courseId: string, chapterId: string, input: TopicInput): Promise<ActionResult<Topic>> {
  if (!UUID.test(chapterId) || !UUID.test(courseId)) return { ok: false, error: 'Unknown chapter.' };
  const body = clean(input);
  if (typeof body === 'string') return { ok: false, error: body };
  const res = await act(() => api<Topic>(`/v1/content/chapters/${chapterId}/topics`, { method: 'POST', body }));
  if (res.ok) revalidatePath(`/syllabus/${courseId}`);
  return res;
}

export async function editTopic(courseId: string, id: string, input: TopicInput): Promise<ActionResult<Topic>> {
  if (!UUID.test(id) || !UUID.test(courseId)) return { ok: false, error: 'Unknown topic.' };
  const body = clean(input);
  if (typeof body === 'string') return { ok: false, error: body };
  const res = await act(() => api<Topic>(`/v1/content/topics/${id}`, { method: 'PATCH', body }));
  if (res.ok) revalidatePath(`/syllabus/${courseId}`);
  return res;
}

export async function deleteTopic(courseId: string, id: string): Promise<ActionResult> {
  if (!UUID.test(id) || !UUID.test(courseId)) return { ok: false, error: 'Unknown topic.' };
  const res = await act(() => api<undefined>(`/v1/content/topics/${id}`, { method: 'DELETE' }));
  if (res.ok) revalidatePath(`/syllabus/${courseId}`);
  return res;
}
