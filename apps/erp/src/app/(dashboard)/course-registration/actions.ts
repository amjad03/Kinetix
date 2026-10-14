'use server';

import { optStr as opt, read, send } from '@/lib/ops-server';
import type { RosterRow } from '@/lib/course-registration';

const PAGE = '/course-registration';
type V = Record<string, string>;
const BASE = '/v1/course-registration';

export async function saveWindow(termId: string, v: V) {
  return send(
    `${BASE}/windows`,
    { termId, programId: opt(v.programId) ?? null, opensAt: v.opensAt, closesAt: v.closesAt, addDropUntil: v.addDropUntil, minCredits: Number(v.minCredits || 0), maxCredits: Number(v.maxCredits), allocationRule: v.allocationRule || 'cgpa', ...(v.allocationRule === 'custom' ? { ruleConfig: { cgpa: Number(v.wCgpa || 0), attendance: Number(v.wAttendance || 0), priority: Number(v.wPriority || 0) } } : {}) },
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
