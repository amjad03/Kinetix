import { createHmac, timingSafeEqual } from 'node:crypto';

const mac = (secret: string, tenantId: string, ticketNo: string) => createHmac('sha256', secret).update(`hallticket:${tenantId}:${ticketNo}`).digest('base64url').slice(0, 16);

/** The signed code on a hall ticket's QR: "<ticket no>.<mac>", the mac an HMAC of the tenant and ticket number. */
export const hallTicketCode = (secret: string, tenantId: string, ticketNo: string) => `${ticketNo}.${mac(secret, tenantId, ticketNo)}`;

/** The ticket number of a code, or null when it is malformed or the mac does not match. */
export function parseHallTicketCode(secret: string, tenantId: string, code: string): string | null {
  const m = /^(.{3,80})\.([A-Za-z0-9_-]{16})$/.exec(code);
  if (!m) return null;
  const expected = Buffer.from(mac(secret, tenantId, m[1]));
  const given = Buffer.from(m[2]);
  return given.length === expected.length && timingSafeEqual(given, expected) ? m[1] : null;
}
