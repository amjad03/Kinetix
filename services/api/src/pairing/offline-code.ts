import { createHmac, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, verify } from 'node:crypto';

/**
 * Offline pairing codes. A board that is online beforehand receives codes signed by the institution's Ed25519 key.
 * Each code is valid for one time window. The Teacher App holds the institution's public key (fetched while online)
 * and checks a scanned code with no network: signature, institution, window and, if it knows it, the board.
 *
 * Token format: `KXO1.<payload>.<signature>`, both base64url. The payload is JSON: v (1), t tenant id, d device id,
 * k key id, n random nonce, f valid-from and u valid-until in epoch seconds.
 */
export const OFFLINE_PREFIX = 'KXO1';

export interface OfflinePayload {
  v: 1;
  t: string;
  d: string;
  k: string;
  n: string;
  f: number;
  u: number;
}

export interface SigningKeyPair {
  keyId: string;
  publicKeyPem: string;
  privateKeyPem: string;
}

export function newSigningKeyPair(): SigningKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  return { keyId: keyIdOf(publicKeyPem), publicKeyPem, privateKeyPem };
}

/** A short stable id for a public key: the first 12 characters of the HMAC-SHA256 of its PEM under a fixed label. */
export function keyIdOf(publicKeyPem: string): string {
  return createHmac('sha256', 'kinetix-offline-pairing-key-id').update(publicKeyPem).digest('base64url').slice(0, 12);
}

/** The raw 32-byte public key (base64url), for apps that cannot parse PEM. */
export function rawPublicKey(publicKeyPem: string): string {
  const der = createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' });
  return der.subarray(der.length - 32).toString('base64url');
}

export function signOfflineCode(privateKeyPem: string, payload: OfflinePayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = sign(null, Buffer.from(`${OFFLINE_PREFIX}.${body}`), createPrivateKey(privateKeyPem)).toString('base64url');
  return `${OFFLINE_PREFIX}.${body}.${sig}`;
}

export type OfflineCheck = { ok: true; payload: OfflinePayload } | { ok: false; reason: 'malformed' | 'bad_signature' | 'wrong_institution' | 'wrong_board' | 'not_yet_valid' | 'expired' };

/** What the Teacher App does offline. `now` is epoch seconds; `allow` the ± clock skew in seconds. */
export function verifyOfflineCode(publicKeyPem: string, token: string, expect: { tenantId: string; deviceId?: string; now: number; skewSeconds?: number }): OfflineCheck {
  const parts = token.trim().split('.');
  if (parts.length !== 3 || parts[0] !== OFFLINE_PREFIX) return { ok: false, reason: 'malformed' };
  let payload: OfflinePayload;
  try {
    const good = verify(null, Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey(publicKeyPem), Buffer.from(parts[2], 'base64url'));
    if (!good) return { ok: false, reason: 'bad_signature' };
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (payload.v !== 1 || typeof payload.f !== 'number' || typeof payload.u !== 'number') return { ok: false, reason: 'malformed' };
  if (payload.t !== expect.tenantId) return { ok: false, reason: 'wrong_institution' };
  if (expect.deviceId && payload.d !== expect.deviceId) return { ok: false, reason: 'wrong_board' };
  const skew = expect.skewSeconds ?? 60;
  if (expect.now + skew < payload.f) return { ok: false, reason: 'not_yet_valid' };
  if (expect.now - skew > payload.u) return { ok: false, reason: 'expired' };
  return { ok: true, payload };
}

/** Consecutive windows covering `hours` from `startSec`, one signed code each. */
export function issueWindows(privateKeyPem: string, who: { tenantId: string; deviceId: string; keyId: string }, startSec: number, hours: number, windowMinutes: number): { token: string; validFrom: number; validUntil: number }[] {
  const win = windowMinutes * 60;
  const count = Math.ceil((hours * 3600) / win);
  return Array.from({ length: count }, (_, i) => {
    const f = startSec + i * win;
    const u = f + win;
    return { token: signOfflineCode(privateKeyPem, { v: 1, t: who.tenantId, d: who.deviceId, k: who.keyId, n: randomBytes(9).toString('base64url'), f, u }), validFrom: f, validUntil: u };
  });
}
