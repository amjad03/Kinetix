import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Res, StreamableFile, UnprocessableEntityException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { type BlueprintSection, coSets, courseOutcomes, qbBlueprints, qbPaperItems, qbPapers, qbQuestions, qbQuestionVersions, subjects, tenants, userRoles, users } from '../db/schema.js';
import { examFrequency } from '../ai/past-exams.js';
import { checkVersion, found, hasRole } from '../placements/placements.access.js';
import { BLOOM, blueprintProblems, type Candidate, DIFFICULTY, K_LEVELS, pickSection, QUESTION_TYPES, seeded, typeConfigProblem } from './blueprint.js';
import { qbPaperReleases } from '../db/schema-depth.js';
import { paperPdf } from './paper-pdf.js';
import { releaseState } from './paper-release.controller.js';

/** Anyone who writes or reviews questions. */
const QB_ROLES: RoleName[] = ['tenant_admin', 'principal', 'hod', 'teacher'];
/** Exam staff: see every paper in the institution. A paper's setter and moderator see their own. */
const EXAM_STAFF: RoleName[] = ['tenant_admin', 'principal', 'hod'];
/** Close questions in a subject (pg_trgm similarity) are flagged as duplicates. */
const DUPLICATE = 0.8;

const uuid = z.uuid();
const OptionList = z.array(z.object({ text: z.string().trim().min(1).max(500), correct: z.boolean() })).max(8);
const QuestionFields = {
  unit: z.string().trim().max(120).optional(),
  topic: z.string().trim().min(1).max(200),
  coId: uuid.nullish(),
  bloom: z.enum(BLOOM),
  difficulty: z.enum(DIFFICULTY),
  marks: z.number().int().min(1).max(100),
  type: z.enum(QUESTION_TYPES),
  text: z.string().trim().min(5).max(4000),
  options: OptionList.default([]),
  answer: z.string().trim().max(4000).default(''),
  kLevel: z.enum(K_LEVELS).nullish(),
  competencyTags: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
  skillTags: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
  typeConfig: z
    .object({
      pairs: z.array(z.object({ left: z.string().trim().max(200), right: z.string().trim().max(200) })).max(10).optional(),
      passage: z.string().trim().max(6000).optional(),
      subQuestions: z.array(z.object({ text: z.string().trim().min(1).max(1000), marks: z.number().int().min(1).max(100) })).max(10).optional(),
      labels: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
      imageUrl: z.url().max(500).optional(),
      rubricId: z.uuid().optional(),
    })
    .nullish(),
};
const QuestionBody = z.object({ subjectId: uuid, ...QuestionFields, force: z.boolean().optional() });
const QuestionPatch = z.object({ ...QuestionFields, version: z.number().int().optional(), force: z.boolean().optional() });
const SectionBody = z.object({
  name: z.string().trim().min(1).max(120),
  count: z.number().int().min(1).max(100),
  questionMarks: z.number().int().min(1).max(100),
  type: z.enum(QUESTION_TYPES).optional(),
  bloom: z.partialRecord(z.enum(BLOOM), z.number().int().min(0).max(100)).optional(),
  difficulty: z.partialRecord(z.enum(DIFFICULTY), z.number().int().min(0).max(100)).optional(),
  coverage: z.array(uuid).max(50).optional(),
});
const BlueprintBody = z.object({ subjectId: uuid, title: z.string().trim().min(2).max(200), totalMarks: z.number().int().min(1).max(1000), durationMinutes: z.number().int().min(5).max(600), sections: z.array(SectionBody).min(1).max(12) });
const PaperBody = z.object({ blueprintId: uuid, title: z.string().trim().min(2).max(200), seed: z.string().trim().min(1).max(100).optional(), avoidLast: z.number().int().min(0).max(20).default(3) });

type Question = typeof qbQuestions.$inferSelect;
type Paper = typeof qbPapers.$inferSelect;

/** Question bank and question paper engine: approved questions, blueprints, generated papers, scrutiny and secure release. */
@Controller('v1/question-bank')
export class QuestionBankController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
  ) {}

  // ---- helpers -------------------------------------------------------------------------------

  private snapshot(q: Question, coCode: string | null) {
    return { text: q.text, options: q.options, answer: q.answer, type: q.type, bloom: q.bloom, difficulty: q.difficulty, topic: q.topic, unit: q.unit, coId: q.coId, coCode, marks: q.marks, version: q.version };
  }

  private async coCodes(tx: Tx, ids: (string | null)[]) {
    const want = [...new Set(ids.filter((x): x is string => !!x))];
    if (!want.length) return new Map<string, string>();
    return new Map((await tx.select({ id: courseOutcomes.id, code: courseOutcomes.code }).from(courseOutcomes).where(inArray(courseOutcomes.id, want))).map((r) => [r.id, r.code]));
  }

  private async checkCo(tx: Tx, subjectId: string, coId: string | null | undefined) {
    if (!coId) return;
    const [r] = await tx.select({ id: courseOutcomes.id }).from(courseOutcomes).innerJoin(coSets, eq(coSets.id, courseOutcomes.coSetId)).where(and(eq(courseOutcomes.id, coId), eq(coSets.subjectId, subjectId)));
    if (!r) throw new BadRequestException('That outcome does not belong to this subject');
  }

  private checkOptions(f: { type: string; marks: number; typeConfig?: Parameters<typeof typeConfigProblem>[1]; options: { correct: boolean }[] }) {
    const problem = typeConfigProblem(f.type, f.typeConfig, f.marks);
    if (problem) throw new BadRequestException(problem);
    if (f.type !== 'mcq') return;
    if (f.options.length < 2) throw new BadRequestException('A multiple choice question needs at least two options');
    if (f.options.filter((o) => o.correct).length !== 1) throw new BadRequestException('Mark exactly one option as correct');
  }

  /** Similar questions already in the subject's bank. */
  private async duplicates(tx: Tx, subjectId: string, text: string, exceptId?: string) {
    return tx
      .select({ id: qbQuestions.id, text: qbQuestions.text, status: qbQuestions.status })
      .from(qbQuestions)
      .where(and(eq(qbQuestions.subjectId, subjectId), sql`similarity(${qbQuestions.text}, ${text}) > ${DUPLICATE}`, exceptId ? ne(qbQuestions.id, exceptId) : undefined))
      .limit(5);
  }

  private async usage(tx: Tx, ids: string[]) {
    if (!ids.length) return new Map<string, { count: number; last: Date }>();
    const rows = await tx
      .select({ id: qbPaperItems.questionId, n: sql<number>`count(*)::int`, last: sql<Date>`max(${qbPapers.createdAt})` })
      .from(qbPaperItems)
      .innerJoin(qbPapers, eq(qbPapers.id, qbPaperItems.paperId))
      .where(inArray(qbPaperItems.questionId, ids))
      .groupBy(qbPaperItems.questionId);
    return new Map(rows.map((r) => [r.id, { count: r.n, last: new Date(r.last) }]));
  }

  private async names(tx: Tx, ids: (string | null)[]) {
    const want = [...new Set(ids.filter((x): x is string => !!x))];
    if (!want.length) return new Map<string, string>();
    return new Map((await tx.select({ id: users.id, name: users.fullName }).from(users).where(inArray(users.id, want))).map((u) => [u.id, u.name]));
  }

  // ---- options -------------------------------------------------------------------------------

  /** Subjects with their active outcomes, and staff who can moderate a paper. */
  @Get('options')
  @Auth('user', QB_ROLES)
  options(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const subs = await tx.select({ id: subjects.id, name: subjects.name, code: subjects.code }).from(subjects).orderBy(asc(subjects.name));
      const cos = await tx
        .select({ id: courseOutcomes.id, code: courseOutcomes.code, subjectId: coSets.subjectId })
        .from(courseOutcomes)
        .innerJoin(coSets, eq(coSets.id, courseOutcomes.coSetId))
        .where(eq(coSets.status, 'active'))
        .orderBy(asc(courseOutcomes.ord));
      const staff = await tx
        .selectDistinct({ id: users.id, name: users.fullName })
        .from(users)
        .innerJoin(userRoles, eq(userRoles.userId, users.id))
        .where(inArray(userRoles.role, QB_ROLES))
        .orderBy(asc(users.fullName));
      return { subjects: subs.map((s) => ({ ...s, outcomes: cos.filter((c) => c.subjectId === s.id).map((c) => ({ id: c.id, code: c.code })) })), staff };
    });
  }

  // ---- questions -----------------------------------------------------------------------------

  @Post('questions')
  @Auth('user', QB_ROLES)
  createQuestion(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(QuestionBody)) b: z.infer<typeof QuestionBody>) {
    this.checkOptions(b);
    return this.db.withTenant(p.tenantId, async (tx) => {
      found((await tx.select({ id: subjects.id }).from(subjects).where(eq(subjects.id, b.subjectId)))[0], 'Subject');
      await this.checkCo(tx, b.subjectId, b.coId);
      const dups = await this.duplicates(tx, b.subjectId, b.text);
      if (dups.length && !b.force) throw new ConflictException({ message: 'A very similar question is already in the bank', code: 'QB_DUPLICATE', duplicates: dups });
      const { force: _f, ...f } = b;
      const [row] = await tx.insert(qbQuestions).values({ tenantId: p.tenantId, ...f, coId: f.coId ?? null, authorId: p.userId }).returning();
      await auditUser(tx, p, 'qb.question.created', 'qb_question', row.id);
      return row;
    });
  }

  /** Questions of a subject with past-paper frequency and how often each was used in generated papers. */
  @Get('questions')
  @Auth('user', QB_ROLES)
  listQuestions(@CurrentPrincipal() p: UserPrincipal, @Query('subjectId') subjectId?: string, @Query('status') status?: string, @Query('topic') topic?: string) {
    if (subjectId && !uuid.safeParse(subjectId).success) throw new BadRequestException('Bad subject');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(qbQuestions)
        .where(and(subjectId ? eq(qbQuestions.subjectId, subjectId) : undefined, status ? eq(qbQuestions.status, status) : undefined, topic ? sql`${qbQuestions.topic} ilike ${`%${topic.replace(/[%_]/g, '')}%`}` : undefined))
        .orderBy(desc(qbQuestions.updatedAt))
        .limit(300);
      return this.decorate(tx, rows);
    });
  }

  private async decorate(tx: Tx, rows: Question[]) {
    const [freq, used, cos, people] = await Promise.all([
      Promise.all(rows.map((r) => examFrequency(tx, [r.text], r.subjectId).then((x) => x[0]))),
      this.usage(tx, rows.map((r) => r.id)),
      this.coCodes(tx, rows.map((r) => r.coId)),
      this.names(tx, rows.flatMap((r) => [r.authorId, r.reviewedBy, r.approvedBy])),
    ]);
    return rows.map((r, i) => ({
      ...r,
      coCode: r.coId ? (cos.get(r.coId) ?? null) : null,
      authorName: people.get(r.authorId) ?? '',
      reviewedByName: r.reviewedBy ? (people.get(r.reviewedBy) ?? null) : null,
      approvedByName: r.approvedBy ? (people.get(r.approvedBy) ?? null) : null,
      examFrequency: freq[i].examFrequency ?? null,
      important: freq[i].important ?? false,
      usedCount: used.get(r.id)?.count ?? 0,
      lastUsedAt: used.get(r.id)?.last ?? null,
    }));
  }

  @Get('questions/:id')
  @Auth('user', QB_ROLES)
  getQuestion(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const q = found((await tx.select().from(qbQuestions).where(eq(qbQuestions.id, id)))[0], 'Question');
      const [view] = await this.decorate(tx, [q]);
      const versions = await tx.select({ version: qbQuestionVersions.version, snapshot: qbQuestionVersions.snapshot, editedBy: qbQuestionVersions.editedBy, createdAt: qbQuestionVersions.createdAt }).from(qbQuestionVersions).where(eq(qbQuestionVersions.questionId, id)).orderBy(desc(qbQuestionVersions.version));
      return { ...view, versions };
    });
  }

  /** Editing keeps the old text as a version, bumps the version and sends the question back to draft. */
  @Patch('questions/:id')
  @Auth('user', QB_ROLES)
  editQuestion(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(QuestionPatch)) b: z.infer<typeof QuestionPatch>) {
    this.checkOptions(b);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const q = found((await tx.select().from(qbQuestions).where(eq(qbQuestions.id, id)).for('update'))[0], 'Question');
      checkVersion(q.version, b.version);
      if (q.authorId !== p.userId && !hasRole(p, EXAM_STAFF)) throw new ForbiddenException('Only the author or exam staff can edit a question');
      await this.checkCo(tx, q.subjectId, b.coId);
      const dups = await this.duplicates(tx, q.subjectId, b.text, id);
      if (dups.length && !b.force) throw new ConflictException({ message: 'A very similar question is already in the bank', code: 'QB_DUPLICATE', duplicates: dups });
      const cos = await this.coCodes(tx, [q.coId]);
      await tx.insert(qbQuestionVersions).values({ tenantId: p.tenantId, questionId: id, version: q.version, snapshot: { ...this.snapshot(q, q.coId ? (cos.get(q.coId) ?? null) : null), status: q.status }, editedBy: p.userId });
      const { force: _f, version: _v, ...f } = b;
      const [row] = await tx
        .update(qbQuestions)
        .set({ ...f, coId: f.coId ?? null, version: q.version + 1, status: 'draft', reviewedBy: null, reviewedAt: null, approvedBy: null, approvedAt: null, updatedAt: this.clock.now() })
        .where(eq(qbQuestions.id, id))
        .returning();
      await auditUser(tx, p, 'qb.question.edited', 'qb_question', id, { version: row.version });
      return row;
    });
  }

  /** A second person checks a draft. The reviewer must not be the author. */
  @Post('questions/:id/review')
  @HttpCode(200)
  @Auth('user', QB_ROLES)
  review(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const q = found((await tx.select().from(qbQuestions).where(eq(qbQuestions.id, id)).for('update'))[0], 'Question');
      if (q.authorId === p.userId) throw new ForbiddenException('A question cannot be reviewed by its author');
      if (q.status !== 'draft') throw new ConflictException('Only a draft question can be reviewed');
      const [row] = await tx.update(qbQuestions).set({ status: 'reviewed', reviewedBy: p.userId, reviewedAt: this.clock.now() }).where(eq(qbQuestions.id, id)).returning();
      await auditUser(tx, p, 'qb.question.reviewed', 'qb_question', id);
      return row;
    });
  }

  /** Exam staff approve a reviewed question. The approver must not be the author. */
  @Post('questions/:id/approve')
  @HttpCode(200)
  @Auth('user', EXAM_STAFF)
  approve(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const q = found((await tx.select().from(qbQuestions).where(eq(qbQuestions.id, id)).for('update'))[0], 'Question');
      if (q.authorId === p.userId) throw new ForbiddenException('A question cannot be approved by its author');
      if (q.status !== 'reviewed') throw new ConflictException('Only a reviewed question can be approved');
      const [row] = await tx.update(qbQuestions).set({ status: 'approved', approvedBy: p.userId, approvedAt: this.clock.now() }).where(eq(qbQuestions.id, id)).returning();
      await auditUser(tx, p, 'qb.question.approved', 'qb_question', id);
      return row;
    });
  }

  // ---- blueprints ----------------------------------------------------------------------------

  @Post('blueprints')
  @Auth('user', QB_ROLES)
  createBlueprint(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(BlueprintBody)) b: z.infer<typeof BlueprintBody>) {
    const sections = b.sections as BlueprintSection[];
    const problems = blueprintProblems(sections, b.totalMarks);
    if (problems.length) throw new BadRequestException(problems.join('; '));
    return this.db.withTenant(p.tenantId, async (tx) => {
      found((await tx.select({ id: subjects.id }).from(subjects).where(eq(subjects.id, b.subjectId)))[0], 'Subject');
      for (const s of sections) for (const co of s.coverage ?? []) await this.checkCo(tx, b.subjectId, co);
      const [row] = await tx.insert(qbBlueprints).values({ tenantId: p.tenantId, subjectId: b.subjectId, title: b.title, totalMarks: b.totalMarks, durationMinutes: b.durationMinutes, sections, createdBy: p.userId }).returning();
      await auditUser(tx, p, 'qb.blueprint.created', 'qb_blueprint', row.id);
      return row;
    });
  }

  @Get('blueprints')
  @Auth('user', QB_ROLES)
  listBlueprints(@CurrentPrincipal() p: UserPrincipal, @Query('subjectId') subjectId?: string) {
    if (subjectId && !uuid.safeParse(subjectId).success) throw new BadRequestException('Bad subject');
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(qbBlueprints).where(subjectId ? eq(qbBlueprints.subjectId, subjectId) : undefined).orderBy(desc(qbBlueprints.createdAt)).limit(200));
  }

  // ---- papers --------------------------------------------------------------------------------

  /** The caller's own papers, or every paper for exam staff. */
  private canSee(p: UserPrincipal, paper: Paper) {
    return hasRole(p, EXAM_STAFF) || paper.setterId === p.userId || paper.moderatorId === p.userId;
  }

  private async load(tx: Tx, p: UserPrincipal, id: string) {
    const paper = (await tx.select().from(qbPapers).where(eq(qbPapers.id, id)))[0];
    if (!paper || !this.canSee(p, paper)) throw new NotFoundException('Paper not found');
    return paper;
  }

  /** Picks the questions for every section of the blueprint and replaces the paper's items. */
  private async fill(tx: Tx, p: UserPrincipal, paper: Paper, seed: string) {
    const [bp] = await tx.select().from(qbBlueprints).where(eq(qbBlueprints.id, paper.blueprintId));
    const recentPapers = await tx.select({ id: qbPapers.id }).from(qbPapers).where(and(eq(qbPapers.subjectId, paper.subjectId), ne(qbPapers.id, paper.id))).orderBy(desc(qbPapers.createdAt)).limit(paper.avoidLast);
    const recent = new Set(recentPapers.length ? (await tx.select({ q: qbPaperItems.questionId }).from(qbPaperItems).where(inArray(qbPaperItems.paperId, recentPapers.map((r) => r.id)))).map((r) => r.q) : []);
    const approved = await tx.select().from(qbQuestions).where(and(eq(qbQuestions.subjectId, paper.subjectId), eq(qbQuestions.status, 'approved')));
    const byId = new Map(approved.map((q) => [q.id, q]));
    const taken = new Set<string>();
    const rnd = seeded(seed);
    const chosen: { section: number; ids: string[] }[] = [];
    let repeats = 0;
    for (const [i, sec] of bp.sections.entries()) {
      const pool: Candidate[] = approved.filter((q) => !taken.has(q.id)).map((q) => ({ id: q.id, bloom: q.bloom, difficulty: q.difficulty, coId: q.coId, marks: q.marks, type: q.type, recent: recent.has(q.id) }));
      const r = pickSection(pool, sec, rnd);
      if ('error' in r) throw new UnprocessableEntityException({ message: `Section ${i + 1} (${sec.name}) ${r.error}`, code: 'QB_BLUEPRINT_UNMET', section: i + 1 });
      r.ids.forEach((x) => taken.add(x));
      repeats += r.repeats;
      chosen.push({ section: i, ids: r.ids });
    }
    const cos = await this.coCodes(tx, approved.map((q) => q.coId));
    await tx.delete(qbPaperItems).where(eq(qbPaperItems.paperId, paper.id));
    const rows = chosen.flatMap((c) =>
      c.ids.map((qid, pos) => {
        const q = byId.get(qid)!;
        return { tenantId: p.tenantId, paperId: paper.id, questionId: qid, section: c.section, position: pos, marks: q.marks, snapshot: this.snapshot(q, q.coId ? (cos.get(q.coId) ?? null) : null) };
      }),
    );
    await tx.insert(qbPaperItems).values(rows);
    return repeats;
  }

  /** Generates a paper from approved questions meeting the blueprint. The same seed gives the same paper. */
  @Post('papers')
  @Auth('user', QB_ROLES)
  createPaper(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(PaperBody)) b: z.infer<typeof PaperBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const bp = found((await tx.select().from(qbBlueprints).where(eq(qbBlueprints.id, b.blueprintId)))[0], 'Blueprint');
      const seed = b.seed ?? randomUUID();
      const [paper] = await tx.insert(qbPapers).values({ tenantId: p.tenantId, blueprintId: bp.id, subjectId: bp.subjectId, title: b.title, seed, avoidLast: b.avoidLast, setterId: p.userId }).returning();
      const repeats = await this.fill(tx, p, paper, seed);
      const [saved] = await tx.update(qbPapers).set({ repeats }).where(eq(qbPapers.id, paper.id)).returning();
      await auditUser(tx, p, 'qb.paper.generated', 'qb_paper', paper.id, { seed, repeats });
      return saved;
    });
  }

  /** Draws the paper again with a new seed while it is still a draft or has been returned. */
  @Post('papers/:id/regenerate')
  @HttpCode(200)
  @Auth('user', QB_ROLES)
  regenerate(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ seed: z.string().trim().min(1).max(100).optional() }))) b: { seed?: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const paper = await this.load(tx, p, id);
      if (paper.setterId !== p.userId) throw new ForbiddenException('Only the paper setter can change the paper');
      if (!['draft', 'returned'].includes(paper.status)) throw new ConflictException('This paper is already with the moderator or locked');
      const seed = b.seed ?? randomUUID();
      const repeats = await this.fill(tx, p, paper, seed);
      const [saved] = await tx.update(qbPapers).set({ seed, repeats, status: 'draft', remarks: null }).where(eq(qbPapers.id, id)).returning();
      await auditUser(tx, p, 'qb.paper.regenerated', 'qb_paper', id, { seed });
      return saved;
    });
  }

  /** Sends the paper to a moderator, who must be someone other than the setter. */
  @Post('papers/:id/submit')
  @HttpCode(200)
  @Auth('user', QB_ROLES)
  submit(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ moderatorId: uuid }))) b: { moderatorId: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const paper = await this.load(tx, p, id);
      if (paper.setterId !== p.userId) throw new ForbiddenException('Only the paper setter can send it for scrutiny');
      if (!['draft', 'returned'].includes(paper.status)) throw new ConflictException('This paper is already with the moderator or locked');
      if (b.moderatorId === p.userId) throw new BadRequestException('The moderator must be someone other than the setter');
      const [mod] = await tx.select({ id: users.id }).from(users).innerJoin(userRoles, eq(userRoles.userId, users.id)).where(and(eq(users.id, b.moderatorId), inArray(userRoles.role, QB_ROLES))).limit(1);
      if (!mod) throw new BadRequestException('Pick a member of staff as the moderator');
      const [saved] = await tx.update(qbPapers).set({ status: 'scrutiny', moderatorId: b.moderatorId, remarks: null }).where(eq(qbPapers.id, id)).returning();
      await auditUser(tx, p, 'qb.paper.submitted', 'qb_paper', id, { moderatorId: b.moderatorId });
      return saved;
    });
  }

  /** The moderator approves the paper or returns it with remarks. */
  @Post('papers/:id/scrutiny')
  @HttpCode(200)
  @Auth('user', QB_ROLES)
  scrutiny(
    @CurrentPrincipal() p: UserPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(z.object({ decision: z.enum(['approve', 'return']), remarks: z.string().trim().max(2000).default('') }))) b: { decision: 'approve' | 'return'; remarks: string },
  ) {
    if (b.decision === 'return' && !b.remarks) throw new BadRequestException('Say what needs to change when returning a paper');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const paper = await this.load(tx, p, id);
      if (paper.moderatorId !== p.userId) throw new ForbiddenException('Only the assigned moderator can decide on this paper');
      if (paper.status !== 'scrutiny') throw new ConflictException('This paper is not waiting for scrutiny');
      const [saved] = await tx.update(qbPapers).set({ status: b.decision === 'approve' ? 'approved' : 'returned', remarks: b.remarks || null, decidedAt: this.clock.now() }).where(eq(qbPapers.id, id)).returning();
      await auditUser(tx, p, `qb.paper.${b.decision === 'approve' ? 'approved' : 'returned'}`, 'qb_paper', id, { remarks: b.remarks });
      return saved;
    });
  }

  /** Exam staff lock an approved paper; only a locked paper can be printed. */
  @Post('papers/:id/lock')
  @HttpCode(200)
  @Auth('user', EXAM_STAFF)
  lock(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const paper = await this.load(tx, p, id);
      if (paper.status !== 'approved') throw new ConflictException('Only a paper approved by its moderator can be locked');
      const [saved] = await tx.update(qbPapers).set({ status: 'locked', lockedAt: this.clock.now(), lockedBy: p.userId }).where(eq(qbPapers.id, id)).returning();
      await auditUser(tx, p, 'qb.paper.locked', 'qb_paper', id);
      return saved;
    });
  }

  @Get('papers')
  @Auth('user', QB_ROLES)
  listPapers(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select({ paper: qbPapers, subject: subjects.name }).from(qbPapers).innerJoin(subjects, eq(subjects.id, qbPapers.subjectId)).orderBy(desc(qbPapers.createdAt)).limit(300);
      const mine = rows.filter((r) => this.canSee(p, r.paper));
      const people = await this.names(tx, mine.flatMap((r) => [r.paper.setterId, r.paper.moderatorId]));
      return mine.map((r) => ({ ...r.paper, subject: r.subject, setterName: people.get(r.paper.setterId) ?? '', moderatorName: r.paper.moderatorId ? (people.get(r.paper.moderatorId) ?? null) : null }));
    });
  }

  /** The paper with its questions and answer keys, and a check of the blueprint against what was drawn. */
  @Get('papers/:id')
  @Auth('user', QB_ROLES)
  getPaper(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const paper = await this.load(tx, p, id);
      const [bp] = await tx.select().from(qbBlueprints).where(eq(qbBlueprints.id, paper.blueprintId));
      const items = await tx.select().from(qbPaperItems).where(eq(qbPaperItems.paperId, id)).orderBy(asc(qbPaperItems.section), asc(qbPaperItems.position));
      const tally = (si: number, key: 'bloom' | 'difficulty' | 'coId') => {
        const out: Record<string, number> = {};
        for (const it of items.filter((x) => x.section === si)) {
          const v = (it.snapshot[key] as string | null) ?? 'none';
          out[v] = (out[v] ?? 0) + 1;
        }
        return out;
      };
      const people = await this.names(tx, [paper.setterId, paper.moderatorId]);
      return {
        ...paper,
        setterName: people.get(paper.setterId) ?? '',
        moderatorName: paper.moderatorId ? (people.get(paper.moderatorId) ?? null) : null,
        blueprint: bp,
        totalMarks: items.reduce((a, b) => a + b.marks, 0),
        items,
        distribution: bp.sections.map((_, si) => ({ section: si, bloom: tally(si, 'bloom'), difficulty: tally(si, 'difficulty'), outcomes: tally(si, 'coId') })),
      };
    });
  }

  private async pdf(p: UserPrincipal, id: string, key: boolean, res: Response) {
    const out = await this.db.withTenant(p.tenantId, async (tx) => {
      const paper = await this.load(tx, p, id);
      if (paper.status !== 'locked') throw new ConflictException('The paper can be printed once it has been locked');
      const [rel] = await tx.select().from(qbPaperReleases).where(eq(qbPaperReleases.paperId, id));
      if (rel && releaseState(rel.status, rel.releaseAt, this.clock.now()) === 'sealed') throw new ForbiddenException(`This paper is sealed until ${rel.releaseAt.toISOString()}`);
      const [bp] = await tx.select().from(qbBlueprints).where(eq(qbBlueprints.id, paper.blueprintId));
      const [sub] = await tx.select({ name: subjects.name, code: subjects.code }).from(subjects).where(eq(subjects.id, paper.subjectId));
      const [tenant] = await tx.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, p.tenantId));
      const items = await tx.select().from(qbPaperItems).where(eq(qbPaperItems.paperId, id));
      await auditUser(tx, p, key ? 'qb.paper.key_downloaded' : 'qb.paper.downloaded', 'qb_paper', id);
      const data = { institution: tenant?.name ?? '', title: paper.title, subject: sub.name, durationMinutes: bp.durationMinutes, totalMarks: bp.totalMarks, sections: bp.sections, items: items as never };
      return { buf: paperPdf(data, key), name: `${key ? 'answer-key' : 'question-paper'}-${sub.code}-${paper.title}`.replace(/[^A-Za-z0-9._-]+/g, '-') };
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${out.name}.pdf"`);
    res.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(out.buf);
  }

  @Get('papers/:id/paper.pdf')
  @Auth('user', QB_ROLES)
  paperFile(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    return this.pdf(p, id, false, res);
  }

  @Get('papers/:id/answer-key.pdf')
  @Auth('user', QB_ROLES)
  keyFile(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    return this.pdf(p, id, true, res);
  }
}
