'use server';

import type { MarkStatus } from '@/lib/attendance-desk';
import { revalidatePath } from 'next/cache';
import { act, api } from '@/lib/api';
import { read, send } from '@/lib/ops-server';

/** Server actions of the attendance desk pages. Each returns `{ ok, data | error }` and refreshes its page. */

const enc = encodeURIComponent;
type Marks = { studentId: string; status: MarkStatus }[];

/** Saves a timetable period's marks (the same endpoint the Teacher App uses). */
export async function savePeriod(slotId: string, date: string, records: Marks) {
  return send('/v1/attendance', { slotId, date, records }, '/attendance/mark');
}

/** Saves a class's whole-day or forenoon/afternoon marks. */
export async function saveDay(sectionId: string, date: string, session: 'fn' | 'an' | null, records: Marks) {
  return send('/v1/attendance-desk/day', { sectionId, date, session, records }, '/attendance/mark');
}

export async function saveSpecial(id: string, records: Marks) {
  return send(`/v1/attendance-desk/special/${enc(id)}`, { records }, '/attendance/mark');
}

/** Copies one period's marks to other periods of the class that day. */
export async function copyMarks(fromSlotId: string, date: string, toSlotIds: string[]) {
  return send<{ results: { slotId: string; copied: number }[] }>('/v1/attendance-desk/copy', { fromSlotId, date, toSlotIds }, '/attendance/mark');
}

/** Asks for a change to a locked register (a head of department decides). */
export async function requestCorrection(slotId: string, date: string, studentId: string, toStatus: MarkStatus, reason: string) {
  return send('/v1/attendance/corrections', { slotId, date, studentId, toStatus, reason }, '/attendance/mark');
}

export async function remindUnmarked(items: { slotId: string; date: string }[]) {
  return send<{ reminded: number }>('/v1/attendance-desk/unmarked/remind', { items }, '/attendance/unmarked');
}

/** On duty for a group of students in one go (approved at once when `approve` and the person may decide). */
export async function recordOnDuty(b: { studentIds: string[]; fromDate: string; toDate: string; fromTime?: string; toTime?: string; activity: string; reason: string; approve: boolean }) {
  return send<{ created: number; results: { studentId: string; ok: boolean; message?: string }[] }>('/v1/attendance-desk/leaves/on-duty', b, '/attendance/leave');
}

/** The active students of a class, for pickers. */
export async function classRoster(sectionId: string) {
  return read<{ section: { id: string; name: string }; students: { id: string; rollNo: string; fullName: string; batch: string | null }[] }>(`/v1/academic-planning/batches?sectionId=${enc(sectionId)}`);
}

export async function sendShortageAlerts(sectionIds?: string[]) {
  return send<{ students: number; recipients: number }>('/v1/attendance-desk/alerts/run', sectionIds?.length ? { sectionIds } : {}, '/attendance/eligibility');
}

/** Asks for condonation for a student (staff), optionally for one subject. */
export async function askCondonation(studentId: string, subjectId: string | null, kind: 'medical' | 'other', reason: string) {
  const form = new FormData();
  form.set('studentId', studentId);
  if (subjectId) form.set('subjectId', subjectId);
  form.set('kind', kind);
  form.set('reason', reason);
  const res = await act(() => api('/v1/attendance/condonations', { method: 'POST', form }));
  if (res.ok) revalidatePath('/attendance/eligibility');
  return res;
}
