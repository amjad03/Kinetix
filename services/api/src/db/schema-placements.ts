// Placements depth (migration 0173): company contacts, placement opt-in and debarment, interview slots, placement
// training (sessions, attendance, test scores), higher-studies and entrepreneurship progression, alumni job posts and
// the employer and alumni feedback forms. Kept apart from schema.ts, which they reference.
import { sql } from 'drizzle-orm';
import { boolean, date, index, numeric, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { alumniProfiles, driveRegistrations, driveRounds, placementCompanies, placementDrives, programs, rooms, students, tenants, users } from './schema.js';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const by = (name: string) => uuid(name).references(() => users.id, { onDelete: 'set null' });

/** The people the placement cell deals with at a company. */
export const placementCompanyContacts = pgTable(
  'placement_company_contacts',
  {
    id: id(),
    tenantId: tenantId(),
    companyId: uuid('company_id').notNull().references(() => placementCompanies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    designation: text('designation').notNull().default(''),
    email: text('email'),
    phone: text('phone'),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('placement_company_contacts_company_idx').on(t.companyId)],
);

/** A student's choice to take part in placements, and any debarment (skipping a drive they registered for). */
export const placementOptins = pgTable(
  'placement_optins',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    optedIn: boolean('opted_in').notNull().default(true),
    /** Why a student opted out (higher studies, entrepreneurship, family business…). */
    reason: text('reason'),
    debarredUntil: date('debarred_until'),
    debarReason: text('debar_reason'),
    updatedBy: by('updated_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('placement_optins_student_uq').on(t.studentId)],
);

/** An interview (or test) slot for a registration in a round, with its venue and panel. */
export const interviewSlots = pgTable(
  'interview_slots',
  {
    id: id(),
    tenantId: tenantId(),
    driveId: uuid('drive_id').notNull().references(() => placementDrives.id, { onDelete: 'cascade' }),
    roundId: uuid('round_id').notNull().references(() => driveRounds.id, { onDelete: 'cascade' }),
    registrationId: uuid('registration_id').notNull().references(() => driveRegistrations.id, { onDelete: 'cascade' }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    venue: text('venue').notNull().default(''),
    roomId: uuid('room_id').references(() => rooms.id, { onDelete: 'set null' }),
    panel: text('panel').notNull().default(''),
    /** scheduled | done | no_show | cancelled */
    status: text('status').notNull().default('scheduled'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('interview_slots_round_reg_uq').on(t.roundId, t.registrationId), index('interview_slots_drive_idx').on(t.driveId, t.startsAt)],
);

/** A placement training programme (aptitude, technical, soft skills, mock interviews) for a programme and batch. */
export const placementTrainings = pgTable('placement_trainings', {
  id: id(),
  tenantId: tenantId(),
  title: text('title').notNull(),
  /** aptitude | technical | soft_skills | mock_interview | other */
  kind: text('kind').notNull().default('aptitude'),
  trainer: text('trainer').notNull().default(''),
  programId: uuid('program_id').references(() => programs.id, { onDelete: 'set null' }),
  /** Graduation year of the batch trained; null = all final-year students. */
  batchYear: smallint('batch_year'),
  startsOn: date('starts_on').notNull(),
  endsOn: date('ends_on').notNull(),
  hours: numeric('hours', { precision: 6, scale: 1, mode: 'number' }).notNull().default(0),
  /** planned | ongoing | completed | cancelled */
  status: text('status').notNull().default('planned'),
  description: text('description').notNull().default(''),
  createdBy: by('created_by'),
  createdAt: createdAt(),
});

export const placementTrainingSessions = pgTable(
  'placement_training_sessions',
  {
    id: id(),
    tenantId: tenantId(),
    trainingId: uuid('training_id').notNull().references(() => placementTrainings.id, { onDelete: 'cascade' }),
    heldOn: date('held_on').notNull(),
    topic: text('topic').notNull(),
    hours: numeric('hours', { precision: 4, scale: 1, mode: 'number' }).notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [index('placement_training_sessions_training_idx').on(t.trainingId, t.heldOn)],
);

export const placementTrainingAttendance = pgTable(
  'placement_training_attendance',
  {
    id: id(),
    tenantId: tenantId(),
    sessionId: uuid('session_id').notNull().references(() => placementTrainingSessions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    present: boolean('present').notNull(),
  },
  (t) => [uniqueIndex('placement_training_attendance_uq').on(t.sessionId, t.studentId)],
);

/** An aptitude or mock test score in a training programme. */
export const placementTrainingScores = pgTable(
  'placement_training_scores',
  {
    id: id(),
    tenantId: tenantId(),
    trainingId: uuid('training_id').notNull().references(() => placementTrainings.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    testName: text('test_name').notNull(),
    score: numeric('score', { precision: 6, scale: 2, mode: 'number' }).notNull(),
    maxScore: numeric('max_score', { precision: 6, scale: 2, mode: 'number' }).notNull(),
    takenOn: date('taken_on'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('placement_training_scores_uq').on(t.trainingId, t.studentId, t.testName)],
);

/** Where a student went after graduating other than a campus offer: higher studies, a venture, a competitive exam (NAAC 5.2, NIRF). */
export const studentProgressions = pgTable(
  'student_progressions',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    /** higher_studies | entrepreneurship | competitive_exam | off_campus_job */
    kind: text('kind').notNull(),
    year: smallint('year').notNull(),
    institution: text('institution').notNull().default(''),
    program: text('program').notNull().default(''),
    country: text('country').notNull().default('India'),
    /** NET, SLET, GATE, GMAT, CAT, GRE, JAM, IELTS, TOEFL, civil services, state services… */
    exam: text('exam').notNull().default(''),
    examRef: text('exam_ref').notNull().default(''),
    ventureName: text('venture_name').notNull().default(''),
    ventureDetail: text('venture_detail').notNull().default(''),
    verified: boolean('verified').notNull().default(false),
    note: text('note').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [index('student_progressions_year_idx').on(t.tenantId, t.year)],
);

/** A job or internship posted for students by an alumnus or the office; alumni posts are checked before they show. */
export const alumniJobPosts = pgTable(
  'alumni_job_posts',
  {
    id: id(),
    tenantId: tenantId(),
    title: text('title').notNull(),
    company: text('company').notNull(),
    location: text('location').notNull().default(''),
    /** job | internship */
    kind: text('kind').notNull().default('job'),
    description: text('description').notNull().default(''),
    applyContact: text('apply_contact').notNull().default(''),
    closesOn: date('closes_on'),
    alumniId: uuid('alumni_id').references(() => alumniProfiles.id, { onDelete: 'set null' }),
    postedBy: by('posted_by'),
    /** pending | published | closed | rejected */
    status: text('status').notNull().default('pending'),
    createdAt: createdAt(),
  },
  (t) => [index('alumni_job_posts_status_idx').on(t.tenantId, t.status)],
);

/**
 * Employer and alumni feedback (indirect attainment for OBE and NBA). Five ratings of 1 to 5 whose meaning depends on
 * the kind (see FEEDBACK_CRITERIA in placements/placements-depth.logic.ts), an overall rating and comments.
 */
export const placementFeedback = pgTable(
  'placement_feedback',
  {
    id: id(),
    tenantId: tenantId(),
    /** employer | alumni */
    kind: text('kind').notNull(),
    companyId: uuid('company_id').references(() => placementCompanies.id, { onDelete: 'set null' }),
    alumniId: uuid('alumni_id').references(() => alumniProfiles.id, { onDelete: 'set null' }),
    respondentName: text('respondent_name').notNull(),
    respondentOrg: text('respondent_org').notNull().default(''),
    respondentEmail: text('respondent_email'),
    year: smallint('year').notNull(),
    r1: smallint('r1').notNull(),
    r2: smallint('r2').notNull(),
    r3: smallint('r3').notNull(),
    r4: smallint('r4').notNull(),
    r5: smallint('r5').notNull(),
    overall: smallint('overall').notNull(),
    comments: text('comments').notNull().default(''),
    /** office | recruiter_portal | alumni_portal */
    source: text('source').notNull().default('office'),
    createdAt: createdAt(),
  },
  (t) => [index('placement_feedback_kind_idx').on(t.tenantId, t.kind, t.year)],
);
