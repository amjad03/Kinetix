'use server';

import { optStr as opt, read, send } from '@/lib/ops-server';
import type { EyRecord } from '@/lib/school-life';

type V = Record<string, string>;
const BASE = '/v1/early-years';

export async function seedFramework() {
  return send(`${BASE}/framework/seed`, undefined, '/early-years');
}

export async function loadChild(id: string) {
  return read<EyRecord>(`${BASE}/students/${encodeURIComponent(id)}`);
}

/** A note about a child, with the milestone and status it shows when chosen. Photos come from the Teacher App. */
export async function addObservation(studentId: string, v: V) {
  return send(`${BASE}/students/${encodeURIComponent(studentId)}/observations`, { note: v.note, domain: opt(v.domain), milestoneId: opt(v.milestoneId), status: opt(v.status), observedOn: opt(v.observedOn) }, '/early-years');
}

export async function setMilestone(studentId: string, milestoneId: string, status: string) {
  return send(`${BASE}/students/${encodeURIComponent(studentId)}/milestones/${encodeURIComponent(milestoneId)}`, { status }, '/early-years', 'PUT');
}
