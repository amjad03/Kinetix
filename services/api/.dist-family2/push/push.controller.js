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
import { Body, Controller, Delete, HttpCode, Post } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { pushDevices } from '../db/schema.js';
const RegisterBody = z.object({
    token: z.string().min(10).max(4096),
    platform: z.enum(['android', 'ios', 'web']),
    app: z.enum(['parent', 'student', 'teacher']),
});
/** Apps register their push token after sign-in and remove it on sign-out. */
let PushController = class PushController {
    constructor(db) {
        this.db = db;
    }
    async register(p, body) {
        await this.db.withTenant(p.tenantId, (tx) => tx
            .insert(pushDevices)
            .values({ tenantId: p.tenantId, userId: p.userId, ...body })
            // The same phone signing in as someone else now belongs to them.
            .onConflictDoUpdate({ target: [pushDevices.tenantId, pushDevices.token], set: { userId: p.userId, app: body.app, platform: body.platform, lastSeenAt: sql `now()` } }));
    }
    async remove(p, body) {
        await this.db.withTenant(p.tenantId, (tx) => tx.delete(pushDevices).where(and(eq(pushDevices.token, body.token), eq(pushDevices.userId, p.userId))));
    }
};
__decorate([
    Post(),
    HttpCode(204),
    Auth('user'),
    __param(0, CurrentPrincipal()),
    __param(1, Body(new ZodBody(RegisterBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], PushController.prototype, "register", null);
__decorate([
    Delete(),
    HttpCode(204),
    Auth('user'),
    __param(0, CurrentPrincipal()),
    __param(1, Body(new ZodBody(RegisterBody.pick({ token: true })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], PushController.prototype, "remove", null);
PushController = __decorate([
    Controller('v1/push/devices'),
    __metadata("design:paramtypes", [DbService])
], PushController);
export { PushController };
//# sourceMappingURL=push.controller.js.map