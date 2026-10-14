'use server';

import { read, send } from '@/lib/ops-server';

/** Server actions of Academics → Planning and Timetable → Setup. */

const enc = encodeURIComponent;

export interface BasketCourse {
  id: string;
  code: string;
  name: string;
  credits: number | null;
  courseType: string;
  program: string;
  term: number;
  chosen: boolean;
  sameTerm: boolean;
}

export async function basketCourses(basketId: string) {
  return read<{ subjects: BasketCourse[] }>(`/v1/academic-planning/baskets/${enc(basketId)}/subjects`);
}

export async function setBasketCourses(basketId: string, subjectIds: string[]) {
  return send<{ count: number }>(`/v1/academic-planning/baskets/${enc(basketId)}/subjects`, { subjectIds }, '/academics/planning', 'PUT');
}

export async function saveBatches(sectionId: string, assignments: { studentId: string; batch: string | null }[]) {
  return send<{ saved: number }>('/v1/academic-planning/batches', { sectionId, assignments }, '/timetable/setup', 'PUT');
}

export async function splitBatches(sectionId: string, count: number, prefix: string) {
  return send<{ batches: number; students: number }>('/v1/academic-planning/batches/split', { sectionId, count, prefix }, '/timetable/setup');
}
