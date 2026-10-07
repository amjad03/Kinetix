'use server';

import { read, send, num, optNum, optStr } from '@/lib/ops-server';
import type { AssetDetail } from '@/lib/ops';
import type { ActionResult } from '@/lib/types';

const PAGE = '/assets';
type V = Record<string, string>;
const id = encodeURIComponent;

export async function loadAsset(assetId: string): Promise<ActionResult<AssetDetail>> {
  return read<AssetDetail>(`/v1/assets/${id(assetId)}`);
}

export async function registerAsset(v: V) {
  return send('/v1/assets', { name: v.name, category: v.category || 'general', location: v.location ?? '', purchasedOn: v.purchasedOn, costPaise: num(v.cost), salvagePaise: num(v.salvage || '0'), usefulLifeYears: num(v.life), method: v.method || 'slm', ...(v.method === 'wdv' ? { wdvRatePct: optNum(v.rate) } : {}) }, PAGE);
}

export async function allocateAsset(assetId: string, v: V) {
  return send(`/v1/assets/${id(assetId)}/allocate`, { assignedTo: v.assignedTo, ...(optStr(v.userId) ? { userId: v.userId } : {}), ...(optStr(v.allocatedOn) ? { allocatedOn: v.allocatedOn } : {}) }, PAGE);
}

export async function returnAsset(assetId: string) {
  return send(`/v1/assets/${id(assetId)}/return`, undefined, PAGE);
}

export async function logMaintenance(assetId: string, v: V) {
  return send(`/v1/assets/${id(assetId)}/maintenance`, { kind: v.kind, description: v.description ?? '', costPaise: num(v.cost || '0'), doneOn: v.doneOn, ongoing: v.ongoing === 'yes', ...(optStr(v.nextDueOn) ? { nextDueOn: v.nextDueOn } : {}) }, PAGE);
}

export async function disposeAsset(assetId: string, v: V) {
  return send(`/v1/assets/${id(assetId)}/dispose`, { disposedOn: v.disposedOn, disposalPaise: num(v.proceeds || '0') }, PAGE);
}
