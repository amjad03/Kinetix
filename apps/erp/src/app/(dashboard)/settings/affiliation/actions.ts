'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import type { ActionResult } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE = /^[a-z0-9-]{2,60}$/;
const PAGE = '/settings/affiliation';

async function bad<T>(): Promise<ActionResult<T>> {
  return { ok: false, error: (await getI18n()).t('aff.err.input') };
}

function refresh() {
  revalidatePath(PAGE);
  // Wording (CIE/SEE, USN) and the setup checklist depend on the selection.
  revalidatePath('/', 'layout');
}

/** Chooses the university or board and its scheme (PUT /v1/affiliation). */
export async function selectAffiliation(profileCode: string, schemeCode: string | null): Promise<ActionResult<unknown>> {
  if (!CODE.test(profileCode) || (schemeCode !== null && !CODE.test(schemeCode))) return bad();
  const res = await act(() => api('/v1/affiliation', { method: 'PUT', body: { profileCode, schemeCode } }));
  if (res.ok) refresh();
  return res;
}

/** Gives a programme its own profile and scheme, or (profileCode null) sends it back to the institution's. */
export async function setProgrammeScheme(programId: string, profileCode: string | null, schemeCode: string | null): Promise<ActionResult<unknown>> {
  if (!UUID.test(programId) || (profileCode !== null && !CODE.test(profileCode)) || (schemeCode !== null && !CODE.test(schemeCode))) return bad();
  const path = `/v1/affiliation/programmes/${encodeURIComponent(programId)}`;
  const res = await act(() => (profileCode ? api(path, { method: 'PUT', body: { profileCode, schemeCode } }) : api(path, { method: 'DELETE' })));
  if (res.ok) refresh();
  return res;
}

/** Saves the institution's (or a programme's) overrides with the reason for the record. */
export async function saveOverrides(programId: string | null, overrides: Record<string, unknown>, reason: string): Promise<ActionResult<{ overrides: Record<string, unknown>; changed: string[] }>> {
  if ((programId !== null && !UUID.test(programId)) || reason.trim().length < 3) return bad();
  const res = await act(() => api<{ overrides: Record<string, unknown>; changed: string[] }>('/v1/affiliation/overrides', { method: 'PUT', body: { programId, overrides, reason: reason.trim() } }));
  if (res.ok) refresh();
  return res;
}

/** Installs the university's tabulation register layout among the result templates. */
export async function installTemplate(programId: string | null): Promise<ActionResult<{ code: string; name: string }>> {
  if (programId !== null && !UUID.test(programId)) return bad();
  const res = await act(() => api<{ code: string; name: string }>('/v1/affiliation/tabulation-template', { method: 'POST', body: { programId } }));
  if (res.ok) revalidatePath(PAGE);
  return res;
}
