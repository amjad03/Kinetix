// Curriculum versions, school report cards, PUC, competencies, houses and university basics (migration 0114). Kept apart from schema.ts, which they reference.
import { sql } from 'drizzle-orm';
import { type AnyPgColumn, boolean, date, index, integer, jsonb, numeric, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { academicYears, programs, students, tenants, users } from './schema.js';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const num = (name: string, precision: number, scale: number) => numeric(name, { precision, scale, mode: 'number' });

/** An academic regulation by year ("R2024", "NEP 2024"), optionally for one programme. */
export const regulations = pgTable(
  'regulations',
  {
    id: id(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    year: smallint('year').notNull(),
    programId: uuid('program_id').references(() => programs.id, { onDelete: 'set null' }),
    authority: text('authority').notNull().default('Board of Studies'),
    effectiveFrom: date('effective_from').notNull(),
    notes: text('notes').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('regulations_name_year_uq').on(t.tenantId, t.name, t.year)],
);

export type CurriculumStatus = 'draft' | 'approved' | 'active' | 'archived';

/** A programme's syllabus for one regulation year: draft, approved (by the Board of Studies), active, then archived. */
export const curriculumVersions = pgTable(
  'curriculum_versions',
  {
    id: id(),
    tenantId: tenantId(),
    programId: uuid('program_id').notNull().references(() => programs.id, { onDelete: 'cascade' }),
    regulationId: uuid('regulation_id').references(() => regulations.id, { onDelete: 'set null' }),
    regulationYear: smallint('regulation_year').notNull(),
    versionNo: integer('version_no').notNull(),
    label: text('label').notNull(),
    status: text('status').$type<CurriculumStatus>().notNull().default('draft'),
    effectiveFrom: date('effective_from'),
    supersedesId: uuid('supersedes_id').references((): AnyPgColumn => curriculumVersions.id, { onDelete: 'set null' }),
    source: text('source').notNull().default('manual'),
    bosRef: text('bos_ref'),
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('curriculum_versions_uq').on(t.tenantId, t.programId, t.regulationYear, t.versionNo)],
);

export const curriculumSubjects = pgTable(
  'curriculum_subjects',
  {
    id: id(),
    tenantId: tenantId(),
    versionId: uuid('version_id').notNull().references(() => curriculumVersions.id, { onDelete: 'cascade' }),
    term: smallint('term').notNull(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    credits: num('credits', 4, 1).notNull().default(0),
    hours: smallint('hours').notNull().default(0),
    ord: smallint('ord').notNull().default(0),
  },
  (t) => [uniqueIndex('curriculum_subjects_uq').on(t.versionId, t.code)],
);

export const curriculumUnits = pgTable('curriculum_units', {
  id: id(),
  tenantId: tenantId(),
  subjectId: uuid('subject_id').notNull().references(() => curriculumSubjects.id, { onDelete: 'cascade' }),
  ord: smallint('ord').notNull(),
  title: text('title').notNull(),
  hours: smallint('hours').notNull().default(0),
  topics: text('topics').array().notNull().default(sql`'{}'`),
});

export const curriculumCos = pgTable('curriculum_cos', {
  id: id(),
  tenantId: tenantId(),
  subjectId: uuid('subject_id').notNull().references(() => curriculumSubjects.id, { onDelete: 'cascade' }),
  code: text('code').notNull(),
  statement: text('statement').notNull(),
  bloomLevel: text('bloom_level'),
});

/** The curriculum version a student follows for their whole course, fixed when their batch starts. */
export const studentCurriculumPins = pgTable(
  'student_curriculum_pins',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    versionId: uuid('version_id').notNull().references(() => curriculumVersions.id, { onDelete: 'cascade' }),
    pinnedBy: uuid('pinned_by').references(() => users.id, { onDelete: 'set null' }),
    pinnedAt: timestamp('pinned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('student_curriculum_pins_uq').on(t.tenantId, t.studentId)],
);

/** An uploaded syllabus and the AI's proposed structure, kept for review until it becomes a draft version. */
export const syllabusImports = pgTable('syllabus_imports', {
  id: id(),
  tenantId: tenantId(),
  programId: uuid('program_id').notNull().references(() => programs.id, { onDelete: 'cascade' }),
  regulationYear: smallint('regulation_year').notNull(),
  fileName: text('file_name').notNull(),
  extractedChars: integer('extracted_chars').notNull().default(0),
  status: text('status').notNull().default('proposed'),
  preview: boolean('preview').notNull().default(false),
  proposal: jsonb('proposal').notNull(),
  versionId: uuid('version_id').references(() => curriculumVersions.id, { onDelete: 'set null' }),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
});

export type PromotionStatus = 'pending' | 'promoted' | 'promoted_with_grace' | 'detained';

export const reportCards = pgTable(
  'report_cards',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    academicYearId: uuid('academic_year_id').notNull().references(() => academicYears.id, { onDelete: 'cascade' }),
    termLabel: text('term_label').notNull(),
    remarks: text('remarks').notNull().default(''),
    behaviourGrade: text('behaviour_grade'),
    promotionStatus: text('promotion_status').$type<PromotionStatus>().notNull().default('pending'),
    promotedTo: text('promoted_to'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('report_cards_uq').on(t.tenantId, t.studentId, t.academicYearId, t.termLabel)],
);

export const reportCardLines = pgTable('report_card_lines', {
  id: id(),
  tenantId: tenantId(),
  reportCardId: uuid('report_card_id').notNull().references(() => reportCards.id, { onDelete: 'cascade' }),
  subjectName: text('subject_name').notNull(),
  marks: num('marks', 6, 2).notNull(),
  maxMarks: num('max_marks', 6, 2).notNull(),
  grade: text('grade'),
  remark: text('remark').notNull().default(''),
});

export const coCurricularGrades = pgTable('co_curricular_grades', {
  id: id(),
  tenantId: tenantId(),
  reportCardId: uuid('report_card_id').notNull().references(() => reportCards.id, { onDelete: 'cascade' }),
  activity: text('activity').notNull(),
  grade: text('grade').notNull(),
  remark: text('remark').notNull().default(''),
});

export const pucStreams = pgTable(
  'puc_streams',
  { id: id(), tenantId: tenantId(), code: text('code').notNull(), name: text('name').notNull() },
  (t) => [uniqueIndex('puc_streams_uq').on(t.tenantId, t.code)],
);

export interface PucSubject {
  name: string;
  theoryMax: number;
  practicalMax: number;
  internalMax: number;
}

/** A subject combination ("PCMB"): its subjects, each with the maximum marks for theory, practical and internal. */
export const pucCombinations = pgTable(
  'puc_combinations',
  {
    id: id(),
    tenantId: tenantId(),
    streamId: uuid('stream_id').notNull().references(() => pucStreams.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    subjects: jsonb('subjects').$type<PucSubject[]>().notNull(),
    seats: integer('seats'),
  },
  (t) => [uniqueIndex('puc_combinations_uq').on(t.tenantId, t.code)],
);

export const pucEnrollments = pgTable(
  'puc_enrollments',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    academicYearId: uuid('academic_year_id').notNull().references(() => academicYears.id, { onDelete: 'cascade' }),
    combinationId: uuid('combination_id').notNull().references(() => pucCombinations.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('puc_enrollments_uq').on(t.tenantId, t.studentId, t.academicYearId)],
);

export const pucMarks = pgTable(
  'puc_marks',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    academicYearId: uuid('academic_year_id').notNull().references(() => academicYears.id, { onDelete: 'cascade' }),
    subjectName: text('subject_name').notNull(),
    theory: num('theory', 6, 2),
    practical: num('practical', 6, 2),
    internal: num('internal', 6, 2),
    enteredBy: uuid('entered_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('puc_marks_uq').on(t.tenantId, t.studentId, t.academicYearId, t.subjectName)],
);

export type MasteryLevel = 'beginning' | 'developing' | 'proficient' | 'mastery';

export const learningOutcomes = pgTable(
  'learning_outcomes',
  {
    id: id(),
    tenantId: tenantId(),
    kind: text('kind').$type<'outcome' | 'competency'>().notNull().default('outcome'),
    grade: smallint('grade').notNull(),
    subjectName: text('subject_name').notNull(),
    code: text('code').notNull(),
    statement: text('statement').notNull(),
  },
  (t) => [uniqueIndex('learning_outcomes_uq').on(t.tenantId, t.code)],
);

export const masteryRecords = pgTable(
  'mastery_records',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    outcomeId: uuid('outcome_id').notNull().references(() => learningOutcomes.id, { onDelete: 'cascade' }),
    level: text('level').$type<MasteryLevel>().notNull(),
    evidence: text('evidence').notNull().default(''),
    assessedBy: uuid('assessed_by').references(() => users.id, { onDelete: 'set null' }),
    assessedOn: date('assessed_on').notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('mastery_records_uq').on(t.tenantId, t.studentId, t.outcomeId)],
);

export const houses = pgTable(
  'houses',
  {
    id: id(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    colour: text('colour').notNull().default('#1d4ed8'),
    motto: text('motto').notNull().default(''),
  },
  (t) => [uniqueIndex('houses_name_uq').on(t.tenantId, t.name)],
);

export const houseMembers = pgTable(
  'house_members',
  {
    id: id(),
    tenantId: tenantId(),
    houseId: uuid('house_id').notNull().references(() => houses.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    isCaptain: boolean('is_captain').notNull().default(false),
  },
  (t) => [uniqueIndex('house_members_uq').on(t.tenantId, t.studentId)],
);

/** The house points ledger: every award or deduction, with who gave it and why. */
export const housePoints = pgTable(
  'house_points',
  {
    id: id(),
    tenantId: tenantId(),
    houseId: uuid('house_id').notNull().references(() => houses.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'set null' }),
    points: integer('points').notNull(),
    category: text('category').notNull().default('general'),
    reason: text('reason').notNull(),
    awardedOn: date('awarded_on').notNull(),
    awardedBy: uuid('awarded_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [index('house_points_house_idx').on(t.tenantId, t.houseId)],
);

export const AFFILIATION_MODELS = ['affiliated', 'autonomous', 'constituent', 'deemed'] as const;

export const affiliatedInstitutions = pgTable(
  'affiliated_institutions',
  {
    id: id(),
    tenantId: tenantId(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    model: text('model').$type<(typeof AFFILIATION_MODELS)[number]>().notNull().default('affiliated'),
    university: text('university').notNull().default(''),
    city: text('city').notNull().default(''),
    aisheCode: text('aishe_code'),
    affiliationValidTo: date('affiliation_valid_to'),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('affiliated_institutions_uq').on(t.tenantId, t.code)],
);

export const convocations = pgTable('convocations', {
  id: id(),
  tenantId: tenantId(),
  name: text('name').notNull(),
  heldOn: date('held_on').notNull(),
  graduationYear: smallint('graduation_year').notNull(),
  programId: uuid('program_id').references(() => programs.id, { onDelete: 'set null' }),
  status: text('status').$type<'draft' | 'registration_open' | 'closed' | 'held'>().notNull().default('draft'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
});

export const convocationCandidates = pgTable(
  'convocation_candidates',
  {
    id: id(),
    tenantId: tenantId(),
    convocationId: uuid('convocation_id').notNull().references(() => convocations.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    status: text('status').$type<'eligible' | 'registered' | 'withheld' | 'degree_issued'>().notNull().default('eligible'),
    cgpa: num('cgpa', 5, 2),
    degreeTitle: text('degree_title').notNull(),
    registeredAt: timestamp('registered_at', { withTimezone: true }),
    certificateNo: text('certificate_no'),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('convocation_candidates_uq').on(t.convocationId, t.studentId)],
);
