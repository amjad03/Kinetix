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
import { Body, Controller, ForbiddenException, Get, HttpCode, Post } from '@nestjs/common';
import { and, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal, STAFF_ADMIN_ROLES, TEACHING_ROLES } from '../auth/auth.decorators.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { aiUsage, boardSessions } from '../db/schema.js';
import { AiService } from './ai.service.js';
import { TaskInputs } from './tasks.js';
/** Optional class context for app callers; the board takes it from its session. */
const Context = z.object({ sectionId: z.uuid().optional(), subjectId: z.uuid().optional(), topicId: z.uuid().optional(), fresh: z.boolean().default(false) });
const Bodies = {
    explain: TaskInputs.explain.extend(Context.shape),
    quiz: TaskInputs.quiz.extend(Context.shape),
    homework: TaskInputs.homework.extend(Context.shape),
    lessonPlan: TaskInputs.lessonPlan.extend(Context.shape),
};
const STAFF = [...TEACHING_ROLES, 'tenant_admin'];
/**
 * KINETIX AI for the board and the apps. Teachers get every task; students may ask for
 * explanations (self-paced learning). Generated quizzes and homework are drafts: they reach
 * students only when the teacher sends them.
 */
let AiController = class AiController {
    constructor(ai, db) {
        this.ai = ai;
        this.db = db;
    }
    explain(p, body) {
        return this.run(p, 'explain', body);
    }
    quiz(p, body) {
        return this.run(p, 'quiz', body);
    }
    homework(p, body) {
        return this.run(p, 'homework', body);
    }
    lessonPlan(p, body) {
        return this.run(p, 'lessonPlan', body);
    }
    /** Last 30 days of AI use for the institution, by task and outcome. */
    usage(p) {
        return this.db.withTenant(p.tenantId, async (tx) => {
            const rows = await tx
                .select({
                task: aiUsage.task,
                outcome: aiUsage.outcome,
                requests: sql `count(*)::int`,
                tokens: sql `coalesce(sum(${aiUsage.promptTokens} + ${aiUsage.completionTokens}), 0)::int`,
            })
                .from(aiUsage)
                .where(gte(aiUsage.createdAt, sql `now() - interval '30 days'`))
                .groupBy(aiUsage.task, aiUsage.outcome);
            return { days: 30, rows };
        });
    }
    async run(p, task, body) {
        const { sectionId, subjectId, topicId, fresh, ...input } = body;
        const caller = { tenantId: p.tenantId, topicId };
        if (p.kind === 'board') {
            caller.deviceId = p.deviceId;
            caller.userId = p.teacherId;
            const [session] = await this.db.withTenant(p.tenantId, (tx) => tx.select({ sectionId: boardSessions.sectionId, subjectId: boardSessions.subjectId }).from(boardSessions).where(and(eq(boardSessions.id, p.sessionId))));
            caller.sectionId = session?.sectionId;
            caller.subjectId = session?.subjectId;
        }
        else {
            if (task !== 'explain' && !p.roles.some((r) => STAFF.includes(r)))
                throw new ForbiddenException();
            caller.userId = p.userId;
            caller.sectionId = sectionId;
            caller.subjectId = subjectId;
        }
        return this.ai.run(caller, task, input, { fresh });
    }
};
__decorate([
    Post('explain'),
    HttpCode(200),
    Auth(['board', 'user'], [...STAFF, 'student']),
    __param(0, CurrentPrincipal()),
    __param(1, Body(new ZodBody(Bodies.explain))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AiController.prototype, "explain", null);
__decorate([
    Post('quiz'),
    HttpCode(200),
    Auth(['board', 'user'], STAFF),
    __param(0, CurrentPrincipal()),
    __param(1, Body(new ZodBody(Bodies.quiz))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AiController.prototype, "quiz", null);
__decorate([
    Post('homework'),
    HttpCode(200),
    Auth(['board', 'user'], STAFF),
    __param(0, CurrentPrincipal()),
    __param(1, Body(new ZodBody(Bodies.homework))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AiController.prototype, "homework", null);
__decorate([
    Post('lesson-plan'),
    HttpCode(200),
    Auth(['board', 'user'], STAFF),
    __param(0, CurrentPrincipal()),
    __param(1, Body(new ZodBody(Bodies.lessonPlan))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AiController.prototype, "lessonPlan", null);
__decorate([
    Get('usage'),
    Auth('user', STAFF_ADMIN_ROLES),
    __param(0, CurrentPrincipal()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AiController.prototype, "usage", null);
AiController = __decorate([
    Controller('v1/ai'),
    __metadata("design:paramtypes", [AiService,
        DbService])
], AiController);
export { AiController };
//# sourceMappingURL=ai.controller.js.map