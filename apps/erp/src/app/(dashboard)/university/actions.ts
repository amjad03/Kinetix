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

const detail = (id: string) => `/university/convocations/${id}`;

/** Builds the eligible list, optionally for one batch (year of admission) or one class. */
export async function buildEligible(id: string, v: Record<string, string>) {
  const year = v.batchYear?.trim() ? Number(v.batchYear) : undefined;
  if (!UUID.test(id) || (year !== undefined && !(Number.isInteger(year) && year >= 1990 && year <= 2100)) || (v.sectionId && !UUID.test(v.sectionId))) return bad();
  return send(`/v1/university/convocations/${id}/eligible`, { ...(year ? { batchYear: year } : {}), ...(v.sectionId ? { sectionId: v.sectionId } : {}) }, detail(id));
}

/** Opens or closes registration, from the convocation's own page. */
export async function convocationDetailStep(id: string, step: 'open' | 'close') {
  if (!UUID.test(id)) return bad();
  return send(`/v1/university/convocations/${id}/${step}`, {}, detail(id));
}

/** Issues the degrees with their serial numbers: to registered graduates, or (in absentia) to every eligible one too. */
export async function issueDegrees(id: string, inAbsentia: boolean) {
  if (!UUID.test(id)) return bad();
  return send(`/v1/university/convocations/${id}/issue`, { inAbsentia }, detail(id));
}

/** Registers an eligible graduate for the ceremony, or withholds a graduate's degree. */
export async function candidateStep(id: string, candidate: { id: string; studentId: string }, step: 'register' | 'withhold') {
  if (!UUID.test(id) || !UUID.test(candidate.id) || !UUID.test(candidate.studentId)) return bad();
  return step === 'register' ? send(`/v1/university/convocations/${id}/register`, { studentId: candidate.studentId }, detail(id)) : send(`/v1/university/convocations/${id}/candidates/${candidate.id}/withhold`, {}, detail(id));
}
