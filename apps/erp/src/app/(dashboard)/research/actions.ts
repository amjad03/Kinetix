'use server';

import { optStr, read, send } from '@/lib/ops-server';
import { MAX_UPLOAD_BYTES, parseExaminers, parsePanel, splitList, uploadType, type ThesisDetail } from '@/lib/pathways-a';
import { failure, parseFailure } from '@/lib/pathways-server';

const PAGE = '/research';
const BASE = '/v1/research';
const id = encodeURIComponent;
type V = Record<string, string>;

export async function setCapacity(userId: string, v: V) {
  const maxScholars = Number(v.maxScholars);
  if (!Number.isInteger(maxScholars)) return failure('pw.err.number');
  return send(`${BASE}/supervisors/${id(userId)}`, { maxScholars, areas: splitList(v.areas ?? '') }, PAGE, 'PUT');
}

export async function allocateScholar(v: V) {
  return send(`${BASE}/scholars/${id(v.scholarId)}/allocate`, { supervisorUserId: v.supervisorUserId, role: v.role || 'supervisor', reason: v.reason ?? '' }, PAGE);
}

export async function thesisDetail(thesisId: string) {
  return read<ThesisDetail>(`${BASE}/theses/${id(thesisId)}`);
}

export async function runSimilarity(thesisId: string) {
  return send(`${BASE}/theses/${id(thesisId)}/similarity`, undefined, PAGE);
}

export async function moveStage(thesisId: string, v: V) {
  return send(`${BASE}/theses/${id(thesisId)}/stage`, { to: v.to, note: v.note ?? '', overrideSimilarity: v.override === 'yes' }, PAGE);
}

export async function setExaminers(thesisId: string, v: V) {
  const r = parseExaminers(v.examiners ?? '');
  if (!r.ok) return parseFailure(r);
  return send(`${BASE}/theses/${id(thesisId)}/examiners`, { examiners: r.value }, PAGE, 'PUT');
}

export async function scheduleThesisViva(thesisId: string, v: V) {
  const panel = parsePanel(v.panel ?? '').map((p) => ({ name: p.name, role: 'examiner' }));
  if (panel.length === 0) return parseFailure({ ok: false, code: 'empty', line: 0 });
  return send(`${BASE}/theses/${id(thesisId)}/vivas`, { kind: v.kind || 'open_defence', scheduledAt: v.scheduledAt, venue: v.venue ?? '', panel }, PAGE);
}

export async function recordThesisViva(vivaId: string, v: V) {
  return send(`${BASE}/thesis-vivas/${id(vivaId)}/result`, { outcome: v.outcome, remarks: v.remarks ?? '' }, PAGE);
}

export async function addDataset(v: V) {
  return send(
    `${BASE}/datasets`,
    { title: v.title, description: v.description ?? '', license: optStr(v.license) ?? 'CC-BY-4.0', access: v.access || 'restricted', ...(optStr(v.embargoUntil) ? { embargoUntil: v.embargoUntil } : {}), ...(optStr(v.doi) ? { doi: v.doi.trim() } : {}), keywords: splitList(v.keywords ?? '') },
    PAGE,
  );
}

/** A small file added to a dataset, sent as base64 in the body (the API takes up to 4 MB; video is not accepted here). */
export async function uploadDatasetFile(datasetId: string, file: { name: string; type: string; size: number; base64: string }) {
  if (file.size > MAX_UPLOAD_BYTES) return failure('pw.err.fileSize');
  const contentType = uploadType(file.name, file.type);
  if (!contentType || contentType === 'video/mp4') return failure('pw.err.fileType');
  return send(`${BASE}/datasets/${id(datasetId)}/files`, { filename: file.name, contentType, contentBase64: file.base64 }, PAGE);
}

/** Records a publication from its DOI; the title that came back is shown in the toast. */
export async function importDoi(v: V) {
  return send<{ title: string }>(`${BASE}/publications/import-doi`, { doi: v.doi }, PAGE);
}
