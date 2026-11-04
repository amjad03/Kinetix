// LMS production pass (migrations 0214-0215): proctoring signals on quiz attempts, live classes with the joins that
// become attendance, forum reports, the institution's LMS settings, learning paths, completion certificates, and the
// xAPI statements and state that cmi5 units send. Kept apart from schema.ts, which they reference.
import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { issuedDocuments, lmsCourses, programs, sections, students, tenants, timetableSlots, users } from './schema.js';
import { forumPosts, forumThreads } from './schema-g1.js';
import { scormPackages } from './schema-integrations.js';
import { lmsQuizAttempts } from './schema-life.js';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });
const userRef = (name: string) => uuid(name).references(() => users.id, { onDelete: 'set null' });
const studentRef = () => uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' });

export const QUIZ_EVENT_KINDS = ['tab_hidden', 'window_blur', 'fullscreen_exit', 'copy', 'paste', 'app_background', 'screenshot', 'network_change'] as const;
export type QuizEventKind = (typeof QUIZ_EVENT_KINDS)[number];

/** A proctoring signal the quiz page or app reported during an attempt. */
export const lmsQuizEvents = pgTable(
  'lms_quiz_events',
  {
    id: id(),
    tenantId: tenantId(),
    attemptId: uuid('attempt_id').notNull().references(() => lmsQuizAttempts.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<QuizEventKind>().notNull(),
    at: ts('at').notNull(),
    detail: text('detail').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [index('lms_quiz_events_attempt_idx').on(t.attemptId, t.at)],
);

export const LIVE_PROVIDERS = ['meet', 'zoom', 'teams', 'jitsi', 'webex', 'other'] as const;
export type LiveProvider = (typeof LIVE_PROVIDERS)[number];

/** A live class of a course on Meet, Zoom, Teams or Jitsi: students join through ZYNETIX so their joins become attendance. */
export const lmsLiveSessions = pgTable(
  'lms_live_sessions',
  {
    id: id(),
    tenantId: tenantId(),
    courseId: uuid('course_id').notNull().references(() => lmsCourses.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    startsAt: ts('starts_at').notNull(),
    durationMin: integer('duration_min').notNull(),
    joinUrl: text('join_url').notNull(),
    provider: text('provider').$type<LiveProvider>().notNull(),
    /** The timetable period it stands for; attendance from joins is written against it. */
    slotId: uuid('slot_id').references(() => timetableSlots.id, { onDelete: 'set null' }),
    recordingUrl: text('recording_url'),
    status: text('status').$type<'scheduled' | 'cancelled'>().notNull().default('scheduled'),
    attendanceMarkedAt: ts('attendance_marked_at'),
    createdBy: userRef('created_by'),
    createdAt: createdAt(),
  },
  (t) => [index('lms_live_sessions_course_idx').on(t.courseId, t.startsAt)],
);

export const lmsLiveJoins = pgTable(
  'lms_live_joins',
  {
    id: id(),
    tenantId: tenantId(),
    sessionId: uuid('session_id').notNull().references(() => lmsLiveSessions.id, { onDelete: 'cascade' }),
    studentId: studentRef(),
    firstJoinedAt: ts('first_joined_at').notNull(),
    lastJoinedAt: ts('last_joined_at').notNull(),
    joins: integer('joins').notNull().default(1),
  },
  (t) => [uniqueIndex('lms_live_joins_uq').on(t.sessionId, t.studentId)],
);

export const FORUM_REPORT_REASONS = ['abusive', 'spam', 'off_topic', 'cheating', 'other'] as const;

/** A member of the class reported a discussion or a reply to the teachers. */
export const forumReports = pgTable(
  'forum_reports',
  {
    id: id(),
    tenantId: tenantId(),
    threadId: uuid('thread_id').notNull().references(() => forumThreads.id, { onDelete: 'cascade' }),
    postId: uuid('post_id').references(() => forumPosts.id, { onDelete: 'cascade' }),
    reporterId: uuid('reporter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    reason: text('reason').$type<(typeof FORUM_REPORT_REASONS)[number]>().notNull(),
    note: text('note').notNull().default(''),
    status: text('status').$type<'open' | 'actioned' | 'dismissed'>().notNull().default('open'),
    resolvedBy: userRef('resolved_by'),
    resolvedAt: ts('resolved_at'),
    createdAt: createdAt(),
  },
  (t) => [index('forum_reports_open_idx').on(t.status, t.createdAt)],
);

/** One row per institution: the LMS rules (lms/lms-settings.ts has the catalogue and defaults). */
export const lmsSettings = pgTable('lms_settings', {
  tenantId: uuid('tenant_id').primaryKey().references(() => tenants.id, { onDelete: 'cascade' }),
  settings: jsonb('settings').$type<Record<string, number | boolean | string>>().notNull().default({}),
  updatedBy: userRef('updated_by'),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

/** Courses to take in order (a programme's or a class's track); finishing the required ones completes the path. */
export const lmsLearningPaths = pgTable('lms_learning_paths', {
  id: id(),
  tenantId: tenantId(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  programId: uuid('program_id').references(() => programs.id, { onDelete: 'set null' }),
  sectionId: uuid('section_id').references(() => sections.id, { onDelete: 'set null' }),
  status: text('status').$type<'draft' | 'published' | 'archived'>().notNull().default('draft'),
  certificate: boolean('certificate').notNull().default(false),
  createdBy: userRef('created_by'),
  createdAt: createdAt(),
});

export const lmsPathSteps = pgTable(
  'lms_path_steps',
  {
    id: id(),
    tenantId: tenantId(),
    pathId: uuid('path_id').notNull().references(() => lmsLearningPaths.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id').notNull().references(() => lmsCourses.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    required: boolean('required').notNull().default(true),
  },
  (t) => [uniqueIndex('lms_path_steps_uq').on(t.pathId, t.courseId)],
);

/** A completion certificate for a course or a learning path, recorded in the document register (QR verification). */
export const lmsCertificates = pgTable('lms_certificates', {
  id: id(),
  tenantId: tenantId(),
  studentId: studentRef(),
  courseId: uuid('course_id').references(() => lmsCourses.id, { onDelete: 'cascade' }),
  pathId: uuid('path_id').references(() => lmsLearningPaths.id, { onDelete: 'cascade' }),
  issuedDocumentId: uuid('issued_document_id').references(() => issuedDocuments.id, { onDelete: 'set null' }),
  serial: text('serial').notNull(),
  verifyUrl: text('verify_url').notNull().default(''),
  gradePct: numeric('grade_pct', { precision: 5, scale: 2, mode: 'number' }),
  completedPct: integer('completed_pct').notNull(),
  issuedAt: ts('issued_at').notNull(),
  issuedBy: userRef('issued_by'),
  revokedAt: ts('revoked_at'),
  revokeReason: text('revoke_reason'),
});

/** An xAPI statement a cmi5 unit (or the platform for its own items) recorded for a learner. */
export const lmsXapiStatements = pgTable(
  'lms_xapi_statements',
  {
    id: uuid('id').primaryKey(),
    tenantId: tenantId(),
    packageId: uuid('package_id').references(() => scormPackages.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    registration: uuid('registration'),
    verb: text('verb').notNull(),
    objectId: text('object_id').notNull(),
    resultScaled: numeric('result_scaled', { precision: 6, scale: 4, mode: 'number' }),
    resultSuccess: boolean('result_success'),
    resultCompletion: boolean('result_completion'),
    duration: text('duration'),
    statement: jsonb('statement').$type<Record<string, unknown>>().notNull(),
    storedAt: ts('stored_at').notNull().defaultNow(),
  },
  (t) => [index('lms_xapi_statements_pkg_idx').on(t.packageId, t.userId, t.storedAt)],
);

/** An xAPI state document (cmi5 keeps LMS.LaunchData here; units keep their own bookmarks). */
export const lmsXapiState = pgTable('lms_xapi_state', {
  id: id(),
  tenantId: tenantId(),
  packageId: uuid('package_id').notNull().references(() => scormPackages.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  registration: uuid('registration'),
  activityId: text('activity_id').notNull(),
  stateId: text('state_id').notNull(),
  contentType: text('content_type').notNull().default('application/json'),
  content: text('content').notNull(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});
