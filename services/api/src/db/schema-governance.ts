// Governance and platform settings (migrations 0178-0179): the institution's role access rules and full data exports.
import { sql } from 'drizzle-orm';
import { bigint, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { tenants, users } from './schema.js';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' });

/**
 * A narrowing of one staff role's access to one module (src/access/access-catalog.ts): `read` (look only) or `none`.
 * No row means the role keeps what it normally has.
 */
export const roleAccessRules = pgTable(
  'role_access_rules',
  {
    id: id(),
    tenantId: tenantId(),
    role: text('role').notNull(),
    module: text('module').notNull(),
    access: text('access').$type<'read' | 'none'>().notNull(),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('role_access_rules_uq').on(t.tenantId, t.role, t.module)],
);

/** A download of all the institution's data (every table, as JSON in a ZIP), made by a background job. */
export const tenantExports = pgTable(
  'tenant_exports',
  {
    id: id(),
    tenantId: tenantId(),
    /** queued | running | ready | failed | expired */
    status: text('status').$type<'queued' | 'running' | 'ready' | 'failed' | 'expired'>().notNull().default('queued'),
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
    note: text('note').notNull().default(''),
    fileKey: text('file_key'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    tableCount: integer('table_count'),
    rowCount: bigint('row_count', { mode: 'number' }),
    /** Table name → rows, for the summary. */
    tables: jsonb('tables').$type<Record<string, number>>().notNull().default({}),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    /** The file is deleted after this (7 days after it is ready). */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    downloadedAt: timestamp('downloaded_at', { withTimezone: true }),
  },
  (t) => [index('tenant_exports_tenant_idx').on(t.tenantId, t.createdAt)],
);
