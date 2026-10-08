// Phase 00 foundation and analytics tables (migrations 0076-0085). Kept apart from schema.ts, which they reference.
import { sql } from 'drizzle-orm';
import { bigint, boolean, date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { boardSessions, devices, students, tenants, users } from './schema.js';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

/** A staff member's TOTP authenticator. `confirmedAt` null = enrolment started but not verified. */
export const userMfa = pgTable('user_mfa', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  tenantId: tenantId(),
  /** AES-GCM (common/secret-box.ts), bound to "<tenantId>:mfa.<userId>". */
  secretEnc: text('secret_enc').notNull(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  /** SHA-256 hex of each unused backup code. */
  backupCodes: jsonb('backup_codes').$type<string[]>().notNull().default([]),
  /** The last accepted 30-second TOTP step, so a code cannot be replayed. */
  lastStep: bigint('last_step', { mode: 'number' }).notNull().default(0),
  createdAt: createdAt(),
});

/** A signed-in browser or app; the token's `sid` points here, so it can be signed out remotely. */
export const userSessions = pgTable(
  'user_sessions',
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    label: text('label').notNull().default(''),
    ip: text('ip'),
    userAgent: text('user_agent'),
    mfaVerified: boolean('mfa_verified').notNull().default(false),
    createdAt: createdAt(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('user_sessions_user_idx').on(t.userId, t.revokedAt)],
);

export const tenantSecurityPolicies = pgTable('tenant_security_policies', {
  tenantId: uuid('tenant_id').primaryKey().references(() => tenants.id, { onDelete: 'cascade' }),
  /** Roles that must sign in with a second factor. */
  mfaRequiredRoles: jsonb('mfa_required_roles').$type<string[]>().notNull().default([]),
  updatedBy: uuid('updated_by'),
  updatedAt: updatedAt(),
});

export const featureFlags = pgTable(
  'feature_flags',
  {
    tenantId: tenantId(),
    key: text('key').notNull(),
    enabled: boolean('enabled').notNull(),
    updatedBy: uuid('updated_by'),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.key] })],
);

/** The transactional outbox: written in the same transaction as the change it announces. */
export const domainEvents = pgTable(
  'domain_events',
  {
    id: id(),
    tenantId: tenantId(),
    type: text('type').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: uuid('aggregate_id'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    actorId: uuid('actor_id'),
    createdAt: createdAt(),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    lastError: text('last_error'),
  },
  (t) => [index('domain_events_tenant_idx').on(t.tenantId, t.type, t.createdAt)],
);

export const eventConsumptions = pgTable(
  'event_consumptions',
  {
    consumer: text('consumer').notNull(),
    eventId: uuid('event_id').notNull().references(() => domainEvents.id, { onDelete: 'cascade' }),
    processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.consumer, t.eventId] })],
);

export const uploadScans = pgTable(
  'upload_scans',
  {
    id: id(),
    tenantId: tenantId(),
    subjectType: text('subject_type').notNull(),
    subjectId: uuid('subject_id').notNull(),
    storageKey: text('storage_key').notNull(),
    status: text('status').notNull().default('pending'), // pending | clean | infected | error
    signature: text('signature'),
    attempts: integer('attempts').notNull().default(0),
    scannedAt: timestamp('scanned_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('upload_scans_subject_uq').on(t.subjectType, t.subjectId)],
);

/** Rights metadata on a global library item; an item without a row is unrestricted. */
export const contentLicenses = pgTable(
  'content_licenses',
  {
    id: id(),
    contentType: text('content_type').notNull(), // course | topic | concept_video
    contentId: uuid('content_id').notNull(),
    rightsHolder: text('rights_holder').notNull(),
    licence: text('licence').notNull(),
    expiresOn: date('expires_on'),
    /** Empty = every institution. */
    allowedTenants: uuid('allowed_tenants').array().notNull().default(sql`'{}'::uuid[]`),
    notes: text('notes').notNull().default(''),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('content_licenses_content_uq').on(t.contentType, t.contentId)],
);

export const reportSchedules = pgTable('report_schedules', {
  id: id(),
  tenantId: tenantId(),
  reportKey: text('report_key').notNull(),
  params: jsonb('params').$type<Record<string, string>>().notNull().default({}),
  frequency: text('frequency').notNull(), // daily | weekly | monthly
  format: text('format').notNull().default('csv'), // csv | pdf
  recipients: jsonb('recipients').$type<string[]>().notNull().default([]),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }).notNull(),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  active: boolean('active').notNull().default(true),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
});

export const reportRuns = pgTable(
  'report_runs',
  {
    id: id(),
    tenantId: tenantId(),
    scheduleId: uuid('schedule_id').references(() => reportSchedules.id, { onDelete: 'set null' }),
    reportKey: text('report_key').notNull(),
    params: jsonb('params').$type<Record<string, string>>().notNull().default({}),
    format: text('format').notNull(),
    rowCount: integer('row_count').notNull().default(0),
    status: text('status').notNull(), // ok | failed
    deliveredTo: jsonb('delivered_to').$type<string[]>().notNull().default([]),
    error: text('error'),
    requestedBy: uuid('requested_by'),
    createdAt: createdAt(),
  },
  (t) => [index('report_runs_tenant_idx').on(t.tenantId, t.createdAt)],
);

export const placementRecords = pgTable(
  'placement_records',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    company: text('company').notNull(),
    role: text('role').notNull().default(''),
    packagePaise: bigint('package_paise', { mode: 'number' }).notNull().default(0),
    offeredOn: date('offered_on').notNull(),
    status: text('status').notNull().default('offered'), // offered | joined | declined
    createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [index('placement_records_tenant_idx').on(t.tenantId, t.offeredOn)],
);

export const researchOutputs = pgTable(
  'research_outputs',
  {
    id: id(),
    tenantId: tenantId(),
    staffUserId: uuid('staff_user_id').references(() => users.id, { onDelete: 'set null' }),
    kind: text('kind').notNull(), // paper | book | patent | project | conference
    title: text('title').notNull(),
    venue: text('venue').notNull().default(''),
    publishedOn: date('published_on').notNull(),
    grantPaise: bigint('grant_paise', { mode: 'number' }).notNull().default(0),
    createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [index('research_outputs_tenant_idx').on(t.tenantId, t.publishedOn)],
);

/** A remote action IT sent to a board (lock, restart…). The audit trail of the device console. */
export const deviceActions = pgTable(
  'device_actions',
  {
    id: id(),
    tenantId: tenantId(),
    deviceId: uuid('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    params: jsonb('params').$type<Record<string, unknown>>().notNull().default({}),
    status: text('status').notNull().default('queued'), // queued | sent | done | failed
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
    error: text('error'),
    createdAt: createdAt(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    doneAt: timestamp('done_at', { withTimezone: true }),
  },
  (t) => [index('device_actions_device_idx').on(t.deviceId, t.createdAt)],
);

/** A phone or laptop casting its screen to a board during a class. */
export const castSessions = pgTable(
  'cast_sessions',
  {
    id: id(),
    tenantId: tenantId(),
    deviceId: uuid('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }),
    boardSessionId: uuid('board_session_id').notNull().references(() => boardSessions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    senderName: text('sender_name').notNull(),
    senderRole: text('sender_role').notNull(), // teacher | student
    state: text('state').notNull().default('pending'), // pending | active | ended
    endReason: text('end_reason'),
    createdAt: createdAt(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (t) => [index('cast_sessions_device_idx').on(t.deviceId, t.state)],
);
