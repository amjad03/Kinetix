import { randomUUID } from 'node:crypto';
import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import { RealtimeEvents } from '@zynetix/shared';
import type { Response } from 'express';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, BROADCAST_ROLES, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { BlobBody, putBlob, sendBlob } from '../common/blob.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { announcementTemplates, type AnnouncementAttachment } from '../db/schema.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { UploadScanService } from '../scanning/upload-scan.js';
import { ObjectStorage } from '../storage/storage.service.js';
import { AUDIENCE_ROLES, BUILT_IN_TEMPLATES, unsafeLink } from './announcements.logic.js';
import { AnnouncementsService, type AnnouncementInput } from './announcements.service.js';

const Channel = z.enum(['boards', 'teacher', 'student', 'parent']);
const Audience = z
  .object({
    scope: z.enum(['all', 'departments', 'programs', 'sections', 'people', 'roles', 'hostels', 'routes', 'lists']),
    departmentIds: z.array(z.uuid()).max(200).optional(),
    programIds: z.array(z.uuid()).max(200).optional(),
    sectionIds: z.array(z.uuid()).max(500).optional(),
    userIds: z.array(z.uuid()).max(500).optional(),
    studentIds: z.array(z.uuid()).max(500).optional(),
    roles: z.array(z.enum(AUDIENCE_ROLES)).max(20).optional(),
    hostelIds: z.array(z.uuid()).max(50).optional(),
    routeIds: z.array(z.uuid()).max(200).optional(),
    listIds: z.array(z.uuid()).max(20).optional(),
  })
  .refine(
    (a) =>
      a.scope === 'all' ||
      (a.scope === 'departments' && a.departmentIds?.length) ||
      (a.scope === 'programs' && a.programIds?.length) ||
      (a.scope === 'sections' && a.sectionIds?.length) ||
      (a.scope === 'people' && (a.userIds?.length || a.studentIds?.length)) ||
      (a.scope === 'roles' && a.roles?.length) ||
      (a.scope === 'hostels' && a.hostelIds?.length) ||
      (a.scope === 'routes' && a.routeIds?.length) ||
      (a.scope === 'lists' && a.listIds?.length),
    'Choose who receives the message',
  );
const SafeBody = z.string().trim().min(1).max(5000).refine((b) => !unsafeLink(b), 'Links must start with http:// or https://');
const Translation = z.object({ title: z.string().trim().min(1).max(120), body: SafeBody });
const Poll = z
  .object({
    question: z.string().trim().min(3).max(200),
    options: z.array(z.string().trim().min(1).max(80)).min(2, 'Give at least two choices').max(6, 'Up to six choices'),
    closesAt: z.iso.datetime({ offset: true }).nullable().default(null),
    showResults: z.boolean().default(true),
  })
  .refine((p) => new Set(p.options.map((o) => o.toLowerCase())).size === p.options.length, 'Each choice must be different');
const External = z.object({ templateId: z.uuid(), fallback: z.array(z.enum(['in_app', 'whatsapp', 'sms', 'email'])).max(3).default([]) });
/** Attachments: photos and PDFs. */
const File = BlobBody.extend({ contentType: z.enum(['image/png', 'image/jpeg', 'application/pdf']) });
const Write = z.object({
  title: z.string().trim().min(1).max(120),
  body: SafeBody,
  /** emergency: principals and administrators; reaches everyone at once, through do-not-disturb and quiet hours. */
  priority: z.enum(['normal', 'important', 'emergency']).default('normal'),
  channels: z.array(Channel).min(1, 'Choose at least one channel').max(4),
  audience: Audience,
  /** The notice in Hindi and Kannada; readers get the one in their language. */
  translations: z.object({ hi: Translation.optional(), kn: Translation.optional() }).default({}),
  poll: Poll.nullable().default(null),
  /** Also by SMS, WhatsApp or email through a registered template (its {{title}} and {{body}} are filled in). */
  external: External.nullable().default(null),
  requiresAck: z.boolean().default(false),
  sendAt: z.iso.datetime({ offset: true }).nullable().default(null),
  expiresAt: z.iso.datetime({ offset: true }).nullable().default(null),
  /** New files to attach. */
  attachments: z.array(File).max(5).default([]),
  /** On edit: the attachments already on the message that stay. */
  keepAttachmentIds: z.array(z.uuid()).max(5).default([]),
  /** draft: save only. send: send now, or schedule when sendAt is in the future. */
  mode: z.enum(['draft', 'send']).default('send'),
});
type WriteBody = z.infer<typeof Write>;
const Preview = z.object({ channels: z.array(Channel).min(1).max(4), audience: Audience });
const TemplateBody = z.object({
  name: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(5000).refine((b) => !unsafeLink(b), 'Links must start with http:// or https://'),
  priority: z.enum(['normal', 'important']).default('normal'),
  requiresAck: z.boolean().default(false),
  channels: z.array(Channel).max(4).default([]),
});
const App = z.enum(['teacher', 'student', 'parent']).optional();
const VoteBody = z.object({ option: z.number().int().min(0).max(5) });

/**
 * Communication > Messages: announcements to boards and the Teacher, Student and Parent apps.
 * Static routes come before `:id` so they are not read as ids.
 */
@Controller('v1/announcements')
export class AnnouncementsController {
  constructor(
    private readonly db: DbService,
    private readonly svc: AnnouncementsService,
    private readonly realtime: RealtimeGateway,
    private readonly scans: UploadScanService,
    private readonly storage: ObjectStorage,
  ) {}

  // ---- Apps --------------------------------------------------------------------------------

  /** The caller's announcements in one app (`?app=parent|student|teacher`), pinned first, with the unread count. */
  @Get('inbox')
  @Auth('user')
  inbox(@CurrentPrincipal() p: UserPrincipal, @Query('app') app?: string) {
    const parsed = App.safeParse(app || undefined);
    if (!parsed.success) throw new BadRequestException('Unknown app');
    return this.db.withTenant(p.tenantId, (tx) => this.svc.inbox(tx, p.userId, parsed.data));
  }

  @Get('inbox/:id')
  @Auth('user')
  inboxOne(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.inboxOne(tx, p.userId, id));
  }

  @Post('inbox/:id/read')
  @HttpCode(200)
  @Auth('user')
  read(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.mark(tx, p, id, false));
  }

  @Post('inbox/:id/ack')
  @HttpCode(200)
  @Auth('user')
  ack(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.mark(tx, p, id, true));
  }

  /** Answers the notice's poll (or changes the answer while it is open). */
  @Post('inbox/:id/vote')
  @HttpCode(200)
  @Auth('user')
  vote(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(VoteBody)) body: z.infer<typeof VoteBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.vote(tx, p, id, body.option));
  }

  @Get('inbox/:id/attachments/:attachmentId')
  @Auth('user')
  async inboxAttachment(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('attachmentId', ParseUUIDPipe) attachmentId: string, @Res({ passthrough: true }) res: Response) {
    const f = await this.db.withTenant(p.tenantId, (tx) => this.svc.attachmentFor(tx, p, id, attachmentId, false));
    return sendBlob(this.storage, res, { storageKey: f.key, contentType: f.type, title: f.name });
  }

  // ---- Composer helpers ------------------------------------------------------------------------

  /** Built-in notices and the institution's own templates. */
  @Get('templates')
  @Auth('user', BROADCAST_ROLES)
  templates(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const own = await tx.select().from(announcementTemplates).orderBy(asc(announcementTemplates.name));
      return [...own.map((t) => ({ id: t.id, name: t.name, title: t.title, body: t.body, priority: t.priority, requiresAck: t.requiresAck, channels: t.channels, builtIn: false })), ...BUILT_IN_TEMPLATES.map((t) => ({ ...t, builtIn: true }))];
    });
  }

  @Post('templates')
  @Auth('user', BROADCAST_ROLES)
  createTemplate(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(TemplateBody)) body: z.infer<typeof TemplateBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [t] = await tx.insert(announcementTemplates).values({ tenantId: p.tenantId, ...body, createdBy: p.userId }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'announcement_template.created', subjectType: 'announcement_template', subjectId: t.id, data: { name: t.name } });
      return { ...t, builtIn: false };
    });
  }

  @Patch('templates/:id')
  @Auth('user', BROADCAST_ROLES)
  updateTemplate(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(TemplateBody)) body: z.infer<typeof TemplateBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [t] = await tx.update(announcementTemplates).set({ ...body, updatedAt: new Date() }).where(eq(announcementTemplates.id, id)).returning();
      if (!t) throw new NotFoundException('Template not found');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'announcement_template.updated', subjectType: 'announcement_template', subjectId: id });
      return { ...t, builtIn: false };
    });
  }

  @Delete('templates/:id')
  @HttpCode(204)
  @Auth('user', BROADCAST_ROLES)
  async deleteTemplate(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    await this.db.withTenant(p.tenantId, async (tx) => {
      const gone = await tx.delete(announcementTemplates).where(eq(announcementTemplates.id, id)).returning({ id: announcementTemplates.id });
      if (!gone.length) throw new NotFoundException('Template not found');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'announcement_template.deleted', subjectType: 'announcement_template', subjectId: id });
    });
  }

  /** Staff, parents and students by name, phone or roll number, to send to individuals. */
  @Get('people')
  @Auth('user', BROADCAST_ROLES)
  people(@CurrentPrincipal() p: UserPrincipal, @Query('q') q = '') {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.people(tx, q));
  }

  /** How many people (and boards) the audience reaches on each channel. */
  @Post('preview')
  @HttpCode(200)
  @Auth('user', BROADCAST_ROLES)
  preview(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(Preview)) body: z.infer<typeof Preview>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.svc.assertAudience(tx, p, body.audience, 'normal');
      return this.svc.preview(tx, body.audience, body.channels);
    });
  }

  // ---- Sent list -----------------------------------------------------------------------------

  /** Every message, newest first, with delivery statistics (`?status=draft|scheduled|sent|recalled`). Sends any scheduled ones that are overdue first. */
  @Get()
  @Auth('user', BROADCAST_ROLES)
  async list(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string) {
    await this.svc.sendDue(p.tenantId);
    return this.db.withTenant(p.tenantId, (tx) => this.svc.list(tx, p, status));
  }

  @Post()
  @Auth('user', BROADCAST_ROLES)
  async create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(Write)) body: WriteBody) {
    const files = await this.store(p, body.attachments);
    const { id, fanout } = await this.db.withTenant(p.tenantId, (tx) => this.svc.create(tx, p, this.input(body), files, body.mode));
    await this.svc.deliver(fanout);
    return this.db.withTenant(p.tenantId, (tx) => this.svc.detail(tx, id));
  }

  @Get(':id')
  @Auth('user', BROADCAST_ROLES)
  detail(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.svc.loadFor(tx, p, id);
      return this.svc.detail(tx, id);
    });
  }

  /** Edits a draft or scheduled message; `mode: send` sends (or reschedules) it. */
  @Patch(':id')
  @Auth('user', BROADCAST_ROLES)
  async update(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(Write)) body: WriteBody) {
    const existing = await this.db.withTenant(p.tenantId, (tx) => this.svc.loadFor(tx, p, id));
    const kept = existing.attachments.filter((a) => body.keepAttachmentIds.includes(a.id));
    if (kept.length + body.attachments.length > 5) throw new BadRequestException('Attach up to 5 files');
    const files = await this.store(p, body.attachments);
    const fanout = await this.db.withTenant(p.tenantId, (tx) => this.svc.update(tx, p, id, this.input(body), [...kept, ...files], body.mode));
    await this.svc.deliver(fanout);
    return this.db.withTenant(p.tenantId, (tx) => this.svc.detail(tx, id));
  }

  /** Sends a draft now. */
  @Post(':id/send')
  @HttpCode(200)
  @Auth('user', BROADCAST_ROLES)
  async send(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    const fanout = await this.db.withTenant(p.tenantId, async (tx) => {
      const a = await this.svc.loadFor(tx, p, id);
      if (a.status !== 'draft' && a.status !== 'scheduled') throw new BadRequestException('This message has already gone out');
      return this.svc.dispatch(tx, id);
    });
    await this.svc.deliver(fanout);
    return this.db.withTenant(p.tenantId, (tx) => this.svc.detail(tx, id));
  }

  @Post(':id/recall')
  @HttpCode(200)
  @Auth('user', BROADCAST_ROLES)
  async recall(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    const { deviceIds, broadcastId } = await this.db.withTenant(p.tenantId, async (tx) => {
      await this.svc.loadFor(tx, p, id);
      return { deviceIds: await this.svc.recall(tx, p, id), broadcastId: (await this.svc.load(tx, id)).broadcastId };
    });
    if (broadcastId) this.realtime.toDevices(deviceIds, RealtimeEvents.BroadcastCleared, { id: broadcastId });
    return this.db.withTenant(p.tenantId, (tx) => this.svc.detail(tx, id));
  }

  @Delete(':id')
  @HttpCode(204)
  @Auth('user', BROADCAST_ROLES)
  async remove(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    await this.db.withTenant(p.tenantId, async (tx) => {
      await this.svc.loadFor(tx, p, id);
      return this.svc.remove(tx, p, id);
    });
  }

  @Post(':id/duplicate')
  @Auth('user', BROADCAST_ROLES)
  async duplicate(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    const copy = await this.db.withTenant(p.tenantId, async (tx) => {
      await this.svc.loadFor(tx, p, id);
      return this.svc.duplicate(tx, p, id);
    });
    return this.db.withTenant(p.tenantId, (tx) => this.svc.detail(tx, copy));
  }

  /** Pushes again to everyone who has not read (or acknowledged) it yet. */
  @Post(':id/remind')
  @HttpCode(200)
  @Auth('user', BROADCAST_ROLES)
  remind(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.svc.loadFor(tx, p, id);
      return this.svc.remind(tx, p, id);
    });
  }

  /** Who got it: `?filter=unread|unacknowledged|undelivered`, `?channel=teacher|student|parent`, `?q=`. */
  @Get(':id/recipients')
  @Auth('user', BROADCAST_ROLES)
  recipients(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Query('filter') filter?: string, @Query('channel') channel?: string, @Query('q') q?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.svc.loadFor(tx, p, id);
      return this.svc.recipients(tx, id, filter, channel, q);
    });
  }

  @Get(':id/attachments/:attachmentId')
  @Auth('user', BROADCAST_ROLES)
  async attachment(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('attachmentId', ParseUUIDPipe) attachmentId: string, @Res({ passthrough: true }) res: Response) {
    const f = await this.db.withTenant(p.tenantId, async (tx) => {
      await this.svc.loadFor(tx, p, id);
      return this.svc.attachmentFor(tx, p, id, attachmentId, true);
    });
    return sendBlob(this.storage, res, { storageKey: f.key, contentType: f.type, title: f.name });
  }

  // --------------------------------------------------------------------------------------------

  private input(b: WriteBody): AnnouncementInput {
    return {
      title: b.title,
      body: b.body,
      priority: b.priority,
      channels: [...new Set(b.channels)],
      audience: b.audience,
      requiresAck: b.requiresAck || b.priority === 'emergency',
      sendAt: b.sendAt ? new Date(b.sendAt) : null,
      expiresAt: b.expiresAt ? new Date(b.expiresAt) : null,
      translations: Object.fromEntries(Object.entries(b.translations).filter(([, v]) => !!v)),
      poll: b.poll ? { question: b.poll.question, options: b.poll.options, closesAt: b.poll.closesAt, showResults: b.poll.showResults } : null,
      external: b.external ? { templateId: b.external.templateId, fallback: [...new Set(b.external.fallback)] } : null,
    };
  }

  /** Scans and stores new attachments before the transaction. */
  private async store(p: UserPrincipal, files: z.infer<typeof File>[]): Promise<AnnouncementAttachment[]> {
    const out: AnnouncementAttachment[] = [];
    for (const f of files) {
      const s = await putBlob(this.storage, p.tenantId, 'announcements', f, this.scans);
      out.push({ id: randomUUID(), key: s.storageKey, name: s.title, type: s.contentType, size: s.sizeBytes });
    }
    return out;
  }
}
