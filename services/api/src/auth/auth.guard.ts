import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { Clock } from '../common/time.js';
import { DbService } from '../db/db.service.js';
import { boardSessions, devices } from '../db/schema.js';
import { ALLOW_PASSWORD_CHANGE_META, AUTH_META, type AuthRequirement } from './auth.decorators.js';
import type { Principal } from './principal.js';

export const PASSWORD_CHANGE_REQUIRED = 'Change your temporary password first';
import { TokensService } from './tokens.service.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokensService,
    private readonly db: DbService,
    private readonly clock: Clock,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const requirement = this.reflector.getAllAndOverride<AuthRequirement | undefined>(AUTH_META, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!requirement) return true;

    const header: string | undefined = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Missing bearer token');
    const principal = await this.resolve(header.slice(7));

    if (!requirement.kinds.includes(principal.kind)) {
      throw new ForbiddenException(`This endpoint does not accept ${principal.kind} tokens`);
    }
    // Carried in the token (no lookup per request); the change endpoint issues a token without it.
    if (principal.kind === 'user' && principal.mustChangePassword && !this.reflector.getAllAndOverride<boolean>(ALLOW_PASSWORD_CHANGE_META, [ctx.getHandler(), ctx.getClass()])) {
      throw new ForbiddenException(PASSWORD_CHANGE_REQUIRED);
    }
    if (principal.kind === 'user' && requirement.roles?.length) {
      if (!principal.roles.some((r) => requirement.roles!.includes(r))) {
        throw new ForbiddenException('Insufficient role');
      }
    }
    req.principal = principal;
    return true;
  }

  /** Verifies the token and, for devices and boards, that it has not been revoked or ended. */
  async resolve(token: string): Promise<Principal> {
    const c = this.tokens.verify(token);
    switch (c.typ) {
      case 'user':
        return { kind: 'user', tenantId: c.tid, userId: c.sub, roles: c.roles, ...(c.pwc ? { mustChangePassword: true as const } : {}) };
      case 'device': {
        const ok = await this.db.withTenant(c.tid, async (tx) => {
          const [d] = await tx
            .update(devices)
            .set({ lastSeenAt: new Date() })
            .where(and(eq(devices.id, c.sub), eq(devices.tokenVersion, c.ver)))
            .returning({ id: devices.id });
          return !!d;
        });
        if (!ok) throw new UnauthorizedException('Device token revoked');
        return { kind: 'device', tenantId: c.tid, deviceId: c.sub, campusId: c.cid };
      }
      case 'board': {
        const active = await this.db.withTenant(c.tid, async (tx) => {
          const [s] = await tx
            .select({ id: boardSessions.id })
            .from(boardSessions)
            .where(and(eq(boardSessions.id, c.sid), isNull(boardSessions.endedAt), gt(boardSessions.expiresAt, this.clock.now())));
          return !!s;
        });
        if (!active) throw new UnauthorizedException('Board session has ended');
        return { kind: 'board', tenantId: c.tid, deviceId: c.did, campusId: c.cid, teacherId: c.sub, sessionId: c.sid };
      }
      default:
        throw new UnauthorizedException('Unknown token type');
    }
  }
}
