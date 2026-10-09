'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import { isIsoDate } from '@/lib/dates';
import { parseWhole } from '@/lib/exam-registration';
import { schemeProblem, type PassRules, type SchemeComponent } from '@/lib/exams';
import type { ActionResult } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

async function bad(key: Parameters<Awaited<ReturnType<typeof getI18n>>['t']>[0]): Promise<{ ok: false; error: string }> {
  return { ok: false, error: (await getI18n()).t(key) };
}

async function post<T>(path: string, body: unknown, paths: string[], method: 'POST' | 'PUT' | 'DELETE' = 'POST'): Promise<ActionResult<T>> {
  const res = await act(() => api<T>(path, { method, body: body === undefined ? undefined : body }));
  if (res.ok) for (const p of paths) revalidatePath(p);
  return res;
}

export async function createGradeScale(input: { name: string; preset: string }) {
  if (!input.name.trim() || !input.preset) return bad('exm.err.scale');
  return post('/v1/grade-scales', { name: input.name.trim(), preset: input.preset }, ['/exams/schemes']);
}

export async function saveScheme(input: { subjectId: string; academicYearId: string; name: string; credits: number; gradeScaleId: string; passRules: PassRules; components: SchemeComponent[] }) {
  if (!UUID.test(input.subjectId) || !UUID.test(input.academicYearId) || !UUID.test(input.gradeScaleId)) return bad('exm.err.scheme.pick');
  const problem = schemeProblem(input);
  if (problem) return bad(`exm.err.scheme.${problem}`);
  const components = input.components.map((c) => ({ code: c.code.trim(), name: c.name.trim(), kind: c.kind, weight: c.weight }));
  return post('/v1/schemes', { ...input, name: input.name.trim(), components }, ['/exams/schemes'], 'PUT');
}

export async function createSession(input: { academicYearId: string; programId: string; term: number; name: string; kind: 'regular' | 'supplementary'; startsOn: string; endsOn: string }) {
  if (!UUID.test(input.programId) || !UUID.test(input.academicYearId) || !Number.isInteger(input.term) || input.term < 1) return bad('exm.err.session.pick');
  if (!input.name.trim()) return bad('exm.err.session.name');
  if (!isIsoDate(input.startsOn) || !isIsoDate(input.endsOn) || input.endsOn < input.startsOn) return bad('exm.err.session.dates');
  return post<{ id: string }>('/v1/exam-sessions', { ...input, name: input.name.trim() }, ['/exams']);
}

export async function addPaper(sessionId: string, input: { subjectId: string; sectionId: string; examDate: string; startsAt: string; endsAt: string; maxMarks: number }) {
  if (!UUID.test(sessionId) || !UUID.test(input.subjectId) || !UUID.test(input.sectionId)) return bad('exm.err.paper.pick');
  if (!isIsoDate(input.examDate) || !TIME.test(input.startsAt) || !TIME.test(input.endsAt) || input.endsAt <= input.startsAt) return bad('exm.err.paper.time');
  if (!(input.maxMarks > 0 && input.maxMarks <= 1000)) return bad('exm.err.paper.marks');
  return post(`/v1/exam-sessions/${sessionId}/papers`, input, [`/exams/${sessionId}`]);
}

export async function removePaper(sessionId: string, paperId: string) {
  if (!UUID.test(sessionId) || !UUID.test(paperId)) return bad('exm.err.paper.pick');
  return post(`/v1/exam-sessions/${sessionId}/papers/${paperId}`, undefined, [`/exams/${sessionId}`], 'DELETE');
}

export async function sessionStep(sessionId: string, step: 'schedule' | 'process' | 'publish' | 'lock') {
  if (!UUID.test(sessionId)) return bad('exm.err.session.pick');
  return post<Record<string, unknown>>(`/v1/exam-sessions/${sessionId}/${step}`, undefined, [`/exams/${sessionId}`, '/exams', '/results']);
}

/** Turns the approval step on or off for a session. */
export async function setApprovalRequired(sessionId: string, required: boolean) {
  if (!UUID.test(sessionId)) return bad('exm.err.session.pick');
  return post(`/v1/exam-sessions/${sessionId}/approval-required`, { required }, [`/exams/${sessionId}`], 'PUT');
}

/** Asks for approval, approves, or returns the processed results with a note. */
export async function approvalStep(sessionId: string, step: 'request-approval' | 'approve' | 'return', note?: string) {
  if (!UUID.test(sessionId)) return bad('exm.err.session.pick');
  if (step === 'return' && (note ?? '').trim().length < 3) return bad('ap.err.note');
  return post(`/v1/exam-sessions/${sessionId}/${step}`, step === 'request-approval' ? undefined : { note: note?.trim() || undefined }, [`/exams/${sessionId}`, '/exams']);
}

export async function generateSeating(sessionId: string, halls: { roomId: string; capacity: number }[]) {
  if (!UUID.test(sessionId) || halls.length === 0 || halls.some((h) => !UUID.test(h.roomId) || !Number.isInteger(h.capacity) || h.capacity < 1)) return bad('exm.err.seating');
  return post<{ seated: number }>(`/v1/exam-sessions/${sessionId}/seating`, { halls }, [`/exams/${sessionId}`]);
}

/** Sets the registration window and its eligibility rules for a session. */
export async function saveRegistrationWindow(sessionId: string, v: Record<string, string>) {
  if (!UUID.test(sessionId)) return bad('exm.err.session.pick');
  if (!isIsoDate(v.opensOn ?? '') || !isIsoDate(v.closesOn ?? '') || v.closesOn < v.opensOn) return bad('er.err.dates');
  const attendance = v.minAttendancePercent?.trim() ? Number(v.minAttendancePercent) : null;
  if (attendance !== null && !(attendance >= 0 && attendance <= 100)) return bad('er.err.attendance');
  const backlogs = parseWhole(v.maxBacklogs, 0, 50);
  if (backlogs === undefined) return bad('er.err.backlogs');
  return post(`/v1/exam-sessions/${sessionId}/registration-window`, { opensOn: v.opensOn, closesOn: v.closesOn, minAttendancePercent: attendance, blockOnFeeDues: v.blockOnFeeDues !== 'no', maxBacklogs: backlogs }, [`/exams/${sessionId}`], 'PUT');
}

/** The controller registers an ineligible student anyway, with a reason that is kept on the record. */
export async function overrideRegistration(sessionId: string, studentId: string, v: Record<string, string>) {
  if (!UUID.test(sessionId) || !UUID.test(studentId)) return bad('exm.err.session.pick');
  if ((v.reason ?? '').trim().length < 5) return bad('er.err.reason');
  return post(`/v1/exam-sessions/${sessionId}/registrations/${studentId}/override`, { reason: v.reason.trim() }, [`/exams/${sessionId}`]);
}

/** Builds the anti-collusion seating plan for one hall layout. */
export async function generateAntiCollusionPlan(sessionId: string, v: Record<string, string>) {
  const rows = parseWhole(v.rows, 1, 40);
  const benches = parseWhole(v.benchesPerRow, 1, 20);
  const seats = parseWhole(v.seatsPerBench, 1, 4);
  if (!UUID.test(sessionId) || !UUID.test(v.roomId ?? '') || !rows || !benches || !seats) return bad('er.err.layout');
  return post<{ seated: number; vacant: number }>(`/v1/exam-sessions/${sessionId}/seating-plan`, { rooms: [{ roomId: v.roomId, rows, benchesPerRow: benches, seatsPerBench: seats }] }, [`/exams/${sessionId}`]);
}

export async function issueHallTickets(sessionId: string, blocks: { studentId: string; reason: string }[]) {
  if (!UUID.test(sessionId) || blocks.some((b) => !UUID.test(b.studentId) || !b.reason.trim())) return bad('exm.err.tickets');
  return post<{ issued: number; blocked: number }>(`/v1/exam-sessions/${sessionId}/hall-tickets`, { blocks }, [`/exams/${sessionId}`]);
}

export async function decideRevaluation(sessionId: string, id: string, accept: boolean, note: string) {
  if (!UUID.test(id)) return bad('exm.err.reval');
  return post(`/v1/revaluations/${id}/decide`, { accept, note: note.trim() || undefined }, [`/exams/${sessionId}`]);
}

export async function completeRevaluation(sessionId: string, id: string, marks: number) {
  if (!UUID.test(id) || !Number.isFinite(marks) || marks < 0) return bad('exm.err.reval');
  return post(`/v1/revaluations/${id}/complete`, { marks }, [`/exams/${sessionId}`]);
}

// ---- Exam controller depth: invigilation, supplementary registration, malpractice ----

export async function addDuty(sessionId: string, v: Record<string, string>) {
  if (!UUID.test(sessionId) || !UUID.test(v.staffId ?? '') || !UUID.test(v.roomId ?? '')) return bad('exm.err.paper.pick');
  if (!isIsoDate(v.dutyDate ?? '') || !TIME.test(v.startsAt ?? '') || !TIME.test(v.endsAt ?? '') || v.endsAt <= v.startsAt) return bad('exm.err.paper.time');
  return post(`/v1/exam-sessions/${sessionId}/duties`, { staffId: v.staffId, roomId: v.roomId, dutyDate: v.dutyDate, startsAt: v.startsAt, endsAt: v.endsAt, role: v.role || 'invigilator' }, [`/exams/${sessionId}`]);
}

export async function substituteDuty(sessionId: string, dutyId: string, v: Record<string, string>) {
  if (!UUID.test(sessionId) || !UUID.test(dutyId) || !UUID.test(v.staffId ?? '')) return bad('exm.err.paper.pick');
  return post(`/v1/exam-sessions/${sessionId}/duties/${dutyId}/substitute`, { staffId: v.staffId }, [`/exams/${sessionId}`]);
}

export async function removeDuty(sessionId: string, dutyId: string) {
  if (!UUID.test(sessionId) || !UUID.test(dutyId)) return bad('exm.err.paper.pick');
  return post(`/v1/exam-sessions/${sessionId}/duties/${dutyId}`, undefined, [`/exams/${sessionId}`], 'DELETE');
}

export async function registerSupplementary(sessionId: string, v: Record<string, string>) {
  if (!UUID.test(sessionId) || !UUID.test(v.studentId ?? '') || !UUID.test(v.subjectId ?? '')) return bad('exm.err.paper.pick');
  return post(`/v1/exam-sessions/${sessionId}/supplementary`, { studentId: v.studentId, subjectIds: [v.subjectId] }, [`/exams/${sessionId}`]);
}

export async function cancelSupplementary(sessionId: string, regId: string) {
  if (!UUID.test(sessionId) || !UUID.test(regId)) return bad('exm.err.paper.pick');
  return post(`/v1/exam-sessions/${sessionId}/supplementary/${regId}`, undefined, [`/exams/${sessionId}`], 'DELETE');
}

export async function reportMalpractice(sessionId: string, v: Record<string, string>) {
  if (!UUID.test(sessionId) || !UUID.test(v.studentId ?? '') || (v.description ?? '').trim().length < 3) return bad('exm.err.paper.pick');
  return post(`/v1/exam-sessions/${sessionId}/malpractice`, { studentId: v.studentId, description: v.description.trim() }, [`/exams/${sessionId}`]);
}

export async function decideMalpractice(sessionId: string, caseId: string, v: Record<string, string>) {
  if (!UUID.test(caseId) || (v.outcome !== 'penalised' && v.outcome !== 'dismissed')) return bad('exm.err.paper.pick');
  return post(`/v1/malpractice/${caseId}/decide`, { outcome: v.outcome, penalty: v.penalty?.trim() || undefined }, [`/exams/${sessionId}`]);
}

// ---- Results depth: rules, grace marks ----

export async function saveResultRules(sessionId: string, v: Record<string, string>) {
  const n = (s: string | undefined) => (s && s.trim() ? Number(s) : null);
  const body = { graceMaxPerSubject: Number(v.graceMaxPerSubject), graceMaxTotal: Number(v.graceMaxTotal), progressionMinCredits: n(v.progressionMinCredits), progressionMaxBacklogs: n(v.progressionMaxBacklogs) };
  if (!UUID.test(sessionId) || !Number.isFinite(body.graceMaxPerSubject) || !Number.isFinite(body.graceMaxTotal) || [body.progressionMinCredits, body.progressionMaxBacklogs].some((x) => x !== null && !Number.isFinite(x))) return bad('ev.err.numbers');
  return post(`/v1/exam-sessions/${sessionId}/result-rules`, body, [`/exams/${sessionId}`], 'PUT');
}

export async function applyGrace(sessionId: string, dryRun: boolean) {
  if (!UUID.test(sessionId)) return bad('exm.err.session.pick');
  return post<{ students: number }>(`/v1/exam-sessions/${sessionId}/grace`, { dryRun }, [`/exams/${sessionId}`, '/results']);
}
