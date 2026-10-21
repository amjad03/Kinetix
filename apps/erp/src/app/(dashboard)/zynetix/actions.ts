'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import type { ActionResult, VideoLanguage } from '@/lib/types';
import {
  AUDIENCES,
  MATERIAL_KINDS,
  materialProblem,
  type MaterialInput,
  type NewTeacher,
  type NewTenantResult,
  type PlatformTenant,
  type SubjectOutline,
  type Teacher,
  type TopicMaterial,
  type TopicResources,
  type YoutubePreview,
} from '@/lib/zynetix';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LANGS: VideoLanguage[] = ['en', 'hi', 'kn'];
/** `institution`: the college's own library (ADMIN); `platform`: the global library (the platform team). */
export type Scope = 'institution' | 'platform';

async function invalid(key: Parameters<Awaited<ReturnType<typeof getI18n>>['t']>[0] = 'error.VALIDATION'): Promise<{ ok: false; error: string }> {
  return { ok: false, error: (await getI18n()).t(key) };
}

// ---------------------------------------------------------------- library

export async function getOutline(subjectId: string): Promise<ActionResult<SubjectOutline>> {
  if (!UUID.test(subjectId)) return invalid();
  return act(() => api<SubjectOutline>(`/v1/subjects/${subjectId}/outline`));
}

export async function getResources(topicId: string): Promise<ActionResult<TopicResources>> {
  if (!UUID.test(topicId)) return invalid();
  return act(() => api<TopicResources>(`/v1/topics/${topicId}/resources`));
}

export async function getMaterials(scope: Scope, topicId: string): Promise<ActionResult<TopicMaterial[]>> {
  if (!UUID.test(topicId)) return invalid();
  return act(() => api<TopicMaterial[]>(scope === 'platform' ? `/v1/platform/topics/${topicId}/materials` : `/v1/topics/${topicId}/materials`));
}

/** Only the fields the API takes, trimmed; empty strings become null. */
function clean(m: Partial<MaterialInput>): Partial<MaterialInput> {
  const s = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() ? v.trim() : null);
  return {
    kind: m.kind,
    title: m.title?.trim() || undefined,
    url: s(m.url),
    ref: s(m.ref),
    author: s(m.author),
    bookChapter: s(m.bookChapter),
    pageFrom: m.pageFrom ?? (m.pageFrom === null ? null : undefined),
    pageTo: m.pageTo ?? (m.pageTo === null ? null : undefined),
    language: m.language && LANGS.includes(m.language) ? m.language : undefined,
    audience: m.audience?.filter((a) => (AUDIENCES as readonly string[]).includes(a)),
  };
}

export async function addMaterial(scope: Scope, topicId: string, input: MaterialInput): Promise<ActionResult<TopicMaterial>> {
  if (!UUID.test(topicId) || !MATERIAL_KINDS.includes(input.kind)) return invalid();
  const problem = materialProblem(input);
  if (problem) return invalid(problem);
  const path = scope === 'platform' ? `/v1/platform/topics/${topicId}/materials` : `/v1/topics/${topicId}/materials`;
  return act(() => api<TopicMaterial>(path, { method: 'POST', body: clean(input) }));
}

export async function editMaterial(scope: Scope, id: string, input: MaterialInput): Promise<ActionResult<TopicMaterial>> {
  if (!UUID.test(id)) return invalid();
  const problem = materialProblem(input);
  if (problem) return invalid(problem);
  const { kind: _kind, ...body } = clean(input);
  return act(() => api<TopicMaterial>(scope === 'platform' ? `/v1/platform/materials/${id}` : `/v1/topic-materials/${id}`, { method: 'PATCH', body }));
}

export async function setAudience(scope: Scope, id: string, audience: MaterialInput['audience']): Promise<ActionResult<TopicMaterial>> {
  if (!UUID.test(id) || !audience?.length || audience.some((a) => !(AUDIENCES as readonly string[]).includes(a))) return invalid('zx.mat.needAudience');
  return act(() => api<TopicMaterial>(scope === 'platform' ? `/v1/platform/materials/${id}` : `/v1/topic-materials/${id}`, { method: 'PATCH', body: { audience } }));
}

export async function deleteMaterial(scope: Scope, id: string): Promise<ActionResult> {
  if (!UUID.test(id)) return invalid();
  return act(() => api<undefined>(scope === 'platform' ? `/v1/platform/materials/${id}` : `/v1/topic-materials/${id}`, { method: 'DELETE' }));
}

export async function reorderMaterials(scope: Scope, topicId: string, ids: string[]): Promise<ActionResult> {
  if (!UUID.test(topicId) || ids.length === 0 || ids.some((i) => !UUID.test(i))) return invalid();
  const path = scope === 'platform' ? `/v1/platform/topics/${topicId}/materials/order` : `/v1/topics/${topicId}/materials/order`;
  return act(() => api<unknown>(path, { method: 'PUT', body: { ids } }).then(() => undefined));
}

export async function reviewMaterial(id: string, approve: boolean, reason?: string): Promise<ActionResult> {
  const why = reason?.trim().slice(0, 500);
  if (!UUID.test(id) || (!approve && !why)) return invalid('zx.mat.needReason');
  const res = await act(() => api<unknown>(`/v1/topic-materials/${id}/review`, { method: 'POST', body: { approve, reason: why || undefined } }).then(() => undefined));
  if (res.ok) revalidatePath('/zynetix/library');
  return res;
}

// ---------------------------------------------------------------- YouTube import

export async function previewChannel(scope: Scope, url: string, courseIds: string[]): Promise<ActionResult<YoutubePreview>> {
  const ids = [...new Set(courseIds)].filter((i) => UUID.test(i)).slice(0, 20);
  if (!url.trim() || url.length > 500) return invalid('zx.yt.needLink');
  if (ids.length === 0) return invalid('zx.yt.needCourse');
  const path = scope === 'platform' ? '/v1/platform/youtube/preview' : '/v1/content/youtube/preview';
  return act(() => api<YoutubePreview>(path, { method: 'POST', body: { url: url.trim(), courseIds: ids }, timeoutMs: 45_000 }));
}

export async function importChannel(
  scope: Scope,
  body: { language: VideoLanguage; playlistId?: string; items: { youtubeVideoId: string; title: string; topicId: string }[] },
): Promise<ActionResult<{ added: number; skipped: number }>> {
  if (!LANGS.includes(body.language) || body.items.length === 0 || body.items.some((i) => !UUID.test(i.topicId) || !/^[\w-]{6,20}$/.test(i.youtubeVideoId))) return invalid('zx.yt.nothing');
  const path = scope === 'platform' ? '/v1/platform/youtube/import' : '/v1/content/youtube/import';
  const res = await act(() => api<{ added: number; skipped: number }>(path, { method: 'POST', body, timeoutMs: 45_000 }));
  if (res.ok) revalidatePath('/zynetix');
  return res;
}

// ---------------------------------------------------------------- teachers

export interface TeacherForm {
  fullName: string;
  email?: string;
  phone?: string;
  roles?: ('teacher' | 'hod')[];
  departmentIds?: string[];
  teachingSubjects?: string[];
}

function teacherBody(f: TeacherForm) {
  return {
    fullName: f.fullName.trim(),
    email: f.email?.trim() || undefined,
    phone: f.phone?.trim() || undefined,
    roles: f.roles?.length ? f.roles : undefined,
    departmentIds: f.departmentIds?.filter((d) => UUID.test(d)),
    teachingSubjects: f.teachingSubjects?.map((s) => s.trim()).filter(Boolean).slice(0, 20),
  };
}

export async function createTeacher(f: TeacherForm): Promise<ActionResult<NewTeacher>> {
  if (!f.fullName.trim() || f.fullName.length > 120) return invalid('zx.t.needName');
  if (!f.email?.trim() && !f.phone?.trim()) return invalid('zx.t.needContact');
  const res = await act(() => api<NewTeacher>('/v1/admin/teachers', { method: 'POST', body: teacherBody(f) }));
  if (res.ok) revalidatePath('/zynetix/teachers');
  return res;
}

export async function updateTeacher(id: string, f: TeacherForm & { active?: boolean }): Promise<ActionResult<Teacher>> {
  if (!UUID.test(id) || !f.fullName.trim()) return invalid('zx.t.needName');
  const res = await act(() => api<Teacher>(`/v1/admin/teachers/${id}`, { method: 'PATCH', body: { ...teacherBody(f), active: f.active } }));
  if (res.ok) revalidatePath('/zynetix/teachers');
  return res;
}

export async function setTeacherActive(id: string, active: boolean): Promise<ActionResult<Teacher>> {
  if (!UUID.test(id)) return invalid();
  const res = await act(() => api<Teacher>(`/v1/admin/teachers/${id}`, { method: 'PATCH', body: { active } }));
  if (res.ok) revalidatePath('/zynetix/teachers');
  return res;
}

export async function resetTeacherPassword(id: string): Promise<ActionResult<{ temporaryPassword: string }>> {
  if (!UUID.test(id)) return invalid();
  return act(() => api<{ temporaryPassword: string }>(`/v1/admin/users/${id}/reset-password`, { method: 'POST', body: {} }));
}

// ---------------------------------------------------------------- platform: institutions

export async function createTenant(b: {
  slug: string;
  name: string;
  kind: PlatformTenant['kind'];
  edition: PlatformTenant['edition'];
  yearLabel: string;
  yearStart: string;
  yearEnd: string;
  adminName: string;
  adminEmail: string;
  city?: string;
}): Promise<ActionResult<NewTenantResult>> {
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(b.slug) || !b.name.trim() || !b.adminName.trim() || !/^\S+@\S+\.\S+$/.test(b.adminEmail) || !/^\d{4}-\d{2}-\d{2}$/.test(b.yearStart) || !/^\d{4}-\d{2}-\d{2}$/.test(b.yearEnd)) return invalid();
  const body = { ...b, name: b.name.trim(), adminName: b.adminName.trim(), adminEmail: b.adminEmail.trim(), yearLabel: b.yearLabel.trim(), city: b.city?.trim() || undefined };
  const res = await act(() => api<NewTenantResult>('/v1/platform/tenants', { method: 'POST', body }));
  if (res.ok) revalidatePath('/platform/zynetix');
  return res;
}

export async function setTenantEdition(id: string, edition: PlatformTenant['edition']): Promise<ActionResult<PlatformTenant>> {
  if (!UUID.test(id) || (edition !== 'full' && edition !== 'board')) return invalid();
  const res = await act(() => api<PlatformTenant>(`/v1/platform/tenants/${id}`, { method: 'PATCH', body: { edition } }));
  if (res.ok) revalidatePath('/platform/zynetix');
  return res;
}
