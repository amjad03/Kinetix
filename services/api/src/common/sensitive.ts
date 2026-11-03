import { createHash } from 'node:crypto';
import { SecretBox } from './secret-box.js';

/**
 * Column encryption for special-category personal data (DPDP): health conditions, medications, allergies, nurse visits and
 * counselling notes. AES-256-GCM under SECRETS_ENCRYPTION_KEY (common/secret-box.ts, versioned `v<n>.…`, rotated by
 * `pnpm secrets:rotate`), bound to the institution, the student and the field, so a value copied to another row, field or
 * institution does not decrypt. Rows written before encryption was added stay readable as they are and are sealed on their
 * next write (or by the rotation job).
 *
 * Staff Aadhaar and bank accounts use the same box with their own binding (hr/); student Aadhaar is kept only as last 4 + hash.
 */
let cached: { box: SecretBox; env: string } | undefined;

/** The box from the environment; without a configured key (development, tests without one) a key derived from JWT_SECRET. */
export function sensitiveBox(env: NodeJS.ProcessEnv = process.env): SecretBox {
  const sig = `${env.SECRETS_ENCRYPTION_KEY ?? ''}|${env.SECRETS_ENCRYPTION_KEY_VERSION ?? ''}|${env.SECRETS_ENCRYPTION_OLD_KEYS ?? ''}|${env.JWT_SECRET ?? ''}`;
  if (cached?.env === sig) return cached.box;
  const box =
    SecretBox.fromEnv({ SECRETS_ENCRYPTION_KEY: env.SECRETS_ENCRYPTION_KEY, SECRETS_ENCRYPTION_KEY_VERSION: env.SECRETS_ENCRYPTION_KEY_VERSION ? Number(env.SECRETS_ENCRYPTION_KEY_VERSION) : undefined, SECRETS_ENCRYPTION_OLD_KEYS: env.SECRETS_ENCRYPTION_OLD_KEYS }) ??
    new SecretBox({ 1: createHash('sha256').update(`zynetix-sensitive:${env.JWT_SECRET ?? 'dev'}`).digest() }, 1);
  cached = { box, env: sig };
  return box;
}

const SEALED = /^v\d+\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]*$/;

/** Whether a stored value is a sealed one (rather than plain text from before encryption). */
export const isSealed = (v: string): boolean => SEALED.test(v);

/** The binding of one field of one student's record. */
export const sensitiveAad = (tenantId: string, kind: 'health' | 'health_visit' | 'counselling', studentId: string, field: string): string => `${tenantId}:${kind}.${studentId}.${field}`;

/** Encrypts a value for storage; empty stays empty (nothing to hide, and "no notes" checks keep working). */
export function seal(aad: string, value: string): string;
export function seal(aad: string, value: string | null): string | null;
export function seal(aad: string, value: string | null): string | null {
  if (value === null || value === '' || isSealed(value)) return value;
  return sensitiveBox().encrypt(value, aad);
}

/** Decrypts a stored value; plain values from before encryption come back as they are. */
export function unseal(aad: string, value: string): string;
export function unseal(aad: string, value: string | null): string | null;
export function unseal(aad: string, value: string | null): string | null {
  if (value === null || !isSealed(value)) return value;
  try {
    return sensitiveBox().decrypt(value, aad);
  } catch {
    // A key that is no longer configured, or a value moved to another row: never shown as cipher text.
    return '[cannot be decrypted]';
  }
}

export const sealList = (aad: string, xs: string[]): string[] => xs.map((x, i) => seal(`${aad}.${i}`, x));
export const unsealList = (aad: string, xs: string[]): string[] => xs.map((x, i) => unseal(`${aad}.${i}`, x));

/** Re-encrypts a sealed value with the current key version (a plain value is sealed). Used by `pnpm secrets:rotate`. */
export function reseal(aad: string, value: string | null, box: SecretBox = sensitiveBox()): string | null {
  if (value === null || value === '') return value;
  return isSealed(value) ? box.rotate(value, aad) : box.encrypt(value, aad);
}
