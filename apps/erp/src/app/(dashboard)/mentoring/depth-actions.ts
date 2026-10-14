'use server';

import { read, send } from '@/lib/ops-server';
import type { LearnerRow, LearnerRules, MentorMessage } from '@/lib/life';

const PAGE = '/mentoring';
const id = encodeURIComponent;

export async function learnersOf(sectionId: string) {
  return read<{ rules: LearnerRules; students: LearnerRow[] }>(`/v1/mentoring/learners?sectionId=${id(sectionId)}`);
}
export async function saveLearnerRules(v: Record<string, string>) {
  return send('/v1/mentoring/learner-rules', { slowBelowPct: Number(v.slowBelowPct), advancedFromPct: Number(v.advancedFromPct), minAssessments: Number(v.minAssessments), attendanceBelowPct: Number(v.attendanceBelowPct || '0') }, PAGE, 'PUT');
}
export async function openPlans(studentIds: string[], v: Record<string, string>) {
  const actions = (v.actions ?? '').split('\n').map((x) => x.trim()).filter(Boolean);
  return send<{ created: number; skipped: { studentId: string; reason: string }[] }>('/v1/mentoring/learners/plans', { studentIds, goal: v.goal, actions, reviewOn: v.reviewOn }, PAGE);
}
export async function channelMessages(assignmentId: string) {
  return read<MentorMessage[]>(`/v1/mentoring/assignments/${id(assignmentId)}/messages`);
}
export async function sendMentorMessage(assignmentId: string, body: string) {
  return send<MentorMessage>(`/v1/mentoring/assignments/${id(assignmentId)}/messages`, { body }, PAGE);
}
