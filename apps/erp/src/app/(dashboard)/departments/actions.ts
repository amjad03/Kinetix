'use server';

import { revalidatePath } from 'next/cache';
import { act, api } from '@/lib/api';
import type { ActionResult, AdminDepartment } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function done() {
  revalidatePath('/departments');
  revalidatePath('/department');
}

export async function createDepartment(input: { name: string; headUserId: string | null }): Promise<ActionResult<{ id: string }>> {
  const name = input.name.trim();
  if (!name || name.length > 120) return { ok: false, error: 'Name the department (up to 120 characters), for example “Commerce”.' };
  if (input.headUserId && !UUID.test(input.headUserId)) return { ok: false, error: 'Choose a head of department.' };
  const res = await act(() => api<{ id: string }>('/v1/admin/departments', { method: 'POST', body: { name, headUserId: input.headUserId || null } }));
  if (res.ok) done();
  return res;
}

export interface DepartmentChanges {
  name?: string;
  headUserId?: string | null;
  staffIds?: string[];
  subjectIds?: string[];
}

/** Rename, change the head, and replace the staff and subject lists (a subject moves from its old department). */
export async function updateDepartment(id: string, changes: DepartmentChanges): Promise<ActionResult<AdminDepartment>> {
  if (!UUID.test(id)) return { ok: false, error: 'Unknown department.' };
  const body: DepartmentChanges = {};
  if (changes.name !== undefined) {
    const name = changes.name.trim();
    if (!name || name.length > 120) return { ok: false, error: 'Name the department (up to 120 characters).' };
    body.name = name;
  }
  if (changes.headUserId !== undefined) {
    if (changes.headUserId !== null && !UUID.test(changes.headUserId)) return { ok: false, error: 'Choose a head of department.' };
    body.headUserId = changes.headUserId;
  }
  for (const k of ['staffIds', 'subjectIds'] as const) {
    const ids = changes[k];
    if (ids === undefined) continue;
    if (!Array.isArray(ids) || ids.length > 500 || ids.some((x) => !UUID.test(x))) return { ok: false, error: 'Some of the chosen items are not valid.' };
    body[k] = [...new Set(ids)];
  }
  const res = await act(() => api<AdminDepartment>(`/v1/admin/departments/${id}`, { method: 'PUT', body }));
  if (res.ok) done();
  return res;
}

export async function deleteDepartment(id: string): Promise<ActionResult<void>> {
  if (!UUID.test(id)) return { ok: false, error: 'Unknown department.' };
  const res = await act(() => api<void>(`/v1/admin/departments/${id}`, { method: 'DELETE' }));
  if (res.ok) done();
  return res;
}
