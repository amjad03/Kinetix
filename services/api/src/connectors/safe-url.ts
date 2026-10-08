import { BadRequestException } from '@nestjs/common';
import { isIP } from 'node:net';

/** In production a webhook must be HTTPS and must not point at this network (loopback, private ranges, internal names). */
export function assertSafeUrl(raw: string, production = process.env.NODE_ENV === 'production'): void {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new BadRequestException('The URL is not valid');
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new BadRequestException('The URL must start with https://');
  if (!production) return;
  if (u.protocol !== 'https:') throw new BadRequestException('The URL must start with https://');
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const privateV4 = /^(0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || (isIP(h) === 4 && privateV4.test(h)) || (isIP(h) === 6 && /^(::1?$|f[cd]|fe80)/.test(h)) || (!h.includes('.') && isIP(h) === 0)) {
    throw new BadRequestException('The URL must point to a public address');
  }
}
