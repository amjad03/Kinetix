import { BadRequestException, Body, Controller, ForbiddenException, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { and, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { chatMembers, chatThreads } from '../db/schema-chat.js';
import { clubMembers, clubs, sections, students, timetableSlots } from '../db/schema.js';

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');
const LinkedBody = z.object({ kind: z.enum(['section', 'club']), id: z.uuid(), title: z.string().trim().max(120).optional(), postPolicy: z.enum(['all', 'admins']).default('all'), quietStart: HHMM.nullable().default(null), quietEnd: HHMM.nullable().default(null) });
const SettingsBody = z.object({ title: z.string().trim().min(1).max(120).optional(), description: z.string().trim().max(500).optional(), postPolicy: z.enum(['all', 'admins']).optional(), quietStart: HHMM.nullable().optional(), quietEnd: HHMM.nullable().optional() });
const RoleBody = z.object({ role: z.enum(['admin', 'member']) });

/**
 * Group chats for a class or a club: the class's teachers (admins) and its students, or the club's coordinator
 * (admin) and members. The roster follows the class or club when synced; admins choose who may post and set quiet
 * hours, when members wait to post.
 */
@Controller('v1/chat')
export class ChatGroupsController {
  constructor(private readonly db: DbService) {}

  /** Opens (or returns) the group for a class or club. Staff only. */
  @Post('groups/linked')
  @Auth('user', ['tenant_admin', 'principal', 'hod', 'teacher'])
  linked(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(LinkedBody)) b: z.infer<typeof LinkedBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (!!b.quietStart !== !!b.quietEnd) throw new BadRequestException('Give both ends of the quiet hours');
      const name = await this.nameOf(tx, b.kind, b.id);
      const [existing] = await tx.select().from(chatThreads).where(and(eq(chatThreads.linkedKind, b.kind), eq(chatThreads.linkedId, b.id)));
      if (existing) {
        await tx.insert(chatMembers).values({ tenantId: p.tenantId, threadId: existing.id, userId: p.userId, role: 'admin' }).onConflictDoNothing();
        await this.sync(tx, p, existing.id);
        return { id: existing.id, created: false };
      }
      const [t] = await tx.insert(chatThreads).values({ tenantId: p.tenantId, kind: 'group', title: b.title || name, description: b.kind === 'section' ? 'Class group' : 'Club group', linkedKind: b.kind, linkedId: b.id, postPolicy: b.postPolicy, quietStart: b.quietStart, quietEnd: b.quietEnd, createdBy: p.userId }).returning();
      await tx.insert(chatMembers).values({ tenantId: p.tenantId, threadId: t.id, userId: p.userId, role: 'owner' });
      const n = await this.sync(tx, p, t.id);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'chat.thread_started', subjectType: 'chat_thread', subjectId: t.id, data: { kind: 'group', linkedKind: b.kind, linkedId: b.id, members: n.members } });
      return { id: t.id, created: true };
    });
  }

  /** Brings the members in line with the class or club: newcomers join, students who left are removed. */
  @Post('threads/:id/sync')
  @HttpCode(200)
  @Auth('user')
  resync(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.adminOf(tx, p, id);
      return this.sync(tx, p, id);
    });
  }

  @Patch('threads/:id/settings')
  @Auth('user')
  settings(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(SettingsBody)) b: z.infer<typeof SettingsBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const t = await this.adminOf(tx, p, id);
      if (t.kind !== 'group') throw new BadRequestException('Only a group has these settings');
      const start = b.quietStart === undefined ? t.quietStart : b.quietStart;
      const end = b.quietEnd === undefined ? t.quietEnd : b.quietEnd;
      if (!!start !== !!end) throw new BadRequestException('Give both ends of the quiet hours');
      const [row] = await tx.update(chatThreads).set(b).where(eq(chatThreads.id, id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'chat.settings_changed', subjectType: 'chat_thread', subjectId: id, before: { postPolicy: t.postPolicy, quietStart: t.quietStart, quietEnd: t.quietEnd, title: t.title }, after: { postPolicy: row.postPolicy, quietStart: row.quietStart, quietEnd: row.quietEnd, title: row.title } });
      return row;
    });
  }

  /** The owner makes a member an admin, or back. */
  @Post('threads/:id/members/:userId/role')
  @HttpCode(200)
  @Auth('user')
  role(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) userId: string, @Body(new ZodBody(RoleBody)) b: z.infer<typeof RoleBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [me] = await tx.select({ role: chatMembers.role }).from(chatMembers).where(and(eq(chatMembers.threadId, id), eq(chatMembers.userId, p.userId)));
      if (!me) throw new NotFoundException('Conversation not found');
      if (me.role !== 'owner') throw new ForbiddenException('Only the group’s owner can change admins');
      const [m] = await tx.update(chatMembers).set({ role: b.role }).where(and(eq(chatMembers.threadId, id), eq(chatMembers.userId, userId), sql`${chatMembers.role} <> 'owner'`)).returning();
      if (!m) throw new NotFoundException('Member not found');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'chat.member_role_changed', subjectType: 'chat_thread', subjectId: id, data: { userId, role: b.role } });
      return { userId, role: b.role };
    });
  }

  private async adminOf(tx: Tx, p: UserPrincipal, id: string) {
    const [row] = await tx.select({ t: chatThreads, role: chatMembers.role }).from(chatThreads).innerJoin(chatMembers, and(eq(chatMembers.threadId, chatThreads.id), eq(chatMembers.userId, p.userId))).where(eq(chatThreads.id, id));
    if (!row) throw new NotFoundException('Conversation not found');
    if (row.role !== 'owner' && row.role !== 'admin') throw new ForbiddenException('Only the group’s admins can do this');
    return row.t;
  }

  private async nameOf(tx: Tx, kind: 'section' | 'club', id: string): Promise<string> {
    if (kind === 'section') {
      const [s] = await tx.select({ name: sections.displayName }).from(sections).where(eq(sections.id, id));
      if (!s) throw new NotFoundException('Class not found');
      return s.name;
    }
    const [c] = await tx.select({ name: clubs.name }).from(clubs).where(eq(clubs.id, id));
    if (!c) throw new NotFoundException('Club not found');
    return c.name;
  }

  /** Who should be in the group now: staff as admins, students (with a login) as members. */
  private async sync(tx: Tx, p: UserPrincipal, id: string): Promise<{ members: number; added: number; removed: number }> {
    const [t] = await tx.select().from(chatThreads).where(eq(chatThreads.id, id));
    if (!t?.linkedKind || !t.linkedId) throw new BadRequestException('This group is not tied to a class or club');
    let staff: string[] = [];
    let pupils: string[] = [];
    if (t.linkedKind === 'section') {
      const [s] = await tx.select({ ct: sections.classTeacherId }).from(sections).where(eq(sections.id, t.linkedId));
      const teachers = await tx.selectDistinct({ id: timetableSlots.teacherId }).from(timetableSlots).where(and(eq(timetableSlots.sectionId, t.linkedId), isNull(timetableSlots.archivedAt)));
      staff = [...new Set([...(s?.ct ? [s.ct] : []), ...teachers.map((x) => x.id)])];
      pupils = (await tx.select({ u: students.userId }).from(students).where(and(eq(students.sectionId, t.linkedId), eq(students.status, 'active')))).map((r) => r.u).filter((u): u is string => !!u);
    } else {
      const [c] = await tx.select({ coord: clubs.facultyCoordinatorId }).from(clubs).where(eq(clubs.id, t.linkedId));
      staff = c?.coord ? [c.coord] : [];
      pupils = (await tx.select({ u: students.userId }).from(clubMembers).innerJoin(students, eq(students.id, clubMembers.studentId)).where(and(eq(clubMembers.clubId, t.linkedId), eq(clubMembers.status, 'active')))).map((r) => r.u).filter((u): u is string => !!u);
    }
    const before = (await tx.select({ u: chatMembers.userId }).from(chatMembers).where(eq(chatMembers.threadId, id))).map((r) => r.u);
    const add = [...staff.map((u) => ({ u, role: 'admin' })), ...pupils.map((u) => ({ u, role: 'member' }))].filter((x) => !before.includes(x.u));
    if (add.length) await tx.insert(chatMembers).values(add.map((x) => ({ tenantId: p.tenantId, threadId: id, userId: x.u, role: x.role }))).onConflictDoNothing();
    // Students no longer in the class or club leave; staff stay until an admin removes them.
    const studentUsers = (await tx.select({ u: students.userId }).from(students).where(inArray(students.userId, before.length ? before : [p.userId]))).map((r) => r.u).filter((u): u is string => !!u);
    const gone = studentUsers.filter((u) => !pupils.includes(u));
    if (gone.length) await tx.delete(chatMembers).where(and(eq(chatMembers.threadId, id), inArray(chatMembers.userId, gone), notInArray(chatMembers.role, ['owner'])));
    const [n] = await tx.select({ n: sql<number>`count(*)::int` }).from(chatMembers).where(eq(chatMembers.threadId, id));
    return { members: n.n, added: add.length, removed: gone.length };
  }
}
