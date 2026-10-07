'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import type { ActionResult } from '@/lib/types';
import type { CertificateKind, CertificateRequest, CertificateTemplate, VaultDocument } from '@/lib/hr-types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = async (): Promise<ActionResult<never>> => ({ ok: false, error: (await getI18n()).t('error.generic') });

export async function requestCertificate(b: { templateId: string; studentId?: string; staffUserId?: string; purpose: string; fields: Record<string, string> }): Promise<ActionResult<CertificateRequest>> {
  const body = { templateId: b.templateId, purpose: b.purpose.trim(), fields: Object.fromEntries(Object.entries(b.fields).filter(([, v]) => v.trim())), ...(b.studentId ? { studentId: b.studentId } : {}), ...(b.staffUserId ? { staffUserId: b.staffUserId } : {}) };
  const res = await act(() => api<CertificateRequest>('/v1/documents/requests', { method: 'POST', body }));
  if (res.ok) revalidatePath('/documents');
  return res;
}

export async function decideCertificate(id: string, step: 'approve' | 'reject' | 'issue' | 'revoke', text: string): Promise<ActionResult<CertificateRequest>> {
  if (!UUID.test(id)) return bad();
  const body = step === 'revoke' ? { reason: text.trim() } : text.trim() ? { note: text.trim() } : {};
  const res = await act(() => api<CertificateRequest>(`/v1/documents/requests/${id}/${step}`, { method: 'POST', body }));
  if (res.ok) revalidatePath('/documents');
  return res;
}

export async function bulkIssue(b: { templateId: string; sectionId: string; purpose: string }): Promise<ActionResult<unknown>> {
  if (!UUID.test(b.templateId) || !UUID.test(b.sectionId)) return bad();
  const res = await act(() => api<unknown>('/v1/documents/bulk-issue', { method: 'POST', body: { templateId: b.templateId, sectionId: b.sectionId, purpose: b.purpose.trim() } }));
  if (res.ok) revalidatePath('/documents');
  return res;
}

export interface TemplateInput {
  kind: CertificateKind;
  name: string;
  subjectType: 'student' | 'staff';
  title: string;
  body: string;
  fields: { key: string; label: string; required: boolean }[];
  serialPrefix: string;
  active: boolean;
}

export async function saveTemplate(id: string | null, t: TemplateInput): Promise<ActionResult<CertificateTemplate>> {
  const res = await act(() => api<CertificateTemplate>(id ? `/v1/documents/templates/${id}` : '/v1/documents/templates', { method: id ? 'PUT' : 'POST', body: { ...t, serialPrefix: t.serialPrefix.trim().toUpperCase() } }));
  if (res.ok) revalidatePath('/documents/templates');
  return res;
}

/** Students who hold a fee invoice in the class: the roster the office roles can read. */
export async function classStudents(sectionId: string): Promise<ActionResult<{ id: string; name: string }[]>> {
  if (!UUID.test(sectionId)) return bad();
  const res = await act(() => api<{ student: { id: string; fullName: string; rollNo: string } }[]>(`/v1/fees/invoices?sectionId=${sectionId}`));
  if (!res.ok) return res;
  const seen = new Map(res.data.map((r) => [r.student.id, `${r.student.rollNo} · ${r.student.fullName}`]));
  return { ok: true, data: [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)) };
}

export async function listVault(ownerType: 'student' | 'staff', ownerId: string): Promise<ActionResult<VaultDocument[]>> {
  if (!UUID.test(ownerId)) return bad();
  return act(() => api<VaultDocument[]>(`/v1/documents/vault/${ownerType}/${ownerId}`));
}

export async function archiveVaultFile(id: string): Promise<ActionResult<undefined>> {
  if (!UUID.test(id)) return bad();
  return act(() => api<undefined>(`/v1/documents/vault/files/${id}`, { method: 'DELETE' }));
}
