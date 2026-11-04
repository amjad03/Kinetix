import { timingSafeEqual } from 'node:crypto';
import { BadRequestException, Body, Controller, Get, Header, HttpCode, Logger, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { audit } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { NOTICE_VERSION } from '../consent/consent.controller.js';
import { DbService, type Tx } from '../db/db.service.js';
import { conversations, messages, users } from '../db/schema.js';
import { contactSuppressions } from '../db/schema-life.js';
import { commChannelPrefs, commChannelSettings, commWebhookEvents } from '../db/schema-comms.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { isStartWord, isStopWord } from './comms.logic.js';
import { CommsService } from './comms.service.js';
import { isSnsUrl, parseSes, parseSms, parseWhatsApp, PROVIDER_CHANNEL, type ProviderEvent } from './webhooks.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Providers' callbacks: delivery reports (MSG91, Kaleyra, Gupshup, WhatsApp, SES), email bounces and complaints, and
 * replies. Public, authenticated by the institution's secret in the URL (Communication > Channels shows it). Every
 * event is applied once: a repeated callback changes nothing. STOP replies opt the number out of that channel; other
 * replies from a parent go into their latest conversation with the school.
 */
@Controller('v1/comms/webhooks')
export class CommsWebhooksController {
  private readonly log = new Logger(CommsWebhooksController.name);

  constructor(
    private readonly db: DbService,
    private readonly comms: CommsService,
    private readonly clock: Clock,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Meta's subscription check: answers the challenge when the verify token is the institution's secret. The echo is
   * plain text and only a short token (Meta sends digits), so the API never reflects caller-chosen HTML.
   */
  @Get(':provider/:tenantId/:token')
  @Header('content-type', 'text/plain; charset=utf-8')
  async verify(@Param('provider') provider: string, @Param('tenantId') tenantId: string, @Param('token') token: string, @Query('hub.challenge') challenge?: string) {
    await this.authenticate(provider, tenantId, token);
    if (challenge !== undefined && !/^[\w.-]{1,200}$/.test(challenge)) throw new BadRequestException('hub.challenge must be a short token');
    return challenge ?? 'ok';
  }

  @Post(':provider/:tenantId/:token')
  @HttpCode(200)
  async receive(@Param('provider') provider: string, @Param('tenantId') tenantId: string, @Param('token') token: string, @Body() body: unknown) {
    await this.authenticate(provider, tenantId, token);
    const channel = PROVIDER_CHANNEL[provider];
    const events = channel === 'email' ? parseSes(body) : channel === 'whatsapp' ? parseWhatsApp(body) : parseSms(provider, body);
    let applied = 0;
    let unmatched = 0;
    for (const e of events) {
      if (e.kind === 'subscribe') {
        // Confirm the SNS subscription (only on Amazon's own hosts).
        if (isSnsUrl(e.url)) await fetch(e.url, { signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
        continue;
      }
      const result = await this.db.withTenant(tenantId, async (tx) => {
        const [fresh] = await tx.insert(commWebhookEvents).values({ tenantId, provider, eventKey: e.key.slice(0, 300), kind: e.kind }).onConflictDoNothing().returning({ id: commWebhookEvents.id });
        if (!fresh) return 'repeat';
        return this.apply(tx, tenantId, provider, channel, e);
      });
      if (result === 'applied') applied++;
      if (result === 'unmatched') unmatched++;
    }
    if (unmatched) this.log.warn(`${provider} callback for ${tenantId}: ${unmatched} event(s) matched no send`);
    return { received: events.length, applied, unmatched };
  }

  private async authenticate(provider: string, tenantId: string, token: string): Promise<void> {
    const channel = PROVIDER_CHANNEL[provider];
    if (!channel || !UUID.test(tenantId) || !/^[0-9a-f]{16,64}$/i.test(token)) throw new NotFoundException();
    const [s] = await this.db.withTenant(tenantId, (tx) => tx.select({ token: commChannelSettings.webhookToken }).from(commChannelSettings).where(eq(commChannelSettings.channel, channel)));
    if (!s || s.token.length !== token.length || !timingSafeEqual(Buffer.from(s.token), Buffer.from(token))) throw new NotFoundException();
  }

  private async apply(tx: Tx, tenantId: string, provider: string, channel: 'sms' | 'whatsapp' | 'email', e: Exclude<ProviderEvent, { kind: 'subscribe' }>): Promise<'applied' | 'unmatched'> {
    const at = this.clock.now();
    switch (e.kind) {
      case 'report':
        return (await this.comms.applyReport(tx, tenantId, { provider, providerMessageId: e.messageId, status: e.status, error: e.error, at })) ? 'applied' : 'unmatched';
      case 'bounce': {
        if (e.messageId) await this.comms.applyReport(tx, tenantId, { provider, providerMessageId: e.messageId, status: e.permanent ? 'bounced' : 'failed', error: e.reason, at });
        if (!e.permanent || !e.email) return 'applied';
        const [u] = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${e.email}`);
        await tx.insert(contactSuppressions).values({ tenantId, channel: 'email', address: e.email, userId: u?.id ?? null, reason: 'bounced', note: e.reason.slice(0, 200) }).onConflictDoNothing();
        await audit(tx, { tenantId, actorType: 'system', action: 'comms.email_bounced', subjectType: 'contact_suppression', data: { provider, user: u?.id ?? null } });
        return 'applied';
      }
      case 'complaint': {
        const [u] = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${e.email}`);
        await tx.insert(contactSuppressions).values({ tenantId, channel: 'email', address: e.email, userId: u?.id ?? null, reason: 'opted_out', note: 'Marked the email as spam' }).onConflictDoNothing();
        if (u) await tx.insert(commChannelPrefs).values({ tenantId, userId: u.id, channel: 'email', granted: false, source: 'reply_stop', noticeVersion: NOTICE_VERSION, note: 'Marked an email as spam' });
        return 'applied';
      }
      case 'reply':
        return this.reply(tx, tenantId, channel, e);
    }
  }

  /** STOP / START change the person's choice for the channel; anything else goes into their latest conversation. */
  private async reply(tx: Tx, tenantId: string, channel: 'sms' | 'whatsapp' | 'email', e: Extract<ProviderEvent, { kind: 'reply' }>): Promise<'applied' | 'unmatched'> {
    const last10 = e.from.replace(/\D/g, '').slice(-10);
    if (last10.length < 10) return 'unmatched';
    const people = await tx.select({ id: users.id }).from(users).where(sql`right(regexp_replace(coalesce(${users.phone}, ''), '\\D', '', 'g'), 10) = ${last10}`);
    if (!people.length) return 'unmatched';
    const prefChannel = channel === 'whatsapp' ? 'whatsapp' : 'sms';
    if (isStopWord(e.text) || isStartWord(e.text)) {
      const granted = isStartWord(e.text);
      await tx.insert(commChannelPrefs).values(people.map((p) => ({ tenantId, userId: p.id, channel: prefChannel as 'sms', granted, source: 'reply_stop' as const, noticeVersion: NOTICE_VERSION, note: `Replied "${e.text.trim().slice(0, 40)}"` })));
      await audit(tx, { tenantId, actorType: 'system', action: granted ? 'comms.channel_opt_in' : 'comms.channel_opt_out', subjectType: 'comm_channel_pref', data: { channel: prefChannel, source: 'reply', people: people.length } });
      return 'applied';
    }
    const [c] = await tx
      .select()
      .from(conversations)
      .where(and(inArray(conversations.familyId, people.map((p) => p.id)), eq(conversations.status, 'open')))
      .orderBy(sql`${conversations.lastMessageAt} desc nulls last`)
      .limit(1);
    if (!c) return 'unmatched';
    const [m] = await tx.insert(messages).values({ tenantId, conversationId: c.id, senderId: c.familyId, body: `${e.text} (by ${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'})`, createdAt: this.clock.now() }).returning();
    await tx.update(conversations).set({ lastMessageAt: this.clock.now() }).where(eq(conversations.id, c.id));
    const [sender] = await tx.select({ fullName: users.fullName }).from(users).where(eq(users.id, c.familyId));
    await this.notifications.messageSent(tx, { id: m.id, conversationId: c.id, recipientId: c.staffId, senderName: sender?.fullName ?? '', body: e.text, studentId: c.studentId });
    return 'applied';
  }
}
