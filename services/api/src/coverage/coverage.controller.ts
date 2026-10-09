import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Post, Query } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { BoardPrincipal, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { Clock, localParts } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { boardSessions, chapters, guardians, students, subjects, topicCoverage, topics, users } from '../db/schema.js';
import { headsSubject } from '../departments/departments.controller.js';
import { isSchoolAdmin, parseDate, TeacherService } from '../teacher/teacher.service.js';
import { TimetableService } from '../timetable/timetable.service.js';

const MarkBody = z.object({
  /** From the Teacher App; the board uses its open class. */
  sectionId: z.uuid().optional(),
  subjectId: z.uuid().optional(),
  topicId: z.uuid(),
  coveredOn: z.string().optional(),
});

/** Topics in a subject's course, and how many a class has covered. */
export async function coverageCounts(tx: Tx, pairs: { sectionId: string; subjectId: string }[]): Promise<Map<string, { covered: number; total: number }>> {
  const out = new Map<string, { covered: number; total: number }>();
  if (pairs.length === 0) return out;
  const subjectIds = [...new Set(pairs.map((p) => p.subjectId))];
  const totals = await tx
    .select({ subjectId: subjects.id, total: sql<number>`count(${topics.id})::int` })
    .from(subjects)
    .innerJoin(chapters, eq(chapters.courseId, subjects.courseId))
    .innerJoin(topics, eq(topics.chapterId, chapters.id))
    .where(inArray(subjects.id, subjectIds))
    .groupBy(subjects.id);
  const covered = await tx
    .select({ sectionId: topicCoverage.sectionId, subjectId: subjects.id, n: sql<number>`count(*)::int` })
    .from(topicCoverage)
    .innerJoin(topics, eq(topics.id, topicCoverage.topicId))
    .innerJoin(chapters, eq(chapters.id, topics.chapterId))
    .innerJoin(subjects, eq(subjects.courseId, chapters.courseId))
    .where(and(inArray(subjects.id, subjectIds), inArray(topicCoverage.sectionId, [...new Set(pairs.map((p) => p.sectionId))])))
    .groupBy(topicCoverage.sectionId, subjects.id);
  const totalBy = new Map(totals.map((t) => [t.subjectId, t.total]));
  const coveredBy = new Map(covered.map((c) => [`${c.sectionId}|${c.subjectId}`, c.n]));
  for (const p of pairs) out.set(`${p.sectionId}|${p.subjectId}`, { covered: coveredBy.get(`${p.sectionId}|${p.subjectId}`) ?? 0, total: totalBy.get(p.subjectId) ?? 0 });
  return out;
}

/**
 * Syllabus coverage: which topics of a class's syllabus have been taught. Teachers mark topics
 * from the board (Books) or the Teacher App; heads of department and the principal see progress;
 * students and families see their class's progress.
 */
@Controller('v1/coverage')
export class CoverageController {
  constructor(
    private readonly db: DbService,
    private readonly teacher: TeacherService,
    private readonly timetable: TimetableService,
    private readonly clock: Clock,
  ) {}

  @Get()
  @Auth(['user', 'board'])
  get(@CurrentPrincipal() p: UserPrincipal | BoardPrincipal, @Query('sectionId') sectionQ?: string, @Query('subjectId') subjectQ?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { sectionId, subjectId } = await this.target(tx, p, sectionQ, subjectQ);
      if (p.kind === 'user') await this.assertCanRead(tx, p, sectionId, subjectId);
      const [subject] = await tx.select({ courseId: subjects.courseId }).from(subjects).where(eq(subjects.id, subjectId));
      if (!subject?.courseId) return { sectionId, subjectId, covered: 0, total: 0, percent: null, topics: [] };
      const rows = await tx
        .select({ topicId: topicCoverage.topicId, coveredOn: topicCoverage.coveredOn, coveredBy: users.fullName })
        .from(topicCoverage)
        .innerJoin(topics, eq(topics.id, topicCoverage.topicId))
        .innerJoin(chapters, eq(chapters.id, topics.chapterId))
        .innerJoin(users, eq(users.id, topicCoverage.coveredBy))
        .where(and(eq(topicCoverage.sectionId, sectionId), eq(chapters.courseId, subject.courseId)));
      const counts = (await coverageCounts(tx, [{ sectionId, subjectId }])).get(`${sectionId}|${subjectId}`)!;
      return { sectionId, subjectId, ...counts, percent: counts.total ? Math.round((counts.covered / counts.total) * 100) : null, topics: rows };
    });
  }

  /** Marks a topic as taught (again: the date is updated). */
  @Post()
  @HttpCode(200)
  @Auth(['user', 'board'])
  mark(@CurrentPrincipal() p: UserPrincipal | BoardPrincipal, @Body(new ZodBody(MarkBody)) b: z.infer<typeof MarkBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { sectionId, subjectId } = await this.target(tx, p, b.sectionId, b.subjectId);
      if (p.kind === 'user') await this.assertCanMark(tx, p, sectionId);
      await this.assertTopicIn(tx, b.topicId, subjectId);
      const today = localParts(this.clock.now(), await this.timetable.tenantTimezone(tx)).date;
      const coveredOn = b.coveredOn ? parseDate(b.coveredOn, 'coveredOn') : today;
      if (coveredOn > today) throw new BadRequestException('A topic cannot be marked as taught in the future');
      const by = p.kind === 'board' ? p.teacherId : p.userId;
      const boardSessionId = p.kind === 'board' ? p.sessionId : null;
      const [before] = await tx.select({ coveredOn: topicCoverage.coveredOn }).from(topicCoverage).where(and(eq(topicCoverage.sectionId, sectionId), eq(topicCoverage.topicId, b.topicId)));
      await tx
        .insert(topicCoverage)
        .values({ tenantId: p.tenantId, sectionId, topicId: b.topicId, coveredOn, coveredBy: by, boardSessionId })
        .onConflictDoUpdate({ target: [topicCoverage.sectionId, topicCoverage.topicId], set: { coveredOn, coveredBy: by, boardSessionId } });
      await audit(tx, { tenantId: p.tenantId, actorType: p.kind === 'board' ? 'device' : 'user', actorId: p.kind === 'board' ? p.deviceId : p.userId, action: 'coverage.marked', subjectType: 'topic', subjectId: b.topicId, data: { sectionId }, changes: { coveredOn: { before: before?.coveredOn ?? null, after: coveredOn } } });
      return { sectionId, subjectId, topicId: b.topicId, coveredOn };
    });
  }

  @Delete()
  @HttpCode(204)
  @Auth(['user', 'board'])
  async unmark(@CurrentPrincipal() p: UserPrincipal | BoardPrincipal, @Body(new ZodBody(MarkBody.pick({ sectionId: true, subjectId: true, topicId: true }))) b: { sectionId?: string; subjectId?: string; topicId: string }) {
    await this.db.withTenant(p.tenantId, async (tx) => {
      const { sectionId } = await this.target(tx, p, b.sectionId, b.subjectId);
      if (p.kind === 'user') await this.assertCanMark(tx, p, sectionId);
      const gone = await tx.delete(topicCoverage).where(and(eq(topicCoverage.sectionId, sectionId), eq(topicCoverage.topicId, b.topicId))).returning({ coveredOn: topicCoverage.coveredOn });
      if (gone.length) await audit(tx, { tenantId: p.tenantId, actorType: p.kind === 'board' ? 'device' : 'user', actorId: p.kind === 'board' ? p.deviceId : p.userId, action: 'coverage.unmarked', subjectType: 'topic', subjectId: b.topicId, data: { sectionId }, changes: { coveredOn: { before: gone[0].coveredOn, after: null } } });
    });
  }

  /** The class and subject: the board's open class, or the query/body for users. */
  private async target(tx: Tx, p: UserPrincipal | BoardPrincipal, sectionId?: string, subjectId?: string) {
    if (p.kind === 'board') {
      const [s] = await tx.select({ sectionId: boardSessions.sectionId, subjectId: boardSessions.subjectId }).from(boardSessions).where(eq(boardSessions.id, p.sessionId));
      if (!s?.sectionId || !s.subjectId) throw new BadRequestException('Open a class on the board first');
      return { sectionId: s.sectionId, subjectId: s.subjectId };
    }
    if (!sectionId || !subjectId || !z.uuid().safeParse(sectionId).success || !z.uuid().safeParse(subjectId).success) throw new BadRequestException('sectionId and subjectId are required');
    const section = await this.teacher.section(tx, sectionId);
    const [subject] = await tx.select().from(subjects).where(eq(subjects.id, subjectId));
    if (!subject || subject.programId !== section.programId || subject.term !== section.term) throw new BadRequestException('That subject is not taught in this class');
    return { sectionId, subjectId };
  }

  private async assertCanMark(tx: Tx, p: UserPrincipal, sectionId: string) {
    if (isSchoolAdmin(p) || (await this.teacher.teachesSection(tx, p.userId, sectionId))) return;
    throw new ForbiddenException('You do not teach this class');
  }

  /** Staff who teach the class, heads of its subject's department, leaders, and the class's students and families. */
  private async assertCanRead(tx: Tx, p: UserPrincipal, sectionId: string, subjectId: string) {
    if (isSchoolAdmin(p) || (await this.teacher.teachesSection(tx, p.userId, sectionId)) || (await headsSubject(tx, p, subjectId))) return;
    const [mine] = await tx
      .select({ id: students.id })
      .from(students)
      .leftJoin(guardians, eq(guardians.studentId, students.id))
      .where(and(eq(students.sectionId, sectionId), sql`(${students.userId} = ${p.userId} or ${guardians.userId} = ${p.userId})`))
      .limit(1);
    if (!mine) throw new NotFoundException('Class not found');
  }

  private async assertTopicIn(tx: Tx, topicId: string, subjectId: string) {
    const [row] = await tx
      .select({ id: topics.id })
      .from(topics)
      .innerJoin(chapters, eq(chapters.id, topics.chapterId))
      .innerJoin(subjects, eq(subjects.courseId, chapters.courseId))
      .where(and(eq(topics.id, topicId), eq(subjects.id, subjectId)));
    if (!row) throw new BadRequestException("That topic is not in this subject's syllabus");
  }
}
