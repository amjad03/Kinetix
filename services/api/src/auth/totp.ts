import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** RFC 6238 TOTP (HMAC-SHA1, 6 digits, 30 s), the profile every authenticator app supports. */
export const TOTP_PERIOD_S = 30;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of s.replace(/=+$/, '').toUpperCase()) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error('Not base32');
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const newTotpSecret = (): string => base32Encode(randomBytes(20));

export const totpStep = (at: Date): number => Math.floor(at.getTime() / 1000 / TOTP_PERIOD_S);

export function totpCode(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

const eq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** The accepted step (within one period either side of now, and after `lastStep`), or null. */
export function verifyTotp(secret: string, code: string, now: Date, lastStep: number): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = totpStep(now);
  for (const step of [current, current - 1, current + 1]) {
    if (step > lastStep && eq(totpCode(secret, step), code)) return step;
  }
  return null;
}

export const otpauthUri = (secret: string, account: string, issuer: string): string =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${TOTP_PERIOD_S}`;

/** `xxxxx-xxxxx` (10 hex digits, 40 bits): shown once, stored only as a hash. */
export const newBackupCode = (): string => {
  const h = randomBytes(5).toString('hex');
  return `${h.slice(0, 5)}-${h.slice(5)}`;
};
export const normalizeBackupCode = (s: string): string => s.trim().toLowerCase().replace(/[\s-]/g, '');
export const hashBackupCode = (s: string): string => createHash('sha256').update(normalizeBackupCode(s)).digest('hex');
