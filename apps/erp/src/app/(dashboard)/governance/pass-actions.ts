'use server';

import { getI18n } from '@/i18n/server';
import { read, send } from '@/lib/ops-server';
import type { Acks, PolicyText } from '@/lib/governance-pass';
import { agendaLines } from '@/lib/governance-pass';

// The governance pass's steps around the record kit lists: committee set-up, members, meetings, minutes and their
// signatures, action-taken reports, policy versions and acknowledgement, deadlines and the disclosure page.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const COMMITTEES = '/governance/committees';

async function bad(field: string) {
  return { ok: false as const, error: (await getI18n()).t('ops.err.field', { field }) };
}

export async function setupStatutory() {
  return send('/v1/governance/committees/setup', {}, COMMITTEES);
}

export async function saveProfile(id: string, v: Record<string, string>) {
  if (!UUID.test(id)) return bad('id');
  const meetings = Number(v.meetingsPerYear);
  const quorum = Number(v.quorumPct);
  return send(
    `/v1/governance/committees/${id}/profile`,
    {
      kind: v.kind || undefined,
      mandate: v.mandate ?? '',
      meetingsPerYear: Number.isInteger(meetings) ? meetings : undefined,
      quorumPct: Number.isInteger(quorum) && quorum > 0 ? quorum : undefined,
      constitutedOn: DAY.test(v.constitutedOn ?? '') ? v.constitutedOn : null,
      orderRef: v.orderRef ?? '',
      helpline: v.helpline ?? '',
      email: v.email ?? '',
      public: v.public === 'yes',
    },
    `${COMMITTEES}/${id}`,
    'PUT',
  );
}

export async function addMember(id: string, v: Record<string, string>) {
  if (!UUID.test(id)) return bad('id');
  if (!DAY.test(v.tenureStart ?? '')) return bad('tenureStart');
  const who = v.userId && UUID.test(v.userId) ? { userId: v.userId } : v.rollNo ? { rollNo: v.rollNo } : { name: v.name };
  return send(
    `/v1/governance/committees/${id}/members`,
    { ...who, role: v.role || 'member', category: v.category || 'internal', ...(v.gender ? { gender: v.gender } : {}), designation: v.designation ?? '', phone: v.phone ?? '', contactPublic: v.contactPublic === 'yes', tenureStart: v.tenureStart, tenureEnd: DAY.test(v.tenureEnd ?? '') ? v.tenureEnd : null },
    `${COMMITTEES}/${id}`,
  );
}

export async function endTenure(id: string, memberId: string, on: string) {
  if (!UUID.test(id) || !UUID.test(memberId)) return bad('id');
  if (!DAY.test(on)) return bad('tenureEnd');
  return send(`/v1/governance/committees/${id}/members/${memberId}`, { tenureEnd: on }, `${COMMITTEES}/${id}`, 'PATCH');
}

export async function scheduleMeeting(id: string, v: Record<string, string>) {
  if (!UUID.test(id)) return bad('id');
  if (!DAY.test(v.meetingOn ?? '')) return bad('meetingOn');
  return send(`/v1/governance/committees/${id}/meetings`, { title: v.title, meetingOn: v.meetingOn, startsAt: v.startsAt ?? '', venue: v.venue ?? '', agenda: agendaLines(v.agenda ?? '').map((title) => ({ title })) }, `${COMMITTEES}/${id}`);
}

const meetingPage = (id: string) => `/governance/meetings/${id}`;

export async function saveMeeting(id: string, v: { venue?: string; startsAt?: string; minutes?: string }) {
  if (!UUID.test(id)) return bad('id');
  return send(`/v1/governance/committees/meetings/${id}`, v, meetingPage(id), 'PUT');
}

export async function saveAgenda(id: string, items: { title: string; presenter: string; discussion: string; resolution: string; outcome: string }[]) {
  if (!UUID.test(id)) return bad('id');
  return send(`/v1/governance/committees/meetings/${id}/agenda`, { items }, meetingPage(id), 'PUT');
}

export async function saveAttendance(id: string, entries: { memberId: string; status: string }[]) {
  if (!UUID.test(id)) return bad('id');
  return send(`/v1/governance/committees/meetings/${id}/attendance`, { entries }, meetingPage(id), 'PUT');
}

export async function meetingStep(id: string, step: 'notice' | 'circulate' | 'revise') {
  if (!UUID.test(id)) return bad('id');
  return send(`/v1/governance/committees/meetings/${id}/${step}`, {}, meetingPage(id));
}

export async function signMinutes(id: string, decision: 'approve' | 'object', comment: string) {
  if (!UUID.test(id)) return bad('id');
  return send(`/v1/governance/committees/meetings/${id}/sign`, { decision, comment }, meetingPage(id));
}

export async function addAction(meetingId: string, v: Record<string, string>) {
  if (!UUID.test(meetingId) || !UUID.test(v.ownerUserId ?? '')) return bad('ownerUserId');
  if (!DAY.test(v.dueOn ?? '')) return bad('dueOn');
  return send(`/v1/governance/committees/meetings/${meetingId}/actions`, { title: v.title, ownerUserId: v.ownerUserId, dueOn: v.dueOn, ...(UUID.test(v.agendaItemId ?? '') ? { agendaItemId: v.agendaItemId } : {}) }, meetingPage(meetingId));
}

export async function reportAction(actionId: string, v: Record<string, string>, page: string) {
  if (!UUID.test(actionId)) return bad('id');
  return send(`/v1/governance/committees/action-items/${actionId}/report`, { actionTaken: v.actionTaken, status: v.status === 'in_progress' ? 'in_progress' : 'done', evidenceUrl: v.evidenceUrl ?? '' }, page, 'PUT');
}

// ---- policies -----------------------------------------------------------------------------------------------------

const policyPage = (id: string) => `/governance/policies/${id}`;

export async function newPolicyVersion(id: string, v: Record<string, string>) {
  if (!UUID.test(id)) return bad('id');
  return send(`/v1/governance/policies/${id}/versions`, { body: v.body, changeNote: v.changeNote }, policyPage(id));
}

export async function editPolicyVersion(policyId: string, vid: string, v: Record<string, string>) {
  if (!UUID.test(vid)) return bad('id');
  return send(`/v1/governance/policies/versions/${vid}`, { body: v.body, changeNote: v.changeNote ?? '', effectiveFrom: DAY.test(v.effectiveFrom ?? '') ? v.effectiveFrom : null }, policyPage(policyId), 'PUT');
}

export async function policyStep(policyId: string, vid: string, step: 'review' | 'draft' | 'approve' | 'publish' | 'remind') {
  if (!UUID.test(vid) || !UUID.test(policyId)) return bad('id');
  if (step === 'review' || step === 'draft') return send(`/v1/governance/policies/versions/${vid}/move`, { to: step === 'review' ? 'in_review' : 'draft' }, policyPage(policyId));
  return send(`/v1/governance/policies/versions/${vid}/${step}`, {}, policyPage(policyId));
}

export async function policyAcks(vid: string, state: 'pending' | 'done' | '', page = 1) {
  if (!UUID.test(vid)) return bad('id');
  return read<Acks>(`/v1/governance/policies/versions/${vid}/acks?state=${state}&page=${page}`);
}

export async function policyText(vid: string) {
  if (!UUID.test(vid)) return bad('id');
  return read<PolicyText>(`/v1/governance/policies/versions/${vid}/text`);
}

export async function acknowledgePolicy(vid: string) {
  if (!UUID.test(vid)) return bad('id');
  return send(`/v1/governance/policies/versions/${vid}/acknowledge`, {}, '/governance/mine');
}

// ---- compliance and disclosure ------------------------------------------------------------------------------------

export async function addStandardDeadlines(startYear: number) {
  return send('/v1/governance/compliance/standard', { startYear }, '/governance/compliance');
}

export async function deadlineDone(id: string, reference: string) {
  if (!UUID.test(id)) return bad('id');
  return send(`/v1/governance/compliance/${id}/done`, { reference }, '/governance/compliance');
}

export async function sendReminders() {
  return send('/v1/governance/compliance/remind', {}, '/governance/compliance');
}

export async function publishDisclosure(published: boolean, intro: string) {
  return send('/v1/governance/disclosure/settings', { published, intro }, '/governance/disclosure', 'PUT');
}
