// Requirements gap close for PRD sections 1-21 (migration 0117): boards, per-programme attendance, campus fee structures, trusted devices, prior education,
// landing pages, subject frequency, faculties, learning support, forums, rubrics, reattempts and integrity flags. Kept apart from schema.ts, which they reference.
import { sql } from 'drizzle-orm';
import { boolean, date, index, integer, jsonb, numeric, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { academicYears, admissionCycles, applications, campuses, courseOutcomes, lessonPlans, lmsCourses, programs, sections, students, subjects, tenants, topics, users } from './schema.js';
import { affiliatedInstitutions, learningOutcomes } from './schema-curriculum.js';
import { assessmentSchemes } from './schema.js';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const num = (name: string, precision: number, scale: number) => numeric(name, { precision, scale, mode: 'number' });
const userRef = (name: string) => uuid(name).references(() => users.id, { onDelete: 'set null' });
const studentRef = () => uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' });

/** A school board the institution follows (CBSE, ICSE, a state board) with its pass rules. */
export const schoolBoards = pgTable(
  'school_boards',
  {
    id: id(),
    tenantId: tenantId(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    kind: text('kind').$type<'central' | 'state' | 'international' | 'university'>().notNull().default('central'),
    region: text('region').notNull().default('India'),
    medium: text('medium').notNull().default('English'),
    gradingScheme: text('grading_scheme').notNull().default('marks'),
    /** BoardPassRules (school-learning/board-rules.ts). */
    passRules: jsonb('pass_rules').$type<Record<string, unknown>>().notNull().default({}),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('school_boards_code_uq').on(t.tenantId, t.code)],
);

/** A programme's own attendance threshold and lock window, instead of the institution's. */
export const attendanceOverrides = pgTable(
  'attendance_overrides',
  {
    id: id(),
    tenantId: tenantId(),
    programId: uuid('program_id').notNull().references(() => programs.id, { onDelete: 'cascade' }),
    thresholdPct: integer('threshold_pct').notNull(),
    lockHours: integer('lock_hours'),
    note: text('note').notNull().default(''),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('attendance_overrides_uq').on(t.tenantId, t.programId)],
);

export const campusSettings = pgTable(
  'campus_settings',
  {
    id: id(),
    tenantId: tenantId(),
    campusId: uuid('campus_id').notNull().references(() => campuses.id, { onDelete: 'cascade' }),
    feeModel: text('fee_model'),
    gradingPolicy: text('grading_policy'),
    settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('campus_settings_uq').on(t.tenantId, t.campusId)],
);

export interface FeeItem {
  head: string;
  amountPaise: number;
}

/** A fee plan for one campus and/or programme: heads and amounts, issued to the matching students. */
export const feeStructures = pgTable('fee_structures', {
  id: id(),
  tenantId: tenantId(),
  campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
  programId: uuid('program_id').references(() => programs.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  items: jsonb('items').$type<FeeItem[]>().notNull().default([]),
  dueInDays: integer('due_in_days').notNull().default(30),
  active: boolean('active').notNull().default(true),
  createdBy: userRef('created_by'),
  createdAt: createdAt(),
});

/** A device a person has chosen to trust (a hash of its install id; the id itself is never stored). */
export const trustedDevices = pgTable(
  'trusted_devices',
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    deviceHash: text('device_hash').notNull(),
    label: text('label').notNull().default(''),
    platform: text('platform').notNull().default('web'),
    trustedAt: timestamp('trusted_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('trusted_devices_uq').on(t.userId, t.deviceHash)],
);

/** Schools and boards a student came from (kept for an applicant too, then carried to the student). */
export const studentPriorEducation = pgTable(
  'student_prior_education',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    applicationId: uuid('application_id').references(() => applications.id, { onDelete: 'set null' }),
    level: text('level').$type<'primary' | 'secondary' | 'puc' | 'ug' | 'pg' | 'other'>().notNull().default('secondary'),
    institution: text('institution').notNull(),
    board: text('board'),
    passingYear: smallint('passing_year'),
    percentage: num('percentage', 5, 2),
    tcNumber: text('tc_number'),
    medium: text('medium'),
    notes: text('notes').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [index('student_prior_education_student_idx').on(t.studentId)],
);

export interface LandingBlock {
  title: string;
  text: string;
}

/** The public page that introduces an admission cycle before the application form. */
export const admissionLandingPages = pgTable(
  'admission_landing_pages',
  {
    id: id(),
    tenantId: tenantId(),
    cycleId: uuid('cycle_id').notNull().references(() => admissionCycles.id, { onDelete: 'cascade' }),
    headline: text('headline').notNull(),
    intro: text('intro').notNull().default(''),
    highlights: jsonb('highlights').$type<LandingBlock[]>().notNull().default([]),
    faqs: jsonb('faqs').$type<{ q: string; a: string }[]>().notNull().default([]),
    contactPhone: text('contact_phone'),
    contactEmail: text('contact_email'),
    accentColour: text('accent_colour').notNull().default('#1d4ed8'),
    published: boolean('published').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('admission_landing_pages_cycle_uq').on(t.cycleId)],
);

/** How often a subject may appear in a class's week (and in one day). */
export const subjectFrequency = pgTable(
  'subject_frequency',
  {
    id: id(),
    tenantId: tenantId(),
    subjectId: uuid('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
    minPerWeek: smallint('min_per_week').notNull().default(1),
    maxPerWeek: smallint('max_per_week').notNull().default(6),
    maxPerDay: smallint('max_per_day').notNull().default(2),
  },
  (t) => [uniqueIndex('subject_frequency_uq').on(t.tenantId, t.subjectId)],
);

/** The id a student has on the biometric device (its export names them by this). */
export const studentBiometricIds = pgTable(
  'student_biometric_ids',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: studentRef(),
    deviceUserId: text('device_user_id').notNull(),
  },
  (t) => [uniqueIndex('student_biometric_ids_uq').on(t.tenantId, t.deviceUserId), uniqueIndex('student_biometric_ids_student_uq').on(t.studentId)],
);

/** A curriculum framework regulations follow: NEP 2020, CBCS, the National Curriculum Framework, a state framework. */
export const curriculumFrameworks = pgTable(
  'curriculum_frameworks',
  {
    id: id(),
    tenantId: tenantId(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    kind: text('kind').$type<'national' | 'state' | 'university' | 'institution'>().notNull().default('national'),
    authority: text('authority').notNull().default(''),
    description: text('description').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('curriculum_frameworks_code_uq').on(t.tenantId, t.code)],
);

/** A faculty or school of a university; departments sit under it. */
export const faculties = pgTable(
  'faculties',
  {
    id: id(),
    tenantId: tenantId(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    kind: text('kind').$type<'faculty' | 'school'>().notNull().default('faculty'),
    deanUserId: userRef('dean_user_id'),
    institutionId: uuid('institution_id').references(() => affiliatedInstitutions.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('faculties_code_uq').on(t.tenantId, t.code)],
);

export type WorksheetKind = 'worksheet' | 'reading' | 'remedial' | 'phonics' | 'numeracy' | 'activity' | 'board_prep';

/** A worksheet, reading task, remedial task or scored activity assigned to a class. */
export const worksheets = pgTable(
  'worksheets',
  {
    id: id(),
    tenantId: tenantId(),
    kind: text('kind').$type<WorksheetKind>().notNull().default('worksheet'),
    title: text('title').notNull(),
    instructions: text('instructions').notNull().default(''),
    sectionId: uuid('section_id').notNull().references(() => sections.id, { onDelete: 'cascade' }),
    subjectName: text('subject_name').notNull(),
    outcomeId: uuid('outcome_id').references(() => learningOutcomes.id, { onDelete: 'set null' }),
    dueOn: date('due_on'),
    maxScore: num('max_score', 6, 2).notNull().default(10),
    /** Activity-assessment levels, best first: ["Mastered","Developing","Beginning"]. Empty = scored by marks. */
    levels: jsonb('levels').$type<string[]>().notNull().default([]),
    createdBy: userRef('created_by'),
    createdAt: createdAt(),
  },
  (t) => [index('worksheets_section_idx').on(t.sectionId, t.kind)],
);

export const worksheetScores = pgTable(
  'worksheet_scores',
  {
    id: id(),
    tenantId: tenantId(),
    worksheetId: uuid('worksheet_id').notNull().references(() => worksheets.id, { onDelete: 'cascade' }),
    studentId: studentRef(),
    score: num('score', 6, 2),
    level: text('level'),
    remarks: text('remarks').notNull().default(''),
    scoredBy: userRef('scored_by'),
    scoredAt: timestamp('scored_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('worksheet_scores_uq').on(t.worksheetId, t.studentId)],
);

/** A topic that builds a learning outcome (the topic-level node under chapter and outcome). */
export const outcomeTopics = pgTable(
  'outcome_topics',
  {
    id: id(),
    tenantId: tenantId(),
    outcomeId: uuid('outcome_id').notNull().references(() => learningOutcomes.id, { onDelete: 'cascade' }),
    topicId: uuid('topic_id').notNull().references(() => topics.id, { onDelete: 'cascade' }),
  },
  (t) => [uniqueIndex('outcome_topics_uq').on(t.outcomeId, t.topicId)],
);

export type RemedialSource = 'manual' | 'low_mastery' | 'delayed_topic' | 'exam';

/** Extra help planned for one student: from low mastery, a delayed topic, an exam result or by hand. */
export const remedialPlans = pgTable(
  'remedial_plans',
  {
    id: id(),
    tenantId: tenantId(),
    /** Null for a catch-up plan for a whole class (a delayed topic). */
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    subjectName: text('subject_name').notNull(),
    source: text('source').$type<RemedialSource>().notNull().default('manual'),
    outcomeId: uuid('outcome_id').references(() => learningOutcomes.id, { onDelete: 'set null' }),
    topicId: uuid('topic_id').references(() => topics.id, { onDelete: 'set null' }),
    sectionId: uuid('section_id').references(() => sections.id, { onDelete: 'set null' }),
    plan: text('plan').notNull(),
    assignedTo: userRef('assigned_to'),
    dueOn: date('due_on'),
    status: text('status').$type<'open' | 'in_progress' | 'closed'>().notNull().default('open'),
    resultNote: text('result_note'),
    createdBy: userRef('created_by'),
    createdAt: createdAt(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (t) => [index('remedial_plans_student_idx').on(t.studentId, t.status)],
);

export const readinessTargets = pgTable(
  'readiness_targets',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: studentRef(),
    exam: text('exam').notNull(),
    examOn: date('exam_on'),
    targetPct: num('target_pct', 5, 2).notNull().default(70),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('readiness_targets_uq').on(t.studentId, t.exam)],
);

export const readinessMocks = pgTable(
  'readiness_mocks',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: studentRef(),
    exam: text('exam').notNull(),
    takenOn: date('taken_on').notNull(),
    score: num('score', 7, 2).notNull(),
    maxScore: num('max_score', 7, 2).notNull(),
    /** Subject -> percentage. */
    breakdown: jsonb('breakdown').$type<Record<string, number>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index('readiness_mocks_student_idx').on(t.studentId, t.exam, t.takenOn)],
);

export const promotionRules = pgTable('promotion_rules', {
  id: id(),
  tenantId: tenantId(),
  programId: uuid('program_id').references(() => programs.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  minAttendancePct: integer('min_attendance_pct').notNull().default(75),
  subjectPassPct: integer('subject_pass_pct').notNull().default(35),
  maxCompartmentSubjects: integer('max_compartment_subjects').notNull().default(2),
  graceMarks: integer('grace_marks').notNull().default(0),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: createdAt(),
});

export type PromotionOutcome = 'promoted' | 'promoted_with_grace' | 'compartment' | 'detained';

export const promotionDecisions = pgTable(
  'promotion_decisions',
  {
    id: id(),
    tenantId: tenantId(),
    academicYearId: uuid('academic_year_id').notNull().references(() => academicYears.id, { onDelete: 'cascade' }),
    studentId: studentRef(),
    ruleId: uuid('rule_id').references(() => promotionRules.id, { onDelete: 'set null' }),
    decision: text('decision').$type<PromotionOutcome>().notNull(),
    failedSubjects: jsonb('failed_subjects').$type<string[]>().notNull().default([]),
    attendancePct: num('attendance_pct', 5, 2),
    reasons: jsonb('reasons').$type<string[]>().notNull().default([]),
    status: text('status').$type<'pending' | 'approved' | 'rejected'>().notNull().default('pending'),
    decidedBy: userRef('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    parentNotifiedAt: timestamp('parent_notified_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('promotion_decisions_uq').on(t.academicYearId, t.studentId)],
);

/** What a lesson plan teaches (a course outcome or a school learning outcome) and how: activity, resource, assessment. */
export const lessonPlanOutcomes = pgTable(
  'lesson_plan_outcomes',
  {
    id: id(),
    tenantId: tenantId(),
    lessonPlanId: uuid('lesson_plan_id').notNull().references(() => lessonPlans.id, { onDelete: 'cascade' }),
    courseOutcomeId: uuid('course_outcome_id').references(() => courseOutcomes.id, { onDelete: 'cascade' }),
    learningOutcomeId: uuid('learning_outcome_id').references(() => learningOutcomes.id, { onDelete: 'cascade' }),
    activity: text('activity').notNull().default(''),
    resource: text('resource').notNull().default(''),
    assessment: text('assessment').notNull().default(''),
  },
  (t) => [index('lesson_plan_outcomes_plan_idx').on(t.lessonPlanId)],
);

export const forumThreads = pgTable(
  'forum_threads',
  {
    id: id(),
    tenantId: tenantId(),
    courseId: uuid('course_id').notNull().references(() => lmsCourses.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').notNull().references(() => users.id),
    title: text('title').notNull(),
    body: text('body').notNull(),
    pinned: boolean('pinned').notNull().default(false),
    locked: boolean('locked').notNull().default(false),
    hidden: boolean('hidden').notNull().default(false),
    createdAt: createdAt(),
    lastPostAt: timestamp('last_post_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('forum_threads_course_idx').on(t.courseId, t.lastPostAt)],
);

export const forumPosts = pgTable(
  'forum_posts',
  {
    id: id(),
    tenantId: tenantId(),
    threadId: uuid('thread_id').notNull().references(() => forumThreads.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').notNull().references(() => users.id),
    body: text('body').notNull(),
    hidden: boolean('hidden').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('forum_posts_thread_idx').on(t.threadId, t.createdAt)],
);

export interface RubricLevel {
  label: string;
  points: number;
  descriptor: string;
}
export interface RubricCriterion {
  name: string;
  levels: RubricLevel[];
}

/** A reusable marking rubric: criteria, each with levels worth points. */
export const rubrics = pgTable(
  'rubrics',
  {
    id: id(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    scope: text('scope').$type<'general' | 'practical' | 'project' | 'viva' | 'activity' | 'essay'>().notNull().default('general'),
    criteria: jsonb('criteria').$type<RubricCriterion[]>().notNull().default([]),
    archived: boolean('archived').notNull().default(false),
    createdBy: userRef('created_by'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('rubrics_name_uq').on(t.tenantId, t.name)],
);

export const rubricScores = pgTable(
  'rubric_scores',
  {
    id: id(),
    tenantId: tenantId(),
    rubricId: uuid('rubric_id').notNull().references(() => rubrics.id, { onDelete: 'cascade' }),
    studentId: studentRef(),
    contextKind: text('context_kind').notNull().default('general'),
    contextId: uuid('context_id'),
    /** One level index per criterion. */
    selections: jsonb('selections').$type<number[]>().notNull().default([]),
    total: num('total', 7, 2).notNull(),
    maxTotal: num('max_total', 7, 2).notNull(),
    scoredBy: userRef('scored_by'),
    scoredAt: timestamp('scored_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('rubric_scores_student_idx').on(t.studentId, t.rubricId)],
);

export const reattemptRequests = pgTable(
  'reattempt_requests',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: studentRef(),
    schemeId: uuid('scheme_id').notNull().references(() => assessmentSchemes.id, { onDelete: 'cascade' }),
    attemptNo: smallint('attempt_no').notNull(),
    reason: text('reason').notNull(),
    status: text('status').$type<'pending' | 'approved' | 'rejected'>().notNull().default('pending'),
    decidedBy: userRef('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionNote: text('decision_note'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('reattempt_requests_uq').on(t.studentId, t.schemeId, t.attemptNo).where(sql`${t.status} <> 'rejected'`)],
);

export const integrityFlags = pgTable(
  'integrity_flags',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: studentRef(),
    contextKind: text('context_kind').notNull(),
    contextId: uuid('context_id'),
    kind: text('kind').notNull(),
    severity: text('severity').$type<'low' | 'medium' | 'high'>().notNull().default('low'),
    details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
    status: text('status').$type<'open' | 'dismissed' | 'confirmed'>().notNull().default('open'),
    reviewedBy: userRef('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewNote: text('review_note'),
    createdAt: createdAt(),
  },
  (t) => [index('integrity_flags_student_idx').on(t.studentId, t.status)],
);
