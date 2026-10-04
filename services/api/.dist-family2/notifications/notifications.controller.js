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
import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import { DbService } from '../db/db.service.js';
import { notifications } from '../db/schema.js';
/** The signed-in user's own notifications (parents, students; staff later). */
let NotificationsController = class NotificationsController {
    constructor(db) {
        this.db = db;
    }
    list(p, limit) {
        const n = Math.min(Math.max(Number(limit) || 50, 1), 200);
        return this.db.withTenant(p.tenantId, async (tx) => {
            const mine = and(eq(notifications.userId, p.userId), isNull(notifications.retractedAt));
            const items = await tx
                .select({
                id: notifications.id,
                kind: notifications.kind,
                title: notifications.title,
                body: notifications.body,
                data: notifications.data,
                createdAt: notifications.createdAt,
                readAt: notifications.readAt,
            })
                .from(notifications)
                .where(mine)
                .orderBy(desc(notifications.createdAt))
                .limit(n);
            const [{ unread }] = await tx.select({ unread: count() }).from(notifications).where(and(mine, isNull(notifications.readAt)));
            return { unread, items };
        });
    }
    async read(p, id) {
        await this.db.withTenant(p.tenantId, (tx) => tx
            .update(notifications)
            .set({ readAt: new Date() })
            .where(and(eq(notifications.id, id), eq(notifications.userId, p.userId), isNull(notifications.readAt))));
    }
    async readAll(p) {
        await this.db.withTenant(p.tenantId, (tx) => tx.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, p.userId), isNull(notifications.readAt))));
    }
};
__decorate([
    Get(),
    Auth('user'),
    __param(0, CurrentPrincipal()),
    __param(1, Query('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "list", null);
__decorate([
    Post(':id/read'),
    HttpCode(204),
    Auth('user'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('id', ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "read", null);
__decorate([
    Post('read-all'),
    HttpCode(204),
    Auth('user'),
    __param(0, CurrentPrincipal()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "readAll", null);
NotificationsController = __decorate([
    Controller('v1/notifications'),
    __metadata("design:paramtypes", [DbService])
], NotificationsController);
export { NotificationsController };
//# sourceMappingURL=notifications.controller.js.map