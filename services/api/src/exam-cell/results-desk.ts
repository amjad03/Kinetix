import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { DbService } from '../db/db.service.js';
import { ZodBody } from '../common/zod-body.js';
import { assessments, examPapers, examResults, examSessions, marks, resultRevisions, resultRuns, students, subjects, users } from '../db/schema.js';
import { ExamsService } from '../exams/exams.service.js';
import { feedCalendar } from '../scheduling/calendar-feed.js';
import { auditCell, CELL, CELL_READ, loadSession } from './common.js';
import { diffResults } from './exam-cell.logic.js';
import { lastProcessRun, recordRun, restoreResults, reviseResult, shapeOfProcessed, shapeOfStored, storedResults, type StoredResult } from './result-runs.js';

const ReasonBody = z.object({ reason: z.string().trim().min(5).max(500) });
const ChangeBody = z.object({ subjectId: z.uuid(), marks: z.number().min(0).nullable(), absent: z.boolean().default(false), reason: z.string().trim().min(5).max(500) });

/**
 * Result processing with a dry run, a freeze and a rollback; unpublishing before the lock; and versioned changes to a
 * published result (a grade change or a correction to an older term recalculates the CGPA of later terms).
 */
@Controller('v1/exam-sessions/:id')
export class ResultsDeskController {
  constructor(
    private readonly db: DbService,
    private readonly exams: ExamsService,
  ) {}

  /** What processing would give now, against what is stored: nothing is saved but the run itself. */
  @Post('dry-run')
  @HttpCode(200)
  @Auth('user', CELL)
  dryRun(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await loadSession(tx, id);
      if (s.status === 'draft') throw new ConflictException('Schedule the session first');
      const problems = await this.exams.blockers(tx, s);
      const before = await storedResults(tx, id);
      let changes: ReturnType<typeof diffResults> = [];
      let students_ = 0;
      let passed = 0;
      if (problems.length === 0) {
        const after = await this.exams.compute(tx, s);
        changes = diffResults(before.map(shapeOfStored), after.map(shapeOfProcessed));
        students_ = after.length;
        passed = after.filter((r) => r.outcome === 'pass').length;
      }
      const names = await this.names(tx, changes.map((c) => c.studentId));
      const codes = await this.codes(tx, changes.flatMap((c) => c.subjects.map((x) => x.subjectId)));
      const summary = { problems, students: students_, passed, failed: students_ - passed, changed: changes.length };
      const run = await recordRun(tx, p.tenantId, id, 'dry_run', p.userId, summary);
      return { runId: run.id, ...summary, changes: changes.slice(0, 500).map((c) => ({ ...c, ...names.get(c.studentId), subjects: c.subjects.map((x) => ({ ...x, code: codes.get(x.subjectId) ?? '' })) })) };
    });
  }

  /** Freezes processed results: no reprocessing until unfrozen. Publishing freezes them too. */
  @Post('freeze')
  @HttpCode(200)
  @Auth('user', CELL)
  freeze(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await loadSession(tx, id);
      if (s.status !== 'processed') throw new ConflictException('Only processed results can be frozen');
      if (s.frozenAt) throw new ConflictException('The results are already frozen');
      await tx.update(examSessions).set({ frozenAt: new Date(), frozenBy: p.userId }).where(eq(examSessions.id, id));
      await recordRun(tx, p.tenantId, id, 'freeze', p.userId, {});
      await auditCell(tx, p, 'exam.results.frozen', 'exam_session', id);
      return { frozen: true };
    });
  }

  @Post('unfreeze')
  @HttpCode(200)
  @Auth('user', CELL)
  unfreeze(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ReasonBody)) b: z.infer<typeof ReasonBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await loadSession(tx, id);
      if (s.status !== 'processed' || !s.frozenAt) throw new ConflictException('Only frozen, unpublished results can be unfrozen');
      await tx.update(examSessions).set({ frozenAt: null, frozenBy: null, approvedAt: null, approvedBy: null }).where(eq(examSessions.id, id));
      await recordRun(tx, p.tenantId, id, 'unfreeze', p.userId, {}, null, b.reason);
      await auditCell(tx, p, 'exam.results.unfrozen', 'exam_session', id, { data: { reason: b.reason } });
      return { frozen: false };
    });
  }

  /**
   * Undoes the last processing: the results stored before it come back (none, if it was the first, which returns the
   * session to scheduled). Frozen or published results must be unfrozen or unpublished first.
   */
  @Post('rollback')
  @HttpCode(200)
  @Auth('user', CELL)
  rollback(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ReasonBody)) b: z.infer<typeof ReasonBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await loadSession(tx, id);
      if (s.status !== 'processed') throw new ConflictException(s.status === 'published' ? 'Unpublish the results before rolling back' : 'There is no processing to roll back');
      if (s.frozenAt) throw new ConflictException('Unfreeze the results before rolling back');
      const run = await lastProcessRun(tx, id);
      if (!run) throw new ConflictException('There is no processing to roll back');
      const snapshot = (run.snapshot ?? []) as StoredResult[];
      const current = await storedResults(tx, id);
      await restoreResults(tx, p.tenantId, id, snapshot);
      await tx.update(resultRuns).set({ summary: sql`${resultRuns.summary} || '{"rolledBack": true}'::jsonb` }).where(eq(resultRuns.id, run.id));
      if (snapshot.length === 0) await tx.update(examSessions).set({ status: 'scheduled', processedAt: null, approvalRequestedAt: null, approvalRequestedBy: null, approvedAt: null, approvedBy: null }).where(eq(examSessions.id, id));
      await recordRun(tx, p.tenantId, id, 'rollback', p.userId, { restored: snapshot.length, removed: current.length, of: run.id }, current, b.reason);
      await auditCell(tx, p, 'exam.results.rolled_back', 'exam_session', id, { data: { reason: b.reason, restored: snapshot.length } });
      return { restored: snapshot.length, status: snapshot.length === 0 ? 'scheduled' : 'processed' };
    });
  }

  /** Takes published results back before they are locked (a wrong publication); they return to processed and frozen. */
  @Post('unpublish')
  @HttpCode(200)
  @Auth('user', ['tenant_admin', 'principal'])
  unpublish(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ReasonBody)) b: z.infer<typeof ReasonBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await loadSession(tx, id);
      if (s.status !== 'published') throw new ConflictException(s.status === 'locked' ? 'Locked results cannot be unpublished; correct a result instead' : 'The results are not published');
      await tx.update(examSessions).set({ status: 'processed', publishedAt: null }).where(eq(examSessions.id, id));
      const papers = await tx.select({ assessmentId: examPapers.assessmentId }).from(examPapers).where(eq(examPapers.sessionId, id));
      const aIds = papers.map((x) => x.assessmentId).filter((x): x is string => !!x);
      if (aIds.length) await tx.update(assessments).set({ publishedAt: null }).where(inArray(assessments.id, aIds));
      await feedCalendar(tx, p.tenantId, p.userId);
      await recordRun(tx, p.tenantId, id, 'unpublish', p.userId, {}, null, b.reason);
      await auditCell(tx, p, 'exam.results.unpublished', 'exam_session', id, { data: { reason: b.reason } });
      return { status: 'processed' };
    });
  }

  @Get('runs')
  @Auth('user', CELL_READ)
  runs(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await loadSession(tx, id);
      return tx
        .select({ id: resultRuns.id, kind: resultRuns.kind, summary: resultRuns.summary, note: resultRuns.note, by: users.fullName, at: resultRuns.createdAt })
        .from(resultRuns)
        .leftJoin(users, eq(users.id, resultRuns.createdBy))
        .where(eq(resultRuns.sessionId, id))
        .orderBy(desc(resultRuns.createdAt))
        .limit(100);
    });
  }

  /** Changes a candidate's external marks in a published or locked session (with a reason) and re-grades: versioned. */
  @Post('results/:studentId/change')
  @HttpCode(200)
  @Auth('user', CELL)
  change(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('studentId', ParseUUIDPipe) studentId: string, @Body(new ZodBody(ChangeBody)) b: z.infer<typeof ChangeBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await loadSession(tx, id);
      if (s.status !== 'published' && s.status !== 'locked') throw new ConflictException('Correct marks before publication through the marks themselves, then process again');
      const [res] = await tx.select({ id: examResults.id }).from(examResults).where(and(eq(examResults.sessionId, id), eq(examResults.studentId, studentId)));
      if (!res) throw new NotFoundException('The student has no result in this session');
      if (!b.absent && b.marks === null) throw new BadRequestException('Give the marks or mark the candidate absent');
      const [st] = await tx.select({ sectionId: students.sectionId }).from(students).where(eq(students.id, studentId));
      const papers = await tx.select().from(examPapers).where(and(eq(examPapers.sessionId, id), eq(examPapers.subjectId, b.subjectId)));
      const paper = papers.find((x) => x.sectionId === st.sectionId) ?? papers[0];
      if (!paper?.assessmentId) throw new NotFoundException('No paper for that subject in this session');
      if (b.marks !== null && b.marks > paper.maxMarks) throw new BadRequestException(`Marks cannot be more than ${paper.maxMarks}`);
      const [old] = await tx.select().from(marks).where(and(eq(marks.assessmentId, paper.assessmentId), eq(marks.studentId, studentId)));
      const value = { marks: b.absent ? null : b.marks, absent: b.absent, moderatedMarks: null, code: null, remark: 'Result correction', updatedAt: new Date() };
      await tx.insert(marks).values({ tenantId: p.tenantId, assessmentId: paper.assessmentId, studentId, ...value }).onConflictDoUpdate({ target: [marks.assessmentId, marks.studentId], set: value });
      const rev = await reviseResult(tx, this.exams, p.tenantId, p.userId, s, studentId, 'grade_change', b.reason);
      await auditCell(tx, p, 'exam.result.changed', 'exam_session', id, { data: { studentId, subjectId: b.subjectId, from: old?.moderatedMarks ?? old?.marks ?? null, to: b.marks, reason: b.reason, version: rev.version, laterTerms: rev.later } });
      return { version: rev.version, laterTerms: rev.later, sgpa: rev.result?.sgpa ?? null, cgpa: rev.result?.cgpa ?? null };
    });
  }

  /** Every version of a candidate's result in the session, newest first. */
  @Get('results/:studentId/revisions')
  @Auth('user', CELL_READ)
  revisions(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ id: resultRevisions.id, version: resultRevisions.version, kind: resultRevisions.kind, reason: resultRevisions.reason, before: resultRevisions.before, after: resultRevisions.after, by: users.fullName, at: resultRevisions.createdAt })
        .from(resultRevisions)
        .leftJoin(users, eq(users.id, resultRevisions.createdBy))
        .where(and(eq(resultRevisions.sessionId, id), eq(resultRevisions.studentId, studentId)))
        .orderBy(desc(resultRevisions.version)),
    );
  }

  /** All changes to the session's published results. */
  @Get('revisions')
  @Auth('user', CELL_READ)
  allRevisions(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ id: resultRevisions.id, studentId: resultRevisions.studentId, rollNo: students.rollNo, name: students.fullName, version: resultRevisions.version, kind: resultRevisions.kind, reason: resultRevisions.reason, sgpaBefore: sql<number | null>`(${resultRevisions.before} ->> 'sgpa')::numeric`, sgpaAfter: sql<number | null>`(${resultRevisions.after} ->> 'sgpa')::numeric`, by: users.fullName, at: resultRevisions.createdAt })
        .from(resultRevisions)
        .innerJoin(students, eq(students.id, resultRevisions.studentId))
        .leftJoin(users, eq(users.id, resultRevisions.createdBy))
        .where(eq(resultRevisions.sessionId, id))
        .orderBy(desc(resultRevisions.createdAt))
        .limit(500),
    );
  }

  private async names(tx: Parameters<Parameters<DbService['withTenant']>[1]>[0], ids: string[]) {
    if (!ids.length) return new Map<string, { rollNo: string; name: string }>();
    const rows = await tx.select({ id: students.id, rollNo: students.rollNo, name: students.fullName }).from(students).where(inArray(students.id, ids)).orderBy(asc(students.rollNo));
    return new Map(rows.map((r) => [r.id, { rollNo: r.rollNo, name: r.name }]));
  }

  private async codes(tx: Parameters<Parameters<DbService['withTenant']>[1]>[0], ids: string[]) {
    const uniq = [...new Set(ids)];
    if (!uniq.length) return new Map<string, string>();
    return new Map((await tx.select({ id: subjects.id, code: subjects.code }).from(subjects).where(inArray(subjects.id, uniq))).map((r) => [r.id, r.code]));
  }
}

