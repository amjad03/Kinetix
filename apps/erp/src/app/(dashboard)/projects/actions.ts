'use server';

import { optNum, optStr, read, send } from '@/lib/ops-server';
import { parseIndicators, parsePanel, parseRubric, splitList, uploadType, MAX_UPLOAD_BYTES, type ImpactDashboard, type JoinRequest, type ProjectComment, type ProjectReview, type TeamMatch } from '@/lib/pathways-a';
import { failure, parseFailure } from '@/lib/pathways-server';

const PAGE = '/projects';
const id = encodeURIComponent;
const ws = (projectId: string) => `/projects/${projectId}`;
type V = Record<string, string>;

// ---- impact ----------------------------------------------------------------------------------

export async function saveFramework(v: V, existingId?: string) {
  const r = parseIndicators(v.indicators ?? '');
  if (!r.ok) return parseFailure(r);
  if (existingId) return send(`/v1/impact/frameworks/${id(existingId)}`, { name: v.name, description: v.description ?? '', indicators: r.value, active: v.active !== 'no' }, PAGE, 'PUT');
  return send('/v1/impact/frameworks', { code: v.code, name: v.name, description: v.description ?? '', indicators: r.value }, PAGE);
}

export async function recordImpact(frameworkId: string, v: V) {
  const quantity = Number(v.quantity);
  if (!Number.isFinite(quantity) || quantity < 0) return failure('pw.err.number');
  return send('/v1/impact/records', { frameworkId, indicatorCode: v.indicatorCode, subjectKind: v.subjectKind, subjectRef: v.subjectRef ?? '', quantity, note: v.note ?? '', recordedOn: v.recordedOn }, PAGE);
}

export async function frameworkDashboard(frameworkId: string) {
  return read<ImpactDashboard>(`/v1/impact/frameworks/${id(frameworkId)}/dashboard`);
}

// ---- the project workspace --------------------------------------------------------------------

export async function addProjectLink(projectId: string, v: V) {
  return send(`/v1/projects/${id(projectId)}/files`, { title: v.title, kind: 'link', url: v.url }, ws(projectId));
}

/** A small file sent as base64 in the body (the API takes up to 4 MB). */
export async function uploadProjectFile(projectId: string, file: { name: string; type: string; size: number; base64: string }, title: string) {
  if (file.size > MAX_UPLOAD_BYTES) return failure('pw.err.fileSize');
  const contentType = uploadType(file.name, file.type);
  if (!contentType) return failure('pw.err.fileType');
  return send(`/v1/projects/${id(projectId)}/files`, { kind: 'file', ...(optStr(title) ? { title: title.trim() } : {}), file: { filename: file.name, contentType, contentBase64: file.base64 } }, ws(projectId));
}

export async function removeProjectFile(projectId: string, fileId: string) {
  return send(`/v1/projects/files/${id(fileId)}`, undefined, ws(projectId), 'DELETE');
}

export async function projectComments(projectId: string) {
  return read<ProjectComment[]>(`/v1/projects/${id(projectId)}/comments`);
}

export async function postComment(projectId: string, v: V, parentId?: string) {
  return send(`/v1/projects/${id(projectId)}/comments`, { body: v.body, ...(parentId ? { parentId } : {}) }, ws(projectId));
}

export async function projectReviews(projectId: string) {
  return read<ProjectReview[]>(`/v1/projects/${id(projectId)}/reviews`);
}

export async function postReview(projectId: string, v: V) {
  const max = Number(v.maxPerCriterion || 5);
  if (!Number.isInteger(max) || max < 1 || max > 10) return failure('pw.err.number');
  const r = parseRubric(v.rubric ?? '', max);
  if (!r.ok) return parseFailure(r);
  return send(`/v1/projects/${id(projectId)}/reviews`, { kind: v.kind || 'mentor', rubric: r.value, maxPerCriterion: max, comment: v.comment ?? '' }, ws(projectId));
}

export async function scheduleViva(projectId: string, v: V) {
  const panel = parsePanel(v.panel ?? '');
  if (panel.length === 0) return parseFailure({ ok: false, code: 'empty', line: 0 });
  return send(`/v1/projects/${id(projectId)}/viva`, { scheduledAt: v.scheduledAt, venue: v.venue ?? '', panel }, ws(projectId));
}

export async function recordViva(projectId: string, vivaId: string, v: V) {
  return send(`/v1/projects/viva/${id(vivaId)}/result`, { outcome: v.outcome, ...(optNum(v.score) !== undefined ? { score: optNum(v.score) } : {}), remarks: v.remarks ?? '' }, ws(projectId));
}

export async function saveHub(projectId: string, v: V) {
  return send(`/v1/projects/${id(projectId)}/hub`, { showcase: v.showcase === 'yes', summary: v.summary ?? '', recruiting: v.recruiting === 'yes', lookingFor: splitList(v.lookingFor ?? ''), openings: optNum(v.openings) ?? 0 }, ws(projectId), 'PUT');
}

export async function joinRequests(projectId: string) {
  return read<JoinRequest[]>(`/v1/projects/${id(projectId)}/requests`);
}

export async function decideRequest(projectId: string, requestId: string, accept: boolean) {
  return send(`/v1/projects/requests/${id(requestId)}/decide`, { accept }, ws(projectId));
}

export async function teamMatches(projectId: string) {
  return read<TeamMatch[]>(`/v1/projects/${id(projectId)}/matches`);
}
