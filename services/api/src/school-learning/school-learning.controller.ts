import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { attendanceSettings, overallAttendance } from '../attendance-governance/eligibility.js';
import { auditUser } from '../common/audit.js';
import { Day } from '../common/zod-fields.js';
import { assertCanSeeStudent } from '../common/student-access.js';
import { Clock } from '../common/time.js';
import { tenantToday } from '../common/today.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { learningOutcomes, masteryRecords, pucCombinations, pucEnrollments, pucMarks, reportCardLines, reportCards } from '../db/schema-curriculum.js';
import { lessonPlanOutcomes, outcomeTopics, promotionDecisions, promotionRules, readinessMocks, readinessTargets, remedialPlans, schoolBoards, worksheetScores, worksheets } from '../db/schema-g1.js';
import { addDays } from '../teacher/teacher.service.js';
import {
  academicYears,
  chapters,
  courseOutcomes,
  guardians,
  lessonPlans,
  notifications,
  sections,
  students,
  subjects,
  timetableSlots,
  topicCoverage,
  topics,
  yearPlanItems,
  yearPlans,
} from '../db/schema.js';
import { decidePromotion, evaluateBoardPass, masteryFromLevel, masteryFromPct, readiness, type BoardSubjectMarks } from './school-rules.js';

const STAFF: RoleName[] = ['tenant_admin', 'principal', 'hod', 'teacher'];
const LEADS: RoleName[] = ['tenant_admin', 'principal', 'hod'];
const ADMINS: RoleName[] = ['tenant_admin', 'principal'];
const ALL: RoleName[] = [...STAFF, 'student', 'guardian'];
const KINDS = ['worksheet', 'reading', 'remedial', 'phonics', 'numeracy', 'activity', 'board_prep'] as const;

const WorksheetBody = z.object({
  kind: z.enum(KINDS).default('worksheet'),
  title: z.string().trim().min(2).max(160),
  instructions: z.string().trim().max(3000).default(''),
  sectionId: z.uuid(),
  subjectName: z.string().trim().min(1).max(80),
  outcomeId: z.uuid().nullable().optional(),
  dueOn: Day.nullable().optional(),
  maxScore: z.number().gt(0).max(1000).default(10),
  levels: z.array(z.string().trim().min(1).max(40)).max(6).default([]),
});
const ScoresBody = z.object({ scores: z.array(z.object({ studentId: z.uuid(), score: z.number().min(0).max(1000).nullable().optional(), level: z.string().trim().max(40).nullable().optional(), remarks: z.string().trim().max(300).default('') })).min(1).max(300) });
const TopicsBody = z.object({ topicIds: z.array(z.uuid()).max(100) });
const RemedialBody = z.object({ studentId: z.uuid(), subjectName: z.string().trim().min(1).max(80), plan: z.string().trim().min(3).max(1000), outcomeId: z.uuid().nullable().optional(), topicId: z.uuid().nullable().optional(), assignedTo: z.uuid().nullable().optional(), dueOn: Day.nullable().optional() });
const RemedialPatch = z.object({ status: z.enum(['open', 'in_progress', 'closed']).optional(), resultNote: z.string().trim().max(500).optional(), assignedTo: z.uuid().nullable().optional(), dueOn: Day.nullable().optional() });
const GenerateBody = z.object({ sectionId: z.uuid(), upTo: z.enum(['beginning', 'developing']).default('developing') });
const TargetBody = z.object({ studentId: z.uuid(), exam: z.string().trim().min(2).max(40), examOn: Day.nullable().optional(), targetPct: z.number().min(1).max(100).default(70) });
const MockBody = z.object({ studentId: z.uuid(), exam: z.string().trim().min(2).max(40), takenOn: Day, score: z.number().min(0).max(100000), maxScore: z.number().gt(0).max(100000), breakdown: z.record(z.string().max(40), z.number().min(0).max(100)).default({}) }).refine((m) => m.score <= m.maxScore, { message: 'The score cannot exceed the maximum', path: ['score'] });
const RuleBody = z.object({ name: z.string().trim().min(2).max(100), programId: z.uuid().nullable().optional(), minAttendancePct: z.number().int().min(0).max(100).default(75), subjectPassPct: z.number().int().min(0).max(100).default(35), maxCompartmentSubjects: z.number().int().min(0).max(10).default(2), graceMarks: z.number().int().min(0).max(20).default(0), isDefault: z.boolean().default(false) });
const EvaluateBody = z.object({ academicYearId: z.uuid(), sectionId: z.uuid(), ruleId: z.uuid().optional() });
const ApproveBody = z.object({ ids: z.array(z.uuid()).min(1).max(500), decision: z.enum(['approved', 'rejected']).default('approved'), notifyParents: z.boolean().default(true) });
const BoardEvalBody = z.object({ marks: z.array(z.object({ subject: z.string().max(80), theory: z.number().min(0), theoryMax: z.number().gt(0), practical: z.number().min(0).optional(), practicalMax: z.number().min(0).optional(), internal: z.number().min(0).optional(), internalMax: z.number().min(0).optional() })).min(1).max(12) });
const PlanOutcomesBody = z.object({
  items: z
    .array(
      z
        .object({ courseOutcomeId: z.uuid().optional(), learningOutcomeId: z.uuid().optional(), activity: z.string().trim().max(300).default(''), resource: z.string().trim().max(300).default(''), assessment: z.string().trim().max(300).default('') })
        .refine((i) => !!i.courseOutcomeId !== !!i.learningOutcomeId, { message: 'Give one course outcome or one learning outcome' }),
    )
    .max(20),
});

/** School learning support: worksheets and activity scoring, outcome-topic mastery, remedial plans, entrance readiness, promotion rules, board pass rules and lesson-plan outcomes. */
@Controller('v1/school-learning')
export class SchoolLearningController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
  ) {}

  // ---- worksheets and activity scoring ---------------------------------------------------------------------------------------

  @Get('worksheets')
  @Auth('user', STAFF)
  list(@CurrentPrincipal() p: UserPrincipal, @Query('sectionId') sectionId?: string, @Query('kind') kind?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ w: worksheets, section: sections.displayName, scored: sql<number>`(select count(*)::int from worksheet_scores ws where ws.worksheet_id = ${worksheets.id})`, roster: sql<number>`(select count(*)::int from students st where st.section_id = ${worksheets.sectionId} and st.status = 'active')` })
        .from(worksheets)
        .innerJoin(sections, eq(sections.id, worksheets.sectionId))
        .where(and(sectionId ? eq(worksheets.sectionId, z.uuid().parse(sectionId)) : undefined, kind && (KINDS as readonly string[]).includes(kind) ? eq(worksheets.kind, kind as (typeof KINDS)[number]) : undefined))
        .orderBy(desc(worksheets.createdAt))
        .limit(200);
      return rows.map((r) => ({ ...r.w, section: r.section, scored: r.scored, roster: r.roster }));
    });
  }

  @Post('worksheets')
  @Auth('user', STAFF)
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(WorksheetBody)) b: z.infer<typeof WorksheetBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [sec] = await tx.select({ id: sections.id }).from(sections).where(eq(sections.id, b.sectionId));
      if (!sec) throw new NotFoundException('Class not found');
      if (b.outcomeId) {
        const [o] = await tx.select({ id: learningOutcomes.id }).from(learningOutcomes).where(eq(learningOutcomes.id, b.outcomeId));
        if (!o) throw new NotFoundException('Learning outcome not found');
      }
      const [row] = await tx.insert(worksheets).values({ tenantId: p.tenantId, ...b, outcomeId: b.outcomeId ?? null, dueOn: b.dueOn ?? null, createdBy: p.userId }).returning();
      await auditUser(tx, p, 'school.worksheet.created', 'worksheet', row.id, { kind: b.kind, sectionId: b.sectionId });
      return row;
    });
  }

  @Get('worksheets/:id')
  @Auth('user', STAFF)
  one(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [w] = await tx.select().from(worksheets).where(eq(worksheets.id, id));
      if (!w) throw new NotFoundException('Worksheet not found');
      const roster = await tx.select({ id: students.id, fullName: students.fullName, rollNo: students.rollNo }).from(students).where(and(eq(students.sectionId, w.sectionId), eq(students.status, 'active'))).orderBy(asc(students.rollNo));
      const scores = new Map((await tx.select().from(worksheetScores).where(eq(worksheetScores.worksheetId, id))).map((s) => [s.studentId, s]));
      return { worksheet: w, roster: roster.map((s) => ({ studentId: s.id, fullName: s.fullName, rollNo: s.rollNo, score: scores.get(s.id)?.score ?? null, level: scores.get(s.id)?.level ?? null, remarks: scores.get(s.id)?.remarks ?? '' })) };
    });
  }

  /** Records scores or activity levels. When the worksheet is tied to a learning outcome, each score also updates that student's mastery of it. */
  @Put('worksheets/:id/scores')
  @Auth('user', STAFF)
  scoreAll(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ScoresBody)) b: z.infer<typeof ScoresBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [w] = await tx.select().from(worksheets).where(eq(worksheets.id, id));
      if (!w) throw new NotFoundException('Worksheet not found');
      const roster = new Set((await tx.select({ id: students.id }).from(students).where(eq(students.sectionId, w.sectionId))).map((s) => s.id));
      const today = await tenantToday(tx, this.clock);
      let mastery = 0;
      for (const s of b.scores) {
        if (!roster.has(s.studentId)) throw new BadRequestException('A student is not in this class');
        if (s.score != null && s.score > w.maxScore) throw new BadRequestException(`A score is above the maximum of ${w.maxScore}`);
        if (s.level && !w.levels.includes(s.level)) throw new BadRequestException(`"${s.level}" is not one of this activity's levels`);
        if (s.score == null && !s.level) continue;
        const values = { score: s.score ?? null, level: s.level ?? null, remarks: s.remarks, scoredBy: p.userId, scoredAt: new Date() };
        await tx.insert(worksheetScores).values({ tenantId: p.tenantId, worksheetId: id, studentId: s.studentId, ...values }).onConflictDoUpdate({ target: [worksheetScores.worksheetId, worksheetScores.studentId], set: values });
        if (w.outcomeId) {
          const level = s.level ? masteryFromLevel(w.levels, s.level) : s.score != null ? masteryFromPct((s.score / w.maxScore) * 100) : null;
          if (level) {
            const set = { level, evidence: `${w.title}`, assessedBy: p.userId, assessedOn: today, updatedAt: new Date() };
            await tx.insert(masteryRecords).values({ tenantId: p.tenantId, studentId: s.studentId, outcomeId: w.outcomeId, ...set }).onConflictDoUpdate({ target: [masteryRecords.tenantId, masteryRecords.studentId, masteryRecords.outcomeId], set });
            mastery++;
          }
        }
      }
      await auditUser(tx, p, 'school.worksheet.scored', 'worksheet', id, { scored: b.scores.length, mastery });
      return { scored: b.scores.length, masteryUpdated: mastery };
    });
  }

  @Delete('worksheets/:id')
  @Auth('user', LEADS)
  @HttpCode(200)
  remove(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.delete(worksheets).where(eq(worksheets.id, id)).returning({ id: worksheets.id });
      if (!row) throw new NotFoundException('Worksheet not found');
      await auditUser(tx, p, 'school.worksheet.deleted', 'worksheet', id);
      return { ok: true };
    });
  }

  // ---- chapter, topic, outcome and mastery ------------------------------------------------------------------------------------

  @Put('outcomes/:outcomeId/topics')
  @Auth('user', LEADS)
  setTopics(@CurrentPrincipal() p: UserPrincipal, @Param('outcomeId', ParseUUIDPipe) outcomeId: string, @Body(new ZodBody(TopicsBody)) b: z.infer<typeof TopicsBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [o] = await tx.select({ id: learningOutcomes.id }).from(learningOutcomes).where(eq(learningOutcomes.id, outcomeId));
      if (!o) throw new NotFoundException('Learning outcome not found');
      const ids = [...new Set(b.topicIds)];
      if (ids.length) {
        const found = await tx.select({ id: topics.id }).from(topics).where(inArray(topics.id, ids));
        if (found.length !== ids.length) throw new BadRequestException('Some topics were not found');
      }
      await tx.delete(outcomeTopics).where(eq(outcomeTopics.outcomeId, outcomeId));
      if (ids.length) await tx.insert(outcomeTopics).values(ids.map((topicId) => ({ tenantId: p.tenantId, outcomeId, topicId })));
      await auditUser(tx, p, 'school.outcome.topics', 'learning_outcome', outcomeId, { topics: ids.length });
      return { outcomeId, topics: ids.length };
    });
  }

  /** Outcome -> topics (with their chapter) -> how many students are at each mastery level. */
  @Get('outcome-tree')
  @Auth('user', STAFF)
  tree(@CurrentPrincipal() p: UserPrincipal, @Query('grade') grade?: string, @Query('subjectName') subjectName?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const outs = await tx
        .select()
        .from(learningOutcomes)
        .where(and(grade ? eq(learningOutcomes.grade, Number(grade)) : undefined, subjectName ? eq(learningOutcomes.subjectName, subjectName) : undefined))
        .orderBy(asc(learningOutcomes.subjectName), asc(learningOutcomes.code));
      if (!outs.length) return [];
      const ids = outs.map((o) => o.id);
      const links = await tx.select({ outcomeId: outcomeTopics.outcomeId, topicId: topics.id, topic: topics.title, chapter: chapters.title }).from(outcomeTopics).innerJoin(topics, eq(topics.id, outcomeTopics.topicId)).innerJoin(chapters, eq(chapters.id, topics.chapterId)).where(inArray(outcomeTopics.outcomeId, ids));
      const levels = await tx.select({ outcomeId: masteryRecords.outcomeId, level: masteryRecords.level, n: sql<number>`count(*)::int` }).from(masteryRecords).where(inArray(masteryRecords.outcomeId, ids)).groupBy(masteryRecords.outcomeId, masteryRecords.level);
      return outs.map((o) => ({
        id: o.id,
        code: o.code,
        kind: o.kind,
        grade: o.grade,
        subjectName: o.subjectName,
        statement: o.statement,
        topics: links.filter((l) => l.outcomeId === o.id).map((l) => ({ id: l.topicId, title: l.topic, chapter: l.chapter })),
        mastery: Object.fromEntries(['beginning', 'developing', 'proficient', 'mastery'].map((lv) => [lv, levels.find((x) => x.outcomeId === o.id && x.level === lv)?.n ?? 0])),
      }));
    });
  }

  // ---- remedial plans ---------------------------------------------------------------------------------------------------------

  @Get('remedial')
  @Auth('user', STAFF)
  remedial(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string, @Query('sectionId') sectionId?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ r: remedialPlans, studentName: students.fullName, rollNo: students.rollNo, section: sections.displayName, outcome: learningOutcomes.code, topic: topics.title })
        .from(remedialPlans)
        .leftJoin(students, eq(students.id, remedialPlans.studentId))
        .leftJoin(sections, eq(sections.id, remedialPlans.sectionId))
        .leftJoin(learningOutcomes, eq(learningOutcomes.id, remedialPlans.outcomeId))
        .leftJoin(topics, eq(topics.id, remedialPlans.topicId))
        .where(and(status && ['open', 'in_progress', 'closed'].includes(status) ? eq(remedialPlans.status, status as 'open') : undefined, sectionId ? eq(remedialPlans.sectionId, z.uuid().parse(sectionId)) : undefined))
        .orderBy(desc(remedialPlans.createdAt))
        .limit(300);
      return rows.map((x) => ({ ...x.r, studentName: x.studentName, rollNo: x.rollNo, section: x.section, outcome: x.outcome, topic: x.topic }));
    });
  }

  @Post('remedial')
  @Auth('user', STAFF)
  addRemedial(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(RemedialBody)) b: z.infer<typeof RemedialBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [st] = await tx.select({ sectionId: students.sectionId }).from(students).where(eq(students.id, b.studentId));
      if (!st) throw new NotFoundException('Student not found');
      const [row] = await tx.insert(remedialPlans).values({ tenantId: p.tenantId, ...b, outcomeId: b.outcomeId ?? null, topicId: b.topicId ?? null, assignedTo: b.assignedTo ?? p.userId, dueOn: b.dueOn ?? null, sectionId: st.sectionId, source: 'manual', createdBy: p.userId }).returning();
      await auditUser(tx, p, 'school.remedial.created', 'remedial_plan', row.id, { studentId: b.studentId });
      return row;
    });
  }

  @Put('remedial/:id')
  @Auth('user', STAFF)
  updateRemedial(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(RemedialPatch)) b: z.infer<typeof RemedialPatch>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const patch = { ...b, ...(b.status === 'closed' ? { closedAt: new Date() } : {}) };
      const [row] = await tx.update(remedialPlans).set(patch).where(eq(remedialPlans.id, id)).returning();
      if (!row) throw new NotFoundException('Plan not found');
      await auditUser(tx, p, 'school.remedial.updated', 'remedial_plan', id, b);
      return row;
    });
  }

  /** Opens a remedial plan for each student whose mastery of an outcome is at or below the level; running it again adds nothing new. */
  @Post('remedial/generate')
  @Auth('user', STAFF)
  @HttpCode(200)
  generate(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(GenerateBody)) b: z.infer<typeof GenerateBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const levels: ('beginning' | 'developing')[] = b.upTo === 'beginning' ? ['beginning'] : ['beginning', 'developing'];
      const low = await tx
        .select({ studentId: masteryRecords.studentId, outcomeId: masteryRecords.outcomeId, level: masteryRecords.level, code: learningOutcomes.code, subjectName: learningOutcomes.subjectName, statement: learningOutcomes.statement })
        .from(masteryRecords)
        .innerJoin(students, eq(students.id, masteryRecords.studentId))
        .innerJoin(learningOutcomes, eq(learningOutcomes.id, masteryRecords.outcomeId))
        .where(and(eq(students.sectionId, b.sectionId), eq(students.status, 'active'), inArray(masteryRecords.level, levels)));
      const open = await tx.select({ studentId: remedialPlans.studentId, outcomeId: remedialPlans.outcomeId }).from(remedialPlans).where(and(eq(remedialPlans.source, 'low_mastery'), inArray(remedialPlans.status, ['open', 'in_progress'])));
      const have = new Set(open.map((o) => `${o.studentId}|${o.outcomeId}`));
      const due = addDays(await tenantToday(tx, this.clock), 14);
      let created = 0;
      for (const m of low) {
        if (have.has(`${m.studentId}|${m.outcomeId}`)) continue;
        await tx.insert(remedialPlans).values({ tenantId: p.tenantId, studentId: m.studentId, sectionId: b.sectionId, subjectName: m.subjectName, source: 'low_mastery', outcomeId: m.outcomeId, plan: `Re-teach and practise ${m.code}: ${m.statement}`, assignedTo: p.userId, dueOn: due, createdBy: p.userId });
        created++;
      }
      await auditUser(tx, p, 'school.remedial.generated', 'section', b.sectionId, { created, considered: low.length });
      return { created, alreadyOpen: low.length - created };
    });
  }

  /** Topics planned for a past week and not yet taught: each becomes a catch-up plan for the class, once. */
  @Get('delayed-topics')
  @Auth('user', STAFF)
  delayed(@CurrentPrincipal() p: UserPrincipal, @Query('sectionId', ParseUUIDPipe) sectionId: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.delayedTopics(tx, sectionId));
  }

  @Post('delayed-topics/remediate')
  @Auth('user', STAFF)
  @HttpCode(200)
  remediate(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(z.object({ sectionId: z.uuid() }))) b: { sectionId: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const late = await this.delayedTopics(tx, b.sectionId);
      const open = await tx.select({ topicId: remedialPlans.topicId }).from(remedialPlans).where(and(eq(remedialPlans.sectionId, b.sectionId), eq(remedialPlans.source, 'delayed_topic'), isNull(remedialPlans.studentId), inArray(remedialPlans.status, ['open', 'in_progress'])));
      const have = new Set(open.map((o) => o.topicId));
      const due = addDays(await tenantToday(tx, this.clock), 7);
      let created = 0;
      for (const t of late) {
        if (have.has(t.topicId)) continue;
        await tx.insert(remedialPlans).values({ tenantId: p.tenantId, sectionId: b.sectionId, subjectName: t.subject, source: 'delayed_topic', topicId: t.topicId, plan: `Catch up on "${t.topic}": planned for the week of ${t.weekOf}, ${t.daysLate} days late`, assignedTo: t.teacherId, dueOn: due, createdBy: p.userId });
        created++;
      }
      await auditUser(tx, p, 'school.delayed.remediated', 'section', b.sectionId, { created });
      return { created, delayed: late.length };
    });
  }

  private async delayedTopics(tx: Tx, sectionId: string) {
    const today = await tenantToday(tx, this.clock);
    const cutoff = addDays(today, -6);
    const planned = await tx
      .select({ topicId: yearPlanItems.topicId, topic: topics.title, weekOf: yearPlanItems.weekOf, subject: subjects.name, subjectId: yearPlans.subjectId })
      .from(yearPlanItems)
      .innerJoin(yearPlans, eq(yearPlans.id, yearPlanItems.planId))
      .innerJoin(topics, eq(topics.id, yearPlanItems.topicId))
      .innerJoin(subjects, eq(subjects.id, yearPlans.subjectId))
      .where(and(eq(yearPlans.sectionId, sectionId), lt(yearPlanItems.weekOf, cutoff)));
    const covered = new Set((await tx.select({ topicId: topicCoverage.topicId }).from(topicCoverage).where(eq(topicCoverage.sectionId, sectionId))).map((c) => c.topicId));
    const slots = await tx.select({ subjectId: timetableSlots.subjectId, teacherId: timetableSlots.teacherId }).from(timetableSlots).where(and(eq(timetableSlots.sectionId, sectionId), isNull(timetableSlots.archivedAt)));
    const teacher = new Map(slots.map((s) => [s.subjectId, s.teacherId]));
    const days = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
    return planned.filter((x) => !covered.has(x.topicId)).map((x) => ({ topicId: x.topicId, topic: x.topic, subject: x.subject, weekOf: x.weekOf, daysLate: days(today, x.weekOf), teacherId: teacher.get(x.subjectId) ?? null })).sort((a, b) => b.daysLate - a.daysLate);
  }

  // ---- entrance readiness ---------------------------------------------------------------------------------------------------------

  @Put('readiness/targets')
  @Auth('user', STAFF)
  setTarget(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(TargetBody)) b: z.infer<typeof TargetBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, b.studentId, STAFF);
      const values = { examOn: b.examOn ?? null, targetPct: b.targetPct };
      await tx.insert(readinessTargets).values({ tenantId: p.tenantId, studentId: b.studentId, exam: b.exam, ...values }).onConflictDoUpdate({ target: [readinessTargets.studentId, readinessTargets.exam], set: values });
      return { studentId: b.studentId, exam: b.exam, ...values };
    });
  }

  @Post('readiness/mocks')
  @Auth('user', STAFF)
  addMock(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(MockBody)) b: z.infer<typeof MockBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, b.studentId, STAFF);
      const [row] = await tx.insert(readinessMocks).values({ tenantId: p.tenantId, ...b }).returning();
      await auditUser(tx, p, 'school.readiness.mock', 'student', b.studentId, { exam: b.exam });
      return row;
    });
  }

  @Get('readiness/students/:studentId')
  @Auth('user', ALL)
  studentReadiness(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, STAFF);
      return this.readinessOf(tx, studentId);
    });
  }

  /** The class at a glance for one entrance exam. */
  @Get('readiness/sections/:sectionId')
  @Auth('user', STAFF)
  sectionReadiness(@CurrentPrincipal() p: UserPrincipal, @Param('sectionId', ParseUUIDPipe) sectionId: string, @Query('exam') exam?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const roster = await tx.select({ id: students.id, fullName: students.fullName, rollNo: students.rollNo }).from(students).where(and(eq(students.sectionId, sectionId), eq(students.status, 'active'))).orderBy(asc(students.rollNo));
      const out = [];
      for (const s of roster) {
        const exams = (await this.readinessOf(tx, s.id)).filter((e) => !exam || e.exam === exam);
        for (const e of exams) out.push({ studentId: s.id, fullName: s.fullName, rollNo: s.rollNo, ...e });
      }
      return out;
    });
  }

  private async readinessOf(tx: Tx, studentId: string) {
    const targets = await tx.select().from(readinessTargets).where(eq(readinessTargets.studentId, studentId));
    const mocks = await tx.select().from(readinessMocks).where(eq(readinessMocks.studentId, studentId)).orderBy(asc(readinessMocks.takenOn));
    const exams = [...new Set([...targets.map((t) => t.exam), ...mocks.map((m) => m.exam)])].sort();
    return exams.map((exam) => {
      const t = targets.find((x) => x.exam === exam);
      const ms = mocks.filter((m) => m.exam === exam);
      return { exam, examOn: t?.examOn ?? null, targetPct: t?.targetPct ?? 70, mocks: ms.map((m) => ({ takenOn: m.takenOn, score: m.score, maxScore: m.maxScore })), ...readiness(ms.map((m) => ({ takenOn: m.takenOn, score: m.score, maxScore: m.maxScore, breakdown: m.breakdown })), t?.targetPct ?? 70) };
    });
  }

  // ---- promotion rules and decisions ------------------------------------------------------------------------------------------

  @Get('promotion/rules')
  @Auth('user', LEADS)
  rules(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(promotionRules).orderBy(desc(promotionRules.isDefault), asc(promotionRules.name)));
  }

  @Post('promotion/rules')
  @Auth('user', ADMINS)
  addRule(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(RuleBody)) b: z.infer<typeof RuleBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (b.isDefault) await tx.update(promotionRules).set({ isDefault: false }).where(eq(promotionRules.isDefault, true));
      const [row] = await tx.insert(promotionRules).values({ tenantId: p.tenantId, ...b, programId: b.programId ?? null }).returning();
      await auditUser(tx, p, 'school.promotion.rule', 'promotion_rule', row.id, { name: b.name });
      return row;
    });
  }

  @Put('promotion/rules/:id')
  @Auth('user', ADMINS)
  saveRule(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(RuleBody.partial())) b: Partial<z.infer<typeof RuleBody>>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (b.isDefault) await tx.update(promotionRules).set({ isDefault: false }).where(eq(promotionRules.isDefault, true));
      const [row] = await tx.update(promotionRules).set(b).where(eq(promotionRules.id, id)).returning();
      if (!row) throw new NotFoundException('Rule not found');
      await auditUser(tx, p, 'school.promotion.rule.updated', 'promotion_rule', id, { changed: Object.keys(b) });
      return row;
    });
  }

  /** Applies the rule to a class from the year's report cards and attendance, and keeps each decision for approval. Approved decisions are not overwritten. */
  @Post('promotion/evaluate')
  @Auth('user', LEADS)
  @HttpCode(200)
  evaluate(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(EvaluateBody)) b: z.infer<typeof EvaluateBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [sec] = await tx.select().from(sections).where(eq(sections.id, b.sectionId));
      if (!sec) throw new NotFoundException('Class not found');
      const [year] = await tx.select({ id: academicYears.id }).from(academicYears).where(eq(academicYears.id, b.academicYearId));
      if (!year) throw new NotFoundException('Academic year not found');
      const rule = b.ruleId
        ? (await tx.select().from(promotionRules).where(eq(promotionRules.id, b.ruleId)))[0]
        : ((await tx.select().from(promotionRules).where(eq(promotionRules.programId, sec.programId)))[0] ?? (await tx.select().from(promotionRules).where(eq(promotionRules.isDefault, true)))[0]);
      if (!rule) throw new BadRequestException('Set a promotion rule first');
      const roster = await tx.select({ id: students.id, fullName: students.fullName }).from(students).where(and(eq(students.sectionId, b.sectionId), eq(students.status, 'active')));
      const att = await overallAttendance(tx, roster.map((r) => r.id), (await attendanceSettings(tx, b.sectionId)).thresholdPct);
      const lines = roster.length
        ? await tx
            .select({ studentId: reportCards.studentId, subject: reportCardLines.subjectName, marks: reportCardLines.marks, max: reportCardLines.maxMarks })
            .from(reportCardLines)
            .innerJoin(reportCards, eq(reportCards.id, reportCardLines.reportCardId))
            .where(and(eq(reportCards.academicYearId, b.academicYearId), inArray(reportCards.studentId, roster.map((r) => r.id))))
        : [];
      const decided: { studentId: string; fullName: string; decision: string; reasons: string[] }[] = [];
      const noResults: string[] = [];
      for (const s of roster) {
        const mine = lines.filter((l) => l.studentId === s.id);
        if (!mine.length) {
          noResults.push(s.fullName);
          continue;
        }
        const bySubject = new Map<string, { got: number; max: number }>();
        for (const l of mine) {
          const e = bySubject.get(l.subject) ?? { got: 0, max: 0 };
          e.got += l.marks;
          e.max += l.max;
          bySubject.set(l.subject, e);
        }
        const out = decidePromotion(rule, att.get(s.id)?.pct ?? null, [...bySubject].map(([subject, e]) => ({ subject, pct: e.max ? (e.got / e.max) * 100 : 0 })));
        const [existing] = await tx.select({ status: promotionDecisions.status }).from(promotionDecisions).where(and(eq(promotionDecisions.academicYearId, b.academicYearId), eq(promotionDecisions.studentId, s.id)));
        if (existing && existing.status !== 'pending') continue;
        const values = { ruleId: rule.id, decision: out.decision, failedSubjects: out.failedSubjects, attendancePct: att.get(s.id)?.pct ?? null, reasons: out.reasons };
        await tx.insert(promotionDecisions).values({ tenantId: p.tenantId, academicYearId: b.academicYearId, studentId: s.id, ...values }).onConflictDoUpdate({ target: [promotionDecisions.academicYearId, promotionDecisions.studentId], set: values });
        decided.push({ studentId: s.id, fullName: s.fullName, decision: out.decision, reasons: out.reasons });
      }
      await auditUser(tx, p, 'school.promotion.evaluated', 'section', b.sectionId, { decided: decided.length, noResults: noResults.length });
      return { rule: rule.name, decided, noResults };
    });
  }

  @Get('promotion/decisions')
  @Auth('user', LEADS)
  decisions(@CurrentPrincipal() p: UserPrincipal, @Query('academicYearId', ParseUUIDPipe) academicYearId: string, @Query('sectionId') sectionId?: string, @Query('status') status?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ d: promotionDecisions, fullName: students.fullName, rollNo: students.rollNo, section: sections.displayName })
        .from(promotionDecisions)
        .innerJoin(students, eq(students.id, promotionDecisions.studentId))
        .innerJoin(sections, eq(sections.id, students.sectionId))
        .where(and(eq(promotionDecisions.academicYearId, academicYearId), sectionId ? eq(students.sectionId, z.uuid().parse(sectionId)) : undefined, status && ['pending', 'approved', 'rejected'].includes(status) ? eq(promotionDecisions.status, status as 'pending') : undefined))
        .orderBy(asc(sections.displayName), asc(students.rollNo));
      return rows.map((r) => ({ ...r.d, fullName: r.fullName, rollNo: r.rollNo, section: r.section }));
    });
  }

  /** The principal approves (or rejects) decisions; approved ones tell the family. */
  @Post('promotion/decisions/approve')
  @Auth('user', ADMINS)
  @HttpCode(200)
  approve(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ApproveBody)) b: z.infer<typeof ApproveBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select().from(promotionDecisions).where(and(inArray(promotionDecisions.id, b.ids), eq(promotionDecisions.status, 'pending')));
      if (!rows.length) throw new BadRequestException('Nothing waiting for a decision');
      let notified = 0;
      for (const d of rows) {
        await tx.update(promotionDecisions).set({ status: b.decision, decidedBy: p.userId, decidedAt: new Date() }).where(eq(promotionDecisions.id, d.id));
        if (b.decision === 'approved' && b.notifyParents) {
          const gs = await tx.select({ userId: guardians.userId }).from(guardians).where(eq(guardians.studentId, d.studentId));
          const [st] = await tx.select({ n: students.fullName }).from(students).where(eq(students.id, d.studentId));
          const text = { promoted: 'has been promoted to the next class', promoted_with_grace: 'has been promoted with grace marks', compartment: 'has a supplementary (compartment) exam to clear', detained: 'will repeat the class' }[d.decision];
          for (const g of gs) {
            await tx.insert(notifications).values({ tenantId: p.tenantId, userId: g.userId, kind: 'broadcast', title: 'Promotion decision', body: `${st?.n ?? 'Your child'} ${text}. ${d.reasons.join('. ')}`.trim(), data: { studentId: d.studentId }, dedupeKey: `promotion:${d.id}` }).onConflictDoNothing();
            notified++;
          }
          if (gs.length) await tx.update(promotionDecisions).set({ parentNotifiedAt: new Date() }).where(eq(promotionDecisions.id, d.id));
        }
      }
      await auditUser(tx, p, 'school.promotion.decided', 'academic_year', rows[0].academicYearId, { decision: b.decision, count: rows.length, notified });
      return { decided: rows.length, notified };
    });
  }

  // ---- board pass rules -----------------------------------------------------------------------------------------------------------

  /** Tries a board's pass rules on a set of marks (grace marks, aggregate, compartment). */
  @Post('boards/:id/evaluate')
  @Auth('user', STAFF)
  @HttpCode(200)
  evaluateBoard(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(BoardEvalBody)) b: z.infer<typeof BoardEvalBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [board] = await tx.select().from(schoolBoards).where(eq(schoolBoards.id, id));
      if (!board) throw new NotFoundException('Board not found');
      return { board: board.code, ...evaluateBoardPass(board.passRules, b.marks) };
    });
  }

  /** A PUC student's result under the primary board's pass rules, from the marks entered for their combination. */
  @Get('boards/results/students/:studentId')
  @Auth('user', ALL)
  boardResult(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string, @Query('academicYearId', ParseUUIDPipe) academicYearId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, STAFF);
      const [board] = await tx.select().from(schoolBoards).where(eq(schoolBoards.isPrimary, true));
      const [enrol] = await tx.select({ subjects: pucCombinations.subjects }).from(pucEnrollments).innerJoin(pucCombinations, eq(pucCombinations.id, pucEnrollments.combinationId)).where(and(eq(pucEnrollments.studentId, studentId), eq(pucEnrollments.academicYearId, academicYearId)));
      if (!enrol) throw new NotFoundException('The student has no stream combination for this year');
      const entered = await tx.select().from(pucMarks).where(and(eq(pucMarks.studentId, studentId), eq(pucMarks.academicYearId, academicYearId)));
      const marks: BoardSubjectMarks[] = enrol.subjects.map((s) => {
        const m = entered.find((e) => e.subjectName === s.name);
        return { subject: s.name, theory: m?.theory ?? 0, theoryMax: s.theoryMax, practical: m?.practical ?? 0, practicalMax: s.practicalMax, internal: m?.internal ?? 0, internalMax: s.internalMax };
      });
      return { board: board?.code ?? null, rules: board?.passRules ?? {}, complete: enrol.subjects.every((s) => entered.some((e) => e.subjectName === s.name)), ...evaluateBoardPass(board?.passRules ?? {}, marks) };
    });
  }

  // ---- lesson plan outcomes ---------------------------------------------------------------------------------------------------------

  @Get('lesson-plans/:planId/outcomes')
  @Auth('user', STAFF)
  planOutcomes(@CurrentPrincipal() p: UserPrincipal, @Param('planId', ParseUUIDPipe) planId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.planOwner(tx, p, planId);
      const rows = await tx
        .select({ r: lessonPlanOutcomes, co: courseOutcomes.code, coText: courseOutcomes.statement, lo: learningOutcomes.code, loText: learningOutcomes.statement })
        .from(lessonPlanOutcomes)
        .leftJoin(courseOutcomes, eq(courseOutcomes.id, lessonPlanOutcomes.courseOutcomeId))
        .leftJoin(learningOutcomes, eq(learningOutcomes.id, lessonPlanOutcomes.learningOutcomeId))
        .where(eq(lessonPlanOutcomes.lessonPlanId, planId));
      return rows.map((x) => ({ id: x.r.id, courseOutcomeId: x.r.courseOutcomeId, learningOutcomeId: x.r.learningOutcomeId, code: x.co ?? x.lo, statement: x.coText ?? x.loText, activity: x.r.activity, resource: x.r.resource, assessment: x.r.assessment }));
    });
  }

  /** Replaces the outcomes a period teaches, each with its activity, resource and assessment. */
  @Put('lesson-plans/:planId/outcomes')
  @Auth('user', STAFF)
  setPlanOutcomes(@CurrentPrincipal() p: UserPrincipal, @Param('planId', ParseUUIDPipe) planId: string, @Body(new ZodBody(PlanOutcomesBody)) b: z.infer<typeof PlanOutcomesBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.planOwner(tx, p, planId);
      const cos = b.items.map((i) => i.courseOutcomeId).filter((x): x is string => !!x);
      const los = b.items.map((i) => i.learningOutcomeId).filter((x): x is string => !!x);
      if (cos.length && (await tx.select({ id: courseOutcomes.id }).from(courseOutcomes).where(inArray(courseOutcomes.id, cos))).length !== new Set(cos).size) throw new BadRequestException('Some course outcomes were not found');
      if (los.length && (await tx.select({ id: learningOutcomes.id }).from(learningOutcomes).where(inArray(learningOutcomes.id, los))).length !== new Set(los).size) throw new BadRequestException('Some learning outcomes were not found');
      await tx.delete(lessonPlanOutcomes).where(eq(lessonPlanOutcomes.lessonPlanId, planId));
      if (b.items.length) await tx.insert(lessonPlanOutcomes).values(b.items.map((i) => ({ tenantId: p.tenantId, lessonPlanId: planId, courseOutcomeId: i.courseOutcomeId ?? null, learningOutcomeId: i.learningOutcomeId ?? null, activity: i.activity, resource: i.resource, assessment: i.assessment })));
      await auditUser(tx, p, 'plans.outcomes.set', 'lesson_plan', planId, { count: b.items.length });
      return { planId, outcomes: b.items.length };
    });
  }

  private async planOwner(tx: Tx, p: UserPrincipal, planId: string) {
    const [plan] = await tx.select({ teacherId: lessonPlans.teacherId }).from(lessonPlans).where(eq(lessonPlans.id, planId));
    if (!plan) throw new NotFoundException('Lesson plan not found');
    if (plan.teacherId !== p.userId && !p.roles.some((r) => LEADS.includes(r))) throw new NotFoundException('Lesson plan not found');
  }

  // ---- what a student or family sees -------------------------------------------------------------------------------------------

  /** Worksheets and scores, open remedial plans, entrance readiness and the approved promotion decision. */
  @Get('students/:studentId/summary')
  @Auth('user', ALL)
  summary(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, STAFF);
      const [stu] = await tx.select().from(students).where(eq(students.id, studentId));
      const ws = await tx.select().from(worksheets).where(eq(worksheets.sectionId, stu.sectionId)).orderBy(desc(worksheets.createdAt)).limit(40);
      const scores = ws.length ? await tx.select().from(worksheetScores).where(and(eq(worksheetScores.studentId, studentId), inArray(worksheetScores.worksheetId, ws.map((w) => w.id)))) : [];
      const plans = await tx.select().from(remedialPlans).where(and(eq(remedialPlans.studentId, studentId), inArray(remedialPlans.status, ['open', 'in_progress']))).orderBy(desc(remedialPlans.createdAt));
      const [decision] = await tx.select().from(promotionDecisions).where(and(eq(promotionDecisions.studentId, studentId), eq(promotionDecisions.status, 'approved'))).orderBy(desc(promotionDecisions.decidedAt)).limit(1);
      return {
        worksheets: ws.map((w) => ({ id: w.id, kind: w.kind, title: w.title, subjectName: w.subjectName, dueOn: w.dueOn, maxScore: w.maxScore, score: scores.find((s) => s.worksheetId === w.id)?.score ?? null, level: scores.find((s) => s.worksheetId === w.id)?.level ?? null, remarks: scores.find((s) => s.worksheetId === w.id)?.remarks ?? '' })),
        remedial: plans.map((r) => ({ id: r.id, subjectName: r.subjectName, plan: r.plan, dueOn: r.dueOn, status: r.status })),
        readiness: await this.readinessOf(tx, studentId),
        promotion: decision ? { decision: decision.decision, reasons: decision.reasons, failedSubjects: decision.failedSubjects } : null,
      };
    });
  }
}
