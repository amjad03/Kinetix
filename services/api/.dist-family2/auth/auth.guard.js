var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { Clock } from '../common/time.js';
import { DbService } from '../db/db.service.js';
import { boardSessions, devices } from '../db/schema.js';
import { AUTH_META } from './auth.decorators.js';
import { TokensService } from './tokens.service.js';
let AuthGuard = class AuthGuard {
    constructor(reflector, tokens, db, clock) {
        this.reflector = reflector;
        this.tokens = tokens;
        this.db = db;
        this.clock = clock;
    }
    async canActivate(ctx) {
        const req = ctx.switchToHttp().getRequest();
        const requirement = this.reflector.getAllAndOverride(AUTH_META, [
            ctx.getHandler(),
            ctx.getClass(),
        ]);
        if (!requirement)
            return true;
        const header = req.headers.authorization;
        if (!header?.startsWith('Bearer '))
            throw new UnauthorizedException('Missing bearer token');
        const principal = await this.resolve(header.slice(7));
        if (!requirement.kinds.includes(principal.kind)) {
            throw new ForbiddenException(`This endpoint does not accept ${principal.kind} tokens`);
        }
        if (principal.kind === 'user' && requirement.roles?.length) {
            if (!principal.roles.some((r) => requirement.roles.includes(r))) {
                throw new ForbiddenException('Insufficient role');
            }
        }
        req.principal = principal;
        return true;
    }
    /** Verifies the token and, for devices and boards, that it has not been revoked or ended. */
    async resolve(token) {
        const c = this.tokens.verify(token);
        switch (c.typ) {
            case 'user':
                return { kind: 'user', tenantId: c.tid, userId: c.sub, roles: c.roles };
            case 'device': {
                const ok = await this.db.withTenant(c.tid, async (tx) => {
                    const [d] = await tx
                        .update(devices)
                        .set({ lastSeenAt: new Date() })
                        .where(and(eq(devices.id, c.sub), eq(devices.tokenVersion, c.ver)))
                        .returning({ id: devices.id });
                    return !!d;
                });
                if (!ok)
                    throw new UnauthorizedException('Device token revoked');
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
                if (!active)
                    throw new UnauthorizedException('Board session has ended');
                return { kind: 'board', tenantId: c.tid, deviceId: c.did, campusId: c.cid, teacherId: c.sub, sessionId: c.sid };
            }
            default:
                throw new UnauthorizedException('Unknown token type');
        }
    }
};
AuthGuard = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [Reflector,
        TokensService,
        DbService,
        Clock])
], AuthGuard);
export { AuthGuard };
//# sourceMappingURL=auth.guard.js.map