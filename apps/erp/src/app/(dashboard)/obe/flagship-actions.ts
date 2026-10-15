'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import type { Framework, Paper, Policy } from '@/lib/obe-flagship';
import type { ActionResult } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ok = (...ids: (string | undefined | null)[]) => ids.every((i) => !!i && UUID.test(i));

async function bad(): Promise<{ ok: false; error: string }> {
  return { ok: false, error: (await getI18n()).t('of.err.input') };
}
async function call<T>(method: 'POST' | 'PUT' | 'DELETE', path: string, body: unknown, paths: string[]): Promise<ActionResult<T>> {
  const res = await act(() => api<T>(path, { method, body }));
  if (res.ok) for (const p of paths) revalidatePath(p, 'page');
  return res;
}
const OBE = ['/obe', '/obe/courses', '/obe/approvals', '/obe/courses/[subjectId]'];

// ---- COs and their approval ----------------------------------------------------------------------------------------

export async function startCoVersion(subjectId: string, note: string) {
  if (!ok(subjectId)) return bad();
  return call<{ id: string }>('POST', `/v1/obe/subjects/${subjectId}/co-sets`, { note: note.trim() || undefined }, OBE);
}
export async function addCourseOutcome(setId: string, input: { code: string; statement: string; bloomLevel: string }) {
  if (!ok(setId) || !input.code.trim() || input.statement.trim().length < 3) return bad();
  return call('POST', `/v1/obe/co-sets/${setId}/outcomes`, { code: input.code.trim(), statement: input.statement.trim(), bloomLevel: input.bloomLevel || undefined }, OBE);
}
export async function editCourseOutcome(id: string, input: { statement: string; bloomLevel: string }) {
  if (!ok(id) || input.statement.trim().length < 3) return bad();
  return call('PUT', `/v1/obe/course-outcomes/${id}`, { statement: input.statement.trim(), ...(input.bloomLevel ? { bloomLevel: input.bloomLevel } : {}) }, OBE);
}
export async function deleteCourseOutcome(id: string) {
  if (!ok(id)) return bad();
  return call('DELETE', `/v1/obe/course-outcomes/${id}`, undefined, OBE);
}
export async function suggestStatement(statement: string, bloomLevel: string) {
  if (!statement.trim()) return bad();
  return act(() => api<{ check: { ok: boolean; message: string | null }; level: number; verbs: string[]; rewrites: string[] }>('/v1/obe/suggest-co', { method: 'POST', body: { statement: statement.trim().slice(0, 1000), bloomLevel: bloomLevel || undefined } }));
}
export async function submitCos(setId: string, comment: string) {
  if (!ok(setId)) return bad();
  return call<{ reviewStage: string; warnings: string[] }>('POST', `/v1/obe/co-sets/${setId}/submit`, { comment: comment.trim() || undefined }, OBE);
}
export async function reviewCos(setId: string, decision: 'approve' | 'return' | 'comment', comment: string, coId?: string) {
  if (!ok(setId) || (coId && !UUID.test(coId))) return bad();
  return call<{ reviewStage: string }>('POST', `/v1/obe/co-sets/${setId}/review`, { decision, comment: comment.trim() || undefined, ...(coId ? { coId } : {}) }, OBE);
}
export async function activateDirectly(setId: string) {
  if (!ok(setId)) return bad();
  return call('POST', `/v1/obe/co-sets/${setId}/activate`, undefined, OBE);
}

// ---- question papers and question-wise marks -----------------------------------------------------------------------

export async function savePaper(assessmentId: string, questions: { no: string; part: string; maxMarks: number; bloomLevel: string | null; difficulty?: 'easy' | 'medium' | 'hard' | null; cos: { coId: string; weight: number }[] }[]) {
  if (!ok(assessmentId) || questions.some((q) => !q.no.trim() || !(q.maxMarks > 0) || q.cos.some((c) => !UUID.test(c.coId)) || (q.difficulty && !['easy', 'medium', 'hard'].includes(q.difficulty)))) return bad();
  return call<Paper>('PUT', `/v1/obe/assessments/${assessmentId}/questions`, { questions: questions.map((q) => ({ ...q, no: q.no.trim(), part: q.part.trim(), bloomLevel: q.bloomLevel || null })) }, ['/obe/assessments/[id]']);
}
export async function copyPaper(assessmentId: string, from: { fromAssessmentId?: string; qbPaperId?: string }) {
  if (!ok(assessmentId) || !ok(from.fromAssessmentId ?? from.qbPaperId)) return bad();
  return call<Paper>('POST', `/v1/obe/assessments/${assessmentId}/questions/copy`, from, ['/obe/assessments/[id]']);
}
export async function saveQuestionMarks(assessmentId: string, entries: { studentId: string; absent: boolean; marks: Record<string, number | null> }[]) {
  if (!ok(assessmentId) || !entries.length || entries.some((e) => !UUID.test(e.studentId))) return bad();
  return call<Paper>('PUT', `/v1/obe/assessments/${assessmentId}/question-marks`, { entries }, ['/obe/assessments/[id]']);
}
export async function uploadMarksSheet(assessmentId: string, form: FormData) {
  const file = form.get('file');
  if (!ok(assessmentId) || !(file instanceof File) || file.size === 0) return bad();
  const check = form.get('check') === 'true';
  const res = await act(() => api<{ saved: boolean; rows: number; errors: { row: number; message: string }[] }>(`/v1/obe/assessments/${assessmentId}/question-marks.xlsx${check ? '?check=true' : ''}`, { method: 'POST', form, timeoutMs: 60_000 }));
  if (res.ok && res.data.saved) revalidatePath('/obe/assessments/[id]', 'page');
  return res;
}

/** Checks (or, with check=false, saves) a filled targets sheet for a programme and year. */
export async function uploadTargetsSheet(programId: string, academicYearId: string, form: FormData) {
  const file = form.get('file');
  if (!ok(programId, academicYearId) || !(file instanceof File) || file.size === 0) return bad();
  const check = form.get('check') === 'true';
  const res = await act(() => api<{ saved: boolean; rows: number; errors: { row: number; message: string }[] }>(`/v1/obe/programs/${programId}/targets.xlsx?academicYearId=${academicYearId}${check ? '&check=true' : ''}`, { method: 'POST', form, timeoutMs: 60_000 }));
  if (res.ok && res.data.saved) revalidatePath('/obe/targets', 'page');
  return res;
}

// ---- programme set-up: presets, framework, policy ------------------------------------------------------------------

export async function applyPreset(programId: string, key: string) {
  if (!ok(programId) || !/^[a-z_0-9]{2,40}$/.test(key)) return bad();
  return call<{ added: number; kept: number }>('POST', `/v1/obe/programs/${programId}/presets`, { key }, ['/obe/setup']);
}
export async function setFramework(programId: string, framework: Framework) {
  if (!ok(programId)) return bad();
  return call('PUT', `/v1/obe/programs/${programId}/framework`, { framework }, ['/obe/setup', '/obe']);
}
export async function savePolicy(input: { scope: 'institution' | 'program' | 'subject'; programId?: string; subjectId?: string; note: string; effectiveFromYearId?: string; config: Policy }) {
  if ((input.scope === 'program' && !ok(input.programId)) || (input.scope === 'subject' && !ok(input.subjectId)) || (input.effectiveFromYearId && !UUID.test(input.effectiveFromYearId))) return bad();
  return call('POST', '/v1/obe/policies', { ...input, note: input.note.trim() || undefined, effectiveFromYearId: input.effectiveFromYearId || undefined }, ['/obe/setup', '/obe/courses/[subjectId]']);
}

// ---- attainment, batches, surveys ----------------------------------------------------------------------------------

export async function computeProgramme(programId: string, academicYearId: string) {
  if (!ok(programId, academicYearId)) return bad();
  return call<{ cos: number; outcomes: number }>('POST', `/v1/obe/programs/${programId}/attainment/compute`, { academicYearId }, [...OBE, '/obe/attainment', '/obe/trends']);
}
export async function computeBatch(programId: string, entryYearId: string) {
  if (!ok(programId, entryYearId)) return bad();
  return call<{ batch: string; cos: number }>('POST', `/v1/obe/programs/${programId}/batches/compute`, { entryYearId }, ['/obe/trends']);
}
export async function openExitSurvey(input: { kind: 'course_exit' | 'programme_exit'; sectionId: string; subjectId?: string; closesAt: string }) {
  if (!ok(input.sectionId) || (input.kind === 'course_exit' && !ok(input.subjectId)) || !/^\d{4}-\d{2}-\d{2}$/.test(input.closesAt)) return bad();
  return call<{ id: string; questions: number; students: number }>('POST', '/v1/obe/exit-surveys', input, ['/obe/surveys', '/obe/courses/[subjectId]']);
}
export async function remindSurvey(id: string) {
  if (!ok(id)) return bad();
  return call<{ reminded: number }>('POST', `/v1/obe/exit-surveys/${id}/remind`, undefined, ['/obe/surveys', '/obe/courses/[subjectId]']);
}
export async function addRatings(surveyId: string, ratings: { outcomeId?: string; coId?: string; rating: number }[]) {
  if (!ok(surveyId) || !ratings.length || ratings.some((r) => !(r.rating >= 0) || !ok(r.outcomeId ?? r.coId))) return bad();
  return call<{ added: number }>('POST', `/v1/obe/surveys/${surveyId}/ratings`, { ratings }, ['/obe/surveys']);
}
