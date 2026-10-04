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
import { Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import { DbService } from '../db/db.service.js';
import { boardSessions } from '../db/schema.js';
import { SessionsService } from './sessions.service.js';
let SessionsController = class SessionsController {
    constructor(db, sessions) {
        this.db = db;
        this.sessions = sessions;
    }
    /** The board's current session: teacher, class, subject, period and roster (for picker and attendance). */
    current(p) {
        return this.db.withTenant(p.tenantId, async (tx) => {
            const context = await this.sessions.context(tx, p.sessionId);
            const roster = context.section ? await this.sessions.roster(tx, context.section.id) : [];
            return { ...context, roster };
        });
    }
    /** "End class" pressed on the board. */
    endFromBoard(p) {
        return this.db.withTenant(p.tenantId, async (tx) => {
            await this.sessions.end(tx, p.tenantId, p.sessionId, 'teacher_ended', false);
            return { ended: true };
        });
    }
    /** "End class" pressed in the Teacher App, or an admin signing a board out remotely. */
    endFromApp(p, id) {
        return this.db.withTenant(p.tenantId, async (tx) => {
            const [s] = await tx
                .select({ teacherId: boardSessions.teacherId })
                .from(boardSessions)
                .where(and(eq(boardSessions.id, id), isNull(boardSessions.endedAt)));
            if (!s)
                return { ended: false };
            const isAdmin = p.roles.some((r) => r === 'tenant_admin' || r === 'principal');
            if (s.teacherId !== p.userId && !isAdmin)
                throw new ForbiddenException();
            await this.sessions.end(tx, p.tenantId, id, s.teacherId === p.userId ? 'teacher_ended' : 'admin_revoked', true);
            return { ended: true };
        });
    }
};
__decorate([
    Get('current'),
    Auth('board'),
    __param(0, CurrentPrincipal()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], SessionsController.prototype, "current", null);
__decorate([
    Post('current/end'),
    Auth('board'),
    __param(0, CurrentPrincipal()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], SessionsController.prototype, "endFromBoard", null);
__decorate([
    Post(':id/end'),
    Auth('user'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('id', ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], SessionsController.prototype, "endFromApp", null);
SessionsController = __decorate([
    Controller('v1/sessions'),
    __metadata("design:paramtypes", [DbService,
        SessionsService])
], SessionsController);
export { SessionsController };
//# sourceMappingURL=sessions.controller.js.map