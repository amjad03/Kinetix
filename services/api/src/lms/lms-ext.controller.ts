import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { and, asc, desc, eq, inArray, lt, notInArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { assertCanSeeStudent } from '../common/student-access.js';
import { tenantToday } from '../common/today.js';
import { ZodBody } from '../common/zod-body.js';
import { Clock } from '../common/time.js';
import { DbService, type Tx } from '../db/db.service.js';
import { learningOutcomes, masteryRecords } from '../db/schema-curriculum.js';
import { forumPosts, forumThreads, outcomeTopics, worksheets } from '../db/schema-g1.js';
import { homework, homeworkSubmissions, lmsCourses, lmsItems, lmsModules, sections, students, subjects, users } from '../db/schema.js';
import { recommend } from '../school-learning/school-rules.js';
import { LMS_STAFF, LmsService } from './lms.service.js';

const ThreadBody = z.object({ title: z.string().trim().min(3).max(160), body: z.string().trim().min(1).max(4000) });
const PostBody = z.object({ body: z.string().trim().min(1).max(4000) });
const ModerateBody = z.object({ action: z.enum(['pin', 'unpin', 'lock', 'unlock', 'hide', 'unhide']) });
const CloneBody = z.object({ sectionId: z.uuid(), subjectId: z.uuid().optional(), title: z.string().trim().min(1).max(120).optional() });
/** Items that point at one class's own homework, tests or worksheets cannot move to another class. */
const CLASS_BOUND = ['homework', 'assessment', 'worksheet'];

/** Course discussion forums, copying a course for a new year, and what each student should do next. */
@Controller('v1/lms')
export class LmsExtController {
  constructor(
    private readonly db: DbService,
    private readonly lms: LmsService,
    private readonly clock: Clock,
  ) {}

  /** The signed-in person's access to a course: staff who manage it, or a student or guardian of its class (published only). */
  private async access(tx: Tx, p: UserPrincipal, courseId: string) {
    const c = await this.lms.course(tx, courseId);
    const manage = await this.lms.canManage(tx, p, c);
    if (manage) return { c, manage: true, student: false };
    const kid = (await this.lms.familyStudents(tx, p)).find((s) => s.sectionId === c.sectionId);
    if (!kid || c.status !== 'published') throw new NotFoundException('Course not found');
    return { c, manage: false, student: p.roles.includes('student') };
  }

  // ---- forums -----------------------------------------------------------------------------------------------------------------------

  @Get('courses/:id/forum')
  @Auth('user')
  threads(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const a = await this.access(tx, p, id);
      const rows = await tx
        .select({ id: forumThreads.id, title: forumThreads.title, pinned: forumThreads.pinned, locked: forumThreads.locked, hidden: forumThreads.hidden, createdAt: forumThreads.createdAt, lastPostAt: forumThreads.lastPostAt, author: users.fullName, replies: sql<number>`(select count(*)::int from forum_posts fp where fp.thread_id = ${forumThreads.id} and not fp.hidden)` })
        .from(forumThreads)
        .innerJoin(users, eq(users.id, forumThreads.authorId))
        .where(and(eq(forumThreads.courseId, id), a.manage ? undefined : eq(forumThreads.hidden, false)))
        .orderBy(desc(forumThreads.pinned), desc(forumThreads.lastPostAt))
        .limit(200);
      return rows;
    });
  }

  @Post('courses/:id/forum')
  @Auth('user')
  startThread(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ThreadBody)) b: z.infer<typeof ThreadBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const a = await this.access(tx, p, id);
      if (!a.manage && !a.student) throw new ForbiddenException('Only the class and its teachers can post here');
      const [row] = await tx.insert(forumThreads).values({ tenantId: p.tenantId, courseId: id, authorId: p.userId, title: b.title, body: b.body }).returning();
      await auditUser(tx, p, 'lms.forum.thread', 'forum_thread', row.id, { courseId: id });
      return row;
    });
  }

  @Get('forum/:threadId')
  @Auth('user')
  thread(@CurrentPrincipal() p: UserPrincipal, @Param('threadId', ParseUUIDPipe) threadId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [t] = await tx.select().from(forumThreads).where(eq(forumThreads.id, threadId));
      if (!t) throw new NotFoundException('Discussion not found');
      const a = await this.access(tx, p, t.courseId);
      if (t.hidden && !a.manage) throw new NotFoundException('Discussion not found');
      const [author] = await tx.select({ n: users.fullName }).from(users).where(eq(users.id, t.authorId));
      const posts = await tx
        .select({ id: forumPosts.id, body: forumPosts.body, hidden: forumPosts.hidden, createdAt: forumPosts.createdAt, authorId: forumPosts.authorId, author: users.fullName })
        .from(forumPosts)
        .innerJoin(users, eq(users.id, forumPosts.authorId))
        .where(and(eq(forumPosts.threadId, threadId), a.manage ? undefined : eq(forumPosts.hidden, false)))
        .orderBy(asc(forumPosts.createdAt));
      return { ...t, author: author?.n ?? '', canModerate: a.manage, posts: posts.map((x) => ({ ...x, body: x.hidden ? '' : x.body })) };
    });
  }

  @Post('forum/:threadId/posts')
  @Auth('user')
  reply(@CurrentPrincipal() p: UserPrincipal, @Param('threadId', ParseUUIDPipe) threadId: string, @Body(new ZodBody(PostBody)) b: z.infer<typeof PostBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [t] = await tx.select().from(forumThreads).where(eq(forumThreads.id, threadId));
      if (!t || t.hidden) throw new NotFoundException('Discussion not found');
      const a = await this.access(tx, p, t.courseId);
      if (!a.manage && !a.student) throw new ForbiddenException('Only the class and its teachers can post here');
      if (t.locked && !a.manage) throw new ConflictException('This discussion is locked');
      const [row] = await tx.insert(forumPosts).values({ tenantId: p.tenantId, threadId, authorId: p.userId, body: b.body }).returning();
      await tx.update(forumThreads).set({ lastPostAt: new Date() }).where(eq(forumThreads.id, threadId));
      return row;
    });
  }

  /** Teachers pin, lock or hide a discussion. */
  @Post('forum/:threadId/moderate')
  @Auth('user', [...LMS_STAFF])
  @HttpCode(200)
  moderate(@CurrentPrincipal() p: UserPrincipal, @Param('threadId', ParseUUIDPipe) threadId: string, @Body(new ZodBody(ModerateBody)) b: z.infer<typeof ModerateBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [t] = await tx.select().from(forumThreads).where(eq(forumThreads.id, threadId));
      if (!t) throw new NotFoundException('Discussion not found');
      await this.lms.assertManage(tx, p, await this.lms.course(tx, t.courseId));
      const patch = { pin: { pinned: true }, unpin: { pinned: false }, lock: { locked: true }, unlock: { locked: false }, hide: { hidden: true }, unhide: { hidden: false } }[b.action];
      await tx.update(forumThreads).set(patch).where(eq(forumThreads.id, threadId));
      await auditUser(tx, p, `lms.forum.${b.action}`, 'forum_thread', threadId);
      return { id: threadId, ...patch };
    });
  }

  @Post('forum/posts/:postId/hide')
  @Auth('user', [...LMS_STAFF])
  @HttpCode(200)
  hidePost(@CurrentPrincipal() p: UserPrincipal, @Param('postId', ParseUUIDPipe) postId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [post] = await tx.select().from(forumPosts).where(eq(forumPosts.id, postId));
      if (!post) throw new NotFoundException('Post not found');
      const [t] = await tx.select({ courseId: forumThreads.courseId }).from(forumThreads).where(eq(forumThreads.id, post.threadId));
      await this.lms.assertManage(tx, p, await this.lms.course(tx, t.courseId));
      await tx.update(forumPosts).set({ hidden: true }).where(eq(forumPosts.id, postId));
      await auditUser(tx, p, 'lms.forum.post_hidden', 'forum_post', postId);
      return { id: postId, hidden: true };
    });
  }

  // ---- reuse a course for the next year ------------------------------------------------------------------------------------

  /** Copies a course's modules and content into another class (usually next year's) as a draft. Homework, tests and worksheets belong to one class, so they are left out and counted. */
  @Post('courses/:id/clone')
  @Auth('user', [...LMS_STAFF])
  clone(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(CloneBody)) b: z.infer<typeof CloneBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const src = await this.lms.course(tx, id);
      await this.lms.assertManage(tx, p, src);
      const subjectId = b.subjectId ?? src.subjectId;
      const [sec] = await tx.select().from(sections).where(eq(sections.id, b.sectionId));
      if (!sec) throw new NotFoundException('Class not found');
      const [sub] = await tx.select().from(subjects).where(eq(subjects.id, subjectId));
      if (!sub || sub.programId !== sec.programId) throw new BadRequestException('That subject is not taught in the target class');
      await this.lms.assertManage(tx, p, { sectionId: b.sectionId, subjectId });
      const [dup] = await tx.select({ id: lmsCourses.id }).from(lmsCourses).where(and(eq(lmsCourses.sectionId, b.sectionId), eq(lmsCourses.subjectId, subjectId)));
      if (dup) throw new ConflictException('That class already has a course for this subject');
      const [course] = await tx.insert(lmsCourses).values({ tenantId: p.tenantId, sectionId: b.sectionId, subjectId, title: b.title ?? src.title, description: src.description, clonedFrom: src.id, status: 'draft', createdBy: p.userId }).returning();
      const mods = await tx.select().from(lmsModules).where(eq(lmsModules.courseId, id)).orderBy(asc(lmsModules.position));
      let copied = 0;
      let skipped = 0;
      for (const m of mods) {
        const [nm] = await tx.insert(lmsModules).values({ tenantId: p.tenantId, courseId: course.id, title: m.title, position: m.position }).returning();
        for (const it of await tx.select().from(lmsItems).where(eq(lmsItems.moduleId, m.id)).orderBy(asc(lmsItems.position))) {
          if (CLASS_BOUND.includes(it.kind)) {
            skipped++;
            continue;
          }
          await tx.insert(lmsItems).values({ tenantId: p.tenantId, moduleId: nm.id, position: it.position, kind: it.kind, title: it.title, refId: it.refId, url: it.url });
          copied++;
        }
      }
      await auditUser(tx, p, 'lms.course.cloned', 'lms_course', course.id, { from: id, copied, skipped });
      return { courseId: course.id, modules: mods.length, copied, skipped };
    });
  }

  // ---- progress, mastery and recommendations -----------------------------------------------------------------------------

  /** Mastery by subject, what to practise next (items that teach the weakest outcomes) and what is overdue. */
  @Get('students/:studentId/recommendations')
  @Auth('user')
  recommendations(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, [...LMS_STAFF]);
      const [stu] = await tx.select().from(students).where(eq(students.id, studentId));
      const mastery = await tx
        .select({ outcomeId: learningOutcomes.id, code: learningOutcomes.code, subjectName: learningOutcomes.subjectName, level: masteryRecords.level })
        .from(masteryRecords)
        .innerJoin(learningOutcomes, eq(learningOutcomes.id, masteryRecords.outcomeId))
        .where(eq(masteryRecords.studentId, studentId));
      const weak = mastery.filter((m) => m.level === 'beginning' || m.level === 'developing');
      const links = weak.length ? await tx.select().from(outcomeTopics).where(inArray(outcomeTopics.outcomeId, weak.map((w) => w.outcomeId))) : [];
      const courses = await tx.select({ id: lmsCourses.id, subjectId: lmsCourses.subjectId }).from(lmsCourses).where(and(eq(lmsCourses.sectionId, stu.sectionId), eq(lmsCourses.status, 'published')));
      const items = courses.length
        ? await tx
            .select({ id: lmsItems.id, title: lmsItems.title, kind: lmsItems.kind, refId: lmsItems.refId, courseId: lmsModules.courseId })
            .from(lmsItems)
            .innerJoin(lmsModules, eq(lmsModules.id, lmsItems.moduleId))
            .where(inArray(lmsModules.courseId, courses.map((c) => c.id)))
        : [];
      const wsOutcome = new Map((await tx.select({ id: worksheets.id, outcomeId: worksheets.outcomeId }).from(worksheets).where(eq(worksheets.sectionId, stu.sectionId))).map((w) => [w.id, w.outcomeId]));
      const today = await tenantToday(tx, this.clock);
      const done = (await tx.select({ id: homeworkSubmissions.homeworkId }).from(homeworkSubmissions).where(eq(homeworkSubmissions.studentId, studentId))).map((r) => r.id);
      const overdue = await tx
        .select({ id: homework.id, title: homework.title, dueOn: homework.dueOn })
        .from(homework)
        .where(and(eq(homework.sectionId, stu.sectionId), lt(homework.dueOn, today), done.length ? notInArray(homework.id, done) : undefined))
        .orderBy(asc(homework.dueOn))
        .limit(10);
      const weakOutcomes = weak.map((w) => ({ outcomeId: w.outcomeId, code: w.code, level: w.level, topicIds: links.filter((l) => l.outcomeId === w.outcomeId).map((l) => l.topicId) }));
      const asItems = items.map((i) => ({ id: i.id, title: i.title, kind: i.kind, topicId: i.kind === 'topic' ? i.refId : null, courseId: i.courseId }));
      // A worksheet that builds a weak outcome counts like a topic that does.
      for (const i of items.filter((x) => x.kind === 'worksheet' && x.refId && wsOutcome.get(x.refId))) {
        const w = weakOutcomes.find((o) => o.outcomeId === wsOutcome.get(i.refId!));
        if (w) {
          const marker = `ws:${i.id}`;
          w.topicIds.push(marker);
          asItems.find((a) => a.id === i.id)!.topicId = marker;
        }
      }
      const subjects = new Map<string, { total: number; strong: number }>();
      for (const m of mastery) {
        const s = subjects.get(m.subjectName) ?? { total: 0, strong: 0 };
        s.total++;
        if (m.level === 'proficient' || m.level === 'mastery') s.strong++;
        subjects.set(m.subjectName, s);
      }
      return {
        mastery: [...subjects].map(([subject, s]) => ({ subject, assessed: s.total, percent: Math.round((s.strong / s.total) * 100) })),
        recommendations: recommend({ weakOutcomes, items: asItems, overdue }),
      };
    });
  }
}
