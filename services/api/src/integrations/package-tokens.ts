import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { createHmac, randomBytes } from 'node:crypto';
import type { Request } from 'express';
import { Clock } from '../common/time.js';
import { ENV, type Env } from '../config/env.js';
import { safeEqual } from './common.js';

/**
 * What a signed package link may do. `p` opens the player and saves the learner's tracking; `c` reads the package's
 * files and nothing else (it names no learner, so a package that leaks its own address gives away no one's data);
 * `f` is the one-use cmi5 fetch link; `x` is the xAPI credential a cmi5 unit sends its statements with.
 */
export type PackageScope = 'p' | 'c' | 'f' | 'x';

export interface PackageToken {
  s: PackageScope;
  pkg: string;
  tenant: string;
  /** The learner (absent on content links). */
  user?: string;
  /** cmi5 registration (the attempt id). */
  reg?: string;
  /** One-use id of a fetch link. */
  jti?: string;
  /** Content links: the API origin that made the player (the files' only allowed framer and cmi5's xAPI endpoint). */
  o?: string;
  exp: number;
}

/** Signs and checks the links of the SCORM and cmi5 player, and knows which origin serves package files. */
@Injectable()
export class PackageTokens {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly clock: Clock,
  ) {}

  private mac(body: string) {
    // A key of its own per purpose, so a SCORM link can never be replayed as any other signed value of the platform.
    return createHmac('sha256', `scorm-v2:${this.env.PAIRING_HMAC_SECRET}`).update(body).digest('base64url');
  }

  sign(p: Omit<PackageToken, 'exp'>, ttlMs: number): string {
    const body = Buffer.from(JSON.stringify({ ...p, ...(p.s === 'f' ? { jti: randomBytes(9).toString('base64url') } : {}), exp: this.clock.now().getTime() + ttlMs })).toString('base64url');
    return `${body}.${this.mac(body)}`;
  }

  /** The token's claims, if it is genuine, current and of the expected scope. */
  open(token: string, scope: PackageScope): PackageToken {
    const [body, sig] = (token ?? '').split('.');
    if (!body || !sig || !safeEqual(sig, this.mac(body))) throw new ForbiddenException('This player link is not valid');
    let p: PackageToken;
    try {
      p = JSON.parse(Buffer.from(body, 'base64url').toString()) as PackageToken;
    } catch {
      throw new ForbiddenException('This player link is not valid');
    }
    if (p.s !== scope) throw new ForbiddenException('This player link is not valid');
    if (p.exp < this.clock.now().getTime()) throw new ForbiddenException('This player link has expired. Open the lesson again');
    return p;
  }

  /** The origin the request reached (behind the load balancer, its forwarded scheme). */
  requestOrigin(req: Request): string {
    return `${req.protocol}://${req.get('host')}`;
  }

  /** Where package files are served: the separate content origin, or (development) this API's own host. */
  contentOrigin(req: Request): string {
    return this.env.SCORM_CONTENT_ORIGIN ?? this.requestOrigin(req);
  }

  /** The API's public origin, for the xAPI endpoint a cmi5 unit calls. */
  apiOrigin(req: Request): string {
    return (this.env.API_PUBLIC_URL ? new URL(this.env.API_PUBLIC_URL).origin : null) ?? this.requestOrigin(req);
  }

  /** Who may frame the player: this API and the ERP and portal origins. */
  playerAncestors(): string {
    return ["'self'", ...this.env.CORS_ORIGINS].join(' ');
  }
}

/**
 * The headers on every package file: the file runs in a sandbox without same-origin (an opaque origin, so no cookies,
 * storage or DOM of any ZYNETIX page are reachable, and it cannot navigate the top window), may load its own files,
 * may talk only to its own origin (cmi5 units also to the xAPI endpoint), and may be framed only by the player.
 */
export function packageFileHeaders(contentOrigin: string, playerOrigin: string, xapiEndpoint: string | null): Record<string, string> {
  const own = contentOrigin;
  return {
    'Content-Security-Policy': [
      'sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads',
      `default-src ${own} 'unsafe-inline' 'unsafe-eval' data: blob:`,
      'img-src * data: blob:',
      'media-src * data: blob:',
      'font-src * data:',
      'frame-src https:',
      `connect-src ${own}${xapiEndpoint ? ` ${xapiEndpoint}` : ''}`,
      "form-action 'none'",
      `base-uri ${own}`,
      `frame-ancestors ${playerOrigin}`,
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cache-Control': 'private, max-age=300',
  };
}
