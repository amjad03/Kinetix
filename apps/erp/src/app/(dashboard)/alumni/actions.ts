'use server';

import { getI18n } from '@/i18n/server';
import { optNum, optStr, send } from '@/lib/ops-server';

const PAGE = '/alumni';
const BASE = '/v1/alumni';
type V = Record<string, string>;

/** Rupees as the form gives them (paise, from the dialog's rupee field) to a positive amount, or an error message. */
async function amount(v: V): Promise<{ paise: number; error?: undefined } | { paise?: undefined; error: string }> {
  const paise = optNum(v.amount);
  if (paise === undefined || !Number.isInteger(paise) || paise < 1) return { error: (await getI18n()).t('alm.err.amount') };
  return { paise };
}

export async function saveCampaign(v: V, existingId?: string) {
  const goal = optNum(v.goal) ?? 0;
  const body = { name: v.name, description: v.description ?? '', goalPaise: goal, startsOn: optStr(v.startsOn), endsOn: optStr(v.endsOn), status: v.status || 'active', receiptNote: v.receiptNote ?? '' };
  return existingId ? send(`${BASE}/campaigns/${encodeURIComponent(existingId)}`, body, PAGE, 'PUT') : send(`${BASE}/campaigns`, body, PAGE);
}

export async function recordPledge(campaignId: string, v: V) {
  const a = await amount(v);
  if (a.paise === undefined) return { ok: false as const, error: a.error };
  return send(`${BASE}/campaigns/${encodeURIComponent(campaignId)}/pledges`, { alumniId: optStr(v.alumniId), donorName: optStr(v.donorName), amountPaise: a.paise, pledgedOn: v.pledgedOn, dueOn: optStr(v.dueOn), note: v.note ?? '' }, PAGE);
}

export async function recordDonation(campaignId: string, v: V) {
  const a = await amount(v);
  if (a.paise === undefined) return { ok: false as const, error: a.error };
  return send(
    `${BASE}/campaigns/${encodeURIComponent(campaignId)}/donations`,
    { alumniId: optStr(v.alumniId), donorName: optStr(v.donorName), donorPan: optStr(v.donorPan), donorAddress: v.donorAddress ?? '', amountPaise: a.paise, mode: v.mode, reference: optStr(v.reference), receivedOn: v.receivedOn, note: v.note ?? '' },
    PAGE,
  );
}

export async function saveOpportunity(v: V, existingId?: string) {
  const body = { title: v.title, description: v.description ?? '', startsOn: optStr(v.startsOn), slots: optNum(v.slots), status: v.status || 'open' };
  return existingId ? send(`${BASE}/volunteering/${encodeURIComponent(existingId)}`, body, PAGE, 'PUT') : send(`${BASE}/volunteering`, body, PAGE);
}

export async function signUp(opportunityId: string, v: V) {
  return send(`${BASE}/volunteering/${encodeURIComponent(opportunityId)}/signups`, { alumniId: v.alumniId, note: v.note ?? '' }, PAGE);
}

/** The alumni office publishes (optionally featuring) or rejects a submitted success story. */
export async function reviewStory(storyId: string, v: V) {
  return send(`/v1/placements/success-stories/${encodeURIComponent(storyId)}/review`, { decision: v.decision, ...(optStr(v.note) ? { note: v.note.trim() } : {}), featured: v.featured === 'yes' }, PAGE);
}

export async function withdraw(opportunityId: string, alumniId: string) {
  return send(`${BASE}/volunteering/${encodeURIComponent(opportunityId)}/signups/${encodeURIComponent(alumniId)}`, undefined, PAGE, 'DELETE');
}
