'use server';

import { getI18n } from '@/i18n/server';
import { optStr, send } from '@/lib/ops-server';
import { parseDefinition, type CustomResult } from '@/lib/govern';

const PAGE = '/reports/custom';
const BASE = '/v1/analytics/custom-reports';
type V = Record<string, string>;

function definitionOf(v: V) {
  return parseDefinition({ columns: v.columns, groupBy: v.groupBy, aggregates: v.aggregates, filters: v.filters, sort: v.sort, limit: v.limit });
}

/** Saves a report definition (a new one, or `existingId`). Lines the builder cannot read are named in the error. */
export async function saveCustomReport(v: V, existingId?: string) {
  const { t } = await getI18n();
  const def = definitionOf(v);
  if (!def.ok) return { ok: false as const, error: t('rb.err.line', { line: def.line }) };
  const body = { name: v.name, description: v.description ?? '', dataset: v.dataset, definition: def.value };
  return existingId ? send(`${BASE}/${encodeURIComponent(existingId)}`, body, PAGE, 'PUT') : send(BASE, body, PAGE);
}

export async function runCustomReport(id: string) {
  return send<CustomResult>(`${BASE}/${encodeURIComponent(id)}/run`, { format: 'json' }, PAGE);
}

export async function deleteCustomReport(id: string) {
  return send(`${BASE}/${encodeURIComponent(id)}`, undefined, PAGE, 'DELETE');
}

export async function scheduleCustomReport(id: string, v: V) {
  const recipients = (optStr(v.recipients) ?? '').split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
  return send(`${BASE}/${encodeURIComponent(id)}/schedule`, { frequency: v.frequency, recipients }, PAGE);
}

export async function unscheduleCustomReport(id: string) {
  return send(`${BASE}/${encodeURIComponent(id)}/schedule`, undefined, PAGE, 'DELETE');
}
