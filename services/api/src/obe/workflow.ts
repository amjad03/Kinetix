import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal, TEACHING_ROLES } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { lmsQuizQuestions } from '../db/schema-life.js';
import { coSetReviews, obeAssignments, OBE_FRAMEWORKS, obePolicies, obePrograms } from '../db/schema-obe-flagship.js';
import { academicYears, coOutcomeMap, coSets, courseOutcomes, departments, programOutcomes, programs, subjects, surveyQuestions, userRoles, users } from '../db/schema.js';
import { headedDepartmentIds, headsSubject } from '../departments/departments.controller.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { isSchoolAdmin } from '../teacher/teacher.service.js';
import { APPORTION, CO_METHODS, PO_METHODS, validateConfig, withDefaults } from './attainment.js';
import { BLOOM_LEVELS, checkCo, suggestCo, verbsFor } from './bloom.js';
import { ObeService } from './obe.service.js';
import { OUTCOME_PRESETS, presetByKey } from './presets.js';

/** Who may make a draft live without the workflow (and who takes the IQAC step). */
export const OBE_ACTIVATORS: RoleName[] = ['tenant_admin', 'principal', 'quality_officer'];
const OBE_ADMIN: RoleName[] = ['tenant_admin', 'principal', 'quality_officer'];
const STAFF: RoleName[] = [...TEACHING_ROLES, 'tenant_admin', 'quality_officer'];
export const STAGES = ['hod', 'coordinator', 'iqac'] as const;
type Stage = (typeof STAGES)[number];

/**
 * Makes a draft CO version live: retires the version before it, marks the draft approved, and moves the CO tags of
 * question papers, assessments, LMS questions and survey questions from the retired COs to the new COs of the same code,
 * so this year's evidence keeps counting.
 */
export async function activateCoSet(tx: Tx, p: UserPrincipal, set: typeof coSets.$inferSelect, note: string) {
  const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(courseOutcomes).where(eq(courseOutcomes.coSetId, set.id));
  if (n === 0) throw new BadRequestException('Add at least one course outcome first');
  const old = await tx.select({ id: coSets.id }).from(coSets).where(and(eq(coSets.subjectId, set.subjectId), eq(coSets.status, 'active')));
  if (old.length) {
    const before = await tx.select({ id: courseOutcomes.id, code: courseOutcomes.code }).from(courseOutcomes).where(inArray(courseOutcomes.coSetId, old.map((o) => o.id)));
    const now = new Map((await tx.select({ id: courseOutcomes.id, code: courseOutcomes.code }).from(courseOutcomes).where(eq(courseOutcomes.coSetId, set.id))).map((c) => [c.code, c.id]));
    for (const b of before) {
      const to = now.get(b.code);
      if (!to) continue;
      await tx.execute(sql`update assessment_question_cos q set co_id = ${to}::uuid where co_id = ${b.id}::uuid and not exists (select 1 from assessment_question_cos x where x.question_id = q.question_id and x.co_id = ${to}::uuid)`);
      await tx.execute(sql`update assessment_co_map a set co_id = ${to}::uuid where co_id = ${b.id}::uuid and not exists (select 1 from assessment_co_map x where x.assessment_id = a.assessment_id and x.co_id = ${to}::uuid)`);
      await tx.update(lmsQuizQuestions).set({ coId: to }).where(eq(lmsQuizQuestions.coId, b.id));
      await tx.update(surveyQuestions).set({ coId: to }).where(eq(surveyQuestions.coId, b.id));
    }
    await tx.update(coSets).set({ status: 'retired' }).where(inArray(coSets.id, old.map((o) => o.id)));
  }
  await tx.update(coSets).set({ status: 'active', activatedAt: new Date(), reviewStage: 'approved' }).where(eq(coSets.id, set.id));
  await tx.insert(coSetReviews).values({ tenantId: p.tenantId, coSetId: set.id, stage: 'approved', decision: 'activated', comment: note, actorId: p.userId });
  await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'obe.coset.activated', subjectType: 'co_set', subjectId: set.id, data: { version: set.version } });
}

/** The programmes a person coordinates OBE for. */
export async function coordinatedPrograms(tx: Tx, userId: string): Promise<string[]> {
  return (await tx.select({ id: obeAssignments.programId }).from(obeAssignments).where(and(eq(obeAssignments.userId, userId), eq(obeAssignments.role, 'coordinator')))).map((r) => r.id);
}

/** Whether a person may decide at a stage of a course's CO approval. */
export async function canDecide(tx: Tx, p: UserPrincipal, subjectId: string, stage: string): Promise<boolean> {
  if (isSchoolAdmin(p)) return true;
  if (stage === 'hod') return headsSubject(tx, p, subjectId);
  if (stage === 'coordinator') {
    const [s] = await tx.select({ programId: subjects.programId }).from(subjects).where(eq(subjects.id, subjectId));
    return !!s && (await coordinatedPrograms(tx, p.userId)).includes(s.programId);
  }
  if (stage === 'iqac') return p.roles.includes('quality_officer');
  return false;
}

/** The subject teacher (timetabled), a course coordinator, its head of department or a leader may write its COs. */
export async function assertCoEditor(tx: Tx, p: UserPrincipal, subjectId: string) {
  const [s] = await tx.select({ id: subjects.id, programId: subjects.programId }).from(subjects).where(eq(subjects.id, subjectId));
  if (!s) throw new NotFoundException('Subject not found');
  if (isSchoolAdmin(p) || p.roles.includes('quality_officer') || (await headsSubject(tx, p, subjectId))) return;
  const [slot] = await tx.execute<{ n: number }>(sql`select count(*)::int as n from timetable_slots where subject_id = ${subjectId}::uuid and teacher_id = ${p.userId}::uuid`).then((r) => r.rows);
  if (slot && slot.n > 0) return;
  const [a] = await tx.select({ id: obeAssignments.id }).from(obeAssignments).where(and(eq(obeAssignments.userId, p.userId), eq(obeAssignments.programId, s.programId), sql`(${obeAssignments.subjectId} = ${subjectId}::uuid or ${obeAssignments.role} = 'coordinator')`));
  if (!a) throw new ForbiddenException('Only the subject teacher, course coordinator, head of department or principal can change course outcomes');
}

const SubmitBody = z.object({ comment: z.string().trim().max(1000).optional() });
const ReviewBody = z.object({ decision: z.enum(['approve', 'return', 'comment']), comment: z.string().trim().max(1000).optional(), coId: z.uuid().optional() });
const FrameworkBody = z.object({ framework: z.enum(OBE_FRAMEWORKS) });
const PresetBody = z.object({ key: z.string().trim().min(1).max(60) });
const SuggestBody = z.object({ statement: z.string().trim().min(1).max(1000), bloomLevel: z.string().trim().max(40).optional() });
const PolicyBody = z.object({
  scope: z.enum(['institution', 'program', 'subject']),
  programId: z.uuid().optional(),
  subjectId: z.uuid().optional(),
  note: z.string().trim().max(500).optional(),
  effectiveFromYearId: z.uuid().optional(),
  config: z.object({
    studentThresholdPercent: z.number().gt(0).max(100),
    levels: z.array(z.object({ level: z.number().min(0).max(10), minStudentsPercent: z.number().min(0).max(100) })).min(1).max(10),
    evidenceWeights: z.record(z.string().max(30), z.number().min(0).max(100)),
    directWeight: z.number().min(0).max(100),
    indirectWeight: z.number().min(0).max(100),
    maxLevel: z.number().positive().max(10),
    targetLevel: z.number().min(0).max(10),
    decimals: z.number().int().min(0).max(4),
    coMethod: z.enum(CO_METHODS),
    poMethod: z.enum(PO_METHODS),
    seeApportion: z.enum(APPORTION),
    includeLms: z.boolean(),
  }),
});

/**
 * The CO approval workflow (teacher → head of department → OBE coordinator → IQAC, with comments and returns), the
 * approval queue, Bloom verb suggestions, programme outcome presets and frameworks, attainment policies with their
 * history at institution, programme and course level, and the signed-in person's OBE roles.
 */
@Controller('v1/obe')
export class ObeWorkflowController {
  constructor(
    private readonly db: DbService,
    private readonly obe: ObeService,
    private readonly notifications: NotificationsService,
  ) {}

  /** What the person does in OBE: the programmes they coordinate, the courses they coordinate or teach, the departments they head, IQAC. */
  @Get('me')
  @Auth('user', [...STAFF, 'principal', 'hod'])
  me(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const mine = await tx.select({ programId: obeAssignments.programId, role: obeAssignments.role, subjectId: obeAssignments.subjectId }).from(obeAssignments).where(eq(obeAssignments.userId, p.userId));
      const teaches = (await tx.execute<{ subject_id: string }>(sql`select distinct subject_id from timetable_slots where teacher_id = ${p.userId}::uuid and subject_id is not null`)).rows.map((r) => r.subject_id);
      return {
        roles: p.roles,
        admin: isSchoolAdmin(p),
        iqac: p.roles.includes('quality_officer'),
        coordinatorOf: mine.filter((m) => m.role === 'coordinator').map((m) => m.programId),
        courseCoordinatorOf: mine.filter((m) => m.role === 'course_coordinator' && m.subjectId).map((m) => m.subjectId!),
        headOf: p.roles.includes('hod') ? await headedDepartmentIds(tx, p.userId) : [],
        teaches,
      };
    });
  }

  // ---- approval workflow ---------------------------------------------------------------------------------------------

  /** Sends a draft (or a returned draft) for approval; it is locked for editing while it is reviewed. */
  @Post('co-sets/:id/submit')
  @HttpCode(200)
  @Auth('user', STAFF)
  submit(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(SubmitBody)) body: z.infer<typeof SubmitBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const set = await this.set(tx, id);
      await assertCoEditor(tx, p, set.subjectId);
      if (set.status !== 'draft') throw new ConflictException('Only a draft version can be sent for approval');
      if (set.reviewStage !== 'draft' && set.reviewStage !== 'returned') throw new ConflictException('This version is already being reviewed');
      const cos = await tx.select().from(courseOutcomes).where(eq(courseOutcomes.coSetId, id));
      if (!cos.length) throw new BadRequestException('Add at least one course outcome first');
      const [{ mapped }] = await tx.select({ mapped: sql<number>`count(distinct ${coOutcomeMap.coId})::int` }).from(coOutcomeMap).where(inArray(coOutcomeMap.coId, cos.map((c) => c.id)));
      const unmapped = cos.length - mapped;
      const stage = await this.nextStage(tx, set.subjectId, null);
      await tx.update(coSets).set({ reviewStage: stage, submittedAt: new Date(), submittedBy: p.userId }).where(eq(coSets.id, id));
      await tx.insert(coSetReviews).values({ tenantId: p.tenantId, coSetId: id, stage, decision: 'submitted', comment: body.comment ?? null, actorId: p.userId });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'obe.coset.submitted', subjectType: 'co_set', subjectId: id, data: { stage } });
      await this.tellApprovers(tx, set.subjectId, stage, id);
      const warnings = [...cos.filter((c) => !checkCo(c.statement, c.bloomLevel).ok).map((c) => `${c.code}: check the action verb`), ...(unmapped > 0 ? [`${unmapped} CO(s) are not mapped to any PO or PSO`] : [])];
      return { reviewStage: stage, warnings };
    });
  }

  /** Approves (moving to the next step; the IQAC approval makes the version live), returns with a comment, or comments. */
  @Post('co-sets/:id/review')
  @HttpCode(200)
  @Auth('user', [...STAFF, 'principal', 'hod'])
  review(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ReviewBody)) body: z.infer<typeof ReviewBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const set = await this.set(tx, id);
      if (body.coId) {
        const [co] = await tx.select({ id: courseOutcomes.id }).from(courseOutcomes).where(and(eq(courseOutcomes.id, body.coId), eq(courseOutcomes.coSetId, id)));
        if (!co) throw new BadRequestException('That CO is not in this version');
      }
      const stage = set.reviewStage;
      const inReview = (STAGES as readonly string[]).includes(stage);
      if (body.decision === 'comment') {
        if (!body.comment) throw new BadRequestException('Write the comment');
        if (!inReview && !(await canDecide(tx, p, set.subjectId, 'hod')) && !p.roles.includes('quality_officer')) await assertCoEditor(tx, p, set.subjectId);
        await tx.insert(coSetReviews).values({ tenantId: p.tenantId, coSetId: id, stage, decision: 'comment', comment: body.comment, coId: body.coId ?? null, actorId: p.userId });
        return { reviewStage: stage };
      }
      if (!inReview) throw new ConflictException('This version is not waiting for approval');
      if (!(await canDecide(tx, p, set.subjectId, stage))) throw new ForbiddenException(stage === 'hod' ? 'Only the head of the department can approve at this step' : stage === 'coordinator' ? 'Only the programme’s OBE coordinator can approve at this step' : 'Only the IQAC can give the final approval');
      if (set.submittedBy === p.userId && !isSchoolAdmin(p)) throw new ForbiddenException('You cannot approve outcomes you sent for approval');
      if (body.decision === 'return') {
        if (!body.comment) throw new BadRequestException('Say what needs to change when returning');
        await tx.update(coSets).set({ reviewStage: 'returned' }).where(eq(coSets.id, id));
        await tx.insert(coSetReviews).values({ tenantId: p.tenantId, coSetId: id, stage, decision: 'returned', comment: body.comment, coId: body.coId ?? null, actorId: p.userId });
        await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'obe.coset.returned', subjectType: 'co_set', subjectId: id, data: { stage } });
        if (set.submittedBy) await this.notifications.notifyUsers(tx, [set.submittedBy], { kind: 'task', text: { title: 'Course outcomes returned', body: body.comment.slice(0, 160) }, data: { coSetId: id }, dedupeKey: `obe-returned:${id}:${Date.now()}` });
        return { reviewStage: 'returned' };
      }
      await tx.insert(coSetReviews).values({ tenantId: p.tenantId, coSetId: id, stage, decision: 'approved', comment: body.comment ?? null, coId: body.coId ?? null, actorId: p.userId });
      const next = await this.nextStage(tx, set.subjectId, stage as Stage);
      if (next === 'approved') {
        await activateCoSet(tx, p, set, 'Approved by the IQAC');
        if (set.submittedBy) await this.notifications.notifyUsers(tx, [set.submittedBy], { kind: 'task', text: { title: 'Course outcomes approved', body: 'Your course outcomes are approved and now in use.' }, data: { coSetId: id }, dedupeKey: `obe-approved:${id}` });
        return { reviewStage: 'approved', status: 'active' };
      }
      await tx.update(coSets).set({ reviewStage: next }).where(eq(coSets.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'obe.coset.approved', subjectType: 'co_set', subjectId: id, data: { stage, next } });
      await this.tellApprovers(tx, set.subjectId, next, id);
      return { reviewStage: next };
    });
  }

  /** The review history of a version (submissions, approvals, returns and comments), with whether the reader may decide now. */
  @Get('co-sets/:id/reviews')
  @Auth('user', [...STAFF, 'principal', 'hod'])
  reviews(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const set = await this.set(tx, id);
      const rows = await tx
        .select({ id: coSetReviews.id, stage: coSetReviews.stage, decision: coSetReviews.decision, comment: coSetReviews.comment, coId: coSetReviews.coId, co: courseOutcomes.code, actor: users.fullName, at: coSetReviews.createdAt })
        .from(coSetReviews)
        .leftJoin(users, eq(users.id, coSetReviews.actorId))
        .leftJoin(courseOutcomes, eq(courseOutcomes.id, coSetReviews.coId))
        .where(eq(coSetReviews.coSetId, id))
        .orderBy(asc(coSetReviews.createdAt));
      const inReview = (STAGES as readonly string[]).includes(set.reviewStage);
      return { set: { id: set.id, version: set.version, status: set.status, reviewStage: set.reviewStage, submittedAt: set.submittedAt }, canDecide: inReview && (await canDecide(tx, p, set.subjectId, set.reviewStage)) && (set.submittedBy !== p.userId || isSchoolAdmin(p)), history: rows };
    });
  }

  /** CO versions waiting at a step the person can decide (all of them for leaders). */
  @Get('approvals')
  @Auth('user', [...STAFF, 'principal', 'hod'])
  approvals(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ id: coSets.id, version: coSets.version, stage: coSets.reviewStage, submittedAt: coSets.submittedAt, subjectId: subjects.id, subject: subjects.name, code: subjects.code, term: subjects.term, programId: programs.id, program: programs.name, submittedBy: users.fullName, cos: sql<number>`(select count(*)::int from course_outcomes c where c.co_set_id = ${coSets.id})` })
        .from(coSets)
        .innerJoin(subjects, eq(subjects.id, coSets.subjectId))
        .innerJoin(programs, eq(programs.id, subjects.programId))
        .leftJoin(users, eq(users.id, coSets.submittedBy))
        .where(inArray(coSets.reviewStage, [...STAGES]))
        .orderBy(asc(coSets.submittedAt));
      const out = [];
      for (const r of rows) if (await canDecide(tx, p, r.subjectId, r.stage)) out.push(r);
      const cos = out.length ? await tx.select({ setId: courseOutcomes.coSetId, statement: courseOutcomes.statement, bloomLevel: courseOutcomes.bloomLevel }).from(courseOutcomes).where(inArray(courseOutcomes.coSetId, out.map((o) => o.id))) : [];
      return out.map((o) => ({ ...o, verbIssues: cos.filter((c) => c.setId === o.id && !checkCo(c.statement, c.bloomLevel).ok).length }));
    });
  }

  // ---- Bloom ------------------------------------------------------------------------------------------------------------

  /** Bloom's levels with their action verbs, preferred ones first. */
  @Get('bloom')
  @Auth('user', [...STAFF, 'principal', 'hod'])
  bloom() {
    return BLOOM_LEVELS.map((name, i) => ({ level: i + 1, name, verbs: verbsFor(i + 1) }));
  }

  /** The verb check of a CO statement with the claimed level's verbs and rewrites that use them. */
  @Post('suggest-co')
  @HttpCode(200)
  @Auth('user', [...STAFF, 'principal', 'hod'])
  suggest(@Body(new ZodBody(SuggestBody)) body: z.infer<typeof SuggestBody>) {
    return { check: checkCo(body.statement, body.bloomLevel), ...suggestCo(body.statement, body.bloomLevel) };
  }

  // ---- presets and frameworks --------------------------------------------------------------------------------------------

  @Get('presets')
  @Auth('user', [...STAFF, 'principal', 'hod'])
  presets() {
    return OUTCOME_PRESETS.map((p) => ({ key: p.key, label: p.label, framework: p.framework, outcomes: p.outcomes }));
  }

  /** Adds a preset's POs or PSOs the programme does not have yet (by code). */
  @Post('programs/:programId/presets')
  @HttpCode(200)
  @Auth('user', OBE_ADMIN)
  applyPreset(@CurrentPrincipal() p: UserPrincipal, @Param('programId', ParseUUIDPipe) programId: string, @Body(new ZodBody(PresetBody)) body: z.infer<typeof PresetBody>) {
    const preset = presetByKey(body.key);
    if (!preset) throw new BadRequestException('Unknown preset');
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.obe.program(tx, programId);
      const have = new Set((await tx.select({ kind: programOutcomes.kind, code: programOutcomes.code }).from(programOutcomes).where(eq(programOutcomes.programId, programId))).map((o) => `${o.kind}:${o.code}`));
      const todo = preset.outcomes.filter((o) => !have.has(`${o.kind}:${o.code}`));
      if (todo.length) await tx.insert(programOutcomes).values(todo.map((o) => ({ tenantId: p.tenantId, programId, kind: o.kind, code: o.code, statement: o.statement, ord: Number(o.code.replace(/\D/g, '')) || 0 })));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'obe.preset.applied', subjectType: 'program', subjectId: programId, data: { preset: body.key, added: todo.length } });
      return { added: todo.length, kept: preset.outcomes.length - todo.length };
    });
  }

  @Get('programs/:programId/framework')
  @Auth('user', [...STAFF, 'principal', 'hod'])
  getFramework(@CurrentPrincipal() p: UserPrincipal, @Param('programId', ParseUUIDPipe) programId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => ({ framework: await this.obe.framework(tx, programId) }));
  }

  /** The framework the programme reports to: NBA tier I or II (engineering), management, pharmacy, or NAAC. */
  @Put('programs/:programId/framework')
  @Auth('user', OBE_ADMIN)
  setFramework(@CurrentPrincipal() p: UserPrincipal, @Param('programId', ParseUUIDPipe) programId: string, @Body(new ZodBody(FrameworkBody)) body: z.infer<typeof FrameworkBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.obe.program(tx, programId);
      await tx.insert(obePrograms).values({ tenantId: p.tenantId, programId, framework: body.framework, updatedBy: p.userId }).onConflictDoUpdate({ target: obePrograms.programId, set: { framework: body.framework, updatedBy: p.userId, updatedAt: new Date() } });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'obe.framework.set', subjectType: 'program', subjectId: programId, data: body });
      return body;
    });
  }

  // ---- attainment policies --------------------------------------------------------------------------------------------

  /** The policy in force for an institution, programme or course (and the year), with every version at that level. */
  @Get('policies')
  @Auth('user', [...STAFF, 'principal', 'hod'])
  policies(@CurrentPrincipal() p: UserPrincipal, @Query('programId') programId?: string, @Query('subjectId') subjectId?: string, @Query('academicYearId') academicYearId?: string) {
    const ok = (v?: string) => !!v && z.uuid().safeParse(v).success;
    return this.db.withTenant(p.tenantId, async (tx) => {
      let pid = ok(programId) ? programId! : null;
      if (ok(subjectId)) {
        const [s] = await tx.select({ programId: subjects.programId }).from(subjects).where(eq(subjects.id, subjectId!));
        if (!s) throw new NotFoundException('Subject not found');
        pid = s.programId;
      }
      const scope = ok(subjectId) ? 'subject' : pid ? 'program' : 'institution';
      const where = scope === 'subject' ? and(eq(obePolicies.scope, 'subject'), eq(obePolicies.subjectId, subjectId!)) : scope === 'program' ? and(eq(obePolicies.scope, 'program'), eq(obePolicies.programId, pid!)) : eq(obePolicies.scope, 'institution');
      const history = await tx
        .select({ id: obePolicies.id, version: obePolicies.version, config: obePolicies.config, note: obePolicies.note, effectiveFrom: academicYears.label, effectiveFromYearId: obePolicies.effectiveFromYearId, createdBy: users.fullName, createdAt: obePolicies.createdAt })
        .from(obePolicies)
        .leftJoin(users, eq(users.id, obePolicies.createdBy))
        .leftJoin(academicYears, eq(academicYears.id, obePolicies.effectiveFromYearId))
        .where(where)
        .orderBy(desc(obePolicies.version));
      const effective = pid ? await this.obe.policy(tx, pid, ok(subjectId) ? subjectId : null, ok(academicYearId) ? academicYearId : null) : history[0] ? { config: withDefaults(history[0].config as never), source: { scope: 'institution', version: history[0].version, id: history[0].id } } : { config: withDefaults(null), source: { scope: 'default', version: null, id: null } };
      return { scope, effective, history };
    });
  }

  /** Saves a new version of the policy at a level (the old ones stay as history). Course policies may also be set by the course's head of department. */
  @Post('policies')
  @Auth('user', [...OBE_ADMIN, 'hod'])
  savePolicy(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(PolicyBody)) body: z.infer<typeof PolicyBody>) {
    const err = validateConfig(body.config);
    if (err) throw new BadRequestException(err);
    return this.db.withTenant(p.tenantId, async (tx) => {
      let programId: string | null = null;
      let subjectId: string | null = null;
      if (body.scope === 'subject') {
        if (!body.subjectId) throw new BadRequestException('Choose the course');
        const [s] = await tx.select({ programId: subjects.programId }).from(subjects).where(eq(subjects.id, body.subjectId));
        if (!s) throw new NotFoundException('Subject not found');
        if (!p.roles.some((r) => OBE_ADMIN.includes(r)) && !(await headsSubject(tx, p, body.subjectId))) throw new ForbiddenException('Only the head of the department or the IQAC can set a course’s rules');
        programId = s.programId;
        subjectId = body.subjectId;
      } else {
        if (!p.roles.some((r) => OBE_ADMIN.includes(r))) throw new ForbiddenException('Only the principal or the IQAC can set these rules');
        if (body.scope === 'program') {
          if (!body.programId) throw new BadRequestException('Choose the programme');
          await this.obe.program(tx, body.programId);
          programId = body.programId;
        }
      }
      const where = body.scope === 'subject' ? and(eq(obePolicies.scope, 'subject'), eq(obePolicies.subjectId, subjectId!)) : body.scope === 'program' ? and(eq(obePolicies.scope, 'program'), eq(obePolicies.programId, programId!)) : eq(obePolicies.scope, 'institution');
      const [{ v }] = await tx.select({ v: sql<number>`coalesce(max(${obePolicies.version}), 0)::int` }).from(obePolicies).where(where);
      const [row] = await tx.insert(obePolicies).values({ tenantId: p.tenantId, scope: body.scope, programId: body.scope === 'institution' ? null : programId, subjectId, version: v + 1, config: body.config, note: body.note ?? null, effectiveFromYearId: body.effectiveFromYearId ?? null, createdBy: p.userId }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'obe.policy.saved', subjectType: 'obe_policy', subjectId: row.id, data: { scope: body.scope, version: row.version, programId, subjectId } });
      return row;
    });
  }

  private async set(tx: Tx, id: string) {
    const [set] = await tx.select().from(coSets).where(eq(coSets.id, id));
    if (!set) throw new NotFoundException('Version not found');
    return set;
  }

  /** The step after `from`: skips the head of department when the course's department has none, and the coordinator when the programme has none. */
  private async nextStage(tx: Tx, subjectId: string, from: Stage | null): Promise<Stage | 'approved'> {
    const order: Stage[] = ['hod', 'coordinator', 'iqac'];
    const [s] = await tx.select({ programId: subjects.programId, head: departments.headUserId }).from(subjects).leftJoin(departments, eq(departments.id, subjects.departmentId)).where(eq(subjects.id, subjectId));
    const hasCoordinator = !!s && (await tx.select({ id: obeAssignments.id }).from(obeAssignments).where(and(eq(obeAssignments.programId, s.programId), eq(obeAssignments.role, 'coordinator'))).limit(1)).length > 0;
    for (const st of order.slice(from ? order.indexOf(from) + 1 : 0)) {
      if (st === 'hod' && !s?.head) continue;
      if (st === 'coordinator' && !hasCoordinator) continue;
      return st;
    }
    return 'approved';
  }

  /** Tells the people who decide at a step that a version is waiting for them. */
  private async tellApprovers(tx: Tx, subjectId: string, stage: Stage | 'approved', setId: string) {
    if (stage === 'approved') return;
    const [s] = await tx.select({ name: subjects.name, programId: subjects.programId, head: departments.headUserId }).from(subjects).leftJoin(departments, eq(departments.id, subjects.departmentId)).where(eq(subjects.id, subjectId));
    if (!s) return;
    const to =
      stage === 'hod'
        ? s.head
          ? [s.head]
          : []
        : stage === 'coordinator'
          ? (await tx.select({ id: obeAssignments.userId }).from(obeAssignments).where(and(eq(obeAssignments.programId, s.programId), eq(obeAssignments.role, 'coordinator')))).map((r) => r.id)
          : (await tx.select({ id: userRoles.userId }).from(userRoles).where(eq(userRoles.role, 'quality_officer'))).map((r) => r.id);
    await this.notifications.notifyUsers(tx, [...new Set(to)], { kind: 'task', text: { title: `Course outcomes to approve: ${s.name}`, body: 'Review the course outcomes and their CO-PO mapping, then approve or return them with comments.' }, data: { coSetId: setId }, dedupeKey: `obe-review:${setId}:${stage}` });
  }
}
