import { Injectable, OnModuleInit } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { Clock } from '../common/time.js';
import { quietUntil } from '../comms/comms.logic.js';
import { outsideOfficeHours } from '../messages/chat-rules.js';
import { DbService, type Tx } from '../db/db.service.js';
import { jobs, notifications, pushDevices, tenants, users } from '../db/schema.js';
import { chatAvailability, commChannelPrefs } from '../db/schema-comms.js';
import { qualitySettings } from '../quality-hub/settings.catalogue.js';
import { LOCK_SCREEN, OPEN_APP, type Lang } from '../notifications/texts.js';
import { JobsService, type Job } from '../jobs/jobs.service.js';
import { PushSender, type PushMessage } from './push-sender.js';

export const PUSH_SEND = 'push.send';

/** Sends a push for each new notification to the recipient's registered phones. */
@Injectable()
export class PushService implements OnModuleInit {
  constructor(
    private readonly db: DbService,
    private readonly jobs: JobsService,
    private readonly sender: PushSender,
    private readonly clock: Clock,
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
    const now = this.clock.now();
    const plan = await this.db.withTenant(job.tenantId, async (tx) => {
      const rows = await tx
        .select({ id: notifications.id, userId: notifications.userId, kind: notifications.kind, urgent: sql<boolean>`coalesce(${notifications.data} ->> 'urgent', '') = '1'`, token: pushDevices.token, platform: pushDevices.platform, lang: users.preferredLanguage })
        .from(notifications)
        .innerJoin(pushDevices, eq(pushDevices.userId, notifications.userId))
        .innerJoin(users, eq(users.id, notifications.userId))
        // Not if it was withdrawn or already read before the push went out.
        .where(and(inArray(notifications.id, ids), isNull(notifications.retractedAt), isNull(notifications.readAt)));
      if (rows.length === 0) return { send: rows, later: [] as string[], until: null as Date | null };
      // The person turned phone alerts off (an emergency still rings).
      const people = [...new Set(rows.map((r) => r.userId))];
      const prefs = await tx
        .selectDistinctOn([commChannelPrefs.userId], { userId: commChannelPrefs.userId, granted: commChannelPrefs.granted })
        .from(commChannelPrefs)
        .where(and(inArray(commChannelPrefs.userId, people), eq(commChannelPrefs.channel, 'push')))
        .orderBy(commChannelPrefs.userId, desc(commChannelPrefs.createdAt));
      const off = new Set(prefs.filter((p) => !p.granted).map((p) => p.userId));
      // Staff on do-not-disturb, or outside their own chat hours, get no push for chat messages.
      const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
      const tz = t?.tz || 'Asia/Kolkata';
      const away = new Set(
        (await tx.select().from(chatAvailability).where(inArray(chatAvailability.userId, people)))
          .filter((a) => (a.dndUntil && a.dndUntil > now) || outsideOfficeHours(now, tz, a.hours))
          .map((a) => a.userId),
      );
      const keep = rows.filter((r) => r.urgent || (!off.has(r.userId) && !(r.kind === 'message' && away.has(r.userId))));
      // Quiet hours: a non-urgent push waits until they end (the notification is already in the app).
      const quiet = await qualitySettings(tx, job.tenantId, 'communication');
      const until = quiet.rules.quietHoursOn ? quietUntil(now, tz, Number(quiet.rules.quietHoursStart), Number(quiet.rules.quietHoursEnd)) : null;
      if (!until) return { send: keep, later: [], until: null };
      const later = [...new Set(keep.filter((r) => !r.urgent).map((r) => r.id))];
      if (later.length) await tx.insert(jobs).values({ tenantId: job.tenantId, kind: PUSH_SEND, payload: { ids: later.join(',') }, runAfter: until });
      return { send: keep.filter((r) => r.urgent), later, until };
    });
    const targets = plan.send;
    if (targets.length === 0) return;
    const messages: PushMessage[] = targets.map((t) => ({
      token: t.token,
      platform: t.platform,
      title: LOCK_SCREEN[t.kind]?.[t.lang as Lang] ?? 'ZYNETIX',
      body: OPEN_APP[t.lang as Lang],
      data: { notificationId: t.id, kind: t.kind },
    }));
    const results = await this.sender.send(messages);
    const invalid = messages.filter((_, i) => results[i] === 'invalid-token').map((m) => m.token);
    if (invalid.length) await this.db.withTenant(job.tenantId, (tx) => tx.delete(pushDevices).where(inArray(pushDevices.token, invalid)));
    if (results.every((r) => r === 'failed')) throw new Error('Push provider failed for every message');
  }
}
