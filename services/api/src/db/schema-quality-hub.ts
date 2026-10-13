// Module settings for the quality, outcomes and engagement group (migration 0130): numbering series,
// rules, message templates and defaults per module, stored as one JSON document per module.
import { sql } from 'drizzle-orm';
import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { tenants, users } from './schema.js';

export const moduleSettings = pgTable(
  'module_settings',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    module: text('module').notNull(),
    settings: jsonb('settings').notNull().default(sql`'{}'::jsonb`),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('module_settings_uq').on(t.tenantId, t.module)],
);
