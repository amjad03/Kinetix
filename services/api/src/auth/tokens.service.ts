import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ENV, type Env } from '../config/env.js';
import type { RoleName } from './principal.js';

export interface UserClaims {
  typ: 'user';
  sub: string;
  tid: string;
  roles: RoleName[];
  /** Signed in with a temporary password: only changing it (and GET /v1/me, sign-out) is allowed. */
  pwc?: true;
  /** The sign-in this token belongs to (user_sessions); revoking it signs the token out. */
  sid?: string;
  /** The institution requires a second factor and the user has none yet: only setting one up is allowed. */
  mfe?: true;
}

/** Proof of a correct password, good for five minutes, exchanged with a code for a real token. */
export interface MfaChallengeClaims {
  sub: string;
  tid: string;
  method: 'password' | 'otp';
}

export interface DeviceClaims {
  typ: 'device';
  sub: string;
  tid: string;
  cid: string;
  /** Must equal devices.token_version; bumping it revokes the token. */
  ver: number;
}

export interface BoardClaims {
  typ: 'board';
  sub: string; // teacher id
  tid: string;
  did: string;
  cid: string;
  sid: string;
}

export type Claims = UserClaims | DeviceClaims | BoardClaims;

const AUDIENCE = 'kinetix-api';
const MFA_AUDIENCE = 'kinetix-mfa';

/**
 * HS256 for now. TODO: switch to EdDSA keys from KMS so the offline-pairing credential can be
 * verified by boards with the public key alone (see docs/architecture/board-pairing.md).
 */
@Injectable()
export class TokensService {
  private readonly jwt: JwtService;

  constructor(@Inject(ENV) env: Env) {
    this.jwt = new JwtService({ secret: env.JWT_SECRET });
  }

  signUser(claims: Omit<UserClaims, 'typ'>): string {
    return this.jwt.sign({ ...claims, typ: 'user' }, { expiresIn: '12h', audience: AUDIENCE });
  }

  signMfaChallenge(claims: MfaChallengeClaims): string {
    return this.jwt.sign({ ...claims, typ: 'mfa' }, { expiresIn: '5m', audience: MFA_AUDIENCE });
  }

  verifyMfaChallenge(token: string): MfaChallengeClaims {
    try {
      const c = this.jwt.verify<MfaChallengeClaims & { typ: string }>(token, { audience: MFA_AUDIENCE });
      if (c.typ !== 'mfa') throw new Error('wrong type');
      return c;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  signDevice(claims: Omit<DeviceClaims, 'typ'>): string {
    return this.jwt.sign({ ...claims, typ: 'device' }, { expiresIn: '365d', audience: AUDIENCE });
  }

  signBoard(claims: Omit<BoardClaims, 'typ'>, expiresAt: Date): string {
    const seconds = Math.max(60, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
    return this.jwt.sign({ ...claims, typ: 'board' }, { expiresIn: seconds, audience: AUDIENCE });
  }

  verify(token: string): Claims {
    try {
      return this.jwt.verify<Claims & object>(token, { audience: AUDIENCE });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
