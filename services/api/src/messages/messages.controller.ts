import { Body, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { conversations, guardians, messages, sections, students, subjects, tenants, timetableSlots, users } from '../db/schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { isSchoolAdmin } from '../teacher/teacher.service.js';

const StartBody = z.object({ studentId: z.uuid(), withUserId: z.uuid() });
const SendBody = z.object({ body: z.string().trim().min(1).max(2000) });

const staffUser = alias(users, 'staff_user');
const familyUser = alias(users, 'family_user');

/**
 * Messages between families and the staff who teach their child. Every thread is about one
 * student. In schools (students under 18) only guardians write to staff; in colleges students
 * may write for themselves. School leaders can read any thread; every such read is audited.
 */
@Controller('v1/conversations')
export class ConversationsController {
  constructor(
    private readonly db: DbService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Who the caller can write to. `asFamily`: their children's teachers. `asStaff`: the families
   * of students in the classes they teach (narrow with `?sectionId=`).
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
          const byId = new Map<string, { id: string; fullName: string; subjects: string[] }>();
          for (const s of staff) {
            const e = byId.get(s.id) ?? { id: s.id, fullName: s.fullName, subjects: [] };
            if (!e.subjects.includes(s.subject)) e.subjects.push(s.subject);
            byId.set(s.id, e);
          }
          return { student: { id: k.id, fullName: k.fullName, className: k.className }, staff: [...byId.values()] };
        }),
      );
      // Staff: the families of students in the classes they teach (or of one class: ?sectionId=).
      const taught = await tx
        .selectDistinct({ sectionId: timetableSlots.sectionId })
        .from(timetableSlots)
        .where(and(eq(timetableSlots.teacherId, p.userId), isNull(timetableSlots.archivedAt)));
      const sectionIds = taught.map((t) => t.sectionId).filter((id) => !sectionId || id === sectionId);
      const asStaff = sectionIds.length
        ? await this.familiesOf(tx, sectionIds)
        : [];
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
      .orderBy(asc(sections.displayName), asc(students.rollNo));
    const byStudent = new Map<string, { student: { id: string; fullName: string; rollNo: string; className: string }; guardians: { id: string; fullName: string; relation: string }[] }>();
    for (const r of rows) {
      const e = byStudent.get(r.studentId) ?? { student: { id: r.studentId, fullName: r.fullName, rollNo: r.rollNo, className: r.className }, guardians: [] };
      if (r.guardianId && r.guardianName) e.guardians.push({ id: r.guardianId, fullName: r.guardianName, relation: r.relation ?? 'parent' });
      byStudent.set(r.studentId, e);
    }
    return [...byStudent.values()];
  }

  /** Opens (or returns) the thread between the caller and another person about a student. */
  @Post()
  @Auth('user')
  start(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(StartBody)) body: z.infer<typeof StartBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [student] = await tx.select({ id: students.id, sectionId: students.sectionId }).from(students).where(eq(students.id, body.studentId));
      if (!student) throw new NotFoundException('Student not found');
      let staffId: string;
      let familyId: string;
      if (await this.isFamilyOf(tx, p, student.id)) {
        if (!(await this.teaches(tx, body.withUserId, student.sectionId))) throw new ForbiddenException('You can write to the teachers of this class');
        familyId = p.userId;
        staffId = body.withUserId;
      } else if (isSchoolAdmin(p) || (await this.teaches(tx, p.userId, student.sectionId))) {
        const [g] = await tx.select({ id: guardians.id }).from(guardians).where(and(eq(guardians.studentId, student.id), eq(guardians.userId, body.withUserId)));
        const [self] = await tx.select({ id: students.id }).from(students).where(and(eq(students.id, student.id), eq(students.userId, body.withUserId)));
        if (!g && !(self && (await this.adultsMayWrite(tx)))) throw new ForbiddenException("You can write to this student's family");
        staffId = p.userId;
        familyId = body.withUserId;
      } else {
        throw new NotFoundException('Student not found');
      }
      const [existing] = await tx
        .select({ id: conversations.id })
        .from(conversations)
        .where(and(eq(conversations.studentId, student.id), eq(conversations.staffId, staffId), eq(conversations.familyId, familyId)));
      const id = existing?.id ?? (await tx.insert(conversations).values({ tenantId: p.tenantId, studentId: student.id, staffId, familyId }).returning())[0].id;
      return this.summary(tx, p, id);
    });
  }

  /** The caller's threads, latest first, with unread counts. */
  @Get()
  @Auth('user')
  list(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await this.summaries(tx, p)
        .where(or(eq(conversations.staffId, p.userId), eq(conversations.familyId, p.userId)))
        .orderBy(sql`${conversations.lastMessageAt} desc nulls last`)
        .limit(100);
      return rows;
    });
  }

  @Get(':id/messages')
  @Auth('user')
  read(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Query('before') before?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const c = await this.load(tx, id);
      const participant = c.staffId === p.userId || c.familyId === p.userId;
      if (!participant) {
        if (!isSchoolAdmin(p)) throw new NotFoundException('Conversation not found');
        await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'conversation.read_by_leader', subjectType: 'conversation', subjectId: id });
      }
      const page = await tx
        .select({ id: messages.id, senderId: messages.senderId, body: messages.body, createdAt: messages.createdAt })
        .from(messages)
        .where(and(eq(messages.conversationId, id), before ? lt(messages.createdAt, new Date(before)) : undefined))
        .orderBy(desc(messages.createdAt))
        .limit(50);
      return { conversation: await this.summary(tx, p, id), messages: page.reverse() };
    });
  }

  @Post(':id/messages')
  @Auth('user')
  send(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(SendBody)) body: z.infer<typeof SendBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const c = await this.load(tx, id);
      const fromStaff = c.staffId === p.userId;
      if (!fromStaff && c.familyId !== p.userId) throw new NotFoundException('Conversation not found');
      const now = new Date();
      const [m] = await tx.insert(messages).values({ tenantId: p.tenantId, conversationId: id, senderId: p.userId, body: body.body, createdAt: now }).returning();
      await tx
        .update(conversations)
        .set({ lastMessageAt: now, ...(fromStaff ? { staffReadAt: now } : { familyReadAt: now }) })
        .where(eq(conversations.id, id));
      const [sender] = await tx.select({ fullName: users.fullName }).from(users).where(eq(users.id, p.userId));
      await this.notifications.messageSent(tx, {
        id: m.id,
        conversationId: id,
        recipientId: fromStaff ? c.familyId : c.staffId,
        senderName: sender?.fullName ?? 'KINETIX',
        body: body.body,
        studentId: c.studentId,
      });
      return { id: m.id, senderId: m.senderId, body: m.body, createdAt: m.createdAt };
    });
  }

  @Post(':id/read')
  @HttpCode(204)
  @Auth('user')
  async markRead(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    await this.db.withTenant(p.tenantId, async (tx) => {
      const c = await this.load(tx, id);
      if (c.staffId === p.userId) await tx.update(conversations).set({ staffReadAt: new Date() }).where(eq(conversations.id, id));
      else if (c.familyId === p.userId) await tx.update(conversations).set({ familyReadAt: new Date() }).where(eq(conversations.id, id));
      else throw new NotFoundException('Conversation not found');
    });
  }

  // --------------------------------------------------------------------------------------------

  private summaries(tx: Tx, p: UserPrincipal) {
    const myRead = sql`case when ${conversations.staffId} = ${p.userId}::uuid then ${conversations.staffReadAt} else ${conversations.familyReadAt} end`;
    return tx
      .select({
        id: conversations.id,
        student: { id: students.id, fullName: students.fullName },
        className: sections.displayName,
        staff: { id: staffUser.id, fullName: staffUser.fullName },
        family: { id: familyUser.id, fullName: familyUser.fullName },
        lastMessageAt: conversations.lastMessageAt,
        lastMessage: sql<string | null>`(select m.body from messages m where m.conversation_id = "conversations"."id" order by m.created_at desc limit 1)`,
        unread: sql<number>`(select count(*)::int from messages m where m.conversation_id = "conversations"."id" and m.sender_id <> ${p.userId}::uuid and (${myRead} is null or m.created_at > ${myRead}))`,
      })
      .from(conversations)
      .innerJoin(students, eq(students.id, conversations.studentId))
      .innerJoin(sections, eq(sections.id, students.sectionId))
      .innerJoin(staffUser, eq(staffUser.id, conversations.staffId))
      .innerJoin(familyUser, eq(familyUser.id, conversations.familyId))
      .$dynamic();
  }

  private async summary(tx: Tx, p: UserPrincipal, id: string) {
    const [s] = await this.summaries(tx, p).where(eq(conversations.id, id));
    return s;
  }

  private async load(tx: Tx, id: string) {
    const [c] = await tx.select().from(conversations).where(eq(conversations.id, id));
    if (!c) throw new NotFoundException('Conversation not found');
    return c;
  }

  /** The caller's children (as guardian), plus themselves when an adult student may write. */
  private async familyStudents(tx: Tx, p: UserPrincipal) {
    const cols = { id: students.id, fullName: students.fullName, sectionId: students.sectionId, className: sections.displayName };
    const kids = await tx
      .select(cols)
      .from(guardians)
      .innerJoin(students, eq(students.id, guardians.studentId))
      .innerJoin(sections, eq(sections.id, students.sectionId))
      .where(eq(guardians.userId, p.userId));
    if (await this.adultsMayWrite(tx)) {
      kids.push(...(await tx.select(cols).from(students).innerJoin(sections, eq(sections.id, students.sectionId)).where(eq(students.userId, p.userId))));
    }
    return kids;
  }

  private async isFamilyOf(tx: Tx, p: UserPrincipal, studentId: string): Promise<boolean> {
    return (await this.familyStudents(tx, p)).some((k) => k.id === studentId);
  }

  private async teaches(tx: Tx, userId: string, sectionId: string): Promise<boolean> {
    const [slot] = await tx
      .select({ id: timetableSlots.id })
      .from(timetableSlots)
      .where(and(eq(timetableSlots.teacherId, userId), eq(timetableSlots.sectionId, sectionId), isNull(timetableSlots.archivedAt)))
      .limit(1);
    return !!slot;
  }

  /** Students write for themselves only at colleges and universities. */
  private async adultsMayWrite(tx: Tx): Promise<boolean> {
    const [t] = await tx.select({ kind: tenants.kind }).from(tenants);
    return t?.kind !== 'school';
  }
}

