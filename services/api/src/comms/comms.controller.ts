import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { quietHoursProblem } from '../quality-hub/settings.catalogue.js';
import { and, asc, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, BROADCAST_ROLES, CurrentPrincipal, STAFF_ADMIN_ROLES } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit, auditUser } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { orConflict } from '../common/ops.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { hodScope, outside } from './scope.js';
import { users } from '../db/schema.js';
import { audienceRules, messageCampaigns, messageDeliveries, messageTemplates } from '../db/schema-pathways.js';
import { WhatsAppSender } from './channels.js';
import { DLT_CONTENT_TYPES } from '../db/schema-comms.js';
import { CommsService, departmentOf } from './comms.service.js';
import { DLT_HEADER, DLT_ID, placeholders } from './comms.logic.js';

/** A head of department (and not also a principal or administrator): limited to their own department's messages. */
export const isHodOnly = (p: UserPrincipal) => p.roles.includes('hod') && !p.roles.some((r) => STAFF_ADMIN_ROLES.includes(r));

const TemplateBody = z.object({
  key: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_.-]{1,59}$/, 'Use a short key like fee_reminder'),
  channel: z.enum(['in_app', 'sms', 'email', 'whatsapp']),
  locale: z.enum(['en', 'hi', 'kn']).default('en'),
  subject: z.string().trim().max(160).default(''),
  body: z.string().trim().min(3).max(1000),
  dltTemplateId: z.string().trim().regex(DLT_ID, 'A DLT template id is 19 digits').optional(),
  /** The DLT header the template is registered under (6 letters, or 6 digits for promotional text). */
  dltHeader: z.string().trim().toUpperCase().regex(DLT_HEADER, 'A DLT header is 6 letters (or 6 digits for promotional text)').or(z.literal('')).default(''),
  dltContentType: z.enum(DLT_CONTENT_TYPES).default('service_implicit'),
  /** The approved WhatsApp template's name and language code. */
  waTemplateName: z.string().trim().regex(/^[a-z0-9_]{1,512}$/, 'WhatsApp template names are lower case letters, digits and _').or(z.literal('')).default(''),
  waLanguage: z.string().trim().regex(/^[a-z]{2}(_[A-Z]{2})?$/, 'Use a language code like en, hi or kn').or(z.literal('')).default(''),
  active: z.boolean().default(true),
});
const TemplateEdit = TemplateBody.pick({ subject: true, body: true, dltTemplateId: true, dltHeader: true, dltContentType: true, waTemplateName: true, waLanguage: true, active: true });
const AudienceRule = z
  .object({ roles: z.array(z.enum(['student', 'guardian', 'teacher', 'hod', 'principal', 'tenant_admin', 'librarian', 'accountant', 'hostel_warden', 'transport_manager'])).max(10).optional(), sectionIds: z.array(z.uuid()).max(100).optional(), userIds: z.array(z.uuid()).max(500).optional() })
  .refine((r) => !!r.roles?.length || !!r.sectionIds?.length || !!r.userIds?.length, 'Choose who the message is for');
const AudienceBody = z.object({ name: z.string().trim().min(2).max(80), rule: AudienceRule });
const CampaignBody = z.object({
  title: z.string().trim().min(2).max(160),
  templateId: z.uuid(),
  audienceId: z.uuid(),
  vars: z.record(z.string().max(60), z.string().max(300)).default({}),
  /** Leave out to send now. */
  sendAt: z.coerce.date().optional(),
  /** Recurring reminders: repeat after each send until this date. */
  repeat: z.enum(['none', 'daily', 'weekly', 'monthly']).default('none'),
  repeatUntil: z.iso.date().optional(),
  /** Channels to try in order when the template's own channel cannot reach someone. */
  fallback: z.array(z.enum(['in_app', 'whatsapp', 'sms', 'email'])).max(3).default([]),
  /** Principals and administrators only: ignores quiet hours, caps, credits and opt-outs. */
  emergency: z.boolean().default(false),
});

/** Message templates, saved audiences and scheduled campaigns across in-app, SMS, email and WhatsApp. */
@Controller('v1/comms')
export class CommsController {
  constructor(
    private readonly db: DbService,
    private readonly svc: CommsService,
    private readonly clock: Clock,
    private readonly whatsapp: WhatsAppSender,
  ) {}

  // ---- templates ---------------------------------------------------------------------------------

  @Get('templates')
  @Auth('user', BROADCAST_ROLES)
  templates(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select().from(messageTemplates).orderBy(asc(messageTemplates.key), asc(messageTemplates.channel), asc(messageTemplates.locale));
      return rows.map((t) => ({ ...t, placeholders: placeholders(`${t.subject} ${t.body}`) }));
    });
  }

  @Post('templates')
  @Auth('user', BROADCAST_ROLES)
  createTemplate(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(TemplateBody)) b: z.infer<typeof TemplateBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (b.channel === 'sms' && b.dltTemplateId && !b.dltHeader) throw new BadRequestException('Give the DLT header this template is registered under');
      const [row] = await orConflict('There is already a template with that key, channel and language', () => tx.insert(messageTemplates).values({ tenantId: p.tenantId, ...b, dltTemplateId: b.dltTemplateId ?? null }).returning());
      await auditUser(tx, p, 'comms.template_created', 'message_template', row.id, { key: b.key, channel: b.channel });
      return row;
    });
  }

  @Put('templates/:id')
  @Auth('user', BROADCAST_ROLES)
  updateTemplate(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(TemplateEdit)) b: z.infer<typeof TemplateEdit>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [before] = await tx.select().from(messageTemplates).where(eq(messageTemplates.id, id));
      if (!before) throw new NotFoundException('Template not found');
      if (before.channel === 'sms' && b.dltTemplateId && !b.dltHeader) throw new BadRequestException('Give the DLT header this template is registered under');
      const [row] = await tx
        .update(messageTemplates)
        .set({ subject: b.subject, body: b.body, dltTemplateId: b.dltTemplateId ?? null, dltHeader: b.dltHeader, dltContentType: b.dltContentType, waTemplateName: b.waTemplateName, waLanguage: b.waLanguage, active: b.active, updatedAt: sql`now()` })
        .where(eq(messageTemplates.id, id))
        .returning();
      // A changed body or DLT id must match what the operator registered: History keeps both.
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'comms.template_updated', subjectType: 'message_template', subjectId: id, before: { body: before.body, dltTemplateId: before.dltTemplateId, dltHeader: before.dltHeader, active: before.active }, after: { body: row.body, dltTemplateId: row.dltTemplateId, dltHeader: row.dltHeader, active: row.active } });
      return row;
    });
  }

  // ---- audiences ---------------------------------------------------------------------------------

  @Get('audiences')
  @Auth('user', BROADCAST_ROLES)
  audiences(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(audienceRules).where(isHodOnly(p) ? eq(audienceRules.createdBy, p.userId) : undefined).orderBy(asc(audienceRules.name)));
  }

  /** A head of department's audiences name classes of their department, or picked people; never a whole role. */
  private async assertHodRule(tx: Tx, p: UserPrincipal, rule: z.infer<typeof AudienceRule>) {
    if (!isHodOnly(p)) return;
    const scope = await hodScope(tx, p.userId);
    if (!rule.sectionIds?.length && !rule.userIds?.length) throw new ForbiddenException('A head of department chooses classes of their department');
    if (outside(rule.sectionIds, scope.sectionIds).length) throw new ForbiddenException('Some of these classes are outside your department');
  }

  @Post('audiences')
  @Auth('user', BROADCAST_ROLES)
  createAudience(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(AudienceBody)) b: z.infer<typeof AudienceBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.assertHodRule(tx, p, b.rule);
      const [row] = await orConflict('An audience with that name already exists', () => tx.insert(audienceRules).values({ tenantId: p.tenantId, name: b.name, rule: b.rule, createdBy: p.userId }).returning());
      await auditUser(tx, p, 'comms.audience_created', 'audience_rule', row.id, { rule: b.rule });
      return { ...row, size: (await this.svc.audienceUsers(tx, row.rule)).length };
    });
  }

  /** How many people a rule reaches, before it is saved. */
  @Post('audiences/preview')
  @HttpCode(200)
  @Auth('user', BROADCAST_ROLES)
  preview(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(AudienceRule)) rule: z.infer<typeof AudienceRule>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.assertHodRule(tx, p, rule);
      return { size: (await this.svc.audienceUsers(tx, rule)).length };
    });
  }

  @Delete('audiences/:id')
  @HttpCode(204)
  @Auth('user', BROADCAST_ROLES)
  removeAudience(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [used] = await tx.select({ id: messageCampaigns.id }).from(messageCampaigns).where(eq(messageCampaigns.audienceId, id)).limit(1);
      if (used) throw new ConflictException('This audience is used by a campaign');
      const gone = await tx.delete(audienceRules).where(and(eq(audienceRules.id, id), isHodOnly(p) ? eq(audienceRules.createdBy, p.userId) : undefined)).returning({ id: audienceRules.id, name: audienceRules.name });
      if (!gone.length) throw new NotFoundException('Audience not found');
      await auditUser(tx, p, 'comms.audience_deleted', 'audience_rule', id, { name: gone[0].name });
    });
  }

  // ---- campaigns ---------------------------------------------------------------------------------

  @Get('campaigns')
  @Auth('user', BROADCAST_ROLES)
  campaigns(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({
          id: messageCampaigns.id,
          title: messageCampaigns.title,
          channel: messageTemplates.channel,
          templateKey: messageTemplates.key,
          audience: sql<string>`coalesce(${audienceRules.name}, 'Notice recipients')`,
          sendAt: messageCampaigns.sendAt,
          status: messageCampaigns.status,
          recipients: messageCampaigns.recipients,
          sentCount: messageCampaigns.sentCount,
          deliveredCount: messageCampaigns.deliveredCount,
          failedCount: messageCampaigns.failedCount,
          suppressedCount: messageCampaigns.suppressedCount,
          costPaise: messageCampaigns.costPaise,
          fallback: messageCampaigns.fallback,
          emergency: messageCampaigns.emergency,
          repeat: messageCampaigns.repeat,
          repeatUntil: messageCampaigns.repeatUntil,
        })
        .from(messageCampaigns)
        .innerJoin(messageTemplates, eq(messageTemplates.id, messageCampaigns.templateId))
        .leftJoin(audienceRules, eq(audienceRules.id, messageCampaigns.audienceId))
        // A head of department sees their own campaigns and their department's.
        .where(isHodOnly(p) ? sql`(${messageCampaigns.createdBy} = ${p.userId}::uuid or ${messageCampaigns.departmentId} in (select id from departments where head_user_id = ${p.userId}::uuid))` : undefined)
        .orderBy(desc(messageCampaigns.createdAt))
        .limit(200),
    );
  }

  /** Schedules a campaign; with no time it goes out now. */
  @Post('campaigns')
  @Auth('user', BROADCAST_ROLES)
  async create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(CampaignBody)) b: z.infer<typeof CampaignBody>) {
    const now = this.clock.now();
    const sendAt = b.sendAt ?? now;
    if (b.emergency && !p.roles.some((r) => STAFF_ADMIN_ROLES.includes(r))) throw new ForbiddenException('Only the principal or an administrator sends emergency messages');
    const row = await this.db.withTenant(p.tenantId, async (tx) => {
      if (b.sendAt && !b.emergency) {
        const quiet = await quietHoursProblem(tx, p.tenantId, b.sendAt);
        if (quiet) throw new ConflictException(quiet);
      }
      const [t] = await tx.select().from(messageTemplates).where(eq(messageTemplates.id, b.templateId));
      if (!t || !t.active) throw new NotFoundException('Template not found');
      const [a] = await tx.select().from(audienceRules).where(eq(audienceRules.id, b.audienceId));
      if (!a) throw new NotFoundException('Audience not found');
      if (isHodOnly(p) && a.createdBy !== p.userId) throw new ForbiddenException('A head of department sends to audiences they made');
      if (t.channel === 'sms' && !t.dltTemplateId) throw new ConflictException('Register this text with your telecom operator (DLT) and enter its template id first');
      if (t.channel === 'whatsapp' && !this.whatsapp.connected) throw new ConflictException('WhatsApp Business is not connected for this institution');
      if (sendAt.getTime() < now.getTime() - 60_000) throw new ConflictException('The send time is in the past');
      if (b.repeat !== 'none' && !b.repeatUntil) throw new BadRequestException('Give the date the reminder stops repeating');
      const fallback = b.fallback.filter((f) => f !== t.channel);
      const [c] = await tx
        .insert(messageCampaigns)
        .values({ tenantId: p.tenantId, title: b.title, templateId: b.templateId, audienceId: b.audienceId, vars: b.vars, sendAt, repeat: b.repeat, repeatUntil: b.repeatUntil ?? null, createdBy: p.userId, fallback, emergency: b.emergency, departmentId: await departmentOf(tx, p.userId) })
        .returning();
      await auditUser(tx, p, 'comms.campaign_scheduled', 'message_campaign', c.id, { channel: t.channel, fallback, emergency: b.emergency, sendAt: sendAt.toISOString() });
      return c;
    });
    if (sendAt.getTime() <= now.getTime()) await this.svc.dispatch(p.tenantId, row.id);
    return this.one(p, row.id);
  }

  /** A head of department reaches only their own campaigns and their department's. */
  private async visible(tx: Tx, p: UserPrincipal, c: typeof messageCampaigns.$inferSelect | undefined) {
    if (!c) throw new NotFoundException('Campaign not found');
    if (isHodOnly(p) && c.createdBy !== p.userId && !(c.departmentId && (await hodScope(tx, p.userId)).departmentIds.includes(c.departmentId))) throw new NotFoundException('Campaign not found');
    return c;
  }

  private async one(p: UserPrincipal, id: string) {
    await this.db.withTenant(p.tenantId, async (tx) => this.visible(tx, p, (await tx.select().from(messageCampaigns).where(eq(messageCampaigns.id, id)))[0]));
    await this.svc.recount(p.tenantId, id);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [c] = await tx.select().from(messageCampaigns).where(eq(messageCampaigns.id, id));
      if (!c) throw new NotFoundException('Campaign not found');
      const [t] = await tx.select({ channel: messageTemplates.channel, key: messageTemplates.key }).from(messageTemplates).where(eq(messageTemplates.id, c.templateId));
      const byStatus = await tx.select({ status: messageDeliveries.status, n: sql<number>`count(*)::int` }).from(messageDeliveries).where(eq(messageDeliveries.campaignId, id)).groupBy(messageDeliveries.status);
      const byChannel = await tx
        .select({ channel: messageDeliveries.channel, status: messageDeliveries.status, n: sql<number>`count(*)::int`, cost: sql<number>`coalesce(sum(${messageDeliveries.costPaise}), 0)::int` })
        .from(messageDeliveries)
        .where(eq(messageDeliveries.campaignId, id))
        .groupBy(messageDeliveries.channel, messageDeliveries.status);
      const failures = await tx
        .select({ userId: messageDeliveries.userId, fullName: users.fullName, channel: messageDeliveries.channel, status: messageDeliveries.status, error: messageDeliveries.error, attempts: messageDeliveries.attempts, nextAttemptAt: messageDeliveries.nextAttemptAt })
        .from(messageDeliveries)
        .innerJoin(users, eq(users.id, messageDeliveries.userId))
        .where(sql`${messageDeliveries.campaignId} = ${id}::uuid and ${messageDeliveries.status} in ('failed', 'suppressed')`)
        .limit(50);
      const waiting = await tx
        .select({ reason: messageDeliveries.deferredReason, n: sql<number>`count(*)::int`, until: sql<string>`min(${messageDeliveries.nextAttemptAt})` })
        .from(messageDeliveries)
        .where(and(eq(messageDeliveries.campaignId, id), eq(messageDeliveries.status, 'queued'), isNotNull(messageDeliveries.deferredReason)))
        .groupBy(messageDeliveries.deferredReason);
      return { ...c, channel: t.channel, templateKey: t.key, delivery: Object.fromEntries(byStatus.map((s) => [s.status, s.n])), byChannel, waiting, failures };
    });
  }

  @Get('campaigns/:id')
  @Auth('user', BROADCAST_ROLES)
  campaign(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.one(p, id);
  }

  @Post('campaigns/:id/cancel')
  @HttpCode(200)
  @Auth('user', BROADCAST_ROLES)
  cancel(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const c = await this.visible(tx, p, (await tx.select().from(messageCampaigns).where(eq(messageCampaigns.id, id)).for('update'))[0]);
      if (c.status !== 'scheduled') throw new ConflictException('Only a scheduled campaign can be cancelled');
      await tx.update(messageCampaigns).set({ status: 'cancelled' }).where(eq(messageCampaigns.id, id));
      await auditUser(tx, p, 'comms.campaign_cancelled', 'message_campaign', id);
      return { id, status: 'cancelled' };
    });
  }

  /** Runs the scheduler now: due campaigns go out and failed deliveries whose wait is over are tried again. */
  @Post('run')
  @HttpCode(200)
  @Auth('user', BROADCAST_ROLES)
  run(@CurrentPrincipal() p: UserPrincipal) {
    return this.svc.runDue(p.tenantId);
  }
}
