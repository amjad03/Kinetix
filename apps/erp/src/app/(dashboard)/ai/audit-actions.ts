'use server';

import { getI18n } from '@/i18n/server';
import { send } from '@/lib/ops-server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const split = (s: string | undefined) => (s ?? '').split(/[\n,]/).map((x) => x.trim()).filter(Boolean);

/** Saves an evaluation case: a task, its input as JSON and the words the answer must or must not contain. */
export async function addEvalCase(v: Record<string, string>) {
  const { t } = await getI18n();
  if ((v.name ?? '').trim().length < 3) return { ok: false as const, error: t('ops.err.field', { field: t('ae.f.name') }) };
  let input: unknown;
  try {
    input = JSON.parse(v.input ?? '');
  } catch {
    return { ok: false as const, error: t('ae.err.input') };
  }
  const max = v.maxChars ? Number(v.maxChars) : undefined;
  return send('/v1/ai/admin/evals/cases', { name: v.name.trim(), task: v.task === 'tutor' ? 'tutor' : 'explain', input, mustInclude: split(v.mustInclude), mustNotInclude: split(v.mustNotInclude), ...(max && Number.isFinite(max) ? { maxChars: max } : {}) }, '/ai/evals');
}
export async function removeEvalCase(id: string) {
  if (!UUID.test(id)) return { ok: false as const, error: (await getI18n()).t('ops.err.field', { field: 'id' }) };
  return send(`/v1/ai/admin/evals/cases/${id}`, undefined, '/ai/evals', 'DELETE');
}
export async function runEvals() {
  return send('/v1/ai/admin/evals/run', undefined, '/ai/evals');
}
