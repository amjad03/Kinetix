import { createHmac, timingSafeEqual } from 'node:crypto';
import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, HttpCode, Inject, Logger, NotFoundException, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { and, asc, desc, eq, ilike, inArray, isNull, lt, ne, notInArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Mailer } from '../analytics/mailer.js';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { BlobBody, putBlob, sendBlob } from '../common/blob.js';
import { ZodBody } from '../common/zod-body.js';
import { WhatsAppSender } from '../comms/channels.js';
import { ENV, type Env } from '../config/env.js';
import { DbService, type Tx } from '../db/db.service.js';
import { chatMembers, chatMessages, chatThreads } from '../db/schema-chat.js';
import { tenants, userRoles, users } from '../db/schema.js';
import { postRefusal } from './chat-groups.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { UploadScanService } from '../scanning/upload-scan.js';
import { ObjectStorage } from '../storage/storage.service.js';

/** Realtime events of the staff chat (to every member's sockets). */
export const ChatEvents = { Message: 'chat.message', Typing: 'chat.typing', Read: 'chat.read' } as const;

const FAMILY_ROLES = ['guardian', 'student'];
const StartBody = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('direct'), userId: z.uuid() }),
  z.object({ kind: z.literal('group'), title: z.string().trim().min(1).max(120), description: z.string().trim().max(500).default(''), userIds: z.array(z.uuid()).min(1).max(200) }),
  z.object({
    kind: z.literal('external'),
    channel: z.enum(['email', 'whatsapp']),
    contactName: z.string().trim().min(1).max(160),
    contactAddress: z.string().trim().min(3).max(200),
    contactKind: z.enum(['parent', 'vendor', 'university', 'other']).default('other'),
    title: z.string().trim().max(160).default(''),
    userIds: z.array(z.uuid()).max(50).default([]),
  }),
]);
const SendBody = z.object({ body: z.string().trim().max(4000).default(''), attachment: BlobBody.optional() }).refine((b) => b.body.length > 0 || b.attachment, { message: 'Write a message or attach a file' });
const InboundBody = z.object({
  channel: z.enum(['email', 'whatsapp']),
  /** Email: the reply-to address (reply+<token>@domain). */
  to: z.string().max(300).optional(),
  /** Email address or phone of the sender. */
  from: z.string().trim().min(3).max(300),
  body: z.string().max(20000),
  /** WhatsApp: the institution the number belongs to. */
  tenantId: z.uuid().optional(),
});

const sameAddress = (a: string, b: string) => a.replace(/[\s+-]/g, '').toLowerCase() === b.replace(/[\s+-]/g, '').toLowerCase();

/**
 * Staff chat (redesign v2 Messages): one-to-one and group threads between staff of every role, and
 * external threads with a parent, vendor or university that go out by email (reply-to address maps
 * replies back into the thread) or WhatsApp (queued until the institution connects an account).
 * Attachments are scanned before they are stored. Typing and read receipts go over the realtime socket.
 */
@Controller('v1/chat')
export class ChatController {
  private readonly log = new Logger('Chat');
  constructor(
    private readonly db: DbService,
    private readonly realtime: RealtimeGateway,
    private readonly scans: UploadScanService,
    private readonly storage: ObjectStorage,
    private readonly mailer: Mailer,
    private readonly whatsapp: WhatsAppSender,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Staff the caller can start a thread with (every role except families). */
  @Get('people')
  @Auth('user')
  people(@CurrentPrincipal() p: UserPrincipal, @Query('q') q?: string) {
    this.assertStaff(p);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ id: users.id, fullName: users.fullName, email: users.email, roles: sql<string[]>`array_agg(distinct ${userRoles.role}::text)` })
        .from(users)
        .innerJoin(userRoles, eq(userRoles.userId, users.id))
        .where(and(eq(users.status, 'active'), ne(users.id, p.userId), notInArray(userRoles.role, FAMILY_ROLES as never[]), q ? ilike(users.fullName, `%${q.replace(/[%_]/g, '')}%`) : undefined))
        .groupBy(users.id)
        .orderBy(asc(users.fullName))
        .limit(100);
      return rows;
    });
  }

  @Post('threads')
  @Auth('user')
  start(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(StartBody)) body: z.infer<typeof StartBody>) {
    this.assertStaff(p);
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (body.kind === 'direct') {
        await this.assertStaffUsers(tx, [body.userId]);
        const [existing] = await tx
          .select({ id: chatThreads.id })
          .from(chatThreads)
          .innerJoin(chatMembers, eq(chatMembers.threadId, chatThreads.id))
          .where(and(eq(chatThreads.kind, 'direct'), eq(chatMembers.userId, p.userId), sql`exists (select 1 from chat_members o where o.thread_id = ${chatThreads.id} and o.user_id = ${body.userId}::uuid)`));
        if (existing) return this.summary(tx, p, existing.id);
        const [t] = await tx.insert(chatThreads).values({ tenantId: p.tenantId, kind: 'direct', createdBy: p.userId }).returning();
        await tx.insert(chatMembers).values([p.userId, body.userId].map((userId) => ({ tenantId: p.tenantId, threadId: t.id, userId, role: userId === p.userId ? 'owner' : 'member' })));
        await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'chat.thread_started', subjectType: 'chat_thread', subjectId: t.id, data: { kind: 'direct' } });
        return this.summary(tx, p, t.id);
      }
      const others = [...new Set(body.userIds)].filter((u) => u !== p.userId);
      await this.assertStaffUsers(tx, others);
      const ext = body.kind === 'external';
      if (ext && body.channel === 'email' && !z.email().safeParse(body.contactAddress).success) throw new BadRequestException('Enter a valid email address');
      if (ext && body.channel === 'whatsapp' && !/^\+?[0-9 ()-]{8,20}$/.test(body.contactAddress)) throw new BadRequestException('Enter a valid WhatsApp number');
      const [t] = await tx
        .insert(chatThreads)
        .values({
          tenantId: p.tenantId,
          kind: body.kind,
          title: ext ? body.title || body.contactName : body.title,
          description: body.kind === 'group' ? body.description : '',
          createdBy: p.userId,
          ...(ext ? { channel: body.channel, contactName: body.contactName, contactAddress: body.contactAddress, contactKind: body.contactKind } : {}),
        })
        .returning();
      await tx.insert(chatMembers).values([p.userId, ...others].map((userId) => ({ tenantId: p.tenantId, threadId: t.id, userId, role: userId === p.userId ? 'owner' : 'member' })));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'chat.thread_started', subjectType: 'chat_thread', subjectId: t.id, data: { kind: body.kind, members: others.length } });
      return this.summary(tx, p, t.id);
    });
  }

  /** The caller's threads, pinned first then latest, with unread counts. `?filter=unread|groups|external`. */
  @Get('threads')
  @Auth('user')
  list(@CurrentPrincipal() p: UserPrincipal, @Query('filter') filter?: string) {
    // Families see only the class and club groups they were added to (membership decides everything below).
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await this.summaries(tx, p)
        .where(and(eq(chatMembers.userId, p.userId), filter === 'groups' ? eq(chatThreads.kind, 'group') : filter === 'external' ? eq(chatThreads.kind, 'external') : undefined))
        .orderBy(desc(chatMembers.pinned), sql`coalesce(${chatThreads.lastMessageAt}, ${chatThreads.createdAt}) desc`)
        .limit(200);
      return filter === 'unread' ? rows.filter((r) => r.unread > 0) : rows;
    });
  }

  /** A thread: its members (with read times, for receipts) and the latest messages (`?before=` pages back). */
  @Get('threads/:id')
  @Auth('user')
  read(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Query('before') before?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.member(tx, p, id);
      const members = await tx
        .select({ id: users.id, fullName: users.fullName, email: users.email, role: chatMembers.role, lastReadAt: chatMembers.lastReadAt, roles: sql<string[]>`(select array_agg(distinct r.role::text) from user_roles r where r.user_id = ${users.id})` })
        .from(chatMembers)
        .innerJoin(users, eq(users.id, chatMembers.userId))
        .where(eq(chatMembers.threadId, id))
        .orderBy(asc(users.fullName));
      const page = await tx
        .select({
          id: chatMessages.id,
          senderId: chatMessages.senderId,
          senderName: users.fullName,
          direction: chatMessages.direction,
          body: chatMessages.body,
          externalFrom: chatMessages.externalFrom,
          delivery: chatMessages.delivery,
          attachment: sql<{ name: string; type: string; size: number } | null>`case when ${chatMessages.attachmentKey} is null then null else json_build_object('name', ${chatMessages.attachmentName}, 'type', ${chatMessages.attachmentType}, 'size', ${chatMessages.attachmentSize}) end`,
          createdAt: chatMessages.createdAt,
        })
        .from(chatMessages)
        .leftJoin(users, eq(users.id, chatMessages.senderId))
        .where(and(eq(chatMessages.threadId, id), before ? lt(chatMessages.createdAt, new Date(before)) : undefined))
        .orderBy(desc(chatMessages.createdAt))
        .limit(60);
      const [thread] = await this.summaries(tx, p).where(and(eq(chatThreads.id, id), eq(chatMembers.userId, p.userId)));
      return { thread: { ...thread, replyTo: thread.kind === 'external' && thread.channel === 'email' ? this.replyAddress(p.tenantId, id) : null }, members, messages: page.reverse() };
    });
  }

  @Post('threads/:id/messages')
  @Auth('user')
  async send(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(SendBody)) body: z.infer<typeof SendBody>) {
    let stored: Awaited<ReturnType<typeof putBlob>> | undefined;
    if (body.attachment) {
      await this.scans.assertClean(Buffer.from(body.attachment.contentBase64, 'base64'), 'The attachment');
      stored = await putBlob(this.storage, p.tenantId, 'chat', body.attachment);
    }
    const { msg, thread, memberIds, senderName } = await this.db.withTenant(p.tenantId, async (tx) => {
      const thread = await this.member(tx, p, id);
      const now = new Date();
      const [mine] = await tx.select({ role: chatMembers.role }).from(chatMembers).where(and(eq(chatMembers.threadId, id), eq(chatMembers.userId, p.userId)));
      const [ten] = await tx.select({ tz: tenants.timezone }).from(tenants);
      const refusal = postRefusal(thread, mine?.role ?? 'member', now, ten?.tz ?? 'Asia/Kolkata');
      if (refusal) throw new ForbiddenException(refusal);
      const ext = thread.kind === 'external';
      const [msg] = await tx
        .insert(chatMessages)
        .values({
          tenantId: p.tenantId,
          threadId: id,
          senderId: p.userId,
          direction: ext ? 'outbound' : 'internal',
          body: body.body,
          delivery: ext ? 'queued' : null,
          ...(stored ? { attachmentKey: stored.storageKey, attachmentName: stored.title, attachmentType: stored.contentType, attachmentSize: stored.sizeBytes } : {}),
          createdAt: now,
        })
        .returning();
      await tx.update(chatThreads).set({ lastMessageAt: now }).where(eq(chatThreads.id, id));
      await tx.update(chatMembers).set({ lastReadAt: now }).where(and(eq(chatMembers.threadId, id), eq(chatMembers.userId, p.userId)));
      const memberIds = (await tx.select({ userId: chatMembers.userId }).from(chatMembers).where(eq(chatMembers.threadId, id))).map((m) => m.userId);
      const [me] = await tx.select({ fullName: users.fullName }).from(users).where(eq(users.id, p.userId));
      return { msg, thread, memberIds, senderName: me?.fullName ?? 'Kinetix' };
    });
    let delivery = msg.delivery;
    if (thread.kind === 'external') {
      delivery = await this.deliver(p.tenantId, thread, senderName, body.body, stored ? { name: stored.title, type: stored.contentType, key: stored.storageKey } : undefined);
      await this.db.withTenant(p.tenantId, (tx) => tx.update(chatMessages).set({ delivery }).where(eq(chatMessages.id, msg.id)));
    }
    this.realtime.toUsers(memberIds, ChatEvents.Message, { threadId: id, messageId: msg.id, senderId: p.userId });
    return { id: msg.id, body: msg.body, direction: msg.direction, delivery, createdAt: msg.createdAt, attachment: stored ? { name: stored.title, type: stored.contentType, size: stored.sizeBytes } : null };
  }

  @Get('threads/:id/messages/:messageId/attachment')
  @Auth('user')
  async attachment(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('messageId', ParseUUIDPipe) messageId: string, @Res({ passthrough: true }) res: Response) {
    const row = await this.db.withTenant(p.tenantId, async (tx) => {
      await this.member(tx, p, id);
      const [m] = await tx.select().from(chatMessages).where(and(eq(chatMessages.id, messageId), eq(chatMessages.threadId, id)));
      if (!m?.attachmentKey) throw new NotFoundException('No attachment');
      return m;
    });
    return sendBlob(this.storage, res, { storageKey: row.attachmentKey, contentType: row.attachmentType, title: row.attachmentName ?? 'attachment' });
  }

  /** Marks the thread read and tells the other members (read receipts). */
  @Post('threads/:id/read')
  @HttpCode(204)
  @Auth('user')
  async markRead(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    const at = new Date();
    const memberIds = await this.db.withTenant(p.tenantId, async (tx) => {
      await this.member(tx, p, id);
      await tx.update(chatMembers).set({ lastReadAt: at }).where(and(eq(chatMembers.threadId, id), eq(chatMembers.userId, p.userId)));
      return (await tx.select({ userId: chatMembers.userId }).from(chatMembers).where(eq(chatMembers.threadId, id))).map((m) => m.userId);
    });
    this.realtime.toUsers(memberIds, ChatEvents.Read, { threadId: id, userId: p.userId, at: at.toISOString() });
  }

  /** "… is typing": relayed to the other members, nothing stored. */
  @Post('threads/:id/typing')
  @HttpCode(204)
  @Auth('user')
  async typing(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    const { memberIds, name } = await this.db.withTenant(p.tenantId, async (tx) => {
      await this.member(tx, p, id);
      const ids = (await tx.select({ userId: chatMembers.userId }).from(chatMembers).where(eq(chatMembers.threadId, id))).map((m) => m.userId);
      const [me] = await tx.select({ fullName: users.fullName }).from(users).where(eq(users.id, p.userId));
      return { memberIds: ids.filter((u) => u !== p.userId), name: me?.fullName ?? '' };
    });
    this.realtime.toUsers(memberIds, ChatEvents.Typing, { threadId: id, userId: p.userId, name });
  }

  @Post('threads/:id/pin')
  @HttpCode(200)
  @Auth('user')
  pin(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ pinned: z.boolean() }))) body: { pinned: boolean }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.member(tx, p, id);
      await tx.update(chatMembers).set({ pinned: body.pinned }).where(and(eq(chatMembers.threadId, id), eq(chatMembers.userId, p.userId)));
      return { pinned: body.pinned };
    });
  }

  /** Group or external thread: add staff members. */
  @Post('threads/:id/members')
  @HttpCode(200)
  @Auth('user')
  addMembers(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ userIds: z.array(z.uuid()).min(1).max(100) }))) body: { userIds: string[] }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const t = await this.member(tx, p, id);
      if (t.kind === 'direct') throw new BadRequestException('Start a group to add more people');
      await this.assertStaffUsers(tx, body.userIds);
      await tx.insert(chatMembers).values(body.userIds.map((userId) => ({ tenantId: p.tenantId, threadId: id, userId }))).onConflictDoNothing();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'chat.members_added', subjectType: 'chat_thread', subjectId: id, data: { userIds: body.userIds } });
      return this.summary(tx, p, id);
    });
  }

  /**
   * Inbound replies from the email relay (to = reply+<token>@domain) or the WhatsApp webhook (tenantId +
   * from = the contact's number). Authenticated by the shared `x-kinetix-inbound-secret`.
   */
  @Post('inbound')
  @HttpCode(202)
  async inbound(@Headers('x-kinetix-inbound-secret') secret: string | undefined, @Body(new ZodBody(InboundBody)) body: z.infer<typeof InboundBody>) {
    const want = this.env.CHAT_INBOUND_SECRET;
    if (!want || !secret || secret.length !== want.length || !timingSafeEqual(Buffer.from(secret), Buffer.from(want))) throw new NotFoundException();
    let tenantId: string;
    let threadId: string | undefined;
    if (body.channel === 'email') {
      const parsed = this.parseReply(body.to ?? '');
      if (!parsed) throw new NotFoundException('Unknown reply address');
      ({ tenantId, threadId } = parsed);
    } else {
      if (!body.tenantId) throw new BadRequestException('tenantId is required for WhatsApp');
      tenantId = body.tenantId;
    }
    const out = await this.db.withTenant(tenantId, async (tx) => {
      let thread;
      if (threadId) [thread] = await tx.select().from(chatThreads).where(and(eq(chatThreads.id, threadId), eq(chatThreads.kind, 'external')));
      else
        thread = (await tx.select().from(chatThreads).where(and(eq(chatThreads.kind, 'external'), eq(chatThreads.channel, 'whatsapp'))).orderBy(sql`${chatThreads.lastMessageAt} desc nulls last`)).find((t) => sameAddress(t.contactAddress ?? '', body.from));
      if (!thread) throw new NotFoundException('No thread for this sender');
      if (thread.channel === 'email' && !sameAddress((body.from.match(/<([^>]+)>/)?.[1] ?? body.from).trim(), thread.contactAddress ?? '')) throw new ForbiddenException('The sender is not this thread’s contact');
      const now = new Date();
      const text = stripQuoted(body.body).slice(0, 4000);
      const [m] = await tx.insert(chatMessages).values({ tenantId, threadId: thread.id, direction: 'inbound', body: text, externalFrom: body.from, createdAt: now }).returning();
      await tx.update(chatThreads).set({ lastMessageAt: now }).where(eq(chatThreads.id, thread.id));
      const memberIds = (await tx.select({ userId: chatMembers.userId }).from(chatMembers).where(eq(chatMembers.threadId, thread.id))).map((x) => x.userId);
      return { threadId: thread.id, messageId: m.id, memberIds };
    });
    this.realtime.toUsers(out.memberIds, ChatEvents.Message, { threadId: out.threadId, messageId: out.messageId, senderId: null });
    return { threadId: out.threadId, messageId: out.messageId };
  }

  // --------------------------------------------------------------------------------------------

  /** reply+<tenant>.<thread>.<sig>@domain: the signature stops guessing other threads' addresses. */
  replyAddress(tenantId: string, threadId: string): string {
    return `reply+${tenantId}.${threadId}.${this.sign(`${tenantId}.${threadId}`)}@${this.env.CHAT_REPLY_DOMAIN}`;
  }

  private parseReply(to: string): { tenantId: string; threadId: string } | null {
    const m = to.match(/reply\+([0-9a-f-]{36})\.([0-9a-f-]{36})\.([A-Za-z0-9_-]{16,})@/i);
    if (!m) return null;
    const want = this.sign(`${m[1]}.${m[2]}`);
    if (want.length !== m[3].length || !timingSafeEqual(Buffer.from(want), Buffer.from(m[3]))) return null;
    return { tenantId: m[1].toLowerCase(), threadId: m[2].toLowerCase() };
  }

  private sign(s: string): string {
    return createHmac('sha256', `chat-reply:${this.env.JWT_SECRET}`).update(s).digest('base64url').slice(0, 22);
  }

  /** Sends an outbound message on the thread's channel: sent, queued (WhatsApp not connected) or failed. */
  private async deliver(tenantId: string, t: typeof chatThreads.$inferSelect, senderName: string, text: string, file?: { name: string; type: string; key: string }): Promise<string> {
    try {
      if (t.channel === 'email') {
        const attachments = [];
        if (file) {
          const { stream } = await this.storage.get(file.key);
          const chunks: Buffer[] = [];
          for await (const c of stream) chunks.push(Buffer.from(c as Buffer));
          attachments.push({ filename: file.name, contentType: file.type, content: Buffer.concat(chunks) });
        }
        await this.mailer.send({ to: [t.contactAddress!], subject: t.title || 'Message from your institution', text: `${text}\n\n— ${senderName}\nReply to this email to answer. Reply-To: ${this.replyAddress(tenantId, t.id)}`, attachments });
        return 'sent';
      }
      if (!this.whatsapp.connected) return 'queued';
      await this.whatsapp.send(t.contactAddress!, 'staff_message', { name: senderName, body: text });
      return 'sent';
    } catch (e) {
      this.log.warn(`Chat delivery failed: ${(e as Error).message}`);
      return 'failed';
    }
  }

  private assertStaff(p: UserPrincipal) {
    if (!p.roles.some((r) => !FAMILY_ROLES.includes(r))) throw new ForbiddenException('Messages are for staff');
  }

  private async assertStaffUsers(tx: Tx, ids: string[]) {
    if (ids.length === 0) return;
    const ok = await tx
      .selectDistinct({ id: userRoles.userId })
      .from(userRoles)
      .innerJoin(users, eq(users.id, userRoles.userId))
      .where(and(inArray(userRoles.userId, ids), notInArray(userRoles.role, FAMILY_ROLES as never[]), eq(users.status, 'active')));
    if (ok.length !== new Set(ids).size) throw new BadRequestException('Some of these people are not staff of this institution');
  }

  private async member(tx: Tx, p: UserPrincipal, id: string) {
    const [row] = await tx
      .select({ t: chatThreads })
      .from(chatThreads)
      .innerJoin(chatMembers, and(eq(chatMembers.threadId, chatThreads.id), eq(chatMembers.userId, p.userId)))
      .where(eq(chatThreads.id, id));
    if (!row) throw new NotFoundException('Conversation not found');
    return row.t;
  }

  private summaries(tx: Tx, p: UserPrincipal) {
    return tx
      .select({
        id: chatThreads.id,
        kind: chatThreads.kind,
        title: chatThreads.title,
        description: chatThreads.description,
        channel: chatThreads.channel,
        contactName: chatThreads.contactName,
        contactAddress: chatThreads.contactAddress,
        contactKind: chatThreads.contactKind,
        pinned: chatMembers.pinned,
        createdAt: chatThreads.createdAt,
        lastMessageAt: chatThreads.lastMessageAt,
        linkedKind: chatThreads.linkedKind,
        linkedId: chatThreads.linkedId,
        postPolicy: chatThreads.postPolicy,
        quietStart: chatThreads.quietStart,
        quietEnd: chatThreads.quietEnd,
        myRole: chatMembers.role,
        /** Direct threads: the other person. */
        peer: sql<{ id: string; fullName: string } | null>`(select json_build_object('id', u.id, 'fullName', u.full_name) from chat_members o join users u on u.id = o.user_id where o.thread_id = ${chatThreads.id} and o.user_id <> ${p.userId}::uuid and ${chatThreads.kind} = 'direct' limit 1)`,
        memberCount: sql<number>`(select count(*)::int from chat_members o where o.thread_id = ${chatThreads.id})`,
        lastMessage: sql<{ body: string; senderName: string | null; direction: string; attachment: boolean } | null>`(select json_build_object('body', m.body, 'senderName', u.full_name, 'direction', m.direction, 'attachment', m.attachment_key is not null) from chat_messages m left join users u on u.id = m.sender_id where m.thread_id = ${chatThreads.id} order by m.created_at desc limit 1)`,
        unread: sql<number>`(select count(*)::int from chat_messages m where m.thread_id = ${chatThreads.id} and m.sender_id is distinct from ${p.userId}::uuid and (${chatMembers.lastReadAt} is null or m.created_at > ${chatMembers.lastReadAt}))`,
      })
      .from(chatThreads)
      .innerJoin(chatMembers, eq(chatMembers.threadId, chatThreads.id))
      .$dynamic();
  }

  private async summary(tx: Tx, p: UserPrincipal, id: string) {
    const [s] = await this.summaries(tx, p).where(and(eq(chatThreads.id, id), eq(chatMembers.userId, p.userId)));
    return s;
  }
}

/** Drops the quoted history under a reply ("On … wrote:" / lines starting with >). */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  for (const l of lines) {
    if (/^On .+wrote:\s*$/.test(l.trim()) || /^-{2,}\s*Original Message/i.test(l.trim())) break;
    if (l.startsWith('>')) continue;
    out.push(l);
  }
  return out.join('\n').trim();
}
