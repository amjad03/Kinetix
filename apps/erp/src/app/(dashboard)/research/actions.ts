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

/**
 * Records a publication from its DOI; when the registry cannot be reached and the typed-in title, venue and year are
 * given, it is kept as pending and completed later (the answer says which).
 */
export async function addByDoi(v: V) {
  const year = Number(v.year);
  const fallback = optStr(v.title) && optStr(v.venue) && Number.isInteger(year) ? { title: v.title.trim(), venue: v.venue.trim(), year, kind: v.kind || 'journal' } : undefined;
  return send<{ title: string; lookup: string }>(`${BASE}/publications/import-doi`, { doi: v.doi ?? '', ...(fallback ? { fallback } : {}) }, PAGE);
}

/** Fills in the publications recorded while the DOI registry was unreachable. */
export async function refreshPendingDois() {
  return send<{ checked: number; updated: number; stillPending: number; registryOffline: boolean }>(`${BASE}/publications/refresh-pending`, undefined, PAGE);
}

/** Claims an incentive for one's own publication or patent under a scheme. */
export async function claimIncentive(v: V) {
  const subject = v.subject ?? '';
  const [kind, subjectId] = subject.split(':');
  return send<{ amountPaise: number; basis: string }>(`${BASE}/incentives/claims`, { schemeId: v.schemeId, ...(kind === 'patent' ? { patentId: subjectId } : { publicationId: subjectId }) }, PAGE);
}

/** Records the e-copy deposit of an awarded thesis with Shodhganga. */
export async function depositShodhganga(thesisId: string, v: V) {
  return send(`${BASE}/theses/${id(thesisId)}/shodhganga`, { handle: v.handle ?? '', depositedOn: v.depositedOn }, PAGE);
}

/** Records the report of the university's plagiarism detection software for a thesis. */
export async function recordSimilarityReport(thesisId: string, v: V) {
  return send(`${BASE}/theses/${id(thesisId)}/similarity/external`, { engine: v.engine || 'urkund', scorePercent: Number(v.scorePercent), reportRef: v.reportRef ?? '', ...(optStr(v.reportUrl) ? { reportUrl: v.reportUrl.trim() } : {}) }, PAGE);
}

/** Records the public works of an ORCID iD for a teacher (yourself when none is chosen). */
export async function importOrcid(v: V) {
  return send<{ found: number; added: number; skipped: number; incomplete: number }>(`${BASE}/publications/import-orcid`, { orcid: v.orcid ?? '', ...(optStr(v.ownerUserId) ? { ownerUserId: v.ownerUserId } : {}) }, PAGE);
}
