// Integrations (migration 0129): DigiLocker/NAD/ABC, live devices, LTI/SCORM, API tokens, embeddings and early alerts.
// Kept apart from schema.ts, which these tables reference.
import { sql } from 'drizzle-orm';
import { boolean, customType, date, integer, jsonb, numeric, pgTable, primaryKey, real, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { courses, students, tenants, transportRoutes, users } from './schema.js';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });
const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });
const realArray = (name: string) => real(name).array();

export const integrationSettings = pgTable('integration_settings', {
  id: id(), tenantId: tenantId(), key: text('key').notNull(), value: jsonb('value').$type<Record<string, unknown>>().notNull().default({}), updatedAt: ts('updated_at').notNull().defaultNow(),
});
export const studentAcademicIds = pgTable('student_academic_ids', {
  id: id(), tenantId: tenantId(), studentId: uuid('student_id').notNull().references(() => students.id), apaarId: text('apaar_id'), abcId: text('abc_id'),
  source: text('source').notNull().default('admission'), capturedBy: uuid('captured_by').references(() => users.id), capturedAt: ts('captured_at').notNull().defaultNow(),
});
export const integrationExports = pgTable('integration_exports', {
  id: id(), tenantId: tenantId(), kind: text('kind').notNull(), ref: text('ref').notNull(), rows: integer('rows').notNull().default(0), status: text('status').notNull().default('built'),
  content: text('content').notNull().default(''), error: text('error'), createdBy: uuid('created_by').references(() => users.id), createdAt: createdAt(), sentAt: ts('sent_at'),
});
export const dlDocuments = pgTable('dl_documents', {
  id: id(), tenantId: tenantId(), studentId: uuid('student_id').notNull().references(() => students.id), docType: text('doc_type').notNull(), title: text('title').notNull(), docRef: text('doc_ref').notNull(),
  uri: text('uri'), status: text('status').notNull().default('pending'), sha256: text('sha256'), signature: text('signature'), error: text('error'), attempts: integer('attempts').notNull().default(0),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}), nadExportId: uuid('nad_export_id').references(() => integrationExports.id, { onDelete: 'set null' }),
  issuedAt: ts('issued_at'), createdBy: uuid('created_by').references(() => users.id), createdAt: createdAt(),
});
export const accessDevices = pgTable('access_devices', {
  id: id(), tenantId: tenantId(), kind: text('kind').notNull(), vendor: text('vendor').notNull(), serial: text('serial').notNull(), name: text('name').notNull(), purpose: text('purpose').notNull(),
  location: text('location').notNull().default(''), config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}), keyHash: text('key_hash').notNull(), active: boolean('active').notNull().default(true),
  lastSeenAt: ts('last_seen_at'), createdBy: uuid('created_by').notNull().references(() => users.id), createdAt: createdAt(),
});
export const credentialTags = pgTable('credential_tags', {
  id: id(), tenantId: tenantId(), kind: text('kind').notNull(), value: text('value').notNull(), subjectType: text('subject_type').notNull(), subjectId: uuid('subject_id').notNull(), active: boolean('active').notNull().default(true), createdAt: createdAt(),
});
export const deviceEvents = pgTable('device_events', {
  id: id(), tenantId: tenantId(), deviceId: uuid('device_id').notNull().references(() => accessDevices.id, { onDelete: 'cascade' }), tagKind: text('tag_kind').notNull(), tagValue: text('tag_value').notNull(),
  eventAt: timestamp('event_at', { withTimezone: true }).notNull(), direction: text('direction').notNull().default('in'), outcome: text('outcome').notNull(),
  detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default({}), subjectType: text('subject_type'), subjectId: uuid('subject_id'), createdAt: createdAt(),
});
export const transportBoardings = pgTable('transport_boardings', {
  id: id(), tenantId: tenantId(), studentId: uuid('student_id').notNull().references(() => students.id), routeId: uuid('route_id').references(() => transportRoutes.id),
  deviceId: uuid('device_id').references(() => accessDevices.id, { onDelete: 'set null' }), boardedAt: timestamp('boarded_at', { withTimezone: true }).notNull(), onDate: date('on_date').notNull(),
});
export const apiTokens = pgTable('api_tokens', {
  id: id(), tenantId: tenantId(), name: text('name').notNull(), scopes: text('scopes').array().notNull(), secretHash: text('secret_hash').notNull(), createdBy: uuid('created_by').notNull().references(() => users.id),
  revokedAt: ts('revoked_at'), lastUsedAt: ts('last_used_at'), createdAt: createdAt(),
});
export const ltiTools = pgTable('lti_tools', {
  id: id(), tenantId: tenantId(), name: text('name').notNull(), clientId: text('client_id').notNull(), loginUrl: text('login_url').notNull(), launchUrl: text('launch_url').notNull(), jwksUrl: text('jwks_url'),
  deploymentId: text('deployment_id').notNull().default('1'), active: boolean('active').notNull().default(true), createdAt: createdAt(),
});
export const ltiPlatforms = pgTable('lti_platforms', {
  id: id(), tenantId: tenantId(), name: text('name').notNull(), issuer: text('issuer').notNull(), clientId: text('client_id').notNull(), authUrl: text('auth_url').notNull(), jwksUrl: text('jwks_url').notNull(),
  deploymentId: text('deployment_id').notNull().default('1'), active: boolean('active').notNull().default(true), createdAt: createdAt(),
});
export const ltiStates = pgTable('lti_states', {
  id: id(), tenantId: tenantId(), kind: text('kind').notNull(), state: text('state').notNull(), nonce: text('nonce').notNull(), ref: jsonb('ref').$type<Record<string, unknown>>().notNull().default({}),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), usedAt: ts('used_at'),
});
export const scormPackages = pgTable('scorm_packages', {
  id: id(), tenantId: tenantId(), courseId: uuid('course_id').references(() => courses.id, { onDelete: 'set null' }), title: text('title').notNull(), version: text('version').notNull(), launchHref: text('launch_href').notNull(),
  manifest: jsonb('manifest').$type<Record<string, unknown>>().notNull().default({}), fileCount: integer('file_count').notNull().default(0), createdBy: uuid('created_by').notNull().references(() => users.id), createdAt: createdAt(),
});
export const scormFiles = pgTable('scorm_files', {
  tenantId: tenantId(), packageId: uuid('package_id').notNull().references(() => scormPackages.id, { onDelete: 'cascade' }), path: text('path').notNull(), mime: text('mime').notNull(), content: bytea('content').notNull(),
}, (t) => [primaryKey({ columns: [t.packageId, t.path] })]);
export const scormAttempts = pgTable('scorm_attempts', {
  id: id(), tenantId: tenantId(), packageId: uuid('package_id').notNull().references(() => scormPackages.id, { onDelete: 'cascade' }), userId: uuid('user_id').notNull().references(() => users.id),
  cmi: jsonb('cmi').$type<Record<string, string>>().notNull().default({}), lessonStatus: text('lesson_status').notNull().default('not attempted'), scoreRaw: numeric('score_raw', { mode: 'number' }),
  totalTime: text('total_time').notNull().default(''), updatedAt: ts('updated_at').notNull().defaultNow(),
});
export const contentEmbeddings = pgTable('content_embeddings', {
  id: id(), tenantId: tenantId(), sourceType: text('source_type').notNull(), sourceId: uuid('source_id').notNull(), provider: text('provider').notNull(), dims: integer('dims').notNull(),
  vec: realArray('vec').notNull(), label: text('label').notNull().default(''), textHash: text('text_hash').notNull(), createdAt: createdAt(),
});
export const earlyAlertFlags = pgTable('early_alert_flags', {
  id: id(), tenantId: tenantId(), studentId: uuid('student_id').notNull().references(() => students.id), level: text('level').notNull(), score: integer('score').notNull(),
  reasons: jsonb('reasons').$type<{ signal: string; detail: string; points: number }[]>().notNull().default([]), status: text('status').notNull().default('open'),
  mentorUserId: uuid('mentor_user_id').references(() => users.id), computedAt: ts('computed_at').notNull().defaultNow(), resolvedAt: ts('resolved_at'),
});
export const earlyAlertInterventions = pgTable('early_alert_interventions', {
  id: id(), tenantId: tenantId(), flagId: uuid('flag_id').notNull().references(() => earlyAlertFlags.id, { onDelete: 'cascade' }), studentId: uuid('student_id').notNull().references(() => students.id),
  byUserId: uuid('by_user_id').notNull().references(() => users.id), action: text('action').notNull(), note: text('note').notNull().default(''), dueOn: date('due_on'), outcome: text('outcome'), createdAt: createdAt(),
});
