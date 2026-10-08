'use server';

import { read, send } from '@/lib/ops-server';
import type { MentoringSession } from '@/lib/quality';

const PAGE = '/mentoring';
const M = '/v1/mentoring';
const id = encodeURIComponent;

/** Shares the unassigned students of a class among the chosen mentors (the form has up to three). */
export async function assignByClass(v: Record<string, string>) {
  const mentorUserIds = [v.mentor1, v.mentor2, v.mentor3].filter((x) => x && x.trim());
  return send(`${M}/assignments/bulk`, { sectionId: v.sectionId, mentorUserIds }, PAGE);
}

export async function changeMentor(studentId: string, v: Record<string, string>) {
  return send(`${M}/assignments`, { studentId, mentorUserId: v.mentorUserId }, PAGE);
}

export async function endAssignment(assignmentId: string) {
  return send(`${M}/assignments/${id(assignmentId)}/end`, undefined, PAGE);
}

/** Sessions of one student, read when the dialog opens (private notes arrive only for those allowed to see them). */
export async function loadSessions(studentId: string) {
  return read<MentoringSession[]>(`${M}/sessions?studentId=${id(studentId)}`);
}
