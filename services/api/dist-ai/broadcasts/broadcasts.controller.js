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
import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { RealtimeEvents } from '@kinetix/shared';
import { z } from 'zod';
import { Auth, BROADCAST_ROLES, CurrentPrincipal } from '../auth/auth.decorators.js';
import { DbService } from '../db/db.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { ZodBody } from '../common/zod-body.js';
import { BroadcastsService } from './broadcasts.service.js';
const CreateBody = z.object({
    title: z.string().min(1).max(120),
    body: z.string().min(1).max(2000),
    priority: z.enum(['info', 'important', 'emergency']).default('info'),
    requiresAck: z.boolean().default(false),
    ttlMinutes: z.number().int().min(1).max(7 * 24 * 60).default(60),
    audience: z
        .object({
        all: z.boolean().optional(),
        campusIds: z.array(z.uuid()).optional(),
        programIds: z.array(z.uuid()).optional(),
        sectionIds: z.array(z.uuid()).optional(),
        deviceIds: z.array(z.uuid()).optional(),
    })
        .refine((a) => a.all || a.campusIds?.length || a.programIds?.length || a.sectionIds?.length || a.deviceIds?.length, 'Choose who receives the message'),
});
let BroadcastsController = class BroadcastsController {
    constructor(db, broadcasts, realtime) {
        this.db = db;
        this.broadcasts = broadcasts;
        this.realtime = realtime;
    }
    /** Principal's dashboard: "Circulate". */
    async create(p, body) {
        const { message, deviceIds } = await this.db.withTenant(p.tenantId, (tx) => this.broadcasts.create(tx, p, body));
        this.broadcasts.deliver(message, deviceIds);
        return { ...message, targetedBoards: deviceIds.length };
    }
    /** Recently sent messages with delivery counts, newest first. */
    recent(p) {
        return this.db.withTenant(p.tenantId, (tx) => this.broadcasts.recent(tx));
    }
    delivery(p, id) {
        return this.db.withTenant(p.tenantId, (tx) => this.broadcasts.deliveryReport(tx, id));
    }
    /** Ends a broadcast early, e.g. "all clear" after an emergency. */
    async clear(p, id) {
        const deviceIds = await this.db.withTenant(p.tenantId, (tx) => this.broadcasts.clear(tx, p, id));
        this.realtime.toDevices(deviceIds, RealtimeEvents.BroadcastCleared, { id });
        return { cleared: true };
    }
    /** Board: messages it still has to show (after coming online, or on startup). */
    pending(p) {
        return this.db.withTenant(p.tenantId, (tx) => this.broadcasts.pendingForDevice(tx, p.deviceId));
    }
    async displayed(p, id) {
        await this.db.withTenant(p.tenantId, (tx) => this.broadcasts.markReceipt(tx, id, p.deviceId, 'displayed'));
    }
    async ack(p, id) {
        const userId = p.kind === 'board' ? p.teacherId : undefined;
        await this.db.withTenant(p.tenantId, (tx) => this.broadcasts.markReceipt(tx, id, p.deviceId, 'acknowledged', userId));
    }
};
__decorate([
    Post(),
    Auth('user', BROADCAST_ROLES),
    __param(0, CurrentPrincipal()),
    __param(1, Body(new ZodBody(CreateBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], BroadcastsController.prototype, "create", null);
__decorate([
    Get(),
    Auth('user', BROADCAST_ROLES),
    __param(0, CurrentPrincipal()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], BroadcastsController.prototype, "recent", null);
__decorate([
    Get(':id/delivery'),
    Auth('user', BROADCAST_ROLES),
    __param(0, CurrentPrincipal()),
    __param(1, Param('id', ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], BroadcastsController.prototype, "delivery", null);
__decorate([
    Post(':id/clear'),
    HttpCode(200),
    Auth('user', BROADCAST_ROLES),
    __param(0, CurrentPrincipal()),
    __param(1, Param('id', ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], BroadcastsController.prototype, "clear", null);
__decorate([
    Get('pending'),
    Auth(['device', 'board']),
    __param(0, CurrentPrincipal()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], BroadcastsController.prototype, "pending", null);
__decorate([
    Post(':id/displayed'),
    HttpCode(204),
    Auth(['device', 'board']),
    __param(0, CurrentPrincipal()),
    __param(1, Param('id', ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], BroadcastsController.prototype, "displayed", null);
__decorate([
    Post(':id/ack'),
    HttpCode(204),
    Auth(['device', 'board']),
    __param(0, CurrentPrincipal()),
    __param(1, Param('id', ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], BroadcastsController.prototype, "ack", null);
BroadcastsController = __decorate([
    Controller('v1/broadcasts'),
    __metadata("design:paramtypes", [DbService,
        BroadcastsService,
        RealtimeGateway])
], BroadcastsController);
export { BroadcastsController };
//# sourceMappingURL=broadcasts.controller.js.map