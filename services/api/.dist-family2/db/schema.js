/**
 * KINETIX core schema.
 *
 * Every table except `tenants` carries `tenant_id`. Row-level security policies live in the
 * hand-written migration `migrations/0001_rls.sql` (Drizzle cannot express FORCE RLS).
 */
import { sql } from 'drizzle-orm';
import { bigint, boolean, date, index, integer, jsonb, numeric, pgEnum, pgTable, primaryKey, smallint, text, time, timestamp, unique, uniqueIndex, uuid, } from 'drizzle-orm/pg-core';
const id = () => uuid('id').primaryKey().default(sql `gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
// ---------------------------------------------------------------------------------------------
// Tenancy & identity
// ---------------------------------------------------------------------------------------------
export const institutionKind = pgEnum('institution_kind', ['school', 'college', 'university']);
export const tenants = pgTable('tenants', {
    id: id(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    kind: institutionKind('kind').notNull(),
    timezone: text('timezone').notNull().default('Asia/Kolkata'),
    /** Feature flags & policies, e.g. { liveViewIndicator: true, pinFallback: false }. */
    settings: jsonb('settings').$type().notNull().default({}),
    createdAt: createdAt(),
});
export const campuses = pgTable('campuses', {
    id: id(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    city: text('city'),
    createdAt: createdAt(),
});
export const language = pgEnum('language', ['en', 'hi', 'kn']);
export const userStatus = pgEnum('user_status', ['active', 'invited', 'disabled']);
export const users = pgTable('users', {
    id: id(),
    tenantId: tenantId(),
    fullName: text('full_name').notNull(),
    phone: text('phone'),
    email: text('email'),
    passwordHash: text('password_hash'),
    preferredLanguage: language('preferred_language').notNull().default('en'),
    status: userStatus('status').notNull().default('active'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
}, (t) => [
    uniqueIndex('users_tenant_phone_uq').on(t.tenantId, t.phone),
    uniqueIndex('users_tenant_email_uq').on(t.tenantId, t.email),
]);
export const roleName = pgEnum('role_name', [
    'tenant_admin',
    'principal',
    'hod',
    'teacher',
    'student',
    'guardian',
    'librarian',
    'accountant',
]);
export const userRoles = pgTable('user_roles', {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: roleName('role').notNull(),
    /** Null = applies to every campus of the tenant. */
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
}, (t) => [uniqueIndex('user_roles_uq').on(t.userId, t.role, t.campusId)]);
// ---------------------------------------------------------------------------------------------
// Academic structure (works for K-12 grades and UG/PG programs alike)
// ---------------------------------------------------------------------------------------------
export const academicYears = pgTable('academic_years', {
    id: id(),
    tenantId: tenantId(),
    label: text('label').notNull(), // "2026-27"
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on').notNull(),
    isCurrent: boolean('is_current').notNull().default(false),
});
export const programLevel = pgEnum('program_level', ['k12', 'ug', 'pg', 'diploma', 'phd']);
/** K-12: one program per board+stream (e.g. "CBSE"). UG/PG: e.g. "BCom", "MBA". */
export const programs = pgTable('programs', {
    id: id(),
    tenantId: tenantId(),
    campusId: uuid('campus_id').notNull().references(() => campuses.id),
    name: text('name').notNull(),
    level: programLevel('level').notNull(),
    /** Global curriculum the program follows, e.g. "cbse", "kseab", "bu-ug-2024". */
    curriculumCode: text('curriculum_code'),
    /** Grades (K-12) or semesters (UG/PG). */
    termCount: smallint('term_count').notNull(),
});
/** A teachable group: "Grade 7 B" or "BCom Sem 3 A". */
export const sections = pgTable('sections', {
    id: id(),
    tenantId: tenantId(),
    programId: uuid('program_id').notNull().references(() => programs.id),
    academicYearId: uuid('academic_year_id').notNull().references(() => academicYears.id),
    term: smallint('term').notNull(), // grade number or semester number
    name: text('name').notNull(), // "A"
    displayName: text('display_name').notNull(), // "BCom Sem 3 A"
});
export const subjects = pgTable('subjects', {
    id: id(),
    tenantId: tenantId(),
    programId: uuid('program_id').notNull().references(() => programs.id),
    term: smallint('term').notNull(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    /** The content-library course this subject follows (syllabus, notes, AI grounding). */
    courseId: uuid('course_id').references(() => courses.id),
});
export const students = pgTable('students', {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id').references(() => users.id),
    sectionId: uuid('section_id').notNull().references(() => sections.id),
    rollNo: text('roll_no').notNull(),
    fullName: text('full_name').notNull(),
    status: text('status').notNull().default('active'),
    updatedAt: updatedAt(),
}, (t) => [uniqueIndex('students_section_roll_uq').on(t.sectionId, t.rollNo)]);
export const rooms = pgTable('rooms', {
    id: id(),
    tenantId: tenantId(),
    campusId: uuid('campus_id').notNull().references(() => campuses.id),
    name: text('name').notNull(),
});
export const timetableSlots = pgTable('timetable_slots', {
    id: id(),
    tenantId: tenantId(),
    academicYearId: uuid('academic_year_id').notNull().references(() => academicYears.id),
    sectionId: uuid('section_id').notNull().references(() => sections.id),
    subjectId: uuid('subject_id').notNull().references(() => subjects.id),
    teacherId: uuid('teacher_id').notNull().references(() => users.id),
    roomId: uuid('room_id').references(() => rooms.id),
    /** ISO weekday: 1 = Monday … 7 = Sunday. */
    dayOfWeek: smallint('day_of_week').notNull(),
    startsAt: time('starts_at').notNull(),
    endsAt: time('ends_at').notNull(),
    /**
     * Set when the slot is removed from the timetable. Kept (not deleted) because attendance,
     * sessions and recordings point at it.
     */
    archivedAt: timestamp('archived_at', { withTimezone: true }),
}, (t) => [index('timetable_teacher_day_idx').on(t.teacherId, t.dayOfWeek)]);
// ---------------------------------------------------------------------------------------------
// Devices, pairing and board sessions
// ---------------------------------------------------------------------------------------------
export const devicePlatform = pgEnum('device_platform', ['android', 'windows', 'linux', 'web']);
export const devices = pgTable('devices', {
    id: id(),
    tenantId: tenantId(),
    campusId: uuid('campus_id').notNull().references(() => campuses.id),
    roomId: uuid('room_id').references(() => rooms.id),
    name: text('name').notNull(),
    platform: devicePlatform('platform'),
    appVersion: text('app_version'),
    /** HMAC of the one-time enrolment code shown in the ERP. Cleared once enrolled. */
    enrollmentCodeHash: text('enrollment_code_hash').unique(),
    enrollmentExpiresAt: timestamp('enrollment_expires_at', { withTimezone: true }),
    enrolledAt: timestamp('enrolled_at', { withTimezone: true }),
    /** Incremented to revoke every device token issued so far. */
    tokenVersion: integer('token_version').notNull().default(0),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    createdAt: createdAt(),
});
export const pairingCodes = pgTable('pairing_codes', {
    id: id(),
    tenantId: tenantId(),
    deviceId: uuid('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    secretHash: text('secret_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    claimedBy: uuid('claimed_by').references(() => users.id),
    createdAt: createdAt(),
}, (t) => [index('pairing_codes_lookup_idx').on(t.tenantId, t.codeHash)]);
export const sessionEndReason = pgEnum('session_end_reason', [
    'teacher_ended',
    'period_over',
    'idle',
    'taken_over',
    'admin_revoked',
]);
export const boardSessions = pgTable('board_sessions', {
    id: id(),
    tenantId: tenantId(),
    deviceId: uuid('device_id').notNull().references(() => devices.id),
    teacherId: uuid('teacher_id').notNull().references(() => users.id),
    timetableSlotId: uuid('timetable_slot_id').references(() => timetableSlots.id),
    sectionId: uuid('section_id').references(() => sections.id),
    subjectId: uuid('subject_id').references(() => subjects.id),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    endReason: sessionEndReason('end_reason'),
    /** "Go live": students of the class may watch the board from the Student App. */
    liveForClass: boolean('live_for_class').notNull().default(false),
}, (t) => [index('board_sessions_device_active_idx').on(t.deviceId, t.endedAt)]);
// ---------------------------------------------------------------------------------------------
// Classroom data (append-friendly, written through the sync outbox)
// ---------------------------------------------------------------------------------------------
export const attendanceStatus = pgEnum('attendance_status', ['present', 'absent', 'late', 'excused']);
export const attendanceRecords = pgTable('attendance_records', {
    id: id(),
    tenantId: tenantId(),
    studentId: uuid('student_id').notNull().references(() => students.id),
    sectionId: uuid('section_id').notNull().references(() => sections.id),
    /** Local calendar date in the tenant timezone. */
    date: date('date').notNull(),
    /** Null = whole-day attendance; otherwise per period. */
    timetableSlotId: uuid('timetable_slot_id').references(() => timetableSlots.id),
    status: attendanceStatus('status').notNull(),
    markedBy: uuid('marked_by').notNull().references(() => users.id),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    updatedAt: updatedAt(),
}, (t) => [
    // NULLS NOT DISTINCT: only one whole-day mark (slot = null) per student per date.
    unique('attendance_uq').on(t.studentId, t.date, t.timetableSlotId).nullsNotDistinct(),
]);
export const participationOutcome = pgEnum('participation_outcome', ['correct', 'partial', 'incorrect', 'skipped']);
/** A student was picked on the board (or answered a board quiz) and the teacher marked the result. */
export const participationEvents = pgTable('participation_events', {
    id: id(),
    tenantId: tenantId(),
    studentId: uuid('student_id').notNull().references(() => students.id),
    boardSessionId: uuid('board_session_id').references(() => boardSessions.id),
    subjectId: uuid('subject_id').references(() => subjects.id),
    /** Global curriculum topic code, when known. */
    topicCode: text('topic_code'),
    outcome: participationOutcome('outcome').notNull(),
    note: text('note'),
    recordedBy: uuid('recorded_by').notNull().references(() => users.id),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
});
/** Idempotency ledger for the sync outbox. */
export const syncOps = pgTable('sync_ops', {
    opId: uuid('op_id').notNull(),
    tenantId: tenantId(),
    type: text('type').notNull(),
    deviceId: uuid('device_id'),
    actorId: uuid('actor_id'),
    status: text('status').notNull(), // applied | rejected
    reason: text('reason'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
}, 
// Keyed per tenant: RLS hides other tenants' rows, so a global key could collide invisibly.
(t) => [primaryKey({ columns: [t.tenantId, t.opId] })]);
// ---------------------------------------------------------------------------------------------
// Homework (assigned from the Teacher App, optionally during a board session)
// ---------------------------------------------------------------------------------------------
export const homework = pgTable('homework', {
    id: id(),
    tenantId: tenantId(),
    sectionId: uuid('section_id').notNull().references(() => sections.id),
    subjectId: uuid('subject_id').notNull().references(() => subjects.id),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    /** The board session it was set in, when assigned during class. */
    boardSessionId: uuid('board_session_id').references(() => boardSessions.id),
    title: text('title').notNull(),
    instructions: text('instructions').notNull().default(''),
    /** Local calendar date in the tenant timezone. */
    dueOn: date('due_on').notNull(),
    createdAt: createdAt(),
}, (t) => [index('homework_section_due_idx').on(t.sectionId, t.dueOn), index('homework_created_by_idx').on(t.createdBy, t.createdAt)]);
// ---------------------------------------------------------------------------------------------
// Families, notifications and saved whiteboards
// ---------------------------------------------------------------------------------------------
/** A parent or guardian (a user with the guardian role) linked to a student. */
export const guardians = pgTable('guardians', {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    relation: text('relation').notNull().default('parent'), // mother, father, guardian…
    createdAt: createdAt(),
}, (t) => [uniqueIndex('guardians_user_student_uq').on(t.userId, t.studentId), index('guardians_student_idx').on(t.studentId)]);
export const notificationKind = pgEnum('notification_kind', ['absence', 'homework', 'broadcast', 'board_shared', 'recording', 'fee', 'library', 'marks', 'message', 'live']);
/**
 * In-app notifications for parents and students. Push (FCM/APNs) carries only the id; apps
 * fetch the text from here, so no personal data passes through push providers.
 */
export const notifications = pgTable('notifications', {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    kind: notificationKind('kind').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    /** Ids the app needs to open the right screen: studentId, homeworkId, whiteboardId… */
    data: jsonb('data').$type().notNull().default({}),
    /** One notification per (recipient, event): e.g. "absence:<student>:<date>:<slot>". */
    dedupeKey: text('dedupe_key').notNull(),
    createdAt: createdAt(),
    readAt: timestamp('read_at', { withTimezone: true }),
    /** Set when the event was undone (an absence corrected to present). Apps hide these. */
    retractedAt: timestamp('retracted_at', { withTimezone: true }),
}, (t) => [uniqueIndex('notifications_user_dedupe_uq').on(t.userId, t.dedupeKey), index('notifications_user_created_idx').on(t.userId, t.createdAt)]);
export const pushPlatform = pgEnum('push_platform', ['android', 'ios', 'web']);
/**
 * Phones and browsers that receive push notifications for a user. Pushes carry only a
 * notification id and kind; the app fetches the text from KINETIX Cloud, so no personal data
 * passes through the push provider.
 */
export const pushDevices = pgTable('push_devices', {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    platform: pushPlatform('platform').notNull(),
    /** Which KINETIX app: parent, student, teacher. */
    app: text('app').notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
}, (t) => [uniqueIndex('push_devices_tenant_token_uq').on(t.tenantId, t.token), index('push_devices_user_idx').on(t.userId)]);
/**
 * A saved board. The id is chosen by the board, so repeated saves of the same lesson update
 * one row. TODO: move content to S3 (ap-south-1) once boards carry images and PDFs.
 */
export const whiteboards = pgTable('whiteboards', {
    id: uuid('id').primaryKey(),
    tenantId: tenantId(),
    ownerId: uuid('owner_id').notNull().references(() => users.id),
    boardSessionId: uuid('board_session_id').references(() => boardSessions.id),
    sectionId: uuid('section_id').references(() => sections.id),
    subjectId: uuid('subject_id').references(() => subjects.id),
    title: text('title').notNull(),
    pageCount: integer('page_count').notNull(),
    content: jsonb('content').$type().notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    /** When it was shared with the class (students and parents can then open it). */
    sharedAt: timestamp('shared_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
}, (t) => [index('whiteboards_owner_idx').on(t.ownerId, t.updatedAt), index('whiteboards_section_idx').on(t.sectionId, t.sharedAt)]);
// ---------------------------------------------------------------------------------------------
// Broadcasts ("circulate" from the principal's dashboard)
// ---------------------------------------------------------------------------------------------
export const broadcastPriority = pgEnum('broadcast_priority', ['info', 'important', 'emergency']);
export const broadcasts = pgTable('broadcasts', {
    id: id(),
    tenantId: tenantId(),
    senderId: uuid('sender_id').notNull().references(() => users.id),
    title: text('title').notNull(),
    body: text('body').notNull(),
    priority: broadcastPriority('priority').notNull().default('info'),
    audience: jsonb('audience').$type().notNull(),
    requiresAck: boolean('requires_ack').notNull().default(false),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    clearedAt: timestamp('cleared_at', { withTimezone: true }),
    createdAt: createdAt(),
});
export const broadcastReceipts = pgTable('broadcast_receipts', {
    id: id(),
    tenantId: tenantId(),
    broadcastId: uuid('broadcast_id').notNull().references(() => broadcasts.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }),
    displayedAt: timestamp('displayed_at', { withTimezone: true }),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    acknowledgedBy: uuid('acknowledged_by').references(() => users.id),
}, (t) => [uniqueIndex('broadcast_receipts_uq').on(t.broadcastId, t.deviceId)]);
// ---------------------------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------------------------
export const auditLog = pgTable('audit_log', {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    tenantId: tenantId(),
    actorType: text('actor_type').notNull(), // user | device | system
    actorId: uuid('actor_id'),
    action: text('action').notNull(), // e.g. "board.paired", "live_view.started"
    subjectType: text('subject_type'),
    subjectId: uuid('subject_id'),
    data: jsonb('data'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
});
/** Every table with a tenant_id column; the RLS migration and its tests iterate over this. */
// ---------------------------------------------------------------------------------------------
// AI (India-hosted; see docs/architecture/ai-platform.md)
// ---------------------------------------------------------------------------------------------
export const aiTask = pgEnum('ai_task', ['explain', 'quiz', 'homework', 'lessonPlan', 'summarize']);
export const aiOutcome = pgEnum('ai_outcome', ['ok', 'cached', 'blocked', 'invalid', 'unavailable', 'quota']);
/** One row per AI request: metering per tenant, plus the model and template behind each answer. */
export const aiUsage = pgTable('ai_usage', {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'set null' }),
    task: aiTask('task').notNull(),
    outcome: aiOutcome('outcome').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    promptTokens: integer('prompt_tokens').notNull().default(0),
    completionTokens: integer('completion_tokens').notNull().default(0),
    latencyMs: integer('latency_ms').notNull().default(0),
    /** Why a request was refused or failed, never the prompt itself. */
    detail: text('detail'),
    createdAt: createdAt(),
}, (t) => [index('ai_usage_tenant_created_idx').on(t.tenantId, t.createdAt)]);
/**
 * Generated results, reused for the same request in the same institution. Per tenant because
 * free-text questions may name people; topic-keyed sharing across tenants comes with the
 * content library.
 */
export const aiCache = pgTable('ai_cache', {
    tenantId: tenantId(),
    /** sha256 of task, prompt version, model, grounding and input. */
    key: text('key').notNull(),
    task: aiTask('task').notNull(),
    result: jsonb('result').notNull(),
    model: text('model').notNull(),
    hits: integer('hits').notNull().default(0),
    createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.tenantId, t.key] })]);
// ---------------------------------------------------------------------------------------------
// Lesson recordings
// ---------------------------------------------------------------------------------------------
export const processingState = pgEnum('processing_state', ['none', 'queued', 'done', 'failed']);
/**
 * A recorded lesson: the board's ink as a timed event log plus the teacher's voice. Files
 * live in object storage (S3 ap-south-1 in production); this row holds the metadata,
 * transcript and AI summary. The id is chosen by the board, so uploads can be retried.
 */
export const recordings = pgTable('recordings', {
    id: uuid('id').primaryKey(),
    tenantId: tenantId(),
    ownerId: uuid('owner_id').notNull().references(() => users.id),
    deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'set null' }),
    boardSessionId: uuid('board_session_id').references(() => boardSessions.id),
    timetableSlotId: uuid('timetable_slot_id').references(() => timetableSlots.id),
    sectionId: uuid('section_id').references(() => sections.id),
    subjectId: uuid('subject_id').references(() => subjects.id),
    title: text('title').notNull(),
    language: language('language').notNull().default('en'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    durationMs: integer('duration_ms').notNull().default(0),
    eventsKey: text('events_key'),
    eventsBytes: integer('events_bytes').notNull().default(0),
    audioKey: text('audio_key'),
    audioMime: text('audio_mime'),
    audioBytes: bigint('audio_bytes', { mode: 'number' }).notNull().default(0),
    /** Set when the board has uploaded everything; the recording can be played from then on. */
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    transcriptState: processingState('transcript_state').notNull().default('none'),
    transcript: text('transcript'),
    summaryState: processingState('summary_state').notNull().default('none'),
    summary: jsonb('summary').$type(),
    sharedAt: timestamp('shared_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
}, (t) => [index('recordings_owner_idx').on(t.ownerId, t.startedAt), index('recordings_section_idx').on(t.sectionId, t.sharedAt)]);
export const jobState = pgEnum('job_state', ['queued', 'running', 'done', 'failed']);
/**
 * Background work (transcription, summaries), claimed with FOR UPDATE SKIP LOCKED. Requests
 * enqueue under RLS like any tenant table; the job runner claims across tenants through the
 * owner connection, then does each job's work inside its tenant with `withTenant`.
 */
export const jobs = pgTable('jobs', {
    id: id(),
    tenantId: tenantId(),
    kind: text('kind').notNull(),
    payload: jsonb('payload').$type().notNull().default({}),
    state: jobState('state').notNull().default('queued'),
    attempts: smallint('attempts').notNull().default(0),
    runAfter: timestamp('run_after', { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: createdAt(),
}, (t) => [index('jobs_due_idx').on(t.state, t.runAfter)]);
// ---------------------------------------------------------------------------------------------
// Content library. Curricula and courses are global (produced by the KINETIX curriculum team
// and shared by every institution). Chapters and topics are global too, and an institution may
// add its own on top: rows with a tenant_id are visible only to that tenant.
// ---------------------------------------------------------------------------------------------
export const curricula = pgTable('curricula', {
    /** 'cbse', 'icse', 'ka-state', 'bu-ug', 'bu-pg'… Matches programs.curriculum_code. */
    code: text('code').primaryKey(),
    name: text('name').notNull(),
    level: programLevel('level').notNull(),
});
export const courses = pgTable('courses', {
    id: id(),
    curriculumCode: text('curriculum_code').notNull().references(() => curricula.code),
    /** Stable code within the curriculum, e.g. 'bcom-3-corporate-accounting', 'class-10-science'. */
    code: text('code').notNull(),
    title: text('title').notNull(),
    /** Class number (K-12) or semester (UG/PG). */
    term: smallint('term').notNull(),
    language: language('language').notNull().default('en'),
    /** Where the content came from and whether the curriculum team has reviewed it. */
    source: text('source').notNull(),
    reviewed: boolean('reviewed').notNull().default(false),
    updatedAt: updatedAt(),
}, (t) => [uniqueIndex('courses_curriculum_code_uq').on(t.curriculumCode, t.code)]);
export const chapters = pgTable('chapters', {
    id: id(),
    /** Null for the global library; set for an institution's own chapters. */
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
    position: smallint('position').notNull(),
    title: text('title').notNull(),
}, (t) => [index('chapters_course_idx').on(t.courseId, t.position)]);
export const topics = pgTable('topics', {
    id: id(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    chapterId: uuid('chapter_id').notNull().references(() => chapters.id, { onDelete: 'cascade' }),
    position: smallint('position').notNull(),
    title: text('title').notNull(),
    /** A short teacher-facing summary. */
    summary: text('summary').notNull().default(''),
    /** Key facts, definitions and formulas. Given to KINETIX AI as grounding. */
    notes: jsonb('notes').$type().notNull().default([]),
    /** What students should be able to do afterwards. */
    outcomes: jsonb('outcomes').$type().notNull().default([]),
    /** 3D models and virtual labs on the board for this topic (ids from kinetix_3d / kinetix_labs). */
    resources: jsonb('resources').$type().notNull().default([]),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: updatedAt(),
}, (t) => [index('topics_chapter_idx').on(t.chapterId, t.position)]);
// ---------------------------------------------------------------------------------------------
// Fees and payments. Amounts are integer paise.
// ---------------------------------------------------------------------------------------------
export const invoiceStatus = pgEnum('invoice_status', ['due', 'paid', 'cancelled']);
/** What one student owes for one fee (e.g. "Semester 3 tuition"). Part payments add up. */
export const feeInvoices = pgTable('fee_invoices', {
    id: id(),
    tenantId: tenantId(),
    studentId: uuid('student_id').notNull().references(() => students.id),
    /** The class when the fee was issued (students move on; the invoice does not). */
    sectionId: uuid('section_id').notNull().references(() => sections.id),
    /** Invoices issued together to a class share a batch. */
    batchId: uuid('batch_id').notNull(),
    title: text('title').notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    paidPaise: bigint('paid_paise', { mode: 'number' }).notNull().default(0),
    dueOn: date('due_on').notNull(),
    status: invoiceStatus('status').notNull().default('due'),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
}, (t) => [index('fee_invoices_student_idx').on(t.studentId, t.dueOn), index('fee_invoices_section_idx').on(t.sectionId, t.status)]);
export const paymentStatus = pgEnum('payment_status', ['created', 'paid', 'failed']);
export const paymentMethod = pgEnum('payment_method', ['online', 'cash', 'cheque', 'bank_transfer', 'upi']);
/**
 * A payment against an invoice: online (an order with the payment provider, confirmed by its
 * signature or webhook) or recorded at the fees counter. Paid payments get a receipt number.
 */
export const feePayments = pgTable('fee_payments', {
    id: id(),
    tenantId: tenantId(),
    invoiceId: uuid('invoice_id').notNull().references(() => feeInvoices.id),
    studentId: uuid('student_id').notNull().references(() => students.id),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    method: paymentMethod('method').notNull(),
    status: paymentStatus('status').notNull(),
    /** razorpay or demo, for online payments. */
    provider: text('provider'),
    providerOrderId: text('provider_order_id'),
    providerPaymentId: text('provider_payment_id'),
    /** Cheque number, bank reference or UPI transaction id for counter payments. */
    reference: text('reference'),
    receiptNo: text('receipt_no'),
    payerUserId: uuid('payer_user_id').references(() => users.id, { onDelete: 'set null' }),
    recordedBy: uuid('recorded_by').references(() => users.id, { onDelete: 'set null' }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: createdAt(),
}, (t) => [
    uniqueIndex('fee_payments_order_uq').on(t.providerOrderId),
    uniqueIndex('fee_payments_receipt_uq').on(t.tenantId, t.receiptNo),
    index('fee_payments_invoice_idx').on(t.invoiceId),
]);
/** Receipt numbers run in sequence per institution and financial year (April to March). */
export const receiptCounters = pgTable('receipt_counters', {
    tenantId: tenantId(),
    financialYear: text('financial_year').notNull(),
    lastNo: integer('last_no').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.tenantId, t.financialYear] })]);
// ---------------------------------------------------------------------------------------------
// Library circulation
// ---------------------------------------------------------------------------------------------
export const libraryBooks = pgTable('library_books', {
    id: id(),
    tenantId: tenantId(),
    title: text('title').notNull(),
    author: text('author').notNull().default(''),
    isbn: text('isbn'),
    /** Shelf mark, e.g. "657.95 GUP". */
    callNo: text('call_no'),
    copies: smallint('copies').notNull().default(1),
    createdAt: createdAt(),
}, (t) => [index('library_books_title_idx').on(t.tenantId, t.title)]);
export const libraryLoans = pgTable('library_loans', {
    id: id(),
    tenantId: tenantId(),
    bookId: uuid('book_id').notNull().references(() => libraryBooks.id),
    studentId: uuid('student_id').notNull().references(() => students.id),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    dueOn: date('due_on').notNull(),
    returnedAt: timestamp('returned_at', { withTimezone: true }),
    /** Late fine charged on return, in paise. */
    finePaise: integer('fine_paise').notNull().default(0),
    issuedBy: uuid('issued_by').notNull().references(() => users.id),
}, (t) => [index('library_loans_student_idx').on(t.studentId, t.returnedAt), index('library_loans_book_idx').on(t.bookId, t.returnedAt)]);
// ---------------------------------------------------------------------------------------------
// Marks
// ---------------------------------------------------------------------------------------------
export const assessmentKind = pgEnum('assessment_kind', ['test', 'assignment', 'internal', 'exam', 'practical']);
/** A test, assignment or exam for one class and subject. Families see it once published. */
export const assessments = pgTable('assessments', {
    id: id(),
    tenantId: tenantId(),
    sectionId: uuid('section_id').notNull().references(() => sections.id),
    subjectId: uuid('subject_id').notNull().references(() => subjects.id),
    title: text('title').notNull(),
    kind: assessmentKind('kind').notNull(),
    maxMarks: numeric('max_marks', { precision: 6, scale: 2, mode: 'number' }).notNull(),
    heldOn: date('held_on').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: createdAt(),
}, (t) => [index('assessments_section_idx').on(t.sectionId, t.heldOn)]);
export const marks = pgTable('marks', {
    tenantId: tenantId(),
    assessmentId: uuid('assessment_id').notNull().references(() => assessments.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id),
    /** Null with absent = true when the student missed it. */
    marks: numeric('marks', { precision: 6, scale: 2, mode: 'number' }),
    absent: boolean('absent').notNull().default(false),
    remark: text('remark'),
    updatedAt: updatedAt(),
}, (t) => [primaryKey({ columns: [t.assessmentId, t.studentId] })]);
// ---------------------------------------------------------------------------------------------
// Messages between families and teachers
// ---------------------------------------------------------------------------------------------
/**
 * One thread between a member of staff and a family member (or an adult student) about one
 * student. Staff see only threads they are in; school leaders can read any for safeguarding.
 */
export const conversations = pgTable('conversations', {
    id: id(),
    tenantId: tenantId(),
    studentId: uuid('student_id').notNull().references(() => students.id),
    staffId: uuid('staff_id').notNull().references(() => users.id),
    familyId: uuid('family_id').notNull().references(() => users.id),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    staffReadAt: timestamp('staff_read_at', { withTimezone: true }),
    familyReadAt: timestamp('family_read_at', { withTimezone: true }),
    createdAt: createdAt(),
}, (t) => [uniqueIndex('conversations_trio_uq').on(t.studentId, t.staffId, t.familyId), index('conversations_staff_idx').on(t.staffId, t.lastMessageAt)]);
export const messages = pgTable('messages', {
    id: id(),
    tenantId: tenantId(),
    conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id').notNull().references(() => users.id),
    body: text('body').notNull(),
    createdAt: createdAt(),
}, (t) => [index('messages_conversation_idx').on(t.conversationId, t.createdAt)]);
export const TENANT_TABLES = [
    'campuses',
    'users',
    'user_roles',
    'academic_years',
    'programs',
    'sections',
    'subjects',
    'students',
    'rooms',
    'timetable_slots',
    'devices',
    'pairing_codes',
    'board_sessions',
    'attendance_records',
    'participation_events',
    'sync_ops',
    'broadcasts',
    'broadcast_receipts',
    'homework',
    'guardians',
    'notifications',
    'push_devices',
    'whiteboards',
    'ai_usage',
    'ai_cache',
    'recordings',
    'jobs',
    'chapters',
    'topics',
    'fee_invoices',
    'fee_payments',
    'receipt_counters',
    'library_books',
    'library_loans',
    'assessments',
    'marks',
    'conversations',
    'messages',
    'audit_log',
];
//# sourceMappingURL=schema.js.map