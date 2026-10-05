import { hashKioskPin, kioskPinParts, verifyKioskPin, type KioskPinParts } from '../common/kiosk-pin.js';

/**
 * A teacher's PIN for their profile on a shared board (docs/architecture/board-profiles.md).
 *
 * Hashed exactly like the kiosk IT PIN (PBKDF2-HMAC-SHA256, a new 16-byte salt each time), so
 * boards check both with the same code, offline. The server checks the PIN too and counts wrong
 * tries: after [MAX_PIN_ATTEMPTS] the profile locks until the teacher signs in fully again or an
 * admin resets the PIN in the ERP.
 */
export const PROFILE_PIN = /^\d{4,6}$/;
export const MAX_PIN_ATTEMPTS = 5;

/** PINs anyone would try first: one digit repeated, a run up or down, or a common pick. */
export function weakPin(pin: string): boolean {
  if (/^(\d)\1+$/.test(pin)) return true;
  const digits = [...pin].map(Number);
  const steps = new Set(digits.slice(1).map((d, i) => (d - digits[i] + 10) % 10));
  if (steps.size === 1 && (steps.has(1) || steps.has(9))) return true;
  return ['1212', '2580', '0852', '1122', '6969', '121212', '112233', '123123', '696969'].includes(pin);
}

export function hashProfilePin(pin: string): string {
  if (!PROFILE_PIN.test(pin)) throw new Error('The PIN must be 4 to 6 digits');
  return hashKioskPin(pin);
}

export const verifyProfilePin = (pin: string, stored: string | null | undefined): boolean => PROFILE_PIN.test(pin) && verifyKioskPin(pin, stored);

/** What a board caches to check the PIN offline: never the PIN. */
export const profilePinForBoard = (stored: string | null | undefined): KioskPinParts | null => kioskPinParts(stored);
