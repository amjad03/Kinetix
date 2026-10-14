'use server';

import { optNum, optStr, read, send } from '@/lib/ops-server';
import type { MetricDetail } from '@/lib/accreditation-ui';
import type { PickedFile } from '@/lib/pathways-b';

const FW = /^[a-z0-9-]{3,30}$/;
const CODE = /^[A-Za-z0-9.-]{1,24}$/;
const UUID = /^[0-9a-f-]{36}$/i;
const bad = (error = 'Not found') => ({ ok: false as const, error });
const blob = (f: PickedFile | null) => (f ? { file: { filename: f.filename, contentType: f.contentType, contentBase64: f.contentBase64 } } : {});
const page = (fw: string) => `/accreditation/${fw}`;
const metricPage = (fw: string, code: string) => `/accreditation/${fw}/metrics/${code}`;

export interface MetricPatch {
  year?: string;
  value?: number | null;
  inputs?: Record<string, number | null>;
  rows?: string[][];
  options?: number[] | null;
  textValue?: string;
  selfScore?: number | null;
  note?: string;
}

/** Saves a metric's entries for one academic year (inputs, figure, rows, options, narrative, own marking). */
export async function saveMetric(fw: string, code: string, cycle: string, patch: MetricPatch) {
  if (!FW.test(fw) || !CODE.test(code)) return bad();
  return send(`/v1/accreditation/${fw}/metrics/${encodeURIComponent(code)}`, { cycle, ...patch }, metricPage(fw, code), 'PUT');
}

/** Reloads a metric (after an import, to refresh the grid). */
export async function loadMetric(fw: string, code: string, cycle: string) {
  if (!FW.test(fw) || !CODE.test(code)) return bad();
  return read<MetricDetail>(`/v1/accreditation/${fw}/metrics/${encodeURIComponent(code)}?cycle=${encodeURIComponent(cycle)}`);
}

/** Adds evidence (a link, a note or a file) to a metric for one academic year. */
export async function addEvidence(fw: string, code: string, cycle: string, v: Record<string, string>, file: PickedFile | null) {
  if (!FW.test(fw) || !CODE.test(code)) return bad();
  return send(`/v1/accreditation/${fw}/metrics/${encodeURIComponent(code)}/evidence`, { cycle, ...(v.year ? { year: v.year } : {}), title: v.title, ...(optStr(v.url) ? { url: v.url.trim() } : {}), ...(optStr(v.note) ? { note: v.note } : {}), ...blob(file) }, metricPage(fw, code));
}

export async function removeEvidence(fw: string, code: string, id: string) {
  if (!FW.test(fw) || !CODE.test(code) || !UUID.test(id)) return bad();
  return send(`/v1/accreditation/evidence/${id}`, undefined, metricPage(fw, code), 'DELETE');
}

/** Imports a filled data template (.xlsx). */
export async function importTemplate(fw: string, code: string, cycle: string, v: Record<string, string>, file: PickedFile | null) {
  if (!FW.test(fw) || !CODE.test(code)) return bad();
  if (!file) return bad('Choose the filled template');
  return send<{ stored: Record<string, { rows: number; inputs: number; options?: number }>; skipped: string[] }>(`/v1/accreditation/${fw}/metrics/${encodeURIComponent(code)}/import`, { cycle, ...(v.year ? { year: v.year } : {}), ...blob(file) }, metricPage(fw, code));
}

export async function addComment(fw: string, code: string, cycle: string, body: string) {
  if (!FW.test(fw) || !CODE.test(code)) return bad();
  return send(`/v1/accreditation/${fw}/metrics/${encodeURIComponent(code)}/comments`, { cycle, body }, metricPage(fw, code));
}

/** Assigns a metric or criterion; `back` is the page to refresh. */
export async function assignTask(fw: string, cycle: string, v: Record<string, string>, back?: string) {
  if (!FW.test(fw)) return bad();
  return send(`/v1/accreditation/${fw}/tasks`, { cycle, scope: v.scope, ...(v.ownerId ? { ownerId: v.ownerId } : {}), ...(v.reviewerId ? { reviewerId: v.reviewerId } : {}), ...(v.departmentId ? { departmentId: v.departmentId } : {}), ...(v.dueOn ? { dueOn: v.dueOn } : {}), note: v.note ?? '' }, back ?? page(fw));
}

export async function updateTask(fw: string, id: string, v: { status?: string; note?: string }, back?: string) {
  if (!FW.test(fw) || !UUID.test(id)) return bad();
  return send(`/v1/accreditation/tasks/${id}`, v, back ?? page(fw), 'PUT');
}

export async function removeTask(fw: string, id: string) {
  if (!FW.test(fw) || !UUID.test(id)) return bad();
  return send(`/v1/accreditation/tasks/${id}`, undefined, page(fw), 'DELETE');
}

export async function sendReminders(fw: string, cycle: string) {
  if (!FW.test(fw)) return bad();
  return send<{ sent: number }>(`/v1/accreditation/${fw}/tasks/remind?cycle=${encodeURIComponent(cycle)}`, {}, page(fw));
}

/** Records a DVV clarification against a metric. */
export async function raiseDvv(fw: string, cycle: string, v: Record<string, string>) {
  if (!FW.test(fw)) return bad();
  return send('/v1/accreditation/dvv', { framework: fw, cycle, metricCode: v.metricCode, query: v.query, deviation: v.deviation || 'other', ...(optNum(v.heiValue) !== undefined ? { heiValue: optNum(v.heiValue) } : {}), ...(optNum(v.dvvValue) !== undefined ? { dvvValue: optNum(v.dvvValue) } : {}), ...(v.dueOn ? { dueOn: v.dueOn } : {}) }, page(fw));
}

/** Responds to, decides or closes a DVV clarification. */
export async function updateDvv(fw: string, id: string, v: { response?: string; status?: string; dvvValue?: number | null }) {
  if (!FW.test(fw) || !UUID.test(id)) return bad();
  return send(`/v1/accreditation/dvv/${id}`, v, page(fw), 'PUT');
}

export async function addDvvDocument(fw: string, id: string, v: Record<string, string>, file: PickedFile | null) {
  if (!FW.test(fw) || !UUID.test(id)) return bad();
  return send(`/v1/accreditation/dvv/${id}/documents`, { title: v.title, ...(optStr(v.url) ? { url: v.url.trim() } : {}), ...blob(file) }, page(fw));
}

/** Benchmark overrides (for example NIRF category leaders). */
export async function saveSettings(fw: string, bench: Record<string, number>) {
  if (!FW.test(fw)) return bad();
  return send(`/v1/accreditation/${fw}/settings`, { bench }, page(fw), 'PUT');
}

/** A teacher's own evidence, with an optional file. */
export async function addMyEvidence(v: Record<string, string>, file: PickedFile | null) {
  return send('/v1/accreditation/my-evidence', { kind: v.kind, title: v.title, venue: v.venue ?? '', ...(optNum(v.year) !== undefined ? { year: optNum(v.year) } : {}), ...(optStr(v.url) ? { url: v.url } : {}), ...blob(file) }, '/accreditation/my-evidence');
}
