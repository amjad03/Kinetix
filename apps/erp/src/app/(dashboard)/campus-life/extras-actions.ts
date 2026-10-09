'use server';

import { getI18n } from '@/i18n/server';
import { optStr, read, send } from '@/lib/ops-server';
import { parseParticipants, type AchievementLogRow, type CertificateResult, type ClubAchievement, type EvidenceRow, type MediaRow, type OfficeBearer, type PickedFile } from '@/lib/pathways-b';

const PAGE = '/campus-life';
const C = '/v1/campus-life';
type V = Record<string, string>;
const id = encodeURIComponent;
const fail = async (key: 'pwb.err.linkOrFile' | 'pwb.err.linkTitle' | 'pwb.err.participants', vars?: Record<string, string | number>) => ({ ok: false as const, error: (await getI18n()).t(key, vars) });

// ---- club office bearers and achievements ----
export async function clubBearers(clubId: string) {
  return read<OfficeBearer[]>(`${C}/clubs/${id(clubId)}/office-bearers`);
}
export async function addBearer(clubId: string, v: V) {
  return send(`${C}/clubs/${id(clubId)}/office-bearers`, { studentId: v.studentId, post: v.post, fromOn: v.fromOn, ...(optStr(v.toOn) ? { toOn: v.toOn } : {}) }, PAGE);
}
export async function endBearer(bearerId: string) {
  return send(`${C}/office-bearers/${id(bearerId)}/end`, undefined, PAGE);
}
export async function clubAchievementsOf(clubId: string) {
  return read<ClubAchievement[]>(`${C}/clubs/${id(clubId)}/achievements`);
}
export async function allAchievements(level?: string) {
  return read<AchievementLogRow[]>(`${C}/achievements${level ? `?level=${id(level)}` : ''}`);
}
export async function addAchievement(clubId: string, roster: { studentId: string; fullName: string; rollNo: string }[], v: V) {
  const people = parseParticipants(v.participants ?? '', roster);
  if (!people.ok) return fail('pwb.err.participants', { line: people.line });
  return send(`${C}/clubs/${id(clubId)}/achievements`, { title: v.title, level: v.level || 'institutional', position: v.position ?? '', achievedOn: v.achievedOn, participants: people.participants, description: v.description ?? '' }, PAGE);
}

// ---- committee evidence and report pack ----
export async function committeeEvidence(committeeId: string) {
  return read<EvidenceRow[]>(`${C}/committees/${id(committeeId)}/evidence`);
}
export async function addEvidence(committeeId: string, v: V, file: PickedFile | null) {
  const url = optStr(v.url);
  if (!!url === !!file) return fail('pwb.err.linkOrFile');
  if (url && !optStr(v.title)) return fail('pwb.err.linkTitle');
  return send(
    `${C}/committees/${id(committeeId)}/evidence`,
    { kind: v.kind || 'document', ...(optStr(v.title) ? { title: v.title } : {}), ...(optStr(v.meetingId) ? { meetingId: v.meetingId } : {}), ...(url ? { url } : { file }) },
    PAGE,
  );
}
export async function removeEvidence(evidenceId: string) {
  return send(`${C}/evidence/${id(evidenceId)}`, undefined, PAGE, 'DELETE');
}

// ---- event certificates and media ----
export async function issueCertificates(eventId: string) {
  return send<CertificateResult>(`${C}/events/${id(eventId)}/certificates`, undefined, PAGE);
}
export async function eventMedia(eventId: string) {
  return read<MediaRow[]>(`${C}/events/${id(eventId)}/media`);
}
export async function addMedia(eventId: string, v: V, file: PickedFile | null) {
  const url = optStr(v.url);
  if (!!url === !!file) return fail('pwb.err.linkOrFile');
  return send(`${C}/events/${id(eventId)}/media`, { caption: v.caption ?? '', kind: v.kind || 'photo', ...(url ? { url } : { file }) }, PAGE);
}
export async function approveMedia(mediaId: string) {
  return send(`${C}/media/${id(mediaId)}/approve`, undefined, PAGE);
}
export async function removeMedia(mediaId: string) {
  return send(`${C}/media/${id(mediaId)}`, undefined, PAGE, 'DELETE');
}
