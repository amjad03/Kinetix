'use server';

import { LMS_SOURCES } from '@/lib/lms';
import { optStr, read, send } from '@/lib/ops-server';
import type { Gradebook } from '@/lib/lms';

const L = '/v1/lms';
const id = encodeURIComponent;
type V = Record<string, string>;

export async function createCourse(v: V) {
  const [sectionId, subjectId] = (v.offering ?? '').split('|');
  return send(`${L}/courses`, { sectionId, subjectId, ...(optStr(v.title) ? { title: v.title } : {}), description: v.description ?? '' }, '/courses');
}

export async function setStatus(courseId: string, status: 'draft' | 'published') {
  return send(`${L}/courses/${id(courseId)}`, { status }, `/courses/${courseId}`, 'PATCH');
}

export async function addModule(courseId: string, v: V) {
  return send(`${L}/courses/${id(courseId)}/modules`, { title: v.title }, `/courses/${courseId}`);
}

export async function removeModule(courseId: string, moduleId: string) {
  return send(`${L}/modules/${id(moduleId)}`, undefined, `/courses/${courseId}`, 'DELETE');
}

export async function addItem(courseId: string, moduleId: string, v: V) {
  return send(`${L}/modules/${id(moduleId)}/items`, { kind: v.kind, title: v.title, ...(optStr(v.refId) ? { refId: v.refId } : {}), ...(optStr(v.url) ? { url: v.url } : {}) }, `/courses/${courseId}`);
}

export async function removeItem(courseId: string, itemId: string) {
  return send(`${L}/items/${id(itemId)}`, undefined, `/courses/${courseId}`, 'DELETE');
}

export async function announce(courseId: string, v: V) {
  return send(`${L}/courses/${id(courseId)}/announcements`, { title: v.title, body: v.body ?? '' }, `/courses/${courseId}`);
}

/** Up to four categories from rows `n1`/`s1`/`w1` …; empty rows are skipped. */
export async function saveCategories(courseId: string, v: V) {
  const categories = [1, 2, 3, 4, 5, 6].filter((i) => optStr(v[`n${i}`])).map((i) => ({ name: v[`n${i}`].trim(), source: v[`s${i}`] || LMS_SOURCES[0], weight: Number(v[`w${i}`]) }));
  return send(`${L}/courses/${id(courseId)}/categories`, { categories }, `/courses/${courseId}/gradebook`, 'PUT');
}

export async function overrideGrade(courseId: string, studentId: string, v: V) {
  return send(`${L}/courses/${id(courseId)}/overrides`, { studentId, categoryId: v.categoryId, percent: optStr(v.percent) ? Number(v.percent) : null, reason: v.reason }, `/courses/${courseId}/gradebook`, 'PUT');
}

export async function loadGradebook(courseId: string) {
  return read<Gradebook>(`${L}/courses/${id(courseId)}/gradebook`);
}
