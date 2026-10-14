'use server';

import { revalidatePath } from 'next/cache';
import { act, api } from '@/lib/api';
import { DOC_TYPES, type DocTemplateSummary, type DocTemplateVersion, type IssuedDocument } from '@/lib/doc-designs';
import type { ActionResult } from '@/lib/types';

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
