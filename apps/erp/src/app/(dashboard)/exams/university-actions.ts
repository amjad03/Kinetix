'use server';

import { revalidatePath } from 'next/cache';
import { act, api } from '@/lib/api';
import type { ActionResult } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENTITIES = ['programmes', 'faculty', 'students', 'marks', 'attendance', 'fees'];

export interface MigrationField {
  key: string;
  label: string;
  required?: boolean;
}
export interface MigrationPreview {
  headers: string[];
  rowCount: number;
  sample: string[][];
  suggested: Record<string, string>;
  fields: MigrationField[];
}
export interface MigrationReport {
  dryRun: boolean;
  committed: boolean;
  batchId: string | null;
  totals: { rows: number; created: number; updated: number; skipped: number; error: number };
  rows: { row: number; status: string; message: string; detail?: string }[];
  reconciliation: { label: string; file: number; stored: number; match: boolean }[];
}

const entityOf = (e: unknown) => (typeof e === 'string' && ENTITIES.includes(e) ? e : null);

export async function previewMigration(entity: string, form: FormData): Promise<ActionResult<MigrationPreview>> {
  const e = entityOf(entity);
  if (!e) return { ok: false, error: 'Not found' };
  return act(() => api<MigrationPreview>(`/v1/admin/data-migration/${e}/preview`, { method: 'POST', form, timeoutMs: 60_000 }));
}

export async function runMigration(entity: string, form: FormData): Promise<ActionResult<MigrationReport>> {
  const e = entityOf(entity);
  if (!e) return { ok: false, error: 'Not found' };
  const res = await act(() => api<MigrationReport>(`/v1/admin/data-migration/${e}/run`, { method: 'POST', form, timeoutMs: 300_000 }));
  if (res.ok && res.data.committed) revalidatePath('/import/migration');
  return res;
}

export async function saveMigrationMapping(entity: string, name: string, mapping: Record<string, string>): Promise<ActionResult<{ id: string }>> {
  const e = entityOf(entity);
  if (!e) return { ok: false, error: 'Not found' };
  const res = await act(() => api<{ id: string }>(`/v1/admin/data-migration/mappings/${e}`, { method: 'POST', body: { name, mapping } }));
  if (res.ok) revalidatePath('/import/migration');
  return res;
}

export async function rollbackBatch(id: string): Promise<ActionResult<{ removed: number; kept: number }>> {
  if (!UUID.test(id)) return { ok: false, error: 'Not found' };
  const res = await act(() => api<{ removed: number; kept: number }>(`/v1/admin/data-migration/batches/${id}/rollback`, { method: 'POST', body: {} }));
  if (res.ok) revalidatePath('/import/migration');
  return res;
}

export async function installSamples(): Promise<ActionResult<{ added: number }>> {
  const res = await act(() => api<{ added: number }>('/v1/university-results/templates/samples', { method: 'POST', body: {} }));
  if (res.ok) revalidatePath('/exams/university');
  return res;
}

export async function generateRegister(body: { templateId: string; label: string; source: { kind: 'legacy'; academicYear: string; term: number } | { kind: 'session'; sessionId: string } }): Promise<ActionResult<{ id: string; rulesApplied: string[] }>> {
  const res = await act(() => api<{ id: string; rulesApplied: string[] }>('/v1/university-results/registers', { method: 'POST', body }));
  if (res.ok) revalidatePath('/exams/university');
  return res;
}

export async function decideDoc(id: string, approve: boolean): Promise<ActionResult<unknown>> {
  if (!UUID.test(id)) return { ok: false, error: 'Not found' };
  const res = await act(() => api(`/v1/academic-docs/requests/${id}/decide`, { method: 'POST', body: { approve } }));
  if (res.ok) revalidatePath('/exams/documents');
  return res;
}

export async function issueDoc(id: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(id)) return { ok: false, error: 'Not found' };
  const res = await act(() => api(`/v1/academic-docs/requests/${id}/issue`, { method: 'POST', body: {} }));
  if (res.ok) revalidatePath('/exams/documents');
  return res;
}

export async function addExaminer(body: { fullName: string; phone: string; organisation: string }): Promise<ActionResult<{ id: string }>> {
  const res = await act(() => api<{ id: string }>('/v1/external-examiners', { method: 'POST', body }));
  if (res.ok) revalidatePath('/exams/examiners');
  return res;
}

export async function assignExaminer(id: string, body: { sessionId: string; subjectId: string; role: string; ratePaise: number }): Promise<ActionResult<{ id: string; inviteToken: string }>> {
  if (!UUID.test(id)) return { ok: false, error: 'Not found' };
  const res = await act(() => api<{ id: string; inviteToken: string }>(`/v1/external-examiners/${id}/assignments`, { method: 'POST', body }));
  if (res.ok) revalidatePath('/exams/examiners');
  return res;
}

export async function assignmentAction(id: string, what: 'scripts' | 'apply' | 'reinvite'): Promise<ActionResult<Record<string, unknown>>> {
  if (!UUID.test(id) || !['scripts', 'apply', 'reinvite'].includes(what)) return { ok: false, error: 'Not found' };
  const res = await act(() => api<Record<string, unknown>>(`/v1/external-examiners/assignments/${id}/${what}`, { method: 'POST', body: {} }));
  if (res.ok) revalidatePath('/exams/examiners');
  return res;
}

export async function paperAction(id: string, action: 'approve' | 'return' | 'lock', note?: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(id)) return { ok: false, error: 'Not found' };
  const res = await act(() => api(`/v1/external-examiners/question-papers/${id}/${action}`, { method: 'POST', body: { note } }));
  if (res.ok) revalidatePath('/exams/examiners');
  return res;
}

export async function decideClaim(id: string, to: 'approved' | 'rejected' | 'paid'): Promise<ActionResult<unknown>> {
  if (!UUID.test(id)) return { ok: false, error: 'Not found' };
  const res = await act(() => api(`/v1/external-examiners/claims/${id}/decide`, { method: 'POST', body: { to } }));
  if (res.ok) revalidatePath('/exams/examiners');
  return res;
}
