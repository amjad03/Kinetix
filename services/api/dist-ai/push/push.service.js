var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { DbService } from '../db/db.service.js';
import { notifications, pushDevices } from '../db/schema.js';
import { JobsService } from '../jobs/jobs.service.js';
import { PushSender } from './push-sender.js';
export const PUSH_SEND = 'push.send';
/** What the lock screen shows. Deliberately generic: names and details stay in the app. */
const LOCK_SCREEN = {
    absence: 'Attendance update',
    homework: 'New homework',
    board_shared: 'Class board shared',
    recording: 'Lesson recording available',
    broadcast: 'Message from your institution',
    fee: 'Fees update',
};
/** Sends a push for each new notification to the recipient's registered phones. */
let PushService = class PushService {
    constructor(db, jobs, sender) {
        this.db = db;
        this.jobs = jobs;
        this.sender = sender;
    }
    onModuleInit() {
        this.jobs.register(PUSH_SEND, (job) => this.deliver(job));
    }
    /** Queues pushes for notifications just created in this transaction. */
    async queue(tx, tenantId, notificationIds) {
        if (!this.sender.configured || notificationIds.length === 0)
            return;
        for (let i = 0; i < notificationIds.length; i += 500) {
            await this.jobs.enqueue(tx, tenantId, PUSH_SEND, { ids: notificationIds.slice(i, i + 500).join(',') });
        }
    }
    async deliver(job) {
        const ids = job.payload.ids.split(',').filter(Boolean);
        const targets = await this.db.withTenant(job.tenantId, (tx) => tx
            .select({ id: notifications.id, kind: notifications.kind, token: pushDevices.token, platform: pushDevices.platform })
            .from(notifications)
            .innerJoin(pushDevices, eq(pushDevices.userId, notifications.userId))
            // Not if it was withdrawn or already read before the push went out.
            .where(and(inArray(notifications.id, ids), isNull(notifications.retractedAt), isNull(notifications.readAt))));
        if (targets.length === 0)
            return;
        const messages = targets.map((t) => ({
            token: t.token,
            platform: t.platform,
            title: LOCK_SCREEN[t.kind] ?? 'KINETIX update',
            body: 'Open KINETIX to see the details.',
            data: { notificationId: t.id, kind: t.kind },
        }));
        const results = await this.sender.send(messages);
        const invalid = messages.filter((_, i) => results[i] === 'invalid-token').map((m) => m.token);
        if (invalid.length)
            await this.db.withTenant(job.tenantId, (tx) => tx.delete(pushDevices).where(inArray(pushDevices.token, invalid)));
        if (results.every((r) => r === 'failed'))
            throw new Error('Push provider failed for every message');
    }
};
PushService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [DbService,
        JobsService,
        PushSender])
], PushService);
export { PushService };
//# sourceMappingURL=push.service.js.map