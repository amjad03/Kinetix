import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseIntPipe, ParseUUIDPipe, Post, Put, Res, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { Auth, CurrentPrincipal, TEACHING_ROLES } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { assessments, evalAllocations, evalAnnotations, evalConfigs, evalMarks, evalQuestions, evalScripts, examPapers, examSessions, marks, students, subjects, users, type SubmissionFile } from '../db/schema.js';
import { ADMIN } from '../exams/schemes.controller.js';
import { UploadScanService } from '../scanning/upload-scan.js';
import { ObjectStorage } from '../storage/storage.service.js';
import { annotationProblem, differsBeyond, inkShape, MAX_STROKE_POINTS, MAX_STROKES, newDummyNo, pickSecondValuation } from './evaluation.logic.js';
import { nameRevealsStudent, sanitisePage } from './scan-sanitise.js';
import { EvaluationService } from './evaluation.service.js';

const MAX_FILES = 40;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

interface Upload {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const ConfigBody = z.object({
  perExaminerCap: z.number().int().min(1).max(5000),
  secondSharePercent: z.number().int().min(0).max(100),
  thresholdMarks: z.number().min(0).max(1000),
  /** Percent of the first page (from the top) blacked out at upload; 0 turns masking off. */
  maskHeaderPercent: z.number().int().min(0).max(40).optional(),
});
const AnnotationBody = z.object({
  pageIndex: z.number().int().min(0).max(200),
  kind: z.enum(['tick', 'cross', 'comment', 'highlight', 'ink']),
  x: z.number().min(0).max(1).default(0),
  y: z.number().min(0).max(1).default(0),
  strokes: z.array(z.array(z.tuple([z.number(), z.number()])).max(MAX_STROKE_POINTS)).max(MAX_STROKES).optional(),
  w: z.number().min(0).max(1).optional(),
  h: z.number().min(0).max(1).optional(),
  text: z.string().trim().max(500).optional(),
});
const MAX_ANNOTATIONS = 400;
/** Examiners (and the exam cell, who moderate) may read the annotations of a script. */
const EXAMINER: RoleName[] = [...TEACHING_ROLES, 'examiner'];
const QuestionsBody = z.object({ questions: z.array(z.object({ no: z.string().trim().min(1).max(20), maxMarks: z.number().positive().max(1000) })).min(1).max(100) });
const ExaminersBody = z.object({ examinerIds: z.array(z.uuid()).min(1).max(100) });
const MarksBody = z.object({ entries: z.array(z.object({ questionId: z.uuid(), marks: z.number().min(0), comment: z.string().trim().max(500).optional() })).min(1).max(100) });

/**
 * On-screen evaluation, exam cell side: question list, scanned script upload with a dummy number,
 * examiner allocation, second valuation and pushing final marks into the exam marks.
 */
@Controller('v1/evaluation/papers/:paperId')
export class EvaluationAdminController {
  constructor(
    private readonly db: DbService,
    private readonly svc: EvaluationService,
    private readonly scans: UploadScanService,
    private readonly storage: ObjectStorage,
  ) {}

  /** Settings, questions, scripts with their status (and the dummy number) and each examiner's workload. */
  @Get()
  @Auth('user', ADMIN)
  overview(@CurrentPrincipal() p: UserPrincipal, @Param('paperId', ParseUUIDPipe) paperId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const paper = await this.svc.paper(tx, paperId);
      const config = await this.svc.config(tx, p.tenantId, paperId);
      const questions = await this.svc.questions(tx, paperId);
      const scripts = await tx.select({ s: evalScripts, rollNo: students.rollNo }).from(evalScripts).innerJoin(students, eq(students.id, evalScripts.studentId)).where(eq(evalScripts.paperId, paperId)).orderBy(asc(evalScripts.dummyNo));
      const totals = await this.svc.totals(tx, paperId);
      const load = await tx
        .select({ examinerId: evalAllocations.examinerId, name: users.fullName, allocated: sql<number>`count(*)::int`, submitted: sql<number>`count(*) filter (where ${evalAllocations.status} = 'submitted')::int` })
        .from(evalAllocations)
        .innerJoin(users, eq(users.id, evalAllocations.examinerId))
        .where(eq(evalAllocations.paperId, paperId))
        .groupBy(evalAllocations.examinerId, users.fullName);
      return {
        paper: { id: paper.id, maxMarks: paper.maxMarks },
        config,
        questions,
        scripts: scripts.map(({ s, rollNo }) => ({ id: s.id, dummyNo: s.dummyNo, rollNo, status: s.status, pages: s.files.length, secondRequired: s.secondRequired, thirdRequired: s.thirdRequired, totals: totals.get(s.id) ?? {}, finalMarks: s.finalMarks })),
        workload: load,
      };
    });
  }

  @Put('config')
  @Auth('user', ADMIN)
  setConfig(@CurrentPrincipal() p: UserPrincipal, @Param('paperId', ParseUUIDPipe) paperId: string, @Body(new ZodBody(ConfigBody)) body: z.infer<typeof ConfigBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.svc.paper(tx, paperId);
      await this.svc.config(tx, p.tenantId, paperId);
      const [row] = await tx.update(evalConfigs).set(body).where(eq(evalConfigs.paperId, paperId)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'evaluation.config_set', subjectType: 'exam_paper', subjectId: paperId, data: body });
      return row;
    });
  }

  /** The question list; the maximum marks must add up to the paper's maximum. Locked once valuation starts. */
  @Put('questions')
  @Auth('user', ADMIN)
  setQuestions(@CurrentPrincipal() p: UserPrincipal, @Param('paperId', ParseUUIDPipe) paperId: string, @Body(new ZodBody(QuestionsBody)) body: z.infer<typeof QuestionsBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const paper = await this.svc.paper(tx, paperId);
      const sum = Math.round(body.questions.reduce((a, q) => a + q.maxMarks, 0) * 100) / 100;
      if (sum !== paper.maxMarks) throw new BadRequestException(`The questions add up to ${sum} but the paper is out of ${paper.maxMarks}`);
      if (new Set(body.questions.map((q) => q.no)).size !== body.questions.length) throw new BadRequestException('Question numbers must be unique');
      const [started] = await tx.select({ id: evalAllocations.id }).from(evalAllocations).where(eq(evalAllocations.paperId, paperId)).limit(1);
      if (started) throw new ConflictException('Valuation has started; the questions can no longer change');
      await tx.delete(evalQuestions).where(eq(evalQuestions.paperId, paperId));
      const rows = await tx.insert(evalQuestions).values(body.questions.map((q, i) => ({ tenantId: p.tenantId, paperId, no: q.no, maxMarks: q.maxMarks, ord: i }))).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'evaluation.questions_set', subjectType: 'exam_paper', subjectId: paperId, data: { count: rows.length } });
      return rows;
    });
  }

  /** Uploads one student's scanned script (photos or PDFs). The script is stored under a dummy number only. */
  @Post('scripts')
  @Auth('user', ADMIN)
  @UseInterceptors(FilesInterceptor('files', MAX_FILES, { limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES } }))
  async upload(@CurrentPrincipal() p: UserPrincipal, @Param('paperId', ParseUUIDPipe) paperId: string, @Body() body: { rollNo?: unknown }, @UploadedFiles() uploads: Upload[] = []) {
    const rollNo = typeof body?.rollNo === 'string' ? body.rollNo.trim() : '';
    if (!rollNo) throw new BadRequestException('Give the roll number of the student');
    if (uploads.length === 0) throw new BadRequestException('Add the scanned pages');
    for (const f of uploads) if (!FILE_TYPES.includes(f.mimetype)) throw new BadRequestException(`"${f.originalname}" is not a photo or PDF`);

    const ctx = await this.db.withTenant(p.tenantId, async (tx) => {
      const paper = await this.svc.paper(tx, paperId);
      const [st] = await tx.select({ id: students.id, fullName: students.fullName }).from(students).where(and(eq(students.sectionId, paper.sectionId), eq(students.rollNo, rollNo)));
      if (!st) throw new NotFoundException('No student with that roll number sits this paper');
      const [dup] = await tx.select({ id: evalScripts.id }).from(evalScripts).where(and(eq(evalScripts.paperId, paperId), eq(evalScripts.studentId, st.id)));
      if (dup) throw new ConflictException('A script for this student is already uploaded');
      const taken = new Set((await tx.select({ d: evalScripts.dummyNo }).from(evalScripts).where(eq(evalScripts.paperId, paperId))).map((r) => r.d));
      const cfg = await this.svc.config(tx, p.tenantId, paperId);
      return { studentId: st.id, fullName: st.fullName, maskPercent: cfg.maskHeaderPercent, dummyNo: newDummyNo(taken) };
    });

    // Anonymity: a file name must not name the student, metadata is stripped, and the first page's header band can be blacked out.
    for (const f of uploads) {
      const why = nameRevealsStudent(f.originalname, { rollNo, fullName: ctx.fullName });
      if (why) throw new BadRequestException(`"${f.originalname}" gives away ${why}; rename the file before uploading`);
    }
    const clean = uploads.map((f, i) => ({ f, ...sanitisePage(f.buffer, f.mimetype, i === 0, ctx.maskPercent) }));
    for (const f of uploads) await this.scans.assertClean(f.buffer, `"${f.originalname}"`);
    const files: SubmissionFile[] = [];
    for (const [i, { f, buffer }] of clean.entries()) {
      // The key and the name carry no student detail.
      const key = `tenants/${p.tenantId}/evaluation/${paperId}/${ctx.dummyNo}/${i}`;
      await this.storage.put(key, Readable.from(buffer), MAX_FILE_BYTES, f.mimetype);
      files.push({ key, name: `page-${i + 1}`, mime: f.mimetype, bytes: buffer.length });
    }

    return this.db.withTenant(p.tenantId, async (tx) => {
      const [s] = await tx.insert(evalScripts).values({ tenantId: p.tenantId, paperId, studentId: ctx.studentId, dummyNo: ctx.dummyNo, files, headerMasked: clean[0]?.masked ?? false, uploadedBy: p.userId }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'evaluation.script_uploaded', subjectType: 'eval_script', subjectId: s.id, data: { paperId, dummyNo: s.dummyNo, pages: files.length, headerMasked: s.headerMasked } });
      return { id: s.id, dummyNo: s.dummyNo, pages: files.length, headerMasked: s.headerMasked };
    });
  }

  /** The annotations of every valuation of a script, by round, for the exam cell and moderators (read only; examiners are not named). */
  @Get('scripts/:scriptId/annotations')
  @Auth('user', ADMIN)
  scriptAnnotations(@CurrentPrincipal() p: UserPrincipal, @Param('paperId', ParseUUIDPipe) paperId: string, @Param('scriptId', ParseUUIDPipe) scriptId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [s] = await tx.select().from(evalScripts).where(and(eq(evalScripts.id, scriptId), eq(evalScripts.paperId, paperId)));
      if (!s) throw new NotFoundException('Script not found');
      return { dummyNo: s.dummyNo, pages: s.files.length, annotations: await this.svc.annotationsOf(tx, scriptId) };
    });
  }

  /** One page of a script, streamed inline for moderation. Viewing is audited. */
  @Get('scripts/:scriptId/pages/:index')
  @Auth('user', ADMIN)
  async scriptPage(@CurrentPrincipal() p: UserPrincipal, @Param('paperId', ParseUUIDPipe) paperId: string, @Param('scriptId', ParseUUIDPipe) scriptId: string, @Param('index', ParseIntPipe) index: number, @Res() res: Response) {
    const f = await this.db.withTenant(p.tenantId, async (tx) => {
      const [s] = await tx.select().from(evalScripts).where(and(eq(evalScripts.id, scriptId), eq(evalScripts.paperId, paperId)));
      const f = s?.files[index];
      if (!f) throw new NotFoundException('Page not found');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'evaluation.page_viewed', subjectType: 'eval_script', subjectId: scriptId, data: { index } });
      return f;
    });
    const { stream, size } = await this.storage.get(f.key);
    res.setHeader('content-type', f.mime);
    res.setHeader('content-length', size);
    res.setHeader('cache-control', 'private, no-store');
    res.setHeader('content-disposition', 'inline');
    stream.pipe(res);
  }

  /** First valuation for scripts not yet allocated, and third valuation (moderation) for scripts that need it. */
  @Post('allocate')
  @HttpCode(200)
  @Auth('user', ADMIN)
  allocate(@CurrentPrincipal() p: UserPrincipal, @Param('paperId', ParseUUIDPipe) paperId: string, @Body(new ZodBody(ExaminersBody)) body: z.infer<typeof ExaminersBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.svc.paper(tx, paperId);
      const cfg = await this.svc.config(tx, p.tenantId, paperId);
      if ((await this.svc.questions(tx, paperId)).length === 0) throw new ConflictException('Set the question list first');
      await this.svc.assertExaminers(tx, body.examinerIds);
      const scripts = await tx.select().from(evalScripts).where(eq(evalScripts.paperId, paperId)).orderBy(asc(evalScripts.dummyNo));
      const allocs = await tx.select({ scriptId: evalAllocations.scriptId, round: evalAllocations.round }).from(evalAllocations).where(eq(evalAllocations.paperId, paperId));
      const has = (id: string, r: number) => allocs.some((a) => a.scriptId === id && a.round === r);
      const firsts = scripts.filter((s) => !has(s.id, 1)).map((s) => s.id);
      const thirds = scripts.filter((s) => s.thirdRequired && !has(s.id, 3)).map((s) => s.id);
      const first = await this.svc.allocate(tx, p.tenantId, paperId, 1, firsts, body.examinerIds, cfg.perExaminerCap);
      const third = await this.svc.allocate(tx, p.tenantId, paperId, 3, thirds, body.examinerIds, cfg.perExaminerCap);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'evaluation.allocated', subjectType: 'exam_paper', subjectId: paperId, data: { first, third, examiners: body.examinerIds.length } });
      return { first, third };
    });
  }

  /** Picks the configured share of scripts (spread evenly) for a second valuation by a different examiner. Once per paper. */
  @Post('second-valuation')
  @HttpCode(200)
  @Auth('user', ADMIN)
  secondValuation(@CurrentPrincipal() p: UserPrincipal, @Param('paperId', ParseUUIDPipe) paperId: string, @Body(new ZodBody(ExaminersBody)) body: z.infer<typeof ExaminersBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.svc.paper(tx, paperId);
      const cfg = await this.svc.config(tx, p.tenantId, paperId);
      if (cfg.secondPickedAt) throw new ConflictException('Second valuation was already set up for this paper');
      const scripts = await tx.select().from(evalScripts).where(eq(evalScripts.paperId, paperId));
      const totals = await this.svc.totals(tx, paperId);
      if (scripts.length === 0 || scripts.some((s) => totals.get(s.id)?.[1] === undefined)) throw new ConflictException('Every first valuation must be submitted first');
      await this.svc.assertExaminers(tx, body.examinerIds);
      const picked = pickSecondValuation(scripts.map((s) => ({ id: s.id, dummyNo: s.dummyNo })), cfg.secondSharePercent);
      if (picked.length) await tx.update(evalScripts).set({ secondRequired: true }).where(inArray(evalScripts.id, picked));
      const n = await this.svc.allocate(tx, p.tenantId, paperId, 2, picked, body.examinerIds, cfg.perExaminerCap);
      await tx.update(evalConfigs).set({ secondPickedAt: new Date() }).where(eq(evalConfigs.paperId, paperId));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'evaluation.second_valuation_set', subjectType: 'exam_paper', subjectId: paperId, data: { picked: n } });
      return { picked: n };
    });
  }

  /** Pushes the final marks into the paper's exam marks (audited). Needs every valuation in. */
  @Post('finalise')
  @HttpCode(200)
  @Auth('user', ADMIN)
  finalise(@CurrentPrincipal() p: UserPrincipal, @Param('paperId', ParseUUIDPipe) paperId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const paper = await this.svc.paper(tx, paperId);
      const cfg = await this.svc.config(tx, p.tenantId, paperId);
      if (cfg.finalisedAt) throw new ConflictException('The marks were already pushed');
      if (!cfg.secondPickedAt) throw new ConflictException('Set up second valuation first (use a share of 0 to skip it)');
      if (!paper.assessmentId) throw new ConflictException('The paper has no marks entry');
      const scripts = await tx.select().from(evalScripts).where(eq(evalScripts.paperId, paperId));
      const totals = await this.svc.totals(tx, paperId);
      const finals = scripts.map((s) => ({ s, marks: this.svc.finalFor(s, totals.get(s.id)) }));
      const pending = finals.filter((f) => f.marks === null).length;
      if (pending) throw new ConflictException(`${pending} script(s) still need a valuation`);
      for (const { s, marks: m } of finals) {
        await tx
          .insert(marks)
          .values({ tenantId: p.tenantId, assessmentId: paper.assessmentId, studentId: s.studentId, marks: m, absent: false, remark: 'On-screen evaluation' })
          .onConflictDoUpdate({ target: [marks.assessmentId, marks.studentId], set: { marks: m, absent: false, moderatedMarks: null, remark: 'On-screen evaluation', updatedAt: new Date() } });
        await tx.update(evalScripts).set({ finalMarks: m, status: 'finalised' }).where(eq(evalScripts.id, s.id));
        await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'evaluation.marks_pushed', subjectType: 'eval_script', subjectId: s.id, data: { paperId, studentId: s.studentId, marks: m, totals: totals.get(s.id) ?? {} } });
      }
      // Marks changed after any earlier verification, so they are checked again.
      await tx.update(assessments).set({ markStatus: 'submitted', submittedAt: new Date() }).where(eq(assessments.id, paper.assessmentId));
      await tx.update(evalConfigs).set({ finalisedAt: new Date() }).where(eq(evalConfigs.paperId, paperId));
      return { pushed: finals.length };
    });
  }
}

/** On-screen evaluation, examiner side. An examiner sees only their own valuations and never the student or other examiners' marks. */
@Controller('v1/evaluation/allocations')
export class EvaluationExaminerController {
  constructor(
    private readonly db: DbService,
    private readonly svc: EvaluationService,
    private readonly storage: ObjectStorage,
  ) {}

  @Get('mine')
  @Auth('user', EXAMINER)
  mine(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ id: evalAllocations.id, paperId: evalAllocations.paperId, subject: subjects.name, session: examSessions.name, dummyNo: evalScripts.dummyNo, round: evalAllocations.round, status: evalAllocations.status, total: evalAllocations.total })
        .from(evalAllocations)
        .innerJoin(evalScripts, eq(evalScripts.id, evalAllocations.scriptId))
        .innerJoin(examPapers, eq(examPapers.id, evalAllocations.paperId))
        .innerJoin(subjects, eq(subjects.id, examPapers.subjectId))
        .innerJoin(examSessions, eq(examSessions.id, examPapers.sessionId))
        .where(eq(evalAllocations.examinerId, p.userId))
        .orderBy(asc(evalAllocations.status), asc(evalScripts.dummyNo)),
    );
  }

  /** The script (dummy number and page list), the questions with maximum marks, and the examiner's own entries. */
  @Get(':id')
  @Auth('user', EXAMINER)
  one(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { a, s } = await this.own(tx, p, id);
      const questions = await this.svc.questions(tx, a.paperId);
      return {
        id: a.id,
        status: a.status,
        total: a.total,
        dummyNo: s.dummyNo,
        pages: s.files.map((f, i) => ({ index: i, name: f.name, mime: f.mime })),
        questions: questions.map((q) => ({ id: q.id, no: q.no, maxMarks: q.maxMarks })),
        entries: await this.svc.markEntries(tx, a.id),
      };
    });
  }

  /** One scanned page, streamed inline for on-screen reading. */
  @Get(':id/pages/:index')
  @Auth('user', EXAMINER)
  async page(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('index', ParseIntPipe) index: number, @Res() res: Response) {
    const f = await this.db.withTenant(p.tenantId, async (tx) => {
      const { s } = await this.own(tx, p, id);
      const f = s.files[index];
      if (!f) throw new NotFoundException('Page not found');
      return f;
    });
    const { stream, size } = await this.storage.get(f.key);
    res.setHeader('content-type', f.mime);
    res.setHeader('content-length', size);
    res.setHeader('cache-control', 'private, no-store');
    res.setHeader('content-disposition', 'inline');
    stream.pipe(res);
  }

  /** Saves marks and comments per question (can be resumed); marks cannot exceed the question's maximum. */
  @Put(':id/marks')
  @Auth('user', EXAMINER)
  save(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(MarksBody)) body: z.infer<typeof MarksBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { a } = await this.own(tx, p, id);
      if (a.status === 'submitted') throw new ConflictException('This valuation is already submitted');
      const qs = new Map((await this.svc.questions(tx, a.paperId)).map((q) => [q.id, q]));
      for (const e of body.entries) {
        const q = qs.get(e.questionId);
        if (!q) throw new BadRequestException('Unknown question');
        if (e.marks > q.maxMarks) throw new BadRequestException(`Question ${q.no} is out of ${q.maxMarks}`);
      }
      for (const e of body.entries)
        await tx
          .insert(evalMarks)
          .values({ tenantId: p.tenantId, allocationId: id, questionId: e.questionId, marks: e.marks, comment: e.comment ?? null })
          .onConflictDoUpdate({ target: [evalMarks.allocationId, evalMarks.questionId], set: { marks: e.marks, comment: e.comment ?? null } });
      return { entries: await this.svc.markEntries(tx, id) };
    });
  }

  /** Locks the valuation. A second valuation far from the first sends the script to a third valuation. */
  @Post(':id/submit')
  @HttpCode(200)
  @Auth('user', EXAMINER)
  submit(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { a, s } = await this.own(tx, p, id);
      if (a.status === 'submitted') throw new ConflictException('Already submitted');
      const qs = await this.svc.questions(tx, a.paperId);
      const entries = await this.svc.markEntries(tx, id);
      if (qs.some((q) => !entries.some((e) => e.questionId === q.id))) throw new ConflictException('Enter marks for every question (0 where nothing was written)');
      const total = Math.round(entries.reduce((x, e) => x + e.marks, 0) * 100) / 100;
      await tx.update(evalAllocations).set({ status: 'submitted', total, submittedAt: new Date() }).where(eq(evalAllocations.id, id));
      let needsThird = false;
      if (a.round === 2) {
        const [first] = await tx.select({ total: evalAllocations.total }).from(evalAllocations).where(and(eq(evalAllocations.scriptId, s.id), eq(evalAllocations.round, 1)));
        const cfg = await this.svc.config(tx, p.tenantId, a.paperId);
        needsThird = first?.total != null && differsBeyond(first.total, total, cfg.thresholdMarks);
        if (needsThird) await tx.update(evalScripts).set({ thirdRequired: true, status: 'needs_third' }).where(eq(evalScripts.id, s.id));
      }
      if (!needsThird) await tx.update(evalScripts).set({ status: 'valued' }).where(eq(evalScripts.id, s.id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'evaluation.submitted', subjectType: 'eval_allocation', subjectId: id, data: { scriptId: s.id, round: a.round, total, needsThird } });
      return { total, needsThird };
    });
  }

  /**
   * The caller's annotations on this valuation. A third valuer (moderator) also gets those of the earlier
   * rounds, read only and without the examiners' names; earlier valuers see nothing of each other.
   */
  @Get(':id/annotations')
  @Auth('user', EXAMINER)
  annotations(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { a, s } = await this.own(tx, p, id);
      const all = await this.svc.annotationsOf(tx, s.id);
      return {
        mine: all.filter((x) => x.allocationId === id),
        earlier: a.round === 3 ? all.filter((x) => x.round < 3).map(({ examinerName: _n, allocationId: _a, ...rest }) => rest) : [],
      };
    });
  }

  @Post(':id/annotations')
  @Auth('user', EXAMINER)
  addAnnotation(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(AnnotationBody)) b: z.infer<typeof AnnotationBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { a, s } = await this.own(tx, p, id);
      if (a.status === 'submitted') throw new ConflictException('This valuation is already submitted');
      if (b.pageIndex >= s.files.length) throw new BadRequestException('There is no such page');
      const problem = annotationProblem(b);
      if (problem) throw new BadRequestException(problem);
      const [n] = await tx.select({ n: sql<number>`count(*)::int` }).from(evalAnnotations).where(eq(evalAnnotations.allocationId, id));
      if (n.n >= MAX_ANNOTATIONS) throw new ConflictException('Too many marks on this script');
      const flat = b.kind === 'highlight';
      const ink = b.kind === 'ink' ? inkShape(b.strokes!) : null;
      const [row] = await tx
        .insert(evalAnnotations)
        .values({ tenantId: p.tenantId, scriptId: s.id, allocationId: id, pageIndex: b.pageIndex, kind: b.kind, x: ink ? ink.x : b.x, y: ink ? ink.y : b.y, w: ink ? ink.w : flat ? (b.w ?? 0) : 0, h: ink ? ink.h : flat ? (b.h ?? 0) : 0, text: b.kind === 'comment' ? (b.text ?? null) : null, strokes: ink ? ink.strokes : null, createdBy: p.userId })
        .returning();
      return row;
    });
  }

  @Delete(':id/annotations/:annId')
  @Auth('user', EXAMINER)
  removeAnnotation(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('annId', ParseUUIDPipe) annId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { a } = await this.own(tx, p, id);
      if (a.status === 'submitted') throw new ConflictException('This valuation is already submitted');
      const gone = await tx.delete(evalAnnotations).where(and(eq(evalAnnotations.id, annId), eq(evalAnnotations.allocationId, id))).returning({ id: evalAnnotations.id });
      if (gone.length === 0) throw new NotFoundException('Mark not found');
      return { removed: 1 };
    });
  }

  /** The caller's own valuation with its script, or 404 (so other examiners' work is not even confirmed to exist). */
  private async own(tx: Parameters<Parameters<DbService['withTenant']>[1]>[0], p: UserPrincipal, id: string) {
    const [a] = await tx.select().from(evalAllocations).where(and(eq(evalAllocations.id, id), eq(evalAllocations.examinerId, p.userId)));
    if (!a) throw new NotFoundException('Valuation not found');
    const [s] = await tx.select().from(evalScripts).where(eq(evalScripts.id, a.scriptId));
    return { a, s };
  }
}
