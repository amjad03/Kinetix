import { BadRequestException, ForbiddenException, Injectable, OnModuleInit } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { audit } from '../common/audit.js';
import type { RoleName } from '../auth/principal.js';
import { obeAssignments, obeCurriculumGaps } from '../db/schema-obe-flagship.js';
import { academicYears, coOutcomeMap, coSets, courseOutcomes, improvementActions, obeEvidence, obeSurveys, programOutcomes, programs, subjects } from '../db/schema.js';
import { headsSubject } from '../departments/departments.controller.js';
import { qualitySettings } from '../quality-hub/settings.catalogue.js';
import { RecordRegistry, type FieldOption, type KitCtx } from '../records/entity.js';
import { choices, kitEntity, rowOf } from '../research/kit.js';
import { isSchoolAdmin } from '../teacher/teacher.service.js';
import { BLOOM_LEVELS } from './bloom.js';

const MANAGE: RoleName[] = ['tenant_admin', 'principal', 'quality_officer', 'hod'];
const ADMIN: RoleName[] = ['tenant_admin', 'principal', 'quality_officer'];

const programOptions = async (ctx: KitCtx): Promise<FieldOption[]> => (await ctx.tx.select({ id: programs.id, name: programs.name }).from(programs).orderBy(asc(programs.name))).map((p) => ({ value: p.id, label: p.name }));
const yearOptions = async (ctx: KitCtx): Promise<FieldOption[]> => (await ctx.tx.select({ id: academicYears.id, label: academicYears.label }).from(academicYears).orderBy(sql`${academicYears.startsOn} desc`)).map((y) => ({ value: y.id, label: y.label }));
const subjectOptions = async (ctx: KitCtx): Promise<FieldOption[]> =>
  (await ctx.tx.select({ id: subjects.id, code: subjects.code, name: subjects.name, program: programs.name, term: subjects.term }).from(subjects).innerJoin(programs, eq(programs.id, subjects.programId)).orderBy(asc(programs.name), asc(subjects.term), asc(subjects.code))).map((s) => ({ value: s.id, label: `${s.code} ${s.name}`, group: `${s.program} · ${s.term}` }));

const VerifyParams = z.object({ note: z.string().trim().max(1000).optional() }).optional();

/**
 * The IQAC (or principal) verifies a done action: the action taken must be written down with its date and backed by
 * evidence or a re-measurement, and the owner cannot verify their own action. Verification closes the action-taken
 * report entry; reopening the action withdraws it.
 */
export async function verifyAction(ctx: KitCtx, id: string, note?: string): Promise<string> {
  const r = await rowOf(ctx, improvementActions, id);
  if (r.status !== 'done') throw new BadRequestException('Only a done action can be verified');
  if (r.verifiedAt) throw new BadRequestException('This action is already verified');
  if (r.ownerId === ctx.p.userId) throw new ForbiddenException('Someone other than the owner must verify this action');
  if (!String(r.actionTaken ?? '').trim() || !r.takenOn) throw new BadRequestException('Record the action taken and its date first');
  const [{ n }] = await ctx.tx.select({ n: sql<number>`count(*)::int` }).from(obeEvidence).where(and(eq(obeEvidence.scope, 'action'), eq(obeEvidence.targetId, id)));
  if (n === 0 && (r.remeasuredValue === null || r.remeasuredValue === undefined)) throw new BadRequestException('Add evidence or the re-measured attainment before verifying');
  await ctx.tx.update(improvementActions).set({ verifiedAt: new Date(), verifiedBy: ctx.p.userId, verifyNote: note?.trim() || null }).where(eq(improvementActions.id, id));
  await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: 'obe.action.verified', subjectType: 'improvement_action', subjectId: id, data: { evidence: n } });
  return 'Verified';
}

const STATEMENT_KINDS = ['vision', 'mission', 'peo', 'po', 'pso'] as const;

/**
 * A programme's vision, mission, PEOs, POs and PSOs as a record kit list: add, edit, bulk, Excel import (keyed by
 * programme, kind and code) and export, history and delete. A PO or PSO mapped from course outcomes, or a PEO or mission
 * element in the PEO-mission matrix, cannot be deleted. Published versions of the statements stay on the PEOs page.
 */
export function obeStatementsEntity() {
  return kitEntity({
    key: 'obe-statements',
    module: 'obe',
    table: programOutcomes,
    subjectType: 'program_outcome',
    roles: { read: MANAGE, write: ADMIN },
    title: 'code',
    label: (r) => `${String(r.program ?? '')} ${String(r.code ?? '')}`.trim(),
    fields: {
      programId: { label: 'Programme', kind: 'ref', column: programOutcomes.programId, options: programOptions, required: true, filter: true, edit: false },
      kind: { label: 'Kind', kind: 'select', column: programOutcomes.kind, options: choices([...STATEMENT_KINDS], { vision: 'Vision', mission: 'Mission', peo: 'PEO', po: 'PO', pso: 'PSO' }), required: true, filter: true, edit: false },
      code: { label: 'Code', kind: 'text', column: programOutcomes.code, required: true, max: 16, example: 'PO1' },
      statement: { label: 'Statement', kind: 'textarea', column: programOutcomes.statement, required: true, max: 1000 },
      ord: { label: 'Order', kind: 'number', column: programOutcomes.ord, min: 0, max: 200, int: true, bulk: true, example: '1' },
    },
    extra: {
      program: sql<string>`(select p.name from programs p where p.id = ${programOutcomes.programId})`,
      mapped: sql<number>`(select count(*)::int from co_outcome_map m join course_outcomes c on c.id = m.co_id join co_sets cs on cs.id = c.co_set_id where m.outcome_id = "program_outcomes"."id" and cs.status = 'active')`,
    },
    search: [programOutcomes.code, programOutcomes.statement],
    defaultSort: { id: 'kind', dir: 'asc' },
    importKey: ['programId', 'kind', 'code'],
    remove: {
      guard: async (ctx, id) => {
        const [m] = await ctx.tx.select({ n: sql<number>`count(*)::int` }).from(coOutcomeMap).where(eq(coOutcomeMap.outcomeId, id));
        if (m.n > 0) return `Course outcomes are mapped to this statement (${m.n} mappings); remove them from the course articulation matrices first`;
        const [pm] = (await ctx.tx.execute<{ n: number }>(sql`select count(*)::int as n from peo_mission_map where peo_id = ${id}::uuid or mission_id = ${id}::uuid`)).rows;
        return pm && pm.n > 0 ? 'This statement is in the PEO-mission matrix; clear it there first' : null;
      },
    },
    validate: async (ctx, id) => {
      const r = await rowOf(ctx, programOutcomes, id);
      const code = String(r.code ?? '').trim().toUpperCase();
      if (!/^[A-Z0-9][A-Z0-9 .-]{0,15}$/.test(code)) return 'Use a short code such as PO1, PSO2 or PEO3';
      if (code !== r.code) await ctx.tx.update(programOutcomes).set({ code }).where(eq(programOutcomes.id, id));
      if (String(r.statement ?? '').trim().length < 3) return 'Write the statement';
      if (!r.ord) {
        const digits = Number(code.replace(/\D/g, ''));
        if (digits) await ctx.tx.update(programOutcomes).set({ ord: digits }).where(eq(programOutcomes.id, id));
      }
      return null;
    },
  });
}

/**
 * OBE improvement actions (the CQI loop) as a record kit list across programmes: owner, due date and status in bulk,
 * the root cause, the figure before, the target, the action taken and the re-measurement for the next offering.
 * Actions are opened from attainment gaps (OBE quality page or "from gaps"), so the list has no Add.
 */
export function obeActionsEntity() {
  return kitEntity({
    key: 'obe-actions',
    module: 'obe',
    table: improvementActions,
    subjectType: 'improvement_action',
    roles: { read: MANAGE, write: MANAGE },
    title: 'title',
    fields: {
      title: { label: 'Action', kind: 'text', column: improvementActions.title, required: true, max: 200, create: false, noImport: true },
      detail: { label: 'Detail', kind: 'textarea', column: improvementActions.detail, max: 2000, create: false },
      ownerId: { label: 'Owner', kind: 'user', column: improvementActions.ownerId, bulk: true, create: false, filter: true },
      dueOn: { label: 'Due on', kind: 'date', column: improvementActions.dueOn, bulk: true, create: false },
      status: { label: 'Status', kind: 'select', column: improvementActions.status, options: choices(['open', 'in_progress', 'done']), bulk: true, create: false },
      rootCause: { label: 'Root cause', kind: 'textarea', column: improvementActions.rootCause, max: 2000, create: false },
      actionTaken: { label: 'Action taken', kind: 'textarea', column: improvementActions.actionTaken, max: 3000, create: false },
      takenOn: { label: 'Taken on', kind: 'date', column: improvementActions.takenOn, create: false },
      baselineValue: { label: 'Attainment before', kind: 'number', column: improvementActions.baselineValue, min: 0, max: 100, create: false },
      targetValue: { label: 'Target', kind: 'number', column: improvementActions.targetValue, min: 0, max: 100, create: false },
      remeasureOn: { label: 'Re-measure on', kind: 'date', column: improvementActions.remeasureOn, create: false },
      remeasuredValue: { label: 'Attainment after', kind: 'number', column: improvementActions.remeasuredValue, min: 0, max: 100, create: false },
      remeasureNote: { label: 'Re-measurement note', kind: 'textarea', column: improvementActions.remeasureNote, max: 2000, create: false },
      verifiedAt: { label: 'Verified on', kind: 'datetime', column: improvementActions.verifiedAt, create: false, edit: false, noImport: true },
      verifyNote: { label: 'Verification note', kind: 'textarea', column: improvementActions.verifyNote, max: 1000, create: false, edit: false, noImport: true },
      programId: { label: 'Programme', kind: 'ref', column: improvementActions.programId, options: programOptions, create: false, edit: false, filter: true, noImport: true },
      academicYearId: { label: 'Year of the gap', kind: 'ref', column: improvementActions.academicYearId, options: yearOptions, create: false, edit: false, filter: true, noImport: true },
    },
    extra: {
      code: improvementActions.code,
      scope: improvementActions.scope,
      program: sql<string>`(select p.name from programs p where p.id = ${improvementActions.programId})`,
      year: sql<string | null>`(select y.label from academic_years y where y.id = ${improvementActions.academicYearId})`,
      evidence: sql<number>`(select count(*)::int from obe_evidence e where e.scope = 'action' and e.target_id = "improvement_actions"."id")`,
      closed: sql<boolean>`${improvementActions.remeasuredValue} is not null and ${improvementActions.targetValue} is not null and ${improvementActions.remeasuredValue} >= ${improvementActions.targetValue}`,
      verifiedByName: sql<string | null>`(select u.full_name from users u where u.id = ${improvementActions.verifiedBy})`,
      /** Where the action is in its loop: identified, assigned, in progress, evidence added, done, verified. */
      stage: sql<string>`case when ${improvementActions.verifiedAt} is not null then 'verified' when ${improvementActions.status} = 'done' then 'done' when exists (select 1 from obe_evidence e where e.scope = 'action' and e.target_id = "improvement_actions"."id") or ${improvementActions.actionTaken} is not null then 'evidence' when ${improvementActions.status} = 'in_progress' then 'in_progress' when ${improvementActions.ownerId} is not null then 'assigned' else 'identified' end`,
    },
    filters: {
      overdue: { label: 'Overdue', options: choices(['yes']), where: (v) => (v === 'yes' ? sql`${improvementActions.status} <> 'done' and ${improvementActions.dueOn} < current_date` : undefined) },
      verified: { label: 'Verified', options: choices(['yes', 'no', 'waiting']), where: (v) => (v === 'yes' ? sql`${improvementActions.verifiedAt} is not null` : v === 'no' ? sql`${improvementActions.verifiedAt} is null` : v === 'waiting' ? sql`${improvementActions.verifiedAt} is null and ${improvementActions.status} = 'done'` : undefined) },
    },
    actions: {
      verify: {
        label: 'Verify the action taken',
        roles: ADMIN,
        params: VerifyParams,
        inputs: [{ key: 'note', label: 'Verification note', type: 'textarea' }],
        apply: async (ctx, id, params) => verifyAction(ctx, id, (params as z.infer<typeof VerifyParams> | undefined)?.note),
      },
    },
    search: [improvementActions.title, improvementActions.code, improvementActions.detail, improvementActions.rootCause, improvementActions.actionTaken],
    defaultSort: { id: 'dueOn', dir: 'asc' },
    noImport: true,
    validate: async (ctx, id) => {
      const r = await rowOf(ctx, improvementActions, id);
      if (r.status === 'done' && (await qualitySettings(ctx.tx, ctx.p.tenantId, 'obe')).rules.requireRootCause && !String(r.rootCause ?? '').trim()) return 'Record the root cause before closing this action';
      // Reopening a verified action withdraws the verification.
      if (r.status !== 'done' && r.verifiedAt) await ctx.tx.update(improvementActions).set({ verifiedAt: null, verifiedBy: null, verifyNote: null }).where(eq(improvementActions.id, id));
      if (r.remeasuredValue !== null && r.remeasuredValue !== undefined && !r.remeasuredAt) await ctx.tx.update(improvementActions).set({ remeasuredAt: new Date() }).where(eq(improvementActions.id, id));
      const done = r.status === 'done';
      if (done !== !!r.closedAt) await ctx.tx.update(improvementActions).set({ closedAt: done ? new Date() : null }).where(eq(improvementActions.id, id));
      return null;
    },
  });
}

/** Curricular gaps against the POs and content delivered beyond the syllabus (NBA criterion 2.1, NAAC 1.3). */
export function obeGapsEntity() {
  return kitEntity({
    key: 'obe-gaps',
    module: 'obe',
    table: obeCurriculumGaps,
    subjectType: 'obe_curriculum_gap',
    roles: { read: MANAGE, write: MANAGE },
    title: 'title',
    fields: {
      programId: { label: 'Programme', kind: 'ref', column: obeCurriculumGaps.programId, options: programOptions, required: true, filter: true },
      kind: { label: 'Kind', kind: 'select', column: obeCurriculumGaps.kind, options: choices(['gap', 'beyond_syllabus'], { gap: 'Curricular gap', beyond_syllabus: 'Content beyond the syllabus' }), required: true, filter: true },
      title: { label: 'Gap or topic', kind: 'text', column: obeCurriculumGaps.title, required: true, max: 200 },
      description: { label: 'How it was identified and addressed', kind: 'textarea', column: obeCurriculumGaps.description, max: 3000 },
      subjectId: { label: 'Course', kind: 'ref', column: obeCurriculumGaps.subjectId, options: subjectOptions },
      academicYearId: { label: 'Academic year', kind: 'ref', column: obeCurriculumGaps.academicYearId, options: yearOptions, filter: true },
      outcomeCodes: { label: 'POs and PSOs served', kind: 'tags', column: obeCurriculumGaps.outcomeCodes, help: 'Codes separated by commas, for example PO2, PSO1', example: 'po2, pso1' },
      method: { label: 'Delivered through', kind: 'select', column: obeCurriculumGaps.method, options: choices(['guest_lecture', 'workshop', 'seminar', 'industrial_visit', 'value_added_course', 'lab_session', 'other']), bulk: true, filter: true },
      heldOn: { label: 'Held on', kind: 'date', column: obeCurriculumGaps.heldOn },
      resourcePerson: { label: 'Resource person', kind: 'text', column: obeCurriculumGaps.resourcePerson, max: 200 },
      beneficiaries: { label: 'Students who took part', kind: 'number', column: obeCurriculumGaps.beneficiaries, min: 0, max: 100000, int: true },
      status: { label: 'Status', kind: 'select', column: obeCurriculumGaps.status, options: choices(['planned', 'done']), bulk: true, filter: true },
      evidenceUrl: { label: 'Evidence link', kind: 'text', column: obeCurriculumGaps.evidenceUrl, max: 500 },
    },
    extra: {
      program: sql<string>`(select p.name from programs p where p.id = ${obeCurriculumGaps.programId})`,
      course: sql<string | null>`(select s.code || ' ' || s.name from subjects s where s.id = ${obeCurriculumGaps.subjectId})`,
      year: sql<string | null>`(select y.label from academic_years y where y.id = ${obeCurriculumGaps.academicYearId})`,
    },
    search: [obeCurriculumGaps.title, obeCurriculumGaps.description, obeCurriculumGaps.resourcePerson],
    defaultSort: { id: 'heldOn', dir: 'desc' },
    defaults: (ctx) => ({ createdBy: ctx.p.userId }),
    duplicate: true,
  });
}

/** OBE coordinators of programmes and course coordinators of courses. */
export function obeAssignmentsEntity() {
  return kitEntity({
    key: 'obe-assignments',
    module: 'obe',
    table: obeAssignments,
    subjectType: 'obe_assignment',
    roles: { read: MANAGE, write: ADMIN },
    title: 'role',
    label: (r) => `${String(r.userIdName ?? 'Coordinator')}: ${String(r.program ?? '')}`,
    fields: {
      userId: { label: 'Staff member', kind: 'user', column: obeAssignments.userId, required: true, filter: true },
      role: { label: 'Role', kind: 'select', column: obeAssignments.role, options: choices(['coordinator', 'course_coordinator'], { coordinator: 'OBE coordinator', course_coordinator: 'Course coordinator' }), required: true, filter: true },
      programId: { label: 'Programme', kind: 'ref', column: obeAssignments.programId, options: programOptions, required: true, filter: true },
      subjectId: { label: 'Course', kind: 'ref', column: obeAssignments.subjectId, options: subjectOptions, help: 'For a course coordinator' },
      note: { label: 'Note', kind: 'text', column: obeAssignments.note, max: 300 },
    },
    extra: {
      program: sql<string>`(select p.name from programs p where p.id = ${obeAssignments.programId})`,
      course: sql<string | null>`(select s.code || ' ' || s.name from subjects s where s.id = ${obeAssignments.subjectId})`,
    },
    search: [obeAssignments.note],
    defaultSort: { id: 'role', dir: 'asc' },
    importKey: ['userId', 'role', 'programId'],
    validate: async (ctx, id) => {
      const r = await rowOf(ctx, obeAssignments, id);
      if (r.role === 'course_coordinator' && !r.subjectId) return 'Choose the course this person coordinates';
      if (r.role === 'coordinator' && r.subjectId) await ctx.tx.update(obeAssignments).set({ subjectId: null }).where(eq(obeAssignments.id, id));
      if (r.subjectId) {
        const [s] = await ctx.tx.select({ programId: subjects.programId }).from(subjects).where(eq(subjects.id, String(r.subjectId)));
        if (s?.programId !== r.programId) return 'The course is not part of this programme';
      }
      const [{ n }] = await ctx.tx.select({ n: sql<number>`count(*)::int` }).from(obeAssignments).where(and(eq(obeAssignments.userId, String(r.userId)), eq(obeAssignments.programId, String(r.programId)), eq(obeAssignments.role, r.role as 'coordinator'), r.role === 'course_coordinator' ? eq(obeAssignments.subjectId, String(r.subjectId)) : sql`true`));
      return n > 1 ? 'This person already has this role here' : null;
    },
  });
}

/** Indirect instruments entered as ratings (graduate exit, alumni and employer surveys, paper course exit surveys). */
export function obeInstrumentsEntity() {
  return kitEntity({
    key: 'obe-surveys',
    module: 'obe',
    table: obeSurveys,
    subjectType: 'obe_survey',
    roles: { read: MANAGE, write: MANAGE },
    title: 'title',
    fields: {
      title: { label: 'Title', kind: 'text', column: obeSurveys.title, required: true, max: 160 },
      kind: { label: 'Kind', kind: 'select', column: obeSurveys.kind, options: choices(['graduate_exit', 'alumni', 'employer', 'course_exit']), required: true, filter: true },
      programId: { label: 'Programme', kind: 'ref', column: obeSurveys.programId, options: programOptions, required: true, filter: true },
      academicYearId: { label: 'Academic year', kind: 'ref', column: obeSurveys.academicYearId, options: yearOptions, required: true, filter: true },
      subjectId: { label: 'Course (course exit only)', kind: 'ref', column: obeSurveys.subjectId, options: subjectOptions },
      scaleMax: { label: 'Rating scale (top)', kind: 'number', column: obeSurveys.scaleMax, min: 2, max: 10, int: true, required: true, example: '5' },
      minResponses: { label: 'Minimum responses', kind: 'number', column: obeSurveys.minResponses, min: 1, max: 1000, int: true, required: true, example: '5' },
      weight: { label: 'Weight', kind: 'number', column: obeSurveys.weight, min: 0.01, max: 100, required: true, example: '1' },
    },
    extra: {
      program: sql<string>`(select p.name from programs p where p.id = ${obeSurveys.programId})`,
      year: sql<string | null>`(select y.label from academic_years y where y.id = ${obeSurveys.academicYearId})`,
      ratings: sql<number>`(select count(*)::int from obe_survey_ratings r where r.survey_id = "obe_surveys"."id")`,
      mean: sql<number | null>`(select round(avg(r.rating)::numeric, 2)::float from obe_survey_ratings r where r.survey_id = "obe_surveys"."id")`,
    },
    search: [obeSurveys.title],
    defaultSort: { id: 'title', dir: 'asc' },
    defaults: (ctx) => ({ createdBy: ctx.p.userId }),
    validate: async (ctx, id) => {
      const r = await rowOf(ctx, obeSurveys, id);
      if ((r.kind === 'course_exit') !== !!r.subjectId) return 'A course exit survey needs a course; programme surveys must not have one';
      return null;
    },
  });
}

/** The course outcomes of every course (current and past versions), with their Bloom level and workflow state. Edits only in drafts. */
export function obeCosEntity() {
  return kitEntity({
    key: 'obe-cos',
    module: 'obe',
    table: courseOutcomes,
    subjectType: 'course_outcome',
    roles: { read: MANAGE, write: MANAGE },
    title: 'code',
    label: (r) => `${String(r.course ?? '')} ${String(r.code ?? '')}`.trim(),
    fields: {
      code: { label: 'Code', kind: 'text', column: courseOutcomes.code, required: true, max: 16, create: false },
      statement: { label: 'Statement', kind: 'textarea', column: courseOutcomes.statement, required: true, max: 1000, create: false },
      bloomLevel: { label: 'Bloom level', kind: 'select', column: courseOutcomes.bloomLevel, options: choices([...BLOOM_LEVELS]), bulk: true, create: false, filter: true },
    },
    extra: {
      course: sql<string>`(select s.code || ' ' || s.name from co_sets cs join subjects s on s.id = cs.subject_id where cs.id = ${courseOutcomes.coSetId})`,
      program: sql<string>`(select p.name from co_sets cs join subjects s on s.id = cs.subject_id join programs p on p.id = s.program_id where cs.id = ${courseOutcomes.coSetId})`,
      version: sql<number>`(select cs.version from co_sets cs where cs.id = ${courseOutcomes.coSetId})`,
      status: sql<string>`(select cs.status::text from co_sets cs where cs.id = ${courseOutcomes.coSetId})`,
      reviewStage: sql<string>`(select cs.review_stage from co_sets cs where cs.id = ${courseOutcomes.coSetId})`,
      subjectId: sql<string>`(select cs.subject_id from co_sets cs where cs.id = ${courseOutcomes.coSetId})`,
      mapped: sql<number>`(select count(*)::int from co_outcome_map m where m.co_id = "course_outcomes"."id")`,
    },
    filters: {
      programId: { label: 'Programme', options: programOptions, where: (v) => sql`${courseOutcomes.coSetId} in (select cs.id from co_sets cs join subjects s on s.id = cs.subject_id where s.program_id = ${v}::uuid)` },
      status: { label: 'Version', options: choices(['active', 'draft', 'retired']), where: (v) => (['active', 'draft', 'retired'].includes(v) ? sql`${courseOutcomes.coSetId} in (select cs.id from co_sets cs where cs.status = ${v})` : undefined) },
      unmapped: { label: 'Not mapped to a PO', options: choices(['yes']), where: (v) => (v === 'yes' ? sql`not exists (select 1 from co_outcome_map m where m.co_id = "course_outcomes"."id")` : undefined) },
    },
    search: [courseOutcomes.code, courseOutcomes.statement],
    defaultSort: { id: 'code', dir: 'asc' },
    noImport: true,
    remove: {
      guard: async (ctx, id) => {
        const [r] = await ctx.tx.select({ status: coSets.status, stage: coSets.reviewStage }).from(courseOutcomes).innerJoin(coSets, eq(coSets.id, courseOutcomes.coSetId)).where(eq(courseOutcomes.id, id));
        return r && (r.status !== 'draft' || !['draft', 'returned'].includes(r.stage)) ? 'Only course outcomes of a draft version can be deleted; start a new version' : null;
      },
    },
    validate: async (ctx, id) => {
      const [r] = await ctx.tx.select({ status: coSets.status, stage: coSets.reviewStage, subjectId: coSets.subjectId }).from(courseOutcomes).innerJoin(coSets, eq(coSets.id, courseOutcomes.coSetId)).where(eq(courseOutcomes.id, id));
      if (!r) return null;
      if (r.status !== 'draft' || !['draft', 'returned'].includes(r.stage)) return 'Only course outcomes of a draft version can be changed; start a new version';
      if (!isSchoolAdmin(ctx.p) && !ctx.p.roles.includes('quality_officer') && !(await headsSubject(ctx.tx, ctx.p, r.subjectId))) return 'Only the head of the department or the IQAC can change these course outcomes';
      return null;
    },
  });
}

@Injectable()
export class ObeRecords implements OnModuleInit {
  constructor(private readonly registry: RecordRegistry) {}

  onModuleInit(): void {
    this.registry.register(obeActionsEntity());
    this.registry.register(obeGapsEntity());
    this.registry.register(obeAssignmentsEntity());
    this.registry.register(obeInstrumentsEntity());
    this.registry.register(obeCosEntity());
    this.registry.register(obeStatementsEntity());
  }
}
