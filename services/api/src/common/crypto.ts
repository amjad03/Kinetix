import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export function hmac(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function randomDigits(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += randomInt(0, 10).toString();
  return out;
}

export function randomToken(bytes = 16): string {
  return randomBytes(bytes).toString('base64url');
}

/** Human-friendly enrolment code without ambiguous characters, e.g. "KX-7HQM-3RTP". */
export function enrollmentCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const group = () => Array.from({ length: 4 }, () => alphabet[randomInt(0, alphabet.length)]).join('');
  return `KX-${group()}-${group()}`;
}
