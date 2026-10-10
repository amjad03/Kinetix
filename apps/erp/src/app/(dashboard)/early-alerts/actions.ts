'use server';

import { optStr, send } from '@/lib/ops-server';

const PAGE = '/early-alerts';
const id = encodeURIComponent;
type V = Record<string, string>;

export async function refreshFlags() {
  return send('/v1/early-alerts/run', undefined, PAGE);
}

export async function addStep(flagId: string, v: V) {
  return send(`/v1/early-alerts/${id(flagId)}/interventions`, { action: v.action, note: v.note ?? '', dueOn: optStr(v.dueOn) }, PAGE);
}

export async function closeFlag(flagId: string, v: V) {
  return send(`/v1/early-alerts/${id(flagId)}/status`, { status: 'resolved', outcome: v.outcome }, PAGE, 'PUT');
}
