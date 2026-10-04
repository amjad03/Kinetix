var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Body, Controller, ForbiddenException, HttpCode, Post } from '@nestjs/common';
import { and, eq, gt } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import { boardSessions } from '../db/schema.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { SyncService } from './sync.service.js';
const PushBody = z.object({
    /**
     * The class session the ops were recorded in. Needed with a device token: a board that
     * restarted, or whose class has ended, still sends what it queued during that class.
     */
    sessionId: z.uuid().optional(),
    ops: z
        .array(z.object({
        opId: z.uuid(),
        type: z.string().max(64),
        occurredAt: z.iso.datetime({ offset: true }),
        payload: z.record(z.string(), z.unknown()),
    }))
        .max(500),
});
/** How long a board may hold on to ops from a class before they are refused. */
const LATE_OPS_DAYS = 7;
let SyncController = class SyncController {
    constructor(db, sync) {
        this.db = db;
        this.sync = sync;
    }
    async push(caller, body) {
        const results = await this.db.withTenant(caller.tenantId, async (tx) => {
            let p;
            if (caller.kind === 'board' && (!body.sessionId || body.sessionId === caller.sessionId)) {
                p = caller;
            }
            else {
                // Ops from an earlier session on this same board, up to a week old.
                if (!body.sessionId)
                    throw new ForbiddenException('sessionId is required with a device token');
                const [s] = await tx
                    .select()
                    .from(boardSessions)
                    .where(and(eq(boardSessions.id, body.sessionId), eq(boardSessions.deviceId, caller.deviceId), gt(boardSessions.startedAt, new Date(Date.now() - LATE_OPS_DAYS * 86400_000))));
                if (!s)
                    throw new ForbiddenException('That class session is not from this board, or is too old to sync');
                p = { kind: 'board', tenantId: caller.tenantId, deviceId: caller.deviceId, campusId: caller.campusId, teacherId: s.teacherId, sessionId: s.id };
            }
            return this.sync.push(tx, p, body.ops);
        });
        return { results, serverTime: new Date().toISOString() };
    }
};
__decorate([
    Post('push'),
    HttpCode(200),
    Auth(['board', 'device']),
    __param(0, CurrentPrincipal()),
    __param(1, Body(new ZodBody(PushBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SyncController.prototype, "push", null);
SyncController = __decorate([
    Controller('v1/sync'),
    __metadata("design:paramtypes", [DbService,
        SyncService])
], SyncController);
export { SyncController };
//# sourceMappingURL=sync.controller.js.map