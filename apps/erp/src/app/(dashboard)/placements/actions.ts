'use server';

import { optStr, read, send } from '@/lib/ops-server';
import { failure } from '@/lib/pathways-server';
import type { InternshipAttendance, InternshipCertificate, InternshipLink } from '@/lib/pathways-a';

const PAGE = '/placements';
const BASE = '/v1/placements/internships';
const id = encodeURIComponent;
type V = Record<string, string>;

/** Moves an internship on; finishing one may issue its certificate, and says why when it does not. */
export async function moveInternship(internshipId: string, status: string) {
  return send<{ certificate?: { certificateId: string | null; reason?: string } }>(`${BASE}/${id(internshipId)}/status`, { status }, PAGE);
}

export async function internshipAttendance(internshipId: string) {
  return read<InternshipAttendance>(`${BASE}/${id(internshipId)}/attendance`);
}

export async function markAttendance(internshipId: string, v: V) {
  const hours = v.hours?.trim() ? Number(v.hours) : 8;
  if (!Number.isFinite(hours) || hours < 0 || hours > 16) return failure('pw.err.number');
  return send(`${BASE}/${id(internshipId)}/attendance`, { onDate: v.onDate, present: v.present !== 'no', hours, note: v.note ?? '' }, PAGE);
}

export async function internshipLinks(internshipId: string) {
  return read<InternshipLink[]>(`${BASE}/${id(internshipId)}/links`);
}

export async function addInternshipLink(internshipId: string, v: V) {
  return send(`${BASE}/${id(internshipId)}/links`, { kind: v.kind, refId: v.refId, ...(optStr(v.note) ? { note: v.note.trim() } : {}) }, PAGE);
}

export async function removeInternshipLink(internshipId: string, linkId: string) {
  return send(`${BASE}/${id(internshipId)}/links/${id(linkId)}`, undefined, PAGE, 'DELETE');
}

export async function internshipCertificate(internshipId: string) {
  return read<InternshipCertificate>(`${BASE}/${id(internshipId)}/certificate`);
}

/** Issues the certificate now; `waive` lets the office skip the attendance minimum. */
export async function issueCertificate(internshipId: string, waive: boolean) {
  return send<{ certificateId: string | null; reason?: string }>(`${BASE}/${id(internshipId)}/certificate`, { waiveAttendance: waive }, PAGE);
}
