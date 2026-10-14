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

/** Moves an asset to another room, place or department; the transfer register keeps where it was. */
export async function transferAsset(assetId: string, v: V) {
  return send(`/v1/assets/${id(assetId)}/transfer`, { reason: v.reason, ...(optStr(v.toRoomId) ? { toRoomId: v.toRoomId } : {}), ...(optStr(v.toDepartmentId) ? { toDepartmentId: v.toDepartmentId } : {}), ...(optStr(v.toLocation) ? { toLocation: v.toLocation } : {}), ...(optStr(v.on) ? { on: v.on } : {}) }, PAGE);
}

/** Proposes an asset for condemnation; the committee (principal or administrator) decides. */
export async function condemnAsset(assetId: string, v: V) {
  return send(`/v1/assets/${id(assetId)}/condemn`, { reason: v.reason, condition: v.condition ?? '' }, PAGE);
}

export async function rejectCondemnation(condemnationId: string, v: V) {
  return send(`/v1/assets/condemnations/${id(condemnationId)}/decision`, { approve: false, ...(optStr(v.note) ? { note: v.note } : {}) }, PAGE);
}

/** Writes off an approved condemnation: the asset is disposed of by auction, scrap, donation or buy-back. */
export async function writeOffAsset(condemnationId: string, v: V) {
  return send(`/v1/assets/condemnations/${id(condemnationId)}/write-off`, { disposalMode: v.disposalMode, realisedPaise: num(v.realised || '0'), ...(optStr(v.on) ? { on: v.on } : {}) }, PAGE);
}

export async function postDepreciation(v: V) {
  return send('/v1/assets/gl/depreciation', { fiscalYear: v.fiscalYear }, PAGE);
}
