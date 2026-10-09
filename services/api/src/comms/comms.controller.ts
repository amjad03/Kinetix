import { Body, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { asc, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, BROADCAST_ROLES, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { orConflict } from '../common/ops.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { users } from '../db/schema.js';
import { audienceRules, messageCampaigns, messageDeliveries, messageTemplates } from '../db/schema-pathways.js';
import { WhatsAppSender } from './channels.js';
import { CommsService } from './comms.service.js';
import { placeholders } from './comms.logic.js';

const TemplateBody = z.object({
  key: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_.-]{1,59}$/, 'Use a short key like fee_reminder'),
  channel: z.enum(['in_app', 'sms', 'email', 'whatsapp']),
  locale: z.enum(['en', 'hi', 'kn']).default('en'),
  subject: z.string().trim().max(160).default(''),
  body: z.string().trim().min(3).max(1000),
  dltTemplateId: z.string().trim().max(60).optional(),
  active: z.boolean().default(true),
});
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
      const [row] = await orConflict('There is already a template with that key, channel and language', () => tx.insert(messageTemplates).values({ tenantId: p.tenantId, ...b, dltTemplateId: b.dltTemplateId ?? null }).returning());
      await auditUser(tx, p, 'comms.template_created', 'message_template', row.id, { key: b.key, channel: b.channel });
      return row;
    });
  }

  @Put('templates/:id')
  @Auth('user', BROADCAST_ROLES)
  updateTemplate(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(TemplateBody.pick({ subject: true, body: true, dltTemplateId: true, active: true }))) b: Pick<z.infer<typeof TemplateBody>, 'subject' | 'body' | 'dltTemplateId' | 'active'>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(messageTemplates).set({ subject: b.subject, body: b.body, dltTemplateId: b.dltTemplateId ?? null, active: b.active, updatedAt: sql`now()` }).where(eq(messageTemplates.id, id)).returning();
      if (!row) throw new NotFoundException('Template not found');
      await auditUser(tx, p, 'comms.template_updated', 'message_template', id);
      return row;
    });
  }

  // ---- audiences ---------------------------------------------------------------------------------

  @Get('audiences')
  @Auth('user', BROADCAST_ROLES)
  audiences(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(audienceRules).orderBy(asc(audienceRules.name)));
  }

  @Post('audiences')
  @Auth('user', BROADCAST_ROLES)
  createAudience(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(AudienceBody)) b: z.infer<typeof AudienceBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await orConflict('An audience with that name already exists', () => tx.insert(audienceRules).values({ tenantId: p.tenantId, name: b.name, rule: b.rule, createdBy: p.userId }).returning());
      return { ...row, size: (await this.svc.audienceUsers(tx, row.rule)).length };
    });
  }

  /** How many people a rule reaches, before it is saved. */
  @Post('audiences/preview')
  @HttpCode(200)
  @Auth('user', BROADCAST_ROLES)
  preview(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(AudienceRule)) rule: z.infer<typeof AudienceRule>) {
    return this.db.withTenant(p.tenantId, async (tx) => ({ size: (await this.svc.audienceUsers(tx, rule)).length }));
  }

  @Delete('audiences/:id')
  @HttpCode(204)
  @Auth('user', BROADCAST_ROLES)
  removeAudience(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [used] = await tx.select({ id: messageCampaigns.id }).from(messageCampaigns).where(eq(messageCampaigns.audienceId, id)).limit(1);
      if (used) throw new ConflictException('This audience is used by a campaign');
      const gone = await tx.delete(audienceRules).where(eq(audienceRules.id, id)).returning({ id: audienceRules.id });
      if (!gone.length) throw new NotFoundException('Audience not found');
    });
  }

  // ---- campaigns ---------------------------------------------------------------------------------

  @Get('campaigns')
  @Auth('user', BROADCAST_ROLES)
  campaigns(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ id: messageCampaigns.id, title: messageCampaigns.title, channel: messageTemplates.channel, templateKey: messageTemplates.key, audience: audienceRules.name, sendAt: messageCampaigns.sendAt, status: messageCampaigns.status, recipients: messageCampaigns.recipients, sentCount: messageCampaigns.sentCount, failedCount: messageCampaigns.failedCount })
        .from(messageCampaigns)
        .innerJoin(messageTemplates, eq(messageTemplates.id, messageCampaigns.templateId))
        .innerJoin(audienceRules, eq(audienceRules.id, messageCampaigns.audienceId))
        .orderBy(desc(messageCampaigns.createdAt))
        .limit(100),
    );
  }

  /** Schedules a campaign; with no time it goes out now. */
  @Post('campaigns')
  @Auth('user', BROADCAST_ROLES)
  async create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(CampaignBody)) b: z.infer<typeof CampaignBody>) {
    const now = this.clock.now();
    const sendAt = b.sendAt ?? now;
    const row = await this.db.withTenant(p.tenantId, async (tx) => {
      const [t] = await tx.select().from(messageTemplates).where(eq(messageTemplates.id, b.templateId));
      if (!t || !t.active) throw new NotFoundException('Template not found');
      const [a] = await tx.select().from(audienceRules).where(eq(audienceRules.id, b.audienceId));
      if (!a) throw new NotFoundException('Audience not found');
      if (t.channel === 'sms' && !t.dltTemplateId) throw new ConflictException('Register this text with your telecom operator (DLT) and enter its template id first');
      if (t.channel === 'whatsapp' && !this.whatsapp.connected) throw new ConflictException('WhatsApp Business is not connected for this institution');
      if (sendAt.getTime() < now.getTime() - 60_000) throw new ConflictException('The send time is in the past');
      const [c] = await tx.insert(messageCampaigns).values({ tenantId: p.tenantId, title: b.title, templateId: b.templateId, audienceId: b.audienceId, vars: b.vars, sendAt, createdBy: p.userId }).returning();
      await auditUser(tx, p, 'comms.campaign_scheduled', 'message_campaign', c.id, { channel: t.channel, sendAt: sendAt.toISOString() });
      return c;
    });
    if (sendAt.getTime() <= now.getTime()) await this.svc.dispatch(p.tenantId, row.id);
    return this.one(p, row.id);
  }

  private async one(p: UserPrincipal, id: string) {
    await this.svc.recount(p.tenantId, id);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [c] = await tx.select().from(messageCampaigns).where(eq(messageCampaigns.id, id));
      if (!c) throw new NotFoundException('Campaign not found');
      const [t] = await tx.select({ channel: messageTemplates.channel, key: messageTemplates.key }).from(messageTemplates).where(eq(messageTemplates.id, c.templateId));
      const byStatus = await tx.select({ status: messageDeliveries.status, n: sql<number>`count(*)::int` }).from(messageDeliveries).where(eq(messageDeliveries.campaignId, id)).groupBy(messageDeliveries.status);
      const failures = await tx
        .select({ userId: messageDeliveries.userId, fullName: users.fullName, error: messageDeliveries.error, attempts: messageDeliveries.attempts, nextAttemptAt: messageDeliveries.nextAttemptAt })
        .from(messageDeliveries)
        .innerJoin(users, eq(users.id, messageDeliveries.userId))
        .where(sql`${messageDeliveries.campaignId} = ${id}::uuid and ${messageDeliveries.status} = 'failed'`)
        .limit(50);
      return { ...c, channel: t.channel, templateKey: t.key, delivery: Object.fromEntries(byStatus.map((s) => [s.status, s.n])), failures };
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
      const [c] = await tx.select().from(messageCampaigns).where(eq(messageCampaigns.id, id)).for('update');
      if (!c) throw new NotFoundException('Campaign not found');
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
