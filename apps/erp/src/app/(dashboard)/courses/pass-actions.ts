'use server';

import { optStr, read, send } from '@/lib/ops-server';
import { itemSource, settingsFromForm, type ItemKind, type LiveAttendance } from '@/lib/lms-pass';

const L = '/v1/lms';
const id = encodeURIComponent;
type V = Record<string, string>;
const num = (s: string | undefined) => (optStr(s) ? Number(s) : undefined);

/** Adds an item of any kind: lesson text for a page, an address for files and links, a record id for the rest. */
export async function addPassItem(courseId: string, moduleId: string, v: V) {
  const kind = v.kind as ItemKind;
  const src = itemSource(kind);
  return send(
    `${L}/modules/${id(moduleId)}/items`,
    {
      kind,
      title: v.title,
      ...(src === 'body' ? { body: v.body ?? '' } : {}),
      ...(src === 'url' && optStr(v.url) ? { url: v.url } : {}),
      ...(src === 'ref' && optStr(v.refId) ? { refId: v.refId } : {}),
      ...(optStr(v.completionRule) ? { completionRule: v.completionRule } : {}),
      ...(num(v.passPct) !== undefined ? { passPct: num(v.passPct) } : {}),
      ...(num(v.durationMin) !== undefined ? { durationMin: num(v.durationMin) } : {}),
    },
    `/courses/${courseId}`,
  );
}

export async function editItem(courseId: string, itemId: string, v: V) {
  return send(`${L}/items/${id(itemId)}`, { ...(optStr(v.title) ? { title: v.title } : {}), ...(v.body !== undefined && optStr(v.body) ? { body: v.body } : {}), ...(optStr(v.completionRule) ? { completionRule: v.completionRule } : {}), passPct: num(v.passPct) ?? null, ...(num(v.durationMin) !== undefined ? { durationMin: num(v.durationMin) } : {}) }, `/courses/${courseId}`, 'PATCH');
}

/** Moves an item one place up or down in its module (the whole order is sent, as the API asks). */
export async function moveItem(courseId: string, modules: { id: string; itemIds: string[] }[]) {
  return send(`${L}/courses/${id(courseId)}/order`, { modules }, `/courses/${courseId}`, 'PUT');
}

export async function saveCompletion(courseId: string, v: V) {
  return send(`${L}/courses/${id(courseId)}/completion`, { completionPct: Number(v.completionPct), minGradePct: num(v.minGradePct) ?? null, certificate: v.certificate === 'yes' }, `/courses/${courseId}`, 'PATCH');
}

export async function scheduleLive(courseId: string, v: V) {
  return send(`${L}/courses/${id(courseId)}/live`, { title: v.title, startsAt: v.startsAt, durationMin: Number(v.durationMin), joinUrl: v.joinUrl, notify: true }, `/courses/${courseId}`);
}
export async function cancelLive(courseId: string, liveId: string) {
  return send(`${L}/live/${id(liveId)}`, { status: 'cancelled' }, `/courses/${courseId}`, 'PATCH');
}
export async function liveAttendance(liveId: string) {
  return read<LiveAttendance>(`${L}/live/${id(liveId)}/attendance`);
}
export async function confirmLive(courseId: string, liveId: string, entries: { studentId: string; status: string }[]) {
  return send(`${L}/live/${id(liveId)}/attendance`, { entries }, `/courses/${courseId}`);
}

export async function issueCertificates(courseId: string) {
  return send<{ issued: number; skipped: { studentId: string; reason: string }[] }>(`${L}/courses/${id(courseId)}/certificates`, {}, `/courses/${courseId}`);
}
export async function revokeCertificate(courseId: string, certId: string, v: V) {
  return send(`${L}/lms-certificates/${id(certId)}/revoke`, { reason: v.reason }, `/courses/${courseId}`);
}

export async function moderate(courseId: string, kind: 'thread' | 'post', itemId: string, action: 'approve' | 'hide' | 'dismiss') {
  return send(`${L}/forum/moderation`, { kind, id: itemId, action }, `/courses/${courseId}`);
}

export async function saveLmsSettings(v: V) {
  return send(`${L}/settings`, settingsFromForm(v), '/courses/insights', 'PUT');
}

export async function createPath(v: V, courseIds: string[]) {
  return send(`${L}/paths`, { title: v.title, description: v.description ?? '', certificate: v.certificate === 'yes', steps: courseIds.map((courseId, i) => ({ courseId, required: i === 0 || v.allRequired === 'yes' })) }, '/courses/insights');
}
export async function setPathStatus(pathId: string, status: 'draft' | 'published' | 'archived') {
  return send(`${L}/paths/${id(pathId)}`, { status }, '/courses/insights', 'PATCH');
}
