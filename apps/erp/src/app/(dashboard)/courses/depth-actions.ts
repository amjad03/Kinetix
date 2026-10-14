'use server';

import { read, send } from '@/lib/ops-server';
import type { StudentPick } from '@/lib/life';

const id = encodeURIComponent;

export interface CourseAnalytics {
  courseId: string;
  items: { id: string; title: string; kind: string; module: string; views: number; students: number; completed: number; reachPct: number }[];
  students: { id: string; fullName: string; rollNo: string; opened: number; completed: number; engagementPct: number; lastActiveAt: string | null }[];
}

/** Release date (ISO or empty), prerequisite item (or empty) and the students it is for (empty = everyone). */
export async function saveItemAccess(courseId: string, itemId: string, v: { releaseAt: string; prerequisiteItemId: string; audienceStudentIds: string[] }) {
  return send(`/v1/lms/items/${id(itemId)}/access`, { releaseAt: v.releaseAt || null, prerequisiteItemId: v.prerequisiteItemId || null, audienceStudentIds: v.audienceStudentIds.length ? v.audienceStudentIds : null }, `/courses/${courseId}`, 'PATCH');
}
export async function assignSlowLearners(courseId: string, itemId: string) {
  return send<{ students: number }>(`/v1/lms/items/${id(itemId)}/assign-slow-learners`, {}, `/courses/${courseId}`);
}
export async function courseAnalytics(courseId: string) {
  return read<CourseAnalytics>(`/v1/lms/courses/${id(courseId)}/analytics`);
}
export async function classStudents(sectionId: string) {
  return read<{ rows: StudentPick[] }>(`/v1/records/students?f.section=${id(sectionId)}&pageSize=200&sort=roll:asc`);
}
