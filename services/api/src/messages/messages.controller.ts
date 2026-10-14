import { RealtimeEvents } from '@kinetix/shared';
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { and, asc, desc, eq, ilike, inArray, isNull, lt, notInArray, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { BlobBody, putBlob, sendBlob } from '../common/blob.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { conversations, guardians, messages, sections, students, subjects, tenants, timetableSlots, userRoles, users, type ChatSettings } from '../db/schema.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { UploadScanService } from '../scanning/upload-scan.js';
import { ObjectStorage } from '../storage/storage.service.js';
import { isSchoolAdmin } from '../teacher/teacher.service.js';
import { naturalAsc } from '../common/natural-order.js';
import { FAMILY_ROLES, outsideOfficeHours, studentChatEnabled, tick, validOfficeHours } from './chat-rules.js';

const StartBody = z
  .object({ studentId: z.uuid(), withUserId: z.uuid().optional(), office: z.boolean().default(false) })
  .refine((b) => b.office || b.withUserId, { message: 'Choose a teacher or the office' });
/** Chat attachments: a photo or a PDF. */
const ChatAttachment = BlobBody.extend({ contentType: z.enum(['image/png', 'image/jpeg', 'application/pdf']) });
const SendBody = z
  .object({ body: z.string().trim().max(2000).default(''), attachment: ChatAttachment.optional() })
  .refine((b) => b.body.length > 0 || b.attachment, { message: 'Write a message or attach a photo or PDF' });
const StatusBody = z.object({ status: z.enum(['open', 'closed', 'resolved']) });
const AssignBody = z.object({ userId: z.uuid() });
const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');
const SettingsBody = z.object({
  studentChat: z.boolean().optional(),
  officeHours: z.object({ start: HHMM, end: HHMM, days: z.array(z.number().int().min(1).max(7)).min(1).max(7) }).nullable().optional(),
  officeUserIds: z.array(z.uuid()).max(50).optional(),
});
const ClassTeacherBody = z.object({ userId: z.uuid().nullable() });

const staffUser = alias(users, 'staff_user');
const familyUser = alias(users, 'family_user');

type Conversation = typeof conversations.$inferSelect;
/** How the caller takes part in a thread: as the family, as staff (the assignee or office staff), or a leader reading for safeguarding. */
type Side = 'family' | 'staff' | 'leader';

/**
 * Two-way chat between families and staff. Every thread is about one student and is with a class or
 * subject teacher, or with the office. Students chat for themselves when the institution allows it
 * (default: colleges yes, schools no). Staff close, reopen, resolve, mute and reassign threads.
 * School leaders can read any thread; every such read is audited.
 */
@Controller('v1/conversations')
export class ConversationsController {
  constructor(
    private readonly db: DbService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
    private readonly scans: UploadScanService,
    private readonly storage: ObjectStorage,
    private readonly clock: Clock,
  ) {}

  /**
   * Who the caller can write to. `asFamily`: per child, the class teacher, subject teachers and the
   * office. `asStaff`: the families of students in the classes they teach (narrow with `?sectionId=`).
   */
  @Get('contacts')
  @Auth('user')
  contacts(@CurrentPrincipal() p: UserPrincipal, @Query('sectionId') sectionId?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const kids = await this.familyStudents(tx, p);
      const forFamily = await Promise.all(
        kids.map(async (k) => {
          const staff = await tx
            .selectDistinct({ id: users.id, fullName: users.fullName, subject: subjects.name })
            .from(timetableSlots)
            .innerJoin(users, eq(users.id, timetableSlots.teacherId))
            .innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
            .where(and(eq(timetableSlots.sectionId, k.sectionId), isNull(timetableSlots.archivedAt)))
            .orderBy(asc(users.fullName));
          const byId = new Map<string, { id: string; fullName: string; subjects: string[]; classTeacher: boolean }>();
          if (k.classTeacherId) {
            const [ct] = await tx.select({ id: users.id, fullName: users.fullName }).from(users).where(and(eq(users.id, k.classTeacherId), eq(users.status, 'active')));
            if (ct) byId.set(ct.id, { ...ct, subjects: [], classTeacher: true });
          }
          for (const s of staff) {
            const e = byId.get(s.id) ?? { id: s.id, fullName: s.fullName, subjects: [], classTeacher: false };
            if (!e.subjects.includes(s.subject)) e.subjects.push(s.subject);
            byId.set(s.id, e);
          }
          return { student: { id: k.id, fullName: k.fullName, className: k.className }, staff: [...byId.values()], office: true };
        }),
      );
      // Staff: the families of students in the classes they teach or are class teacher of (or of one class: ?sectionId=).
      const taught = await tx
        .selectDistinct({ sectionId: timetableSlots.sectionId })
        .from(timetableSlots)
        .where(and(eq(timetableSlots.teacherId, p.userId), isNull(timetableSlots.archivedAt)));
      const own = await tx.select({ sectionId: sections.id }).from(sections).where(eq(sections.classTeacherId, p.userId));
      const sectionIds = [...new Set([...taught, ...own].map((t) => t.sectionId))].filter((id) => !sectionId || id === sectionId);
      const asStaff = sectionIds.length ? await this.familiesOf(tx, sectionIds) : [];
      return { asFamily: forFamily, asStaff };
    });
  }

  private async familiesOf(tx: Tx, sectionIds: string[]) {
    const rows = await tx
      .select({
        studentId: students.id,
        fullName: students.fullName,
        rollNo: students.rollNo,
        className: sections.displayName,
        guardianId: guardians.userId,
        relation: guardians.relation,
        guardianName: users.fullName,
      })
      .from(students)
      .innerJoin(sections, eq(sections.id, students.sectionId))
      .leftJoin(guardians, eq(guardians.studentId, students.id))
      .leftJoin(users, eq(users.id, guardians.userId))
      .where(and(inArray(students.sectionId, sectionIds), eq(students.status, 'active')))
      .orderBy(...naturalAsc(sections.displayName), asc(students.rollNo));
    const byStudent = new Map<string, { student: { id: string; fullName: string; rollNo: string; className: string }; guardians: { id: string; fullName: string; relation: string }[] }>();
    for (const r of rows) {
      const e = byStudent.get(r.studentId) ?? { student: { id: r.studentId, fullName: r.fullName, rollNo: r.rollNo, className: r.className }, guardians: [] };
      if (r.guardianId && r.guardianName) e.guardians.push({ id: r.guardianId, fullName: r.guardianName, relation: r.relation ?? 'parent' });
      byStudent.set(r.studentId, e);
    }
    return [...byStudent.values()];
  }

  /** Office hours and whether students may chat (anyone); office staff and class teachers too for leaders. */
  @Get('settings')
  @Auth('user')
  settings(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const t = await this.tenant(tx);
      const base = { studentChat: studentChatEnabled(t.settings.chat, t.kind), officeHours: t.settings.chat?.officeHours ?? null, timezone: t.timezone, kind: t.kind };
      if (!isSchoolAdmin(p)) return base;
      const office = await this.officeStaffIds(tx);
      const officeStaff = office.length ? await tx.select({ id: users.id, fullName: users.fullName }).from(users).where(inArray(users.id, office)).orderBy(asc(users.fullName)) : [];
      const classTeachers = await tx
        .select({ sectionId: sections.id, displayName: sections.displayName, classTeacher: sql<{ id: string; fullName: string } | null>`(select json_build_object('id', u.id, 'fullName', u.full_name) from users u where u.id = ${sections.classTeacherId})` })
        .from(sections)
        .orderBy(...naturalAsc(sections.displayName));
      return { ...base, officeUserIds: t.settings.chat?.officeUserIds ?? [], officeStaff, classTeachers };
    });
  }

  @Put('settings')
  @Auth('user', ['tenant_admin', 'principal'])
  saveSettings(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(SettingsBody)) body: z.infer<typeof SettingsBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const t = await this.tenant(tx);
      if (body.officeHours && !validOfficeHours(body.officeHours)) throw new BadRequestException('Office hours must start before they end');
      if (body.officeUserIds?.length) await this.assertStaff(tx, body.officeUserIds);
      const before = t.settings.chat ?? {};
      const chat: ChatSettings = {
        ...before,
        ...(body.studentChat !== undefined ? { studentChat: body.studentChat } : {}),
        ...(body.officeHours !== undefined ? { officeHours: body.officeHours } : {}),
        ...(body.officeUserIds !== undefined ? { officeUserIds: [...new Set(body.officeUserIds)] } : {}),
      };
      await tx.update(tenants).set({ settings: { ...t.settings, chat } }).where(eq(tenants.id, p.tenantId));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'conversation.settings_changed', subjectType: 'tenant', subjectId: p.tenantId, data: { before, after: chat } });
      return { studentChat: studentChatEnabled(chat, t.kind), officeHours: chat.officeHours ?? null, officeUserIds: chat.officeUserIds ?? [] };
    });
  }

  /** Sets (or clears) a class's class teacher, who families see first in their contacts. */
  @Put('class-teachers/:sectionId')
  @Auth('user', ['tenant_admin', 'principal'])
  classTeacher(@CurrentPrincipal() p: UserPrincipal, @Param('sectionId', ParseUUIDPipe) sectionId: string, @Body(new ZodBody(ClassTeacherBody)) body: z.infer<typeof ClassTeacherBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [s] = await tx.select({ id: sections.id, classTeacherId: sections.classTeacherId }).from(sections).where(eq(sections.id, sectionId));
      if (!s) throw new NotFoundException('Class not found');
      if (body.userId) await this.assertStaff(tx, [body.userId]);
      await tx.update(sections).set({ classTeacherId: body.userId }).where(eq(sections.id, sectionId));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'section.class_teacher_set', subjectType: 'section', subjectId: sectionId, changes: { classTeacherId: { before: s.classTeacherId, after: body.userId } } });
      return { sectionId, classTeacherId: body.userId };
    });
  }

  /** Who in a student's family staff can write to: guardians, and the student when students may chat. */
  @Get('families/:studentId')
  @Auth('user')
  family(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [st] = await tx.select({ id: students.id, fullName: students.fullName, sectionId: students.sectionId, userId: students.userId, className: sections.displayName }).from(students).innerJoin(sections, eq(sections.id, students.sectionId)).where(eq(students.id, studentId));
      if (!st) throw new NotFoundException('Student not found');
      const office = await this.officeStaffIds(tx);
      if (!isSchoolAdmin(p) && !office.includes(p.userId) && !(await this.teachesOrLeads(tx, p.userId, st.sectionId))) throw new NotFoundException('Student not found');
      const people = await tx
        .select({ id: users.id, fullName: users.fullName, relation: guardians.relation })
        .from(guardians)
        .innerJoin(users, eq(users.id, guardians.userId))
        .where(and(eq(guardians.studentId, studentId), eq(users.status, 'active')))
        .orderBy(asc(users.fullName));
      const self = st.userId && (await this.studentsMayWrite(tx)) ? [{ id: st.userId, fullName: st.fullName, relation: 'self' }] : [];
      return { student: { id: st.id, fullName: st.fullName, className: st.className }, people: [...people, ...self], office: office.includes(p.userId) };
    });
  }

  /** Unread messages across the caller's threads (the apps' badge). */
  @Get('unread')
  @Auth('user')
  unread(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const office = await this.officeStaffIds(tx);
      const rows = await this.summaries(tx, p, office.includes(p.userId)).where(this.mine(p, office.includes(p.userId)));
      return { unread: rows.reduce((n, r) => n + r.unread, 0), threads: rows.filter((r) => r.unread > 0).length };
    });
  }

  /** Opens (or returns) the thread between the caller and a teacher, the office, or a family about a student. */
  @Post()
  @Auth('user')
  start(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(StartBody)) body: z.infer<typeof StartBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [student] = await tx.select({ id: students.id, sectionId: students.sectionId }).from(students).where(eq(students.id, body.studentId));
      if (!student) throw new NotFoundException('Student not found');
      const office = await this.officeStaffIds(tx);
      let staffId: string;
      let familyId: string;
      let kind: 'teacher' | 'office' = 'teacher';
      if (await this.isFamilyOf(tx, p, student.id)) {
        familyId = p.userId;
        if (body.office) {
          kind = 'office';
          const [existing] = await tx
            .select({ id: conversations.id })
            .from(conversations)
            .where(and(eq(conversations.studentId, student.id), eq(conversations.familyId, familyId), eq(conversations.kind, 'office')));
          if (existing) return this.summary(tx, p, existing.id, office);
          if (office.length === 0) throw new ConflictException('The office is not taking messages yet');
          staffId = office[0];
        } else {
          if (!(await this.teachesOrLeads(tx, body.withUserId!, student.sectionId))) throw new ForbiddenException('You can write to the teachers of this class');
          staffId = body.withUserId!;
        }
      } else if (isSchoolAdmin(p) || office.includes(p.userId) || (await this.teachesOrLeads(tx, p.userId, student.sectionId))) {
        if (!body.withUserId) throw new BadRequestException('Choose who in the family to write to');
        const [g] = await tx.select({ id: guardians.id }).from(guardians).where(and(eq(guardians.studentId, student.id), eq(guardians.userId, body.withUserId)));
        const [self] = await tx.select({ id: students.id }).from(students).where(and(eq(students.id, student.id), eq(students.userId, body.withUserId)));
        if (!g && !(self && (await this.studentsMayWrite(tx)))) throw new ForbiddenException("You can write to this student's family");
        staffId = p.userId;
        familyId = body.withUserId;
        if (body.office && office.includes(p.userId)) kind = 'office';
      } else {
        throw new NotFoundException('Student not found');
      }
      const [existing] = await tx
        .select({ id: conversations.id })
        .from(conversations)
        .where(
          kind === 'office'
            ? and(eq(conversations.studentId, student.id), eq(conversations.familyId, familyId), eq(conversations.kind, 'office'))
            : and(eq(conversations.studentId, student.id), eq(conversations.staffId, staffId), eq(conversations.familyId, familyId), eq(conversations.kind, 'teacher')),
        );
      const id = existing?.id ?? (await tx.insert(conversations).values({ tenantId: p.tenantId, studentId: student.id, staffId, familyId, kind }).returning())[0].id;
      if (!existing) await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'conversation.started', subjectType: 'conversation', subjectId: id, data: { kind, studentId: student.id } });
      return this.summary(tx, p, id, office);
    });
  }

  /**
   * The caller's threads (office staff also see office threads), latest first, with unread counts.
   * Filters: `?status=open|closed|resolved`, `?unread=true`, `?sectionId=`, `?q=` (student or person).
   * School leaders may pass `?all=true` to list every thread (no message text; opening one is audited).
   */
  @Get()
  @Auth('user')
  list(
    @CurrentPrincipal() p: UserPrincipal,
    @Query('all') all?: string,
    @Query('status') status?: string,
    @Query('unread') unreadOnly?: string,
    @Query('sectionId') sectionId?: string,
    @Query('q') q?: string,
  ) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const office = await this.officeStaffIds(tx);
      const isOffice = office.includes(p.userId);
      const filters: (SQL | undefined)[] = [
        status === 'open' || status === 'closed' || status === 'resolved' ? eq(conversations.status, status) : undefined,
        sectionId && /^[0-9a-f-]{36}$/i.test(sectionId) ? eq(students.sectionId, sectionId) : undefined,
        q?.trim() ? this.search(q) : undefined,
      ];
      if (all === 'true') {
        if (!isSchoolAdmin(p)) throw new ForbiddenException();
        const rows = await this.summaries(tx, p, isOffice).where(and(...filters)).orderBy(sql`${conversations.lastMessageAt} desc nulls last`).limit(300);
        // Text of threads the leader is not part of stays hidden until they open one (audited).
        return rows.map((r) => (r.side === 'leader' ? { ...r, lastMessage: null, unread: 0 } : r));
      }
      const now = new Date();
      await tx.update(conversations).set({ familyDeliveredAt: now }).where(eq(conversations.familyId, p.userId));
      await tx
        .update(conversations)
        .set({ staffDeliveredAt: now })
        .where(isOffice ? or(eq(conversations.staffId, p.userId), eq(conversations.kind, 'office')) : eq(conversations.staffId, p.userId));
      const rows = await this.summaries(tx, p, isOffice)
        .where(and(this.mine(p, isOffice), ...filters))
        .orderBy(sql`${conversations.lastMessageAt} desc nulls last`)
        .limit(300);
      return unreadOnly === 'true' ? rows.filter((r) => r.unread > 0) : rows;
    });
  }

  @Get(':id/messages')
  @Auth('user')
  read(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Query('before') before?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const c = await this.load(tx, id);
      const office = await this.officeStaffIds(tx);
      const side = this.sideOf(p, c, office);
      if (!side) throw new NotFoundException('Conversation not found');
      if (side === 'leader') {
        await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'conversation.read_by_leader', subjectType: 'conversation', subjectId: id });
      } else {
        const now = new Date();
        await tx.update(conversations).set(side === 'family' ? { familyDeliveredAt: now } : { staffDeliveredAt: now }).where(eq(conversations.id, id));
      }
      const [fresh] = await tx.select().from(conversations).where(eq(conversations.id, id));
      const page = await tx
        .select({
          id: messages.id,
          senderId: messages.senderId,
          senderName: users.fullName,
          kind: messages.kind,
          body: messages.body,
          attachment: sql<{ name: string; type: string; size: number } | null>`case when ${messages.attachmentKey} is null then null else json_build_object('name', ${messages.attachmentName}, 'type', ${messages.attachmentType}, 'size', ${messages.attachmentSize}) end`,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .innerJoin(users, eq(users.id, messages.senderId))
        .where(and(eq(messages.conversationId, id), before && !Number.isNaN(Date.parse(before)) ? lt(messages.createdAt, new Date(before)) : undefined))
        .orderBy(desc(messages.createdAt))
        .limit(50);
      const t = await this.tenant(tx);
      const hours = t.settings.chat?.officeHours ?? null;
      return {
        conversation: await this.summary(tx, p, id, office),
        messages: page.reverse().map((m) => this.withTick(m, fresh, side)),
        officeHours: hours,
        afterHours: side === 'family' && outsideOfficeHours(this.clock.now(), t.timezone, hours),
        canWrite: side === 'staff' || (side === 'family' && fresh.status !== 'closed'),
      };
    });
  }

  @Post(':id/messages')
  @Auth('user')
  async send(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(SendBody)) body: z.infer<typeof SendBody>) {
    let stored: Awaited<ReturnType<typeof putBlob>> | undefined;
    // Who may write is checked before the file is stored.
    await this.db.withTenant(p.tenantId, async (tx) => this.writable(tx, p, await this.load(tx, id), await this.officeStaffIds(tx)));
    if (body.attachment) {
      await this.scans.assertClean(Buffer.from(body.attachment.contentBase64, 'base64'), 'The attachment');
      stored = await putBlob(this.storage, p.tenantId, 'conversations', body.attachment);
    }
    const { out, notify } = await this.db.withTenant(p.tenantId, async (tx) => {
      const c = await this.load(tx, id);
      const office = await this.officeStaffIds(tx);
      const side = this.writable(tx, p, c, office);
      const fromStaff = side === 'staff';
      const now = new Date();
      const [m] = await tx
        .insert(messages)
        .values({
          tenantId: p.tenantId,
          conversationId: id,
          senderId: p.userId,
          body: body.body,
          createdAt: now,
          ...(stored ? { attachmentKey: stored.storageKey, attachmentName: stored.title, attachmentType: stored.contentType, attachmentSize: stored.sizeBytes } : {}),
        })
        .returning();
      await tx
        .update(conversations)
        .set({
          lastMessageAt: now,
          ...(fromStaff ? { staffReadAt: now, staffDeliveredAt: now } : { familyReadAt: now, familyDeliveredAt: now }),
          // A family writing again reopens a resolved thread.
          ...(!fromStaff && c.status === 'resolved' ? { status: 'open' as const, statusChangedAt: now, statusChangedBy: p.userId } : {}),
        })
        .where(eq(conversations.id, id));
      const [sender] = await tx.select({ fullName: users.fullName }).from(users).where(eq(users.id, p.userId));
      const recipientId = fromStaff ? c.familyId : c.staffId;
      if (fromStaff || !c.staffMuted) {
        await this.notifications.messageSent(tx, {
          id: m.id,
          conversationId: id,
          recipientId,
          senderName: sender?.fullName ?? 'KINETIX',
          body: body.body || stored?.title || '',
          studentId: c.studentId,
        });
      }
      const t = await this.tenant(tx);
      const hours = t.settings.chat?.officeHours ?? null;
      const afterHours = !fromStaff && outsideOfficeHours(this.clock.now(), t.timezone, hours);
      const people = [c.familyId, c.staffId, p.userId, ...(c.kind === 'office' ? office : [])];
      return {
        out: {
          id: m.id,
          senderId: m.senderId,
          senderName: sender?.fullName ?? '',
          kind: m.kind,
          body: m.body,
          attachment: stored ? { name: stored.title, type: stored.contentType, size: stored.sizeBytes } : null,
          createdAt: m.createdAt,
          status: 'sent' as const,
          afterHours,
          officeHours: afterHours ? hours : null,
        },
        notify: people,
      };
    });
    // After the commit, so an app that refetches on this event sees the message.
    this.realtime.toUsers(notify, RealtimeEvents.MessageNew, { conversationId: id, messageId: out.id, senderId: p.userId });
    return out;
  }

  @Get(':id/messages/:messageId/attachment')
  @Auth('user')
  async attachment(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('messageId', ParseUUIDPipe) messageId: string, @Res({ passthrough: true }) res: Response) {
    const row = await this.db.withTenant(p.tenantId, async (tx) => {
      const c = await this.load(tx, id);
      const side = this.sideOf(p, c, await this.officeStaffIds(tx));
      if (!side) throw new NotFoundException('Conversation not found');
      const [m] = await tx.select().from(messages).where(and(eq(messages.id, messageId), eq(messages.conversationId, id)));
      if (!m?.attachmentKey) throw new NotFoundException('No attachment');
      if (side === 'leader') await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'conversation.attachment_read_by_leader', subjectType: 'conversation', subjectId: id, data: { messageId } });
      return m;
    });
    return sendBlob(this.storage, res, { storageKey: row.attachmentKey, contentType: row.attachmentType, title: row.attachmentName ?? 'attachment' });
  }

  @Post(':id/read')
  @HttpCode(204)
  @Auth('user')
  async markRead(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    const at = new Date();
    const done = await this.db.withTenant(p.tenantId, async (tx) => {
      const c = await this.load(tx, id);
      const side = this.sideOf(p, c, await this.officeStaffIds(tx));
      if (!side || side === 'leader') throw new NotFoundException('Conversation not found');
      await tx
        .update(conversations)
        .set(side === 'staff' ? { staffReadAt: at, staffDeliveredAt: at } : { familyReadAt: at, familyDeliveredAt: at })
        .where(eq(conversations.id, id));
      return { side, people: [c.familyId, c.staffId] };
    });
    this.realtime.toUsers(done.people, RealtimeEvents.MessageRead, { conversationId: id, side: done.side, at: at.toISOString() });
  }

  /** Staff: close (the family can no longer write), reopen, or mark resolved. */
  @Post(':id/status')
  @HttpCode(200)
  @Auth('user')
  async setStatus(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(StatusBody)) body: z.infer<typeof StatusBody>) {
    const { summary, people } = await this.db.withTenant(p.tenantId, async (tx) => {
      const c = await this.load(tx, id);
      const office = await this.officeStaffIds(tx);
      if (this.sideOf(p, c, office) !== 'staff') throw new NotFoundException('Conversation not found');
      if (c.status !== body.status) {
        const now = new Date();
        await tx.update(conversations).set({ status: body.status, statusChangedAt: now, statusChangedBy: p.userId }).where(eq(conversations.id, id));
        const [me] = await tx.select({ fullName: users.fullName }).from(users).where(eq(users.id, p.userId));
        const verb = body.status === 'closed' ? 'Closed' : body.status === 'resolved' ? 'Marked resolved' : 'Reopened';
        await tx.insert(messages).values({ tenantId: p.tenantId, conversationId: id, senderId: p.userId, kind: 'system', body: `${verb} by ${me?.fullName ?? 'staff'}`, createdAt: now });
        await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: `conversation.${body.status === 'open' ? 'reopened' : body.status}`, subjectType: 'conversation', subjectId: id, changes: { status: { before: c.status, after: body.status } } });
      }
      return { summary: await this.summary(tx, p, id, office), people: [c.familyId, c.staffId, ...(c.kind === 'office' ? office : [])] };
    });
    this.realtime.toUsers(people, RealtimeEvents.ConversationChanged, { conversationId: id });
    return summary;
  }

  /** Staff: no push notifications for new messages in this thread. */
  @Post(':id/mute')
  @HttpCode(200)
  @Auth('user')
  mute(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ muted: z.boolean() }))) body: { muted: boolean }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const c = await this.load(tx, id);
      const office = await this.officeStaffIds(tx);
      if (this.sideOf(p, c, office) !== 'staff') throw new NotFoundException('Conversation not found');
      await tx.update(conversations).set({ staffMuted: body.muted }).where(eq(conversations.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: body.muted ? 'conversation.muted' : 'conversation.unmuted', subjectType: 'conversation', subjectId: id });
      return this.summary(tx, p, id, office);
    });
  }

  /** Hands the thread to another member of staff (the staff side of the thread, or a leader). */
  @Post(':id/assign')
  @HttpCode(200)
  @Auth('user')
  async assign(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(AssignBody)) body: z.infer<typeof AssignBody>) {
    const { summary, people } = await this.db.withTenant(p.tenantId, async (tx) => {
      const c = await this.load(tx, id);
      const office = await this.officeStaffIds(tx);
      const side = this.sideOf(p, c, office);
      if (side !== 'staff' && side !== 'leader') throw new NotFoundException('Conversation not found');
      await this.assertStaff(tx, [body.userId]);
      if (body.userId === c.staffId) return { summary: await this.summary(tx, p, id, office), people: [] as string[] };
      if (c.kind === 'teacher') {
        const [clash] = await tx
          .select({ id: conversations.id })
          .from(conversations)
          .where(and(eq(conversations.studentId, c.studentId), eq(conversations.familyId, c.familyId), eq(conversations.staffId, body.userId), eq(conversations.kind, 'teacher')));
        if (clash) throw new ConflictException('This family already has a thread with that teacher about this student');
      }
      const now = new Date();
      // The new assignee starts with everything unread.
      await tx.update(conversations).set({ staffId: body.userId, staffReadAt: null, staffDeliveredAt: null, staffMuted: false }).where(eq(conversations.id, id));
      const names = await tx.select({ id: users.id, fullName: users.fullName }).from(users).where(inArray(users.id, [p.userId, body.userId]));
      const name = (uid: string) => names.find((n) => n.id === uid)?.fullName ?? '';
      await tx.insert(messages).values({ tenantId: p.tenantId, conversationId: id, senderId: p.userId, kind: 'system', body: `Assigned to ${name(body.userId)} by ${name(p.userId)}`, createdAt: now });
      await this.notifications.notifyUsers(tx, [body.userId], {
        kind: 'message',
        text: { title: `Conversation assigned to you by ${name(p.userId)}`, body: 'Open KINETIX to read and reply.' },
        data: { conversationId: id, studentId: c.studentId },
        dedupeKey: `conversation-assigned:${id}:${now.toISOString()}`,
      });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'conversation.assigned', subjectType: 'conversation', subjectId: id, changes: { staffId: { before: c.staffId, after: body.userId } } });
      return { summary: await this.summary(tx, p, id, office), people: [c.familyId, c.staffId, body.userId] };
    });
    this.realtime.toUsers(people, RealtimeEvents.ConversationChanged, { conversationId: id });
    return summary;
  }

  // --------------------------------------------------------------------------------------------

  /** The caller's own threads: as family, as the assignee, or (office staff) any office thread. */
  private mine(p: UserPrincipal, isOffice: boolean): SQL {
    return or(eq(conversations.staffId, p.userId), eq(conversations.familyId, p.userId), isOffice ? eq(conversations.kind, 'office') : undefined)!;
  }

  private search(q: string): SQL {
    const like = `%${q.trim().replace(/[%_\\]/g, '')}%`;
    return or(ilike(students.fullName, like), ilike(staffUser.fullName, like), ilike(familyUser.fullName, like), ilike(sections.displayName, like))!;
  }

  private sideOf(p: UserPrincipal, c: Conversation, office: string[]): Side | null {
    if (c.familyId === p.userId) return 'family';
    if (c.staffId === p.userId || (c.kind === 'office' && office.includes(p.userId))) return 'staff';
    if (isSchoolAdmin(p)) return 'leader';
    return null;
  }

  /** The caller's side when they may write now: leaders who are not part of the thread cannot. */
  private writable(_tx: Tx, p: UserPrincipal, c: Conversation, office: string[]): 'family' | 'staff' {
    const side = this.sideOf(p, c, office);
    if (side === 'family') {
      if (c.status === 'closed') throw new ConflictException('This conversation was closed by the institution');
      return side;
    }
    if (side === 'staff') return side;
    throw new NotFoundException('Conversation not found');
  }

  private withTick<M extends { senderId: string; kind: string; createdAt: Date }>(m: M, c: Conversation, side: Side) {
    const fromFamily = m.senderId === c.familyId;
    const mine = m.kind === 'text' && (side === 'family' ? fromFamily : side === 'staff' ? !fromFamily : false);
    const other = side === 'family' ? { readAt: c.staffReadAt, deliveredAt: c.staffDeliveredAt } : { readAt: c.familyReadAt, deliveredAt: c.familyDeliveredAt };
    return { ...m, side: m.kind === 'system' ? 'system' : fromFamily ? 'family' : 'staff', status: mine ? tick(m.createdAt, other) : null };
  }

  private summaries(tx: Tx, p: UserPrincipal, isOffice: boolean) {
    const staffSide = isOffice ? sql`(${conversations.staffId} = ${p.userId}::uuid or ${conversations.kind} = 'office')` : sql`${conversations.staffId} = ${p.userId}::uuid`;
    const side = sql<Side>`case when ${conversations.familyId} = ${p.userId}::uuid then 'family' when ${staffSide} then 'staff' else 'leader' end`;
    const myRead = sql`case when ${conversations.familyId} = ${p.userId}::uuid then ${conversations.familyReadAt} else ${conversations.staffReadAt} end`;
    // The other side's messages after my last read; leaders reading for safeguarding have nothing unread.
    const fromOther = sql`case when ${conversations.familyId} = ${p.userId}::uuid then m.sender_id <> ${conversations.familyId} else m.sender_id = ${conversations.familyId} end`;
    return tx
      .select({
        id: conversations.id,
        kind: conversations.kind,
        status: conversations.status,
        muted: conversations.staffMuted,
        side,
        student: { id: students.id, fullName: students.fullName, rollNo: students.rollNo },
        sectionId: sections.id,
        className: sections.displayName,
        staff: { id: staffUser.id, fullName: staffUser.fullName },
        family: { id: familyUser.id, fullName: familyUser.fullName },
        relation: sql<string | null>`(select g.relation from guardians g where g.user_id = ${conversations.familyId} and g.student_id = ${conversations.studentId} limit 1)`,
        lastMessageAt: conversations.lastMessageAt,
        lastMessage: sql<string | null>`(select case when m.body = '' and m.attachment_name is not null then m.attachment_name else m.body end from messages m where m.conversation_id = "conversations"."id" order by m.created_at desc limit 1)`,
        unread: sql<number>`(case when ${side} = 'leader' then 0 else (select count(*)::int from messages m where m.conversation_id = "conversations"."id" and m.kind = 'text' and ${fromOther} and (${myRead} is null or m.created_at > ${myRead})) end)`,
        statusChangedAt: conversations.statusChangedAt,
        createdAt: conversations.createdAt,
      })
      .from(conversations)
      .innerJoin(students, eq(students.id, conversations.studentId))
      .innerJoin(sections, eq(sections.id, students.sectionId))
      .innerJoin(staffUser, eq(staffUser.id, conversations.staffId))
      .innerJoin(familyUser, eq(familyUser.id, conversations.familyId))
      .$dynamic();
  }

  private async summary(tx: Tx, p: UserPrincipal, id: string, office: string[]) {
    const [s] = await this.summaries(tx, p, office.includes(p.userId)).where(eq(conversations.id, id));
    return s;
  }

  private async load(tx: Tx, id: string): Promise<Conversation> {
    const [c] = await tx.select().from(conversations).where(eq(conversations.id, id));
    if (!c) throw new NotFoundException('Conversation not found');
    return c;
  }

  private async tenant(tx: Tx) {
    const [t] = await tx.select({ kind: tenants.kind, timezone: tenants.timezone, settings: tenants.settings }).from(tenants);
    return t;
  }

  /** Who answers office threads: the institution's list, or else its principals and administrators. */
  private async officeStaffIds(tx: Tx): Promise<string[]> {
    const t = await this.tenant(tx);
    const listed = t.settings.chat?.officeUserIds ?? [];
    const rows = listed.length
      ? await tx.select({ id: users.id }).from(users).where(and(inArray(users.id, listed), eq(users.status, 'active')))
      : await tx
          .selectDistinct({ id: users.id, fullName: users.fullName })
          .from(userRoles)
          .innerJoin(users, eq(users.id, userRoles.userId))
          .where(and(inArray(userRoles.role, ['principal', 'tenant_admin']), eq(users.status, 'active')))
          .orderBy(asc(users.fullName));
    const ids = rows.map((r) => r.id);
    return listed.length ? listed.filter((id) => ids.includes(id)) : ids;
  }

  private async assertStaff(tx: Tx, ids: string[]) {
    const ok = await tx
      .selectDistinct({ id: userRoles.userId })
      .from(userRoles)
      .innerJoin(users, eq(users.id, userRoles.userId))
      .where(and(inArray(userRoles.userId, ids), notInArray(userRoles.role, FAMILY_ROLES as never[]), eq(users.status, 'active')));
    if (ok.length !== new Set(ids).size) throw new BadRequestException('Choose active staff of this institution');
  }

  /** The caller's children (as guardian), plus themselves when students may chat. */
  private async familyStudents(tx: Tx, p: UserPrincipal) {
    const cols = { id: students.id, fullName: students.fullName, sectionId: students.sectionId, className: sections.displayName, classTeacherId: sections.classTeacherId };
    const kids = await tx
      .select(cols)
      .from(guardians)
      .innerJoin(students, eq(students.id, guardians.studentId))
      .innerJoin(sections, eq(sections.id, students.sectionId))
      .where(eq(guardians.userId, p.userId));
    if (await this.studentsMayWrite(tx)) {
      kids.push(...(await tx.select(cols).from(students).innerJoin(sections, eq(sections.id, students.sectionId)).where(eq(students.userId, p.userId))));
    }
    return kids;
  }

  private async isFamilyOf(tx: Tx, p: UserPrincipal, studentId: string): Promise<boolean> {
    return (await this.familyStudents(tx, p)).some((k) => k.id === studentId);
  }

  /** Teaches the class (timetable) or is its class teacher. */
  private async teachesOrLeads(tx: Tx, userId: string, sectionId: string): Promise<boolean> {
    const [slot] = await tx
      .select({ id: timetableSlots.id })
      .from(timetableSlots)
      .where(and(eq(timetableSlots.teacherId, userId), eq(timetableSlots.sectionId, sectionId), isNull(timetableSlots.archivedAt)))
      .limit(1);
    if (slot) return true;
    const [ct] = await tx.select({ id: sections.id }).from(sections).where(and(eq(sections.id, sectionId), eq(sections.classTeacherId, userId)));
    return !!ct;
  }

  private async studentsMayWrite(tx: Tx): Promise<boolean> {
    const t = await this.tenant(tx);
    return studentChatEnabled(t.settings.chat, t.kind);
  }
}
