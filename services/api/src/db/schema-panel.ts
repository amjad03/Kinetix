// Zynetix panel platform (migration 0144): OTA releases and rollouts, and the panel home's apps.
import { sql } from 'drizzle-orm';
import { bigint, boolean, index, integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { devices, tenants, users } from './schema.js';

export const RELEASE_PLATFORMS = ['android', 'windows', 'macos', 'linux'] as const;
export type ReleasePlatform = (typeof RELEASE_PLATFORMS)[number];
export const RELEASE_CHANNELS = ['stable', 'beta'] as const;
export type ReleaseChannel = (typeof RELEASE_CHANNELS)[number];
export const UPDATE_STATES = ['offered', 'downloading', 'downloaded', 'installing', 'installed', 'failed', 'declined'] as const;
export type UpdateState = (typeof UPDATE_STATES)[number];

/**
 * A build of the board app: an APK (Android) or a zip/installer (desktop). Platform rows (tenant
 * null) are published by the platform team for every institution; institution rows are its own.
 * The file is uploaded after the row is made; a release without a file cannot be rolled out.
 */
export const panelReleases = pgTable(
  'panel_releases',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    scope: text('scope').$type<'platform' | 'institution'>().notNull().default('institution'),
    platform: text('platform').$type<ReleasePlatform>().notNull(),
    version: text('version').notNull(),
    channel: text('channel').$type<ReleaseChannel>().notNull().default('stable'),
    notes: text('notes'),
    fileKey: text('file_key'),
    fileName: text('file_name'),
    fileBytes: bigint('file_bytes', { mode: 'number' }),
    fileMime: text('file_mime'),
    sha256: text('sha256'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('panel_releases_tenant_idx').on(t.tenantId, t.platform, t.createdAt)],
);

/** An institution offers a release to all its boards (on the release's channel) or to the selected ones. */
export const panelRollouts = pgTable(
  'panel_rollouts',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    releaseId: uuid('release_id').notNull().references(() => panelReleases.id, { onDelete: 'cascade' }),
    target: text('target').$type<'all' | 'selected'>().notNull().default('all'),
    deviceIds: uuid('device_ids').array().notNull().default(sql`'{}'::uuid[]`),
    active: boolean('active').notNull().default(true),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    stoppedAt: timestamp('stopped_at', { withTimezone: true }),
  },
  (t) => [index('panel_rollouts_tenant_idx').on(t.tenantId, t.active, t.createdAt)],
);

/** Where a board is with a release, as it reports it (installed is also inferred from its version). */
export const panelUpdateStatus = pgTable(
  'panel_update_status',
  {
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }),
    releaseId: uuid('release_id').notNull().references(() => panelReleases.id, { onDelete: 'cascade' }),
    state: text('state').$type<UpdateState>().notNull(),
    error: text('error'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ name: 'panel_update_status_pk', columns: [t.deviceId, t.releaseId] })],
);

/** An app the panel home shows (Android package name): institution-wide (device null) or for one board. */
export const panelLauncherApps = pgTable(
  'panel_launcher_apps',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'cascade' }),
    package: text('package').notNull(),
    label: text('label').notNull(),
    iconUrl: text('icon_url'),
    position: integer('position').notNull(),
  },
  (t) => [index('panel_launcher_apps_tenant_idx').on(t.tenantId, t.deviceId, t.position)],
);
