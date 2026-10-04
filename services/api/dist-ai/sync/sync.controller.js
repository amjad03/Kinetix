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
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { SyncService } from './sync.service.js';
const PushBody = z.object({
    ops: z
        .array(z.object({
        opId: z.uuid(),
        type: z.string().max(64),
        occurredAt: z.iso.datetime({ offset: true }),
        payload: z.record(z.string(), z.unknown()),
    }))
        .max(500),
});
let SyncController = class SyncController {
    constructor(db, sync) {
        this.db = db;
        this.sync = sync;
    }
    async push(p, body) {
        const results = await this.db.withTenant(p.tenantId, (tx) => this.sync.push(tx, p, body.ops));
        return { results, serverTime: new Date().toISOString() };
    }
};
__decorate([
    Post('push'),
    HttpCode(200),
    Auth('board'),
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