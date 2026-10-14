import { ConflictException, Injectable, OnModuleInit } from '@nestjs/common';
import { asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { homework, sections, subjects, users } from '../db/schema.js';
import { lmsQuizzes } from '../db/schema-life.js';
import { RecordRegistry, type FieldOption, type KitCtx, type RecordEntity } from '../records/entity.js';
import { copyName, Int, Text, uuidEq } from '../records/helpers.js';
import { qualified } from '../campus-life/kit-shared.js';
import { LMS_STAFF, LmsService } from './lms.service.js';

const choices = (m: Record<string, string>): FieldOption[] => Object.entries(m).map(([value, label]) => ({ value, label }));
export const QUIZ_STATUSES = choices({ draft: 'Draft', published: 'Published', closed: 'Closed' });
export const LATE_POLICIES = choices({ accept: 'Accept late work', penalty: 'Accept with a penalty', reject: 'Do not accept late work' });
const labelOf = (opts: FieldOption[], v: unknown) => opts.find((o) => o.value === v)?.label ?? String(v ?? '');
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v === null || v === undefined ? '' : String(v));
const STAFF = [...LMS_STAFF];

async function sectionOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ id: sections.id, name: sections.displayName }).from(sections).orderBy(asc(sections.displayName))).map((s) => ({ value: s.id, label: s.name }));
}
async function subjectOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ id: subjects.id, name: subjects.name, code: subjects.code }).from(subjects).orderBy(asc(subjects.name))).map((s) => ({ value: s.id, label: `${s.code} ${s.name}` }));
}

/** Teachers see the classes they teach; leaders see everything. */
const teachesScope = (table: 'homework' | 'lms_quizzes') => (ctx: KitCtx) =>
  ctx.p.roles.some((r) => r === 'principal' || r === 'tenant_admin' || r === 'hod')
    ? undefined
    : sql`(exists (select 1 from timetable_slots ts where ts.teacher_id = ${ctx.p.userId}::uuid and ts.section_id = ${qualified(table, 'section_id')} and ts.archived_at is null) or ${qualified(table, 'created_by')} = ${ctx.p.userId}::uuid)`;

const hwSubmitted = sql<number>`(select count(*)::int from homework_submissions s where s.homework_id = ${qualified('homework')})`;
const hwLate = sql<number>`(select count(*)::int from homework_submissions s where s.homework_id = ${qualified('homework')} and s.late)`;
const hwStudents = sql<number>`(select count(*)::int from students st where st.section_id = ${qualified('homework', 'section_id')} and st.status = 'active')`;

/** Assignments (homework) as a kit list: the office's and the teacher's register of what was set, with compliance. */
export function assignmentsEntity(): RecordEntity {
  return {
    key: 'assignments',
    module: 'lms',
    table: homework,
    subjectType: 'homework',
    roles: { read: STAFF, write: STAFF },
    label: (r) => String(r.title),
    list: {
      select: {
        id: homework.id,
        title: homework.title,
        instructions: homework.instructions,
        sectionId: homework.sectionId,
        className: sections.displayName,
        subjectId: homework.subjectId,
        subject: subjects.name,
        teacher: users.fullName,
        dueOn: homework.dueOn,
        maxMarks: homework.maxMarks,
        latePolicy: homework.latePolicy,
        latePenaltyPct: homework.latePenaltyPct,
        cutoffOn: homework.cutoffOn,
        maxAttempts: homework.maxAttempts,
        groupMode: homework.groupMode,
        pushed: sql<boolean>`${homework.pushedAssessmentId} is not null`,
        students: hwStudents,
        submitted: hwSubmitted,
        late: hwLate,
        createdAt: homework.createdAt,
      },
      joins: (q) => q.innerJoin(sections, eq(sections.id, homework.sectionId)).innerJoin(subjects, eq(subjects.id, homework.subjectId)).innerJoin(users, eq(users.id, homework.createdBy)),
      search: [homework.title, subjects.name, sections.displayName, users.fullName],
      filters: {
        section: { label: 'Class', options: sectionOptions, where: (v) => uuidEq(homework.sectionId, v) },
        subject: { label: 'Subject', options: subjectOptions, where: (v) => uuidEq(homework.subjectId, v) },
        when: { label: 'Due', options: [{ value: 'upcoming', label: 'Not yet due' }, { value: 'past', label: 'Past due' }], where: (v) => (v === 'upcoming' ? sql`${homework.dueOn} >= current_date` : v === 'past' ? sql`${homework.dueOn} < current_date` : undefined) },
        policy: { label: 'Late work', options: LATE_POLICIES, where: (v) => eq(homework.latePolicy, v as 'accept') },
      },
      sorts: { due: homework.dueOn, title: homework.title, className: sections.displayName, subject: subjects.name, submitted: hwSubmitted, created: homework.createdAt },
      defaultSort: { id: 'due', dir: 'desc' },
      scope: teachesScope('homework'),
    },
    fields: {
      title: { label: 'Title', type: 'text', schema: Text(200), column: homework.title, required: true, create: false },
      instructions: { label: 'Instructions', type: 'textarea', schema: z.string().trim().max(4000), column: homework.instructions, create: false },
      dueOn: { label: 'Due on', type: 'date', schema: z.iso.date(), column: homework.dueOn, create: false, bulk: true },
      maxMarks: { label: 'Maximum marks', type: 'number', schema: z.union([z.coerce.number().positive().max(1000), z.null()]), column: homework.maxMarks, create: false, bulk: true },
      latePolicy: { label: 'Late work', type: 'select', schema: z.enum(['accept', 'penalty', 'reject']), column: homework.latePolicy, options: LATE_POLICIES, create: false, bulk: true },
      latePenaltyPct: { label: 'Late penalty %', type: 'number', schema: Int(0, 100), column: homework.latePenaltyPct, create: false, bulk: true },
      maxAttempts: { label: 'Hand-ins allowed', type: 'number', schema: Int(1, 10), column: homework.maxAttempts, create: false, bulk: true },
    },
    remove: { guard: async (ctx, id) => ((await ctx.tx.select({ n: sql<number>`count(*)::int` }).from(sql`homework_submissions`).where(sql`homework_id = ${id}::uuid`))[0]?.n ? 'Students have handed this in; it stays on the record' : null) },
    columns: [
      { key: 'title', header: 'Assignment' },
      { key: 'className', header: 'Class' },
      { key: 'subject', header: 'Subject' },
      { key: 'teacher', header: 'Set by' },
      { key: 'dueOn', header: 'Due on' },
      { key: 'maxMarks', header: 'Max marks' },
      { key: 'latePolicy', header: 'Late work', value: (r) => labelOf(LATE_POLICIES, r.latePolicy) },
      { key: 'students', header: 'Students' },
      { key: 'submitted', header: 'Handed in' },
      { key: 'late', header: 'Late' },
    ],
  };
}

const quizQuestions = sql<number>`(select count(*)::int from lms_quiz_questions x where x.quiz_id = ${qualified('lms_quizzes')})`;
const quizAttempts = sql<number>`(select count(*)::int from lms_quiz_attempts a where a.quiz_id = ${qualified('lms_quizzes')} and a.submitted_at is not null)`;
const quizAvg = sql<number | null>`(select round(avg(a.score * 100.0 / nullif(a.max_score, 0)))::int from lms_quiz_attempts a where a.quiz_id = ${qualified('lms_quizzes')} and a.submitted_at is not null)`;

export function quizzesEntity(lms: LmsService): RecordEntity {
  return {
    key: 'lms-quizzes',
    module: 'lms',
    table: lmsQuizzes,
    subjectType: 'lms_quiz',
    roles: { read: STAFF, write: STAFF },
    label: (r) => String(r.title),
    list: {
      select: { id: lmsQuizzes.id, title: lmsQuizzes.title, sectionId: lmsQuizzes.sectionId, className: sections.displayName, subjectId: lmsQuizzes.subjectId, subject: subjects.name, opensAt: lmsQuizzes.opensAt, closesAt: lmsQuizzes.closesAt, durationMin: lmsQuizzes.durationMin, maxAttempts: lmsQuizzes.maxAttempts, drawCount: lmsQuizzes.drawCount, status: lmsQuizzes.status, questions: quizQuestions, attempts: quizAttempts, averagePct: quizAvg, createdAt: lmsQuizzes.createdAt },
      joins: (q) => q.innerJoin(sections, eq(sections.id, lmsQuizzes.sectionId)).innerJoin(subjects, eq(subjects.id, lmsQuizzes.subjectId)),
      search: [lmsQuizzes.title, subjects.name, sections.displayName],
      filters: {
        status: { label: 'Status', options: QUIZ_STATUSES, where: (v) => eq(lmsQuizzes.status, v as 'draft') },
        section: { label: 'Class', options: sectionOptions, where: (v) => uuidEq(lmsQuizzes.sectionId, v) },
        subject: { label: 'Subject', options: subjectOptions, where: (v) => uuidEq(lmsQuizzes.subjectId, v) },
      },
      sorts: { opens: lmsQuizzes.opensAt, title: lmsQuizzes.title, attempts: quizAttempts, created: lmsQuizzes.createdAt },
      defaultSort: { id: 'opens', dir: 'desc' },
      scope: teachesScope('lms_quizzes'),
    },
    fields: {
      title: { label: 'Title', type: 'text', schema: Text(200), column: lmsQuizzes.title, required: true, create: false },
      durationMin: { label: 'Time limit (minutes)', type: 'number', schema: Int(1, 600), column: lmsQuizzes.durationMin, create: false, bulk: true },
      maxAttempts: { label: 'Attempts allowed', type: 'number', schema: Int(1, 10), column: lmsQuizzes.maxAttempts, create: false, bulk: true },
    },
    duplicate: async (ctx, row) => {
      const [q] = await ctx.tx.select({ sectionId: lmsQuizzes.sectionId, subjectId: lmsQuizzes.subjectId }).from(lmsQuizzes).where(eq(lmsQuizzes.id, String(row.id)));
      await lms.assertManage(ctx.tx, ctx.p, q);
      return { title: await copyName(ctx.tx, lmsQuizzes, lmsQuizzes.title, String(row.title)), status: 'draft', created_by: ctx.p.userId };
    },
    remove: { guard: async (ctx, id) => ((await ctx.tx.select({ s: lmsQuizzes.status }).from(lmsQuizzes).where(eq(lmsQuizzes.id, id)))[0]?.s === 'published' ? 'Close the quiz before deleting it' : null) },
    columns: [
      { key: 'title', header: 'Quiz' },
      { key: 'className', header: 'Class' },
      { key: 'subject', header: 'Subject' },
      { key: 'opensAt', header: 'Opens', value: (r) => iso(r.opensAt) },
      { key: 'closesAt', header: 'Closes', value: (r) => iso(r.closesAt) },
      { key: 'durationMin', header: 'Minutes' },
      { key: 'status', header: 'Status', value: (r) => labelOf(QUIZ_STATUSES, r.status) },
      { key: 'questions', header: 'Questions' },
      { key: 'attempts', header: 'Attempts' },
      { key: 'averagePct', header: 'Average %' },
    ],
    actions: {
      close: {
        label: 'Close',
        apply: async (ctx, id) => {
          const [q] = await ctx.tx.select().from(lmsQuizzes).where(eq(lmsQuizzes.id, id));
          await lms.assertManage(ctx.tx, ctx.p, q);
          if (q.status !== 'published') throw new ConflictException('Only a published quiz can be closed');
          await ctx.tx.update(lmsQuizzes).set({ status: 'closed' }).where(eq(lmsQuizzes.id, id));
        },
      },
    },
  };
}

@Injectable()
export class LmsRecords implements OnModuleInit {
  constructor(
    private readonly registry: RecordRegistry,
    private readonly lms: LmsService,
  ) {}

  onModuleInit(): void {
    this.registry.register(assignmentsEntity());
    this.registry.register(quizzesEntity(this.lms));
  }
}
