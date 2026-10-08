'use server';

import { revalidatePath } from 'next/cache';
import { act, api } from '@/lib/api';
import type { ActionResult } from '@/lib/types';

const KEY = /^[a-z_.]{3,60}$/;
/** The roles the API lets an institution require two-step sign-in for (MFA_POLICY_ROLES). */
const ROLES = ['tenant_admin', 'principal', 'accountant', 'hr_manager', 'admissions_officer', 'store_keeper'];

export async function setFeature(key: string, enabled: boolean): Promise<ActionResult> {
  if (!KEY.test(key)) return { ok: false, error: 'Not found.' };
  const res = await act(() => api(`/v1/admin/features/${key}`, { method: 'PUT', body: { enabled } }));
  if (res.ok) revalidatePath('/settings/security');
  return res.ok ? { ok: true, data: undefined } : res;
}

export async function savePolicy(roles: string[]): Promise<ActionResult> {
  const clean = roles.filter((r) => ROLES.includes(r));
  const res = await act(() => api('/v1/admin/security-policy', { method: 'PUT', body: { mfaRequiredRoles: clean } }));
  if (res.ok) revalidatePath('/settings/security');
  return res.ok ? { ok: true, data: undefined } : res;
}
