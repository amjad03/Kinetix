'use server';

import { getI18n } from '@/i18n/server';
import { send } from '@/lib/ops-server';
import { DECISIONS, MOVES, isQhEntity, isQhModule, type QhEntity, type QhSettings } from '@/lib/quality-hub';
import type { ActionResult } from '@/lib/types';

const e = encodeURIComponent;
type Call = [path: string, body: unknown, method?: 'POST' | 'PUT'];

/** Each move on a record, as a call to its module's own endpoint. */
const ROUTES: Record<string, (id: string, note: string) => Call> = {
  'grievance.start': (id) => [`/v1/grievances/${id}/status`, { status: 'in_progress' }],
  'grievance.resolve': (id, note) => [`/v1/grievances/${id}/resolve`, { resolution: note }],
  'discipline.review': (id) => [`/v1/discipline/incidents/${id}/review`, {}],
  'discipline.close': (id) => [`/v1/discipline/incidents/${id}/close`, {}],
  'drive.open': (id) => [`/v1/placements/drives/${id}/status`, { status: 'open' }],
  'drive.close': (id) => [`/v1/placements/drives/${id}/status`, { status: 'closed' }],
  'drive.complete': (id) => [`/v1/placements/drives/${id}/status`, { status: 'completed' }],
  'drive.cancel': (id) => [`/v1/placements/drives/${id}/status`, { status: 'cancelled' }],
  'proposal.review': (id) => [`/v1/research/proposals/${id}/decision`, { decision: 'under_review' }],
  'proposal.approve': (id, note) => [`/v1/research/proposals/${id}/decision`, { decision: 'approved', ...(note ? { note } : {}) }],
  'proposal.reject': (id, note) => [`/v1/research/proposals/${id}/decision`, { decision: 'rejected', note }],
  'project.complete': (id, note) => [`/v1/research/projects/${id}/status`, { status: 'completed', ...(note ? { outcomeSummary: note } : {}) }],
  'project.hold': (id) => [`/v1/research/projects/${id}/status`, { status: 'on_hold' }],
  'project.resume': (id) => [`/v1/research/projects/${id}/status`, { status: 'active' }],
  'project.cancel': (id) => [`/v1/research/projects/${id}/status`, { status: 'cancelled' }],
  'patent.publish': (id) => [`/v1/research/patents/${id}/status`, { status: 'published' }],
  'patent.grant': (id) => [`/v1/research/patents/${id}/status`, { status: 'granted' }],
  'patent.reject': (id) => [`/v1/research/patents/${id}/status`, { status: 'rejected' }],
  'survey.publish': (id) => [`/v1/surveys/${id}/publish`, {}],
  'survey.close': (id) => [`/v1/surveys/${id}/close`, {}],
  'feedbackReport.plan': (id, note) => [`/v1/accreditation/iqac/feedback-reports/${id}`, { status: 'action_planned', actionTaken: note }, 'PUT'],
  'feedbackReport.actionTaken': (id, note) => [`/v1/accreditation/iqac/feedback-reports/${id}`, { status: 'action_taken', actionTaken: note }, 'PUT'],
  'gapAction.start': (id) => [`/v1/obe/actions/${id}`, { status: 'in_progress' }, 'PUT'],
  'gapAction.done': (id) => [`/v1/obe/actions/${id}`, { status: 'done' }, 'PUT'],
  'event.publish': (id) => [`/v1/campus-life/events/${id}/publish`, {}],
  'event.cancel': (id) => [`/v1/campus-life/events/${id}/cancel`, {}],
  'campaign.cancel': (id) => [`/v1/comms/campaigns/${id}/cancel`, {}],
  'certificate.approve': (id, note) => [`/v1/documents/requests/${id}/approve`, note ? { note } : {}],
  'certificate.reject': (id, note) => [`/v1/documents/requests/${id}/reject`, { note }],
  'certificate.issue': (id) => [`/v1/documents/requests/${id}/issue`, {}],
  'certificate.revoke': (id, note) => [`/v1/documents/requests/${id}/revoke`, { reason: note }],
};

/** Runs one move (or an approve / reject decision) on a record; the module checks it is allowed now. */
export async function moveRecord(entity: string, id: string, status: string, move: string, note: string): Promise<ActionResult<unknown>> {
  const { t } = await getI18n();
  if (!isQhEntity(entity) || !/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: t('qh.err.record') };
  const ent: QhEntity = entity;
  const allowed = (MOVES[ent]?.[status] ?? []).find((m) => m.key === move) ?? ((DECISIONS[ent] ?? []).includes(status) && (move === 'approve' || move === 'reject') ? { key: move, note: move === 'reject' ? 'required' : 'optional' } : null);
  const route = ROUTES[`${ent}.${move}`];
  if (!allowed || !route) return { ok: false, error: t('qh.err.move') };
  if (allowed.note === 'required' && note.trim().length < 5) return { ok: false, error: t('qh.err.note') };
  const [path, body, method] = route(e(id), note.trim());
  return send(path, body, `/quality/records/${ent}/${id}`, method ?? 'POST');
}

/** Saves a module's settings (the API checks every key and range against the catalogue). */
export async function saveModuleSettings(module: string, settings: QhSettings): Promise<ActionResult<unknown>> {
  if (!isQhModule(module)) return { ok: false, error: (await getI18n()).t('qh.err.module') };
  return send(`/v1/quality-hub/settings/${module}`, settings, `/quality/settings/${module}`, 'PUT');
}
