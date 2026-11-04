import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import type { BroadcastMessage } from '@zynetix/shared';
import { RealtimeEvents } from '@zynetix/shared';
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, lte, notInArray, or, sql } from 'drizzle-orm';
import { STAFF_ADMIN_ROLES } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { isHodOnly } from '../comms/comms.controller.js';
import { CommsService, departmentOf } from '../comms/comms.service.js';
import { hodScope, outside } from '../comms/scope.js';
import { announcementPollVotes } from '../db/schema-comms.js';
import { audienceRules, messageCampaigns, messageTemplates } from '../db/schema-pathways.js';
import { BroadcastsService } from '../broadcasts/broadcasts.service.js';
import { audit } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { DbService, type Tx } from '../db/db.service.js';
import {
  announcementRecipients,
  announcements,
  departmentStaff,
  departments,
  guardians,
  hostelAllotments,
  hostelBeds,
  hostelBlocks,
  hostelRooms,
  jobs,
  notifications,
  sections,
  students,
  subjects,
  timetableSlots,
  transportAssignments,
  userRoles,
  users,
  type AnnouncementAttachment,
  type AnnouncementExternal,
  type AnnouncementPoll,
  type AnnouncementTranslations,
  type AnnouncementAudience,
  type AnnouncementChannel,
  type BroadcastAudience,
} from '../db/schema.js';
import { DomainEvents, EventBus } from '../events/events.js';
import { JobsService, type Job } from '../jobs/jobs.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { inLanguage, pct, plainText, pollResults } from './announcements.logic.js';

export const ANNOUNCEMENT_SEND = 'announcements.send';
type AppChannel = Exclude<AnnouncementChannel, 'boards'>;
const APP_CHANNELS: AppChannel[] = ['teacher', 'student', 'parent'];
const FAMILY_ROLES = ['guardian', 'student'];
/** A reminder to the same unread people at most this often. */
const REMIND_EVERY_MS = 10 * 60_000;

export interface AnnouncementInput {
  title: string;
  body: string;
  priority: 'normal' | 'important' | 'emergency';
  channels: AnnouncementChannel[];
  audience: AnnouncementAudience;
  requiresAck: boolean;
  sendAt: Date | null;
  expiresAt: Date | null;
  translations: AnnouncementTranslations;
  poll: AnnouncementPoll | null;
  external: AnnouncementExternal | null;
}

/** What to emit once the transaction that sent an announcement has committed. */
export interface Fanout {
  tenantId: string;
  announcementId: string;
  priority: 'normal' | 'important' | 'emergency';
  userIds: string[];
  board: { message: BroadcastMessage; deviceIds: string[] } | null;
  /** The SMS, WhatsApp or email campaign that carries the notice outside the apps. */
  campaignId: string | null;
}

/**
 * Announcements: one message, many channels. Recipients are resolved when it is sent (now, or by the
 * job at its scheduled time) into one row per person per app, which then carries delivery, read and
 * acknowledgement. Boards get it as a broadcast. Important ones are pushed and stay pinned in the apps
 * until they expire or are acknowledged.
 */
@Injectable()
export class AnnouncementsService implements OnModuleInit {
  private readonly log = new Logger(AnnouncementsService.name);

  constructor(
    private readonly db: DbService,
    private readonly jobs: JobsService,
    private readonly clock: Clock,
    private readonly broadcasts: BroadcastsService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
    private readonly comms: CommsService,
    private readonly events: EventBus,
  ) {}

  onModuleInit(): void {
    this.jobs.register(ANNOUNCEMENT_SEND, (job: Job) => this.sendScheduled(job.tenantId, job.payload.id).then(() => undefined));
  }

  // ---------------------------------------------------------------------------------------------
  // Recipients

  /** The people an audience reaches on each app channel. */
  async resolve(tx: Tx, a: AnnouncementAudience, channels: AnnouncementChannel[]): Promise<{ userId: string; channel: AppChannel }[]> {
    const out: { userId: string; channel: AppChannel }[] = [];
    const want = (c: AppChannel) => channels.includes(c);
    if (a.scope === 'lists' && a.listIds?.length) {
      // Saved audiences (Communication > Audiences) become picked people.
      const lists = await tx.select({ rule: audienceRules.rule }).from(audienceRules).where(inArray(audienceRules.id, a.listIds));
      const ids = new Set<string>();
      for (const l of lists) for (const id of await this.comms.audienceUsers(tx, l.rule)) ids.add(id);
      return this.resolve(tx, { scope: 'people', userIds: [...ids] }, channels);
    }
    if (a.scope === 'roles') {
      const roles = a.roles ?? [];
      const staffRoles = roles.filter((r) => !FAMILY_ROLES.includes(r));
      if (want('teacher') && staffRoles.length) for (const r of await tx.selectDistinct({ id: userRoles.userId }).from(userRoles).where(inArray(userRoles.role, staffRoles as never[]))) out.push({ userId: r.id, channel: 'teacher' });
      const kids = roles.includes('student') || roles.includes('guardian') ? (await tx.select({ id: students.id }).from(students).where(eq(students.status, 'active'))).map((s) => s.id) : [];
      if (want('student') && roles.includes('student') && kids.length) for (const r of await tx.select({ id: students.userId }).from(students).where(and(eq(students.status, 'active'), isNotNull(students.userId)))) out.push({ userId: r.id!, channel: 'student' });
      if (want('parent') && roles.includes('guardian') && kids.length) for (const r of await tx.selectDistinct({ id: guardians.userId }).from(guardians).innerJoin(students, eq(students.id, guardians.studentId)).where(eq(students.status, 'active'))) out.push({ userId: r.id, channel: 'parent' });
      return this.activeOnce(tx, out);
    }
    const studentIds = want('student') || want('parent') ? await this.scopeStudents(tx, a) : [];
    if (want('teacher')) for (const id of await this.scopeStaff(tx, a)) out.push({ userId: id, channel: 'teacher' });
    if (want('student') && studentIds.length) {
      const rows = await tx.select({ id: students.userId }).from(students).where(and(inArray(students.id, studentIds), isNotNull(students.userId)));
      for (const r of rows) out.push({ userId: r.id!, channel: 'student' });
    }
    if (want('parent') && studentIds.length) {
      const rows = await tx.selectDistinct({ id: guardians.userId }).from(guardians).where(inArray(guardians.studentId, studentIds));
      for (const r of rows) out.push({ userId: r.id, channel: 'parent' });
    }
    if (a.scope === 'people' && a.userIds?.length) {
      // Picked people go to the app that matches who they are, when that app is a chosen channel.
      const roles = await tx.select({ userId: userRoles.userId, role: userRoles.role }).from(userRoles).where(inArray(userRoles.userId, a.userIds));
      for (const id of a.userIds) {
        const rs = roles.filter((r) => r.userId === id).map((r) => r.role as string);
        if (want('teacher') && rs.some((r) => !FAMILY_ROLES.includes(r))) out.push({ userId: id, channel: 'teacher' });
        if (want('parent') && rs.includes('guardian')) out.push({ userId: id, channel: 'parent' });
        if (want('student') && rs.includes('student')) out.push({ userId: id, channel: 'student' });
      }
    }
    return this.activeOnce(tx, out);
  }

  /** Active accounts only, once per app. */
  private async activeOnce(tx: Tx, out: { userId: string; channel: AppChannel }[]): Promise<{ userId: string; channel: AppChannel }[]> {
    const ids = [...new Set(out.map((o) => o.userId))];
    if (ids.length === 0) return [];
    const active = new Set((await tx.select({ id: users.id }).from(users).where(and(inArray(users.id, ids), eq(users.status, 'active')))).map((u) => u.id));
    const seen = new Set<string>();
    return out.filter((o) => {
      const k = `${o.userId}:${o.channel}`;
      if (!active.has(o.userId) || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  /** Active students in scope. A department reaches the classes of programs it teaches subjects in. */
  private async scopeStudents(tx: Tx, a: AnnouncementAudience): Promise<string[]> {
    const active = eq(students.status, 'active');
    let rows: { id: string }[] = [];
    if (a.scope === 'all') rows = await tx.select({ id: students.id }).from(students).where(active);
    else if (a.scope === 'sections' && a.sectionIds?.length) rows = await tx.select({ id: students.id }).from(students).where(and(active, inArray(students.sectionId, a.sectionIds)));
    else if (a.scope === 'programs' && a.programIds?.length)
      rows = await tx.select({ id: students.id }).from(students).innerJoin(sections, eq(sections.id, students.sectionId)).where(and(active, inArray(sections.programId, a.programIds)));
    else if (a.scope === 'departments' && a.departmentIds?.length) {
      const programIds = await this.departmentPrograms(tx, a.departmentIds);
      if (programIds.length) rows = await tx.select({ id: students.id }).from(students).innerJoin(sections, eq(sections.id, students.sectionId)).where(and(active, inArray(sections.programId, programIds)));
    } else if (a.scope === 'people' && a.studentIds?.length) rows = await tx.select({ id: students.id }).from(students).where(inArray(students.id, a.studentIds));
    else if (a.scope === 'hostels' && a.hostelIds?.length)
      rows = await tx
        .select({ id: students.id })
        .from(hostelAllotments)
        .innerJoin(students, eq(students.id, hostelAllotments.studentId))
        .innerJoin(hostelBeds, eq(hostelBeds.id, hostelAllotments.bedId))
        .innerJoin(hostelRooms, eq(hostelRooms.id, hostelBeds.roomId))
        .innerJoin(hostelBlocks, eq(hostelBlocks.id, hostelRooms.blockId))
        .where(and(active, isNull(hostelAllotments.vacatedOn), inArray(hostelBlocks.hostelId, a.hostelIds)));
    else if (a.scope === 'routes' && a.routeIds?.length)
      rows = await tx
        .select({ id: students.id })
        .from(transportAssignments)
        .innerJoin(students, eq(students.id, transportAssignments.studentId))
        .where(and(active, inArray(transportAssignments.routeId, a.routeIds), sql`(${transportAssignments.endedOn} is null or ${transportAssignments.endedOn} >= (now() at time zone 'Asia/Kolkata')::date)`));
    return [...new Set(rows.map((r) => r.id))];
  }

  /** Staff in scope: everyone, a department's members and head, or the teachers and class teachers of the classes. */
  private async scopeStaff(tx: Tx, a: AnnouncementAudience): Promise<string[]> {
    const ids = new Set<string>();
    if (a.scope === 'all') {
      const rows = await tx.selectDistinct({ id: userRoles.userId }).from(userRoles).where(notInArray(userRoles.role, FAMILY_ROLES as never[]));
      rows.forEach((r) => ids.add(r.id));
    } else if (a.scope === 'departments' && a.departmentIds?.length) {
      (await tx.select({ id: departmentStaff.userId }).from(departmentStaff).where(inArray(departmentStaff.departmentId, a.departmentIds))).forEach((r) => ids.add(r.id));
      (await tx.select({ id: departments.headUserId }).from(departments).where(inArray(departments.id, a.departmentIds))).forEach((r) => r.id && ids.add(r.id));
    } else if ((a.scope === 'sections' && a.sectionIds?.length) || (a.scope === 'programs' && a.programIds?.length)) {
      const inScope = a.scope === 'sections' ? inArray(sections.id, a.sectionIds!) : inArray(sections.programId, a.programIds!);
      const taught = await tx
        .selectDistinct({ id: timetableSlots.teacherId })
        .from(timetableSlots)
        .innerJoin(sections, eq(sections.id, timetableSlots.sectionId))
        .where(and(inScope, isNull(timetableSlots.archivedAt)));
      taught.forEach((r) => ids.add(r.id));
      (await tx.select({ id: sections.classTeacherId }).from(sections).where(inScope)).forEach((r) => r.id && ids.add(r.id));
    } else if (a.scope === 'hostels' && a.hostelIds?.length) {
      // The wardens of those hostels.
      const rows = await tx.execute<{ id: string }>(sql`select warden_user_id as id from hostels where id in (${sql.join(a.hostelIds.map((h) => sql`${h}::uuid`), sql`, `)}) and warden_user_id is not null`);
      rows.rows.forEach((r) => ids.add(r.id));
    } else if (a.scope === 'routes' && a.routeIds?.length) {
      // Staff who ride those routes.
      const rows = await tx.select({ id: transportAssignments.staffUserId }).from(transportAssignments).where(and(inArray(transportAssignments.routeId, a.routeIds), isNotNull(transportAssignments.staffUserId), sql`(${transportAssignments.endedOn} is null or ${transportAssignments.endedOn} >= (now() at time zone 'Asia/Kolkata')::date)`));
      rows.forEach((r) => r.id && ids.add(r.id));
    }
    return [...ids];
  }

  private async departmentPrograms(tx: Tx, departmentIds: string[]): Promise<string[]> {
    const rows = await tx.selectDistinct({ id: subjects.programId }).from(subjects).where(inArray(subjects.departmentId, departmentIds));
    return rows.map((r) => r.id);
  }

  /** The broadcast audience for boards, or null when the audience has no classes (picked people). */
  private async boardAudience(tx: Tx, a: AnnouncementAudience): Promise<BroadcastAudience | null> {
    if (a.scope === 'all' || (a.scope === 'roles' && a.roles?.includes('student'))) return { all: true };
    if (a.scope === 'programs' && a.programIds?.length) return { programIds: a.programIds };
    if (a.scope === 'sections' && a.sectionIds?.length) return { sectionIds: a.sectionIds };
    if (a.scope === 'departments' && a.departmentIds?.length) {
      const programIds = await this.departmentPrograms(tx, a.departmentIds);
      return programIds.length ? { programIds } : null;
    }
    return null;
  }

  /** How many people each channel would reach now (the composer's "Reaches …"). */
  async preview(tx: Tx, a: AnnouncementAudience, channels: AnnouncementChannel[]) {
    const rows = await this.resolve(tx, a, channels);
    const count = (c: AppChannel) => rows.filter((r) => r.channel === c).length;
    let boards = 0;
    if (channels.includes('boards')) {
      const ba = await this.boardAudience(tx, a);
      boards = ba ? (await this.broadcasts.resolveDevices(tx, ba)).length : 0;
    }
    return { teacher: count('teacher'), student: count('student'), parent: count('parent'), boards, people: new Set(rows.map((r) => r.userId)).size };
  }

  // ---------------------------------------------------------------------------------------------
  // Writing

  async create(tx: Tx, p: UserPrincipal, input: AnnouncementInput, attachments: AnnouncementAttachment[], mode: 'draft' | 'send'): Promise<{ id: string; fanout: Fanout | null }> {
    const now = this.clock.now();
    this.check(input, now);
    await this.assertAudience(tx, p, input.audience, input.priority);
    await this.checkExternal(tx, input.external);
    const scheduled = mode === 'send' && input.sendAt && input.sendAt > now;
    const [a] = await tx
      .insert(announcements)
      .values({
        tenantId: p.tenantId,
        senderId: p.userId,
        title: input.title,
        body: input.body,
        priority: input.priority,
        channels: input.channels,
        audience: input.audience,
        attachments,
        requiresAck: input.requiresAck,
        status: mode === 'draft' ? 'draft' : scheduled ? 'scheduled' : 'draft',
        sendAt: input.sendAt,
        expiresAt: input.expiresAt,
        translations: input.translations,
        poll: input.poll,
        external: input.external,
        departmentId: await departmentOf(tx, p.userId),
      })
      .returning();
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: `announcement.${mode === 'draft' ? 'drafted' : scheduled ? 'scheduled' : 'created'}`, subjectType: 'announcement', subjectId: a.id, data: { channels: input.channels, audience: input.audience, priority: input.priority } });
    if (scheduled) await this.queue(tx, p.tenantId, a.id, input.sendAt!);
    const fanout = mode === 'send' && !scheduled ? await this.dispatch(tx, a.id) : null;
    return { id: a.id, fanout };
  }

  /** Changes a draft or a scheduled announcement (not once it has gone out). */
  async update(tx: Tx, p: UserPrincipal, id: string, input: AnnouncementInput, attachments: AnnouncementAttachment[], mode: 'draft' | 'send'): Promise<Fanout | null> {
    const a = await this.load(tx, id);
    if (a.status !== 'draft' && a.status !== 'scheduled') throw new ConflictException('Only drafts and scheduled messages can be edited. Recall it and send a new one.');
    const now = this.clock.now();
    this.check(input, now);
    await this.assertAudience(tx, p, input.audience, input.priority);
    await this.checkExternal(tx, input.external);
    const scheduled = mode === 'send' && input.sendAt && input.sendAt > now;
    await tx
      .update(announcements)
      .set({ ...input, attachments, status: scheduled ? 'scheduled' : 'draft', updatedAt: now })
      .where(eq(announcements.id, id));
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'announcement.edited', subjectType: 'announcement', subjectId: id, changes: { title: { before: a.title, after: input.title }, sendAt: { before: a.sendAt, after: input.sendAt } } });
    if (scheduled) await this.queue(tx, p.tenantId, id, input.sendAt!);
    return mode === 'send' && !scheduled ? this.dispatch(tx, id) : null;
  }

  private check(input: AnnouncementInput, now: Date) {
    if (input.expiresAt && input.expiresAt <= (input.sendAt && input.sendAt > now ? input.sendAt : now)) throw new BadRequestException('The expiry must be after the message goes out');
    if (input.poll?.closesAt && new Date(input.poll.closesAt) <= (input.sendAt && input.sendAt > now ? input.sendAt : now)) throw new BadRequestException('The poll must close after the message goes out');
    if (input.priority === 'emergency' && input.sendAt && input.sendAt > now) throw new BadRequestException('An emergency message goes out now; it cannot be scheduled');
  }

  /**
   * Who may send to this audience: an emergency is for the principal and administrators; a head of department
   * reaches their own departments, the programmes and classes they teach, picked people and their own saved lists.
   */
  async assertAudience(tx: Tx, p: UserPrincipal, a: AnnouncementAudience, priority: string): Promise<void> {
    if (priority === 'emergency' && !p.roles.some((r) => STAFF_ADMIN_ROLES.includes(r))) throw new ForbiddenException('Only the principal or an administrator sends emergency messages');
    if (!isHodOnly(p)) return;
    const scope = await hodScope(tx, p.userId);
    const refuse = () => {
      throw new ForbiddenException('A head of department sends to their own department, its programmes and classes, or picked people');
    };
    if (a.scope === 'all' || a.scope === 'roles' || a.scope === 'hostels' || a.scope === 'routes') refuse();
    if (a.scope === 'departments' && outside(a.departmentIds, scope.departmentIds).length) refuse();
    if (a.scope === 'programs' && outside(a.programIds, scope.programIds).length) refuse();
    if (a.scope === 'sections' && outside(a.sectionIds, scope.sectionIds).length) refuse();
    if (a.scope === 'lists' && a.listIds?.length) {
      const own = await tx.select({ id: audienceRules.id }).from(audienceRules).where(and(inArray(audienceRules.id, a.listIds), eq(audienceRules.createdBy, p.userId)));
      if (own.length !== a.listIds.length) refuse();
    }
  }

  /** The outside-channel template must exist and be usable (an SMS needs its DLT registration). */
  private async checkExternal(tx: Tx, e: AnnouncementExternal | null): Promise<void> {
    if (!e) return;
    const [t] = await tx.select().from(messageTemplates).where(eq(messageTemplates.id, e.templateId));
    if (!t || !t.active) throw new NotFoundException('Message template not found');
    if (t.channel === 'sms' && !t.dltTemplateId) throw new ConflictException('Register this text with your telecom operator (DLT) and enter its template id first');
  }

  /** The announcement, when the caller may see it: a head of department sees their own and their department's. */
  async loadFor(tx: Tx, p: UserPrincipal, id: string) {
    const a = await this.load(tx, id);
    if (isHodOnly(p) && a.senderId !== p.userId && !(a.departmentId && (await hodScope(tx, p.userId)).departmentIds.includes(a.departmentId))) throw new NotFoundException('Message not found');
    return a;
  }

  private async queue(tx: Tx, tenantId: string, id: string, at: Date) {
    await tx.insert(jobs).values({ tenantId, kind: ANNOUNCEMENT_SEND, payload: { id }, runAfter: at });
  }

  /**
   * Sends an announcement now: resolves recipients, inserts their rows, posts the board broadcast,
   * and pushes important ones. Returns what to emit after commit.
   */
  async dispatch(tx: Tx, id: string): Promise<Fanout> {
    const a = await this.load(tx, id);
    if (a.status === 'sent' || a.status === 'recalled') throw new ConflictException('This message has already gone out');
    const now = this.clock.now();
    const recipients = await this.resolve(tx, a.audience, a.channels);
    const boardAudience = a.channels.includes('boards') ? await this.boardAudience(tx, a.audience) : null;
    if (recipients.length === 0 && !boardAudience) throw new BadRequestException('Nobody matches this audience on the chosen channels');
    for (let i = 0; i < recipients.length; i += 1000) {
      await tx
        .insert(announcementRecipients)
        .values(recipients.slice(i, i + 1000).map((r) => ({ tenantId: a.tenantId, announcementId: id, userId: r.userId, channel: r.channel })))
        .onConflictDoNothing();
    }
    let board: Fanout['board'] = null;
    if (boardAudience) {
      const sender: UserPrincipal = { kind: 'user', tenantId: a.tenantId, userId: a.senderId, roles: [] };
      const until = a.expiresAt ?? new Date(now.getTime() + 24 * 3600_000);
      const ttlMinutes = Math.min(7 * 24 * 60, Math.max(1, Math.round((until.getTime() - now.getTime()) / 60_000)));
      const out = await this.broadcasts.create(tx, sender, {
        title: a.title.slice(0, 120),
        body: plainText(a.body).slice(0, 2000),
        priority: a.priority === 'emergency' ? 'emergency' : a.priority === 'important' ? 'important' : 'info',
        audience: boardAudience,
        requiresAck: false,
        ttlMinutes,
        notifyFamilies: false,
      });
      board = out;
      await tx.update(announcements).set({ broadcastId: out.message.id }).where(eq(announcements.id, id));
    }
    const userIds = [...new Set(recipients.map((r) => r.userId))];
    if ((a.priority === 'important' || a.priority === 'emergency') && userIds.length) {
      const hi = inLanguage(a, 'hi');
      const kn = inLanguage(a, 'kn');
      const text = (t: { title: string; body: string }) => ({ title: t.title, body: plainText(t.body).slice(0, 240) });
      await this.notifications.notifyUsers(
        tx,
        userIds,
        { kind: 'announcement', text: { en: text(a), hi: text(hi), kn: text(kn) }, data: { announcementId: id, ...(a.priority === 'emergency' ? { urgent: '1' } : {}) }, dedupeKey: `announcement:${id}` },
        { urgent: a.priority === 'emergency' },
      );
    }
    // Outside the apps: a campaign through the engine, to the same people, filled with the notice.
    let campaignId: string | null = null;
    if (a.external && userIds.length) {
      const [c] = await tx
        .insert(messageCampaigns)
        .values({
          tenantId: a.tenantId,
          title: a.title.slice(0, 160),
          templateId: a.external.templateId,
          audienceId: null,
          announcementId: id,
          vars: { title: a.title.slice(0, 120), body: plainText(a.body).slice(0, 300) },
          sendAt: now,
          fallback: a.external.fallback,
          emergency: a.priority === 'emergency',
          departmentId: a.departmentId,
          createdBy: a.senderId,
        })
        .returning({ id: messageCampaigns.id });
      campaignId = c.id;
      await tx.update(announcements).set({ external: { ...a.external, campaignId } }).where(eq(announcements.id, id));
    }
    await tx.update(announcements).set({ status: 'sent', sentAt: now, sendAt: a.sendAt ?? now, updatedAt: now }).where(eq(announcements.id, id));
    await this.events.emit(tx, a.tenantId, { type: a.priority === 'emergency' ? DomainEvents.EmergencyBroadcast : DomainEvents.AnnouncementSent, aggregateType: 'announcement', aggregateId: id, actorId: a.senderId, payload: { recipients: recipients.length, channels: a.channels, priority: a.priority, external: !!campaignId } });
    await audit(tx, { tenantId: a.tenantId, actorType: 'user', actorId: a.senderId, action: a.priority === 'emergency' ? 'announcement.emergency_sent' : 'announcement.sent', subjectType: 'announcement', subjectId: id, data: { recipients: recipients.length, boards: board?.deviceIds.length ?? 0, channels: a.channels, campaignId } });
    return { tenantId: a.tenantId, announcementId: id, priority: a.priority, userIds, board, campaignId };
  }

  /** Emits to boards and apps, and sends the outside-channel campaign. Call after the transaction commits. */
  async deliver(f: Fanout | null): Promise<void> {
    if (!f) return;
    if (f.board) this.broadcasts.deliver(f.board.message, f.board.deviceIds);
    this.realtime.toUsers(f.userIds, RealtimeEvents.AnnouncementNew, { announcementId: f.announcementId, priority: f.priority });
    if (f.campaignId) await this.comms.dispatch(f.tenantId, f.campaignId);
  }

  /** Job: sends a scheduled announcement once its time has come (a later edit queues its own job). */
  async sendScheduled(tenantId: string, id: string): Promise<boolean> {
    const fanout = await this.db.withTenant(tenantId, async (tx) => {
      const [a] = await tx.select().from(announcements).where(eq(announcements.id, id)).for('update');
      if (!a || a.status !== 'scheduled' || !a.sendAt || a.sendAt > this.clock.now()) return null;
      try {
        return await this.dispatch(tx, id);
      } catch (e) {
        // Nobody to send to any more: leave it as a draft for the sender to fix.
        if (e instanceof BadRequestException) {
          await tx.update(announcements).set({ status: 'draft' }).where(eq(announcements.id, id));
          await audit(tx, { tenantId, actorType: 'system', action: 'announcement.schedule_failed', subjectType: 'announcement', subjectId: id, data: { reason: e.message } });
          return null;
        }
        throw e;
      }
    });
    await this.deliver(fanout);
    return !!fanout;
  }

  /** Sends every scheduled announcement that is due (catch-up after downtime; also used by tests). */
  async sendDue(tenantId: string): Promise<number> {
    const due = await this.db.withTenant(tenantId, (tx) => tx.select({ id: announcements.id }).from(announcements).where(and(eq(announcements.status, 'scheduled'), lte(announcements.sendAt, this.clock.now()))));
    let n = 0;
    for (const d of due) if (await this.sendScheduled(tenantId, d.id)) n++;
    if (n) this.log.log(`Sent ${n} scheduled announcement(s) for ${tenantId}`);
    return n;
  }

  /** Takes a sent message back: hidden in the apps, withdrawn from notifications, cleared from boards. */
  async recall(tx: Tx, p: UserPrincipal, id: string): Promise<string[]> {
    const a = await this.load(tx, id);
    if (a.status !== 'sent') throw new ConflictException('Only a sent message can be recalled');
    const now = this.clock.now();
    await tx.update(announcements).set({ status: 'recalled', recalledAt: now, updatedAt: now }).where(eq(announcements.id, id));
    await tx.update(notifications).set({ retractedAt: now }).where(and(inArray(notifications.dedupeKey, [`announcement:${id}`, `announcement-remind:${id}`]), isNull(notifications.retractedAt)));
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'announcement.recalled', subjectType: 'announcement', subjectId: id });
    return a.broadcastId ? this.broadcasts.clear(tx, p, a.broadcastId) : [];
  }

  /** Deletes a draft, a scheduled message (it will not go out) or a recalled one. */
  async remove(tx: Tx, p: UserPrincipal, id: string): Promise<void> {
    const a = await this.load(tx, id);
    if (a.status === 'sent') throw new ConflictException('Recall the message before deleting it');
    await tx.delete(announcements).where(eq(announcements.id, id));
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'announcement.deleted', subjectType: 'announcement', subjectId: id, data: { title: a.title, status: a.status } });
  }

  /** A new draft with the same content, audience and attachments. */
  async duplicate(tx: Tx, p: UserPrincipal, id: string): Promise<string> {
    const a = await this.load(tx, id);
    const [copy] = await tx
      .insert(announcements)
      .values({
        tenantId: p.tenantId,
        senderId: p.userId,
        title: a.title,
        body: a.body,
        priority: a.priority,
        channels: a.channels,
        audience: a.audience,
        attachments: a.attachments,
        requiresAck: a.requiresAck,
        status: 'draft',
        translations: a.translations,
        poll: a.poll ? { ...a.poll, closesAt: null } : null,
        external: a.external ? { templateId: a.external.templateId, fallback: a.external.fallback } : null,
        departmentId: await departmentOf(tx, p.userId),
      })
      .returning();
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'announcement.duplicated', subjectType: 'announcement', subjectId: copy.id, data: { from: id } });
    return copy.id;
  }

  /** Pushes again to everyone who has not read it (or, when acknowledgement is required, not acknowledged). */
  async remind(tx: Tx, p: UserPrincipal, id: string): Promise<{ reminded: number }> {
    const a = await this.load(tx, id);
    if (a.status !== 'sent') throw new ConflictException('Only a sent message can be reminded about');
    const now = this.clock.now();
    if (a.expiresAt && a.expiresAt <= now) throw new ConflictException('This message has expired');
    if (a.lastRemindedAt && now.getTime() - a.lastRemindedAt.getTime() < REMIND_EVERY_MS) throw new ConflictException('A reminder went out a few minutes ago. Try again later.');
    const pending = await tx
      .selectDistinct({ userId: announcementRecipients.userId })
      .from(announcementRecipients)
      .where(and(eq(announcementRecipients.announcementId, id), a.requiresAck ? isNull(announcementRecipients.acknowledgedAt) : isNull(announcementRecipients.readAt)));
    const ids = pending.map((r) => r.userId);
    if (ids.length) {
      await this.notifications.notifyUsers(
        tx,
        ids,
        { kind: 'announcement', text: { title: `Reminder: ${a.title}`, body: plainText(a.body).slice(0, 240) }, data: { announcementId: id }, dedupeKey: `announcement-remind:${id}` },
        { replace: true },
      );
      await tx.update(announcementRecipients).set({ remindedAt: now }).where(and(eq(announcementRecipients.announcementId, id), inArray(announcementRecipients.userId, ids)));
    }
    await tx.update(announcements).set({ lastRemindedAt: now }).where(eq(announcements.id, id));
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'announcement.reminded', subjectType: 'announcement', subjectId: id, data: { reminded: ids.length } });
    return { reminded: ids.length };
  }

  // ---------------------------------------------------------------------------------------------
  // Reading (ERP)

  async load(tx: Tx, id: string) {
    const [a] = await tx.select().from(announcements).where(eq(announcements.id, id));
    if (!a) throw new NotFoundException('Message not found');
    return a;
  }

  /** Sent, scheduled, draft and recalled messages, newest first, with delivery statistics. A head of department sees their own and their department's. */
  async list(tx: Tx, p: UserPrincipal, status?: string) {
    const hod = isHodOnly(p) ? await hodScope(tx, p.userId) : null;
    const rows = await tx
      .select({ a: announcements, sender: users.fullName })
      .from(announcements)
      .innerJoin(users, eq(users.id, announcements.senderId))
      .where(
        and(
          status && ['draft', 'scheduled', 'sent', 'recalled'].includes(status) ? eq(announcements.status, status as 'draft') : undefined,
          hod ? or(eq(announcements.senderId, p.userId), hod.departmentIds.length ? inArray(announcements.departmentId, hod.departmentIds) : undefined) : undefined,
        ),
      )
      .orderBy(desc(sql`coalesce(${announcements.sentAt}, ${announcements.sendAt}, ${announcements.updatedAt})`))
      .limit(200);
    const stats = await this.statsFor(tx, rows.map((r) => r.a.id));
    const boards = await this.boardStats(tx, rows.map((r) => r.a.broadcastId).filter((x): x is string => !!x));
    const named = await this.names(tx, rows.map((r) => r.a.audience));
    return rows.map((r) => ({ ...this.view(r.a, r.sender, stats.get(r.a.id), r.a.broadcastId ? boards.get(r.a.broadcastId) : undefined), audiencePeople: this.picked(r.a.audience, named) }));
  }

  async detail(tx: Tx, id: string) {
    const [r] = await tx.select({ a: announcements, sender: users.fullName }).from(announcements).innerJoin(users, eq(users.id, announcements.senderId)).where(eq(announcements.id, id));
    if (!r) throw new NotFoundException('Message not found');
    const stats = await this.statsFor(tx, [id]);
    const boards = r.a.broadcastId ? await this.boardStats(tx, [r.a.broadcastId]) : new Map();
    const named = await this.names(tx, [r.a.audience]);
    // The poll's tally and the outside-channel campaign's outcome.
    let poll = null;
    if (r.a.poll) {
      const votes = (await tx.select({ option: announcementPollVotes.option }).from(announcementPollVotes).where(eq(announcementPollVotes.announcementId, id))).map((v) => v.option);
      const people = (await tx.selectDistinct({ id: announcementRecipients.userId }).from(announcementRecipients).where(eq(announcementRecipients.announcementId, id))).length;
      poll = { ...r.a.poll, results: pollResults(r.a.poll.options, votes), voted: votes.length, votedPct: pct(votes.length, people), closed: !!r.a.poll.closesAt && new Date(r.a.poll.closesAt) <= this.clock.now() };
    }
    let external = null;
    if (r.a.external) {
      const [t] = await tx.select({ key: messageTemplates.key, channel: messageTemplates.channel }).from(messageTemplates).where(eq(messageTemplates.id, r.a.external.templateId));
      const [c] = r.a.external.campaignId ? await tx.select().from(messageCampaigns).where(eq(messageCampaigns.id, r.a.external.campaignId)) : [];
      external = { templateId: r.a.external.templateId, templateKey: t?.key ?? null, channel: t?.channel ?? null, fallback: r.a.external.fallback, campaign: c ? { id: c.id, status: c.status, recipients: c.recipients, sent: c.sentCount, delivered: c.deliveredCount, failed: c.failedCount, suppressed: c.suppressedCount, costPaise: c.costPaise } : null };
    }
    return { ...this.view(r.a, r.sender, stats.get(id), r.a.broadcastId ? boards.get(r.a.broadcastId) : undefined), audiencePeople: this.picked(r.a.audience, named), translations: r.a.translations, poll, external };
  }

  /** Who received it, filtered: `unread`, `unacknowledged` or everyone, optionally one channel. */
  async recipients(tx: Tx, id: string, filter: string | undefined, channel: string | undefined, q: string | undefined) {
    await this.load(tx, id);
    const rows = await tx
      .select({
        userId: users.id,
        fullName: users.fullName,
        phone: users.phone,
        channel: announcementRecipients.channel,
        deliveredAt: announcementRecipients.deliveredAt,
        readAt: announcementRecipients.readAt,
        acknowledgedAt: announcementRecipients.acknowledgedAt,
        remindedAt: announcementRecipients.remindedAt,
        /** Parents: their children; students: their class. */
        detail: sql<string | null>`case ${announcementRecipients.channel}
          when 'parent' then (select string_agg(s.full_name || ' (' || sec.display_name || ')', ', ' order by s.full_name) from guardians g join students s on s.id = g.student_id join sections sec on sec.id = s.section_id where g.user_id = ${users.id})
          when 'student' then (select sec.display_name || ' · ' || s.roll_no from students s join sections sec on sec.id = s.section_id where s.user_id = ${users.id} limit 1)
          else null end`,
      })
      .from(announcementRecipients)
      .innerJoin(users, eq(users.id, announcementRecipients.userId))
      .where(
        and(
          eq(announcementRecipients.announcementId, id),
          filter === 'unread' ? isNull(announcementRecipients.readAt) : filter === 'unacknowledged' ? isNull(announcementRecipients.acknowledgedAt) : filter === 'undelivered' ? isNull(announcementRecipients.deliveredAt) : undefined,
          channel && APP_CHANNELS.includes(channel as AppChannel) ? eq(announcementRecipients.channel, channel as AppChannel) : undefined,
          q?.trim() ? ilike(users.fullName, `%${q.trim().replace(/[%_\\]/g, '')}%`) : undefined,
        ),
      )
      .orderBy(asc(announcementRecipients.channel), asc(users.fullName))
      .limit(2000);
    return rows;
  }

  private async statsFor(tx: Tx, ids: string[]) {
    const out = new Map<string, Record<AppChannel, { recipients: number; delivered: number; read: number; acknowledged: number }>>();
    if (ids.length === 0) return out;
    const rows = await tx
      .select({
        id: announcementRecipients.announcementId,
        channel: announcementRecipients.channel,
        recipients: sql<number>`count(*)::int`,
        delivered: sql<number>`count(${announcementRecipients.deliveredAt})::int`,
        read: sql<number>`count(${announcementRecipients.readAt})::int`,
        acknowledged: sql<number>`count(${announcementRecipients.acknowledgedAt})::int`,
      })
      .from(announcementRecipients)
      .where(inArray(announcementRecipients.announcementId, ids))
      .groupBy(announcementRecipients.announcementId, announcementRecipients.channel);
    for (const r of rows) {
      const e = out.get(r.id) ?? { teacher: zero(), student: zero(), parent: zero() };
      e[r.channel] = { recipients: r.recipients, delivered: r.delivered, read: r.read, acknowledged: r.acknowledged };
      out.set(r.id, e);
    }
    return out;
  }

  private async boardStats(tx: Tx, broadcastIds: string[]) {
    const out = new Map<string, { boards: number; displayed: number; active: boolean }>();
    if (broadcastIds.length === 0) return out;
    const rows = await tx.execute<{ id: string; boards: number; displayed: number; active: boolean }>(sql`
      select b.id, count(r.id)::int as boards, count(r.displayed_at)::int as displayed, (b.cleared_at is null and b.expires_at > ${this.clock.now()}) as active
      from broadcasts b left join broadcast_receipts r on r.broadcast_id = b.id
      where b.id in (${sql.join(broadcastIds.map((i) => sql`${i}::uuid`), sql`, `)}) group by b.id`);
    for (const r of rows.rows) out.set(r.id, { boards: r.boards, displayed: r.displayed, active: r.active });
    return out;
  }

  /** Names of the people and student records picked in these audiences. */
  private async names(tx: Tx, audiences: AnnouncementAudience[]) {
    const userIds = [...new Set(audiences.flatMap((a) => (a.scope === 'people' ? (a.userIds ?? []) : [])))];
    const studentIds = [...new Set(audiences.flatMap((a) => (a.scope === 'people' ? (a.studentIds ?? []) : [])))];
    const people = new Map<string, { fullName: string; kind: 'staff' | 'parent' | 'student' | 'record' }>();
    if (userIds.length) {
      const rows = await tx
        .select({ id: users.id, fullName: users.fullName, roles: sql<string[]>`array_agg(distinct ${userRoles.role}::text)` })
        .from(users)
        .innerJoin(userRoles, eq(userRoles.userId, users.id))
        .where(inArray(users.id, userIds))
        .groupBy(users.id);
      for (const u of rows) people.set(u.id, { fullName: u.fullName, kind: u.roles.some((r) => !FAMILY_ROLES.includes(r)) ? 'staff' : u.roles.includes('guardian') ? 'parent' : 'student' });
    }
    if (studentIds.length) for (const st of await tx.select({ id: students.id, fullName: students.fullName }).from(students).where(inArray(students.id, studentIds))) people.set(st.id, { fullName: st.fullName, kind: 'record' });
    return people;
  }

  private picked(a: AnnouncementAudience, named: Map<string, { fullName: string; kind: 'staff' | 'parent' | 'student' | 'record' }>) {
    if (a.scope !== 'people') return [];
    return [...(a.userIds ?? []), ...(a.studentIds ?? [])].flatMap((id) => {
      const n = named.get(id);
      return n ? [{ id, ...n }] : [];
    });
  }

  private view(a: typeof announcements.$inferSelect, sender: string, byChannel?: Record<AppChannel, { recipients: number; delivered: number; read: number; acknowledged: number }>, boards?: { boards: number; displayed: number; active: boolean }) {
    const ch = byChannel ?? { teacher: zero(), student: zero(), parent: zero() };
    const sum = (k: 'recipients' | 'delivered' | 'read' | 'acknowledged') => APP_CHANNELS.reduce((n, c) => n + ch[c][k], 0);
    const recipients = sum('recipients');
    return {
      id: a.id,
      title: a.title,
      body: a.body,
      priority: a.priority,
      channels: a.channels,
      audience: a.audience,
      requiresAck: a.requiresAck,
      status: a.status,
      sendAt: a.sendAt,
      sentAt: a.sentAt,
      expiresAt: a.expiresAt,
      recalledAt: a.recalledAt,
      lastRemindedAt: a.lastRemindedAt,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      sender: { id: a.senderId, fullName: sender },
      attachments: a.attachments.map(({ key: _key, ...rest }) => rest),
      translated: Object.keys(a.translations ?? {}),
      hasPoll: !!a.poll,
      external: a.external ? { channel: null, campaignId: a.external.campaignId ?? null } : null,
      departmentId: a.departmentId,
      stats: {
        recipients,
        delivered: sum('delivered'),
        read: sum('read'),
        acknowledged: sum('acknowledged'),
        deliveredPct: pct(sum('delivered'), recipients),
        readPct: pct(sum('read'), recipients),
        acknowledgedPct: pct(sum('acknowledged'), recipients),
        byChannel: ch,
        boards: boards ?? null,
      },
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Inbox (Teacher, Student and Parent apps)

  /** The caller's announcements on one app: pinned important ones first, then newest. Fetching marks them delivered. */
  async inbox(tx: Tx, userId: string, app: AppChannel | undefined) {
    const now = this.clock.now();
    const mine = and(eq(announcementRecipients.userId, userId), app ? eq(announcementRecipients.channel, app) : undefined);
    await tx.update(announcementRecipients).set({ deliveredAt: now }).where(and(mine, isNull(announcementRecipients.deliveredAt)));
    const rows = await tx
      .select({
        a: announcements,
        sender: users.fullName,
        readAt: sql<Date | null>`max(${announcementRecipients.readAt})`,
        acknowledgedAt: sql<Date | null>`max(${announcementRecipients.acknowledgedAt})`,
      })
      .from(announcementRecipients)
      .innerJoin(announcements, eq(announcements.id, announcementRecipients.announcementId))
      .innerJoin(users, eq(users.id, announcements.senderId))
      .where(and(mine, eq(announcements.status, 'sent')))
      .groupBy(announcements.id, users.fullName)
      .orderBy(desc(announcements.sentAt))
      .limit(200);
    const ctx = await this.readerContext(tx, userId, rows.filter((r) => r.a.poll).map((r) => r.a.id));
    const items = rows.map((r) => this.inboxItem(r.a, r.sender, toDate(r.readAt), toDate(r.acknowledgedAt), now, ctx));
    items.sort((x, y) => Number(y.pinned) - Number(x.pinned));
    return { unread: items.filter((i) => !i.readAt).length, pinned: items.filter((i) => i.pinned).length, items };
  }

  async inboxOne(tx: Tx, userId: string, id: string) {
    const rows = await tx
      .select({ a: announcements, sender: users.fullName, readAt: announcementRecipients.readAt, acknowledgedAt: announcementRecipients.acknowledgedAt })
      .from(announcementRecipients)
      .innerJoin(announcements, eq(announcements.id, announcementRecipients.announcementId))
      .innerJoin(users, eq(users.id, announcements.senderId))
      .where(and(eq(announcementRecipients.userId, userId), eq(announcements.id, id), eq(announcements.status, 'sent')));
    if (rows.length === 0) throw new NotFoundException('Message not found');
    const r = rows[0];
    const ctx = await this.readerContext(tx, userId, r.a.poll ? [id] : []);
    return this.inboxItem(r.a, r.sender, r.readAt, r.acknowledgedAt, this.clock.now(), ctx);
  }

  /** The reader's language, their poll answers and, for polls that show results, the tallies. */
  private async readerContext(tx: Tx, userId: string, pollIds: string[]) {
    const [u] = await tx.select({ lang: users.preferredLanguage }).from(users).where(eq(users.id, userId));
    const mine = new Map<string, number>();
    const tallies = new Map<string, number[]>();
    if (pollIds.length) {
      const votes = await tx.select({ announcementId: announcementPollVotes.announcementId, userId: announcementPollVotes.userId, option: announcementPollVotes.option }).from(announcementPollVotes).where(inArray(announcementPollVotes.announcementId, pollIds));
      for (const v of votes) {
        if (v.userId === userId) mine.set(v.announcementId, v.option);
        tallies.set(v.announcementId, [...(tallies.get(v.announcementId) ?? []), v.option]);
      }
    }
    return { lang: u?.lang ?? 'en', mine, tallies };
  }

  private inboxItem(a: typeof announcements.$inferSelect, sender: string, readAt: Date | null, acknowledgedAt: Date | null, now: Date, ctx: { lang: string; mine: Map<string, number>; tallies: Map<string, number[]> }) {
    const live = !a.expiresAt || a.expiresAt > now;
    const text = inLanguage(a, ctx.lang);
    const myVote = ctx.mine.get(a.id) ?? null;
    const closed = !!a.poll?.closesAt && new Date(a.poll.closesAt) <= now;
    return {
      id: a.id,
      title: text.title,
      body: text.body,
      language: text.language,
      poll: a.poll
        ? { question: a.poll.question, options: a.poll.options, closesAt: a.poll.closesAt, closed, myVote, results: a.poll.showResults && (myVote !== null || closed) ? pollResults(a.poll.options, ctx.tallies.get(a.id) ?? []) : null }
        : null,
      emergency: a.priority === 'emergency',
      priority: a.priority,
      requiresAck: a.requiresAck,
      canAcknowledge: a.requiresAck || a.priority === 'important',
      sentAt: a.sentAt,
      expiresAt: a.expiresAt,
      sender: { fullName: sender },
      attachments: a.attachments.map(({ key: _key, ...rest }) => rest),
      readAt,
      acknowledgedAt,
      pinned: (a.priority === 'important' || a.priority === 'emergency') && live && !acknowledgedAt,
    };
  }

  /** A recipient answers the poll, or changes the answer while it is open. Answering also marks the notice read. */
  async vote(tx: Tx, p: UserPrincipal, id: string, option: number) {
    const [r] = await tx
      .select({ a: announcements })
      .from(announcementRecipients)
      .innerJoin(announcements, eq(announcements.id, announcementRecipients.announcementId))
      .where(and(eq(announcementRecipients.userId, p.userId), eq(announcements.id, id), eq(announcements.status, 'sent')))
      .limit(1);
    if (!r) throw new NotFoundException('Message not found');
    const poll = r.a.poll;
    if (!poll) throw new BadRequestException('This message has no poll');
    if (poll.closesAt && new Date(poll.closesAt) <= this.clock.now()) throw new ConflictException('The poll has closed');
    if (option >= poll.options.length) throw new BadRequestException('Choose one of the options');
    const now = this.clock.now();
    await tx
      .insert(announcementPollVotes)
      .values({ tenantId: p.tenantId, announcementId: id, userId: p.userId, option })
      .onConflictDoUpdate({ target: [announcementPollVotes.announcementId, announcementPollVotes.userId], set: { option, updatedAt: now } });
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'announcement.poll_answered', subjectType: 'announcement', subjectId: id, data: { option } });
    return this.mark(tx, p, id, false);
  }

  /** Marks read (and with `ack`, acknowledged) on every app the person got it on; the push notification counts as read too. */
  async mark(tx: Tx, p: UserPrincipal, id: string, ack: boolean) {
    const [r] = await tx
      .select({ id: announcementRecipients.id })
      .from(announcementRecipients)
      .innerJoin(announcements, eq(announcements.id, announcementRecipients.announcementId))
      .where(and(eq(announcementRecipients.userId, p.userId), eq(announcements.id, id), eq(announcements.status, 'sent')))
      .limit(1);
    if (!r) throw new NotFoundException('Message not found');
    const now = this.clock.now();
    const mine = and(eq(announcementRecipients.announcementId, id), eq(announcementRecipients.userId, p.userId));
    await tx.update(announcementRecipients).set({ readAt: now, deliveredAt: now }).where(and(mine, isNull(announcementRecipients.readAt)));
    await tx.update(notifications).set({ readAt: now }).where(and(eq(notifications.userId, p.userId), inArray(notifications.dedupeKey, [`announcement:${id}`, `announcement-remind:${id}`]), isNull(notifications.readAt)));
    if (ack) {
      const done = await tx.update(announcementRecipients).set({ acknowledgedAt: now }).where(and(mine, isNull(announcementRecipients.acknowledgedAt))).returning({ id: announcementRecipients.id });
      if (done.length) await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'announcement.acknowledged', subjectType: 'announcement', subjectId: id });
    }
    return this.inboxOne(tx, p.userId, id);
  }

  /** The stored file of an attachment, for the sender's roles or a recipient. */
  async attachmentFor(tx: Tx, p: UserPrincipal, id: string, attachmentId: string, staff: boolean): Promise<AnnouncementAttachment> {
    const a = await this.load(tx, id);
    if (!staff) {
      const [r] = await tx.select({ id: announcementRecipients.id }).from(announcementRecipients).where(and(eq(announcementRecipients.announcementId, id), eq(announcementRecipients.userId, p.userId))).limit(1);
      if (!r || a.status !== 'sent') throw new NotFoundException('Message not found');
    }
    const f = a.attachments.find((x) => x.id === attachmentId);
    if (!f) throw new NotFoundException('Attachment not found');
    return f;
  }

  /** Staff, parents, students and student records matching a name, phone or roll number, for picking individuals. */
  async people(tx: Tx, q: string) {
    const term = q.trim().replace(/[%_\\]/g, '');
    if (term.length < 2) return { users: [], students: [] };
    const like = `%${term}%`;
    const found = await tx
      .select({ id: users.id, fullName: users.fullName, phone: users.phone, roles: sql<string[]>`array_agg(distinct ${userRoles.role}::text)` })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .where(and(eq(users.status, 'active'), or(ilike(users.fullName, like), ilike(users.phone, like), ilike(users.email, like))))
      .groupBy(users.id)
      .orderBy(asc(users.fullName))
      .limit(30);
    const kids = await tx
      .select({ id: students.id, fullName: students.fullName, rollNo: students.rollNo, className: sections.displayName })
      .from(students)
      .innerJoin(sections, eq(sections.id, students.sectionId))
      .where(and(eq(students.status, 'active'), or(ilike(students.fullName, like), ilike(students.rollNo, like))))
      .orderBy(asc(students.fullName))
      .limit(30);
    return {
      users: found.map((u) => ({ ...u, kind: u.roles.some((r) => !FAMILY_ROLES.includes(r)) ? 'staff' : u.roles.includes('guardian') ? 'parent' : 'student' })),
      students: kids,
    };
  }
}

const zero = () => ({ recipients: 0, delivered: 0, read: 0, acknowledged: 0 });
/** Aggregates over timestamps come back from the driver as strings. */
const toDate = (v: Date | string | null): Date | null => (v === null ? null : v instanceof Date ? v : new Date(v));
