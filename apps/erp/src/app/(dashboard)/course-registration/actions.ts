'use server';

import { getI18n } from '@/i18n/server';
import { optStr as opt, read, send } from '@/lib/ops-server';
import { parseCredits, parseIdList, parseIntList, type RosterRow } from '@/lib/course-registration';

const PAGE = '/course-registration';
type V = Record<string, string>;
const BASE = '/v1/course-registration';

export async function createOffering(termId: string, v: V) {
  const credits = parseCredits(v.credits ?? '');
  if (credits === null) return { ok: false as const, error: (await getI18n()).t('cr.err.credits') };
  const semesters = parseIntList(v.semesters ?? '');
  if (semesters === null) return { ok: false as const, error: (await getI18n()).t('cr.err.semesters') };
  return send(
    `${BASE}/offerings`,
    {
      termId,
      subjectId: v.subjectId,
      category: v.category,
      credits,
      seatCap: Number(v.seatCap),
      facultyId: opt(v.facultyId) ?? null,
      slotIds: parseIdList(v.slotIds ?? ''),
      eligibleSemesters: semesters.length ? semesters : null,
      prerequisiteSubjectId: opt(v.prerequisiteSubjectId) ?? null,
    },
    PAGE,
  );
}

export async function setOfferingStatus(id: string, status: 'open' | 'closed', version: number) {
  return send(`${BASE}/offerings/${encodeURIComponent(id)}`, { status, expectedVersion: version }, PAGE, 'PATCH');
}

export async function saveWindow(termId: string, v: V) {
  return send(
    `${BASE}/windows`,
    { termId, programId: opt(v.programId) ?? null, opensAt: v.opensAt, closesAt: v.closesAt, addDropUntil: v.addDropUntil, minCredits: Number(v.minCredits || 0), maxCredits: Number(v.maxCredits), allocationRule: v.allocationRule || 'cgpa' },
    PAGE,
    'PUT',
  );
}

export async function allocate(termId: string) {
  return send<{ allocated: number; waitlisted: number; notAllotted: number }>(`${BASE}/allocate`, { termId }, PAGE);
}

export async function decide(ids: string[], decision: 'approved' | 'rejected') {
  return send(`${BASE}/approvals/decide`, { registrationIds: ids, decision }, PAGE);
}

export async function loadRoster(offeringId: string) {
  return read<{ students: RosterRow[] }>(`${BASE}/offerings/${encodeURIComponent(offeringId)}/roster`);
}
