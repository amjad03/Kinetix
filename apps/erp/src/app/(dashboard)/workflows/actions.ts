'use server';

import { getI18n } from '@/i18n/server';
import { optStr as opt, read, send } from '@/lib/ops-server';
import { parseAmount, parseFields, parseSteps, type DefField, type RequestDetail } from '@/lib/workflows';

const PAGE = '/workflows';
type V = Record<string, string>;
const BASE = '/v1/workflows';

/** Creates a definition, or updates one when `existing` is given. */
export async function saveDefinition(v: V, existing?: { id: string; version: number }) {
  const { t } = await getI18n();
  const fields = parseFields(v.fields ?? '');
  if (!fields.ok) return { ok: false as const, error: t('wf.err.fields', { line: fields.line }) };
  const steps = parseSteps(v.steps ?? '');
  if (!steps.ok || steps.value.length === 0) return { ok: false as const, error: steps.ok ? t('wf.err.noSteps') : t('wf.err.steps', { line: steps.line }) };
  const body = { name: v.name, description: v.description ?? '', fields: fields.value, steps: steps.value, active: v.active !== 'no' };
  if (existing) return send(`${BASE}/definitions/${encodeURIComponent(existing.id)}`, { ...body, expectedVersion: existing.version }, PAGE, 'PATCH');
  return send(`${BASE}/definitions`, { ...body, requestType: v.requestType }, PAGE);
}

/** The payload of a request from the form: fields come in as `f_<key>`; numbers are sent as numbers. */
function payloadOf(fields: DefField[], v: V): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = (v[`f_${f.key}`] ?? '').trim();
    if (raw) payload[f.key] = f.type === 'number' && Number.isFinite(Number(raw)) ? Number(raw) : raw;
  }
  return payload;
}

export async function startRequest(requestType: string, fields: DefField[], v: V) {
  const amount = parseAmount(v.amount ?? '');
  if (amount === undefined) return { ok: false as const, error: (await getI18n()).t('wf.err.amount') };
  return send(`${BASE}/requests`, { requestType, title: v.title, amount, payload: payloadOf(fields, v) }, PAGE);
}

export async function resubmitRequest(id: string, fields: DefField[], v: V) {
  const amount = parseAmount(v.amount ?? '');
  if (amount === undefined) return { ok: false as const, error: (await getI18n()).t('wf.err.amount') };
  return send(`${BASE}/requests/${encodeURIComponent(id)}/resubmit`, { title: v.title, amount, payload: payloadOf(fields, v) }, PAGE);
}

export async function decideRequest(id: string, decision: 'approve' | 'reject' | 'return', comment: string, version: number) {
  return send(`${BASE}/requests/${encodeURIComponent(id)}/decide`, { decision, comment: opt(comment) ?? '', expectedVersion: version }, PAGE);
}

export async function cancelRequest(id: string, comment: string) {
  return send(`${BASE}/requests/${encodeURIComponent(id)}/cancel`, { comment: opt(comment) ?? '' }, PAGE);
}

export async function loadRequest(id: string) {
  return read<RequestDetail>(`${BASE}/requests/${encodeURIComponent(id)}`);
}
