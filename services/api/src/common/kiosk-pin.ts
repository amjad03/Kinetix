import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * The IT PIN that lets staff leave kiosk mode on a board (docs/hardware/kiosk-mode.md).
 *
 * Only a salted PBKDF2-HMAC-SHA256 hash is kept, as one string in tenants.settings.boardKiosk.pinHash:
 * `pbkdf2-sha256$<iterations>$<salt, base64>$<hash, base64>`. Boards get the parts
 * (GET /v1/devices/me/config) and check the PIN themselves, offline. A 4–8 digit PIN cannot
 * resist an offline search of a stolen hash whatever the cost; the hash keeps the PIN itself off
 * screens and out of exports, and boards lock out after wrong attempts. The cost is kept low
 * enough for a cheap Android panel to check a PIN in about a second.
 */
export const KIOSK_PIN_ALGO = 'pbkdf2-sha256';
export const KIOSK_PIN_ITERATIONS = 20_000;
const KEY_BYTES = 32;

export const KIOSK_PIN = /^\d{4,8}$/;

export interface KioskPinParts {
  algo: typeof KIOSK_PIN_ALGO;
  iterations: number;
  salt: string;
  hash: string;
}

export function hashKioskPin(pin: string, salt: Buffer = randomBytes(16), iterations = KIOSK_PIN_ITERATIONS): string {
  if (!KIOSK_PIN.test(pin)) throw new Error('The PIN must be 4 to 8 digits');
  const hash = pbkdf2Sync(pin, salt, iterations, KEY_BYTES, 'sha256');
  return `${KIOSK_PIN_ALGO}$${iterations}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

/** The parts of a stored hash, or null when it is missing or not one we wrote. */
export function kioskPinParts(stored: string | null | undefined): KioskPinParts | null {
  const m = stored?.split('$');
  if (!m || m.length !== 4 || m[0] !== KIOSK_PIN_ALGO) return null;
  const iterations = Number(m[1]);
  if (!Number.isInteger(iterations) || iterations < 1) return null;
  return { algo: KIOSK_PIN_ALGO, iterations, salt: m[2], hash: m[3] };
}

export function verifyKioskPin(pin: string, stored: string | null | undefined): boolean {
  const p = kioskPinParts(stored);
  if (!p) return false;
  const want = Buffer.from(p.hash, 'base64');
  const got = pbkdf2Sync(pin, Buffer.from(p.salt, 'base64'), p.iterations, want.length, 'sha256');
  return got.length === want.length && timingSafeEqual(got, want);
}
