'use server';

import { getI18n } from '@/i18n/server';
import { optStr, read, send } from '@/lib/ops-server';
import type { Incident } from '@/lib/governance';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RULES = '/governance/rules';
const INCIDENTS = '/governance/incidents';
const RETENTION = '/governance/retention';

async function field(name: string) {
  return { ok: false as const, error: (await getI18n()).t('ops.err.field', { field: name }) };
}

/** Starts a new draft version of a rule. The parameters are typed as JSON. */
export async function createRule(v: Record<string, string>) {
  const { t } = await getI18n();
  if (!/^[a-z0-9_.-]{2,60}$/.test(v.key ?? '')) return { ok: false as const, error: t('gr.err.key') };
  if ((v.title ?? '').trim().length < 3) return field(t('gr.f.title'));
  let params: unknown = {};
  if ((v.params ?? '').trim()) {
    try {
      params = JSON.parse(v.params);
    } catch {
      return { ok: false as const, error: t('gr.err.params') };
    }
    if (typeof params !== 'object' || params === null || Array.isArray(params)) return { ok: false as const, error: t('gr.err.params') };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.effectiveFrom ?? '')) return field(t('gr.f.from'));
  return send('/v1/governance/rules', { domain: v.domain, key: v.key, title: v.title.trim(), description: optStr(v.description) ?? '', params, effectiveFrom: v.effectiveFrom }, RULES);
}
export async function moveRule(id: string, to: 'draft' | 'in_review' | 'retired') {
  if (!UUID.test(id)) return field('id');
  return send(`/v1/governance/rules/${id}/move`, { to }, RULES);
}
export async function approveRule(id: string) {
  if (!UUID.test(id)) return field('id');
  return send(`/v1/governance/rules/${id}/approve`, undefined, RULES);
}

export async function reportIncident(v: Record<string, string>) {
  const { t } = await getI18n();
  if ((v.title ?? '').trim().length < 3) return field(t('inc.f.title'));
  return send(
    '/v1/governance/incidents',
    { title: v.title.trim(), severity: v.severity, category: v.category, description: optStr(v.description) ?? '', impact: optStr(v.impact) ?? '', personalDataInvolved: v.personalData === 'yes' },
    INCIDENTS,
  );
}
export async function updateIncident(id: string, v: Record<string, string>) {
  if (!UUID.test(id)) return field('id');
  if ((v.body ?? '').trim().length < 2) return field((await getI18n()).t('inc.f.note'));
  return send(`/v1/governance/incidents/${id}/updates`, { body: v.body.trim(), ...(v.status ? { status: v.status } : {}) }, INCIDENTS);
}
export async function closeOutIncident(id: string, v: Record<string, string>) {
  if (!UUID.test(id)) return field('id');
  return send(`/v1/governance/incidents/${id}`, { rootCause: optStr(v.rootCause), correctiveActions: optStr(v.correctiveActions), regulatorNotified: v.regulatorNotified === 'yes' ? true : undefined }, INCIDENTS, 'PUT');
}
export async function incidentTimeline(id: string) {
  if (!UUID.test(id)) return field('id');
  return read<Incident>(`/v1/governance/incidents/${id}`);
}

export async function setRetention(v: Record<string, string>) {
  const { t } = await getI18n();
  const months = Number(v.retainMonths);
  if (!/^[a-z0-9_]{2,40}$/.test(v.category ?? '')) return { ok: false as const, error: t('ret.err.category') };
  if (!Number.isInteger(months) || months < 1 || months > 600) return field(t('ret.f.months'));
  return send(`/v1/governance/retention/${encodeURIComponent(v.category)}`, { retainMonths: months, note: optStr(v.note) ?? '' }, RETENTION, 'PUT');
}
export async function removeRetention(category: string) {
  return send(`/v1/governance/retention/${encodeURIComponent(category)}`, undefined, RETENTION, 'DELETE');
}
export async function runRetention() {
  return send('/v1/governance/retention/run', undefined, RETENTION);
}
export async function holdFile(id: string, hold: boolean) {
  if (!UUID.test(id)) return field('id');
  return send(`/v1/governance/documents/${id}/hold`, { hold }, RETENTION);
}
