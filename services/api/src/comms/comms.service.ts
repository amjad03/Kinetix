import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { and, eq, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import { Mailer } from '../analytics/mailer.js';
import { audit } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { DbService, type Tx } from '../db/db.service.js';
import { guardians, notifications, students, tenants, userRoles, users } from '../db/schema.js';
import { audienceRules, messageCampaigns, messageDeliveries, messageTemplates } from '../db/schema-pathways.js';
import { JobsService, type Job } from '../jobs/jobs.service.js';
import { TextSender, WhatsAppSender } from './channels.js';
import { MAX_ATTEMPTS, fillTemplate, retryDelayMinutes, toE164 } from './comms.logic.js';

export const COMMS_RUN = 'comms.run';
type Rule = typeof audienceRules.$inferSelect.rule;
type Template = typeof messageTemplates.$inferSelect;

/**
 * The communication engine: audiences by rule, templates per channel and language, scheduled sends, retry with
 * back-off, and read status for in-app messages. In-app and email need no vendor; SMS needs a DLT-registered
 * template id; WhatsApp needs the institution's own Business account.
 */
@Injectable()
export class CommsService implements OnModuleInit {
  private readonly log = new Logger(CommsService.name);

  constructor(
    private readonly db: DbService,
    private readonly jobs: JobsService,
    private readonly clock: Clock,
    private readonly mailer: Mailer,
    private readonly sms: TextSender,
    private readonly whatsapp: WhatsAppSender,
  ) {}

  onModuleInit(): void {
    this.jobs.registerHourly(COMMS_RUN, (job: Job) => this.runDue(job.tenantId).then(() => undefined));
  }

  /** The people an audience rule names. Students and guardians are filtered by the rule's sections. */
  async audienceUsers(tx: Tx, rule: Rule): Promise<string[]> {
    const roles = rule.roles ?? [];
    const out = new Set<string>(rule.userIds ?? []);
    if (rule.sectionIds?.length) {
      const wantStudents = roles.length === 0 || roles.includes('student');
      const wantGuardians = roles.length === 0 || roles.includes('guardian');
      const kids = await tx.select({ id: students.id, userId: students.userId }).from(students).where(inArray(students.sectionId, rule.sectionIds));
      if (wantStudents) for (const k of kids) if (k.userId) out.add(k.userId);
      if (wantGuardians && kids.length) for (const g of await tx.select({ userId: guardians.userId }).from(guardians).where(inArray(guardians.studentId, kids.map((k) => k.id)))) out.add(g.userId);
    } else if (roles.length) {
      for (const r of await tx.select({ userId: userRoles.userId }).from(userRoles).where(inArray(userRoles.role, roles as never[]))) out.add(r.userId);
    }
    if (out.size === 0) return [];
    const active = await tx.select({ id: users.id }).from(users).where(and(inArray(users.id, [...out]), eq(users.status, 'active')));
    return active.map((a) => a.id);
  }

  /** Sends every scheduled campaign that is due, then retries failed deliveries whose wait is over. */
  async runDue(tenantId: string): Promise<{ campaigns: number; retried: number }> {
    const now = this.clock.now();
    const due = await this.db.withTenant(tenantId, (tx) => tx.select({ id: messageCampaigns.id }).from(messageCampaigns).where(and(eq(messageCampaigns.status, 'scheduled'), lte(messageCampaigns.sendAt, now))));
    for (const c of due) await this.dispatch(tenantId, c.id);
    const retry = await this.db.withTenant(tenantId, (tx) =>
      tx.select({ id: messageDeliveries.id, campaignId: messageDeliveries.campaignId }).from(messageDeliveries).where(and(eq(messageDeliveries.status, 'failed'), isNotNull(messageDeliveries.nextAttemptAt), lte(messageDeliveries.nextAttemptAt, now))),
    );
    for (const d of retry) await this.attempt(tenantId, d.id);
    for (const id of new Set(retry.map((d) => d.campaignId))) await this.recount(tenantId, id);
    if (due.length || retry.length) this.log.log(`Comms for ${tenantId}: ${due.length} campaign(s), ${retry.length} retr${retry.length === 1 ? 'y' : 'ies'}`);
    return { campaigns: due.length, retried: retry.length };
  }

  /** Builds the deliveries of a scheduled campaign and sends them one by one. */
  async dispatch(tenantId: string, campaignId: string): Promise<{ sent: number; failed: number } | null> {
    const prepared = await this.db.withTenant(tenantId, async (tx) => {
      const [c] = await tx.select().from(messageCampaigns).where(eq(messageCampaigns.id, campaignId)).for('update');
      if (!c || c.status !== 'scheduled') return null;
      const [a] = await tx.select().from(audienceRules).where(eq(audienceRules.id, c.audienceId));
      const [t] = await tx.select().from(messageTemplates).where(eq(messageTemplates.id, c.templateId));
      const ids = await this.audienceUsers(tx, a.rule);
      await tx.update(messageCampaigns).set({ status: 'sending', recipients: ids.length }).where(eq(messageCampaigns.id, campaignId));
      if (ids.length) await tx.insert(messageDeliveries).values(ids.map((userId) => ({ tenantId, campaignId, userId, channel: t.channel }))).onConflictDoNothing();
      return (await tx.select({ id: messageDeliveries.id }).from(messageDeliveries).where(eq(messageDeliveries.campaignId, campaignId))).map((d) => d.id);
    });
    if (!prepared) return null;
    for (const id of prepared) await this.attempt(tenantId, id);
    return this.recount(tenantId, campaignId);
  }

  /** One send attempt: fill the text for the recipient, hand it to the channel, record the outcome. */
  async attempt(tenantId: string, deliveryId: string): Promise<void> {
    const ctx = await this.db.withTenant(tenantId, async (tx) => {
      const [d] = await tx.select().from(messageDeliveries).where(eq(messageDeliveries.id, deliveryId));
      if (!d || d.status === 'sent' || d.status === 'read') return null;
      const [c] = await tx.select().from(messageCampaigns).where(eq(messageCampaigns.id, d.campaignId));
      const [u] = await tx.select().from(users).where(eq(users.id, d.userId));
      const [t0] = await tx.select().from(messageTemplates).where(eq(messageTemplates.id, c.templateId));
      // The recipient's own language when the institution wrote the template in it.
      const [local] = await tx.select().from(messageTemplates).where(and(eq(messageTemplates.key, t0.key), eq(messageTemplates.channel, t0.channel), eq(messageTemplates.locale, u.preferredLanguage), eq(messageTemplates.active, true)));
      const [ten] = await tx.select({ name: tenants.name }).from(tenants);
      return { d, c, u, t: local ?? t0, institution: ten?.name ?? '' };
    });
    if (!ctx) return;
    const { d, c, u, t, institution } = ctx;
    const vars = { name: u.fullName, institution, ...c.vars };
    const body = fillTemplate(t.body, vars);
    const subject = fillTemplate(t.subject || c.title, vars).text;
    let error: string | null = null;
    try {
      error = await this.deliver(tenantId, t, u, d, subject, body.text, vars);
    } catch (e) {
      error = (e as Error).message.slice(0, 300);
    }
    await this.db.withTenant(tenantId, async (tx) => {
      const attempts = d.attempts + 1;
      if (!error) await tx.update(messageDeliveries).set({ status: 'sent', attempts, error: null, nextAttemptAt: null, sentAt: this.clock.now() }).where(eq(messageDeliveries.id, d.id));
      else {
        const wait = retryDelayMinutes(attempts);
        await tx.update(messageDeliveries).set({ status: 'failed', attempts, error, nextAttemptAt: wait === null ? null : new Date(this.clock.now().getTime() + wait * 60_000) }).where(eq(messageDeliveries.id, d.id));
      }
    });
  }

  /** Returns an error message, or null when the channel accepted the message. */
  private async deliver(tenantId: string, t: Template, u: typeof users.$inferSelect, d: typeof messageDeliveries.$inferSelect, subject: string, text: string, vars: Record<string, string>): Promise<string | null> {
    switch (t.channel) {
      case 'in_app': {
        await this.db.withTenant(tenantId, (tx) =>
          tx.insert(notifications).values({ tenantId, userId: u.id, kind: 'broadcast', title: subject.slice(0, 160), body: text.slice(0, 1000), data: { campaignId: d.campaignId }, dedupeKey: `campaign:${d.campaignId}:${u.id}` }).onConflictDoNothing(),
        );
        return null;
      }
      case 'email':
        if (!u.email) return 'No email address on file';
        await this.mailer.send({ to: [u.email], subject, text, attachments: [] });
        return null;
      case 'sms': {
        const to = toE164(u.phone);
        if (!to) return 'No valid mobile number on file';
        if (!t.dltTemplateId) return 'This text has no registered (DLT) template id';
        await this.sms.send({ to, text, templateId: t.dltTemplateId, vars });
        return null;
      }
      case 'whatsapp': {
        const to = toE164(u.phone);
        if (!to) return 'No valid mobile number on file';
        await this.whatsapp.send(to, t.key, vars);
        return null;
      }
      default:
        return `Unknown channel ${t.channel}`;
    }
  }

  /** Brings the campaign's counters in line with its deliveries, and marks it sent once nothing is waiting. */
  async recount(tenantId: string, campaignId: string): Promise<{ sent: number; failed: number }> {
    return this.db.withTenant(tenantId, async (tx) => {
      await this.syncReads(tx, campaignId);
      const rows = await tx.select({ status: messageDeliveries.status, n: sql<number>`count(*)::int` }).from(messageDeliveries).where(eq(messageDeliveries.campaignId, campaignId)).groupBy(messageDeliveries.status);
      const n = (s: string) => rows.find((r) => r.status === s)?.n ?? 0;
      const sent = n('sent') + n('read');
      const failed = n('failed');
      const queued = n('queued');
      const [pending] = await tx.select({ n: sql<number>`count(*)::int` }).from(messageDeliveries).where(and(eq(messageDeliveries.campaignId, campaignId), eq(messageDeliveries.status, 'failed'), isNotNull(messageDeliveries.nextAttemptAt)));
      const [c] = await tx.select().from(messageCampaigns).where(eq(messageCampaigns.id, campaignId));
      const done = c.status === 'sending' && queued === 0 && pending.n === 0;
      await tx.update(messageCampaigns).set({ sentCount: sent, failedCount: failed, ...(done ? { status: 'sent' } : {}) }).where(eq(messageCampaigns.id, campaignId));
      if (done) await audit(tx, { tenantId, actorType: 'system', action: 'comms.campaign_sent', subjectType: 'message_campaign', subjectId: campaignId, data: { sent, failed, maxAttempts: MAX_ATTEMPTS } });
      return { sent, failed };
    });
  }

  /** In-app deliveries become "read" when the recipient has opened the notification. */
  async syncReads(tx: Tx, campaignId: string): Promise<void> {
    await tx.execute(sql`
      update message_deliveries d set status = 'read', read_at = n.read_at
      from notifications n
      where d.campaign_id = ${campaignId}::uuid and d.channel = 'in_app' and d.status = 'sent'
        and n.user_id = d.user_id and n.dedupe_key = 'campaign:' || d.campaign_id::text || ':' || d.user_id::text and n.read_at is not null`);
  }
}
