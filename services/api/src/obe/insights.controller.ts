import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Injectable, NotFoundException, OnModuleInit, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal, TEACHING_ROLES } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { assertCanSeeStudent } from '../common/student-access.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { assessmentQuestionCos, assessmentQuestions, obeAssignments } from '../db/schema-obe-flagship.js';
import { academicYears, attainmentSnapshots, coOutcomeMap, coSets, courseOutcomes, departments, improvementActions, programOutcomes, programs, sections, students, subjects, surveyQuestions, surveys } from '../db/schema.js';
import { headedDepartmentIds, headsSubject } from '../departments/departments.controller.js';
import { JobsService } from '../jobs/jobs.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { isSchoolAdmin } from '../teacher/teacher.service.js';
import { articulationMatrix, round } from './attainment.js';
import { bloomNumber } from './bloom.js';
import { ObeService } from './obe.service.js';
import { canDecide, coordinatedPrograms, STAGES } from './workflow.js';

const MANAGE: RoleName[] = ['tenant_admin', 'principal', 'quality_officer', 'hod'];
const STAFF: RoleName[] = [...TEACHING_ROLES, 'tenant_admin', 'quality_officer'];
const STUDENT_VIEW: RoleName[] = ['tenant_admin', 'principal', 'quality_officer', 'hod', 'teacher', 'mentor', 'counsellor'];
export const REMINDER_JOB = 'obe.exit-survey-reminders';

const BatchBody = z.object({ entryYearId: z.uuid() });
const ExitSurveyBody = z.object({
  kind: z.enum(['course_exit', 'programme_exit']),
  sectionId: z.uuid(),
  subjectId: z.uuid().optional(),
  closesAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Give the closing date like 2026-11-30'),
  title: z.string().trim().min(3).max(160).optional(),
});

/** "I can explain …" from a statement that starts with an action verb. */
const canStatement = (s: string) => `I can ${s.trim().replace(/^co\s*\d+\s*[:.)-]\s*/i, '').replace(/^./, (c) => c.toLowerCase()).replace(/\.$/, '')}.`;

/** Reminds students who have not answered an open course or programme exit survey; used by the button and the daily job. */
export async function remindExitSurvey(tx: Tx, notifications: NotificationsService, surveyId: string, now = new Date()) {
  const [sv] = await tx.select().from(surveys).where(eq(surveys.id, surveyId));
  if (!sv || sv.status !== 'open' || !sv.sectionId) return 0;
  const pending = await tx
    .select({ userId: students.userId })
    .from(students)
    .where(and(eq(students.sectionId, sv.sectionId), eq(students.status, 'active'), isNotNull(students.userId), sql`not exists (select 1 from survey_responses r where r.survey_id = ${surveyId}::uuid and r.respondent_id = ${students.userId})`));
  const ids = pending.map((r) => r.userId!).filter(Boolean);
  const due = sv.closesAt ? sv.closesAt.toISOString().slice(0, 10) : '';
  if (ids.length)
    await notifications.notifyUsers(tx, ids, {
      kind: 'survey',
      text: {
        en: { title: `Reminder: ${sv.title}`, body: `Your feedback measures how well the course outcomes were met.${due ? ` It closes on ${due}.` : ''}` },
        hi: { title: `स्मरण: ${sv.title}`, body: `आपकी प्रतिक्रिया से पता चलता है कि पाठ्यक्रम के परिणाम कितने पूरे हुए।${due ? ` यह ${due} को बंद होगा।` : ''}` },
        kn: { title: `ನೆನಪು: ${sv.title}`, body: `ನಿಮ್ಮ ಪ್ರತಿಕ್ರಿಯೆ ಕೋರ್ಸ್ ಫಲಿತಾಂಶಗಳು ಎಷ್ಟು ಸಾಧಿಸಲ್ಪಟ್ಟಿವೆ ಎಂಬುದನ್ನು ಅಳೆಯುತ್ತದೆ.${due ? ` ಇದು ${due} ರಂದು ಮುಚ್ಚುತ್ತದೆ.` : ''}` },
      },
      data: { surveyId },
      dedupeKey: `obe-exit-remind:${surveyId}:${now.toISOString().slice(0, 10)}`,
    });
  await tx.update(surveys).set({ lastRemindedAt: now }).where(eq(surveys.id, surveyId));
  return ids.length;
}

/** Daily: reminds non-respondents of OBE exit surveys that close within three days (once a day). */
@Injectable()
export class ObeReminders implements OnModuleInit {
  constructor(
    private readonly jobs: JobsService,
    private readonly db: DbService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.jobs.registerDaily(REMINDER_JOB, (job) => this.run(job.tenantId).then(() => undefined));
  }

  async run(tenantId: string) {
    return this.db.withTenant(tenantId, async (tx) => {
      const open = await tx
        .select({ id: surveys.id })
        .from(surveys)
        .where(and(isNotNull(surveys.obeKind), eq(surveys.status, 'open'), sql`${surveys.closesAt} <= now() + interval '3 days'`, sql`(${surveys.lastRemindedAt} is null or ${surveys.lastRemindedAt} < now() - interval '20 hours')`));
      let n = 0;
      for (const s of open) n += await remindExitSurvey(tx, this.notifications, s.id);
      return n;
    });
  }
}

/**
 * OBE insight and delivery: the role-aware dashboard (approvals waiting, courses missing COs, tags or marks, heat maps of
 * course × CO and programme × PO, weak COs), the programme articulation matrix built from the course matrices, the PO
 * attainment tree, a course's attainment workings, batch-wise attainment, each student's CO attainment, and the course
 * and programme exit surveys delivered to the Student App with reminders.
 */
@Controller('v1/obe')
export class ObeInsightsController {
  constructor(
    private readonly db: DbService,
    private readonly obe: ObeService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get('dashboard')
  @Auth('user', [...STAFF, 'principal', 'hod'])
  dashboard(@CurrentPrincipal() p: UserPrincipal, @Query('academicYearId') academicYearId?: string, @Query('programId') programId?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const years = await tx.select().from(academicYears).orderBy(desc(academicYears.startsOn));
      const year = years.find((y) => y.id === academicYearId) ?? years.find((y) => y.isCurrent) ?? years[0];
      if (!year) return { year: null, programs: [], courses: [], approvals: [], heat: { courses: [], programs: [] }, weakCos: [], counts: {} };
      const leader = isSchoolAdmin(p) || p.roles.includes('quality_officer');
      const coordinated = await coordinatedPrograms(tx, p.userId);
      const headed = p.roles.includes('hod') ? await headedDepartmentIds(tx, p.userId) : [];
      const taught = (await tx.execute<{ subject_id: string }>(sql`select distinct subject_id from timetable_slots where teacher_id = ${p.userId}::uuid and subject_id is not null`)).rows.map((r) => r.subject_id);
      const progs = await tx.select({ id: programs.id, name: programs.name, level: programs.level }).from(programs).orderBy(asc(programs.sortOrder), asc(programs.name));
      // Only programmes and terms that have classes this year.
      const live = await tx.selectDistinct({ programId: sections.programId, term: sections.term }).from(sections).where(eq(sections.academicYearId, year.id));
      const liveKey = new Set(live.map((l) => `${l.programId}:${l.term}`));
      const allSubs = await tx.select({ id: subjects.id, code: subjects.code, name: subjects.name, term: subjects.term, programId: subjects.programId, departmentId: subjects.departmentId, department: departments.name }).from(subjects).leftJoin(departments, eq(departments.id, subjects.departmentId)).orderBy(asc(subjects.term), asc(subjects.sortOrder), asc(subjects.code));
      const inScope = (s: (typeof allSubs)[number]) => leader || coordinated.includes(s.programId) || (s.departmentId !== null && headed.includes(s.departmentId)) || taught.includes(s.id);
      let subs = allSubs.filter((s) => liveKey.has(`${s.programId}:${s.term}`) && inScope(s));
      if (programId) subs = subs.filter((s) => s.programId === programId);
      const progIds = [...new Set(subs.map((s) => s.programId))];
      const scopedPrograms = progs.filter((x) => progIds.includes(x.id) && (leader || coordinated.includes(x.id) || subs.some((s) => s.programId === x.id)));
      const ids = subs.map((s) => s.id);
      const sets = ids.length ? await tx.select().from(coSets).where(inArray(coSets.subjectId, ids)).orderBy(desc(coSets.version)) : [];
      const active = sets.filter((s) => s.status === 'active');
      const cos = active.length ? await tx.select({ id: courseOutcomes.id, code: courseOutcomes.code, setId: courseOutcomes.coSetId, ord: courseOutcomes.ord }).from(courseOutcomes).where(inArray(courseOutcomes.coSetId, active.map((s) => s.id))).orderBy(asc(courseOutcomes.ord), asc(courseOutcomes.code)) : [];
      const mapped = new Set(cos.length ? (await tx.selectDistinct({ coId: coOutcomeMap.coId }).from(coOutcomeMap).where(inArray(coOutcomeMap.coId, cos.map((c) => c.id)))).map((r) => r.coId) : []);
      const asm = ids.length
        ? await tx.execute<{ subject_id: string; n: number; tagged: number; complete: number; questions: number }>(sql`
            select a.subject_id, count(*)::int as n,
              count(*) filter (where exists (select 1 from assessment_questions q join assessment_question_cos c on c.question_id = q.id where q.assessment_id = a.id) or exists (select 1 from assessment_co_map m where m.assessment_id = a.id))::int as tagged,
              count(*) filter (where (select count(*) from marks m where m.assessment_id = a.id) >= (select count(*) from students s where s.section_id = a.section_id and s.status = 'active') and (select count(*) from students s where s.section_id = a.section_id and s.status = 'active') > 0)::int as complete,
              count(*) filter (where exists (select 1 from assessment_questions q where q.assessment_id = a.id))::int as questions
            from assessments a join sections sc on sc.id = a.section_id
            where sc.academic_year_id = ${year.id}::uuid and a.subject_id in (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})
            group by a.subject_id`)
        : { rows: [] };
      const snaps = progIds.length
        ? await tx
            .select()
            .from(attainmentSnapshots)
            .where(and(inArray(attainmentSnapshots.programId, progIds), eq(attainmentSnapshots.academicYearId, year.id), sql`"attainment_snapshots"."computed_at" = (select max(x.computed_at) from attainment_snapshots x where x.program_id = "attainment_snapshots"."program_id" and x.academic_year_id = ${year.id}::uuid)`))
        : [];
      const coSnap = new Map(snaps.filter((s) => s.scope === 'co').map((s) => [s.targetId, s]));
      const courses = subs.map((s) => {
        const set = active.find((x) => x.subjectId === s.id);
        const draft = sets.find((x) => x.subjectId === s.id && x.status === 'draft');
        const mine = set ? cos.filter((c) => c.setId === set.id) : [];
        const a = asm.rows.find((r) => r.subject_id === s.id);
        const vals = mine.map((c) => coSnap.get(c.id)).filter((x) => x && x.combined !== null);
        return {
          ...s,
          coSetId: set?.id ?? null,
          version: set?.version ?? null,
          draftId: draft?.id ?? null,
          reviewStage: draft?.reviewStage ?? (set ? 'approved' : 'none'),
          cos: mine.length,
          mapped: mine.filter((c) => mapped.has(c.id)).length,
          assessments: a?.n ?? 0,
          tagged: a?.tagged ?? 0,
          questionPapers: a?.questions ?? 0,
          marksComplete: a?.complete ?? 0,
          attainment: vals.length ? round(vals.reduce((t, x) => t + (x!.combined as number), 0) / vals.length, 2) : null,
          belowTarget: vals.filter((x) => !x!.met).length,
          flags: [...(!set ? ['noCos'] : []), ...(set && mine.some((c) => !mapped.has(c.id)) ? ['unmapped'] : []), ...(a && a.tagged < a.n ? ['untagged'] : []), ...(a && a.complete < a.n ? ['marks'] : []), ...(!a ? ['noAssessments'] : [])],
        };
      });
      // Approvals waiting for this person.
      const waiting = await tx
        .select({ id: coSets.id, version: coSets.version, stage: coSets.reviewStage, submittedAt: coSets.submittedAt, subjectId: subjects.id, code: subjects.code, subject: subjects.name, program: programs.name })
        .from(coSets)
        .innerJoin(subjects, eq(subjects.id, coSets.subjectId))
        .innerJoin(programs, eq(programs.id, subjects.programId))
        .where(inArray(coSets.reviewStage, [...STAGES]))
        .orderBy(asc(coSets.submittedAt));
      const approvals = [];
      for (const w of waiting) if (await canDecide(tx, p, w.subjectId, w.stage)) approvals.push(w);
      const heatCourses = courses
        .filter((c) => c.coSetId)
        .map((c) => ({ subjectId: c.id, code: c.code, name: c.name, programId: c.programId, term: c.term, cos: cos.filter((x) => x.setId === c.coSetId).map((x) => ({ coId: x.id, code: x.code, value: coSnap.get(x.id)?.combined ?? null, target: coSnap.get(x.id)?.target ?? null, met: coSnap.get(x.id)?.met ?? null })) }));
      const pos = progIds.length ? await tx.select({ id: programOutcomes.id, programId: programOutcomes.programId, kind: programOutcomes.kind, code: programOutcomes.code, ord: programOutcomes.ord }).from(programOutcomes).where(and(inArray(programOutcomes.programId, progIds), inArray(programOutcomes.kind, ['po', 'pso']))).orderBy(asc(programOutcomes.kind), asc(programOutcomes.ord)) : [];
      const poSnap = new Map(snaps.filter((s) => s.scope === 'po').map((s) => [s.targetId, s]));
      const frameworks = await Promise.all(scopedPrograms.map((x) => this.obe.framework(tx, x.id)));
      const heatPrograms = scopedPrograms.map((x, i) => ({ programId: x.id, name: x.name, framework: frameworks[i], computedAt: snaps.find((s) => s.programId === x.id)?.computedAt ?? null, outcomes: pos.filter((o) => o.programId === x.id).map((o) => ({ outcomeId: o.id, code: o.code, kind: o.kind, value: poSnap.get(o.id)?.combined ?? null, target: poSnap.get(o.id)?.target ?? null, met: poSnap.get(o.id)?.met ?? null })) }));
      const subjectOf = new Map(subs.map((s) => [s.id, s]));
      const weakCos = snaps
        .filter((s) => s.scope === 'co' && !s.met && s.gap !== null && s.subjectId && subjectOf.has(s.subjectId))
        .sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0))
        .slice(0, 12)
        .map((s) => ({ coId: s.targetId, code: s.code, subjectId: s.subjectId, subject: subjectOf.get(s.subjectId!)?.name ?? '', programId: s.programId, combined: s.combined, target: s.target, gap: s.gap, weak: ((s.detail as { weakItems?: { label: string }[] }).weakItems ?? []).slice(0, 2).map((w) => w.label) }));
      const [act] = progIds.length ? await tx.select({ open: sql<number>`count(*) filter (where ${improvementActions.status} <> 'done')::int`, overdue: sql<number>`count(*) filter (where ${improvementActions.status} <> 'done' and ${improvementActions.dueOn} < current_date)::int`, toVerify: sql<number>`count(*) filter (where ${improvementActions.status} = 'done' and ${improvementActions.verifiedAt} is null)::int` }).from(improvementActions).where(inArray(improvementActions.programId, progIds)) : [{ open: 0, overdue: 0, toVerify: 0 }];
      const [sv] = await tx.select({ n: sql<number>`count(*)::int` }).from(surveys).where(and(isNotNull(surveys.obeKind), eq(surveys.status, 'open')));
      return {
        year: { id: year.id, label: year.label },
        years: years.map((y) => ({ id: y.id, label: y.label })),
        me: { leader, coordinated, headed, taught: taught.length },
        programs: scopedPrograms.map((x, i) => ({ ...x, framework: frameworks[i] })),
        courses,
        approvals,
        heat: { courses: heatCourses, programs: heatPrograms },
        weakCos,
        counts: {
          programs: scopedPrograms.length,
          courses: courses.length,
          cos: courses.reduce((s, c) => s + c.cos, 0),
          approvals: approvals.length,
          noCos: courses.filter((c) => c.flags.includes('noCos')).length,
          unmapped: courses.filter((c) => c.flags.includes('unmapped')).length,
          untagged: courses.filter((c) => c.flags.includes('untagged')).length,
          marks: courses.filter((c) => c.flags.includes('marks')).length,
          cosMet: snaps.filter((s) => s.scope === 'co' && s.met && s.subjectId && subjectOf.has(s.subjectId)).length,
          cosMeasured: snaps.filter((s) => s.scope === 'co' && s.combined !== null && s.subjectId && subjectOf.has(s.subjectId)).length,
          actionsOpen: act?.open ?? 0,
          actionsOverdue: act?.overdue ?? 0,
          actionsToVerify: act?.toVerify ?? 0,
          surveysOpen: sv?.n ?? 0,
        },
      };
    });
  }

  /** The programme articulation matrix: each course's average CO strength towards each PO/PSO, built from the course matrices. */
  @Get('programs/:programId/articulation')
  @Auth('user', [...STAFF, 'principal', 'hod'])
  articulation(@CurrentPrincipal() p: UserPrincipal, @Param('programId', ParseUUIDPipe) programId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.obe.program(tx, programId);
      const outcomes = await tx.select({ id: programOutcomes.id, kind: programOutcomes.kind, code: programOutcomes.code, statement: programOutcomes.statement }).from(programOutcomes).where(and(eq(programOutcomes.programId, programId), inArray(programOutcomes.kind, ['po', 'pso']))).orderBy(asc(programOutcomes.kind), asc(programOutcomes.ord), asc(programOutcomes.code));
      const subs = await tx.select({ id: subjects.id, code: subjects.code, name: subjects.name, term: subjects.term }).from(subjects).where(eq(subjects.programId, programId)).orderBy(asc(subjects.term), asc(subjects.sortOrder), asc(subjects.code));
      const cells = subs.length
        ? await tx
            .select({ courseId: coSets.subjectId, outcomeId: coOutcomeMap.outcomeId, strength: coOutcomeMap.strength })
            .from(coOutcomeMap)
            .innerJoin(courseOutcomes, eq(courseOutcomes.id, coOutcomeMap.coId))
            .innerJoin(coSets, eq(coSets.id, courseOutcomes.coSetId))
            .where(and(inArray(coSets.subjectId, subs.map((s) => s.id)), eq(coSets.status, 'active')))
        : [];
      const m = articulationMatrix(cells);
      const rows = subs.filter((s) => m.has(s.id)).map((s) => ({ ...s, values: Object.fromEntries(outcomes.map((o) => [o.id, m.get(s.id)?.get(o.id) ?? null])) }));
      const average = Object.fromEntries(outcomes.map((o) => { const v = rows.map((r) => r.values[o.id]).filter((x): x is number => x !== null); return [o.id, v.length ? round(v.reduce((a, b) => a + b, 0) / v.length, 2) : null]; }));
      return { outcomes, rows, average, missing: subs.filter((s) => !m.has(s.id)).map((s) => ({ id: s.id, code: s.code, name: s.name, term: s.term })) };
    });
  }

  /** How each PO/PSO's attainment was reached in a year: direct from each course (articulation × attainment), indirect, combined. */
  @Get('programs/:programId/attainment/tree')
  @Auth('user', MANAGE)
  tree(@CurrentPrincipal() p: UserPrincipal, @Param('programId', ParseUUIDPipe) programId: string, @Query('academicYearId', ParseUUIDPipe) academicYearId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { computedAt, rows } = await this.obe.latest(tx, programId, academicYearId);
      const config = await this.obe.config(tx, programId);
      const subs = await tx.select({ id: subjects.id, code: subjects.code, name: subjects.name, term: subjects.term }).from(subjects).where(eq(subjects.programId, programId));
      const name = new Map(subs.map((s) => [s.id, s]));
      const coRows = new Map(rows.filter((r) => r.scope === 'co').map((r) => [r.targetId, r]));
      const statements = new Map((await tx.select({ id: programOutcomes.id, statement: programOutcomes.statement }).from(programOutcomes).where(eq(programOutcomes.programId, programId))).map((s) => [s.id, s.statement]));
      return {
        computedAt,
        method: config.poMethod,
        weights: { direct: config.directWeight, indirect: config.indirectWeight },
        outcomes: rows
          .filter((r) => r.scope === 'po')
          .sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }))
          .map((r) => {
            const d = r.detail as { byCourse?: { courseId: string; articulation: number; attainment: number | null; cos: number }[]; contributions?: { coId: string; subjectId?: string; strength: number; co: number | null }[]; coverage?: number; surveys?: { used: string[] } };
            return {
              outcomeId: r.targetId,
              code: r.code,
              statement: statements.get(r.targetId) ?? '',
              direct: r.direct,
              indirect: r.indirect,
              combined: r.combined,
              target: r.target,
              met: r.met,
              coverage: d.coverage ?? null,
              courses: [...(d.byCourse ?? [])].sort((a, z) => (name.get(a.courseId)?.term ?? 0) - (name.get(z.courseId)?.term ?? 0) || (name.get(a.courseId)?.code ?? '').localeCompare(name.get(z.courseId)?.code ?? '', 'en', { numeric: true })).map((c) => ({ ...c, code: name.get(c.courseId)?.code ?? '', name: name.get(c.courseId)?.name ?? '', term: name.get(c.courseId)?.term ?? null, cos: (d.contributions ?? []).filter((x) => x.subjectId === c.courseId).map((x) => ({ coId: x.coId, code: coRows.get(x.coId)?.code.split('/').pop() ?? '', strength: x.strength, attainment: x.co })) })),
            };
          }),
      };
    });
  }

  /**
   * A course's attainment workings for a year: per CO the CIE and SEE pools (students, attaining, levels), indirect,
   * combined against the target; per question the class average and the COs it tests; the paper's Bloom spread.
   */
  @Get('subjects/:subjectId/attainment')
  @Auth('user', STAFF)
  courseAttainment(@CurrentPrincipal() p: UserPrincipal, @Param('subjectId', ParseUUIDPipe) subjectId: string, @Query('academicYearId', ParseUUIDPipe) academicYearId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [sub] = await tx.select().from(subjects).where(eq(subjects.id, subjectId));
      if (!sub) throw new NotFoundException('Subject not found');
      await this.assertCourseReader(tx, p, sub);
      const { config, source } = await this.obe.policy(tx, sub.programId, subjectId, academicYearId);
      const { computedAt, rows } = await this.obe.latest(tx, sub.programId, academicYearId);
      const [set] = await tx.select().from(coSets).where(and(eq(coSets.subjectId, subjectId), eq(coSets.status, 'active')));
      const cos = set ? await tx.select().from(courseOutcomes).where(eq(courseOutcomes.coSetId, set.id)).orderBy(asc(courseOutcomes.ord), asc(courseOutcomes.code)) : [];
      const snap = new Map(rows.filter((r) => r.scope === 'co').map((r) => [r.targetId, r]));
      const qs = await tx
        .select({ id: assessmentQuestions.id, no: assessmentQuestions.no, part: assessmentQuestions.part, maxMarks: assessmentQuestions.maxMarks, bloomLevel: assessmentQuestions.bloomLevel, assessmentId: assessmentQuestions.assessmentId, assessment: sql<string>`(select a.title from assessments a where a.id = "assessment_questions"."assessment_id")`, avg: sql<number | null>`(select avg(m.marks)::float from question_marks m where m.question_id = "assessment_questions"."id" and m.marks is not null)`, answered: sql<number>`(select count(*)::int from question_marks m where m.question_id = "assessment_questions"."id" and m.marks is not null)` })
        .from(assessmentQuestions)
        .where(sql`${assessmentQuestions.assessmentId} in (select a.id from assessments a join sections s on s.id = a.section_id where a.subject_id = ${subjectId}::uuid and s.academic_year_id = ${academicYearId}::uuid)`)
        .orderBy(asc(assessmentQuestions.assessmentId), asc(assessmentQuestions.ord));
      const tags = qs.length ? await tx.select().from(assessmentQuestionCos).where(inArray(assessmentQuestionCos.questionId, qs.map((q) => q.id))) : [];
      const code = new Map(cos.map((c) => [c.id, c.code]));
      return {
        subject: { id: sub.id, code: sub.code, name: sub.name, term: sub.term, programId: sub.programId },
        computedAt,
        policy: { ...config, source },
        cos: cos.map((c) => {
          const r = snap.get(c.id);
          const d = (r?.detail ?? {}) as { byKind?: unknown[]; weakItems?: unknown[]; surveys?: { used: string[]; skipped: string[] }; items?: unknown[] };
          return { id: c.id, code: c.code, statement: c.statement, bloomLevel: c.bloomLevel, direct: r?.direct ?? null, indirect: r?.indirect ?? null, combined: r?.combined ?? null, target: r?.target ?? config.targetLevel, gap: r?.gap ?? null, met: r?.met ?? null, byKind: d.byKind ?? [], weakItems: d.weakItems ?? [], items: d.items ?? [], surveys: d.surveys ?? null };
        }),
        questions: qs.map((q) => ({ ...q, percent: q.avg === null ? null : round((q.avg / q.maxMarks) * 100, 1), cos: tags.filter((t) => t.questionId === q.id).map((t) => code.get(t.coId) ?? '').filter(Boolean) })),
        bloom: [1, 2, 3, 4, 5, 6].map((l) => ({ level: l, marks: round(qs.filter((q) => bloomNumber(q.bloomLevel) === l).reduce((s, q) => s + q.maxMarks, 0), 2) })),
      };
    });
  }

  // ---- batches ----------------------------------------------------------------------------------------------------------

  @Post('programs/:programId/batches/compute')
  @HttpCode(200)
  @Auth('user', MANAGE)
  computeBatch(@CurrentPrincipal() p: UserPrincipal, @Param('programId', ParseUUIDPipe) programId: string, @Body(new ZodBody(BatchBody)) body: z.infer<typeof BatchBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = await this.obe.computeBatch(tx, p.tenantId, p.userId, programId, body.entryYearId);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'obe.batch.computed', subjectType: 'program', subjectId: programId, data: { batch: r.batch } });
      return r;
    });
  }

  /** Each batch's latest PO/PSO attainment, side by side. */
  @Get('programs/:programId/batches')
  @Auth('user', MANAGE)
  batches(@CurrentPrincipal() p: UserPrincipal, @Param('programId', ParseUUIDPipe) programId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { batches, rows } = await this.obe.batches(tx, programId);
      const codes = [...new Set(rows.map((r) => r.code))].sort((a, b) => (a.startsWith('PSO') === b.startsWith('PSO') ? a.localeCompare(b, 'en', { numeric: true }) : a.startsWith('PSO') ? 1 : -1));
      const years = await tx.select({ id: academicYears.id, label: academicYears.label }).from(academicYears).orderBy(asc(academicYears.startsOn));
      return { batches, entryYears: years, outcomes: codes.map((code) => ({ code, values: batches.map((b) => rows.find((r) => r.entryYearId === b.entryYearId && r.code === code) ?? null).map((r) => (r ? { direct: r.direct, indirect: r.indirect, combined: r.combined, target: r.target, met: r.met } : null)) })) };
    });
  }

  // ---- students ---------------------------------------------------------------------------------------------------------

  /** The signed-in student's CO-wise attainment in their courses (Student App). */
  @Get('students/me/outcomes')
  @Auth('user', ['student'])
  myOutcomes(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [s] = await tx.select({ id: students.id }).from(students).where(eq(students.userId, p.userId));
      if (!s) throw new NotFoundException('Student not found');
      return this.obe.studentOutcomes(tx, s.id);
    });
  }

  /** A student's CO-wise attainment (staff, the student and their family). */
  @Get('students/:id/outcomes')
  @Auth('user', [...STUDENT_VIEW, 'student', 'guardian'])
  studentOutcomes(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Query('academicYearId') academicYearId?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, id, STUDENT_VIEW);
      return this.obe.studentOutcomes(tx, id, academicYearId && z.uuid().safeParse(academicYearId).success ? academicYearId : undefined);
    });
  }

  // ---- exit surveys (indirect assessment, delivered in the Student App) --------------------------------------------------

  /**
   * Opens a course exit survey (one rating question per CO of the course: "I can …") or a programme exit survey (one per
   * PO/PSO) for a class; its students answer in the Student App and are told it is open.
   */
  @Post('exit-surveys')
  @Auth('user', STAFF)
  createExit(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ExitSurveyBody)) body: z.infer<typeof ExitSurveyBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [sec] = await tx.select().from(sections).where(eq(sections.id, body.sectionId));
      if (!sec) throw new NotFoundException('Class not found');
      const closes = new Date(`${body.closesAt}T23:59:00+05:30`);
      if (closes.getTime() < Date.now() - 86400_000) throw new BadRequestException('The closing date has passed');
      let title: string;
      let questions: { prompt: string; coId?: string; outcomeId?: string }[];
      let subjectId: string | null = null;
      if (body.kind === 'course_exit') {
        if (!body.subjectId) throw new BadRequestException('Choose the course');
        const [sub] = await tx.select().from(subjects).where(eq(subjects.id, body.subjectId));
        if (!sub || sub.programId !== sec.programId || sub.term !== sec.term) throw new BadRequestException('That course is not taught in this class');
        if (!isSchoolAdmin(p) && !p.roles.includes('quality_officer') && !(await headsSubject(tx, p, sub.id))) {
          const [slot] = (await tx.execute<{ n: number }>(sql`select count(*)::int as n from timetable_slots where subject_id = ${sub.id}::uuid and section_id = ${sec.id}::uuid and teacher_id = ${p.userId}::uuid`)).rows;
          if (!slot?.n) throw new ForbiddenException('You do not teach this course in this class');
        }
        const [set] = await tx.select().from(coSets).where(and(eq(coSets.subjectId, sub.id), eq(coSets.status, 'active')));
        const cos = set ? await tx.select().from(courseOutcomes).where(eq(courseOutcomes.coSetId, set.id)).orderBy(asc(courseOutcomes.ord), asc(courseOutcomes.code)) : [];
        if (!cos.length) throw new BadRequestException('The course has no approved course outcomes yet');
        title = body.title ?? `Course exit survey: ${sub.name}`;
        questions = cos.map((c) => ({ prompt: `${c.code}: ${canStatement(c.statement)}`, coId: c.id }));
        subjectId = sub.id;
      } else {
        if (!isSchoolAdmin(p) && !p.roles.includes('quality_officer') && !p.roles.includes('hod') && !(await coordinatedPrograms(tx, p.userId)).includes(sec.programId)) throw new ForbiddenException('Only the OBE coordinator, a head of department or the IQAC can run programme surveys');
        const pos = await tx.select().from(programOutcomes).where(and(eq(programOutcomes.programId, sec.programId), inArray(programOutcomes.kind, ['po', 'pso']))).orderBy(asc(programOutcomes.kind), asc(programOutcomes.ord));
        if (!pos.length) throw new BadRequestException('The programme has no POs or PSOs');
        const [prog] = await tx.select({ name: programs.name }).from(programs).where(eq(programs.id, sec.programId));
        title = body.title ?? `Programme exit survey: ${prog?.name ?? ''}`;
        questions = pos.map((o) => ({ prompt: `${o.code}: How well did the programme prepare you for this? ${o.statement}`.slice(0, 480), outcomeId: o.id }));
      }
      const [sv] = await tx.insert(surveys).values({ tenantId: p.tenantId, title, description: 'Rate each statement from 1 (not at all) to 5 (fully). Your answers are anonymous and are used for outcome attainment.', audience: 'section', sectionId: sec.id, anonymous: true, opensAt: new Date(), closesAt: closes, status: 'open', createdBy: p.userId, obeKind: body.kind, programId: sec.programId, subjectId, academicYearId: sec.academicYearId }).returning();
      await tx.insert(surveyQuestions).values([...questions.map((q, i) => ({ tenantId: p.tenantId, surveyId: sv.id, ord: i + 1, kind: 'rating' as const, prompt: q.prompt, required: true, coId: q.coId ?? null, outcomeId: q.outcomeId ?? null })), { tenantId: p.tenantId, surveyId: sv.id, ord: questions.length + 1, kind: 'text' as const, prompt: 'What should be continued or changed?', required: false }]);
      const ids = (await tx.select({ u: students.userId }).from(students).where(and(eq(students.sectionId, sec.id), eq(students.status, 'active'), isNotNull(students.userId)))).map((r) => r.u!);
      await this.notifications.notifyUsers(tx, ids, { kind: 'survey', text: { en: { title, body: 'Please rate how well you met each outcome. It takes two minutes.' }, hi: { title, body: 'कृपया बताइए कि आपने प्रत्येक परिणाम कितना प्राप्त किया। इसमें दो मिनट लगते हैं।' }, kn: { title, body: 'ಪ್ರತಿ ಫಲಿತಾಂಶವನ್ನು ನೀವು ಎಷ್ಟು ಸಾಧಿಸಿದ್ದೀರಿ ಎಂದು ದಯವಿಟ್ಟು ತಿಳಿಸಿ. ಇದಕ್ಕೆ ಎರಡು ನಿಮಿಷ ಸಾಕು.' } }, data: { surveyId: sv.id }, dedupeKey: `obe-exit-open:${sv.id}` });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'obe.exit_survey.opened', subjectType: 'survey', subjectId: sv.id, data: { kind: body.kind, questions: questions.length } });
      return { id: sv.id, title, questions: questions.length, students: ids.length };
    });
  }

  /** The OBE surveys of a programme for a year with how many have answered. */
  @Get('programs/:programId/exit-surveys')
  @Auth('user', STAFF)
  exitSurveys(@CurrentPrincipal() p: UserPrincipal, @Param('programId', ParseUUIDPipe) programId: string, @Query('academicYearId') academicYearId?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ id: surveys.id, title: surveys.title, kind: surveys.obeKind, status: surveys.status, closesAt: surveys.closesAt, lastRemindedAt: surveys.lastRemindedAt, subjectId: surveys.subjectId, section: sections.displayName, classSize: sql<number>`(select count(*)::int from students s where s.section_id = ${surveys.sectionId} and s.status = 'active')`, responses: sql<number>`(select count(*)::int from survey_responses r where r.survey_id = ${surveys.id})`, mean: sql<number | null>`(select round(avg(a.rating)::numeric, 2)::float from survey_answers a join survey_questions q on q.id = a.question_id where q.survey_id = ${surveys.id} and q.kind = 'rating')` })
        .from(surveys)
        .leftJoin(sections, eq(sections.id, surveys.sectionId))
        .where(and(eq(surveys.programId, programId), isNotNull(surveys.obeKind), academicYearId && z.uuid().safeParse(academicYearId).success ? eq(surveys.academicYearId, academicYearId) : sql`true`))
        .orderBy(desc(surveys.createdAt));
      return rows;
    });
  }

  /** Reminds the students of the class who have not answered yet. */
  @Post('exit-surveys/:id/remind')
  @HttpCode(200)
  @Auth('user', STAFF)
  remind(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [sv] = await tx.select().from(surveys).where(eq(surveys.id, id));
      if (!sv?.obeKind) throw new NotFoundException('Survey not found');
      if (sv.status !== 'open') throw new BadRequestException('The survey is not open');
      const reminded = await remindExitSurvey(tx, this.notifications, id);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'obe.exit_survey.reminded', subjectType: 'survey', subjectId: id, data: { reminded } });
      return { reminded };
    });
  }

  private async assertCourseReader(tx: Tx, p: UserPrincipal, sub: typeof subjects.$inferSelect) {
    if (isSchoolAdmin(p) || p.roles.includes('quality_officer') || (await headsSubject(tx, p, sub.id))) return;
    if ((await coordinatedPrograms(tx, p.userId)).includes(sub.programId)) return;
    const [slot] = (await tx.execute<{ n: number }>(sql`select count(*)::int as n from timetable_slots where subject_id = ${sub.id}::uuid and teacher_id = ${p.userId}::uuid`)).rows;
    if (slot?.n) return;
    const [a] = await tx.select({ id: obeAssignments.id }).from(obeAssignments).where(and(eq(obeAssignments.userId, p.userId), eq(obeAssignments.subjectId, sub.id)));
    if (!a) throw new ForbiddenException('You do not teach this course');
  }
}
