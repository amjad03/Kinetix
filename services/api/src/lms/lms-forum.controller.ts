import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { timetableSlots, users } from '../db/schema.js';
import { forumPosts, forumThreads } from '../db/schema-g1.js';
import { FORUM_REPORT_REASONS, forumReports } from '../db/schema-lms.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { lmsSettingsOf, lmsTexts } from './lms-settings.js';
import { LMS_STAFF, LmsService } from './lms.service.js';

const ReportBody = z.object({ postId: z.uuid().optional(), reason: z.enum(FORUM_REPORT_REASONS), note: z.string().trim().max(500).default('') });
const DecideBody = z.object({ kind: z.enum(['thread', 'post']), id: z.uuid(), action: z.enum(['approve', 'hide', 'dismiss']) });
const EditBody = z.object({ body: z.string().trim().min(1).max(4000) });

/**
 * Forum moderation: members report a discussion or a reply (enough reports hide it for review), teachers work a queue
 * of held and reported posts (approve, hide, dismiss), and authors edit their own reply for a short while or withdraw it.
 */
@Controller('v1/lms')
export class LmsForumController {
  constructor(
    private readonly db: DbService,
    private readonly lms: LmsService,
    private readonly clock: Clock,
    private readonly notifications: NotificationsService,
  ) {}

  private async threadAccess(tx: Tx, p: UserPrincipal, threadId: string) {
    const [t] = await tx.select().from(forumThreads).where(eq(forumThreads.id, threadId));
    if (!t) throw new NotFoundException('Discussion not found');
    const c = await this.lms.course(tx, t.courseId);
    const manage = await this.lms.canManage(tx, p, c);
    if (!manage) {
      const kid = (await this.lms.familyStudents(tx, p)).find((s) => s.sectionId === c.sectionId);
      if (!kid || c.status !== 'published' || t.hidden || !p.roles.includes('student')) throw new NotFoundException('Discussion not found');
    }
    return { t, c, manage };
  }

  /** A member of the class reports a discussion or one reply. Reporting twice is a no-op. */
  @Post('forum/:threadId/report')
  @Auth('user', ['student', ...LMS_STAFF])
  @HttpCode(200)
  report(@CurrentPrincipal() p: UserPrincipal, @Param('threadId', ParseUUIDPipe) threadId: string, @Body(new ZodBody(ReportBody)) b: z.infer<typeof ReportBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { t, c } = await this.threadAccess(tx, p, threadId);
      if (b.postId) {
        const [post] = await tx.select({ id: forumPosts.id, author: forumPosts.authorId }).from(forumPosts).where(and(eq(forumPosts.id, b.postId), eq(forumPosts.threadId, threadId)));
        if (!post) throw new NotFoundException('Post not found');
        if (post.author === p.userId) throw new BadRequestException('You cannot report your own post');
      } else if (t.authorId === p.userId) throw new BadRequestException('You cannot report your own discussion');
      const added = await tx.insert(forumReports).values({ tenantId: p.tenantId, threadId, postId: b.postId ?? null, reporterId: p.userId, reason: b.reason, note: b.note }).onConflictDoNothing().returning({ id: forumReports.id });
      const [n] = await tx.select({ n: sql<number>`count(*)::int` }).from(forumReports).where(and(eq(forumReports.threadId, threadId), b.postId ? eq(forumReports.postId, b.postId) : isNull(forumReports.postId), eq(forumReports.status, 'open')));
      const limit = (await lmsSettingsOf(tx, p.tenantId)).forumAutoHideReports;
      const held = limit > 0 && n.n >= limit;
      if (held) {
        if (b.postId) await tx.update(forumPosts).set({ held: true }).where(eq(forumPosts.id, b.postId));
        else await tx.update(forumThreads).set({ held: true }).where(eq(forumThreads.id, threadId));
      }
      if (added.length) {
        await auditUser(tx, p, 'lms.forum.reported', 'forum_thread', threadId, { postId: b.postId ?? null, reason: b.reason, reports: n.n, held });
        // The teachers of the class are told once per post.
        const teachers = (await tx.selectDistinct({ u: timetableSlots.teacherId }).from(timetableSlots).where(and(eq(timetableSlots.sectionId, c.sectionId), eq(timetableSlots.subjectId, c.subjectId)))).map((r) => r.u).filter((u): u is string => !!u && u !== p.userId);
        await this.notifications.notifyUsers(tx, teachers, { kind: 'message', text: lmsTexts.forumReported({ title: t.title, course: c.title }), data: { threadId, courseId: c.id }, dedupeKey: `lms-forum-report:${threadId}:${b.postId ?? 'thread'}` });
      }
      return { reported: true, reports: n.n, held };
    });
  }

  /** The moderation queue of a course: discussions and replies waiting for approval or reported. */
  @Get('courses/:id/forum/queue')
  @Auth('user', [...LMS_STAFF])
  queue(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.lms.assertManage(tx, p, await this.lms.course(tx, id));
      const threads = await tx
        .select({ id: forumThreads.id, title: forumThreads.title, body: forumThreads.body, held: forumThreads.held, hidden: forumThreads.hidden, createdAt: forumThreads.createdAt, author: users.fullName, reports: sql<number>`(select count(*)::int from forum_reports r where r.thread_id = ${forumThreads.id} and r.post_id is null and r.status = 'open')` })
        .from(forumThreads)
        .innerJoin(users, eq(users.id, forumThreads.authorId))
        .where(and(eq(forumThreads.courseId, id), or(eq(forumThreads.held, true), sql`exists (select 1 from forum_reports r where r.thread_id = ${forumThreads.id} and r.post_id is null and r.status = 'open')`)))
        .orderBy(asc(forumThreads.createdAt))
        .limit(200);
      const posts = await tx
        .select({ id: forumPosts.id, threadId: forumPosts.threadId, thread: forumThreads.title, body: forumPosts.body, held: forumPosts.held, hidden: forumPosts.hidden, createdAt: forumPosts.createdAt, author: users.fullName, reports: sql<number>`(select count(*)::int from forum_reports r where r.post_id = ${forumPosts.id} and r.status = 'open')` })
        .from(forumPosts)
        .innerJoin(forumThreads, eq(forumThreads.id, forumPosts.threadId))
        .innerJoin(users, eq(users.id, forumPosts.authorId))
        .where(and(eq(forumThreads.courseId, id), or(eq(forumPosts.held, true), sql`exists (select 1 from forum_reports r where r.post_id = ${forumPosts.id} and r.status = 'open')`)))
        .orderBy(asc(forumPosts.createdAt))
        .limit(500);
      const ids = [...threads.map((x) => x.id), ...posts.map((x) => x.threadId)];
      const reasons = ids.length ? await tx.select({ threadId: forumReports.threadId, postId: forumReports.postId, reason: forumReports.reason, note: forumReports.note }).from(forumReports).where(and(inArray(forumReports.threadId, ids), eq(forumReports.status, 'open'))).orderBy(desc(forumReports.createdAt)) : [];
      return {
        threads: threads.map((x) => ({ ...x, reasons: reasons.filter((r) => r.threadId === x.id && !r.postId).map((r) => ({ reason: r.reason, note: r.note })) })),
        posts: posts.map((x) => ({ ...x, reasons: reasons.filter((r) => r.postId === x.id).map((r) => ({ reason: r.reason, note: r.note })) })),
      };
    });
  }

  /** The teacher's decision on a held or reported discussion or reply: approve (show, reports dismissed), hide, or dismiss the reports. */
  @Post('forum/moderation')
  @Auth('user', [...LMS_STAFF])
  @HttpCode(200)
  decide(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(DecideBody)) b: z.infer<typeof DecideBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const threadId = b.kind === 'thread' ? b.id : (await tx.select({ t: forumPosts.threadId }).from(forumPosts).where(eq(forumPosts.id, b.id)))[0]?.t;
      if (!threadId) throw new NotFoundException('Post not found');
      const { manage } = await this.threadAccess(tx, p, threadId);
      if (!manage) throw new ForbiddenException('You do not teach this course');
      const patch = b.action === 'hide' ? { hidden: true, held: false } : { held: false };
      if (b.kind === 'thread') await tx.update(forumThreads).set(patch).where(eq(forumThreads.id, b.id));
      else await tx.update(forumPosts).set(patch).where(eq(forumPosts.id, b.id));
      const now = this.clock.now();
      const resolved = await tx
        .update(forumReports)
        .set({ status: b.action === 'hide' ? 'actioned' : 'dismissed', resolvedBy: p.userId, resolvedAt: now })
        .where(and(eq(forumReports.threadId, threadId), b.kind === 'thread' ? isNull(forumReports.postId) : eq(forumReports.postId, b.id), eq(forumReports.status, 'open')))
        .returning({ id: forumReports.id });
      if (b.action === 'approve' && b.kind === 'post') await tx.update(forumThreads).set({ lastPostAt: now }).where(eq(forumThreads.id, threadId));
      await auditUser(tx, p, `lms.forum.${b.action}`, b.kind === 'thread' ? 'forum_thread' : 'forum_post', b.id, { reports: resolved.length });
      return { id: b.id, action: b.action, reportsResolved: resolved.length };
    });
  }

  /** The author edits their own reply within the institution's edit window. */
  @Patch('forum/posts/:postId')
  @Auth('user')
  edit(@CurrentPrincipal() p: UserPrincipal, @Param('postId', ParseUUIDPipe) postId: string, @Body(new ZodBody(EditBody)) b: z.infer<typeof EditBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [post] = await tx.select().from(forumPosts).where(eq(forumPosts.id, postId));
      if (!post || post.authorId !== p.userId) throw new NotFoundException('Post not found');
      const { t } = await this.threadAccess(tx, p, post.threadId);
      if (post.hidden) throw new ConflictException('A hidden post cannot be edited');
      if (t.locked) throw new ConflictException('This discussion is locked');
      const mins = (await lmsSettingsOf(tx, p.tenantId)).forumEditMinutes;
      if (this.clock.now().getTime() - post.createdAt.getTime() > mins * 60_000) throw new ConflictException(`Posts can be edited for ${mins} minutes`);
      const [row] = await tx.update(forumPosts).set({ body: b.body, editedAt: this.clock.now() }).where(eq(forumPosts.id, postId)).returning();
      await auditUser(tx, p, 'lms.forum.edited', 'forum_post', postId, { before: post.body.slice(0, 200) });
      return row;
    });
  }

  /** The author withdraws their own reply (it is hidden; teachers still see it). */
  @Post('forum/posts/:postId/withdraw')
  @Auth('user')
  @HttpCode(200)
  withdraw(@CurrentPrincipal() p: UserPrincipal, @Param('postId', ParseUUIDPipe) postId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [post] = await tx.select().from(forumPosts).where(eq(forumPosts.id, postId));
      if (!post || post.authorId !== p.userId) throw new NotFoundException('Post not found');
      await this.threadAccess(tx, p, post.threadId);
      await tx.update(forumPosts).set({ hidden: true }).where(eq(forumPosts.id, postId));
      await auditUser(tx, p, 'lms.forum.withdrawn', 'forum_post', postId);
      return { id: postId, hidden: true };
    });
  }
}
