'use server';

import type { AcademicSettings, RequestKind, SectionRecord } from '@/lib/academics';
import { read, send } from '@/lib/ops-server';

const PAGE = '/academics';
const id = encodeURIComponent;

export async function raiseRequest(kind: RequestKind, studentId: string | undefined, reason: string, payload: Record<string, unknown>) {
  return send<{ id: string; number: string }>('/v1/academics/requests', { kind, ...(studentId ? { studentId } : {}), reason, payload }, PAGE);
}

/** Returns an error message, or nothing on success (the ApprovalPanel contract). */
export async function decideRequest(requestId: string, decision: 'approve' | 'reject', note: string, sectionId?: string): Promise<string | void> {
  const r = await send(`/v1/academics/requests/${id(requestId)}/decide`, { decision, ...(note ? { note } : {}), ...(sectionId ? { sectionId } : {}) }, `${PAGE}/requests/${requestId}`);
  if (!r.ok) return r.error;
}

export async function cancelRequest(requestId: string) {
  return send(`/v1/academics/requests/${id(requestId)}/cancel`, {}, `${PAGE}/requests/${requestId}`);
}

export async function saveSettings<K extends keyof AcademicSettings>(kind: K, value: AcademicSettings[K]) {
  return send<AcademicSettings[K]>(`/v1/academics/settings/${kind}`, value, `${PAGE}/settings`, 'PUT');
}

/** The students of one class, for the request form. */
export async function classStudents(sectionId: string) {
  const r = await read<SectionRecord>(`/v1/academics/sections/${id(sectionId)}`);
  return r.ok ? { ok: true as const, data: { students: r.data.students, timetable: r.data.timetable } } : r;
}

export async function lockMarks(assessmentId: string, unlock: boolean) {
  return send(`/v1/academics/assessments/${id(assessmentId)}/lock${unlock ? '?unlock=true' : ''}`, {}, `${PAGE}/assessments/${assessmentId}`);
}

export async function decideLessonPlan(planId: string, decision: 'approve' | 'reject', note: string): Promise<string | void> {
  const r = await send(`/v1/academics/lesson-plans/${id(planId)}/decide`, { decision, ...(note ? { note } : {}) }, PAGE);
  if (!r.ok) return r.error;
}

export async function submitLessonPlan(planId: string) {
  return send(`/v1/academics/lesson-plans/${id(planId)}/submit`, {}, PAGE);
}
