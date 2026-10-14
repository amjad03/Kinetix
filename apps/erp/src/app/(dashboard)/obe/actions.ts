'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import type { AttainmentConfig, OutcomeKind } from '@/lib/obe';
import type { ActionResult } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function bad(key: Parameters<Awaited<ReturnType<typeof getI18n>>['t']>[0]): Promise<{ ok: false; error: string }> {
  return { ok: false, error: (await getI18n()).t(key) };
}
async function call<T>(method: 'POST' | 'PUT' | 'DELETE', path: string, body: unknown, paths: string[]): Promise<ActionResult<T>> {
  const res = await act(() => api<T>(path, { method, body }));
  if (res.ok) for (const p of paths) revalidatePath(p);
  return res;
}

export async function addOutcome(programId: string, input: { kind: OutcomeKind; code: string; statement: string }) {
  if (!UUID.test(programId) || !input.code.trim() || input.statement.trim().length < 3) return bad('obe.err.outcome');
  return call('POST', `/v1/obe/programs/${programId}/outcomes`, { ...input, code: input.code.trim(), statement: input.statement.trim() }, ['/obe/setup', '/obe/matrix']);
}
export async function removeOutcome(id: string) {
  if (!UUID.test(id)) return bad('obe.err.outcome');
  return call('DELETE', `/v1/obe/outcomes/${id}`, undefined, ['/obe/setup', '/obe/matrix']);
}
export async function saveConfig(programId: string, c: AttainmentConfig) {
  if (!UUID.test(programId)) return bad('obe.err.config');
  return call('PUT', `/v1/obe/programs/${programId}/config`, c, ['/obe/setup', '/obe']);
}

export async function newCoSet(subjectId: string, note: string) {
  if (!UUID.test(subjectId)) return bad('obe.err.subject');
  return call('POST', `/v1/obe/subjects/${subjectId}/co-sets`, { note: note.trim() || undefined }, ['/obe/matrix']);
}
export async function addCo(setId: string, input: { code: string; statement: string; bloomLevel: string }) {
  if (!UUID.test(setId) || !input.code.trim() || input.statement.trim().length < 3) return bad('obe.err.co');
  return call('POST', `/v1/obe/co-sets/${setId}/outcomes`, { code: input.code.trim(), statement: input.statement.trim(), bloomLevel: input.bloomLevel.trim() || undefined }, ['/obe/matrix']);
}
export async function removeCo(id: string) {
  if (!UUID.test(id)) return bad('obe.err.co');
  return call('DELETE', `/v1/obe/course-outcomes/${id}`, undefined, ['/obe/matrix']);
}
export async function saveMatrix(setId: string, cells: { coId: string; outcomeId: string; strength: number; justification?: string }[]) {
  if (!UUID.test(setId) || cells.some((c) => !UUID.test(c.coId) || !UUID.test(c.outcomeId) || c.strength < 0 || c.strength > 3 || (c.justification ?? '').length > 500)) return bad('obe.err.matrix');
  return call('PUT', `/v1/obe/co-sets/${setId}/matrix`, { cells: cells.map((c) => ({ coId: c.coId, outcomeId: c.outcomeId, strength: c.strength, ...(c.justification?.trim() ? { justification: c.justification.trim() } : {}) })) }, ['/obe/matrix', '/obe']);
}
export async function activateCoSet(setId: string) {
  if (!UUID.test(setId)) return bad('obe.err.co');
  return call('POST', `/v1/obe/co-sets/${setId}/activate`, undefined, ['/obe/matrix', '/obe']);
}

export async function computeAttainment(programId: string, academicYearId: string) {
  if (!UUID.test(programId) || !UUID.test(academicYearId)) return bad('obe.err.pick');
  return call<{ cos: number; outcomes: number }>('POST', `/v1/obe/programs/${programId}/attainment/compute`, { academicYearId }, ['/obe']);
}
export async function addAction(programId: string, input: { scope: 'co' | 'po'; targetId: string; title: string; dueOn: string }) {
  if (!UUID.test(programId) || !UUID.test(input.targetId) || input.title.trim().length < 3) return bad('obe.err.action');
  return call('POST', `/v1/obe/programs/${programId}/actions`, { scope: input.scope, targetId: input.targetId, title: input.title.trim(), dueOn: input.dueOn || undefined }, ['/obe']);
}
export async function setActionStatus(id: string, status: 'open' | 'in_progress' | 'done') {
  if (!UUID.test(id)) return bad('obe.err.action');
  return call('PUT', `/v1/obe/actions/${id}`, { status }, ['/obe']);
}

// ---- OBE depth: PEO-mission, versions, targets, CQI actions from gaps -----------------------------------------------

export async function savePeoMission(programId: string, cells: { peoId: string; missionId: string; strength: number; justification: string }[]) {
  if (!UUID.test(programId) || cells.some((c) => !UUID.test(c.peoId) || !UUID.test(c.missionId) || c.strength < 0 || c.strength > 3)) return bad('obe.err.matrix');
  return call('PUT', `/v1/obe/programs/${programId}/peo-mission`, { cells: cells.map((c) => ({ ...c, justification: c.justification.trim() || undefined })) }, ['/obe/peo']);
}
export async function publishStatements(programId: string, input: { effectiveFrom: string; note: string }) {
  if (!UUID.test(programId)) return bad('obe.err.pick');
  return call('POST', `/v1/obe/programs/${programId}/versions`, { effectiveFrom: input.effectiveFrom.trim(), note: input.note.trim() || undefined }, ['/obe/peo']);
}
export async function saveTargets(programId: string, academicYearId: string, targets: { targetId: string; targetLevel: number | null; thresholdPercent: number | null; rationale: string }[]) {
  if (!UUID.test(programId) || !UUID.test(academicYearId) || targets.some((x) => !UUID.test(x.targetId))) return bad('obe.err.pick');
  return call<{ set: number; cleared: number }>('PUT', `/v1/obe/programs/${programId}/targets`, { academicYearId, targets: targets.map((x) => ({ targetId: x.targetId, targetLevel: x.targetLevel, ...(x.thresholdPercent ? { thresholdPercent: x.thresholdPercent } : {}), ...(x.rationale.trim() ? { rationale: x.rationale.trim() } : {}) })) }, ['/obe/targets']);
}
export async function copyTargets(programId: string, fromYearId: string, toYearId: string) {
  if (!UUID.test(programId) || !UUID.test(fromYearId) || !UUID.test(toYearId)) return bad('obe.err.pick');
  return call<{ copied: number; kept: number }>('POST', `/v1/obe/programs/${programId}/targets/copy`, { fromYearId, toYearId }, ['/obe/targets']);
}
export async function actionsFromGaps(programId: string, academicYearId: string, dueOn: string) {
  if (!UUID.test(programId) || !UUID.test(academicYearId)) return bad('obe.err.pick');
  return call<{ gaps: number; created: number; alreadyOpen: number }>('POST', `/v1/obe/programs/${programId}/actions/from-gaps`, { academicYearId, ...(/^\d{4}-\d{2}-\d{2}$/.test(dueOn) ? { dueOn } : {}) }, ['/obe/actions', '/obe']);
}
