import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';

/** Someone casting from the browser /cast page with the board's join code: no account, no app. */
export interface CastGuest {
  tenantId: string;
  deviceId: string;
  guestId: string;
  name: string;
  /** Seconds since the epoch. */
  exp: number;
}

const PREFIX = 'castguest';
/** Letters and digits that cannot be mistaken for one another on a board across the room. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const JOIN_CODE_LENGTH = 6;

export const newJoinCode = () => Array.from({ length: JOIN_CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

/** What a person typed: case and spaces do not matter. */
export const normaliseJoinCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, '');

const sign = (secret: string, payload: string) => createHmac('sha256', secret).update(`cast-guest:${payload}`).digest('base64url');

/** A short-lived guest token, signed with the server's secret (it never goes in a database). */
export function signGuestToken(secret: string, g: Omit<CastGuest, 'guestId'> & { guestId?: string }): string {
  const payload = Buffer.from(JSON.stringify({ ...g, guestId: g.guestId ?? randomUUID() })).toString('base64url');
  return `${PREFIX}.${payload}.${sign(secret, payload)}`;
}

/** The guest of a valid, unexpired token; null otherwise. */
export function verifyGuestToken(secret: string, token: string, nowS: number): CastGuest | null {
  const [prefix, payload, mac] = token.split('.');
  if (prefix !== PREFIX || !payload || !mac) return null;
  const want = Buffer.from(sign(secret, payload));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const g = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as CastGuest;
    if (typeof g.tenantId !== 'string' || typeof g.deviceId !== 'string' || typeof g.guestId !== 'string' || typeof g.name !== 'string' || typeof g.exp !== 'number') return null;
    return g.exp > nowS ? g : null;
  } catch {
    return null;
  }
}
