import { pbkdf2Sync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { KIOSK_PIN_ITERATIONS } from '../common/kiosk-pin.js';
import { hashProfilePin, PROFILE_PIN, profilePinForBoard, verifyProfilePin, weakPin } from './profile-pin.js';

describe('profile PINs', () => {
  it('takes 4 to 6 digits only', () => {
    for (const ok of ['4829', '48291', '482917']) expect(PROFILE_PIN.test(ok)).toBe(true);
    for (const bad of ['482', '4829170', '48a9', '', ' 4829']) expect(PROFILE_PIN.test(bad)).toBe(false);
    expect(() => hashProfilePin('1234567')).toThrow();
  });

  it('stores a salted PBKDF2 hash, a new salt each time, and never the PIN', () => {
    const a = hashProfilePin('482917');
    const b = hashProfilePin('482917');
    expect(a).toMatch(new RegExp(`^pbkdf2-sha256\\$${KIOSK_PIN_ITERATIONS}\\$[A-Za-z0-9+/=]+\\$[A-Za-z0-9+/=]+$`));
    expect(a).not.toContain('482917');
    expect(a).not.toBe(b);
    expect(verifyProfilePin('482917', a)).toBe(true);
    expect(verifyProfilePin('482917', b)).toBe(true);
    expect(verifyProfilePin('482916', a)).toBe(false);
    expect(verifyProfilePin('48291', a)).toBe(false);
  });

  it('refuses malformed input and hashes it did not write', () => {
    expect(verifyProfilePin('4829', null)).toBe(false);
    expect(verifyProfilePin('4829', 'plain$4829')).toBe(false);
    expect(verifyProfilePin('not a pin', hashProfilePin('4829'))).toBe(false);
  });

  it('gives boards the parts to check it offline, as the board computes it', () => {
    const parts = profilePinForBoard(hashProfilePin('7351'))!;
    expect(parts.algo).toBe('pbkdf2-sha256');
    const derived = pbkdf2Sync('7351', Buffer.from(parts.salt, 'base64'), parts.iterations, 32, 'sha256').toString('base64');
    expect(derived).toBe(parts.hash);
  });

  it('turns away PINs anyone would try first', () => {
    for (const weak of ['0000', '1111', '999999', '1234', '4321', '123456', '654321', '7890', '0987', '1212', '2580']) expect(weakPin(weak), weak).toBe(true);
    for (const ok of ['4829', '1357', '7351', '482917', '1235']) expect(weakPin(ok), ok).toBe(false);
  });
});
