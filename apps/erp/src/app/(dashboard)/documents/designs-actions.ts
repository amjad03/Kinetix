'use server';

import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { errorText } from '@/i18n/errors';
import { getI18n } from '@/i18n/server';
import { act, api, ApiError } from '@/lib/api';
import { DOC_TYPES, type DocTemplateSummary, type DocTemplateVersion, type IssuedDocument } from '@/lib/doc-designs';
import type { DocData, DocLayout } from '@/lib/doc-editor/schema';
import type { ActionResult } from '@/lib/types';

/** A template with its layout (GET /v1/documents/designs/:id). */
export type DesignWithLayout = DocTemplateSummary & { layout: DocLayout };
/** A person to preview a template with. */
export interface PreviewSubject {
  type: 'student' | 'staff';
  id: string;
  name: string;
  detail: string;
}
/** What saving a layout returns: the saved template, or the error with the layout's issues. */
export type SaveLayoutResult = { ok: true; data: DesignWithLayout } | { ok: false; error: string; issues?: { path: (string | number)[]; message: string }[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRESET = /^preset:[a-z_]{3,40}:(classic|modern|minimal|heritage)$/;
const bad = (): ActionResult<never> => ({ ok: false, error: 'Not found.' });
const ref = (id: string) => UUID.test(id) || PRESET.test(id);

/** Copies a preset or template into a new template of the institution's own. */
export async function duplicateDesign(from: string, name: string): Promise<ActionResult<DocTemplateSummary>> {
  if (!ref(from)) return bad();
  const res = await act(() => api<DocTemplateSummary>('/v1/documents/designs', { method: 'POST', body: { from, ...(name.trim() ? { name: name.trim().slice(0, 80) } : {}) } }));
  if (res.ok) revalidatePath('/documents/templates');
  return res;
}

export async function renameDesign(id: string, name: string): Promise<ActionResult<DocTemplateSummary>> {
  if (!UUID.test(id) || !name.trim()) return bad();
  const res = await act(() => api<DocTemplateSummary>(`/v1/documents/designs/${id}`, { method: 'PUT', body: { name: name.trim().slice(0, 80) } }));
  if (res.ok) revalidatePath('/documents/templates');
  return res;
}

export async function deleteDesign(id: string): Promise<ActionResult<undefined>> {
  if (!UUID.test(id)) return bad();
  const res = await act(() => api<undefined>(`/v1/documents/designs/${id}`, { method: 'DELETE' }));
  if (res.ok) revalidatePath('/documents/templates');
  return res;
}

/** Makes a design the one every document of its type is printed with. */
export async function setDefaultDesign(docType: string, id: string): Promise<ActionResult<DocTemplateSummary[]>> {
  if (!(DOC_TYPES as readonly string[]).includes(docType) || !ref(id)) return bad();
  const res = await act(() => api<DocTemplateSummary[]>(`/v1/documents/designs/defaults/${docType}`, { method: 'PUT', body: { templateId: id } }));
  if (res.ok) revalidatePath('/documents/templates');
  return res;
}

export async function designVersions(id: string): Promise<ActionResult<DocTemplateVersion[]>> {
  if (!UUID.test(id)) return bad();
  return act(() => api<DocTemplateVersion[]>(`/v1/documents/designs/${id}/versions`));
}

export async function restoreDesignVersion(id: string, version: number): Promise<ActionResult<DocTemplateSummary>> {
  if (!UUID.test(id) || !Number.isInteger(version) || version < 1) return bad();
  const res = await act(() => api<DocTemplateSummary>(`/v1/documents/designs/${id}/versions/${version}/restore`, { method: 'POST', body: {} }));
  if (res.ok) revalidatePath('/documents/templates');
  return res;
}

export async function revokeIssued(id: string, reason: string): Promise<ActionResult<IssuedDocument>> {
  if (!UUID.test(id)) return bad();
  const res = await act(() => api<IssuedDocument>(`/v1/documents/issued/${id}/revoke`, { method: 'POST', body: { reason: reason.trim() } }));
  if (res.ok) revalidatePath('/documents/issued');
  return res;
}

export async function reissueIssued(id: string): Promise<ActionResult<IssuedDocument>> {
  if (!UUID.test(id)) return bad();
  const res = await act(() => api<IssuedDocument>(`/v1/documents/issued/${id}/reissue`, { method: 'POST', body: {} }));
  if (res.ok) revalidatePath('/documents/issued');
  return res;
}

/** A template (or preset) with its layout, for the editor after a restore or reload. */
export async function getDesign(id: string): Promise<ActionResult<DesignWithLayout>> {
  if (!ref(id)) return bad();
  return act(() => api<DesignWithLayout>(`/v1/documents/designs/${encodeURIComponent(id)}`));
}

/**
 * Saves the editor's layout as a new version (with an optional note and name). A layout the API
 * rejects comes back with its issues, so the editor can mark the elements at fault.
 */
export async function saveDesignLayout(id: string, layout: DocLayout, note: string, name?: string): Promise<SaveLayoutResult> {
  if (!UUID.test(id)) return bad();
  try {
    const data = await api<DesignWithLayout>(`/v1/documents/designs/${id}`, { method: 'PUT', body: { layout, ...(note.trim() ? { note: note.trim().slice(0, 200) } : {}), ...(name?.trim() ? { name: name.trim().slice(0, 80) } : {}) } });
    revalidatePath('/documents/templates');
    return { ok: true, data };
  } catch (e) {
    unstable_rethrow(e);
    const { t } = await getI18n();
    if (e instanceof ApiError) return { ok: false, error: errorText(e, t), issues: e.issues };
    return { ok: false, error: t('error.generic') };
  }
}

/** Students or staff whose real details a template can be previewed with. */
export async function searchSubjects(kind: 'student' | 'staff', q: string): Promise<ActionResult<PreviewSubject[]>> {
  if (kind !== 'student' && kind !== 'staff') return bad();
  return act(() => api<PreviewSubject[]>(`/v1/documents/designs/subjects?kind=${kind}&q=${encodeURIComponent(q.trim().slice(0, 60))}`));
}

/** A person's data block (`student` or `staff`), so the canvas shows their real details. */
export async function subjectData(kind: 'student' | 'staff', id: string): Promise<ActionResult<DocData>> {
  if ((kind !== 'student' && kind !== 'staff') || !UUID.test(id)) return bad();
  return act(() => api<DocData>(`/v1/documents/designs/subjects/${kind}/${id}`));
}
