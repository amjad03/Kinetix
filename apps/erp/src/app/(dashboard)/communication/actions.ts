'use server';

import { getI18n } from '@/i18n/server';
import { optStr, read, send } from '@/lib/ops-server';
import { audienceRule, parseIds, parseVars, type CampaignDetail } from '@/lib/pathways-b';

const PAGE = '/communication';
const C = '/v1/comms';
const id = encodeURIComponent;
type V = Record<string, string>;
const fail = async (key: 'pwb.comms.err.vars' | 'pwb.comms.err.ids' | 'pwb.comms.err.who', vars?: Record<string, string | number>) => ({ ok: false as const, error: (await getI18n()).t(key, vars) });

/** Creates a template, or changes the text of one (its key, channel and language stay). */
export async function saveTemplate(v: V, existingId?: string) {
  const dlt = optStr(v.dltTemplateId);
  if (existingId) return send(`${C}/templates/${id(existingId)}`, { subject: v.subject ?? '', body: v.body, ...(dlt ? { dltTemplateId: dlt } : {}), active: v.active !== 'no' }, PAGE, 'PUT');
  return send(`${C}/templates`, { key: v.key, channel: v.channel, locale: v.locale || 'en', subject: v.subject ?? '', body: v.body, ...(dlt ? { dltTemplateId: dlt } : {}), active: v.active !== 'no' }, PAGE);
}

/** The audience rule from the picked roles and classes and the typed ids; errors are worded for the form. */
async function ruleOf(roles: string[], sectionIds: string[], userIds: string) {
  const ids = parseIds(userIds);
  if (!ids.ok) return { error: await fail('pwb.comms.err.ids', { id: ids.bad }) };
  const rule = audienceRule(roles, sectionIds, ids.ids);
  return rule ? { rule } : { error: await fail('pwb.comms.err.who') };
}

export async function saveAudience(name: string, roles: string[], sectionIds: string[], userIds: string) {
  const r = await ruleOf(roles, sectionIds, userIds);
  return r.rule ? send(`${C}/audiences`, { name, rule: r.rule }, PAGE) : r.error;
}

/** How many people the rule reaches, before it is saved. */
export async function previewAudience(roles: string[], sectionIds: string[], userIds: string) {
  const r = await ruleOf(roles, sectionIds, userIds);
  return r.rule ? send<{ size: number }>(`${C}/audiences/preview`, r.rule, PAGE) : r.error;
}

export async function removeAudience(audienceId: string) {
  return send(`${C}/audiences/${id(audienceId)}`, undefined, PAGE, 'DELETE');
}

/** Schedules a campaign; with no time it goes out now. `vars` are lines like `name=Asha`. */
export async function createCampaign(v: V) {
  const vars = parseVars(v.vars ?? '');
  if (!vars.ok) return fail('pwb.comms.err.vars', { line: vars.line });
  return send(`${C}/campaigns`, { title: v.title, templateId: v.templateId, audienceId: v.audienceId, vars: vars.vars, ...(optStr(v.sendAt) ? { sendAt: v.sendAt } : {}) }, PAGE);
}

export async function campaignDetail(campaignId: string) {
  return read<CampaignDetail>(`${C}/campaigns/${id(campaignId)}`);
}

export async function cancelCampaign(campaignId: string) {
  return send(`${C}/campaigns/${id(campaignId)}/cancel`, undefined, PAGE);
}

/** Sends the campaigns that are due and tries failed deliveries again. */
export async function runDue() {
  return send<{ campaigns: number; retried: number }>(`${C}/run`, undefined, PAGE);
}
