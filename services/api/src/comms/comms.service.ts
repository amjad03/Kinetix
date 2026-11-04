import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { and, desc, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { Mailer } from '../analytics/mailer.js';
import { audit } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { DbService, type Tx } from '../db/db.service.js';
import { announcementRecipients, departments, guardians, notifications, staffProfiles, students, tenants, userRoles, users } from '../db/schema.js';
import { audienceRules, messageCampaigns, messageDeliveries, messageTemplates } from '../db/schema-pathways.js';
import { contactSuppressions } from '../db/schema-life.js';
import { commChannelPrefs, commChannelSettings, commCreditLedger, commSendLog, type SendStatus } from '../db/schema-comms.js';
import { JobsService, type Job } from '../jobs/jobs.service.js';
import { qualitySettings } from '../quality-hub/settings.catalogue.js';
import { TextSender, WhatsAppSender, type SendReceipt } from './channels.js';
import { MAX_ATTEMPTS, channelChain, fillTemplate, maskAddress, nextOccurrence, quietUntil, retryDelayMinutes, smsUnits, toE164, waParams, type ReportStatus } from './comms.logic.js';

export const COMMS_RUN = 'comms.run';
type Rule = typeof audienceRules.$inferSelect.rule;
type Template = typeof messageTemplates.$inferSelect;
type Delivery = typeof messageDeliveries.$inferSelect;
type Campaign = typeof messageCampaigns.$inferSelect;
type User = typeof users.$inferSelect;
type Settings = typeof commChannelSettings.$inferSelect;

const LABEL: Record<string, string> = { sms: 'SMS', whatsapp: 'WhatsApp', email: 'email', in_app: 'in-app' };

/** What the checks before a send decided. */
type Gate =
  | { kind: 'send'; template: Template; address: string; text: string; subject: string; vars: Record<string, string>; units: number; costPaise: number; charge: boolean; settings: Settings | null }
  | { kind: 'skip'; status: 'suppressed' | 'failed'; reason: string; address: string }
  | { kind: 'defer'; until: Date; reason: string };

/** The latest choice per channel of the given people: true opted in, false opted out (missing = never asked). */
export async function latestPrefs(tx: Tx, userIds: string[]): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  if (userIds.length === 0) return out;
  const rows = await tx
    .selectDistinctOn([commChannelPrefs.userId, commChannelPrefs.channel], { userId: commChannelPrefs.userId, channel: commChannelPrefs.channel, granted: commChannelPrefs.granted })
    .from(commChannelPrefs)
    .where(inArray(commChannelPrefs.userId, userIds))
    .orderBy(commChannelPrefs.userId, commChannelPrefs.channel, desc(commChannelPrefs.createdAt));
  for (const r of rows) out.set(`${r.userId}:${r.channel}`, r.granted);
  return out;
}

/** A member of staff's department: their own, else the one they head. Used to cost messages by department. */
export async function departmentOf(tx: Tx, userId: string): Promise<string | null> {
  const [p] = await tx.select({ id: staffProfiles.departmentId }).from(staffProfiles).where(eq(staffProfiles.userId, userId));
  if (p?.id) return p.id;
  const [h] = await tx.select({ id: departments.id }).from(departments).where(eq(departments.headUserId, userId)).limit(1);
  return h?.id ?? null;
}

/** Units of credit left on a channel (top-ups minus spends). */
export async function creditBalance(tx: Tx, channel: string): Promise<number> {
  const [r] = await tx.select({ n: sql<number>`coalesce(sum(${commCreditLedger.units}), 0)::int` }).from(commCreditLedger).where(eq(commCreditLedger.channel, channel as 'sms'));
  return r.n;
}

/**
 * The communication engine: audiences by rule (or an announcement's recipients), templates per channel and language,
 * scheduled sends, a fallback chain across channels, retry with back-off, and read status for in-app messages.
 *
 * Before each hand-over: the person's consent for the channel (WhatsApp needs an opt-in), the do-not-contact list,
 * the channel switch, quiet hours (the send waits), hourly and daily caps (the send waits) and the channel's credits.
 * An emergency ignores quiet hours, caps, credits and opt-outs (DPDP Act s.7: safety and medical emergencies) but
 * never a bounced or invalid address, and WhatsApp still needs the opt-in. Every hand-over and hold-back is written to
 * the send log with its cost; providers' delivery reports update it (CommsWebhooksController).
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

  /** Sends every scheduled campaign that is due, then the deliveries whose wait (retry, quiet hours, cap, fallback) is over. */
  async runDue(tenantId: string): Promise<{ campaigns: number; retried: number }> {
    const now = this.clock.now();
    const due = await this.db.withTenant(tenantId, (tx) => tx.select({ id: messageCampaigns.id }).from(messageCampaigns).where(and(eq(messageCampaigns.status, 'scheduled'), lte(messageCampaigns.sendAt, now))));
    for (const c of due) await this.dispatch(tenantId, c.id);
    const retry = await this.db.withTenant(tenantId, (tx) =>
      tx
        .select({ id: messageDeliveries.id, campaignId: messageDeliveries.campaignId })
        .from(messageDeliveries)
        .where(and(or(eq(messageDeliveries.status, 'failed'), eq(messageDeliveries.status, 'queued')), isNotNull(messageDeliveries.nextAttemptAt), lte(messageDeliveries.nextAttemptAt, now))),
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
      const [t] = await tx.select().from(messageTemplates).where(eq(messageTemplates.id, c.templateId));
      let ids: string[];
      if (c.announcementId) ids = (await tx.selectDistinct({ id: announcementRecipients.userId }).from(announcementRecipients).where(eq(announcementRecipients.announcementId, c.announcementId))).map((r) => r.id);
      else {
        const [a] = await tx.select().from(audienceRules).where(eq(audienceRules.id, c.audienceId!));
        ids = a ? await this.audienceUsers(tx, a.rule) : [];
      }
      await tx.update(messageCampaigns).set({ status: 'sending', recipients: ids.length }).where(eq(messageCampaigns.id, campaignId));
      for (let i = 0; i < ids.length; i += 1000) await tx.insert(messageDeliveries).values(ids.slice(i, i + 1000).map((userId) => ({ tenantId, campaignId, userId, channel: t.channel }))).onConflictDoNothing();
      return (await tx.select({ id: messageDeliveries.id }).from(messageDeliveries).where(and(eq(messageDeliveries.campaignId, campaignId), eq(messageDeliveries.status, 'queued'), isNull(messageDeliveries.nextAttemptAt)))).map((d) => d.id);
    });
    if (!prepared) return null;
    for (const id of prepared) await this.attempt(tenantId, id);
    return this.recount(tenantId, campaignId);
  }

  /** Works one delivery along its channel chain until a channel takes it, it must wait, or the chain is used up. */
  async attempt(tenantId: string, deliveryId: string): Promise<void> {
    for (let guard = 0; guard < 6; guard++) if ((await this.step(tenantId, deliveryId)) !== 'next') return;
  }

  /** One channel of the chain: check, hand over, record. 'next' when the delivery moved on to the next channel. */
  private async step(tenantId: string, deliveryId: string): Promise<'done' | 'next'> {
    const now = this.clock.now();
    const ctx = await this.db.withTenant(tenantId, async (tx) => {
      const [d] = await tx.select().from(messageDeliveries).where(eq(messageDeliveries.id, deliveryId));
      if (!d || d.status === 'sent' || d.status === 'read' || d.status === 'suppressed') return null;
      if (d.status === 'failed' && !d.nextAttemptAt) return null;
      const [c] = await tx.select().from(messageCampaigns).where(eq(messageCampaigns.id, d.campaignId));
      const [u] = await tx.select().from(users).where(eq(users.id, d.userId));
      const chain = await this.chainOf(tx, c);
      const gate = await this.gate(tx, d, c, u, chain[d.step] ?? d.channel, now);
      return { d, c, u, chain, gate };
    });
    if (!ctx) return 'done';
    const { d, c, u, chain, gate } = ctx;
    if (gate.kind === 'defer') {
      await this.db.withTenant(tenantId, async (tx) => {
        await tx.update(messageDeliveries).set({ status: 'queued', nextAttemptAt: gate.until, deferredReason: gate.reason }).where(eq(messageDeliveries.id, d.id));
        await this.logSend(tx, c, d, u, { status: 'deferred', error: gate.reason, address: '' });
      });
      return 'done';
    }
    if (gate.kind === 'skip') {
      return this.db.withTenant(tenantId, async (tx) => {
        await this.logSend(tx, c, d, u, { status: gate.status, error: gate.reason, address: gate.address });
        return this.advance(tx, d, chain, gate.reason, gate.status);
      });
    }
    let receipt: SendReceipt = {};
    let error: string | null = null;
    try {
      receipt = await this.handOver(tenantId, d, u, gate);
    } catch (e) {
      error = (e as Error).message.slice(0, 300);
    }
    return this.db.withTenant(tenantId, async (tx) => {
      const attempts = d.attempts + 1;
      if (!error) {
        const [log] = await this.logSend(tx, c, d, u, { status: 'accepted', address: gate.address, providerMessageId: receipt.providerMessageId, units: gate.units, costPaise: gate.costPaise, provider: this.providerOf(d.channel) });
        if (gate.costPaise > 0 || gate.charge) await tx.insert(commCreditLedger).values({ tenantId, channel: d.channel as 'sms', kind: 'spend', units: -gate.units, amountPaise: -gate.costPaise, note: c.title.slice(0, 120), sendId: log.id });
        await tx.update(messageDeliveries).set({ status: 'sent', attempts, error: null, nextAttemptAt: null, deferredReason: null, sentAt: this.clock.now(), costPaise: d.costPaise + gate.costPaise }).where(eq(messageDeliveries.id, d.id));
        return 'done';
      }
      await this.logSend(tx, c, d, u, { status: 'failed', address: gate.address, error, provider: this.providerOf(d.channel) });
      const wait = retryDelayMinutes(attempts);
      if (wait !== null) {
        await tx.update(messageDeliveries).set({ status: 'failed', attempts, error, nextAttemptAt: new Date(this.clock.now().getTime() + wait * 60_000) }).where(eq(messageDeliveries.id, d.id));
        return 'done';
      }
      return this.advance(tx, { ...d, attempts }, chain, error, 'failed');
    });
  }

  /** Moves a delivery to the next channel of its chain, or leaves it as failed or suppressed when there is none. */
  private async advance(tx: Tx, d: Delivery, chain: string[], reason: string, finalStatus: 'failed' | 'suppressed'): Promise<'done' | 'next'> {
    const next = d.step + 1;
    if (next < chain.length) {
      await tx.update(messageDeliveries).set({ step: next, channel: chain[next], status: 'queued', attempts: 0, error: `${LABEL[d.channel] ?? d.channel}: ${reason}`.slice(0, 300), nextAttemptAt: null, deferredReason: null }).where(eq(messageDeliveries.id, d.id));
      return 'next';
    }
    await tx.update(messageDeliveries).set({ status: finalStatus, attempts: d.attempts, error: reason.slice(0, 300), nextAttemptAt: null, deferredReason: null }).where(eq(messageDeliveries.id, d.id));
    return 'done';
  }

  private async chainOf(tx: Tx, c: Campaign): Promise<string[]> {
    const [t] = await tx.select({ channel: messageTemplates.channel }).from(messageTemplates).where(eq(messageTemplates.id, c.templateId));
    return channelChain(t.channel, c.fallback);
  }

  private providerOf(channel: string): string {
    if (channel === 'sms') return this.sms.provider;
    if (channel === 'whatsapp') return this.whatsapp.provider;
    if (channel === 'email') return this.mailer.provider;
    return 'app';
  }

  /** The checks before a hand-over, in the order the office would ask them. */
  private async gate(tx: Tx, d: Delivery, c: Campaign, u: User, channel: string, now: Date): Promise<Gate> {
    const template = await this.templateFor(tx, c, channel, u.preferredLanguage);
    if (!template) return { kind: 'skip', status: 'failed', reason: `No ${LABEL[channel] ?? channel} text for this message`, address: '' };
    const [ten] = await tx.select({ name: tenants.name, timezone: tenants.timezone }).from(tenants);
    const vars = { name: u.fullName, institution: ten?.name ?? '', ...c.vars };
    const text = fillTemplate(template.body, vars).text;
    const subject = fillTemplate(template.subject || c.title, vars).text;
    if (channel === 'in_app') return { kind: 'send', template, address: '', text, subject, vars, units: 0, costPaise: 0, charge: false, settings: null };

    const [settings] = await tx.select().from(commChannelSettings).where(eq(commChannelSettings.channel, channel as 'sms'));
    if (settings && !settings.enabled) return { kind: 'skip', status: 'failed', reason: `${LABEL[channel]} is switched off for the institution`, address: '' };
    const address = channel === 'email' ? (u.email ?? '') : (toE164(u.phone) ?? '');
    const masked = maskAddress(address);
    if (!address) return { kind: 'skip', status: 'failed', reason: channel === 'email' ? 'No email address on file' : 'No valid mobile number on file', address: '' };

    const choice = (await latestPrefs(tx, [u.id])).get(`${u.id}:${channel}`);
    if (channel === 'whatsapp' && choice !== true) return { kind: 'skip', status: 'suppressed', reason: 'Has not opted in to WhatsApp', address: masked };
    if (choice === false && !c.emergency) return { kind: 'skip', status: 'suppressed', reason: `Opted out of ${LABEL[channel]}`, address: masked };
    const block = await this.suppressed(tx, channel, u, address);
    if (block && (block === 'bounced' || block === 'invalid' || !c.emergency)) return { kind: 'skip', status: 'suppressed', reason: `Not sent: ${block.replace('_', ' ')}`, address: masked };

    if (channel === 'sms' && !template.dltTemplateId) return { kind: 'skip', status: 'failed', reason: 'This text has no registered (DLT) template id', address: masked };
    if (channel === 'whatsapp' && !this.whatsapp.connected) return { kind: 'skip', status: 'failed', reason: 'WhatsApp Business is not connected for this institution', address: masked };

    const tz = ten?.timezone || 'Asia/Kolkata';
    if (!c.emergency) {
      if (channel !== 'email') {
        const quiet = await qualitySettings(tx, c.tenantId, 'communication');
        if (quiet.rules.quietHoursOn) {
          const until = quietUntil(now, tz, Number(quiet.rules.quietHoursStart), Number(quiet.rules.quietHoursEnd));
          if (until) return { kind: 'defer', until, reason: 'quiet_hours' };
        }
      }
      if (settings?.hourlyLimit) {
        const hourAgo = new Date(now.getTime() - 3600_000);
        const [n] = await tx.select({ n: sql<number>`count(*)::int`, first: sql<string | null>`min(${commSendLog.attemptedAt})` }).from(commSendLog).where(and(eq(commSendLog.channel, channel), eq(commSendLog.status, 'accepted'), gte(commSendLog.attemptedAt, hourAgo)));
        if (n.n >= settings.hourlyLimit) return { kind: 'defer', until: new Date(new Date(n.first ?? now).getTime() + 3600_000 + 60_000), reason: 'hourly_limit' };
      }
      if (settings?.dailyLimit) {
        const dayStart = startOfLocalDay(now, tz);
        const [n] = await tx.select({ n: sql<number>`count(*)::int` }).from(commSendLog).where(and(eq(commSendLog.channel, channel), eq(commSendLog.status, 'accepted'), gte(commSendLog.attemptedAt, dayStart)));
        if (n.n >= settings.dailyLimit) return { kind: 'defer', until: new Date(dayStart.getTime() + 24 * 3600_000 + 5 * 60_000), reason: 'daily_limit' };
      }
    }
    const units = channel === 'sms' ? smsUnits(text) : 1;
    const unitCost = settings?.unitCostPaise ?? 0;
    const charge = unitCost > 0;
    if (charge && !c.emergency) {
      const balance = await creditBalance(tx, channel);
      if (balance < units) return { kind: 'skip', status: 'failed', reason: `Not enough ${LABEL[channel]} credits (${balance} left, ${units} needed)`, address: masked };
    }
    return { kind: 'send', template, address, text, subject, vars, units, costPaise: units * unitCost, charge, settings: settings ?? null };
  }

  /** The text for a channel in the reader's language: the campaign's own template, or the one with its key on that channel. */
  private async templateFor(tx: Tx, c: Campaign, channel: string, locale: string): Promise<Template | null> {
    const [t0] = await tx.select().from(messageTemplates).where(eq(messageTemplates.id, c.templateId));
    const rows = await tx.select().from(messageTemplates).where(and(eq(messageTemplates.key, t0.key), eq(messageTemplates.channel, channel), eq(messageTemplates.active, true)));
    return rows.find((r) => r.locale === locale) ?? (t0.channel === channel ? t0 : null) ?? rows.find((r) => r.locale === 'en') ?? rows[0] ?? null;
  }

  /** The do-not-contact reason for this person on this channel, or null. */
  private async suppressed(tx: Tx, channel: string, u: User, address: string): Promise<string | null> {
    const match =
      channel === 'email'
        ? sql`(${contactSuppressions.userId} = ${u.id}::uuid or lower(${contactSuppressions.address}) = lower(${address}))`
        : sql`(${contactSuppressions.userId} = ${u.id}::uuid or right(regexp_replace(${contactSuppressions.address}, '\\D', '', 'g'), 10) = ${address.replace(/\D/g, '').slice(-10)})`;
    const rows = await tx.select({ reason: contactSuppressions.reason }).from(contactSuppressions).where(and(inArray(contactSuppressions.channel, [channel as 'sms', 'all']), match));
    const order = ['bounced', 'invalid', 'opted_out', 'dnd'];
    return rows.map((r) => r.reason).sort((a, b) => order.indexOf(a) - order.indexOf(b))[0] ?? null;
  }

  /** Hands the message to the channel. Throws when the channel did not take it. */
  private async handOver(tenantId: string, d: Delivery, u: User, g: Extract<Gate, { kind: 'send' }>): Promise<SendReceipt> {
    const t = g.template;
    switch (d.channel) {
      case 'in_app':
        await this.db.withTenant(tenantId, (tx) =>
          tx.insert(notifications).values({ tenantId, userId: u.id, kind: 'broadcast', title: g.subject.slice(0, 160), body: g.text.slice(0, 1000), data: { campaignId: d.campaignId }, dedupeKey: `campaign:${d.campaignId}:${u.id}` }).onConflictDoNothing(),
        );
        return {};
      case 'email': {
        const r = await this.mailer.send({ to: [g.address], subject: g.subject, text: g.text, attachments: [] });
        return r ?? {};
      }
      case 'sms':
        return this.sms.send({ to: g.address, text: g.text, templateId: t.dltTemplateId!, vars: g.vars, header: t.dltHeader || g.settings?.senderId || undefined, entityId: g.settings?.dltEntityId || undefined, contentType: t.dltContentType });
      case 'whatsapp':
        return this.whatsapp.send({ to: g.address, template: t.waTemplateName || t.key, language: t.waLanguage || t.locale, params: waParams(t.body, g.vars), phoneNumberId: g.settings?.senderId || undefined });
      default:
        throw new Error(`Unknown channel ${d.channel}`);
    }
  }

  private async logSend(tx: Tx, c: Campaign, d: Delivery, u: User, r: { status: SendStatus; address: string; error?: string | null; providerMessageId?: string; units?: number; costPaise?: number; provider?: string }) {
    return tx
      .insert(commSendLog)
      .values({
        tenantId: c.tenantId,
        sourceType: c.announcementId ? 'announcement' : 'campaign',
        sourceId: c.announcementId ?? c.id,
        deliveryId: d.id,
        userId: u.id,
        channel: d.channel,
        provider: r.provider ?? this.providerOf(d.channel),
        address: r.address.includes('*') || !r.address ? r.address : maskAddress(r.address),
        status: r.status,
        providerMessageId: r.providerMessageId ?? null,
        units: r.units ?? 0,
        costPaise: r.costPaise ?? 0,
        error: r.error ?? null,
        departmentId: c.departmentId,
        sentBy: c.createdBy,
        emergency: c.emergency,
        step: d.step,
        attemptedAt: this.clock.now(),
        statusAt: this.clock.now(),
      })
      .returning({ id: commSendLog.id });
  }

  /**
   * A provider's delivery report for a message it took. Delivered and read update the log and the delivery; a failure
   * sends the delivery on to the next channel of its chain at the next run; a bounce also puts the address on the
   * do-not-contact list. Returns false when no send has that provider id.
   */
  async applyReport(tx: Tx, tenantId: string, r: { provider: string; providerMessageId: string; status: ReportStatus; error?: string; at: Date }): Promise<boolean> {
    const [log] = await tx.select().from(commSendLog).where(and(eq(commSendLog.provider, r.provider), eq(commSendLog.providerMessageId, r.providerMessageId)));
    if (!log) return false;
    // Never step back: a late "delivered" after "read" changes nothing.
    const rank: Record<string, number> = { accepted: 1, delivered: 2, read: 3, failed: 2, bounced: 2 };
    if ((rank[r.status] ?? 0) < (rank[log.status] ?? 0) || log.status === r.status) return true;
    await tx.update(commSendLog).set({ status: r.status, statusAt: r.at, error: r.error ?? log.error }).where(eq(commSendLog.id, log.id));
    if (r.status === 'bounced' && log.userId && log.channel === 'email') {
      const [u] = await tx.select({ email: users.email }).from(users).where(eq(users.id, log.userId));
      if (u?.email) await tx.insert(contactSuppressions).values({ tenantId, channel: 'email', address: u.email.toLowerCase(), userId: log.userId, reason: 'bounced', note: (r.error ?? 'Bounced').slice(0, 200) }).onConflictDoNothing();
    }
    if (!log.deliveryId) return true;
    const [d] = await tx.select().from(messageDeliveries).where(eq(messageDeliveries.id, log.deliveryId));
    if (!d || d.step !== log.step) return true;
    if (r.status === 'delivered') await tx.update(messageDeliveries).set({ deliveredAt: r.at }).where(eq(messageDeliveries.id, d.id));
    else if (r.status === 'read') await tx.update(messageDeliveries).set({ status: 'read', deliveredAt: d.deliveredAt ?? r.at, readAt: r.at }).where(eq(messageDeliveries.id, d.id));
    else if (d.status === 'sent') {
      const [c] = await tx.select().from(messageCampaigns).where(eq(messageCampaigns.id, d.campaignId));
      const chain = await this.chainOf(tx, c);
      const reason = r.status === 'bounced' ? 'Bounced' : (r.error ?? 'Not delivered');
      if (d.step + 1 < chain.length) {
        await tx.update(messageDeliveries).set({ step: d.step + 1, channel: chain[d.step + 1], status: 'queued', attempts: 0, error: `${LABEL[d.channel] ?? d.channel}: ${reason}`.slice(0, 300), nextAttemptAt: r.at }).where(eq(messageDeliveries.id, d.id));
        if (c.status === 'sent') await tx.update(messageCampaigns).set({ status: 'sending' }).where(eq(messageCampaigns.id, c.id));
      } else await tx.update(messageDeliveries).set({ status: 'failed', error: reason.slice(0, 300) }).where(eq(messageDeliveries.id, d.id));
    }
    return true;
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
      const [extra] = await tx
        .select({
          pending: sql<number>`count(*) filter (where ${messageDeliveries.status} = 'failed' and ${messageDeliveries.nextAttemptAt} is not null)::int`,
          delivered: sql<number>`count(${messageDeliveries.deliveredAt})::int`,
          cost: sql<number>`coalesce(sum(${messageDeliveries.costPaise}), 0)::int`,
        })
        .from(messageDeliveries)
        .where(eq(messageDeliveries.campaignId, campaignId));
      const [c] = await tx.select().from(messageCampaigns).where(eq(messageCampaigns.id, campaignId));
      const done = c.status === 'sending' && queued === 0 && extra.pending === 0;
      await tx.update(messageCampaigns).set({ sentCount: sent, failedCount: failed, suppressedCount: n('suppressed'), deliveredCount: extra.delivered, costPaise: extra.cost, ...(done ? { status: 'sent' } : {}) }).where(eq(messageCampaigns.id, campaignId));
      if (done) {
        await audit(tx, { tenantId, actorType: 'system', action: 'comms.campaign_sent', subjectType: 'message_campaign', subjectId: campaignId, data: { sent, failed, suppressed: n('suppressed'), costPaise: extra.cost, maxAttempts: MAX_ATTEMPTS } });
        // A recurring reminder schedules its next send (once: the unique parent link keeps a re-count from doubling it).
        const next = nextOccurrence(c.sendAt, c.repeat, c.repeatUntil);
        const [already] = next ? await tx.select({ id: messageCampaigns.id }).from(messageCampaigns).where(eq(messageCampaigns.parentCampaignId, campaignId)) : [];
        if (next && !already) {
          const [n2] = await tx
            .insert(messageCampaigns)
            .values({ tenantId, title: c.title, templateId: c.templateId, audienceId: c.audienceId, vars: c.vars, sendAt: next, repeat: c.repeat, repeatUntil: c.repeatUntil, parentCampaignId: campaignId, createdBy: c.createdBy, fallback: c.fallback, departmentId: c.departmentId })
            .returning({ id: messageCampaigns.id });
          await audit(tx, { tenantId, actorType: 'system', action: 'comms.campaign_scheduled', subjectType: 'message_campaign', subjectId: n2.id, data: { repeatOf: campaignId, sendAt: next.toISOString() } });
        }
      }
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

/** Midnight of the local day of `at` in a time zone. */
export function startOfLocalDay(at: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23', timeZone }).formatToParts(at);
  const get = (k: string) => Number(parts.find((p) => p.type === k)?.value ?? 0);
  const into = ((get('hour') % 24) * 3600 + get('minute') * 60 + get('second')) * 1000 + at.getUTCMilliseconds();
  return new Date(at.getTime() - into);
}
