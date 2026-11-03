import { BadRequestException } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const PRIVATE_V4 = /^(0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|192\.0\.0\.|198\.1[89]\.|22[4-9]\.|2[3-5]\d\.)/;

/** Loopback, private, link-local (cloud metadata 169.254.169.254, ECS 169.254.170.2), CGNAT, benchmark and multicast addresses. */
export function isPrivateAddress(ip: string): boolean {
  const a = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (isIP(a) === 4) return PRIVATE_V4.test(a);
  if (isIP(a) === 6) {
    // IPv4-mapped (::ffff:10.0.0.1) and the unspecified/loopback/unique-local/link-local/multicast ranges.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a);
    if (mapped) return PRIVATE_V4.test(mapped[1]);
    // The URL parser writes mapped addresses in hex: [::ffff:7f00:1] is 127.0.0.1.
    const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(a);
    if (hex) {
      const [hi, lo] = [parseInt(hex[1], 16), parseInt(hex[2], 16)];
      return PRIVATE_V4.test(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    return /^(::1?$|f[cd]|fe[89ab]|ff)/.test(a);
  }
  return false;
}

const internalName = (h: string) => h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || (!h.includes('.') && isIP(h) === 0);

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
  if (internalName(h) || isPrivateAddress(h)) throw new BadRequestException('The URL must point to a public address');
}

/**
 * Before a server-side request to an address an institution typed (webhooks, SSO, DigiLocker, LTI, Tally): in production the
 * name must resolve only to public addresses, so a DNS name pointing at 169.254.169.254 or the VPC is refused too. `allowHttp`
 * for gateways that only speak HTTP (Tally). Requests are also made with redirects off, so a public URL cannot bounce inward.
 */
export async function assertPublicUrl(raw: string, opts: { production?: boolean; allowHttp?: boolean; resolve?: (host: string) => Promise<string[]> } = {}): Promise<void> {
  const production = opts.production ?? process.env.NODE_ENV === 'production';
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new BadRequestException('The URL is not valid');
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new BadRequestException('The URL must start with https://');
  if (!production) return;
  if (u.protocol !== 'https:' && !opts.allowHttp) throw new BadRequestException('The URL must start with https://');
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (internalName(h) || isPrivateAddress(h)) throw new BadRequestException('The URL must point to a public address');
  if (isIP(h)) return;
  const resolve = opts.resolve ?? (async (host: string) => (await lookup(host, { all: true })).map((r) => r.address));
  let addrs: string[];
  try {
    addrs = await resolve(h);
  } catch {
    throw new BadRequestException('The address could not be found');
  }
  if (!addrs.length || addrs.some(isPrivateAddress)) throw new BadRequestException('The URL must point to a public address');
}
