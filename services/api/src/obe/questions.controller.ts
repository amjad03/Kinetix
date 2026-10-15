import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal, TEACHING_ROLES } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { looksLikeXlsx, readXlsx, writeWorkbook } from '../common/xlsx.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { rubrics } from '../db/schema-g1.js';
import { assessmentQuestionCos, assessmentQuestions, QUESTION_DIFFICULTY, questionMarks, type QuestionDifficulty } from '../db/schema-obe-flagship.js';
import { assessmentCoMap, assessments, coSets, courseOutcomes, examPapers, examSessions, marks, qbPaperItems, qbPapers, schemeComponents, sections, students, subjects } from '../db/schema.js';
import { headsSubject } from '../departments/departments.controller.js';
import { isSchoolAdmin, TeacherService } from '../teacher/teacher.service.js';
import { blueprintShares, round } from './attainment.js';
import { bloomNumber, BLOOM_LEVELS } from './bloom.js';
import { ObeService } from './obe.service.js';
import { marksSheetRows, parseMarksSheet } from './question-sheet.js';

const STAFF: RoleName[] = [...TEACHING_ROLES, 'tenant_admin', 'quality_officer', 'exam_controller'];
const MAX_SHEET = 4 * 1024 * 1024;

const QuestionsBody = z.object({
  questions: z
    .array(
      z.object({
        no: z.string().trim().min(1).max(12),
        part: z.string().trim().max(40).default(''),
        maxMarks: z.number().gt(0).max(1000),
        bloomLevel: z.string().trim().max(20).nullish(),
        difficulty: z.enum(QUESTION_DIFFICULTY).nullish(),
        cos: z.array(z.object({ coId: z.uuid(), weight: z.number().gt(0).max(100).default(1) })).max(10).default([]),
      }),
    )
    .max(80),
});
const MarksBody = z.object({
  entries: z
    .array(z.object({ studentId: z.uuid(), absent: z.boolean().default(false), marks: z.record(z.string(), z.number().min(0).nullable()) }))
    .min(1)
    .max(500),
});
const CopyBody = z.object({ fromAssessmentId: z.uuid().optional(), qbPaperId: z.uuid().optional(), rubricId: z.uuid().optional() });

type Asmt = typeof assessments.$inferSelect;

/**
 * Question-wise assessment: an assessment's question paper (questions with maximum marks, Bloom levels, difficulty and the COs each
 * tests), question-wise marks entry (also as an Excel sheet to download and upload) whose sum is the student's mark,
 * and the course's assessments with how complete their tagging and marks are. Results that come as totals only (a
 * university SEE) are shared out to COs by the paper's CO weightage when attainment is computed.
 */
@Controller('v1/obe')
export class ObeQuestionsController {
  constructor(
    private readonly db: DbService,
    private readonly obe: ObeService,
    private readonly teacher: TeacherService,
  ) {}

  /** A course's assessments in a year (every class) with question, tagging and marks completeness. */
  @Get('subjects/:subjectId/assessments')
  @Auth('user', STAFF)
  courseAssessments(@CurrentPrincipal() p: UserPrincipal, @Param('subjectId', ParseUUIDPipe) subjectId: string, @Query('academicYearId', ParseUUIDPipe) academicYearId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [sub] = await tx.select().from(subjects).where(eq(subjects.id, subjectId));
      if (!sub) throw new NotFoundException('Subject not found');
      const rows = await tx
        .select({
          id: assessments.id,
          title: assessments.title,
          kind: assessments.kind,
          maxMarks: assessments.maxMarks,
          heldOn: assessments.heldOn,
          markStatus: assessments.markStatus,
          lockedAt: assessments.lockedAt,
          sectionId: sections.id,
          section: sections.displayName,
          component: schemeComponents.name,
          componentKind: schemeComponents.kind,
          classSize: sql<number>`(select count(*)::int from students s where s.section_id = ${sections.id} and s.status = 'active')`,
          entered: sql<number>`(select count(*)::int from marks m where m.assessment_id = ${assessments.id})`,
          questions: sql<number>`(select count(*)::int from assessment_questions q where q.assessment_id = ${assessments.id})`,
          tagged: sql<number>`(select count(distinct q.id)::int from assessment_questions q join assessment_question_cos c on c.question_id = q.id where q.assessment_id = ${assessments.id})`,
          paperMarks: sql<number>`(select coalesce(sum(q.max_marks), 0)::float from assessment_questions q where q.assessment_id = ${assessments.id})`,
          questionMarked: sql<number>`(select count(distinct qm.student_id)::int from question_marks qm where qm.assessment_id = ${assessments.id} and qm.marks is not null)`,
          shares: sql<number>`(select count(*)::int from assessment_co_map x where x.assessment_id = ${assessments.id})`,
        })
        .from(assessments)
        .innerJoin(sections, eq(sections.id, assessments.sectionId))
        .leftJoin(schemeComponents, eq(schemeComponents.id, assessments.componentId))
        .where(and(eq(assessments.subjectId, subjectId), eq(sections.academicYearId, academicYearId)))
        .orderBy(asc(sections.displayName), asc(assessments.heldOn));
      const visible = [];
      for (const r of rows) if (await this.canSee(tx, p, { sectionId: r.sectionId, subjectId, kind: r.kind } as Asmt)) visible.push(r);
      return visible.map((r) => ({ ...r, evidence: r.kind === 'exam' || r.componentKind === 'external' ? 'see' : 'cie', basis: r.tagged > 0 ? (r.questionMarked > 0 ? 'questions' : 'apportioned') : r.shares > 0 ? 'share' : 'none' }));
    });
  }

  /** The paper, the course's active COs and the class's question-wise marks. */
  @Get('assessments/:id/questions')
  @Auth('user', STAFF)
  paper(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const a = await this.load(tx, id);
      if (!(await this.canSee(tx, p, a))) throw new ForbiddenException('You do not teach this class');
      return this.paperData(tx, p, a);
    });
  }

  /**
   * Sets the question paper. Once question-wise marks are entered, the questions and their maximum marks stay as they
   * are, but their COs and Bloom levels can still be changed.
   */
  @Put('assessments/:id/questions')
  @Auth('user', STAFF)
  savePaper(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(QuestionsBody)) body: z.infer<typeof QuestionsBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const a = await this.load(tx, id);
      if (!(await this.canTag(tx, p, a))) throw new ForbiddenException('You do not teach this class');
      const nos = body.questions.map((q) => q.no.toLowerCase());
      if (new Set(nos).size !== nos.length) throw new BadRequestException('Two questions have the same number');
      for (const q of body.questions) if (q.bloomLevel && bloomNumber(q.bloomLevel) === null) throw new BadRequestException(`Q${q.no}: the Bloom level must be one of ${BLOOM_LEVELS.join(', ')}`);
      const total = body.questions.reduce((s, q) => s + q.maxMarks, 0);
      if (body.questions.length && total + 1e-9 < a.maxMarks) throw new BadRequestException(`The questions add up to ${round(total, 2)} marks; the paper is out of ${a.maxMarks}`);
      const valid = new Set((await this.activeCos(tx, a.subjectId)).map((c) => c.id));
      if (body.questions.some((q) => q.cos.some((c) => !valid.has(c.coId)))) throw new BadRequestException('Tag questions with the course’s current course outcomes');
      const existing = await tx.select().from(assessmentQuestions).where(eq(assessmentQuestions.assessmentId, id)).orderBy(asc(assessmentQuestions.ord));
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(questionMarks).where(and(eq(questionMarks.assessmentId, id), sql`${questionMarks.marks} is not null`));
      const sameShape = existing.length === body.questions.length && existing.every((q) => body.questions.some((b) => b.no.toLowerCase() === q.no.toLowerCase() && Math.abs(b.maxMarks - q.maxMarks) < 1e-9));
      if (n > 0 && !sameShape) throw new ConflictException('Question-wise marks are entered; you can still change the COs and Bloom levels, but not the questions or their marks');
      let rows: (typeof assessmentQuestions.$inferSelect)[];
      if (sameShape && existing.length) {
        rows = [];
        for (const [i, b] of body.questions.entries()) {
          const q = existing.find((x) => x.no.toLowerCase() === b.no.toLowerCase())!;
          const [u] = await tx.update(assessmentQuestions).set({ part: b.part, bloomLevel: b.bloomLevel ?? null, difficulty: b.difficulty ?? null, ord: i, no: b.no }).where(eq(assessmentQuestions.id, q.id)).returning();
          rows.push(u);
        }
        await tx.delete(assessmentQuestionCos).where(inArray(assessmentQuestionCos.questionId, existing.map((q) => q.id)));
      } else {
        await tx.delete(assessmentQuestions).where(eq(assessmentQuestions.assessmentId, id));
        rows = body.questions.length ? await tx.insert(assessmentQuestions).values(body.questions.map((q, i) => ({ tenantId: p.tenantId, assessmentId: id, no: q.no, part: q.part, maxMarks: q.maxMarks, bloomLevel: q.bloomLevel ?? null, difficulty: q.difficulty ?? null, ord: i }))).returning() : [];
      }
      const tags = body.questions.flatMap((b) => {
        const q = rows.find((r) => r.no.toLowerCase() === b.no.toLowerCase())!;
        return [...new Map(b.cos.map((c) => [c.coId, c])).values()].map((c) => ({ tenantId: p.tenantId, questionId: q.id, coId: c.coId, weight: c.weight }));
      });
      if (tags.length) await tx.insert(assessmentQuestionCos).values(tags);
      // A tagged paper replaces the assessment's coarse CO shares.
      if (tags.length) await tx.delete(assessmentCoMap).where(eq(assessmentCoMap.assessmentId, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'obe.paper.saved', subjectType: 'assessment', subjectId: id, data: { questions: rows.length, tags: tags.length, total } });
      return this.paperData(tx, p, a);
    });
  }

  /**
   * Copies a paper from another assessment of the course, from a question bank paper (its COs, Bloom levels and marks),
   * or from a marking rubric (each criterion becomes a question worth its top level, for labs, projects and vivas; the
   * teacher then tags the criteria to COs).
   */
  @Post('assessments/:id/questions/copy')
  @HttpCode(200)
  @Auth('user', STAFF)
  copyPaper(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(CopyBody)) body: z.infer<typeof CopyBody>) {
    if ([body.fromAssessmentId, body.qbPaperId, body.rubricId].filter(Boolean).length !== 1) throw new BadRequestException('Copy from one assessment, one question bank paper or one rubric');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const a = await this.load(tx, id);
      if (!(await this.canTag(tx, p, a))) throw new ForbiddenException('You do not teach this class');
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(assessmentQuestions).where(eq(assessmentQuestions.assessmentId, id));
      if (n > 0) throw new ConflictException('This assessment already has a paper; clear it first');
      const cos = await this.activeCos(tx, a.subjectId);
      const byCode = new Map(cos.map((c) => [c.code, c.id]));
      let src: { no: string; part: string; maxMarks: number; bloomLevel: string | null; difficulty: QuestionDifficulty | null; cos: { coId: string; weight: number }[] }[] = [];
      if (body.fromAssessmentId) {
        const [from] = await tx.select().from(assessments).where(eq(assessments.id, body.fromAssessmentId));
        if (!from || from.subjectId !== a.subjectId) throw new BadRequestException('Copy from an assessment of the same course');
        const qs = await tx.select().from(assessmentQuestions).where(eq(assessmentQuestions.assessmentId, from.id)).orderBy(asc(assessmentQuestions.ord));
        const tags = qs.length ? await tx.select({ questionId: assessmentQuestionCos.questionId, weight: assessmentQuestionCos.weight, code: courseOutcomes.code }).from(assessmentQuestionCos).innerJoin(courseOutcomes, eq(courseOutcomes.id, assessmentQuestionCos.coId)).where(inArray(assessmentQuestionCos.questionId, qs.map((q) => q.id))) : [];
        src = qs.map((q) => ({ no: q.no, part: q.part, maxMarks: q.maxMarks, bloomLevel: q.bloomLevel, difficulty: q.difficulty, cos: tags.filter((t) => t.questionId === q.id && byCode.has(t.code)).map((t) => ({ coId: byCode.get(t.code)!, weight: t.weight })) }));
      } else if (body.rubricId) {
        const [rubric] = await tx.select().from(rubrics).where(eq(rubrics.id, body.rubricId));
        if (!rubric || rubric.archived) throw new BadRequestException('Choose a rubric in use');
        src = rubric.criteria.map((c, i) => ({ no: `R${i + 1}`, part: c.name.slice(0, 40), maxMarks: Math.max(0, ...c.levels.map((l) => Number(l.points) || 0)), bloomLevel: null, difficulty: null, cos: [] })).filter((q) => q.maxMarks > 0);
      } else {
        const [paper] = await tx.select().from(qbPapers).where(eq(qbPapers.id, body.qbPaperId!));
        if (!paper || paper.subjectId !== a.subjectId) throw new BadRequestException('Copy from a question bank paper of the same course');
        const items = await tx.select().from(qbPaperItems).where(eq(qbPaperItems.paperId, paper.id)).orderBy(asc(qbPaperItems.section), asc(qbPaperItems.position));
        const parts = ['Part A', 'Part B', 'Part C', 'Part D', 'Part E'];
        src = items.map((it, i) => {
          const snap = it.snapshot as { coId?: string | null; coCode?: string | null; bloom?: string | null; difficulty?: string | null };
          const coId = snap.coCode && byCode.has(snap.coCode) ? byCode.get(snap.coCode)! : snap.coId && cos.some((c) => c.id === snap.coId) ? snap.coId : null;
          const lvl = snap.bloom ? bloomNumber(snap.bloom) : null;
          const difficulty = (QUESTION_DIFFICULTY as readonly string[]).includes(snap.difficulty ?? '') ? (snap.difficulty as QuestionDifficulty) : null;
          return { no: String(i + 1), part: parts[it.section] ?? '', maxMarks: it.marks, bloomLevel: lvl ? BLOOM_LEVELS[lvl - 1] : null, difficulty, cos: coId ? [{ coId, weight: 1 }] : [] };
        });
      }
      if (!src.length) throw new BadRequestException('That paper has no questions');
      const rows = await tx.insert(assessmentQuestions).values(src.map((q, i) => ({ tenantId: p.tenantId, assessmentId: id, no: q.no, part: q.part, maxMarks: q.maxMarks, bloomLevel: q.bloomLevel, difficulty: q.difficulty, ord: i }))).returning();
      const tags = src.flatMap((q, i) => q.cos.map((c) => ({ tenantId: p.tenantId, questionId: rows[i].id, coId: c.coId, weight: c.weight })));
      if (tags.length) await tx.insert(assessmentQuestionCos).values(tags);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'obe.paper.copied', subjectType: 'assessment', subjectId: id, data: { from: body.fromAssessmentId ?? body.qbPaperId ?? body.rubricId, questions: rows.length } });
      return this.paperData(tx, p, a);
    });
  }

  /** Saves question-wise marks; each student's mark for the assessment becomes the sum of their question marks. */
  @Put('assessments/:id/question-marks')
  @Auth('user', STAFF)
  saveMarks(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(MarksBody)) body: z.infer<typeof MarksBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const a = await this.load(tx, id);
      await this.assertMarksEditor(tx, p, a);
      await this.write(tx, p, a, body.entries);
      return this.paperData(tx, p, a);
    });
  }

  /** The marks sheet to fill in Excel: one row per student, one column per question, with any marks already entered. */
  @Get('assessments/:id/question-marks.xlsx')
  @Auth('user', STAFF)
  async sheet(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { file, name } = await this.db.withTenant(p.tenantId, async (tx) => {
      const a = await this.load(tx, id);
      if (!(await this.canSee(tx, p, a))) throw new ForbiddenException('You do not teach this class');
      const d = await this.paperData(tx, p, a);
      if (!d.questions.length) throw new ConflictException('Set the question paper first');
      const cos = new Map(d.cos.map((c) => [c.id, c.code]));
      const rows = marksSheetRows(d.questions, d.students.map((s) => ({ id: s.id, rollNo: s.rollNo, name: s.name, absent: s.absent, marks: s.marks })));
      const file = writeWorkbook([
        { name: 'Marks', header: true, rows, widths: [12, 28, 12, ...d.questions.map(() => 10), 10], lists: [{ column: 2, source: 'Lists!$A$2:$A$3', untilRow: rows.length + 5, prompt: 'Y when the student was absent' }] },
        { name: 'Paper', header: true, rows: [['Question', 'Part', 'Max marks', 'COs', 'Bloom level', 'Difficulty'], ...d.questions.map((q) => [q.no, q.part, q.maxMarks, q.cos.map((c) => cos.get(c.coId) ?? '').join(', '), q.bloomLevel ?? '', q.difficulty ?? ''])], widths: [10, 12, 12, 20, 14, 12] },
        { name: 'How to fill', rows: [['Enter each student’s marks for each question; leave a cell blank when the question was not answered.'], ['Put Y in "Absent" for a student who missed the assessment; their marks are ignored.'], ['Do not change the roll numbers or the question headers. The total is worked out when you upload.'], [`Assessment: ${a.title}, out of ${a.maxMarks}`]], widths: [100] },
        { name: 'Lists', hidden: true, rows: [['Absent'], ['Y'], ['N']] },
      ]);
      return { file, name: `${a.title.replace(/[^\w.-]+/g, '-').slice(0, 60)}-question-marks.xlsx` };
    });
    res.setHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('content-disposition', `attachment; filename="${name}"`);
    res.end(file);
  }

  /** Reads a filled marks sheet. With `check=true` nothing is saved; otherwise the sheet is saved only when it has no errors. */
  @Post('assessments/:id/question-marks.xlsx')
  @HttpCode(200)
  @Auth('user', STAFF)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_SHEET, files: 1 } }))
  upload(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: { buffer: Buffer }, @Query('check') check?: string) {
    if (!file?.buffer?.length) throw new BadRequestException('Choose the marks sheet');
    if (!looksLikeXlsx(file.buffer)) throw new BadRequestException('Upload the Excel (.xlsx) marks sheet');
    let rows: string[][];
    try {
      rows = readXlsx(file.buffer);
    } catch {
      throw new BadRequestException('The file could not be read as an Excel sheet');
    }
    return this.db.withTenant(p.tenantId, async (tx) => {
      const a = await this.load(tx, id);
      await this.assertMarksEditor(tx, p, a);
      const qs = await tx.select().from(assessmentQuestions).where(eq(assessmentQuestions.assessmentId, id)).orderBy(asc(assessmentQuestions.ord));
      const roster = await tx.select({ id: students.id, rollNo: students.rollNo, name: students.fullName }).from(students).where(and(eq(students.sectionId, a.sectionId), eq(students.status, 'active')));
      const { entries, errors } = parseMarksSheet(rows, qs.map((q) => ({ id: q.id, no: q.no, maxMarks: q.maxMarks })), roster);
      for (const e of entries) {
        const sum = Object.values(e.marks).reduce<number>((s, v) => s + (v ?? 0), 0);
        if (!e.absent && sum > a.maxMarks + 1e-9) errors.push({ row: 0, message: `${roster.find((r) => r.id === e.studentId)?.rollNo}: total ${round(sum, 2)} is more than ${a.maxMarks}` });
      }
      if (errors.length || check === 'true') return { saved: false, rows: entries.length, errors };
      if (entries.length) await this.write(tx, p, a, entries);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'obe.marks.imported', subjectType: 'assessment', subjectId: id, data: { rows: entries.length } });
      return { saved: true, rows: entries.length, errors };
    });
  }

  private async write(tx: Tx, p: UserPrincipal, a: Asmt, entries: { studentId: string; absent: boolean; marks: Record<string, number | null> }[]) {
    const qs = await tx.select().from(assessmentQuestions).where(eq(assessmentQuestions.assessmentId, a.id));
    if (!qs.length) throw new ConflictException('Set the question paper first');
    const byId = new Map(qs.map((q) => [q.id, q]));
    const ids = [...new Set(entries.map((e) => e.studentId))];
    const inClass = await tx.select({ id: students.id }).from(students).where(and(inArray(students.id, ids), eq(students.sectionId, a.sectionId)));
    if (inClass.length !== ids.length) throw new BadRequestException('Some students are not in this class');
    for (const e of entries) {
      for (const [qid, v] of Object.entries(e.marks)) {
        const q = byId.get(qid);
        if (!q) throw new BadRequestException('A mark is for a question of another paper');
        if (v !== null && v > q.maxMarks + 1e-9) throw new BadRequestException(`Q${q.no} is out of ${q.maxMarks}`);
      }
      const values = e.absent ? [] : Object.entries(e.marks);
      const sum = values.reduce<number>((s, [, v]) => s + (v ?? 0), 0);
      if (sum > a.maxMarks + 1e-9) throw new BadRequestException(`A total of ${round(sum, 2)} is more than the ${a.maxMarks} the assessment is out of`);
      if (e.absent) await tx.delete(questionMarks).where(and(eq(questionMarks.assessmentId, a.id), eq(questionMarks.studentId, e.studentId)));
      for (const [qid, v] of values)
        await tx
          .insert(questionMarks)
          .values({ tenantId: p.tenantId, assessmentId: a.id, questionId: qid, studentId: e.studentId, marks: v, updatedBy: p.userId })
          .onConflictDoUpdate({ target: [questionMarks.questionId, questionMarks.studentId], set: { marks: v, updatedBy: p.userId, updatedAt: new Date() } });
      const all = e.absent ? [] : await tx.select({ m: questionMarks.marks }).from(questionMarks).where(and(eq(questionMarks.assessmentId, a.id), eq(questionMarks.studentId, e.studentId)));
      const any = all.some((r) => r.m !== null);
      const total = any ? round(all.reduce((s, r) => s + (r.m ?? 0), 0), 2) : null;
      if (!e.absent && !any) {
        await tx.delete(marks).where(and(eq(marks.assessmentId, a.id), eq(marks.studentId, e.studentId)));
        continue;
      }
      const v = { marks: e.absent ? null : total, absent: e.absent, updatedAt: new Date() };
      await tx.insert(marks).values({ tenantId: p.tenantId, assessmentId: a.id, studentId: e.studentId, ...v }).onConflictDoUpdate({ target: [marks.assessmentId, marks.studentId], set: v });
    }
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'marks.entered', subjectType: 'assessment', subjectId: a.id, data: { students: ids.length, questionWise: true } });
  }

  private async paperData(tx: Tx, p: UserPrincipal, a: Asmt) {
    const qs = await tx.select().from(assessmentQuestions).where(eq(assessmentQuestions.assessmentId, a.id)).orderBy(asc(assessmentQuestions.ord));
    const tags = qs.length ? await tx.select().from(assessmentQuestionCos).where(inArray(assessmentQuestionCos.questionId, qs.map((q) => q.id))) : [];
    const cos = await this.activeCos(tx, a.subjectId);
    const roster = await tx
      .select({ id: students.id, rollNo: students.rollNo, name: students.fullName, total: sql<number | null>`coalesce(${marks.moderatedMarks}, ${marks.marks})::float`, absent: marks.absent })
      .from(students)
      .leftJoin(marks, and(eq(marks.studentId, students.id), eq(marks.assessmentId, a.id)))
      .where(and(eq(students.sectionId, a.sectionId), eq(students.status, 'active')))
      .orderBy(asc(students.rollNo));
    const qm = qs.length ? await tx.select({ questionId: questionMarks.questionId, studentId: questionMarks.studentId, marks: questionMarks.marks }).from(questionMarks).where(eq(questionMarks.assessmentId, a.id)) : [];
    const [sub] = await tx.select({ code: subjects.code, name: subjects.name, programId: subjects.programId }).from(subjects).where(eq(subjects.id, a.subjectId));
    const [sec] = await tx.select({ name: sections.displayName, yearId: sections.academicYearId }).from(sections).where(eq(sections.id, a.sectionId));
    const [comp] = a.componentId ? await tx.select({ kind: schemeComponents.kind, name: schemeComponents.name }).from(schemeComponents).where(eq(schemeComponents.id, a.componentId)) : [];
    const config = (await this.obe.policy(tx, sub.programId, a.subjectId, sec.yearId)).config;
    const questions = qs.map((q) => ({ id: q.id, no: q.no, part: q.part, maxMarks: q.maxMarks, bloomLevel: q.bloomLevel, difficulty: q.difficulty, cos: tags.filter((t) => t.questionId === q.id).map((t) => ({ coId: t.coId, weight: t.weight })) }));
    const shares = blueprintShares(questions, config.seeApportion);
    const coMarks = cos.map((c) => ({ coId: c.id, code: c.code, marks: round(questions.reduce((s, q) => { const w = q.cos.reduce((x, y) => x + y.weight, 0); const mine = q.cos.find((x) => x.coId === c.id); return s + (mine && w ? (q.maxMarks * mine.weight) / w : 0); }, 0), 2), share: round((shares.get(c.id) ?? 0) * 100, 1) }));
    const bloom = BLOOM_LEVELS.map((name, i) => ({ level: i + 1, name, marks: round(questions.filter((q) => bloomNumber(q.bloomLevel) === i + 1).reduce((s, q) => s + q.maxMarks, 0), 2) }));
    const difficulty = QUESTION_DIFFICULTY.map((level) => ({ level, marks: round(questions.filter((q) => q.difficulty === level).reduce((s, q) => s + q.maxMarks, 0), 2) }));
    return {
      assessment: { id: a.id, title: a.title, kind: a.kind, maxMarks: a.maxMarks, heldOn: a.heldOn, markStatus: a.markStatus, locked: !!a.lockedAt, sectionId: a.sectionId, section: sec?.name ?? '', subjectId: a.subjectId, subject: sub ? `${sub.code} ${sub.name}` : '', component: comp?.name ?? null, evidence: a.kind === 'exam' || comp?.kind === 'external' ? 'see' : 'cie' },
      editable: await this.editable(tx, p, a),
      canTag: await this.canTag(tx, p, a),
      apportion: config.seeApportion,
      cos: cos.map((c) => ({ id: c.id, code: c.code, statement: c.statement, bloomLevel: c.bloomLevel })),
      questions,
      paperMarks: round(questions.reduce((s, q) => s + q.maxMarks, 0), 2),
      coMarks,
      bloom,
      difficulty,
      students: roster.map((r) => {
        const mine = qm.filter((m) => m.studentId === r.id);
        return { id: r.id, rollNo: r.rollNo, name: r.name, absent: r.absent ?? false, total: r.total, marks: Object.fromEntries(mine.map((m) => [m.questionId, m.marks])) as Record<string, number | null>, questionWise: mine.some((m) => m.marks !== null) };
      }),
    };
  }

  private async activeCos(tx: Tx, subjectId: string) {
    return tx.select({ id: courseOutcomes.id, code: courseOutcomes.code, statement: courseOutcomes.statement, bloomLevel: courseOutcomes.bloomLevel }).from(courseOutcomes).innerJoin(coSets, eq(coSets.id, courseOutcomes.coSetId)).where(and(eq(coSets.subjectId, subjectId), eq(coSets.status, 'active'))).orderBy(asc(courseOutcomes.ord), asc(courseOutcomes.code));
  }

  private async load(tx: Tx, id: string): Promise<Asmt> {
    const [a] = await tx.select().from(assessments).where(eq(assessments.id, id));
    if (!a) throw new NotFoundException('Assessment not found');
    return a;
  }

  private async canSee(tx: Tx, p: UserPrincipal, a: Asmt) {
    return isSchoolAdmin(p) || p.roles.includes('quality_officer') || (p.roles.includes('exam_controller') && a.kind === 'exam') || (await headsSubject(tx, p, a.subjectId)) || (await this.teacher.teachesSection(tx, p.userId, a.sectionId));
  }

  /** Tags and papers: the class's teacher, the head of department, leaders and the IQAC; the exam office for exams. */
  private async canTag(tx: Tx, p: UserPrincipal, a: Asmt) {
    return this.canSee(tx, p, a);
  }

  /** Marks: the class's teacher and leaders (the exam office for exams), while the marks are in draft and not locked. */
  private async canEnter(tx: Tx, p: UserPrincipal, a: Asmt) {
    return isSchoolAdmin(p) || (p.roles.includes('exam_controller') && a.kind === 'exam') || (await this.teacher.teachesSection(tx, p.userId, a.sectionId));
  }

  private async editable(tx: Tx, p: UserPrincipal, a: Asmt) {
    if (!(await this.canEnter(tx, p, a)) || a.lockedAt || a.markStatus !== 'draft') return false;
    const [paper] = await tx.select({ status: examSessions.status }).from(examPapers).innerJoin(examSessions, eq(examSessions.id, examPapers.sessionId)).where(eq(examPapers.assessmentId, a.id));
    return !(paper && ['published', 'locked', 'processed'].includes(paper.status));
  }

  private async assertMarksEditor(tx: Tx, p: UserPrincipal, a: Asmt) {
    if (!(await this.canEnter(tx, p, a))) throw new ForbiddenException('You do not teach this class');
    if (a.lockedAt) throw new ConflictException('The marks are locked; ask the head of department to unlock them');
    if (a.markStatus !== 'draft') throw new ConflictException('The marks are submitted; ask the head of department to reopen them');
    if (!(await this.editable(tx, p, a))) throw new ConflictException('Results are already processed for this exam; use revaluation to correct a mark');
  }
}
