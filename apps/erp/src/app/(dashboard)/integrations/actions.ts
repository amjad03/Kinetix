'use server';

import { send } from '@/lib/ops-server';

const PAGE = '/integrations';
const id = encodeURIComponent;
type V = Record<string, string>;

export async function pushDocument(docId: string) {
  return send(`/v1/digilocker/documents/${id(docId)}/push`, undefined, PAGE);
}

export async function pushAllDocuments() {
  return send('/v1/digilocker/push-pending', undefined, PAGE);
}

export async function buildNadBatch() {
  return send<{ rows: number }>('/v1/nad/batches', undefined, PAGE);
}

export async function addDevice(v: V) {
  const kind = v.kind === 'rfid_reader' ? 'rfid_reader' : 'biometric';
  return send<{ deviceKey: string }>('/v1/access-devices', { kind, serial: v.serial, name: v.name, purpose: v.purpose }, PAGE);
}

export async function createToken(v: V) {
  const scopes = (v.scopes ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
  return send<{ token: string }>('/v1/api-tokens', { name: v.name, scopes }, PAGE);
}

export async function revokeToken(tokenId: string) {
  return send(`/v1/api-tokens/${id(tokenId)}`, undefined, PAGE, 'DELETE');
}
