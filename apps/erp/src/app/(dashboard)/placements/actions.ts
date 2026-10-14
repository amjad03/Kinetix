'use server';

import { refuse } from '@/lib/procurement-fail';
import { revalidatePath } from 'next/cache';
import { act, api } from '@/lib/api';
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

/** A file upload to the API (multipart), then the page reloads its data. */
async function sendForm(path: string, form: FormData, page: string) {
  const res = await act(() => api<unknown>(path, { method: 'POST', form, timeoutMs: 60_000 }));
  if (res.ok) revalidatePath(page);
  return res;
}

// ---- internships from the register's row actions ---------------------------------------------

export async function approveInternship(internshipId: string) {
  return moveInternship(internshipId, 'approved');
}
export async function startInternship(internshipId: string) {
  return moveInternship(internshipId, 'ongoing');
}
export async function completeInternship(internshipId: string) {
  return moveInternship(internshipId, 'completed');
}
export async function cancelInternship(internshipId: string) {
  return moveInternship(internshipId, 'cancelled');
}

// ---- companies ----------------------------------------------------------------------------------

const P = '/v1/placements';

/** Verifies a self-registered company; its recruiter portal key comes back once. */
export async function verifyCompany(companyId: string) {
  return send<{ status: string; key: string }>(`${P}/companies/${id(companyId)}/verify`, undefined, PAGE);
}

export async function issuePortalKey(companyId: string) {
  return send<{ key: string }>(`${P}/companies/${id(companyId)}/portal-key`, undefined, `${PAGE}/companies/${companyId}`);
}

export async function revokePortalKey(companyId: string) {
  return send(`${P}/companies/${id(companyId)}/portal-key`, undefined, `${PAGE}/companies/${companyId}`, 'DELETE');
}

export async function saveContact(companyId: string, v: V, contactId?: string) {
  const body = { name: v.name, designation: v.designation ?? '', email: optStr(v.email) ?? null, phone: optStr(v.phone) ?? null, isPrimary: v.isPrimary === 'yes' };
  return contactId ? send(`${P}/contacts/${id(contactId)}`, body, `${PAGE}/companies/${companyId}`, 'PUT') : send(`${P}/companies/${id(companyId)}/contacts`, body, `${PAGE}/companies/${companyId}`);
}

export async function removeContact(companyId: string, contactId: string) {
  return send(`${P}/contacts/${id(contactId)}`, undefined, `${PAGE}/companies/${companyId}`, 'DELETE');
}

// ---- drives -------------------------------------------------------------------------------------

export async function addRound(driveId: string, v: V) {
  return send(`${P}/drives/${id(driveId)}/rounds`, { name: v.name, kind: v.kind || 'interview', ...(optStr(v.scheduledOn) ? { scheduledOn: v.scheduledOn } : {}) }, `${PAGE}/drives/${driveId}`);
}

/** One round's results: `r_<registrationId>` is pass, fail or absent (left blank: not recorded). */
export async function saveResults(driveId: string, roundId: string, results: { registrationId: string; result: 'pass' | 'fail' | 'absent'; note: string }[]) {
  if (!results.length) return refuse('ivd.err.nothing');
  return send<{ debarred: number }>(`${P}/drives/${id(driveId)}/rounds/${id(roundId)}/results`, { results }, `${PAGE}/drives/${driveId}`, 'PUT');
}

export async function makeOffer(driveId: string, registrationId: string, v: V) {
  const ctc = optStr(v.ctcLpa);
  return send(`${P}/drives/${id(driveId)}/offers`, { registrationId, ...(optStr(v.roleTitle) ? { roleTitle: v.roleTitle } : {}), ...(ctc ? { ctcLpa: Number(ctc) } : {}), ...(optStr(v.respondBy) ? { respondBy: v.respondBy } : {}) }, `${PAGE}/drives/${driveId}`);
}

/** Registers a student past the window, with the reason (a backlog cleared late). */
export async function addRegistration(driveId: string, v: V) {
  return send(`${P}/drives/${id(driveId)}/registrations`, { studentId: v.studentId, reason: v.reason }, `${PAGE}/drives/${driveId}`);
}

export async function recheckRegistration(driveId: string, registrationId: string) {
  return send<{ eligible: boolean; conditionsCleared: number }>(`${P}/registrations/${id(registrationId)}/recheck`, undefined, `${PAGE}/drives/${driveId}`);
}

export async function autoSlots(driveId: string, roundId: string, v: V) {
  const venues = (v.venues ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  return send<{ scheduled: number }>(`${P}/drives/${id(driveId)}/rounds/${id(roundId)}/slots/auto`, { startsAt: v.startsAt, minutes: Number(v.minutes || '20'), gapMinutes: Number(v.gapMinutes || '0'), venues, panel: v.panel ?? '' }, `${PAGE}/drives/${driveId}`);
}

export async function updateSlot(driveId: string, slotId: string, v: V) {
  return send(`${P}/slots/${id(slotId)}`, { ...(optStr(v.startsAt) ? { startsAt: v.startsAt } : {}), ...(optStr(v.venue) ? { venue: v.venue } : {}), ...(optStr(v.panel) ? { panel: v.panel } : {}), ...(optStr(v.status) ? { status: v.status } : {}) }, `${PAGE}/drives/${driveId}`, 'PUT');
}

export async function moveDrive(driveId: string, status: string) {
  return send(`${P}/drives/${id(driveId)}/status`, { status }, `${PAGE}/drives/${driveId}`);
}

// ---- offers -------------------------------------------------------------------------------------

export async function revokeOffer(offerId: string, v: V) {
  return send(`${P}/offers/${id(offerId)}/revoke`, { reason: v.reason }, PAGE);
}

export async function recordOfferResponse(offerId: string, v: V) {
  return send(`${P}/offers/${id(offerId)}/record-response`, { response: v.response, ...(optStr(v.reason) ? { reason: v.reason } : {}) }, PAGE);
}

export async function recordJoining(offerId: string, v: V) {
  return send(`${P}/offers/${id(offerId)}/joining`, { status: v.status, ...(optStr(v.joinedOn) ? { joinedOn: v.joinedOn } : {}), ...(optStr(v.note) ? { note: v.note } : {}) }, PAGE);
}

export async function withdrawOffer(offerId: string) {
  return send(`${P}/offers/${id(offerId)}/withdraw`, {}, PAGE);
}

/** Attaches the company's offer letter (PDF, JPEG or PNG). */
export async function uploadOfferLetter(offerId: string, form: FormData) {
  const file = form.get('file');
  if (!(file instanceof File) || !file.size) return refuse('ivd.err.file');
  const body = new FormData();
  body.set('file', file);
  return sendForm(`${P}/offers/${id(offerId)}/letter`, body, PAGE);
}

// ---- students: opting out and debarment ------------------------------------------------------------

export async function setOptin(studentId: string, v: V) {
  return send(`${P}/students/${id(studentId)}/optin`, { optedIn: v.optedIn === 'yes', ...(optStr(v.reason) ? { reason: v.reason } : {}) }, PAGE);
}

export async function debarStudent(studentId: string, v: V) {
  return send(`${P}/students/${id(studentId)}/debar`, { until: v.until, reason: v.reason }, PAGE);
}

export async function liftDebar(studentId: string) {
  return send(`${P}/students/${id(studentId)}/lift-debar`, undefined, PAGE);
}

// ---- training -----------------------------------------------------------------------------------

export async function addSession(trainingId: string, v: V) {
  return send(`${P}/trainings/${id(trainingId)}/sessions`, { heldOn: v.heldOn, topic: v.topic, hours: Number(v.hours || '1') }, `${PAGE}/trainings/${trainingId}`);
}

export async function removeSession(trainingId: string, sessionId: string) {
  return send(`${P}/training-sessions/${id(sessionId)}`, undefined, `${PAGE}/trainings/${trainingId}`, 'DELETE');
}

export async function markSession(trainingId: string, sessionId: string, present: string[], absent: string[]) {
  return send(`${P}/training-sessions/${id(sessionId)}/attendance`, { present, absent }, `${PAGE}/trainings/${trainingId}`, 'PUT');
}

export async function saveScores(trainingId: string, v: V, scores: { studentId: string; score: number }[]) {
  if (!scores.length) return refuse('ivd.err.scores');
  return send(`${P}/trainings/${id(trainingId)}/scores`, { testName: v.testName, maxScore: Number(v.maxScore), ...(optStr(v.takenOn) ? { takenOn: v.takenOn } : {}), scores }, `${PAGE}/trainings/${trainingId}`, 'PUT');
}

/** Issues the certificate now; `waive` lets the office skip the attendance minimum. */
export async function issueCertificate(internshipId: string, waive: boolean) {
  return send<{ certificateId: string | null; reason?: string }>(`${BASE}/${id(internshipId)}/certificate`, { waiveAttendance: waive }, PAGE);
}
