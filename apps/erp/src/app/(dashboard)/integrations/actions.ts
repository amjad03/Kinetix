'use server';

import { send } from '@/lib/ops-server';

const PAGE = '/integrations';
type V = Record<string, string>;

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
