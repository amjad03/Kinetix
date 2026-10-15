// OBE flagship (migration 0184): question-wise marks tagged to course outcomes, attainment policies with history, each
// programme's accreditation framework, the CO approval workflow, OBE coordinators, curricular gaps and content beyond the
// syllabus, and batch-wise attainment. Kept apart from schema.ts, which these tables reference.
import { sql } from 'drizzle-orm';
import { boolean, date, index, integer, jsonb, numeric, pgTable, primaryKey, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { academicYears, assessments, coSets, courseOutcomes, programs, students, subjects, tenants, users } from './schema.js';

const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' });
const pk = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const created = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const level = (name: string) => numeric(name, { precision: 5, scale: 2, mode: 'number' });

/** One question (or part) of an assessment's paper: its number, maximum marks and Bloom level. */
export const assessmentQuestions = pgTable(
  'assessment_questions',
  {
    id: pk(),
    tenantId: tenantId(),
    assessmentId: uuid('assessment_id').notNull().references(() => assessments.id, { onDelete: 'cascade' }),
    /** "1", "2a", "Q5". */
    no: text('no').notNull(),
    /** The part of the paper ("Part A"). */
    part: text('part').notNull().default(''),
    maxMarks: numeric('max_marks', { precision: 6, scale: 2, mode: 'number' }).notNull(),
    bloomLevel: text('bloom_level'),
    ord: smallint('ord').notNull().default(0),
    createdAt: created(),
  },
  (t) => [uniqueIndex('assessment_questions_uq').on(t.assessmentId, t.no)],
);

/** The course outcomes a question tests; a question tagged to several COs splits its marks by weight. */
export const assessmentQuestionCos = pgTable(
  'assessment_question_cos',
  {
    tenantId: tenantId(),
    questionId: uuid('question_id').notNull().references(() => assessmentQuestions.id, { onDelete: 'cascade' }),
    coId: uuid('co_id').notNull().references(() => courseOutcomes.id, { onDelete: 'cascade' }),
    weight: numeric('weight', { precision: 5, scale: 2, mode: 'number' }).notNull().default(1),
  },
  (t) => [primaryKey({ name: 'assessment_question_cos_pk', columns: [t.questionId, t.coId] }), index('assessment_question_cos_co_idx').on(t.coId)],
);

/** A student's marks on one question; the assessment's total is their sum. */
export const questionMarks = pgTable(
  'question_marks',
  {
    tenantId: tenantId(),
    assessmentId: uuid('assessment_id').notNull().references(() => assessments.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id').notNull().references(() => assessmentQuestions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    marks: numeric('marks', { precision: 6, scale: 2, mode: 'number' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ name: 'question_marks_pk', columns: [t.questionId, t.studentId] }), index('question_marks_assessment_idx').on(t.assessmentId, t.studentId)],
);

/**
 * Attainment rules (AttainmentConfig) for the institution, a programme or a course. Never changed in place: each change
 * is a new version, optionally from an academic year, so past calculations can be explained.
 */
export const obePolicies = pgTable('obe_policies', {
  id: pk(),
  tenantId: tenantId(),
  scope: text('scope').$type<'institution' | 'program' | 'subject'>().notNull(),
  programId: uuid('program_id').references(() => programs.id, { onDelete: 'cascade' }),
  subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  config: jsonb('config').notNull(),
  note: text('note'),
  effectiveFromYearId: uuid('effective_from_year_id').references(() => academicYears.id, { onDelete: 'set null' }),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: created(),
});

export const OBE_FRAMEWORKS = ['nba_tier1', 'nba_tier2', 'nba_management', 'nba_pharmacy', 'naac', 'custom'] as const;
export type ObeFramework = (typeof OBE_FRAMEWORKS)[number];

/** The accreditation framework a programme reports to (NBA for engineering, management and pharmacy; NAAC 2.6 otherwise). */
export const obePrograms = pgTable('obe_programs', {
  programId: uuid('program_id')
    .primaryKey()
    .references(() => programs.id, { onDelete: 'cascade' }),
  tenantId: tenantId(),
  framework: text('framework').$type<ObeFramework>().notNull().default('naac'),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** One step of a CO version's approval: submitted, approved, returned, a comment, or activated. */
export const coSetReviews = pgTable(
  'co_set_reviews',
  {
    id: pk(),
    tenantId: tenantId(),
    coSetId: uuid('co_set_id').notNull().references(() => coSets.id, { onDelete: 'cascade' }),
    stage: text('stage').notNull(),
    decision: text('decision').$type<'submitted' | 'approved' | 'returned' | 'comment' | 'activated'>().notNull(),
    comment: text('comment'),
    /** A comment about one CO of the version. */
    coId: uuid('co_id').references(() => courseOutcomes.id, { onDelete: 'set null' }),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: created(),
  },
  (t) => [index('co_set_reviews_set_idx').on(t.coSetId, t.createdAt)],
);

/** A programme's OBE coordinator, or a course coordinator for one course of it. */
export const obeAssignments = pgTable('obe_assignments', {
  id: pk(),
  tenantId: tenantId(),
  programId: uuid('program_id').notNull().references(() => programs.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').$type<'coordinator' | 'course_coordinator'>().notNull(),
  subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'cascade' }),
  note: text('note'),
  createdAt: created(),
});

/** A curricular gap found against the POs and how it was closed, or content delivered beyond the syllabus (NBA 2.1). */
export const obeCurriculumGaps = pgTable('obe_curriculum_gaps', {
  id: pk(),
  tenantId: tenantId(),
  programId: uuid('program_id').notNull().references(() => programs.id, { onDelete: 'cascade' }),
  subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'set null' }),
  academicYearId: uuid('academic_year_id').references(() => academicYears.id, { onDelete: 'set null' }),
  kind: text('kind').$type<'gap' | 'beyond_syllabus'>().notNull().default('gap'),
  title: text('title').notNull(),
  description: text('description'),
  /** The POs and PSOs it serves ("PO2", "PSO1"). */
  outcomeCodes: text('outcome_codes').array().notNull().default(sql`'{}'::text[]`),
  /** guest_lecture, workshop, seminar, industrial_visit, value_added_course, lab_session, other. */
  method: text('method'),
  heldOn: date('held_on'),
  resourcePerson: text('resource_person'),
  beneficiaries: integer('beneficiaries'),
  status: text('status').$type<'planned' | 'done'>().notNull().default('planned'),
  evidenceUrl: text('evidence_url'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: created(),
});

/** PO/PSO (and CO) attainment of one batch (an intake) across the years it studied, from the yearly calculations. */
export const obeBatchSnapshots = pgTable(
  'obe_batch_snapshots',
  {
    id: pk(),
    tenantId: tenantId(),
    programId: uuid('program_id').notNull().references(() => programs.id, { onDelete: 'cascade' }),
    /** "2023-26". */
    batch: text('batch').notNull(),
    entryYearId: uuid('entry_year_id').notNull().references(() => academicYears.id, { onDelete: 'cascade' }),
    scope: text('scope').notNull(),
    targetId: uuid('target_id').notNull(),
    code: text('code').notNull(),
    direct: level('direct'),
    indirect: level('indirect'),
    combined: level('combined'),
    target: level('target').notNull(),
    gap: level('gap'),
    met: boolean('met').notNull(),
    detail: jsonb('detail').notNull().default(sql`'{}'::jsonb`),
    computedBy: uuid('computed_by').references(() => users.id, { onDelete: 'set null' }),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('obe_batch_snapshots_idx').on(t.programId, t.entryYearId, t.computedAt)],
);
