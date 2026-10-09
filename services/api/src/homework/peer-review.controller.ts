import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { homework, homeworkPeerReviews, homeworkSubmissions, students } from '../db/schema.js';
import { isSchoolAdmin, TeacherService } from '../teacher/teacher.service.js';
import { averageTotal, pairPeers, rubricTotal } from './peer-review.logic.js';

const Score = z.number().int().min(1).max(5);
const ReviewBody = z.object({ clarity: Score, accuracy: Score, effort: Score, comment: z.string().trim().min(3).max(500) });

/**
 * Peer review of homework. The teacher gives each classmate who handed in two others' work to review;
 * reviewers see the work without the author's name, score it on a three-point rubric and comment;
 * authors read the scores and comments without the reviewer's name; the teacher sees everything.
 */
@Controller('v1/homework/:id/peer-review')
export class PeerReviewController {
  constructor(
    private readonly db: DbService,
    private readonly teacher: TeacherService,
    private readonly clock: Clock,
  ) {}

  /** Assigns reviewers to everyone who has handed in (staff who teach the class). Safe to repeat: it only adds. */
  @Post('assign')
  @HttpCode(200)
  @Auth('user')
  assign(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const hw = await this.staffHomework(tx, p, id);
      const subs = await tx
        .select({ studentId: homeworkSubmissions.studentId })
        .from(homeworkSubmissions)
        .innerJoin(students, eq(students.id, homeworkSubmissions.studentId))
        .where(and(eq(homeworkSubmissions.homeworkId, id), eq(students.sectionId, hw.sectionId), eq(students.status, 'active')));
      const pairs = pairPeers(subs.map((s) => s.studentId));
      if (pairs.length === 0) throw new BadRequestException('At least two students must hand in before peer review can start');
      const added = await tx
        .insert(homeworkPeerReviews)
        .values(pairs.map((x) => ({ tenantId: p.tenantId, homeworkId: id, authorStudentId: x.authorId, reviewerStudentId: x.reviewerId })))
        .onConflictDoNothing()
        .returning({ id: homeworkPeerReviews.id });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'homework.peer_review_assigned', subjectType: 'homework', subjectId: id, data: { added: added.length } });
      return { assigned: added.length, total: pairs.length };
    });
  }

  /** Everything for the teacher: who reviewed whom, the rubric, the comment and each work's average. */
  @Get()
  @Auth('user')
  all(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.staffHomework(tx, p, id);
      const rows = await tx.select().from(homeworkPeerReviews).where(eq(homeworkPeerReviews.homeworkId, id)).orderBy(asc(homeworkPeerReviews.createdAt));
      const names = rows.length ? await tx.select({ id: students.id, fullName: students.fullName }).from(students).where(inArray(students.id, [...new Set(rows.flatMap((r) => [r.authorStudentId, r.reviewerStudentId]))])) : [];
      const name = (sid: string) => names.find((n) => n.id === sid)?.fullName ?? '';
      const reviews = rows.map((r) => ({ id: r.id, author: name(r.authorStudentId), reviewer: name(r.reviewerStudentId), done: !!r.reviewedAt, rubric: r.rubric, total: r.rubric ? rubricTotal(r.rubric) : null, comment: r.comment }));
      const authors = [...new Set(rows.map((r) => r.authorStudentId))].map((sid) => {
        const done = rows.filter((r) => r.authorStudentId === sid && r.rubric);
        return { author: name(sid), reviews: rows.filter((r) => r.authorStudentId === sid).length, done: done.length, average: averageTotal(done.map((r) => r.rubric!)) };
      });
      return { homeworkId: id, reviews, authors };
    });
  }

  /** The work I was given to review: the author's answer without their name. */
  @Get('mine')
  @Auth('user', ['student'])
  mine(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const me = await this.myStudent(tx, p, id);
      const rows = await tx
        .select({ review: homeworkPeerReviews, text: homeworkSubmissions.text, files: homeworkSubmissions.files })
        .from(homeworkPeerReviews)
        .innerJoin(homeworkSubmissions, and(eq(homeworkSubmissions.homeworkId, homeworkPeerReviews.homeworkId), eq(homeworkSubmissions.studentId, homeworkPeerReviews.authorStudentId)))
        .where(and(eq(homeworkPeerReviews.homeworkId, id), eq(homeworkPeerReviews.reviewerStudentId, me)))
        .orderBy(asc(homeworkPeerReviews.createdAt), asc(homeworkPeerReviews.id));
      return rows.map((r, i) => ({ id: r.review.id, label: String.fromCharCode(65 + i), text: r.text, fileCount: r.files.length, done: !!r.review.reviewedAt, rubric: r.review.rubric, comment: r.review.comment }));
    });
  }

  /** What classmates said about my work, without their names. */
  @Get('received')
  @Auth('user', ['student'])
  received(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const me = await this.myStudent(tx, p, id);
      const rows = await tx.select().from(homeworkPeerReviews).where(and(eq(homeworkPeerReviews.homeworkId, id), eq(homeworkPeerReviews.authorStudentId, me))).orderBy(asc(homeworkPeerReviews.createdAt), asc(homeworkPeerReviews.id));
      const done = rows.filter((r) => r.rubric);
      return { pending: rows.length - done.length, average: averageTotal(done.map((r) => r.rubric!)), reviews: done.map((r) => ({ rubric: r.rubric, total: rubricTotal(r.rubric!), comment: r.comment })) };
    });
  }

  /** Saves my review of one piece of work (can be edited later). */
  @Put(':reviewId')
  @Auth('user', ['student'])
  review(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('reviewId', ParseUUIDPipe) reviewId: string, @Body(new ZodBody(ReviewBody)) b: z.infer<typeof ReviewBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const me = await this.myStudent(tx, p, id);
      const [row] = await tx.update(homeworkPeerReviews).set({ rubric: { clarity: b.clarity, accuracy: b.accuracy, effort: b.effort }, comment: b.comment, reviewedAt: this.clock.now() }).where(and(eq(homeworkPeerReviews.id, reviewId), eq(homeworkPeerReviews.homeworkId, id), eq(homeworkPeerReviews.reviewerStudentId, me))).returning();
      if (!row) throw new NotFoundException('Review not found');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'homework.peer_reviewed', subjectType: 'homework', subjectId: id, data: { total: rubricTotal(row.rubric!) } });
      return { id: row.id, done: true, total: rubricTotal(row.rubric!) };
    });
  }

  /** The caller's own student record for a homework of their class. */
  private async myStudent(tx: Tx, p: UserPrincipal, id: string): Promise<string> {
    const [hw] = await tx.select({ sectionId: homework.sectionId }).from(homework).where(eq(homework.id, id));
    if (!hw) throw new NotFoundException('Homework not found');
    const [st] = await tx.select({ id: students.id }).from(students).where(and(eq(students.userId, p.userId), eq(students.sectionId, hw.sectionId)));
    if (!st) throw new NotFoundException('Homework not found');
    return st.id;
  }

  private async staffHomework(tx: Tx, p: UserPrincipal, id: string) {
    const [hw] = await tx.select({ id: homework.id, sectionId: homework.sectionId }).from(homework).where(eq(homework.id, id));
    if (!hw) throw new NotFoundException('Homework not found');
    if (isSchoolAdmin(p) || (await this.teacher.teachesSection(tx, p.userId, hw.sectionId))) return hw;
    throw new ForbiddenException('You do not teach this class');
  }
}
