'use server';

import { getI18n } from '@/i18n/server';
import { optStr, read, send } from '@/lib/ops-server';
import type { GrievanceEvidence, ParentContact, PickedFile, Witness } from '@/lib/pathways-b';

const PAGE = '/grievances';
const id = encodeURIComponent;
type V = Record<string, string>;

// ---- evidence on a ticket ----
export async function ticketEvidence(ticketId: string) {
  return read<GrievanceEvidence[]>(`/v1/grievances/${id(ticketId)}/evidence`);
}
export async function addTicketEvidence(ticketId: string, v: V, file: PickedFile | null) {
  if (!file) return { ok: false as const, error: (await getI18n()).t('pwb.file.required') };
  return send(`/v1/grievances/${id(ticketId)}/evidence`, { ...(optStr(v.title) ? { title: v.title } : {}), file }, PAGE);
}
export async function removeTicketEvidence(evidenceId: string) {
  return send(`/v1/grievances/evidence/${id(evidenceId)}`, undefined, PAGE, 'DELETE');
}

// ---- discipline: witnesses and the parent contact log ----
export async function incidentWitnesses(incidentId: string) {
  return read<Witness[]>(`/v1/discipline/incidents/${id(incidentId)}/witnesses`);
}
export async function addWitness(incidentId: string, v: V) {
  return send(`/v1/discipline/incidents/${id(incidentId)}/witnesses`, { name: v.name, role: v.role || 'student', ...(optStr(v.studentId) ? { studentId: v.studentId } : {}), statement: v.statement ?? '' }, PAGE);
}
export async function incidentContacts(incidentId: string) {
  return read<ParentContact[]>(`/v1/discipline/incidents/${id(incidentId)}/parent-contacts`);
}
export async function contactParents(incidentId: string, v: V) {
  return send(`/v1/discipline/incidents/${id(incidentId)}/parent-contacts`, { method: v.method || 'message', summary: v.summary, ...(optStr(v.meetingOn) ? { meetingOn: v.meetingOn } : {}) }, PAGE);
}
