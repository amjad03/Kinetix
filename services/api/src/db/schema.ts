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
    preferredLanguage: language('preferred_language').notNull().default('en'),
    status: userStatus('status').notNull().default('active'),
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
});

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
  'audit_log',
] as const;
