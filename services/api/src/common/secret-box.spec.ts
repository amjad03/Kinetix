import { describe, expect, it } from 'vitest';
import { SecretBox } from './secret-box.js';

const k1 = Buffer.alloc(32, 1);
const k2 = Buffer.alloc(32, 2);

describe('SecretBox', () => {
  it('round-trips a secret, with a fresh IV each time, and refuses tampering or another row', () => {
    const box = new SecretBox({ 1: k1 }, 1);
    const a = box.encrypt('rzp-secret-1234', 'tenant-a:razorpay.key_secret');
    const b = box.encrypt('rzp-secret-1234', 'tenant-a:razorpay.key_secret');
    expect(a).toMatch(/^v1\./);
    expect(a).not.toContain('rzp-secret');
    expect(a).not.toBe(b);
    expect(box.decrypt(a, 'tenant-a:razorpay.key_secret')).toBe('rzp-secret-1234');
    // Copied to another institution or field: the associated data no longer matches.
    expect(() => box.decrypt(a, 'tenant-b:razorpay.key_secret')).toThrow();
    const [v, iv, tag, ct] = a.split('.');
    const flipped = Buffer.from(ct, 'base64url');
    flipped[0] ^= 1;
    expect(() => box.decrypt([v, iv, tag, flipped.toString('base64url')].join('.'), 'tenant-a:razorpay.key_secret')).toThrow();
    expect(() => new SecretBox({ 1: k1 }, 2).decrypt(a, 'x')).toThrow();
  });

  it('rotates to a new key version while the old key can still decrypt', () => {
    const old = new SecretBox({ 1: k1 }, 1);
    const blob = old.encrypt('whsec-abcdef', 't:razorpay.webhook_secret');
    const box = SecretBox.fromEnv({ SECRETS_ENCRYPTION_KEY: k2.toString('base64'), SECRETS_ENCRYPTION_KEY_VERSION: 2, SECRETS_ENCRYPTION_OLD_KEYS: `1:${k1.toString('base64')}` })!;
    expect(box.isStale(blob)).toBe(true);
    expect(box.decrypt(blob, 't:razorpay.webhook_secret')).toBe('whsec-abcdef');
    const rotated = box.rotate(blob, 't:razorpay.webhook_secret');
    expect(SecretBox.versionOf(rotated)).toBe(2);
    expect(box.rotate(rotated, 't:razorpay.webhook_secret')).toBe(rotated);
    // Once the old key is dropped, only rotated values still open.
    const newOnly = SecretBox.fromEnv({ SECRETS_ENCRYPTION_KEY: k2.toString('base64'), SECRETS_ENCRYPTION_KEY_VERSION: 2 })!;
    expect(newOnly.decrypt(rotated, 't:razorpay.webhook_secret')).toBe('whsec-abcdef');
    expect(() => newOnly.decrypt(blob, 't:razorpay.webhook_secret')).toThrow(/key version 1/);
  });

  it('wants a 32-byte key', () => {
    expect(SecretBox.fromEnv({})).toBeUndefined();
    expect(() => SecretBox.fromEnv({ SECRETS_ENCRYPTION_KEY: Buffer.alloc(16).toString('base64') })).toThrow(/32 bytes/);
    expect(() => SecretBox.fromEnv({ SECRETS_ENCRYPTION_KEY: k1.toString('base64'), SECRETS_ENCRYPTION_OLD_KEYS: 'nonsense' })).toThrow();
  });
});
