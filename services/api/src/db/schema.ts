/**
 * KINETIX core schema.
 *
 * Every table except `tenants` carries `tenant_id`. Row-level security policies live in the
 * hand-written migration `migrations/0001_rls.sql` (Drizzle cannot express FORCE RLS).
 */
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
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
  settings: jsonb('settings').$type<TenantSettings>().notNull().default({}),
  createdAt: createdAt(),
});

export interface TenantSettings {
  liveViewEnabled?: boolean;
  liveViewIndicator?: boolean;
  pinFallbackEnabled?: boolean;
  classroomAudioToViewers?: boolean;
  /** Named in the apps' Privacy screen (DPDP Act). */
  grievanceOfficer?: { name: string; email?: string; phone?: string } | null;
  /** Days lesson recordings are kept after their semester ends (default 7, 0–90). */
  recordingRetentionGraceDays?: number;
  /**
   * Kiosk mode on boards (docs/hardware/kiosk-mode.md): on unless turned off. pinHash is the IT
   * PIN's salted hash (src/common/kiosk-pin.ts), never the PIN; null until one is set.
   */
  boardKiosk?: BoardKioskSettings;
}

export interface BoardKioskSettings {
  enabled: boolean;
  pinHash: string | null;
  /** When the PIN was last set (ISO time), for the ERP. */
  pinSetAt?: string | null;
}

export const campuses = pgTable('campuses', {
  id: id(),
  tenantId: tenantId(),
  name: text('name').notNull(),
  city: text('city'),
  createdAt: createdAt(),
});

export const language = pgEnum('language', ['en', 'hi', 'kn']);
export const userStatus = pgEnum('user_status', ['active', 'invited', 'disabled']);

export const users = pgTable(
  'users',
  {
    id: id(),
    tenantId: tenantId(),
    fullName: text('full_name').notNull(),
    phone: text('phone'),
    email: text('email'),
    passwordHash: text('password_hash'),
    /** Set with a temporary password (new institution, admin reset): the user must choose their own before anything else. */
    passwordMustChange: boolean('password_must_change').notNull().default(false),
    preferredLanguage: language('preferred_language').notNull().default('en'),
    status: userStatus('status').notNull().default('active'),
    /** Profile photo in object storage (a square JPEG); null shows initials. */
    photoKey: text('photo_key'),
    photoUpdatedAt: timestamp('photo_updated_at', { withTimezone: true }),
    /** What a teacher says they teach, shown on their profile (the timetable says what they do teach). */
    teachingSubjects: jsonb('teaching_subjects').$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('users_tenant_phone_uq').on(t.tenantId, t.phone),
    uniqueIndex('users_tenant_email_uq').on(t.tenantId, t.email),
  ],
);

export const roleName = pgEnum('role_name', [
  'tenant_admin',
  'principal',
  'hod',
  'teacher',
  'student',
  'guardian',
  'librarian',
  'accountant',
  // Campus operations (migration 0059).
  'transport_manager',
  'driver',
  'hostel_warden',
  'canteen_manager',
  'store_keeper',
  'admissions_officer',
  'hr_manager',
  // Placements, research, grievance and welfare (migration 0067).
  'placement_officer',
  'research_coordinator',
  'grievance_officer',
  'counsellor',
  'icc_member',
]);

export const userRoles = pgTable(
  'user_roles',
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: roleName('role').notNull(),
    /** Null = applies to every campus of the tenant. */
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
  },
  (t) => [uniqueIndex('user_roles_uq').on(t.userId, t.role, t.campusId)],
);

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

/**
 * A semester (or term) inside an academic year: "Odd semester 2026". For the programs listed, or
 * every program when `program_ids` is null; a school may have one term for the whole year. Terms
 * of the same programs do not overlap. Lesson recordings are kept until their term ends.
 */
export const academicTerms = pgTable(
  'academic_terms',
  {
    id: id(),
    tenantId: tenantId(),
    academicYearId: uuid('academic_year_id').notNull().references(() => academicYears.id),
    name: text('name').notNull(),
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on').notNull(),
    /** Null = every program. */
    programIds: uuid('program_ids').array(),
    createdAt: createdAt(),
  },
  (t) => [index('academic_terms_range_idx').on(t.tenantId, t.startsOn, t.endsOn)],
);

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
  /** The department that teaches it (null until the principal assigns one). */
  departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
});

/**
 * Academic departments (Commerce, Computer Science, Languages…). A department owns subjects and
 * has staff; its head (a user with the `hod` role) sees the department view in the ERP.
 */
export const departments = pgTable('departments', {
  id: id(),
  tenantId: tenantId(),
  name: text('name').notNull(),
  headUserId: uuid('head_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
});

/** Staff in a department. A teacher can belong to more than one (a language teacher, say). */
export const departmentStaff = pgTable(
  'department_staff',
  {
    tenantId: tenantId(),
    departmentId: uuid('department_id').notNull().references(() => departments.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.departmentId, t.userId] })],
);

export const students = pgTable(
  'students',
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id').references(() => users.id),
    sectionId: uuid('section_id').notNull().references(() => sections.id),
    rollNo: text('roll_no').notNull(),
    fullName: text('full_name').notNull(),
    /** Lifecycle status (STUDENT_STATUSES in @kinetix/shared); changes go through StudentLifecycleService. */
    status: text('status').notNull().default('active'),
    statusChangedAt: timestamp('status_changed_at', { withTimezone: true }),
    /** The day they joined (enrolment), for the timeline and reports. */
    enrolledOn: date('enrolled_on'),
    /** The admission application they came from; null for students imported or added by hand. */
    applicationId: uuid('application_id').references((): AnyPgColumn => applications.id, { onDelete: 'set null' }),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('students_section_roll_uq').on(t.sectionId, t.rollNo)],
);

export const rooms = pgTable('rooms', {
  id: id(),
  tenantId: tenantId(),
  campusId: uuid('campus_id').notNull().references(() => campuses.id),
  name: text('name').notNull(),
});

export const timetableSlots = pgTable(
  'timetable_slots',
  {
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
  },
  (t) => [index('timetable_teacher_day_idx').on(t.teacherId, t.dayOfWeek)],
);

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
  /** The board's own periodic report (os, storage, battery, kiosk…; shared DeviceHealth). */
  health: jsonb('health').$type<Record<string, unknown>>(),
  healthAt: timestamp('health_at', { withTimezone: true }),
  /** IT locked the board: it shows a lock screen until unlocked. */
  locked: boolean('locked').notNull().default(false),
  /** IT turned kiosk mode on or off for this board only; null follows the institution setting. */
  kioskOverride: boolean('kiosk_override'),
  createdAt: createdAt(),
});

export const pairingCodes = pgTable(
  'pairing_codes',
  {
    id: id(),
    tenantId: tenantId(),
    deviceId: uuid('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    secretHash: text('secret_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    claimedBy: uuid('claimed_by').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index('pairing_codes_lookup_idx').on(t.tenantId, t.codeHash)],
);

/**
 * Phone sign-in codes (OTP). Only the HMAC of the code is kept. A code is spent when used, after
 * five wrong tries, or when a newer code is sent to the same phone.
 */
export const otpCodes = pgTable(
  'otp_codes',
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    phone: text('phone').notNull(),
    codeHash: text('code_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('otp_codes_phone_idx').on(t.tenantId, t.phone, t.createdAt)],
);

/**
 * Teachers who have signed in on a shared board or tablet (docs/architecture/board-profiles.md).
 * After a full sign-in a teacher may set a 4–6 digit PIN to switch to their profile on this
 * board without the Teacher app. Only a salted PBKDF2 hash is kept (common/kiosk-pin.ts); five
 * wrong PINs lock the profile until the teacher signs in fully again or an admin resets it.
 */
export const deviceProfiles = pgTable(
  'device_profiles',
  {
    id: id(),
    tenantId: tenantId(),
    deviceId: uuid('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    pinHash: text('pin_hash'),
    pinSetAt: timestamp('pin_set_at', { withTimezone: true }),
    failedAttempts: integer('failed_attempts').notNull().default(0),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('device_profiles_device_user_uq').on(t.deviceId, t.userId)],
);

export const sessionEndReason = pgEnum('session_end_reason', [
  'teacher_ended',
  'period_over',
  'idle',
  'taken_over',
  'admin_revoked',
]);

export const boardSessions = pgTable(
  'board_sessions',
  {
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
  },
  (t) => [index('board_sessions_device_active_idx').on(t.deviceId, t.endedAt)],
);

// ---------------------------------------------------------------------------------------------
// Classroom data (append-friendly, written through the sync outbox)
// ---------------------------------------------------------------------------------------------

export const attendanceStatus = pgEnum('attendance_status', ['present', 'absent', 'late', 'excused']);

export const attendanceRecords = pgTable(
  'attendance_records',
  {
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
  },
  (t) => [
    // NULLS NOT DISTINCT: only one whole-day mark (slot = null) per student per date.
    unique('attendance_uq').on(t.studentId, t.date, t.timetableSlotId).nullsNotDistinct(),
  ],
);

/** `answered`: answered a class question that has no right answer (an opinion poll). */
export const participationOutcome = pgEnum('participation_outcome', ['correct', 'partial', 'incorrect', 'skipped', 'answered']);

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
  /** The class question (poll or answer-card check) this answer was to. */
  pollId: uuid('poll_id').references(() => polls.id, { onDelete: 'set null' }),
  recordedBy: uuid('recorded_by').notNull().references(() => users.id),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
});

/**
 * Printed answer cards (packages/kinetix_cards): card number n of a class belongs to one
 * student. Numbers are handed out by roll number when the class's sheet is first printed and
 * then kept, so a reprint gives everyone the card they already have.
 */
export const answerCards = pgTable(
  'answer_cards',
  {
    tenantId: tenantId(),
    sectionId: uuid('section_id').notNull().references(() => sections.id),
    cardNo: smallint('card_no').notNull(),
    studentId: uuid('student_id').notNull().references(() => students.id),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.sectionId, t.cardNo] }), uniqueIndex('answer_cards_student_uq').on(t.sectionId, t.studentId)],
);

export const pollKind = pgEnum('poll_kind', ['mcq', 'numeric']);
export const pollAnswerSource = pgEnum('poll_answer_source', ['app', 'card']);

/** A question the teacher asked the class on the board ("Ask the class"). */
/** The badges a teacher can award (names in each app's language; see docs/design/board-wireframes.html, screen 13). */
export const BADGE_KINDS = [
  'dazzling_performer',
  'good_attempt',
  'aspiring_student',
  'obedient_student',
  'outstanding_speaker',
  'master_of_maths',
  'creative_mind',
  'young_scientist',
  'most_curious',
  'best_leader',
] as const;
export const badgeKind = pgEnum('badge_kind', BADGE_KINDS);

/** A badge awarded to a student by one of their class's teachers (from the board or the Teacher App). */
export const badges = pgTable(
  'badges',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    sectionId: uuid('section_id').notNull().references(() => sections.id),
    badge: badgeKind('badge').notNull(),
    awardedBy: uuid('awarded_by').notNull().references(() => users.id),
    subjectId: uuid('subject_id').references(() => subjects.id),
    note: text('note'),
    awardedAt: timestamp('awarded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('badges_student_idx').on(t.studentId, t.awardedAt)],
);

export const polls = pgTable(
  'polls',
  {
    id: id(),
    tenantId: tenantId(),
    boardSessionId: uuid('board_session_id').notNull().references(() => boardSessions.id),
    sectionId: uuid('section_id').notNull().references(() => sections.id),
    subjectId: uuid('subject_id').references(() => subjects.id),
    teacherId: uuid('teacher_id').notNull().references(() => users.id),
    kind: pollKind('kind').notNull(),
    question: text('question').notNull(),
    /** MCQ answer labels (A, B, C… or True / False); empty for numeric questions. */
    options: jsonb('options').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** MCQ: the right option's index as text; numeric: the value. Null = no right answer. */
    correct: text('correct'),
    topicCode: text('topic_code'),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (t) => [index('polls_session_idx').on(t.boardSessionId), index('polls_section_idx').on(t.sectionId, t.openedAt)],
);

/** One student's answer to a poll; a later answer replaces an earlier one. */
export const pollResponses = pgTable(
  'poll_responses',
  {
    tenantId: tenantId(),
    pollId: uuid('poll_id').notNull().references(() => polls.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id),
    answer: text('answer').notNull(),
    source: pollAnswerSource('source').notNull(),
    answeredAt: timestamp('answered_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.pollId, t.studentId] })],
);

/** Idempotency ledger for the sync outbox. */
export const syncOps = pgTable(
  'sync_ops',
  {
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
  (t) => [primaryKey({ columns: [t.tenantId, t.opId] })],
);

// ---------------------------------------------------------------------------------------------
// Homework (assigned from the Teacher App, optionally during a board session)
// ---------------------------------------------------------------------------------------------

export const homework = pgTable(
  'homework',
  {
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
  },
  (t) => [index('homework_section_due_idx').on(t.sectionId, t.dueOn), index('homework_created_by_idx').on(t.createdBy, t.createdAt)],
);

// ---------------------------------------------------------------------------------------------
// Families, notifications and saved whiteboards
// ---------------------------------------------------------------------------------------------

/** A parent or guardian (a user with the guardian role) linked to a student. */
export const guardians = pgTable(
  'guardians',
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    relation: text('relation').notNull().default('parent'), // mother, father, guardian…
    /** The contact the institution calls first. At most one per student (a partial unique index). */
    isPrimary: boolean('is_primary').notNull().default(false),
    isEmergencyContact: boolean('is_emergency_contact').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('guardians_user_student_uq').on(t.userId, t.studentId),
    index('guardians_student_idx').on(t.studentId),
    uniqueIndex('guardians_one_primary_uq').on(t.studentId).where(sql`${t.isPrimary}`),
  ],
);

export const notificationKind = pgEnum('notification_kind', ['absence', 'homework', 'broadcast', 'board_shared', 'recording', 'fee', 'library', 'marks', 'message', 'live', 'calendar', 'badge', 'transport', 'hostel', 'leave', 'payslip', 'certificate', 'placement', 'grievance', 'welfare']);

/**
 * In-app notifications for parents and students. Push (FCM/APNs) carries only the id; apps
 * fetch the text from here, so no personal data passes through push providers.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    kind: notificationKind('kind').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    /** Ids the app needs to open the right screen: studentId, homeworkId, whiteboardId… */
    data: jsonb('data').$type<Record<string, string>>().notNull().default({}),
    /** One notification per (recipient, event): e.g. "absence:<student>:<date>:<slot>". */
    dedupeKey: text('dedupe_key').notNull(),
    createdAt: createdAt(),
    readAt: timestamp('read_at', { withTimezone: true }),
    /** Set when the event was undone (an absence corrected to present). Apps hide these. */
    retractedAt: timestamp('retracted_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('notifications_user_dedupe_uq').on(t.userId, t.dedupeKey), index('notifications_user_created_idx').on(t.userId, t.createdAt)],
);

export const pushPlatform = pgEnum('push_platform', ['android', 'ios', 'web']);

/**
 * Phones and browsers that receive push notifications for a user. Pushes carry only a
 * notification id and kind; the app fetches the text from KINETIX Cloud, so no personal data
 * passes through the push provider.
 */
export const pushDevices = pgTable(
  'push_devices',
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    platform: pushPlatform('platform').notNull(),
    /** Which KINETIX app: parent, student, teacher. */
    app: text('app').notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('push_devices_tenant_token_uq').on(t.tenantId, t.token), index('push_devices_user_idx').on(t.userId)],
);

export interface WhiteboardContent {
  /** Format version: 1 strokes only; 2 adds the other board elements and groups. */
  v: 1 | 2;
  background: string;
  canvas: { w: number; h: number };
  /** Each page's elements bottom first (strokes, and in format 2 any element), and its groups. */
  pages: { strokes: SerializedElement[]; groups?: number[][] }[];
}

/** A board element other than a stroke (format 2); its fields belong to the board's format. */
export interface SerializedOtherElement {
  t: 'text' | 'image' | 'math' | 'graph' | 'polygon' | 'note' | 'sheet';
  [field: string]: unknown;
}

export type SerializedElement = SerializedStroke | SerializedOtherElement;

/** Compact stroke: tool, ARGB colour, width, optional shape, flat [x0, y0, x1, y1, …]. */
export interface SerializedStroke {
  t: 'pen' | 'highlighter' | 'shape';
  c: number;
  w: number;
  s?: string;
  p: number[];
}

/**
 * A saved board. The id is chosen by the board, so repeated saves of the same lesson update
 * one row. TODO: move content to S3 (ap-south-1) once boards carry images and PDFs.
 */
export const whiteboards = pgTable(
  'whiteboards',
  {
    id: uuid('id').primaryKey(),
    tenantId: tenantId(),
    ownerId: uuid('owner_id').notNull().references(() => users.id),
    boardSessionId: uuid('board_session_id').references(() => boardSessions.id),
    sectionId: uuid('section_id').references(() => sections.id),
    subjectId: uuid('subject_id').references(() => subjects.id),
    title: text('title').notNull(),
    pageCount: integer('page_count').notNull(),
    content: jsonb('content').$type<WhiteboardContent>().notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    /** When it was shared with the class (students and parents can then open it). */
    sharedAt: timestamp('shared_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('whiteboards_owner_idx').on(t.ownerId, t.updatedAt), index('whiteboards_section_idx').on(t.sectionId, t.sharedAt)],
);

// ---------------------------------------------------------------------------------------------
// Broadcasts ("circulate" from the principal's dashboard)
// ---------------------------------------------------------------------------------------------

export const broadcastPriority = pgEnum('broadcast_priority', ['info', 'important', 'emergency']);

export interface BroadcastAudience {
  /** Everyone in the tenant. */
  all?: boolean;
  campusIds?: string[];
  programIds?: string[];
  sectionIds?: string[];
  deviceIds?: string[];
}

export const broadcasts = pgTable('broadcasts', {
  id: id(),
  tenantId: tenantId(),
  senderId: uuid('sender_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  body: text('body').notNull(),
  priority: broadcastPriority('priority').notNull().default('info'),
  audience: jsonb('audience').$type<BroadcastAudience>().notNull(),
  requiresAck: boolean('requires_ack').notNull().default(false),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  clearedAt: timestamp('cleared_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export const broadcastReceipts = pgTable(
  'broadcast_receipts',
  {
    id: id(),
    tenantId: tenantId(),
    broadcastId: uuid('broadcast_id').notNull().references(() => broadcasts.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }),
    displayedAt: timestamp('displayed_at', { withTimezone: true }),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    acknowledgedBy: uuid('acknowledged_by').references(() => users.id),
  },
  (t) => [uniqueIndex('broadcast_receipts_uq').on(t.broadcastId, t.deviceId)],
);

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

export const aiTask = pgEnum('ai_task', ['explain', 'quiz', 'homework', 'lessonPlan', 'summarize', 'readBoard', 'transcribe']);
export const aiOutcome = pgEnum('ai_outcome', ['ok', 'cached', 'blocked', 'invalid', 'unavailable', 'quota']);

/** One row per AI request: metering per tenant, plus the model and template behind each answer. */
export const aiUsage = pgTable(
  'ai_usage',
  {
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
    /** Audio transcribed (task `transcribe`), for the monthly hours cap. */
    audioMs: integer('audio_ms').notNull().default(0),
    /** Estimated rupees, for pay-per-use providers (Sarvam); null for self-hosted models. */
    estCostInr: numeric('est_cost_inr', { precision: 12, scale: 4, mode: 'number' }),
    /** Why a request was refused or failed, never the prompt itself. */
    detail: text('detail'),
    createdAt: createdAt(),
  },
  (t) => [index('ai_usage_tenant_created_idx').on(t.tenantId, t.createdAt)],
);

/**
 * Generated results, reused for the same request in the same institution. Per tenant because
 * free-text questions may name people; topic-keyed sharing across tenants comes with the
 * content library.
 */
export const aiCache = pgTable(
  'ai_cache',
  {
    tenantId: tenantId(),
    /** sha256 of task, prompt version, model, grounding and input. */
    key: text('key').notNull(),
    task: aiTask('task').notNull(),
    result: jsonb('result').notNull(),
    model: text('model').notNull(),
    hits: integer('hits').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.key] })],
);

// ---------------------------------------------------------------------------------------------
// Lesson recordings
// ---------------------------------------------------------------------------------------------

export const processingState = pgEnum('processing_state', ['none', 'queued', 'done', 'failed']);

/**
 * A recorded lesson: the board's ink as a timed event log plus the teacher's voice. Files
 * live in object storage (S3 ap-south-1 in production); this row holds the metadata,
 * transcript and AI summary. The id is chosen by the board, so uploads can be retried.
 */
export const recordings = pgTable(
  'recordings',
  {
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
    summary: jsonb('summary').$type<{ summary: string; keyPoints: string[] }>(),
    sharedAt: timestamp('shared_at', { withTimezone: true }),
    /** The teacher asked to keep it: never deleted when its term ends. */
    keep: boolean('keep').notNull().default(false),
    /** When the teacher was told it will be deleted soon (once). */
    expiryNotifiedAt: timestamp('expiry_notified_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('recordings_owner_idx').on(t.ownerId, t.startedAt), index('recordings_section_idx').on(t.sectionId, t.sharedAt)],
);

export const jobState = pgEnum('job_state', ['queued', 'running', 'done', 'failed']);

/**
 * Background work (transcription, summaries), claimed with FOR UPDATE SKIP LOCKED. Requests
 * enqueue under RLS like any tenant table; the job runner claims across tenants through the
 * owner connection, then does each job's work inside its tenant with `withTenant`.
 */
export const jobs = pgTable(
  'jobs',
  {
    id: id(),
    tenantId: tenantId(),
    kind: text('kind').notNull(),
    payload: jsonb('payload').$type<Record<string, string>>().notNull().default({}),
    state: jobState('state').notNull().default('queued'),
    attempts: smallint('attempts').notNull().default(0),
    runAfter: timestamp('run_after', { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: createdAt(),
  },
  (t) => [index('jobs_due_idx').on(t.state, t.runAfter)],
);

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

export const courses = pgTable(
  'courses',
  {
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
  },
  (t) => [uniqueIndex('courses_curriculum_code_uq').on(t.curriculumCode, t.code)],
);

export const chapters = pgTable(
  'chapters',
  {
    id: id(),
    /** Null for the global library; set for an institution's own chapters. */
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
    position: smallint('position').notNull(),
    title: text('title').notNull(),
  },
  (t) => [index('chapters_course_idx').on(t.courseId, t.position)],
);

export interface TopicResource {
  kind: 'model3d' | 'lab';
  id: string;
  title: string;
}

export interface LessonQuestion {
  q: string;
  a: string;
}

/** How to teach a topic: what the teacher says and does, beyond the notes. */
export interface LessonText {
  /** A question or situation to open the lesson with. */
  hook: string;
  /** A worked example; `exampleTex` is its key line in LaTeX, when there is one. */
  example: string;
  exampleTex?: string;
  /** Something the class does. */
  activity: string;
  /** Questions to check understanding, with their answers. */
  questions: LessonQuestion[];
  homework: string;
  /** Words students should learn. */
  terms: string[];
}

/** The lesson in another language, with the topic's title, notes and outcomes in it too. */
export interface LessonVariant extends LessonText {
  title?: string;
  notes: string[];
  outcomes: string[];
}

/** A topic's lesson in the course's language, with Hindi and Kannada versions where written. */
export interface TopicLesson extends LessonText {
  hi?: LessonVariant;
  kn?: LessonVariant;
}

export const topics = pgTable(
  'topics',
  {
    id: id(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    chapterId: uuid('chapter_id').notNull().references(() => chapters.id, { onDelete: 'cascade' }),
    position: smallint('position').notNull(),
    title: text('title').notNull(),
    /** A short teacher-facing summary. */
    summary: text('summary').notNull().default(''),
    /** Key facts, definitions and formulas. Given to KINETIX AI as grounding. */
    notes: jsonb('notes').$type<string[]>().notNull().default([]),
    /** What students should be able to do afterwards. */
    outcomes: jsonb('outcomes').$type<string[]>().notNull().default([]),
    /** 3D models and virtual labs on the board for this topic (ids from kinetix_3d / kinetix_labs). */
    resources: jsonb('resources').$type<TopicResource[]>().notNull().default([]),
    /** The full lesson (hook, example, activity, questions, homework, terms); null when not written. */
    lesson: jsonb('lesson').$type<TopicLesson>(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: updatedAt(),
  },
  (t) => [index('topics_chapter_idx').on(t.chapterId, t.position)],
);

/**
 * The KINETIX platform team: people who look after the global library for every institution
 * (concept videos today). Each is an ordinary user of some institution (usually KINETIX's own),
 * added with `pnpm platform:admin`. The app role has no access to this table at all; only
 * SystemLookups reads it (owner role).
 */
export const platformAdmins = pgTable('platform_admins', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  note: text('note'),
  createdAt: createdAt(),
});

/**
 * Concept videos: short explainers from the KINETIX YouTube channel, linked to global topics by
 * the platform team and shown to every institution (board, Student App). Only the YouTube id is
 * kept; the apps play it with YouTube's own embedded player and never download it.
 * Platform rows are written by the platform endpoints as the owner; institution and teacher rows by the institution (RLS, migration 0066).
 */
export const conceptVideos = pgTable(
  'concept_videos',
  {
    id: id(),
    topicId: uuid('topic_id').notNull().references(() => topics.id, { onDelete: 'cascade' }),
    youtubeVideoId: text('youtube_video_id').notNull(),
    title: text('title').notNull(),
    language: language('language').notNull().default('en'),
    durationSeconds: integer('duration_seconds'),
    channelTitle: text('channel_title'),
    /** The playlist it was imported from, if any. */
    playlistId: text('playlist_id'),
    position: smallint('position').notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    /** Who linked it: the platform team (every institution), an institution's admin, or one teacher (migration 0066). */
    scope: text('scope').$type<'platform' | 'institution' | 'teacher'>().notNull().default('platform'),
    /** Null for platform videos. */
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    /** Teacher videos: the sections they are for. Once approved they are shown to the whole institution. */
    sectionIds: uuid('section_ids').array().notNull().default(sql`'{}'::uuid[]`),
    /** Teacher videos: none = for their sections only; pending / approved / rejected = asked to be shared institution-wide. */
    shareStatus: text('share_status').$type<'none' | 'pending' | 'approved' | 'rejected'>().notNull().default('none'),
    reviewReason: text('review_reason'),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('concept_videos_platform_uq').on(t.topicId, t.youtubeVideoId).where(sql`scope = 'platform'`),
    uniqueIndex('concept_videos_institution_uq').on(t.tenantId, t.topicId, t.youtubeVideoId).where(sql`scope = 'institution'`),
    uniqueIndex('concept_videos_teacher_uq').on(t.createdBy, t.topicId, t.youtubeVideoId).where(sql`scope = 'teacher'`),
    index('concept_videos_topic_idx').on(t.topicId, t.position),
    index('concept_videos_tenant_idx').on(t.tenantId, t.shareStatus),
  ],
);

// ---------------------------------------------------------------------------------------------
// Fees and payments. Amounts are integer paise.
// ---------------------------------------------------------------------------------------------

export const invoiceStatus = pgEnum('invoice_status', ['due', 'paid', 'cancelled']);

/** What one student owes for one fee (e.g. "Semester 3 tuition"). Part payments add up. */
export const feeInvoices = pgTable(
  'fee_invoices',
  {
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
  },
  (t) => [index('fee_invoices_student_idx').on(t.studentId, t.dueOn), index('fee_invoices_section_idx').on(t.sectionId, t.status)],
);

export const paymentStatus = pgEnum('payment_status', ['created', 'paid', 'failed']);
export const paymentMethod = pgEnum('payment_method', ['online', 'cash', 'cheque', 'bank_transfer', 'upi']);

/**
 * A payment against an invoice: online (an order with the payment provider, confirmed by its
 * signature or webhook) or recorded at the fees counter. Paid payments get a receipt number.
 */
export const feePayments = pgTable(
  'fee_payments',
  {
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
  },
  (t) => [
    uniqueIndex('fee_payments_order_uq').on(t.providerOrderId),
    uniqueIndex('fee_payments_receipt_uq').on(t.tenantId, t.receiptNo),
    index('fee_payments_invoice_idx').on(t.invoiceId),
  ],
);

/** Receipt numbers run in sequence per institution and financial year (April to March). */
export const receiptCounters = pgTable(
  'receipt_counters',
  {
    tenantId: tenantId(),
    financialYear: text('financial_year').notNull(),
    lastNo: integer('last_no').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.financialYear] })],
);

/**
 * The institution's own Razorpay account: fees go straight to it. The key secret and webhook
 * secret are encrypted at rest (AES-256-GCM, see common/secret-box.ts) and never returned by the
 * API; only the last four characters of the key secret are kept in clear, to recognise it.
 */
export const paymentGatewayAccounts = pgTable('payment_gateway_accounts', {
  tenantId: tenantId().primaryKey(),
  provider: text('provider').notNull().default('razorpay'),
  /** Public: the app's checkout needs it. rzp_test_… or rzp_live_…. */
  keyId: text('key_id').notNull(),
  keySecretEnc: text('key_secret_enc').notNull(),
  keySecretLast4: text('key_secret_last4').notNull(),
  webhookSecretEnc: text('webhook_secret_enc').notNull(),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------------------------
// Library circulation
// ---------------------------------------------------------------------------------------------

export const libraryBooks = pgTable(
  'library_books',
  {
    id: id(),
    tenantId: tenantId(),
    title: text('title').notNull(),
    author: text('author').notNull().default(''),
    isbn: text('isbn'),
    /** Shelf mark, e.g. "657.95 GUP". */
    callNo: text('call_no'),
    copies: smallint('copies').notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [index('library_books_title_idx').on(t.tenantId, t.title)],
);

export const libraryLoans = pgTable(
  'library_loans',
  {
    id: id(),
    tenantId: tenantId(),
    bookId: uuid('book_id').notNull().references(() => libraryBooks.id),
    studentId: uuid('student_id').notNull().references(() => students.id),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    dueOn: date('due_on').notNull(),
    returnedAt: timestamp('returned_at', { withTimezone: true }),
    /** Late fine charged on return, in paise. */
    finePaise: integer('fine_paise').notNull().default(0),
    /** When the fine was collected at the desk. */
    finePaidAt: timestamp('fine_paid_at', { withTimezone: true }),
    issuedBy: uuid('issued_by').notNull().references(() => users.id),
  },
  (t) => [index('library_loans_student_idx').on(t.studentId, t.returnedAt), index('library_loans_book_idx').on(t.bookId, t.returnedAt)],
);

// ---------------------------------------------------------------------------------------------
// Marks
// ---------------------------------------------------------------------------------------------

export const assessmentKind = pgEnum('assessment_kind', ['test', 'assignment', 'internal', 'exam', 'practical']);
export const markStatus = pgEnum('mark_status', ['draft', 'submitted', 'verified', 'moderated']);

/** A test, assignment or exam for one class and subject. Families see it once published. */
export const assessments = pgTable(
  'assessments',
  {
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
    /** The scheme component this assessment counts towards (null = a plain class test). */
    componentId: uuid('component_id').references((): AnyPgColumn => schemeComponents.id, { onDelete: 'set null' }),
    /** Marks entry workflow: draft → submitted (teacher) → verified (head) → moderated (optional). */
    markStatus: markStatus('mark_status').notNull().default('draft'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    verifiedBy: uuid('verified_by').references(() => users.id),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    moderatedBy: uuid('moderated_by').references(() => users.id),
    moderatedAt: timestamp('moderated_at', { withTimezone: true }),
  },
  (t) => [index('assessments_section_idx').on(t.sectionId, t.heldOn)],
);

export const marks = pgTable(
  'marks',
  {
    tenantId: tenantId(),
    assessmentId: uuid('assessment_id').notNull().references(() => assessments.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id),
    /** Null with absent = true when the student missed it. */
    marks: numeric('marks', { precision: 6, scale: 2, mode: 'number' }),
    absent: boolean('absent').notNull().default(false),
    remark: text('remark'),
    /** Set by moderation; the effective mark is the moderated one when present. */
    moderatedMarks: numeric('moderated_marks', { precision: 6, scale: 2, mode: 'number' }),
    moderationNote: text('moderation_note'),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.assessmentId, t.studentId] })],
);

// ---------------------------------------------------------------------------------------------
// Messages between families and teachers
// ---------------------------------------------------------------------------------------------

/**
 * One thread between a member of staff and a family member (or an adult student) about one
 * student. Staff see only threads they are in; school leaders can read any for safeguarding.
 */
export const conversations = pgTable(
  'conversations',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: uuid('student_id').notNull().references(() => students.id),
    staffId: uuid('staff_id').notNull().references(() => users.id),
    familyId: uuid('family_id').notNull().references(() => users.id),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    staffReadAt: timestamp('staff_read_at', { withTimezone: true }),
    familyReadAt: timestamp('family_read_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('conversations_trio_uq').on(t.studentId, t.staffId, t.familyId), index('conversations_staff_idx').on(t.staffId, t.lastMessageAt)],
);

export const messages = pgTable(
  'messages',
  {
    id: id(),
    tenantId: tenantId(),
    conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id').notNull().references(() => users.id),
    body: text('body').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('messages_conversation_idx').on(t.conversationId, t.createdAt)],
);

// ---------------------------------------------------------------------------------------------
// Academic calendar, syllabus coverage, homework submissions, consent
// ---------------------------------------------------------------------------------------------

export const calendarKind = pgEnum('calendar_kind', ['holiday', 'exam', 'event']);

/**
 * Holidays, exam days and events. A holiday cancels the timetable's classes on those days (for
 * the listed programs, or everyone when `program_ids` is null); exams and events are shown only.
 */
export const calendarEvents = pgTable(
  'calendar_events',
  {
    id: id(),
    tenantId: tenantId(),
    kind: calendarKind('kind').notNull(),
    title: text('title').notNull(),
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on').notNull(),
    /** Null = the whole institution. */
    programIds: uuid('program_ids').array(),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index('calendar_events_range_idx').on(t.tenantId, t.startsOn, t.endsOn)],
);

/** Topics of a class's syllabus that have been taught, and when. */
export const topicCoverage = pgTable(
  'topic_coverage',
  {
    tenantId: tenantId(),
    sectionId: uuid('section_id').notNull().references(() => sections.id),
    topicId: uuid('topic_id').notNull().references(() => topics.id, { onDelete: 'cascade' }),
    coveredOn: date('covered_on').notNull(),
    coveredBy: uuid('covered_by').notNull().references(() => users.id),
    boardSessionId: uuid('board_session_id').references(() => boardSessions.id),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.sectionId, t.topicId] })],
);

export const submissionStatus = pgEnum('submission_status', ['submitted', 'checked', 'returned']);

export interface SubmissionFile {
  key: string;
  name: string;
  mime: string;
  bytes: number;
}

/** A student's answer to homework: text and up to a few photos or PDFs. Returned work can be resubmitted. */
export const homeworkSubmissions = pgTable(
  'homework_submissions',
  {
    tenantId: tenantId(),
    homeworkId: uuid('homework_id').notNull().references(() => homework.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id),
    text: text('text').notNull().default(''),
    files: jsonb('files').$type<SubmissionFile[]>().notNull().default([]),
    status: submissionStatus('status').notNull().default('submitted'),
    submittedBy: uuid('submitted_by').notNull().references(() => users.id),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),
    remark: text('remark'),
    checkedBy: uuid('checked_by').references(() => users.id),
    checkedAt: timestamp('checked_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.homeworkId, t.studentId] })],
);

export const consentPurpose = pgEnum('consent_purpose', ['data_processing', 'ai_features', 'class_recordings', 'photos']);

/**
 * Consent under the DPDP Act, append-only: the latest row per (student, purpose) counts. For a
 * child the guardian decides; an adult student decides for themselves.
 */
export const consents = pgTable(
  'consents',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: uuid('student_id').notNull().references(() => students.id),
    purpose: consentPurpose('purpose').notNull(),
    granted: boolean('granted').notNull(),
    /** Version of the notice the person saw. */
    noticeVersion: text('notice_version').notNull(),
    givenBy: uuid('given_by').notNull().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index('consents_student_idx').on(t.studentId, t.purpose, t.createdAt)],
);

// ---------------------------------------------------------------------------------------------
// Year plans and lesson plans
// ---------------------------------------------------------------------------------------------

/**
 * A class's plan for a subject across the term: each syllabus topic is given a week and a
 * number of periods. Generated from the timetable and the calendar (holidays skipped), then
 * adjusted by the teacher. Progress compares it with topic_coverage.
 */
export const yearPlans = pgTable(
  'year_plans',
  {
    id: id(),
    tenantId: tenantId(),
    sectionId: uuid('section_id').notNull().references(() => sections.id),
    subjectId: uuid('subject_id').notNull().references(() => subjects.id),
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on').notNull(),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('year_plans_class_uq').on(t.sectionId, t.subjectId)],
);

export const yearPlanItems = pgTable(
  'year_plan_items',
  {
    tenantId: tenantId(),
    planId: uuid('plan_id').notNull().references(() => yearPlans.id, { onDelete: 'cascade' }),
    topicId: uuid('topic_id').notNull().references(() => topics.id, { onDelete: 'cascade' }),
    /** Monday of the week the topic is planned for. */
    weekOf: date('week_of').notNull(),
    periods: smallint('periods').notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.planId, t.topicId] })],
);

/** A lesson plan's content: the same shape KINETIX AI drafts (ai/tasks.ts lessonPlan). */
export interface LessonPlanContent {
  objectives: string[];
  steps: { minutes: number; activity: string }[];
  materials: string[];
  assessment: string;
  homework: string;
}

/** The plan for one period (a timetable slot on a date). */
export const lessonPlans = pgTable(
  'lesson_plans',
  {
    id: id(),
    tenantId: tenantId(),
    sectionId: uuid('section_id').notNull().references(() => sections.id),
    subjectId: uuid('subject_id').notNull().references(() => subjects.id),
    timetableSlotId: uuid('timetable_slot_id').notNull().references(() => timetableSlots.id),
    date: date('date').notNull(),
    teacherId: uuid('teacher_id').notNull().references(() => users.id),
    topicIds: uuid('topic_ids').array().notNull().default(sql`'{}'::uuid[]`),
    content: jsonb('content').$type<LessonPlanContent>().notNull(),
    /** Drafted with KINETIX AI (then edited or not). */
    aiDrafted: boolean('ai_drafted').notNull().default(false),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewRemark: text('review_remark'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('lesson_plans_period_uq').on(t.timetableSlotId, t.date), index('lesson_plans_class_idx').on(t.sectionId, t.subjectId, t.date)],
);

// ---------------------------------------------------------------------------------------------
// Admissions CRM (docs/architecture/admissions-lifecycle.md)
// ---------------------------------------------------------------------------------------------

export const enquirySource = pgEnum('enquiry_source', ['web', 'walk_in', 'phone', 'campaign', 'referral', 'import']);
export const enquiryStage = pgEnum('enquiry_stage', ['new', 'contacted', 'counselling', 'applied', 'converted', 'lost', 'deferred']);
export const enquiryActivityKind = pgEnum('enquiry_activity_kind', ['call', 'visit', 'email', 'sms', 'whatsapp', 'note']);

/** A prospective student's first contact: from the public form, a walk-in, a call or a campaign. */
export const enquiries = pgTable(
  'enquiries',
  {
    id: id(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    email: text('email'),
    /** The program the family asked about (null = undecided). */
    programId: uuid('program_id').references(() => programs.id, { onDelete: 'set null' }),
    source: enquirySource('source').notNull().default('web'),
    stage: enquiryStage('stage').notNull().default('new'),
    /** The counsellor (a staff user) who owns the follow-up. */
    counsellorId: uuid('counsellor_id').references(() => users.id, { onDelete: 'set null' }),
    message: text('message'),
    lostReason: text('lost_reason'),
    nextFollowUpOn: date('next_follow_up_on'),
    /** The application this enquiry turned into. */
    applicationId: uuid('application_id'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('enquiries_stage_idx').on(t.tenantId, t.stage, t.createdAt), index('enquiries_phone_idx').on(t.tenantId, t.phone), index('enquiries_counsellor_idx').on(t.counsellorId)],
);

/** Calls, visits and notes on an enquiry: the counsellor's follow-up trail. */
export const enquiryActivities = pgTable(
  'enquiry_activities',
  {
    id: id(),
    tenantId: tenantId(),
    enquiryId: uuid('enquiry_id').notNull().references(() => enquiries.id, { onDelete: 'cascade' }),
    kind: enquiryActivityKind('kind').notNull(),
    note: text('note').notNull(),
    nextFollowUpOn: date('next_follow_up_on'),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('enquiry_activities_enquiry_idx').on(t.enquiryId, t.createdAt)],
);

export const admissionCycleStatus = pgEnum('admission_cycle_status', ['draft', 'open', 'closed']);

/**
 * One program's intake for one academic year: its seats, application fee, the form the
 * applicant fills (per program), the documents to upload, eligibility and merit rules.
 */
export const admissionCycles = pgTable(
  'admission_cycles',
  {
    id: id(),
    tenantId: tenantId(),
    programId: uuid('program_id').notNull().references(() => programs.id),
    academicYearId: uuid('academic_year_id').notNull().references(() => academicYears.id),
    name: text('name').notNull(),
    status: admissionCycleStatus('status').notNull().default('draft'),
    /** The grade or semester admitted into (sections of this term receive the students). */
    entryTerm: smallint('entry_term').notNull().default(1),
    seats: integer('seats').notNull(),
    opensOn: date('opens_on').notNull(),
    closesOn: date('closes_on').notNull(),
    applicationFeePaise: bigint('application_fee_paise', { mode: 'number' }).notNull().default(0),
    /** How many days an offer stays open. */
    offerValidDays: smallint('offer_valid_days').notNull().default(7),
    formFields: jsonb('form_fields').$type<unknown[]>().notNull().default([]),
    documents: jsonb('documents').$type<unknown[]>().notNull().default([]),
    eligibility: jsonb('eligibility').$type<Record<string, unknown>>().notNull().default({}),
    meritRules: jsonb('merit_rules').$type<unknown[]>().notNull().default([]),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('admission_cycles_program_idx').on(t.tenantId, t.programId, t.status)],
);

export const applicationStatus = pgEnum('application_status', ['submitted', 'under_review', 'eligible', 'ineligible', 'waitlisted', 'offered', 'accepted', 'declined', 'rejected', 'enrolled', 'withdrawn']);
export const applicationFeeStatus = pgEnum('application_fee_status', ['none', 'pending', 'paid', 'waived']);

/** An applicant's submitted application to a cycle. The applicant has no login: a secret link token. */
export const applications = pgTable(
  'applications',
  {
    id: id(),
    tenantId: tenantId(),
    cycleId: uuid('cycle_id').notNull().references(() => admissionCycles.id),
    /** "APP/2026-27/00012" */
    applicationNo: text('application_no').notNull(),
    enquiryId: uuid('enquiry_id').references(() => enquiries.id, { onDelete: 'set null' }),
    applicantName: text('applicant_name').notNull(),
    dateOfBirth: date('date_of_birth'),
    gender: text('gender'),
    phone: text('phone').notNull(),
    email: text('email'),
    guardianName: text('guardian_name').notNull(),
    guardianPhone: text('guardian_phone').notNull(),
    guardianEmail: text('guardian_email'),
    guardianRelation: text('guardian_relation').notNull().default('parent'),
    /** Answers to the cycle's per-program form, by field key. */
    answers: jsonb('answers').$type<Record<string, string | number>>().notNull().default({}),
    status: applicationStatus('status').notNull().default('submitted'),
    statusReason: text('status_reason'),
    feeStatus: applicationFeeStatus('fee_status').notNull().default('none'),
    meritScore: numeric('merit_score', { precision: 10, scale: 3, mode: 'number' }),
    meritRank: integer('merit_rank'),
    eligibilityNotes: jsonb('eligibility_notes').$type<string[]>().notNull().default([]),
    /** SHA-256 of the token in the applicant's link; the token itself is shown once. */
    accessTokenHash: text('access_token_hash').notNull(),
    offerExpiresOn: date('offer_expires_on'),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'set null' }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('applications_no_uq').on(t.tenantId, t.applicationNo),
    index('applications_cycle_idx').on(t.cycleId, t.status),
    index('applications_phone_idx').on(t.tenantId, t.phone),
  ],
);

export const documentStatus = pgEnum('application_document_status', ['pending', 'verified', 'rejected']);

/** A file the applicant uploaded for one of the cycle's required documents. */
export const applicationDocuments = pgTable(
  'application_documents',
  {
    id: id(),
    tenantId: tenantId(),
    applicationId: uuid('application_id').notNull().references(() => applications.id, { onDelete: 'cascade' }),
    /** The cycle's document key: `marksheet_12th`. */
    docKey: text('doc_key').notNull(),
    fileName: text('file_name').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    storageKey: text('storage_key').notNull(),
    status: documentStatus('status').notNull().default('pending'),
    reviewNote: text('review_note'),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('application_documents_uq').on(t.applicationId, t.docKey)],
);

/** The application fee: an online order through the institution's own gateway, or a counter payment. */
export const applicationPayments = pgTable(
  'application_payments',
  {
    id: id(),
    tenantId: tenantId(),
    applicationId: uuid('application_id').notNull().references(() => applications.id, { onDelete: 'cascade' }),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    method: paymentMethod('method').notNull(),
    status: paymentStatus('status').notNull(),
    provider: text('provider'),
    providerOrderId: text('provider_order_id'),
    providerPaymentId: text('provider_payment_id'),
    reference: text('reference'),
    receiptNo: text('receipt_no'),
    recordedBy: uuid('recorded_by').references(() => users.id, { onDelete: 'set null' }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('application_payments_order_uq').on(t.providerOrderId), index('application_payments_app_idx').on(t.applicationId)],
);

/** A generated ranking of a cycle's eligible applications; publishing it makes the offers. */
export const meritLists = pgTable(
  'merit_lists',
  {
    id: id(),
    tenantId: tenantId(),
    cycleId: uuid('cycle_id').notNull().references(() => admissionCycles.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    seats: integer('seats').notNull(),
    /** [{ applicationId, rank, score, decision: 'offer' | 'waitlist' }] */
    entries: jsonb('entries').$type<{ applicationId: string; rank: number; score: number; decision: 'offer' | 'waitlist' }[]>().notNull(),
    generatedBy: uuid('generated_by').references(() => users.id, { onDelete: 'set null' }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('merit_lists_version_uq').on(t.cycleId, t.version)],
);

// ---------------------------------------------------------------------------------------------
// Student lifecycle
// ---------------------------------------------------------------------------------------------

export const lifecycleEventKind = pgEnum('lifecycle_event_kind', ['status', 'promotion', 'section', 'guardian']);

/** One bulk promotion run: who ran it, from which classes, and what happened to whom. */
export const promotionBatches = pgTable('promotion_batches', {
  id: id(),
  tenantId: tenantId(),
  label: text('label').notNull(),
  /** { promoted, detained, graduated, skipped, sections: [{ from, to }] } */
  summary: jsonb('summary').$type<Record<string, unknown>>().notNull().default({}),
  runBy: uuid('run_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
});

/**
 * The permanent record of a student's lifecycle: every status change, promotion, section move and
 * guardian link, with the reason and who did it. Rows are only ever added.
 */
export const studentLifecycleEvents = pgTable(
  'student_lifecycle_events',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    kind: lifecycleEventKind('kind').notNull(),
    fromStatus: text('from_status'),
    toStatus: text('to_status'),
    fromSectionId: uuid('from_section_id').references(() => sections.id, { onDelete: 'set null' }),
    toSectionId: uuid('to_section_id').references(() => sections.id, { onDelete: 'set null' }),
    reason: text('reason'),
    effectiveOn: date('effective_on').notNull(),
    batchId: uuid('batch_id').references(() => promotionBatches.id, { onDelete: 'set null' }),
    data: jsonb('data').$type<Record<string, unknown>>(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    /** clock_timestamp(), not now(): events of one transaction keep their order. */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
  },
  (t) => [index('student_lifecycle_events_student_idx').on(t.studentId, t.createdAt)],
);


// ---------------------------------------------------------------------------------------------
// Assessment schemes, exams and results
// ---------------------------------------------------------------------------------------------

export const componentKind = pgEnum('component_kind', ['internal', 'external', 'practical', 'project', 'viva']);

/** A grade scale: bands, how grade points are derived and how many decimals SGPA/CGPA print. */
export const gradeScales = pgTable('grade_scales', {
  id: id(),
  tenantId: tenantId(),
  name: text('name').notNull(),
  /** GradeScaleRules (exams/grading.ts). */
  rules: jsonb('rules').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: createdAt(),
});

/** How one subject is assessed in an academic year: components, weights, credits and pass rules. */
export const assessmentSchemes = pgTable(
  'assessment_schemes',
  {
    id: id(),
    tenantId: tenantId(),
    subjectId: uuid('subject_id').notNull().references(() => subjects.id),
    academicYearId: uuid('academic_year_id').notNull().references(() => academicYears.id),
    name: text('name').notNull(),
    credits: numeric('credits', { precision: 4, scale: 1, mode: 'number' }).notNull(),
    /** PassRules (exams/grading.ts). */
    passRules: jsonb('pass_rules').notNull(),
    gradeScaleId: uuid('grade_scale_id').notNull().references(() => gradeScales.id),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('assessment_schemes_subject_year_uq').on(t.subjectId, t.academicYearId)],
);

export const schemeComponents = pgTable(
  'scheme_components',
  {
    id: id(),
    tenantId: tenantId(),
    schemeId: uuid('scheme_id').notNull().references(() => assessmentSchemes.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    kind: componentKind('kind').notNull(),
    weight: numeric('weight', { precision: 5, scale: 2, mode: 'number' }).notNull(),
    ord: smallint('ord').notNull().default(0),
  },
  (t) => [uniqueIndex('scheme_components_code_uq').on(t.schemeId, t.code)],
);


export const examSessionKind = pgEnum('exam_session_kind', ['regular', 'supplementary']);
export const examSessionStatus = pgEnum('exam_session_status', ['draft', 'scheduled', 'processed', 'published', 'locked']);

/** An examination session ("Semester 3 end exam, Nov 2026") with its schedule, seating and results. */
export const examSessions = pgTable('exam_sessions', {
  id: id(),
  tenantId: tenantId(),
  academicYearId: uuid('academic_year_id').notNull().references(() => academicYears.id),
  programId: uuid('program_id').notNull().references(() => programs.id),
  term: smallint('term').notNull(),
  name: text('name').notNull(),
  kind: examSessionKind('kind').notNull().default('regular'),
  startsOn: date('starts_on').notNull(),
  endsOn: date('ends_on').notNull(),
  status: examSessionStatus('status').notNull().default('draft'),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
});

/** One paper in a session: a subject, its date and slot, the hall and the exam assessment its marks go into. */
export const examPapers = pgTable(
  'exam_papers',
  {
    id: id(),
    tenantId: tenantId(),
    sessionId: uuid('session_id').notNull().references(() => examSessions.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id').notNull().references(() => subjects.id),
    sectionId: uuid('section_id').notNull().references(() => sections.id),
    examDate: date('exam_date').notNull(),
    startsAt: time('starts_at').notNull(),
    endsAt: time('ends_at').notNull(),
    maxMarks: numeric('max_marks', { precision: 6, scale: 2, mode: 'number' }).notNull(),
    /** The assessment (kind exam) that holds the marks; created with the paper. */
    assessmentId: uuid('assessment_id').references(() => assessments.id, { onDelete: 'set null' }),
  },
  (t) => [uniqueIndex('exam_papers_uq').on(t.sessionId, t.subjectId, t.sectionId)],
);

/** A student's seat at a paper. */
export const examSeats = pgTable(
  'exam_seats',
  {
    tenantId: tenantId(),
    paperId: uuid('paper_id').notNull().references(() => examPapers.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id),
    roomId: uuid('room_id').notNull().references(() => rooms.id),
    seatNo: smallint('seat_no').notNull(),
  },
  (t) => [primaryKey({ columns: [t.paperId, t.studentId] }), uniqueIndex('exam_seats_seat_uq').on(t.paperId, t.roomId, t.seatNo)],
);

/** A student's hall ticket for a session; blocked tickets are not issued (detained, dues). */
export const hallTickets = pgTable(
  'hall_tickets',
  {
    tenantId: tenantId(),
    sessionId: uuid('session_id').notNull().references(() => examSessions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id),
    ticketNo: text('ticket_no').notNull(),
    blocked: boolean('blocked').notNull().default(false),
    blockedReason: text('blocked_reason'),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.studentId] }), uniqueIndex('hall_tickets_no_uq').on(t.tenantId, t.ticketNo)],
);

/** A student's processed result for a session. */
export const examResults = pgTable(
  'exam_results',
  {
    id: id(),
    tenantId: tenantId(),
    sessionId: uuid('session_id').notNull().references(() => examSessions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id),
    sgpa: numeric('sgpa', { precision: 5, scale: 2, mode: 'number' }).notNull(),
    cgpa: numeric('cgpa', { precision: 5, scale: 2, mode: 'number' }).notNull(),
    creditsAttempted: numeric('credits_attempted', { precision: 6, scale: 1, mode: 'number' }).notNull(),
    creditsEarned: numeric('credits_earned', { precision: 6, scale: 1, mode: 'number' }).notNull(),
    creditPoints: numeric('credit_points', { precision: 9, scale: 4, mode: 'number' }).notNull(),
    outcome: text('outcome').notNull(),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('exam_results_uq').on(t.sessionId, t.studentId)],
);

export const examResultLines = pgTable(
  'exam_result_lines',
  {
    tenantId: tenantId(),
    resultId: uuid('result_id').notNull().references(() => examResults.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id').notNull().references(() => subjects.id),
    credits: numeric('credits', { precision: 4, scale: 1, mode: 'number' }).notNull(),
    percent: numeric('percent', { precision: 5, scale: 2, mode: 'number' }).notNull(),
    grade: text('grade').notNull(),
    gradePoint: numeric('grade_point', { precision: 4, scale: 2, mode: 'number' }).notNull(),
    passed: boolean('passed').notNull(),
    reasons: jsonb('reasons').notNull().default(sql`'[]'::jsonb`),
    components: jsonb('components').notNull().default(sql`'[]'::jsonb`),
  },
  (t) => [primaryKey({ columns: [t.resultId, t.subjectId] })],
);

export const revaluationStatus = pgEnum('revaluation_status', ['requested', 'accepted', 'rejected', 'completed']);

export const revaluationRequests = pgTable('revaluation_requests', {
  id: id(),
  tenantId: tenantId(),
  sessionId: uuid('session_id').notNull().references(() => examSessions.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => students.id),
  subjectId: uuid('subject_id').notNull().references(() => subjects.id),
  status: revaluationStatus('status').notNull().default('requested'),
  reason: text('reason'),
  previousPercent: numeric('previous_percent', { precision: 5, scale: 2, mode: 'number' }),
  newPercent: numeric('new_percent', { precision: 5, scale: 2, mode: 'number' }),
  decisionNote: text('decision_note'),
  requestedBy: uuid('requested_by').notNull().references(() => users.id),
  decidedBy: uuid('decided_by').references(() => users.id),
  createdAt: createdAt(),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
});


// ---------------------------------------------------------------------------------------------
// OBE / accreditation
// ---------------------------------------------------------------------------------------------

export const outcomeKind = pgEnum('outcome_kind', ['mission', 'vision', 'peo', 'po', 'pso']);
export const coSetStatus = pgEnum('co_set_status', ['draft', 'active', 'retired']);
export const surveyKind = pgEnum('survey_kind', ['course_exit', 'graduate_exit', 'alumni', 'employer']);
export const actionStatus = pgEnum('action_status', ['open', 'in_progress', 'done']);

/** Programme-level statements: mission, vision, PEOs, POs and PSOs. */
export const programOutcomes = pgTable(
  'program_outcomes',
  {
    id: id(),
    tenantId: tenantId(),
    programId: uuid('program_id').notNull().references(() => programs.id, { onDelete: 'cascade' }),
    kind: outcomeKind('kind').notNull(),
    code: text('code').notNull(),
    statement: text('statement').notNull(),
    ord: smallint('ord').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('program_outcomes_code_uq').on(t.programId, t.kind, t.code)],
);

/** Attainment rules for a programme (AttainmentConfig in obe/attainment.ts). */
export const obeConfigs = pgTable('obe_configs', {
  programId: uuid('program_id').primaryKey().references(() => programs.id, { onDelete: 'cascade' }),
  tenantId: tenantId(),
  config: jsonb('config').notNull(),
  updatedBy: uuid('updated_by').notNull().references(() => users.id),
  updatedAt: updatedAt(),
});

/** A version of a subject's course outcomes; only one is active, older ones stay for past results. */
export const coSets = pgTable(
  'co_sets',
  {
    id: id(),
    tenantId: tenantId(),
    subjectId: uuid('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    status: coSetStatus('status').notNull().default('draft'),
    note: text('note'),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: createdAt(),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('co_sets_version_uq').on(t.subjectId, t.version)],
);

export const courseOutcomes = pgTable(
  'course_outcomes',
  {
    id: id(),
    tenantId: tenantId(),
    coSetId: uuid('co_set_id').notNull().references(() => coSets.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    statement: text('statement').notNull(),
    bloomLevel: text('bloom_level'),
    ord: smallint('ord').notNull().default(0),
  },
  (t) => [uniqueIndex('course_outcomes_code_uq').on(t.coSetId, t.code)],
);

/** CO → PO/PSO mapping strength (1 low, 2 medium, 3 high). */
export const coOutcomeMap = pgTable(
  'co_outcome_map',
  {
    tenantId: tenantId(),
    coId: uuid('co_id').notNull().references(() => courseOutcomes.id, { onDelete: 'cascade' }),
    outcomeId: uuid('outcome_id').notNull().references(() => programOutcomes.id, { onDelete: 'cascade' }),
    strength: smallint('strength').notNull(),
  },
  (t) => [primaryKey({ columns: [t.coId, t.outcomeId] })],
);

/** Which share of an assessment's marks evidences a CO. */
export const assessmentCoMap = pgTable(
  'assessment_co_map',
  {
    tenantId: tenantId(),
    assessmentId: uuid('assessment_id').notNull().references(() => assessments.id, { onDelete: 'cascade' }),
    coId: uuid('co_id').notNull().references(() => courseOutcomes.id, { onDelete: 'cascade' }),
    /** Fraction (0–1] of the assessment's marks that test this CO. */
    share: numeric('share', { precision: 4, scale: 3, mode: 'number' }).notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.assessmentId, t.coId] })],
);

/** A survey whose ratings give indirect attainment (course exit, graduate exit, alumni, employer). */
export const obeSurveys = pgTable('obe_surveys', {
  id: id(),
  tenantId: tenantId(),
  programId: uuid('program_id').notNull().references(() => programs.id, { onDelete: 'cascade' }),
  subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'cascade' }),
  academicYearId: uuid('academic_year_id').notNull().references(() => academicYears.id),
  kind: surveyKind('kind').notNull(),
  title: text('title').notNull(),
  scaleMax: smallint('scale_max').notNull().default(5),
  minResponses: smallint('min_responses').notNull().default(5),
  weight: numeric('weight', { precision: 5, scale: 2, mode: 'number' }).notNull().default(1),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
});

/** One rating of a CO (course surveys) or a PO/PSO (programme surveys). */
export const obeSurveyRatings = pgTable('obe_survey_ratings', {
  id: id(),
  tenantId: tenantId(),
  surveyId: uuid('survey_id').notNull().references(() => obeSurveys.id, { onDelete: 'cascade' }),
  coId: uuid('co_id').references(() => courseOutcomes.id, { onDelete: 'cascade' }),
  outcomeId: uuid('outcome_id').references(() => programOutcomes.id, { onDelete: 'cascade' }),
  rating: numeric('rating', { precision: 4, scale: 2, mode: 'number' }).notNull(),
  createdAt: createdAt(),
}, (t) => [index('obe_survey_ratings_survey_idx').on(t.surveyId)]);

/** A saved attainment calculation, kept so trends and accreditation reports stay reproducible. */
export const attainmentSnapshots = pgTable(
  'attainment_snapshots',
  {
    id: id(),
    tenantId: tenantId(),
    programId: uuid('program_id').notNull().references(() => programs.id, { onDelete: 'cascade' }),
    academicYearId: uuid('academic_year_id').notNull().references(() => academicYears.id),
    /** 'co' (target is a course outcome) or 'po' (a PO/PSO). */
    scope: text('scope').notNull(),
    targetId: uuid('target_id').notNull(),
    code: text('code').notNull(),
    subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'cascade' }),
    direct: numeric('direct', { precision: 5, scale: 2, mode: 'number' }),
    indirect: numeric('indirect', { precision: 5, scale: 2, mode: 'number' }),
    combined: numeric('combined', { precision: 5, scale: 2, mode: 'number' }),
    target: numeric('target', { precision: 5, scale: 2, mode: 'number' }).notNull(),
    gap: numeric('gap', { precision: 5, scale: 2, mode: 'number' }),
    met: boolean('met').notNull(),
    detail: jsonb('detail').notNull().default(sql`'{}'::jsonb`),
    computedBy: uuid('computed_by').notNull().references(() => users.id),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('attainment_snapshots_idx').on(t.programId, t.academicYearId, t.scope)],
);

export const improvementActions = pgTable('improvement_actions', {
  id: id(),
  tenantId: tenantId(),
  programId: uuid('program_id').notNull().references(() => programs.id, { onDelete: 'cascade' }),
  scope: text('scope').notNull(),
  targetId: uuid('target_id').notNull(),
  title: text('title').notNull(),
  detail: text('detail'),
  ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
  dueOn: date('due_on'),
  status: actionStatus('status').notNull().default('open'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
});

/** Evidence for accreditation: a link or note tied to a CO, PO/PSO or an improvement action. */
export const obeEvidence = pgTable('obe_evidence', {
  id: id(),
  tenantId: tenantId(),
  programId: uuid('program_id').notNull().references(() => programs.id, { onDelete: 'cascade' }),
  scope: text('scope').notNull(),
  targetId: uuid('target_id').notNull(),
  title: text('title').notNull(),
  url: text('url'),
  note: text('note'),
  uploadedBy: uuid('uploaded_by').notNull().references(() => users.id),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------------------------
// HR (docs/architecture/hr-payroll.md)
// ---------------------------------------------------------------------------------------------

export const designations = pgTable(
  'designations',
  {
    id: id(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    grade: text('grade'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('designations_name_uq').on(t.tenantId, t.name)],
);

/**
 * The employment record of a staff user. The bank account number is encrypted at rest with the
 * same SecretBox as the Razorpay secrets; only the last four digits are kept in clear.
 */
export const staffProfiles = pgTable(
  'staff_profiles',
  {
    userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
    tenantId: tenantId(),
    employeeCode: text('employee_code').notNull(),
    departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
    designationId: uuid('designation_id').references(() => designations.id, { onDelete: 'set null' }),
    employmentType: text('employment_type').notNull().default('permanent'),
    dateOfJoining: date('date_of_joining'),
    dateOfLeaving: date('date_of_leaving'),
    status: text('status').notNull().default('active'),
    gender: text('gender'),
    dateOfBirth: date('date_of_birth'),
    pan: text('pan'),
    uan: text('uan'),
    esiNumber: text('esi_number'),
    taxRegime: text('tax_regime').notNull().default('new'),
    tax80cPaise: bigint('tax_80c_paise', { mode: 'number' }).notNull().default(0),
    taxOtherDeductionsPaise: bigint('tax_other_deductions_paise', { mode: 'number' }).notNull().default(0),
    pfEnabled: boolean('pf_enabled').notNull().default(true),
    esiEnabled: boolean('esi_enabled').notNull().default(false),
    ptEnabled: boolean('pt_enabled').notNull().default(true),
    bankAccountHolder: text('bank_account_holder'),
    bankName: text('bank_name'),
    bankIfsc: text('bank_ifsc'),
    /** AES-256-GCM (common/secret-box.ts), bound to "<tenantId>:staff.<userId>.bank_account". */
    bankAccountEnc: text('bank_account_enc'),
    bankAccountLast4: text('bank_account_last4'),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('staff_profiles_code_uq').on(t.tenantId, t.employeeCode), index('staff_profiles_dept_idx').on(t.departmentId)],
);

/** One row per staff member per day. Manual entries overwrite app and biometric ones. */
export const staffAttendance = pgTable(
  'staff_attendance',
  {
    tenantId: tenantId(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    status: text('status').notNull(), // present | absent | half_day | on_leave
    checkInAt: timestamp('check_in_at', { withTimezone: true }),
    checkOutAt: timestamp('check_out_at', { withTimezone: true }),
    source: text('source').notNull(), // app | manual | biometric
    note: text('note'),
    markedBy: uuid('marked_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.date] }), index('staff_attendance_date_idx').on(t.tenantId, t.date)],
);

export const leaveTypes = pgTable(
  'leave_types',
  {
    id: id(),
    tenantId: tenantId(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    paid: boolean('paid').notNull().default(true),
    annualDays: numeric('annual_days', { precision: 5, scale: 1, mode: 'number' }).notNull().default(0),
    accrual: text('accrual').notNull().default('yearly'), // yearly | monthly
    carryForwardMax: numeric('carry_forward_max', { precision: 5, scale: 1, mode: 'number' }).notNull().default(0),
    active: boolean('active').notNull().default(true),
  },
  (t) => [uniqueIndex('leave_types_code_uq').on(t.tenantId, t.code)],
);

/** Days carried into a year; accrual and use are derived (no per-month rows to keep in step). */
export const leaveBalances = pgTable(
  'leave_balances',
  {
    tenantId: tenantId(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    leaveTypeId: uuid('leave_type_id').notNull().references(() => leaveTypes.id, { onDelete: 'cascade' }),
    year: smallint('year').notNull(),
    opening: numeric('opening', { precision: 5, scale: 1, mode: 'number' }).notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.leaveTypeId, t.year] })],
);

export const leaveRequests = pgTable(
  'leave_requests',
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    leaveTypeId: uuid('leave_type_id').notNull().references(() => leaveTypes.id),
    fromDate: date('from_date').notNull(),
    toDate: date('to_date').notNull(),
    halfDay: boolean('half_day').notNull().default(false),
    days: numeric('days', { precision: 5, scale: 1, mode: 'number' }).notNull(),
    reason: text('reason').notNull().default(''),
    status: text('status').notNull().default('pending'), // pending | approved | rejected | cancelled
    decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionNote: text('decision_note'),
    createdAt: createdAt(),
  },
  (t) => [index('leave_requests_user_idx').on(t.userId, t.fromDate), index('leave_requests_status_idx').on(t.tenantId, t.status)],
);

export const jobOpenings = pgTable('job_openings', {
  id: id(),
  tenantId: tenantId(),
  title: text('title').notNull(),
  departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
  designationId: uuid('designation_id').references(() => designations.id, { onDelete: 'set null' }),
  positions: smallint('positions').notNull().default(1),
  description: text('description').notNull().default(''),
  status: text('status').notNull().default('open'), // open | on_hold | closed
  closesOn: date('closes_on'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
});

export const jobApplicants = pgTable(
  'job_applicants',
  {
    id: id(),
    tenantId: tenantId(),
    openingId: uuid('opening_id').notNull().references(() => jobOpenings.id, { onDelete: 'cascade' }),
    fullName: text('full_name').notNull(),
    email: text('email'),
    phone: text('phone'),
    notes: text('notes').notNull().default(''),
    stage: text('stage').notNull().default('applied'),
    stageHistory: jsonb('stage_history').$type<{ stage: string; at: string; by: string; note?: string }[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [index('job_applicants_opening_idx').on(t.openingId, t.stage)],
);

// ---------------------------------------------------------------------------------------------
// Payroll. Amounts are integer paise.
// ---------------------------------------------------------------------------------------------

export const salaryComponents = pgTable(
  'salary_components',
  {
    id: id(),
    tenantId: tenantId(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    kind: text('kind').notNull(), // earning | deduction
    pfWage: boolean('pf_wage').notNull().default(false),
    taxable: boolean('taxable').notNull().default(true),
    active: boolean('active').notNull().default(true),
    sortOrder: smallint('sort_order').notNull().default(0),
  },
  (t) => [uniqueIndex('salary_components_code_uq').on(t.tenantId, t.code)],
);

/** A salary structure is effective from a date; a revision is a new row, history is kept. */
export const salaryStructures = pgTable(
  'salary_structures',
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    effectiveFrom: date('effective_from').notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('salary_structures_uq').on(t.userId, t.effectiveFrom)],
);

export const salaryStructureLines = pgTable(
  'salary_structure_lines',
  {
    tenantId: tenantId(),
    structureId: uuid('structure_id').notNull().references(() => salaryStructures.id, { onDelete: 'cascade' }),
    componentId: uuid('component_id').notNull().references(() => salaryComponents.id),
    monthlyPaise: bigint('monthly_paise', { mode: 'number' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.structureId, t.componentId] })],
);

export const payrollSettings = pgTable('payroll_settings', {
  tenantId: tenantId().primaryKey(),
  pfCapAtCeiling: boolean('pf_cap_at_ceiling').notNull().default(true),
  pfWageCeilingPaise: bigint('pf_wage_ceiling_paise', { mode: 'number' }).notNull().default(1_500_000),
  esiGrossLimitPaise: bigint('esi_gross_limit_paise', { mode: 'number' }).notNull().default(2_100_000),
  ptState: text('pt_state').notNull().default('Karnataka'),
  ptSlabs: jsonb('pt_slabs').notNull(),
  weeklyOffs: jsonb('weekly_offs').$type<number[]>().notNull().default([0]),
  ledgers: jsonb('ledgers').notNull(),
  updatedAt: updatedAt(),
});

export const payrollRuns = pgTable(
  'payroll_runs',
  {
    id: id(),
    tenantId: tenantId(),
    month: text('month').notNull(), // YYYY-MM
    status: text('status').notNull().default('draft'), // draft | approved | locked
    version: integer('version').notNull().default(1),
    skipped: jsonb('skipped').$type<{ userId: string; fullName: string; reason: string }[]>().notNull().default([]),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    lockedBy: uuid('locked_by').references(() => users.id, { onDelete: 'set null' }),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('payroll_runs_month_uq').on(t.tenantId, t.month)],
);

/** One payslip per staff member per run; `data` is the full computed payslip (the record once locked). */
export const payslips = pgTable(
  'payslips',
  {
    id: id(),
    tenantId: tenantId(),
    runId: uuid('run_id').notNull().references(() => payrollRuns.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id),
    grossPaise: bigint('gross_paise', { mode: 'number' }).notNull(),
    deductionsPaise: bigint('deductions_paise', { mode: 'number' }).notNull(),
    netPaise: bigint('net_paise', { mode: 'number' }).notNull(),
    employerCostPaise: bigint('employer_cost_paise', { mode: 'number' }).notNull(),
    taxableGrossPaise: bigint('taxable_gross_paise', { mode: 'number' }).notNull(),
    ptPaise: bigint('pt_paise', { mode: 'number' }).notNull(),
    employeePfPaise: bigint('employee_pf_paise', { mode: 'number' }).notNull(),
    tdsPaise: bigint('tds_paise', { mode: 'number' }).notNull(),
    data: jsonb('data').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('payslips_run_user_uq').on(t.runId, t.userId), index('payslips_user_idx').on(t.userId)],
);

// ---------------------------------------------------------------------------------------------
// Documents and certificates (docs/architecture/documents-certificates.md)
// ---------------------------------------------------------------------------------------------

export const certificateTemplates = pgTable(
  'certificate_templates',
  {
    id: id(),
    tenantId: tenantId(),
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    subjectType: text('subject_type').notNull(), // student | staff
    title: text('title').notNull(),
    body: text('body').notNull(),
    fields: jsonb('fields').$type<{ key: string; label: string; required: boolean }[]>().notNull().default([]),
    serialPrefix: text('serial_prefix').notNull(),
    active: boolean('active').notNull().default(true),
    version: integer('version').notNull().default(1),
    updatedAt: updatedAt(),
  },
  (t) => [index('certificate_templates_kind_idx').on(t.tenantId, t.kind)],
);

/** Serial numbers run per institution, prefix and financial year; the row lock keeps them unique. */
export const certificateCounters = pgTable(
  'certificate_counters',
  {
    tenantId: tenantId(),
    prefix: text('prefix').notNull(),
    financialYear: text('financial_year').notNull(),
    lastNo: integer('last_no').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.prefix, t.financialYear] })],
);

/** A certificate request and, once issued, the certificate itself (text frozen at issue). */
export const certificates = pgTable(
  'certificates',
  {
    id: id(),
    tenantId: tenantId(),
    templateId: uuid('template_id').notNull().references(() => certificateTemplates.id),
    subjectType: text('subject_type').notNull(),
    studentId: uuid('student_id').references(() => students.id),
    staffUserId: uuid('staff_user_id').references(() => users.id),
    purpose: text('purpose').notNull().default(''),
    fields: jsonb('fields').$type<Record<string, string>>().notNull().default({}),
    status: text('status').notNull().default('requested'), // requested | approved | rejected | issued | revoked
    requestedBy: uuid('requested_by').notNull().references(() => users.id),
    decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionNote: text('decision_note'),
    serialNo: text('serial_no'),
    issuedBy: uuid('issued_by').references(() => users.id, { onDelete: 'set null' }),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    renderedTitle: text('rendered_title'),
    renderedBody: text('rendered_body'),
    verifyToken: text('verify_token'),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedBy: uuid('revoked_by').references(() => users.id, { onDelete: 'set null' }),
    revokedReason: text('revoked_reason'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('certificates_serial_uq').on(t.tenantId, t.serialNo),
    uniqueIndex('certificates_token_uq').on(t.verifyToken),
    index('certificates_status_idx').on(t.tenantId, t.status),
  ],
);

/** Files kept per student or staff member; the bytes live in object storage. */
export const vaultDocuments = pgTable(
  'vault_documents',
  {
    id: id(),
    tenantId: tenantId(),
    ownerType: text('owner_type').notNull(), // student | staff
    studentId: uuid('student_id').references(() => students.id),
    staffUserId: uuid('staff_user_id').references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    category: text('category').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    storageKey: text('storage_key').notNull(),
    version: integer('version').notNull().default(1),
    replacesId: uuid('replaces_id'),
    visibility: text('visibility').notNull().default('staff'), // staff | owner
    expiresOn: date('expires_on'),
    /** Virus scan state (common/upload-scan.ts): 'clean' unless scanning is on and the file is still waiting; only clean files download. */
    scanStatus: text('scan_status').notNull().default('clean'),
    uploadedBy: uuid('uploaded_by').notNull().references(() => users.id),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('vault_documents_student_idx').on(t.studentId), index('vault_documents_staff_idx').on(t.staffUserId), index('vault_documents_expiry_idx').on(t.tenantId, t.expiresOn)],
);

export const TENANT_TABLES = [
  'campuses',
  'users',
  'user_roles',
  'academic_years',
  'academic_terms',
  'programs',
  'sections',
  'subjects',
  'departments',
  'department_staff',
  'students',
  'rooms',
  'timetable_slots',
  'devices',
  'pairing_codes',
  'device_profiles',
  'otp_codes',
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
  'payment_gateway_accounts',
  'library_books',
  'library_loans',
  'assessments',
  'marks',
  'conversations',
  'messages',
  'calendar_events',
  'topic_coverage',
  'homework_submissions',
  'consents',
  'year_plans',
  'year_plan_items',
  'lesson_plans',
  'answer_cards',
  'polls',
  'poll_responses',
  'badges',
  'enquiries',
  'enquiry_activities',
  'admission_cycles',
  'applications',
  'application_documents',
  'application_payments',
  'merit_lists',
  'promotion_batches',
  'student_lifecycle_events',
  'grade_scales',
  'assessment_schemes',
  'scheme_components',
  'exam_sessions',
  'exam_papers',
  'exam_seats',
  'hall_tickets',
  'exam_results',
  'exam_result_lines',
  'revaluation_requests',
  'program_outcomes',
  'obe_configs',
  'co_sets',
  'course_outcomes',
  'co_outcome_map',
  'assessment_co_map',
  'obe_surveys',
  'obe_survey_ratings',
  'attainment_snapshots',
  'improvement_actions',
  'obe_evidence',
  'concept_videos',
  'audit_log',
  'transport_vehicles',
  'transport_drivers',
  'transport_routes',
  'transport_stops',
  'transport_assignments',
  'transport_trips',
  'transport_trip_events',
  'hostel_blocks',
  'hostel_rooms',
  'hostel_beds',
  'hostel_allotments',
  'hostel_gate_passes',
  'hostel_visitors',
  'hostel_complaints',
  'mess_plans',
  'mess_subscriptions',
  'mess_menu',
  'canteen_items',
  'canteen_wallets',
  'canteen_wallet_txns',
  'inv_stores',
  'inv_items',
  'inv_stock',
  'inv_stock_moves',
  'inv_vendors',
  'inv_requisitions',
  'inv_requisition_lines',
  'inv_purchase_orders',
  'inv_po_lines',
  'inv_goods_receipts',
  'inv_goods_receipt_lines',
  'inv_invoices',
  'assets',
  'asset_allocations',
  'asset_maintenance',
  'doc_counters',
  // Phase 00 foundation and analytics (schema-foundation.ts)
  'user_mfa',
  'user_sessions',
  'tenant_security_policies',
  'feature_flags',
  'domain_events',
  'upload_scans',
  'report_schedules',
  'report_runs',
  'device_actions',
  'cast_sessions',
  'designations',
  'staff_profiles',
  'staff_attendance',
  'leave_types',
  'leave_balances',
  'leave_requests',
  'job_openings',
  'job_applicants',
  'salary_components',
  'salary_structures',
  'salary_structure_lines',
  'payroll_settings',
  'payroll_runs',
  'payslips',
  'certificate_templates',
  'certificate_counters',
  'certificates',
  'vault_documents',
  // Placements, research and welfare (migrations 0068-0074).
  'placement_companies',
  'placement_drives',
  'drive_registrations',
  'drive_rounds',
  'round_results',
  'placement_offers',
  'internships',
  'internship_diary',
  'alumni_profiles',
  'alumni_events',
  'alumni_event_rsvps',
  'mentoring_requests',
  'research_proposals',
  'research_projects',
  'project_members',
  'project_milestones',
  'research_scholars',
  'publications',
  'research_grants',
  'grant_expenses',
  'conferences',
  'patents',
  'grievance_tickets',
  'grievance_events',
  'discipline_incidents',
  'discipline_actions',
  'discipline_appeals',
  'counselling_sessions',
  'welfare_requests',
] as const;

// ---------------------------------------------------------------------------------------------
// Transport (migration 0060)
// ---------------------------------------------------------------------------------------------

export const transportVehicles = pgTable(
  'transport_vehicles',
  {
    id: id(),
    tenantId: tenantId(),
    regNo: text('reg_no').notNull(),
    model: text('model').notNull().default(''),
    capacity: integer('capacity').notNull(),
    status: text('status').notNull().default('active'),
    insuranceExpiresOn: date('insurance_expires_on'),
    fitnessExpiresOn: date('fitness_expires_on'),
    pucExpiresOn: date('puc_expires_on'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('transport_vehicles_reg_uq').on(t.tenantId, t.regNo)],
);

/** Drivers and conductors; a driver with a login (`userId`) can run trips from the Teacher App. */
export const transportDrivers = pgTable('transport_drivers', {
  id: id(),
  tenantId: tenantId(),
  userId: uuid('user_id').references(() => users.id),
  fullName: text('full_name').notNull(),
  phone: text('phone').notNull().default(''),
  role: text('role').notNull().default('driver'),
  licenseNo: text('license_no'),
  licenseExpiresOn: date('license_expires_on'),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
});

export const transportRoutes = pgTable(
  'transport_routes',
  {
    id: id(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    vehicleId: uuid('vehicle_id').references(() => transportVehicles.id),
    driverId: uuid('driver_id').references(() => transportDrivers.id),
    monthlyFeePaise: integer('monthly_fee_paise').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('transport_routes_name_uq').on(t.tenantId, t.name)],
);

export const transportStops = pgTable(
  'transport_stops',
  {
    id: id(),
    tenantId: tenantId(),
    routeId: uuid('route_id').notNull().references(() => transportRoutes.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    seq: integer('seq').notNull(),
    lat: numeric('lat', { precision: 9, scale: 6, mode: 'number' }).notNull(),
    lng: numeric('lng', { precision: 9, scale: 6, mode: 'number' }).notNull(),
    pickupTime: text('pickup_time'),
  },
  (t) => [uniqueIndex('transport_stops_seq_uq').on(t.routeId, t.seq)],
);

/** A student's seat: one active assignment per student. */
export const transportAssignments = pgTable(
  'transport_assignments',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: uuid('student_id').notNull().references(() => students.id),
    routeId: uuid('route_id').notNull().references(() => transportRoutes.id),
    stopId: uuid('stop_id').notNull().references(() => transportStops.id),
    startsOn: date('starts_on').notNull(),
    endedOn: date('ended_on'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('transport_assignments_active_uq').on(t.studentId).where(sql`ended_on is null`), index('transport_assignments_route_idx').on(t.routeId)],
);

/** One run of a route by a driver. `lastStopSeq` is the last stop reached (0 = none yet). */
export const transportTrips = pgTable(
  'transport_trips',
  {
    id: id(),
    tenantId: tenantId(),
    routeId: uuid('route_id').notNull().references(() => transportRoutes.id),
    driverUserId: uuid('driver_user_id').notNull().references(() => users.id),
    direction: text('direction').notNull(),
    status: text('status').notNull().default('running'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    lastStopSeq: integer('last_stop_seq').notNull().default(0),
    lastLat: numeric('last_lat', { precision: 9, scale: 6, mode: 'number' }),
    lastLng: numeric('last_lng', { precision: 9, scale: 6, mode: 'number' }),
    lastSpeedKmh: numeric('last_speed_kmh', { precision: 6, scale: 1, mode: 'number' }),
    lastPingAt: timestamp('last_ping_at', { withTimezone: true }),
    pings: integer('pings').notNull().default(0),
  },
  (t) => [index('transport_trips_route_idx').on(t.routeId, t.startedAt)],
);

/** The trip log: started, each stop reached, ended. */
export const transportTripEvents = pgTable(
  'transport_trip_events',
  {
    id: id(),
    tenantId: tenantId(),
    tripId: uuid('trip_id').notNull().references(() => transportTrips.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    stopId: uuid('stop_id').references(() => transportStops.id),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('transport_trip_events_trip_idx').on(t.tripId, t.at)],
);

// ---------------------------------------------------------------------------------------------
// Hostel and canteen (migrations 0061, 0062)
// ---------------------------------------------------------------------------------------------

export const hostelBlocks = pgTable(
  'hostel_blocks',
  { id: id(), tenantId: tenantId(), name: text('name').notNull(), gender: text('gender').notNull().default('mixed'), createdAt: createdAt() },
  (t) => [uniqueIndex('hostel_blocks_name_uq').on(t.tenantId, t.name)],
);

export const hostelRooms = pgTable(
  'hostel_rooms',
  {
    id: id(),
    tenantId: tenantId(),
    blockId: uuid('block_id').notNull().references(() => hostelBlocks.id, { onDelete: 'cascade' }),
    number: text('number').notNull(),
    floor: integer('floor').notNull().default(0),
    monthlyFeePaise: integer('monthly_fee_paise').notNull().default(0),
  },
  (t) => [uniqueIndex('hostel_rooms_number_uq').on(t.blockId, t.number)],
);

export const hostelBeds = pgTable(
  'hostel_beds',
  {
    id: id(),
    tenantId: tenantId(),
    roomId: uuid('room_id').notNull().references(() => hostelRooms.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
  },
  (t) => [uniqueIndex('hostel_beds_label_uq').on(t.roomId, t.label)],
);

/** A student's bed: one active allotment per student and per bed. */
export const hostelAllotments = pgTable(
  'hostel_allotments',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: uuid('student_id').notNull().references(() => students.id),
    bedId: uuid('bed_id').notNull().references(() => hostelBeds.id),
    startsOn: date('starts_on').notNull(),
    vacatedOn: date('vacated_on'),
    createdBy: uuid('created_by').notNull().references(() => users.id),
  },
  (t) => [
    uniqueIndex('hostel_allotments_student_uq').on(t.studentId).where(sql`vacated_on is null`),
    uniqueIndex('hostel_allotments_bed_uq').on(t.bedId).where(sql`vacated_on is null`),
  ],
);

/** Out-pass: issued, then `out` at the gate, then `returned`. Families are told at each gate event. */
export const hostelGatePasses = pgTable(
  'hostel_gate_passes',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: uuid('student_id').notNull().references(() => students.id),
    reason: text('reason').notNull(),
    destination: text('destination').notNull().default(''),
    expectedBackAt: timestamp('expected_back_at', { withTimezone: true }).notNull(),
    status: text('status').notNull().default('issued'),
    outAt: timestamp('out_at', { withTimezone: true }),
    inAt: timestamp('in_at', { withTimezone: true }),
    issuedBy: uuid('issued_by').notNull().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index('hostel_gate_passes_student_idx').on(t.studentId, t.createdAt)],
);

export const hostelVisitors = pgTable(
  'hostel_visitors',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: uuid('student_id').notNull().references(() => students.id),
    visitorName: text('visitor_name').notNull(),
    relation: text('relation').notNull().default(''),
    phone: text('phone').notNull().default(''),
    idProof: text('id_proof').notNull().default(''),
    inAt: timestamp('in_at', { withTimezone: true }).notNull().defaultNow(),
    outAt: timestamp('out_at', { withTimezone: true }),
    loggedBy: uuid('logged_by').notNull().references(() => users.id),
  },
  (t) => [index('hostel_visitors_student_idx').on(t.studentId, t.inAt)],
);

export const hostelComplaints = pgTable(
  'hostel_complaints',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: uuid('student_id').references(() => students.id),
    roomId: uuid('room_id').references(() => hostelRooms.id),
    raisedBy: uuid('raised_by').notNull().references(() => users.id),
    category: text('category').notNull(),
    description: text('description').notNull(),
    status: text('status').notNull().default('open'),
    resolution: text('resolution'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('hostel_complaints_status_idx').on(t.status, t.createdAt)],
);

export const messPlans = pgTable(
  'mess_plans',
  { id: id(), tenantId: tenantId(), name: text('name').notNull(), monthlyFeePaise: integer('monthly_fee_paise').notNull(), meals: jsonb('meals').$type<string[]>().notNull().default([]), active: boolean('active').notNull().default(true) },
  (t) => [uniqueIndex('mess_plans_name_uq').on(t.tenantId, t.name)],
);

export const messSubscriptions = pgTable(
  'mess_subscriptions',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: uuid('student_id').notNull().references(() => students.id),
    planId: uuid('plan_id').notNull().references(() => messPlans.id),
    startsOn: date('starts_on').notNull(),
    endedOn: date('ended_on'),
  },
  (t) => [uniqueIndex('mess_subscriptions_active_uq').on(t.studentId).where(sql`ended_on is null`)],
);

/** The weekly mess menu: one row per weekday (0 = Sunday) and meal. */
export const messMenu = pgTable(
  'mess_menu',
  { id: id(), tenantId: tenantId(), dayOfWeek: smallint('day_of_week').notNull(), meal: text('meal').notNull(), items: text('items').notNull() },
  (t) => [uniqueIndex('mess_menu_slot_uq').on(t.tenantId, t.dayOfWeek, t.meal)],
);

export const canteenItems = pgTable(
  'canteen_items',
  { id: id(), tenantId: tenantId(), name: text('name').notNull(), pricePaise: integer('price_paise').notNull(), available: boolean('available').notNull().default(true) },
  (t) => [uniqueIndex('canteen_items_name_uq').on(t.tenantId, t.name)],
);

export const canteenWallets = pgTable(
  'canteen_wallets',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: uuid('student_id').notNull().references(() => students.id),
    balancePaise: integer('balance_paise').notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('canteen_wallets_student_uq').on(t.studentId)],
);

/** Wallet ledger: top-ups (+) and orders (−). `idempotencyKey` makes retries safe. */
export const canteenWalletTxns = pgTable(
  'canteen_wallet_txns',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: uuid('student_id').notNull().references(() => students.id),
    deltaPaise: integer('delta_paise').notNull(),
    kind: text('kind').notNull(),
    items: jsonb('items').$type<{ itemId: string; name: string; qty: number; pricePaise: number }[]>(),
    idempotencyKey: text('idempotency_key'),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('canteen_txn_key_uq').on(t.tenantId, t.idempotencyKey), index('canteen_txn_student_idx').on(t.studentId, t.createdAt)],
);

// ---------------------------------------------------------------------------------------------
// Inventory, procurement and assets (migrations 0063, 0064)
// ---------------------------------------------------------------------------------------------

export const invStores = pgTable('inv_stores', { id: id(), tenantId: tenantId(), name: text('name').notNull(), location: text('location').notNull().default('') }, (t) => [uniqueIndex('inv_stores_name_uq').on(t.tenantId, t.name)]);

export const invItems = pgTable(
  'inv_items',
  {
    id: id(),
    tenantId: tenantId(),
    sku: text('sku').notNull(),
    name: text('name').notNull(),
    category: text('category').notNull().default('general'),
    unit: text('unit').notNull().default('nos'),
    reorderLevel: integer('reorder_level').notNull().default(0),
    active: boolean('active').notNull().default(true),
  },
  (t) => [uniqueIndex('inv_items_sku_uq').on(t.tenantId, t.sku)],
);

/** On-hand quantity per store and item; every change is also a row in `inv_stock_moves`. */
export const invStock = pgTable(
  'inv_stock',
  {
    id: id(),
    tenantId: tenantId(),
    storeId: uuid('store_id').notNull().references(() => invStores.id),
    itemId: uuid('item_id').notNull().references(() => invItems.id),
    qty: integer('qty').notNull().default(0),
  },
  (t) => [uniqueIndex('inv_stock_uq').on(t.storeId, t.itemId)],
);

export const invStockMoves = pgTable(
  'inv_stock_moves',
  {
    id: id(),
    tenantId: tenantId(),
    storeId: uuid('store_id').notNull().references(() => invStores.id),
    itemId: uuid('item_id').notNull().references(() => invItems.id),
    delta: integer('delta').notNull(),
    kind: text('kind').notNull(),
    refType: text('ref_type'),
    refId: uuid('ref_id'),
    issuedTo: text('issued_to'),
    note: text('note').notNull().default(''),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index('inv_stock_moves_item_idx').on(t.itemId, t.createdAt)],
);

export const invVendors = pgTable(
  'inv_vendors',
  { id: id(), tenantId: tenantId(), name: text('name').notNull(), gstin: text('gstin'), phone: text('phone').notNull().default(''), email: text('email'), active: boolean('active').notNull().default(true) },
  (t) => [uniqueIndex('inv_vendors_name_uq').on(t.tenantId, t.name)],
);

export const invRequisitions = pgTable(
  'inv_requisitions',
  {
    id: id(),
    tenantId: tenantId(),
    number: text('number').notNull(),
    requestedBy: uuid('requested_by').notNull().references(() => users.id),
    reason: text('reason').notNull().default(''),
    /** submitted, approved, rejected, ordered */
    status: text('status').notNull().default('submitted'),
    decidedBy: uuid('decided_by').references(() => users.id),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionNote: text('decision_note'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('inv_requisitions_number_uq').on(t.tenantId, t.number)],
);

export const invRequisitionLines = pgTable('inv_requisition_lines', {
  id: id(),
  tenantId: tenantId(),
  requisitionId: uuid('requisition_id').notNull().references(() => invRequisitions.id, { onDelete: 'cascade' }),
  itemId: uuid('item_id').notNull().references(() => invItems.id),
  qty: integer('qty').notNull(),
});

export const invPurchaseOrders = pgTable(
  'inv_purchase_orders',
  {
    id: id(),
    tenantId: tenantId(),
    number: text('number').notNull(),
    requisitionId: uuid('requisition_id').references(() => invRequisitions.id),
    vendorId: uuid('vendor_id').notNull().references(() => invVendors.id),
    storeId: uuid('store_id').notNull().references(() => invStores.id),
    /** issued, partially_received, received, cancelled */
    status: text('status').notNull().default('issued'),
    totalPaise: bigint('total_paise', { mode: 'number' }).notNull(),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('inv_po_number_uq').on(t.tenantId, t.number)],
);

export const invPoLines = pgTable('inv_po_lines', {
  id: id(),
  tenantId: tenantId(),
  poId: uuid('po_id').notNull().references(() => invPurchaseOrders.id, { onDelete: 'cascade' }),
  itemId: uuid('item_id').notNull().references(() => invItems.id),
  qty: integer('qty').notNull(),
  unitPricePaise: integer('unit_price_paise').notNull(),
  receivedQty: integer('received_qty').notNull().default(0),
});

export const invGoodsReceipts = pgTable('inv_goods_receipts', {
  id: id(),
  tenantId: tenantId(),
  poId: uuid('po_id').notNull().references(() => invPurchaseOrders.id),
  receivedBy: uuid('received_by').notNull().references(() => users.id),
  note: text('note').notNull().default(''),
  /** Receipts retried with the same key are applied once. */
  idempotencyKey: text('idempotency_key'),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('inv_grn_key_uq').on(t.tenantId, t.idempotencyKey)]);

export const invGoodsReceiptLines = pgTable('inv_goods_receipt_lines', {
  id: id(),
  tenantId: tenantId(),
  receiptId: uuid('receipt_id').notNull().references(() => invGoodsReceipts.id, { onDelete: 'cascade' }),
  poLineId: uuid('po_line_id').notNull().references(() => invPoLines.id),
  qty: integer('qty').notNull(),
});

/** A vendor's invoice, matched to the PO and what was actually received (three-way match). */
export const invInvoices = pgTable(
  'inv_invoices',
  {
    id: id(),
    tenantId: tenantId(),
    poId: uuid('po_id').notNull().references(() => invPurchaseOrders.id),
    vendorId: uuid('vendor_id').notNull().references(() => invVendors.id),
    invoiceNo: text('invoice_no').notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    expectedPaise: bigint('expected_paise', { mode: 'number' }).notNull(),
    /** matched, mismatch, approved (a mismatch accepted by an approver), paid */
    status: text('status').notNull(),
    note: text('note'),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('inv_invoices_vendor_no_uq').on(t.tenantId, t.vendorId, t.invoiceNo)],
);

export const assets = pgTable(
  'assets',
  {
    id: id(),
    tenantId: tenantId(),
    /** Printed on the QR label. */
    tag: text('tag').notNull(),
    name: text('name').notNull(),
    category: text('category').notNull().default('general'),
    location: text('location').notNull().default(''),
    purchasedOn: date('purchased_on').notNull(),
    costPaise: bigint('cost_paise', { mode: 'number' }).notNull(),
    salvagePaise: bigint('salvage_paise', { mode: 'number' }).notNull().default(0),
    usefulLifeYears: integer('useful_life_years').notNull(),
    /** slm = straight line; wdv = written-down value at `wdvRatePct` a year */
    method: text('method').notNull().default('slm'),
    wdvRatePct: numeric('wdv_rate_pct', { precision: 5, scale: 2, mode: 'number' }),
    /** active, in_maintenance, disposed */
    status: text('status').notNull().default('active'),
    disposedOn: date('disposed_on'),
    disposalPaise: bigint('disposal_paise', { mode: 'number' }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('assets_tag_uq').on(t.tenantId, t.tag)],
);

export const assetAllocations = pgTable(
  'asset_allocations',
  {
    id: id(),
    tenantId: tenantId(),
    assetId: uuid('asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
    assignedTo: text('assigned_to').notNull(),
    userId: uuid('user_id').references(() => users.id),
    allocatedOn: date('allocated_on').notNull(),
    returnedOn: date('returned_on'),
  },
  (t) => [uniqueIndex('asset_allocations_active_uq').on(t.assetId).where(sql`returned_on is null`)],
);

export const assetMaintenance = pgTable('asset_maintenance', {
  id: id(),
  tenantId: tenantId(),
  assetId: uuid('asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  description: text('description').notNull().default(''),
  costPaise: bigint('cost_paise', { mode: 'number' }).notNull().default(0),
  doneOn: date('done_on').notNull(),
  nextDueOn: date('next_due_on'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
});

/** Counters for numbered documents (REQ, PO, AST) per tenant. */
export const docCounters = pgTable('doc_counters', { tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }), kind: text('kind').notNull(), lastNo: integer('last_no').notNull().default(0) }, (t) => [primaryKey({ columns: [t.tenantId, t.kind] })]);

// ---------------------------------------------------------------------------------------------
// Placements, internships and alumni (migrations 0068-0070)
// ---------------------------------------------------------------------------------------------

const ref = (name: string, t: () => AnyPgColumn) => uuid(name).references(t);
const money = (name: string) => numeric(name, { precision: 6, scale: 2, mode: 'number' });

export const placementCompanies = pgTable('placement_companies', {
  id: id(),
  tenantId: tenantId(),
  name: text('name').notNull(),
  sector: text('sector').notNull().default(''),
  website: text('website'),
  contactName: text('contact_name'),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  status: text('status').notNull().default('active'), // active | blacklisted
  createdAt: createdAt(),
});

export const placementDrives = pgTable('placement_drives', {
  id: id(),
  tenantId: tenantId(),
  companyId: uuid('company_id').notNull().references(() => placementCompanies.id),
  title: text('title').notNull(),
  kind: text('kind').notNull().default('placement'), // placement | internship
  roleTitle: text('role_title').notNull(),
  ctcLpa: money('ctc_lpa'),
  stipendMonthly: integer('stipend_monthly'),
  location: text('location').notNull().default(''),
  description: text('description').notNull().default(''),
  driveDate: date('drive_date'),
  registrationClosesOn: date('registration_closes_on'),
  minCgpa: numeric('min_cgpa', { precision: 4, scale: 2, mode: 'number' }).notNull().default(0),
  maxBacklogs: smallint('max_backlogs').notNull().default(0),
  /** Empty = open to every programme. */
  programIds: uuid('program_ids').array().notNull().default(sql`'{}'::uuid[]`),
  status: text('status').notNull().default('draft'), // draft | open | closed | completed | cancelled
  version: integer('version').notNull().default(0),
  createdBy: ref('created_by', () => users.id),
  createdAt: createdAt(),
});

export const driveRegistrations = pgTable('drive_registrations', {
  id: id(),
  tenantId: tenantId(),
  driveId: uuid('drive_id').notNull().references(() => placementDrives.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => students.id),
  status: text('status').notNull().default('registered'), // registered | shortlisted | rejected | selected | withdrawn
  cgpaAt: numeric('cgpa_at', { precision: 4, scale: 2, mode: 'number' }).notNull(),
  backlogsAt: smallint('backlogs_at').notNull(),
  createdAt: createdAt(),
});

export const driveRounds = pgTable('drive_rounds', {
  id: id(),
  tenantId: tenantId(),
  driveId: uuid('drive_id').notNull().references(() => placementDrives.id, { onDelete: 'cascade' }),
  seq: smallint('seq').notNull(),
  name: text('name').notNull(),
  kind: text('kind').notNull().default('interview'),
  scheduledOn: date('scheduled_on'),
});

export const roundResults = pgTable(
  'round_results',
  {
    tenantId: tenantId(),
    roundId: uuid('round_id').notNull().references(() => driveRounds.id, { onDelete: 'cascade' }),
    registrationId: uuid('registration_id').notNull().references(() => driveRegistrations.id, { onDelete: 'cascade' }),
    result: text('result').notNull(), // pass | fail | absent
    note: text('note').notNull().default(''),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.roundId, t.registrationId] })],
);

export const placementOffers = pgTable('placement_offers', {
  id: id(),
  tenantId: tenantId(),
  driveId: uuid('drive_id').notNull().references(() => placementDrives.id, { onDelete: 'cascade' }),
  registrationId: uuid('registration_id').notNull().references(() => driveRegistrations.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => students.id),
  roleTitle: text('role_title').notNull(),
  ctcLpa: money('ctc_lpa'),
  status: text('status').notNull().default('offered'), // offered | accepted | declined | withdrawn | expired
  offeredOn: date('offered_on').notNull(),
  respondBy: date('respond_by'),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  declineReason: text('decline_reason'),
  createdAt: createdAt(),
});

export const internships = pgTable('internships', {
  id: id(),
  tenantId: tenantId(),
  studentId: uuid('student_id').notNull().references(() => students.id),
  companyId: ref('company_id', () => placementCompanies.id),
  orgName: text('org_name').notNull(),
  title: text('title').notNull(),
  startsOn: date('starts_on').notNull(),
  endsOn: date('ends_on').notNull(),
  stipendMonthly: integer('stipend_monthly'),
  mentorUserId: ref('mentor_user_id', () => users.id),
  industryMentor: text('industry_mentor'),
  status: text('status').notNull().default('proposed'), // proposed | approved | ongoing | completed | cancelled
  evaluationScore: numeric('evaluation_score', { precision: 5, scale: 2, mode: 'number' }),
  evaluationRemarks: text('evaluation_remarks'),
  evaluatedBy: ref('evaluated_by', () => users.id),
  employerFeedback: text('employer_feedback'),
  version: integer('version').notNull().default(0),
  createdAt: createdAt(),
});

export const internshipDiary = pgTable('internship_diary', {
  id: id(),
  tenantId: tenantId(),
  internshipId: uuid('internship_id').notNull().references(() => internships.id, { onDelete: 'cascade' }),
  entryDate: date('entry_date').notNull(),
  entry: text('entry').notNull(),
  evidenceRef: text('evidence_ref'),
  createdAt: createdAt(),
});

export const alumniProfiles = pgTable('alumni_profiles', {
  id: id(),
  tenantId: tenantId(),
  studentId: ref('student_id', () => students.id),
  fullName: text('full_name').notNull(),
  graduationYear: smallint('graduation_year').notNull(),
  program: text('program').notNull().default(''),
  email: text('email'),
  phone: text('phone'),
  employer: text('employer'),
  designation: text('designation'),
  city: text('city'),
  bio: text('bio').notNull().default(''),
  /** Consent: only profiles with this set are shown to students in the directory. */
  directoryVisible: boolean('directory_visible').notNull().default(false),
  mentorAvailable: boolean('mentor_available').notNull().default(false),
  createdAt: createdAt(),
});

export const alumniEvents = pgTable('alumni_events', {
  id: id(),
  tenantId: tenantId(),
  title: text('title').notNull(),
  startsOn: date('starts_on').notNull(),
  venue: text('venue').notNull().default(''),
  description: text('description').notNull().default(''),
  status: text('status').notNull().default('scheduled'),
  createdBy: ref('created_by', () => users.id),
  createdAt: createdAt(),
});

export const alumniEventRsvps = pgTable(
  'alumni_event_rsvps',
  {
    tenantId: tenantId(),
    eventId: uuid('event_id').notNull().references(() => alumniEvents.id, { onDelete: 'cascade' }),
    alumniId: uuid('alumni_id').notNull().references(() => alumniProfiles.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.alumniId] })],
);

export const mentoringRequests = pgTable('mentoring_requests', {
  id: id(),
  tenantId: tenantId(),
  studentId: uuid('student_id').notNull().references(() => students.id),
  alumniId: uuid('alumni_id').notNull().references(() => alumniProfiles.id, { onDelete: 'cascade' }),
  topic: text('topic').notNull(),
  message: text('message').notNull().default(''),
  status: text('status').notNull().default('pending'), // pending | accepted | declined | completed
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------------------------
// Research and projects (migrations 0071-0072)
// ---------------------------------------------------------------------------------------------

export const researchProposals = pgTable('research_proposals', {
  id: id(),
  tenantId: tenantId(),
  title: text('title').notNull(),
  abstract: text('abstract').notNull().default(''),
  kind: text('kind').notNull().default('research'), // research | capstone | industry
  piUserId: uuid('pi_user_id').notNull().references(() => users.id),
  departmentId: ref('department_id', () => departments.id),
  sponsorOrg: text('sponsor_org'),
  fundingSoughtPaise: bigint('funding_sought_paise', { mode: 'number' }).notNull().default(0),
  ethicsRequired: boolean('ethics_required').notNull().default(false),
  ethicsStatus: text('ethics_status').notNull().default('not_required'), // not_required | pending | cleared | rejected
  ethicsRef: text('ethics_ref'),
  status: text('status').notNull().default('draft'), // draft | submitted | under_review | approved | rejected | withdrawn
  reviewNote: text('review_note'),
  decidedBy: ref('decided_by', () => users.id),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  version: integer('version').notNull().default(0),
  createdAt: createdAt(),
});

export const researchProjects = pgTable('research_projects', {
  id: id(),
  tenantId: tenantId(),
  proposalId: ref('proposal_id', () => researchProposals.id),
  code: text('code').notNull(),
  title: text('title').notNull(),
  kind: text('kind').notNull().default('research'),
  piUserId: uuid('pi_user_id').notNull().references(() => users.id),
  departmentId: ref('department_id', () => departments.id),
  sponsorOrg: text('sponsor_org'),
  startsOn: date('starts_on').notNull(),
  endsOn: date('ends_on'),
  status: text('status').notNull().default('active'), // active | on_hold | completed | cancelled
  outcomeSummary: text('outcome_summary'),
  version: integer('version').notNull().default(0),
  createdAt: createdAt(),
});

export const projectMembers = pgTable('project_members', {
  id: id(),
  tenantId: tenantId(),
  projectId: uuid('project_id').notNull().references(() => researchProjects.id, { onDelete: 'cascade' }),
  userId: ref('user_id', () => users.id),
  studentId: ref('student_id', () => students.id),
  role: text('role').notNull(), // supervisor | co_supervisor | member | student
  createdAt: createdAt(),
});

export const projectMilestones = pgTable('project_milestones', {
  id: id(),
  tenantId: tenantId(),
  projectId: uuid('project_id').notNull().references(() => researchProjects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  dueOn: date('due_on').notNull(),
  completedOn: date('completed_on'),
  evidenceRef: text('evidence_ref'),
  createdAt: createdAt(),
});

export const researchScholars = pgTable('research_scholars', {
  id: id(),
  tenantId: tenantId(),
  studentId: ref('student_id', () => students.id),
  fullName: text('full_name').notNull(),
  programme: text('programme').notNull(), // phd | mphil
  supervisorUserId: uuid('supervisor_user_id').notNull().references(() => users.id),
  projectId: ref('project_id', () => researchProjects.id),
  enrolledOn: date('enrolled_on').notNull(),
  thesisTitle: text('thesis_title'),
  status: text('status').notNull().default('enrolled'), // enrolled | thesis_submitted | awarded | withdrawn
  completedOn: date('completed_on'),
  createdAt: createdAt(),
});

export const publications = pgTable('publications', {
  id: id(),
  tenantId: tenantId(),
  projectId: ref('project_id', () => researchProjects.id),
  ownerUserId: uuid('owner_user_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  kind: text('kind').notNull().default('journal'), // journal | conference | book | book_chapter
  venue: text('venue').notNull(),
  year: smallint('year').notNull(),
  doi: text('doi'),
  issn: text('issn'),
  indexedIn: text('indexed_in').array().notNull().default(sql`'{}'::text[]`),
  authors: jsonb('authors').notNull().default(sql`'[]'::jsonb`),
  createdAt: createdAt(),
});

export const researchGrants = pgTable('research_grants', {
  id: id(),
  tenantId: tenantId(),
  projectId: uuid('project_id').notNull().references(() => researchProjects.id, { onDelete: 'cascade' }),
  agency: text('agency').notNull(),
  scheme: text('scheme').notNull().default(''),
  sanctionRef: text('sanction_ref'),
  sanctionedPaise: bigint('sanctioned_paise', { mode: 'number' }).notNull(),
  startsOn: date('starts_on').notNull(),
  endsOn: date('ends_on').notNull(),
  status: text('status').notNull().default('active'), // active | closed | cancelled
  createdAt: createdAt(),
});

export const grantExpenses = pgTable('grant_expenses', {
  id: id(),
  tenantId: tenantId(),
  grantId: uuid('grant_id').notNull().references(() => researchGrants.id, { onDelete: 'cascade' }),
  head: text('head').notNull(),
  amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
  spentOn: date('spent_on').notNull(),
  description: text('description').notNull().default(''),
  voucherRef: text('voucher_ref'),
  createdBy: ref('created_by', () => users.id),
  createdAt: createdAt(),
});

export const conferences = pgTable('conferences', {
  id: id(),
  tenantId: tenantId(),
  name: text('name').notNull(),
  role: text('role').notNull(), // attended | presented | organised
  level: text('level').notNull().default('national'), // institutional | national | international
  heldOn: date('held_on').notNull(),
  location: text('location').notNull().default(''),
  userId: uuid('user_id').notNull().references(() => users.id),
  paperTitle: text('paper_title'),
  publicationId: ref('publication_id', () => publications.id),
  createdAt: createdAt(),
});

export const patents = pgTable('patents', {
  id: id(),
  tenantId: tenantId(),
  projectId: ref('project_id', () => researchProjects.id),
  ownerUserId: uuid('owner_user_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  kind: text('kind').notNull().default('patent'), // patent | copyright | design | trademark
  inventors: jsonb('inventors').notNull().default(sql`'[]'::jsonb`),
  applicationNo: text('application_no'),
  filedOn: date('filed_on'),
  status: text('status').notNull().default('filed'), // draft | filed | published | granted | rejected
  grantedOn: date('granted_on'),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------------------------
// Grievance, discipline, counselling and welfare (migrations 0073-0074)
// ---------------------------------------------------------------------------------------------

export const grievanceTickets = pgTable('grievance_tickets', {
  id: id(),
  tenantId: tenantId(),
  ticketNo: text('ticket_no').notNull(),
  category: text('category').notNull(),
  severity: text('severity').notNull().default('medium'), // low | medium | high | critical
  subject: text('subject').notNull(),
  description: text('description').notNull(),
  /** Hidden from every staff view; the reporter still sees and follows their own ticket. */
  anonymous: boolean('anonymous').notNull().default(false),
  /** Set for ragging, ICC and POSH matters: visible only to the committee (and the reporter). */
  committee: text('committee'), // anti_ragging | icc | posh
  committeeStage: text('committee_stage'),
  raisedBy: uuid('raised_by').notNull().references(() => users.id),
  studentId: ref('student_id', () => students.id),
  status: text('status').notNull().default('open'),
  assigneeUserId: ref('assignee_user_id', () => users.id),
  slaDueAt: timestamp('sla_due_at', { withTimezone: true }).notNull(),
  escalationLevel: smallint('escalation_level').notNull().default(0),
  escalatedAt: timestamp('escalated_at', { withTimezone: true }),
  resolution: text('resolution'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  rating: smallint('rating'),
  ratingComment: text('rating_comment'),
  version: integer('version').notNull().default(0),
  createdAt: createdAt(),
});

export const grievanceEvents = pgTable('grievance_events', {
  id: id(),
  tenantId: tenantId(),
  ticketId: uuid('ticket_id').notNull().references(() => grievanceTickets.id, { onDelete: 'cascade' }),
  actorUserId: ref('actor_user_id', () => users.id),
  actorRole: text('actor_role').notNull(),
  kind: text('kind').notNull(),
  visibility: text('visibility').notNull().default('public'), // public | internal
  body: text('body').notNull().default(''),
  createdAt: createdAt(),
});

export const disciplineIncidents = pgTable('discipline_incidents', {
  id: id(),
  tenantId: tenantId(),
  studentId: uuid('student_id').notNull().references(() => students.id),
  incidentOn: date('incident_on').notNull(),
  kind: text('kind').notNull(),
  severity: text('severity').notNull().default('minor'), // minor | major | severe
  description: text('description').notNull(),
  reportedBy: uuid('reported_by').notNull().references(() => users.id),
  grievanceId: ref('grievance_id', () => grievanceTickets.id),
  status: text('status').notNull().default('reported'), // reported | under_review | action_taken | appealed | closed
  version: integer('version').notNull().default(0),
  createdAt: createdAt(),
});

export const disciplineActions = pgTable('discipline_actions', {
  id: id(),
  tenantId: tenantId(),
  incidentId: uuid('incident_id').notNull().references(() => disciplineIncidents.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),
  detail: text('detail').notNull().default(''),
  startsOn: date('starts_on'),
  endsOn: date('ends_on'),
  finePaise: bigint('fine_paise', { mode: 'number' }),
  status: text('status').notNull().default('active'), // active | revoked | reduced
  decidedBy: uuid('decided_by').notNull().references(() => users.id),
  createdAt: createdAt(),
});

export const disciplineAppeals = pgTable('discipline_appeals', {
  id: id(),
  tenantId: tenantId(),
  incidentId: uuid('incident_id').notNull().references(() => disciplineIncidents.id, { onDelete: 'cascade' }),
  actionId: uuid('action_id').notNull().references(() => disciplineActions.id, { onDelete: 'cascade' }),
  appellantUserId: uuid('appellant_user_id').notNull().references(() => users.id),
  grounds: text('grounds').notNull(),
  status: text('status').notNull().default('pending'), // pending | upheld | reduced | revoked
  decisionNote: text('decision_note'),
  decidedBy: ref('decided_by', () => users.id),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export const counsellingSessions = pgTable('counselling_sessions', {
  id: id(),
  tenantId: tenantId(),
  studentId: uuid('student_id').notNull().references(() => students.id),
  counsellorUserId: ref('counsellor_user_id', () => users.id),
  requestedBy: uuid('requested_by').notNull().references(() => users.id),
  reason: text('reason').notNull().default(''),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  status: text('status').notNull().default('requested'), // requested | scheduled | completed | cancelled | no_show
  /** Readable only by the counsellor who holds the session. Never returned by any other endpoint. */
  confidentialNotes: text('confidential_notes'),
  createdAt: createdAt(),
});

export const welfareRequests = pgTable('welfare_requests', {
  id: id(),
  tenantId: tenantId(),
  studentId: uuid('student_id').notNull().references(() => students.id),
  requestedBy: uuid('requested_by').notNull().references(() => users.id),
  kind: text('kind').notNull(), // scholarship | fee_waiver | medical_aid | hardship | other
  title: text('title').notNull(),
  details: text('details').notNull().default(''),
  amountRequestedPaise: bigint('amount_requested_paise', { mode: 'number' }).notNull().default(0),
  status: text('status').notNull().default('submitted'), // submitted | under_review | approved | rejected | disbursed | withdrawn
  amountApprovedPaise: bigint('amount_approved_paise', { mode: 'number' }),
  decisionNote: text('decision_note'),
  decidedBy: ref('decided_by', () => users.id),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  disbursedOn: date('disbursed_on'),
  version: integer('version').notNull().default(0),
  createdAt: createdAt(),
});
