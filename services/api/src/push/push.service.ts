import { Injectable, OnModuleInit } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { DbService, type Tx } from '../db/db.service.js';
import { notifications, pushDevices } from '../db/schema.js';
import { JobsService, type Job } from '../jobs/jobs.service.js';
import { PushSender, type PushMessage } from './push-sender.js';

export const PUSH_SEND = 'push.send';

/** What the lock screen shows. Deliberately generic: names and details stay in the app. */
const LOCK_SCREEN: Record<string, string> = {
  absence: 'Attendance update',
  homework: 'New homework',
  board_shared: 'Class board shared',
  recording: 'Lesson recording available',
  broadcast: 'Message from your institution',
  fee: 'Fees update',
  library: 'Library update',
  marks: 'Marks published',
  message: 'New message',
  live: 'Class is live',
};

/** Sends a push for each new notification to the recipient's registered phones. */
@Injectable()
export class PushService implements OnModuleInit {
  constructor(
    private readonly db: DbService,
    private readonly jobs: JobsService,
    private readonly sender: PushSender,
  ) {}

  onModuleInit(): void {
    this.jobs.register(PUSH_SEND, (job) => this.deliver(job));
  }

  /** Queues pushes for notifications just created in this transaction. */
  async queue(tx: Tx, tenantId: string, notificationIds: string[]): Promise<void> {
    if (!this.sender.configured || notificationIds.length === 0) return;
    for (let i = 0; i < notificationIds.length; i += 500) {
      await this.jobs.enqueue(tx, tenantId, PUSH_SEND, { ids: notificationIds.slice(i, i + 500).join(',') });
    }
  }

  private async deliver(job: Job): Promise<void> {
    const ids = job.payload.ids.split(',').filter(Boolean);
    const targets = await this.db.withTenant(job.tenantId, (tx) =>
      tx
        .select({ id: notifications.id, kind: notifications.kind, token: pushDevices.token, platform: pushDevices.platform })
        .from(notifications)
        .innerJoin(pushDevices, eq(pushDevices.userId, notifications.userId))
        // Not if it was withdrawn or already read before the push went out.
        .where(and(inArray(notifications.id, ids), isNull(notifications.retractedAt), isNull(notifications.readAt))),
    );
    if (targets.length === 0) return;
    const messages: PushMessage[] = targets.map((t) => ({
      token: t.token,
      platform: t.platform,
      title: LOCK_SCREEN[t.kind] ?? 'KINETIX update',
      body: 'Open KINETIX to see the details.',
      data: { notificationId: t.id, kind: t.kind },
    }));
    const results = await this.sender.send(messages);
    const invalid = messages.filter((_, i) => results[i] === 'invalid-token').map((m) => m.token);
    if (invalid.length) await this.db.withTenant(job.tenantId, (tx) => tx.delete(pushDevices).where(inArray(pushDevices.token, invalid)));
    if (results.every((r) => r === 'failed')) throw new Error('Push provider failed for every message');
  }
}
