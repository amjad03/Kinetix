import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, Res } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal, TEACHING_ROLES } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { PdfWriter, toCsv } from '../common/pdf.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { academicYears, assessmentCoMap, assessments, coOutcomeMap, coSets, courseOutcomes, improvementActions, obeConfigs, pollResponses, polls, sections, obeEvidence, obeSurveyRatings, obeSurveys, programOutcomes, subjects, tenants, users } from '../db/schema.js';
import { pollCoMap } from '../db/schema-assist.js';
import { headsSubject } from '../departments/departments.controller.js';
import { isSchoolAdmin, TeacherService } from '../teacher/teacher.service.js';
import { trend, validateConfig, type AttainmentConfig } from './attainment.js';
import { ObeService } from './obe.service.js';

/** OBE belongs to leadership and the quality officer (IQAC), not the exam cell. */
const OBE_ADMIN: RoleName[] = ['tenant_admin', 'principal', 'quality_officer'];
const MANAGE: RoleName[] = [...OBE_ADMIN, 'hod'];
const STAFF: RoleName[] = [...TEACHING_ROLES, 'tenant_admin', 'quality_officer'];

const OutcomeBody = z.object({ kind: z.enum(['mission', 'vision', 'peo', 'po', 'pso']), code: z.string().trim().min(1).max(16), statement: z.string().trim().min(3).max(1000), ord: z.number().int().min(0).max(200).default(0) });
const ConfigBody = z.object({
  studentThresholdPercent: z.number().gt(0).max(100),
  levels: z.array(z.object({ level: z.number().min(0).max(10), minStudentsPercent: z.number().min(0).max(100) })).min(1).max(10),
  evidenceWeights: z.record(z.string(), z.number().min(0).max(100)),
  directWeight: z.number().min(0).max(100),
  indirectWeight: z.number().min(0).max(100),
  maxLevel: z.number().positive().max(10),
  targetLevel: z.number().min(0).max(10),
  decimals: z.number().int().min(0).max(4),
});
const CoBody = z.object({ code: z.string().trim().min(1).max(16), statement: z.string().trim().min(3).max(1000), bloomLevel: z.string().trim().max(40).optional(), ord: z.number().int().min(0).max(100).default(0) });
const MatrixBody = z.object({ cells: z.array(z.object({ coId: z.uuid(), outcomeId: z.uuid(), strength: z.number().int().min(0).max(3) })).max(2000) });
const AssessmentMapBody = z.object({ maps: z.array(z.object({ coId: z.uuid(), share: z.number().gt(0).max(1) })).max(30) });
const SurveyBody = z.object({ programId: z.uuid(), subjectId: z.uuid().optional(), academicYearId: z.uuid(), kind: z.enum(['course_exit', 'graduate_exit', 'alumni', 'employer']), title: z.string().trim().min(1).max(160), scaleMax: z.number().int().min(2).max(10).default(5), minResponses: z.number().int().min(1).max(1000).default(5), weight: z.number().gt(0).max(100).default(1) });
const RatingsBody = z.object({ ratings: z.array(z.object({ coId: z.uuid().optional(), outcomeId: z.uuid().optional(), rating: z.number().min(0) })).min(1).max(3000) });
const PollCosBody = z.object({ coIds: z.array(z.uuid()).max(10) });
const ComputeBody = z.object({ academicYearId: z.uuid() });
const ActionBody = z.object({ scope: z.enum(['co', 'po']), targetId: z.uuid(), title: z.string().trim().min(3).max(200), detail: z.string().trim().max(2000).optional(), ownerId: z.uuid().optional(), dueOn: z.string().optional() });
const ActionUpdate = z.object({ status: z.enum(['open', 'in_progress', 'done']).optional(), detail: z.string().trim().max(2000).optional(), ownerId: z.uuid().nullable().optional(), dueOn: z.string().nullable().optional() });
const EvidenceBody = z.object({ scope: z.enum(['co', 'po', 'action']), targetId: z.uuid(), title: z.string().trim().min(2).max(200), url: z.url().optional(), note: z.string().trim().max(2000).optional() });

/** Outcome-based education: programme outcomes, versioned COs, mappings, attainment, actions and accreditation reports. */
@Controller('v1/obe')
export class ObeController {
  constructor(
    private readonly db: DbService,
    private readonly obe: ObeService,
    private readonly teacher: TeacherService,
  ) {}

  // --- Mission / vision / PEO / PO / PSO -------------------------------------------------------

  @Get('programs/:programId/outcomes')
  @Auth('user', STAFF)
  outcomes(@CurrentPrincipal() p: UserPrincipal, @Param('programId', ParseUUIDPipe) programId: string) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(programOutcomes).where(eq(programOutcomes.programId, programId)).orderBy(asc(programOutcomes.kind), asc(programOutcomes.ord), asc(programOutcomes.code)));
  }

  @Post('programs/:programId/outcomes')
  @Auth('user', OBE_ADMIN)
  addOutcome(@CurrentPrincipal() p: UserPrincipal, @Param('programId', ParseUUIDPipe) programId: string, @Body(new ZodBody(OutcomeBody)) body: z.infer<typeof OutcomeBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.obe.program(tx, programId);
      const [dup] = await tx.select({ id: programOutcomes.id }).from(programOutcomes).where(and(eq(programOutcomes.programId, programId), eq(programOutcomes.kind, body.kind), eq(programOutcomes.code, body.code)));
      if (dup) throw new ConflictException(`${body.code} already exists`);
      const [row] = await tx.insert(programOutcomes).values({ tenantId: p.tenantId, programId, ...body }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'obe.outcome.created', subjectType: 'program_outcome', subjectId: row.id, data: { kind: body.kind, code: body.code } });
      return row;
    });
  }

  @Put('outcomes/:id')
  @Auth('user', OBE_ADMIN)
  updateOutcome(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ statement: z.string().trim().min(3).max(1000), ord: z.number().int().min(0).max(200).optional() }))) body: { statement: string; ord?: number }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(programOutcomes).set(body).where(eq(programOutcomes.id, id)).returning();
      if (!row) throw new NotFoundException('Outcome not found');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'obe.outcome.updated', subjectType: 'program_outcome', subjectId: id });
      return row;
    });
  }

  @Delete('outcomes/:id')
  @HttpCode(200)
  @Auth('user', OBE_ADMIN)
  deleteOutcome(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const res = await tx.delete(programOutcomes).where(eq(programOutcomes.id, id)).returning({ id: programOutcomes.id });
      if (res.length === 0) throw new NotFoundException('Outcome not found');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'obe.outcome.deleted', subjectType: 'program_outcome', subjectId: id });
      return { deleted: true };
    });
  }

  @Get('programs/:programId/config')
  @Auth('user', STAFF)
  getConfig(@CurrentPrincipal() p: UserPrincipal, @Param('programId', ParseUUIDPipe) programId: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.obe.config(tx, programId));
  }

  @Put('programs/:programId/config')
  @Auth('user', OBE_ADMIN)
  setConfig(@CurrentPrincipal() p: UserPrincipal, @Param('programId', ParseUUIDPipe) programId: string, @Body(new ZodBody(ConfigBody)) body: AttainmentConfig) {
    const err = validateConfig(body);
    if (err) throw new BadRequestException(err);
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.obe.program(tx, programId);
      await tx.insert(obeConfigs).values({ programId, tenantId: p.tenantId, config: body, updatedBy: p.userId }).onConflictDoUpdate({ target: obeConfigs.programId, set: { config: body, updatedBy: p.userId, updatedAt: new Date() } });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'obe.config.updated', subjectType: 'program', subjectId: programId, data: body });
      return body;
    });
  }

  // --- Course outcomes (versioned) and the CO-PO / CO-PSO matrix ---------------------------------

  @Get('subjects/:subjectId/co-sets')
  @Auth('user', STAFF)
  coSets(@CurrentPrincipal() p: UserPrincipal, @Param('subjectId', ParseUUIDPipe) subjectId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const sets = await tx.select().from(coSets).where(eq(coSets.subjectId, subjectId)).orderBy(sql`${coSets.version} desc`);
      const cos = sets.length ? await tx.select().from(courseOutcomes).where(inArray(courseOutcomes.coSetId, sets.map((s) => s.id))).orderBy(asc(courseOutcomes.ord), asc(courseOutcomes.code)) : [];
      return sets.map((s) => ({ ...s, outcomes: cos.filter((c) => c.coSetId === s.id) }));
    });
  }

  /** Starts a new draft version, copied from the latest version (COs and matrix) so changes are reviewed before activation. */
  @Post('subjects/:subjectId/co-sets')
  @Auth('user', STAFF)
  newCoSet(@CurrentPrincipal() p: UserPrincipal, @Param('subjectId', ParseUUIDPipe) subjectId: string, @Body(new ZodBody(z.object({ note: z.string().trim().max(300).optional() }))) body: { note?: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.assertCoEditor(tx, p, subjectId);
      const existing = await tx.select().from(coSets).where(eq(coSets.subjectId, subjectId)).orderBy(sql`${coSets.version} desc`);
      if (existing.some((s) => s.status === 'draft')) throw new ConflictException('Finish or activate the draft version first');
      const [set] = await tx.insert(coSets).values({ tenantId: p.tenantId, subjectId, version: (existing[0]?.version ?? 0) + 1, note: body.note ?? null, createdBy: p.userId }).returning();
      if (existing[0]) {
        const old = await tx.select().from(courseOutcomes).where(eq(courseOutcomes.coSetId, existing[0].id));
        for (const c of old) {
          const [n] = await tx.insert(courseOutcomes).values({ tenantId: p.tenantId, coSetId: set.id, code: c.code, statement: c.statement, bloomLevel: c.bloomLevel, ord: c.ord }).returning({ id: courseOutcomes.id });
          const cells = await tx.select().from(coOutcomeMap).where(eq(coOutcomeMap.coId, c.id));
          if (cells.length) await tx.insert(coOutcomeMap).values(cells.map((x) => ({ tenantId: p.tenantId, coId: n.id, outcomeId: x.outcomeId, strength: x.strength })));
        }
      }
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'obe.coset.created', subjectType: 'co_set', subjectId: set.id, data: { subjectId, version: set.version } });
      return set;
    });
  }

  @Post('co-sets/:id/outcomes')
  @Auth('user', STAFF)
  addCo(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(CoBody)) body: z.infer<typeof CoBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.editableSet(tx, p, id);
      const [dup] = await tx.select({ id: courseOutcomes.id }).from(courseOutcomes).where(and(eq(courseOutcomes.coSetId, id), eq(courseOutcomes.code, body.code)));
      if (dup) throw new ConflictException(`${body.code} already exists in this version`);
      const [row] = await tx.insert(courseOutcomes).values({ tenantId: p.tenantId, coSetId: id, code: body.code, statement: body.statement, bloomLevel: body.bloomLevel ?? null, ord: body.ord }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'obe.co.created', subjectType: 'course_outcome', subjectId: row.id, data: { code: body.code } });
      return row;
    });
  }

  @Put('course-outcomes/:id')
  @Auth('user', STAFF)
  updateCo(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(CoBody.partial())) body: Partial<z.infer<typeof CoBody>>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [co] = await tx.select().from(courseOutcomes).where(eq(courseOutcomes.id, id));
      if (!co) throw new NotFoundException('Course outcome not found');
      await this.editableSet(tx, p, co.coSetId);
      const [row] = await tx.update(courseOutcomes).set(body).where(eq(courseOutcomes.id, id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'obe.co.updated', subjectType: 'course_outcome', subjectId: id });
      return row;
    });
  }

  @Delete('course-outcomes/:id')
  @HttpCode(200)
  @Auth('user', STAFF)
  deleteCo(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [co] = await tx.select().from(courseOutcomes).where(eq(courseOutcomes.id, id));
      if (!co) throw new NotFoundException('Course outcome not found');
      await this.editableSet(tx, p, co.coSetId);
      await tx.delete(courseOutcomes).where(eq(courseOutcomes.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'obe.co.deleted', subjectType: 'course_outcome', subjectId: id });
      return { deleted: true };
    });
  }

  /** Makes a draft version the live one; the previous live version is retired (its history stays). */
  @Post('co-sets/:id/activate')
  @HttpCode(200)
  @Auth('user', STAFF)
  activate(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const set = await this.editableSet(tx, p, id);
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(courseOutcomes).where(eq(courseOutcomes.coSetId, id));
      if (n === 0) throw new BadRequestException('Add at least one course outcome first');
      await tx.update(coSets).set({ status: 'retired' }).where(and(eq(coSets.subjectId, set.subjectId), eq(coSets.status, 'active')));
      await tx.update(coSets).set({ status: 'active', activatedAt: new Date() }).where(eq(coSets.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'obe.coset.activated', subjectType: 'co_set', subjectId: id, data: { version: set.version } });
      return { status: 'active' };
    });
  }

  /** The CO × PO/PSO matrix of one version: columns are the programme's POs and PSOs. */
  @Get('co-sets/:id/matrix')
  @Auth('user', STAFF)
  matrix(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [set] = await tx.select().from(coSets).where(eq(coSets.id, id));
      if (!set) throw new NotFoundException('Version not found');
      const [subject] = await tx.select({ programId: subjects.programId }).from(subjects).where(eq(subjects.id, set.subjectId));
      const cos = await tx.select().from(courseOutcomes).where(eq(courseOutcomes.coSetId, id)).orderBy(asc(courseOutcomes.ord), asc(courseOutcomes.code));
      const cols = await tx.select().from(programOutcomes).where(and(eq(programOutcomes.programId, subject.programId), inArray(programOutcomes.kind, ['po', 'pso']))).orderBy(asc(programOutcomes.kind), asc(programOutcomes.ord), asc(programOutcomes.code));
      const cells = cos.length ? await tx.select().from(coOutcomeMap).where(inArray(coOutcomeMap.coId, cos.map((c) => c.id))) : [];
      return { set, cos, outcomes: cols, cells: cells.map((c) => ({ coId: c.coId, outcomeId: c.outcomeId, strength: c.strength })) };
    });
  }

  @Put('co-sets/:id/matrix')
  @Auth('user', STAFF)
  saveMatrix(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(MatrixBody)) body: z.infer<typeof MatrixBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const set = await this.editableSet(tx, p, id);
      const [subject] = await tx.select({ programId: subjects.programId }).from(subjects).where(eq(subjects.id, set.subjectId));
      const cos = await tx.select({ id: courseOutcomes.id }).from(courseOutcomes).where(eq(courseOutcomes.coSetId, id));
      const cols = await tx.select({ id: programOutcomes.id }).from(programOutcomes).where(and(eq(programOutcomes.programId, subject.programId), inArray(programOutcomes.kind, ['po', 'pso'])));
      const coIds = new Set(cos.map((c) => c.id));
      const colIds = new Set(cols.map((c) => c.id));
      if (body.cells.some((c) => !coIds.has(c.coId) || !colIds.has(c.outcomeId))) throw new BadRequestException('The matrix has a CO or PO that does not belong here');
      if (cos.length) await tx.delete(coOutcomeMap).where(inArray(coOutcomeMap.coId, [...coIds]));
      const keep = body.cells.filter((c) => c.strength > 0);
      if (keep.length) await tx.insert(coOutcomeMap).values(keep.map((c) => ({ tenantId: p.tenantId, ...c })));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'obe.matrix.saved', subjectType: 'co_set', subjectId: id, data: { cells: keep.length } });
      return { cells: keep.length };
    });
  }

  // --- Assessment → CO mapping -------------------------------------------------------------------

  @Get('assessments/:id/cos')
  @Auth('user', STAFF)
  assessmentCos(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select({ coId: assessmentCoMap.coId, share: assessmentCoMap.share, code: courseOutcomes.code, statement: courseOutcomes.statement }).from(assessmentCoMap).innerJoin(courseOutcomes, eq(courseOutcomes.id, assessmentCoMap.coId)).where(eq(assessmentCoMap.assessmentId, id)));
  }

  /** Says which course outcomes an assessment tests and what share of its marks goes to each. */
  @Put('assessments/:id/cos')
  @Auth('user', STAFF)
  mapAssessment(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(AssessmentMapBody)) body: z.infer<typeof AssessmentMapBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [a] = await tx.select().from(assessments).where(eq(assessments.id, id));
      if (!a) throw new NotFoundException('Assessment not found');
      if (!isSchoolAdmin(p) && !(await headsSubject(tx, p, a.subjectId)) && !(await this.teacher.teachesSection(tx, p.userId, a.sectionId))) throw new ForbiddenException('You do not teach this class');
      if (body.maps.length) {
        const rows = await tx.select({ id: courseOutcomes.id }).from(courseOutcomes).innerJoin(coSets, eq(coSets.id, courseOutcomes.coSetId)).where(and(inArray(courseOutcomes.id, body.maps.map((m) => m.coId)), eq(coSets.subjectId, a.subjectId)));
        if (rows.length !== new Set(body.maps.map((m) => m.coId)).size) throw new BadRequestException('Some course outcomes belong to another subject');
      }
      await tx.delete(assessmentCoMap).where(eq(assessmentCoMap.assessmentId, id));
      if (body.maps.length) await tx.insert(assessmentCoMap).values(body.maps.map((m) => ({ tenantId: p.tenantId, assessmentId: id, ...m })));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'obe.assessment.mapped', subjectType: 'assessment', subjectId: id, data: { cos: body.maps.length } });
      return { mapped: body.maps.length };
    });
  }

  // --- Classroom activities (board polls, quizzes, class checks) → CO -----------------------------

  /** Closed board polls of a subject with the course outcomes they are tagged with and how the class did. */
  @Get('classroom-activities')
  @Auth('user', STAFF)
  classroomActivities(@CurrentPrincipal() p: UserPrincipal, @Query('subjectId') subjectId?: string) {
    if (!subjectId || !z.uuid().safeParse(subjectId).success) throw new BadRequestException('Choose a subject');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ id: polls.id, question: polls.question, kind: polls.kind, openedAt: polls.openedAt, closedAt: polls.closedAt, hasAnswer: sql<boolean>`${polls.correct} is not null`, section: sections.name, responses: sql<number>`(select count(*)::int from ${pollResponses} r where r.poll_id = ${polls.id})` })
        .from(polls)
        .innerJoin(sections, eq(sections.id, polls.sectionId))
        .where(and(eq(polls.subjectId, subjectId), sql`${polls.closedAt} is not null`, isSchoolAdmin(p) ? sql`true` : eq(polls.teacherId, p.userId)))
        .orderBy(sql`${polls.openedAt} desc`)
        .limit(100);
      const tags = rows.length ? await tx.select({ pollId: pollCoMap.pollId, coId: pollCoMap.coId, code: courseOutcomes.code }).from(pollCoMap).innerJoin(courseOutcomes, eq(courseOutcomes.id, pollCoMap.coId)).where(inArray(pollCoMap.pollId, rows.map((r) => r.id))) : [];
      return rows.map((r) => ({ ...r, cos: tags.filter((t) => t.pollId === r.id).map((t) => ({ coId: t.coId, code: t.code })) }));
    });
  }

  /** Tags a poll with the course outcomes it measures (replacing earlier tags). Its results then count towards direct attainment when the programme gives classroom evidence a weight. */
  @Put('polls/:id/cos')
  @Auth('user', STAFF)
  tagPoll(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(PollCosBody)) body: z.infer<typeof PollCosBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [poll] = await tx.select().from(polls).where(eq(polls.id, id));
      if (!poll) throw new NotFoundException('Poll not found');
      if (!poll.subjectId) throw new BadRequestException('This poll has no subject, so it cannot be tied to a course outcome');
      if (poll.teacherId !== p.userId && !isSchoolAdmin(p) && !(await headsSubject(tx, p, poll.subjectId))) throw new ForbiddenException('Only the teacher who asked this question can tag it');
      const coIds = [...new Set(body.coIds)];
      if (coIds.length) {
        const ok = await tx.select({ id: courseOutcomes.id }).from(courseOutcomes).innerJoin(coSets, eq(coSets.id, courseOutcomes.coSetId)).where(and(inArray(courseOutcomes.id, coIds), eq(coSets.subjectId, poll.subjectId)));
        if (ok.length !== coIds.length) throw new BadRequestException('Some course outcomes belong to another subject');
      }
      await tx.delete(pollCoMap).where(eq(pollCoMap.pollId, id));
      if (coIds.length) await tx.insert(pollCoMap).values(coIds.map((coId) => ({ tenantId: p.tenantId, pollId: id, coId, createdBy: p.userId })));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'obe.poll.tagged', subjectType: 'poll', subjectId: id, data: { cos: coIds.length } });
      return { tagged: coIds.length };
    });
  }

  // --- Indirect attainment: surveys --------------------------------------------------------------

  @Post('surveys')
  @Auth('user', STAFF)
  createSurvey(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(SurveyBody)) body: z.infer<typeof SurveyBody>) {
    if ((body.kind === 'course_exit') !== !!body.subjectId) throw new BadRequestException('Course-exit surveys need a subject; programme surveys must not have one');
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (body.kind !== 'course_exit' && !p.roles.some((r) => MANAGE.includes(r))) throw new ForbiddenException('Only the principal or a head of department can run programme surveys');
      const [row] = await tx.insert(obeSurveys).values({ tenantId: p.tenantId, ...body, createdBy: p.userId }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'obe.survey.created', subjectType: 'obe_survey', subjectId: row.id, data: { kind: body.kind } });
      return row;
    });
  }

  @Get('programs/:programId/surveys')
  @Auth('user', STAFF)
  surveys(@CurrentPrincipal() p: UserPrincipal, @Param('programId', ParseUUIDPipe) programId: string, @Query('academicYearId') academicYearId?: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ id: obeSurveys.id, kind: obeSurveys.kind, title: obeSurveys.title, subjectId: obeSurveys.subjectId, scaleMax: obeSurveys.scaleMax, minResponses: obeSurveys.minResponses, weight: obeSurveys.weight, ratings: sql<number>`(select count(*)::int from obe_survey_ratings r where r.survey_id = "obe_surveys"."id")` })
        .from(obeSurveys)
        .where(and(eq(obeSurveys.programId, programId), academicYearId ? eq(obeSurveys.academicYearId, academicYearId) : sql`true`)),
    );
  }

  @Post('surveys/:id/ratings')
  @HttpCode(200)
  @Auth('user', STAFF)
  addRatings(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(RatingsBody)) body: z.infer<typeof RatingsBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [sv] = await tx.select().from(obeSurveys).where(eq(obeSurveys.id, id));
      if (!sv) throw new NotFoundException('Survey not found');
      if (sv.kind !== 'course_exit' && !p.roles.some((r) => MANAGE.includes(r))) throw new ForbiddenException('Only the principal or a head of department can enter programme survey ratings');
      for (const r of body.ratings) {
        if (!!r.coId === !!r.outcomeId) throw new BadRequestException('Each rating is for one CO or one PO/PSO');
        if (sv.kind === 'course_exit' ? !r.coId : !r.outcomeId) throw new BadRequestException(sv.kind === 'course_exit' ? 'Course surveys rate course outcomes' : 'Programme surveys rate POs/PSOs');
        if (r.rating > sv.scaleMax) throw new BadRequestException(`Ratings cannot be more than ${sv.scaleMax}`);
      }
      await tx.insert(obeSurveyRatings).values(body.ratings.map((r) => ({ tenantId: p.tenantId, surveyId: id, coId: r.coId ?? null, outcomeId: r.outcomeId ?? null, rating: r.rating })));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'obe.survey.rated', subjectType: 'obe_survey', subjectId: id, data: { ratings: body.ratings.length } });
      return { added: body.ratings.length };
    });
  }

  // --- Attainment, gaps, actions, evidence ---------------------------------------------------------

  @Post('programs/:programId/attainment/compute')
  @HttpCode(200)
  @Auth('user', MANAGE)
  compute(@CurrentPrincipal() p: UserPrincipal, @Param('programId', ParseUUIDPipe) programId: string, @Body(new ZodBody(ComputeBody)) body: z.infer<typeof ComputeBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.obe.program(tx, programId);
      const r = await this.obe.compute(tx, p.tenantId, p.userId, programId, body.academicYearId);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'obe.attainment.computed', subjectType: 'program', subjectId: programId, data: { academicYearId: body.academicYearId, cos: r.cos, outcomes: r.outcomes } });
      return r;
    });
  }

  /** Latest attainment per CO and PO/PSO with the target, gap and trend against the previous run. */
  @Get('programs/:programId/attainment')
  @Auth('user', MANAGE)
  attainment(@CurrentPrincipal() p: UserPrincipal, @Param('programId', ParseUUIDPipe) programId: string, @Query('academicYearId', ParseUUIDPipe) academicYearId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { computedAt, rows } = await this.obe.latest(tx, programId, academicYearId);
      const cfg = await this.obe.config(tx, programId);
      const withTrend = rows.map((r) => ({ ...r, trend: trend(r.previous, r.combined) }));
      const cos = withTrend.filter((r) => r.scope === 'co');
      const pos = withTrend.filter((r) => r.scope === 'po');
      return {
        computedAt,
        config: cfg,
        cos,
        pos,
        summary: { cosMet: cos.filter((r) => r.met).length, cos: cos.length, posMet: pos.filter((r) => r.met).length, pos: pos.length, gaps: withTrend.filter((r) => !r.met && r.gap !== null).sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0)).slice(0, 10).map((r) => ({ scope: r.scope, targetId: r.targetId, code: r.code, gap: r.gap })) },
      };
    });
  }

  @Get('programs/:programId/actions')
  @Auth('user', MANAGE)
  actions(@CurrentPrincipal() p: UserPrincipal, @Param('programId', ParseUUIDPipe) programId: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx.select({ id: improvementActions.id, scope: improvementActions.scope, targetId: improvementActions.targetId, title: improvementActions.title, detail: improvementActions.detail, status: improvementActions.status, dueOn: improvementActions.dueOn, ownerId: improvementActions.ownerId, owner: users.fullName, closedAt: improvementActions.closedAt }).from(improvementActions).leftJoin(users, eq(users.id, improvementActions.ownerId)).where(eq(improvementActions.programId, programId)).orderBy(asc(improvementActions.createdAt)),
    );
  }

  @Post('programs/:programId/actions')
  @Auth('user', MANAGE)
  addAction(@CurrentPrincipal() p: UserPrincipal, @Param('programId', ParseUUIDPipe) programId: string, @Body(new ZodBody(ActionBody)) body: z.infer<typeof ActionBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.obe.program(tx, programId);
      const [row] = await tx.insert(improvementActions).values({ tenantId: p.tenantId, programId, scope: body.scope, targetId: body.targetId, title: body.title, detail: body.detail ?? null, ownerId: body.ownerId ?? null, dueOn: body.dueOn ?? null, createdBy: p.userId }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'obe.action.created', subjectType: 'improvement_action', subjectId: row.id, data: { title: body.title } });
      return row;
    });
  }

  @Put('actions/:id')
  @Auth('user', MANAGE)
  updateAction(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ActionUpdate)) body: z.infer<typeof ActionUpdate>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(improvementActions).set({ ...body, ...(body.status ? { closedAt: body.status === 'done' ? new Date() : null } : {}) }).where(eq(improvementActions.id, id)).returning();
      if (!row) throw new NotFoundException('Action not found');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'obe.action.updated', subjectType: 'improvement_action', subjectId: id, data: { status: body.status } });
      return row;
    });
  }

  @Get('programs/:programId/evidence')
  @Auth('user', MANAGE)
  evidence(@CurrentPrincipal() p: UserPrincipal, @Param('programId', ParseUUIDPipe) programId: string, @Query('targetId') targetId?: string) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(obeEvidence).where(and(eq(obeEvidence.programId, programId), targetId ? eq(obeEvidence.targetId, targetId) : sql`true`)).orderBy(asc(obeEvidence.createdAt)));
  }

  @Post('programs/:programId/evidence')
  @Auth('user', MANAGE)
  addEvidence(@CurrentPrincipal() p: UserPrincipal, @Param('programId', ParseUUIDPipe) programId: string, @Body(new ZodBody(EvidenceBody)) body: z.infer<typeof EvidenceBody>) {
    if (!body.url && !body.note) throw new BadRequestException('Give a link or a note');
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.obe.program(tx, programId);
      const [row] = await tx.insert(obeEvidence).values({ tenantId: p.tenantId, programId, scope: body.scope, targetId: body.targetId, title: body.title, url: body.url ?? null, note: body.note ?? null, uploadedBy: p.userId }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'obe.evidence.added', subjectType: 'obe_evidence', subjectId: row.id });
      return row;
    });
  }

  // --- NAAC / NBA exports ----------------------------------------------------------------------------

  @Get('programs/:programId/report.csv')
  @Auth('user', MANAGE)
  async reportCsv(@CurrentPrincipal() p: UserPrincipal, @Param('programId', ParseUUIDPipe) programId: string, @Query('academicYearId', ParseUUIDPipe) academicYearId: string, @Res() res: Response) {
    const r = await this.db.withTenant(p.tenantId, async (tx) => {
      return this.reportData(tx, p, programId, academicYearId, 'csv');
    });
    const csv = toCsv([
      ['Section', 'Code', 'Statement / subject', 'Direct', 'Indirect', 'Attainment', 'Target', 'Gap', 'Met', 'Trend'],
      ...r.statements.map((s) => ['Outcome statement', `${s.kind.toUpperCase()} ${s.code}`, s.statement, '', '', '', '', '', '', '']),
      ...r.rows.map((x) => [x.scope === 'co' ? 'Course outcome attainment' : 'PO/PSO attainment', x.code, x.label, x.direct, x.indirect, x.combined, x.target, x.gap, x.met ? 'Yes' : 'No', x.trend]),
      ...r.matrix.map((m) => ['CO-PO matrix', m.co, m.outcome, '', '', m.strength, '', '', '', '']),
      ...r.actions.map((a) => ['Improvement action', a.target, a.title, '', '', '', '', '', a.status, '']),
    ]);
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', 'attachment; filename="obe-report.csv"');
    res.end(csv);
  }

  /** `framework` only changes the headings (NAAC criterion 2.6 / NBA criterion 3); the figures are the same. */
  @Get('programs/:programId/report.pdf')
  @Auth('user', MANAGE)
  async reportPdf(@CurrentPrincipal() p: UserPrincipal, @Param('programId', ParseUUIDPipe) programId: string, @Query('academicYearId', ParseUUIDPipe) academicYearId: string, @Res() res: Response, @Query('framework') framework = 'nba') {
    const r = await this.db.withTenant(p.tenantId, (tx) => this.reportData(tx, p, programId, academicYearId, 'pdf'));
    const nba = framework !== 'naac';
    const pdf = new PdfWriter();
    pdf.text(r.institution, { size: 16, bold: true, align: 'center' });
    pdf.text(nba ? 'NBA SAR - Criterion 3: Course Outcomes and Program Outcomes' : 'NAAC - Criterion II (2.6): Programme and Course Outcomes, Attainment', { size: 11, bold: true, align: 'center' });
    pdf.text(`${r.program} - ${r.year}`, { align: 'center' });
    pdf.rule();
    for (const [kind, title] of [['mission', 'Mission'], ['vision', 'Vision'], ['peo', 'Programme Educational Objectives'], ['po', 'Programme Outcomes'], ['pso', 'Programme Specific Outcomes']] as const) {
      const list = r.statements.filter((s) => s.kind === kind);
      if (!list.length) continue;
      pdf.gap(4);
      pdf.text(title, { bold: true, size: 11 });
      for (const s of list) pdf.paragraph(`${s.code}: ${s.statement}`, { size: 9 });
    }
    const table = (title: string, scope: 'co' | 'po') => {
      pdf.gap(6);
      pdf.text(title, { bold: true, size: 11 });
      const xs = [0, 110, 290, 340, 390, 440, 480];
      pdf.row(['Outcome', 'Subject / statement', 'Direct', 'Indirect', 'Level', 'Target', 'Met'], xs, { bold: true });
      pdf.rule();
      for (const x of r.rows.filter((y) => y.scope === scope)) pdf.row([x.code, x.label, String(x.direct ?? '-'), String(x.indirect ?? '-'), String(x.combined ?? '-'), String(x.target), x.met ? 'Yes' : 'No'], xs);
    };
    table('Course outcome attainment', 'co');
    table('Programme outcome attainment', 'po');
    if (r.actions.length) {
      pdf.gap(6);
      pdf.text('Improvement actions', { bold: true, size: 11 });
      for (const a of r.actions) pdf.paragraph(`[${a.status}] ${a.target}: ${a.title}`, { size: 9 });
    }
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', 'inline; filename="obe-report.pdf"');
    res.end(pdf.build());
  }

  private async reportData(tx: Tx, p: UserPrincipal, programId: string, academicYearId: string, format: string) {
    const prog = await this.obe.program(tx, programId);
    const [t] = await tx.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, p.tenantId));
    const [yr] = await tx.select({ label: academicYears.label }).from(academicYears).where(eq(academicYears.id, academicYearId));
    const statements = await tx.select().from(programOutcomes).where(eq(programOutcomes.programId, programId)).orderBy(asc(programOutcomes.ord), asc(programOutcomes.code));
    const { rows } = await this.obe.latest(tx, programId, academicYearId);
    const coRows = rows.filter((r) => r.scope === 'co');
    const cos = coRows.length ? await tx.select({ id: courseOutcomes.id, code: courseOutcomes.code, statement: courseOutcomes.statement }).from(courseOutcomes).where(inArray(courseOutcomes.id, coRows.map((r) => r.targetId))) : [];
    const poText = new Map(statements.map((s) => [s.id, s.statement]));
    const out = rows.map((r) => ({ ...r, label: (r.scope === 'co' ? cos.find((c) => c.id === r.targetId)?.statement : poText.get(r.targetId)) ?? '', trend: trend(r.previous, r.combined) }));
    const cells = cos.length ? await tx.select().from(coOutcomeMap).where(inArray(coOutcomeMap.coId, cos.map((c) => c.id))) : [];
    const acts = await tx.select().from(improvementActions).where(eq(improvementActions.programId, programId));
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'obe.report.exported', subjectType: 'program', subjectId: programId, data: { academicYearId, format } });
    const codeOf = new Map(rows.map((r) => [r.targetId, r.code]));
    return {
      institution: t?.name ?? '',
      program: prog.name,
      year: yr?.label ?? '',
      statements,
      rows: out,
      matrix: cells.map((c) => ({ co: codeOf.get(c.coId) ?? '', outcome: statements.find((s) => s.id === c.outcomeId)?.code ?? '', strength: c.strength })),
      actions: acts.map((a) => ({ title: a.title, status: a.status, target: codeOf.get(a.targetId) ?? statements.find((s) => s.id === a.targetId)?.code ?? '' })),
    };
  }

  private async assertCoEditor(tx: Tx, p: UserPrincipal, subjectId: string) {
    const [s] = await tx.select({ id: subjects.id }).from(subjects).where(eq(subjects.id, subjectId));
    if (!s) throw new NotFoundException('Subject not found');
    if (isSchoolAdmin(p) || (await headsSubject(tx, p, subjectId))) return;
    const [slot] = await tx.execute<{ n: number }>(sql`select count(*)::int as n from timetable_slots where subject_id = ${subjectId}::uuid and teacher_id = ${p.userId}::uuid`).then((r) => r.rows);
    if (!slot || slot.n === 0) throw new ForbiddenException('Only the subject teacher, head of department or principal can change course outcomes');
  }

  private async editableSet(tx: Tx, p: UserPrincipal, setId: string) {
    const [set] = await tx.select().from(coSets).where(eq(coSets.id, setId));
    if (!set) throw new NotFoundException('Version not found');
    await this.assertCoEditor(tx, p, set.subjectId);
    if (set.status !== 'draft') throw new ConflictException('Only a draft version can be changed; start a new version');
    return set;
  }
}
