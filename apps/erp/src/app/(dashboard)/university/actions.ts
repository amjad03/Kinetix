'use server';

import { getI18n } from '@/i18n/server';
import { send } from '@/lib/ops-server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = '/university';
const DAY = /^\d{4}-\d{2}-\d{2}$/;

async function bad(): Promise<{ ok: false; error: string }> {
  return { ok: false, error: (await getI18n()).t('un.err.input') };
}

export async function addInstitution(v: Record<string, string>) {
  if (!v.code?.trim() || !v.name?.trim() || (v.affiliationValidTo && !DAY.test(v.affiliationValidTo))) return bad();
  return send('/v1/university/institutions', { code: v.code.trim(), name: v.name.trim(), model: v.model || 'affiliated', university: (v.university ?? '').trim(), city: (v.city ?? '').trim(), ...(v.affiliationValidTo ? { affiliationValidTo: v.affiliationValidTo } : {}) }, PAGE);
}

export async function addConvocation(v: Record<string, string>) {
  const year = Number(v.graduationYear);
  if (!v.name?.trim() || !DAY.test(v.heldOn ?? '') || !Number.isInteger(year) || (v.programId && !UUID.test(v.programId))) return bad();
  return send('/v1/university/convocations', { name: v.name.trim(), heldOn: v.heldOn, graduationYear: year, ...(v.programId ? { programId: v.programId } : {}) }, PAGE);
}

/** One of the convocation steps: build the eligible list, open or close registration, issue degrees. */
export async function convocationStep(id: string, step: 'eligible' | 'open' | 'close' | 'issue') {
  if (!UUID.test(id)) return bad();
  return send(`/v1/university/convocations/${encodeURIComponent(id)}/${step}`, {}, PAGE);
}
