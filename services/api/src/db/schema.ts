/**
 * KINETIX core schema.
 *
 * Every table except `tenants` carries `tenant_id`. Row-level security policies live in the
 * hand-written migration `migrations/0001_rls.sql` (Drizzle cannot express FORCE RLS).
 */
import { sql } from 'drizzle-orm';
import {
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
    status: text('status').notNull().default('active'),
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
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('guardians_user_student_uq').on(t.userId, t.studentId), index('guardians_student_idx').on(t.studentId)],
);

export const notificationKind = pgEnum('notification_kind', ['absence', 'homework', 'broadcast', 'board_shared', 'recording', 'fee', 'library', 'marks', 'message', 'live', 'calendar', 'badge']);

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
  'concept_videos',
  'audit_log',
] as const;
