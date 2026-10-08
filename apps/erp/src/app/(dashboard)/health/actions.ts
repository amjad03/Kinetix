'use server';

import { getI18n } from '@/i18n/server';
import { optStr as opt, read, send } from '@/lib/ops-server';
import { parseContacts, splitList, type HealthRecord } from '@/lib/school-life';

type V = Record<string, string>;
const BASE = '/v1/student-health';

export async function loadRecord(id: string) {
  return read<HealthRecord>(`${BASE}/students/${encodeURIComponent(id)}`);
}

export async function saveProfile(studentId: string, v: V) {
  const contacts = parseContacts(v.emergencyContacts);
  if (!contacts.ok) return { ok: false as const, error: (await getI18n()).t('hl.err.contacts', { line: contacts.line }) };
  return send(`${BASE}/students/${encodeURIComponent(studentId)}/profile`, { bloodGroup: opt(v.bloodGroup) ?? null, allergies: splitList(v.allergies), conditions: splitList(v.conditions), medications: splitList(v.medications), emergencyContacts: contacts.value, notes: v.notes ?? '' }, '/health', 'PUT');
}

export async function logVisit(studentId: string, v: V) {
  return send(`${BASE}/students/${encodeURIComponent(studentId)}/visits`, { visitedAt: opt(v.visitedAt), complaint: v.complaint, action: v.action ?? '', sentHome: v.sentHome === 'yes' }, '/health');
}

export async function addVaccination(studentId: string, v: V) {
  return send(`${BASE}/students/${encodeURIComponent(studentId)}/vaccinations`, { vaccine: v.vaccine, dose: v.dose ?? '', givenOn: v.givenOn, nextDueOn: opt(v.nextDueOn), notes: v.notes ?? '' }, '/health');
}
