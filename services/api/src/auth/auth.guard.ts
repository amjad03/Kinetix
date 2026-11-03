import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { Clock } from '../common/time.js';
import { DbService, type Tx } from '../db/db.service.js';
import { boardSessions, devices, userRoles, users } from '../db/schema.js';
import { userSessions } from '../db/schema-foundation.js';
import { currentContext } from '../observability/request-context.js';
import { ALLOW_MFA_SETUP_META, ALLOW_PASSWORD_CHANGE_META, AUTH_META, type AuthRequirement } from './auth.decorators.js';
import type { Principal, RoleName } from './principal.js';

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
    // The institution requires a second factor for this role and the user has none yet: set-up endpoints only.
    if (principal.kind === 'user' && principal.mustSetUpMfa && !this.reflector.getAllAndOverride<boolean>(ALLOW_MFA_SETUP_META, [ctx.getHandler(), ctx.getClass()]) && !this.reflector.getAllAndOverride<boolean>(ALLOW_PASSWORD_CHANGE_META, [ctx.getHandler(), ctx.getClass()])) {
      throw new ForbiddenException({ message: 'Set up two-factor authentication first', code: 'MFA_SETUP_REQUIRED' });
    }
    if (principal.kind === 'user' && requirement.roles?.length) {
      if (!principal.roles.some((r) => requirement.roles!.includes(r))) {
        throw new ForbiddenException('Insufficient role');
      }
    }
    req.principal = principal;
    const rc = currentContext();
    if (rc) {
      rc.tenantId = principal.tenantId;
      rc.userId = principal.kind === 'user' ? principal.userId : principal.kind === 'board' ? principal.teacherId : undefined;
      // Campus-scoped staff: every query of this request sees only their campuses (DbService.withTenant, migration 0182).
      if (principal.kind === 'user' && principal.campusIds?.length) rc.campusIds = principal.campusIds;
    }
    return true;
  }

  /**
   * A signed-out (revoked) session's token stops working at once. `last_seen_at` is refreshed at most once a minute.
   * Answers the person's current roles and campus scope, read in the same transaction (see {@link accessOf}).
   */
  private async assertSessionActive(tenantId: string, userId: string, sessionId: string): Promise<Access> {
    const now = this.clock.now();
    const res = await this.db.withTenant(tenantId, async (tx) => {
      // One round trip: the session, the account's status and the current roles and campuses (accessColumns).
      const [s] = await tx
        .select({ revokedAt: userSessions.revokedAt, seen: userSessions.lastSeenAt, status: users.status, ...accessColumns(userId) })
        .from(userSessions)
        .innerJoin(users, eq(users.id, userSessions.userId))
        .where(and(eq(userSessions.id, sessionId), eq(userSessions.userId, userId)));
      // A disabled account stops working at once, even with a token signed before it was disabled.
      if (!s || s.revokedAt || s.status === 'disabled') return null;
      if (now.getTime() - s.seen.getTime() > 60_000) await tx.update(userSessions).set({ lastSeenAt: now }).where(eq(userSessions.id, sessionId));
      return toAccess(s);
    });
    if (!res) throw new UnauthorizedException('This session was signed out');
    return res;
  }

  /** Verifies the token and, for devices and boards, that it has not been revoked or ended. */
  async resolve(token: string): Promise<Principal> {
    const c = this.tokens.verify(token);
    switch (c.typ) {
      case 'user': {
        const { roles, campusIds } = c.sid ? await this.assertSessionActive(c.tid, c.sub, c.sid) : await this.db.withTenant(c.tid, (tx) => accessOf(tx, c.sub));
        // Roles come from user_roles on every request, not from the token: a role taken away stops working at once
        // (the token only says what was true at sign-in, up to 12 hours ago).
        return { kind: 'user', tenantId: c.tid, userId: c.sub, roles, ...(c.sid ? { sessionId: c.sid } : {}), ...(c.pwc ? { mustChangePassword: true as const } : {}), ...(c.mfe ? { mustSetUpMfa: true as const } : {}), ...(campusIds ? { campusIds } : {}) };
      }
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

/** Roles that are not staff: never campus-limited. */
const NOT_STAFF: RoleName[] = ['student', 'guardian', 'alumni', 'external_examiner'];

interface Access {
  roles: RoleName[];
  campusIds: string[] | undefined;
}

/**
 * The person's current roles, and the campuses a member of staff is limited to: when every one of their staff roles is tied to
 * a campus (user_roles.campus_id), those campuses; when any role covers every campus (no campus), undefined, meaning no limit.
 * One query on user_roles per request.
 */
export async function accessOf(tx: Tx, userId: string): Promise<Access> {
  const [r] = await tx.select(accessColumns(userId)).from(sql`(select 1) as one`);
  return toAccess(r);
}

/** The roles and campus columns of {@link accessOf}, as subqueries, so they can ride along another select. */
function accessColumns(userId: string) {
  // Only staff roles count for the campus limit: a student's or family's own records are already theirs alone.
  const staff = sql`r.role::text not in (${sql.join(NOT_STAFF.map((x) => sql`${x}`), sql`, `)})`;
  return {
    roles: sql<RoleName[] | null>`(select array_agg(distinct r.role::text) from user_roles r where r.user_id = ${userId}::uuid)`,
    open: sql<boolean | null>`(select bool_or(r.campus_id is null) from user_roles r where r.user_id = ${userId}::uuid and ${staff})`,
    ids: sql<string[] | null>`(select array_agg(distinct r.campus_id::text) from user_roles r where r.user_id = ${userId}::uuid and r.campus_id is not null and ${staff})`,
  };
}

const toAccess = (r: { roles: RoleName[] | null; open: boolean | null; ids: string[] | null } | undefined): Access => ({
  roles: r?.roles ?? [],
  campusIds: !r || r.open !== false || !r.ids?.length ? undefined : r.ids,
});

/** The campuses a member of staff is limited to (see {@link accessOf}). */
export async function campusScope(tx: Tx, userId: string): Promise<string[] | undefined> {
  return (await accessOf(tx, userId)).campusIds;
}
