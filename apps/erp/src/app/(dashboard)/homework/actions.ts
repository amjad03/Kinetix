'use server';

import { read, send } from '@/lib/ops-server';
import { zonedIso, type ComplianceRow, type HomeworkSettings, type QuizAnalysis, type QuizAttemptRow, type QuizDetail, type SubmissionRow } from '@/lib/life';
import { TIMEZONE } from '@/lib/school';

const PAGE = '/homework';
const id = encodeURIComponent;
type V = Record<string, string>;

// ---- assignments ----
export async function homeworkSettings(homeworkId: string) {
  return read<HomeworkSettings>(`/v1/homework/${id(homeworkId)}/settings`);
}
export async function saveHomeworkSettings(homeworkId: string, v: V) {
  return send(`/v1/homework/${id(homeworkId)}/settings`, {
    maxMarks: v.maxMarks ? Number(v.maxMarks) : null,
    latePolicy: v.latePolicy || 'accept',
    latePenaltyPct: Number(v.latePenaltyPct || '0'),
    cutoffOn: v.cutoffOn || null,
    maxAttempts: Number(v.maxAttempts || '1'),
  }, PAGE, 'PUT');
}
export async function grantExtension(homeworkId: string, studentId: string, v: V) {
  return send(`/v1/homework/${id(homeworkId)}/extensions/${id(studentId)}`, { dueOn: v.dueOn, reason: v.reason ?? '' }, PAGE, 'PUT');
}
export async function withdrawExtension(homeworkId: string, studentId: string) {
  return send(`/v1/homework/${id(homeworkId)}/extensions/${id(studentId)}`, undefined, PAGE, 'DELETE');
}
export async function saveGroups(homeworkId: string, groups: { name: string; studentIds: string[] }[]) {
  return send(`/v1/homework/${id(homeworkId)}/groups`, { groups }, PAGE, 'PUT');
}
export async function submissionsOf(homeworkId: string) {
  return read<{ students: SubmissionRow[] }>(`/v1/homework/${id(homeworkId)}/submissions`);
}
export async function saveMarks(homeworkId: string, entries: { studentId: string; marks: number | null }[]) {
  return send(`/v1/homework/${id(homeworkId)}/marks`, { entries }, PAGE, 'PUT');
}
export async function pushMarks(homeworkId: string) {
  return send<{ assessmentId: string; students: number; unmarked: number }>(`/v1/homework/${id(homeworkId)}/push-marks`, {}, PAGE);
}
export async function compliance(sectionId: string) {
  return read<{ students: number; assignments: ComplianceRow[] }>(`/v1/lms/reports/assignments?sectionId=${id(sectionId)}`);
}

// ---- quizzes ----
export async function addQuiz(v: V) {
  return send<{ id: string }>('/v1/lms/quizzes', {
    sectionId: v.sectionId,
    subjectId: v.subjectId,
    title: v.title,
    instructions: v.instructions ?? '',
    opensAt: zonedIso(v.opensAt, TIMEZONE),
    closesAt: zonedIso(v.closesAt, TIMEZONE),
    durationMin: Number(v.durationMin || '30'),
    maxAttempts: Number(v.maxAttempts || '1'),
    drawCount: v.drawCount ? Number(v.drawCount) : null,
    shuffle: v.shuffle !== 'no',
  }, PAGE);
}
export async function quizDetail(quizId: string) {
  return read<QuizDetail>(`/v1/lms/quizzes/${id(quizId)}`);
}
export async function addQuestion(quizId: string, body: Record<string, unknown>) {
  return send(`/v1/lms/quizzes/${id(quizId)}/questions`, body, PAGE);
}
export async function dropQuestion(questionId: string) {
  return send(`/v1/lms/quiz-questions/${id(questionId)}`, undefined, PAGE, 'DELETE');
}
export async function quizStep(quizId: string, step: 'publish' | 'close') {
  return send(`/v1/lms/quizzes/${id(quizId)}/${step}`, {}, PAGE);
}
export async function quizAttempts(quizId: string) {
  return read<QuizAttemptRow[]>(`/v1/lms/quizzes/${id(quizId)}/attempts`);
}
export async function markAnswer(attemptId: string, questionId: string, marks: number) {
  return send(`/v1/lms/quiz-attempts/${id(attemptId)}/mark`, { questionId, marks }, PAGE, 'PUT');
}
export async function quizAnalysis(quizId: string) {
  return read<QuizAnalysis>(`/v1/lms/quizzes/${id(quizId)}/analysis`);
}
