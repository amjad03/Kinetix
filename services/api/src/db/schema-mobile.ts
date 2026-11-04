// Mobile apps pass (migrations 0220 and 0221): app versions per platform, crash reports, and each person's own
// notification settings.
import { sql } from 'drizzle-orm';
import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { tenants, users } from './schema.js';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);

export const MOBILE_APPS = ['teacher', 'student', 'parent', 'board'] as const;
export type MobileApp = (typeof MOBILE_APPS)[number];
export const APP_PLATFORMS = ['android', 'ios', 'windows'] as const;

/** The oldest version that may still sign in (older ones must update) and the newest one in the stores. Global. */
export const appReleases = pgTable(
  'app_releases',
  {
    id: id(),
    app: text('app').$type<MobileApp>().notNull(),
    platform: text('platform').$type<(typeof APP_PLATFORMS)[number]>().notNull(),
    minVersion: text('min_version').notNull().default('0.0.0'),
    latestVersion: text('latest_version').notNull().default('0.0.0'),
    storeUrl: text('store_url').notNull().default(''),
    /** Shown with the update prompt (English; the apps add their own translated words around it). */
    message: text('message').notNull().default(''),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('app_releases_app_platform_uq').on(t.app, t.platform)],
);

/** A crash in an app, scrubbed of personal data, one row per fingerprint and version. Global. */
export const clientErrorReports = pgTable(
  'client_error_reports',
  {
    id: id(),
    app: text('app').$type<MobileApp>().notNull(),
    platform: text('platform').notNull(),
    appVersion: text('app_version').notNull(),
    osVersion: text('os_version').notNull().default(''),
    kind: text('kind').$type<'flutter' | 'platform' | 'zone' | 'isolate'>().notNull(),
    fatal: boolean('fatal').notNull().default(false),
    message: text('message').notNull(),
    stack: text('stack').notNull().default(''),
    fingerprint: text('fingerprint').notNull(),
    tenantSlug: text('tenant_slug').notNull().default(''),
    occurrences: integer('occurrences').notNull().default(1),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('client_error_reports_fp_uq').on(t.fingerprint, t.appVersion), index('client_error_reports_recent_idx').on(t.app, t.lastSeenAt)],
);

/** One person's notification settings: kinds without a push, and quiet hours ("22:00"–"06:30", institution time). */
export const userNotificationPrefs = pgTable(
  'user_notification_prefs',
  {
    id: id(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    pushOff: text('push_off').array().notNull().default(sql`'{}'::text[]`),
    quietStart: text('quiet_start'),
    quietEnd: text('quiet_end'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('user_notification_prefs_user_uq').on(t.userId)],
);
