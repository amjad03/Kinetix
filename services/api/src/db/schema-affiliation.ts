// Affiliating university / board profiles (migration 0143): the institution's chosen profile and scheme,
// per-programme schemes, and tenant overrides of the code-defined presets (src/affiliation/registry).
import { sql } from 'drizzle-orm';
import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { programs, tenants, users } from './schema.js';

const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' });
const ts = (name: string) => timestamp(name, { withTimezone: true });

/** One row per institution: the university or board it is affiliated to, the default scheme and its overrides. */
export const affiliationSettings = pgTable('affiliation_settings', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tenantId: tenantId().unique(),
  profileCode: text('profile_code').notNull(),
  schemeCode: text('scheme_code').notNull(),
  /** Partial rules laid over the preset (validated against the rules schema when saved). */
  overrides: jsonb('overrides').$type<Record<string, unknown>>().notNull().default({}),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

/** A programme that follows another profile or scheme than the institution's default (e.g. BE on VTU 2022, MBA on VTU 2021). */
export const programmeAffiliations = pgTable(
  'programme_affiliations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: tenantId(),
    programId: uuid('program_id').notNull().references(() => programs.id, { onDelete: 'cascade' }),
    profileCode: text('profile_code').notNull(),
    schemeCode: text('scheme_code').notNull(),
    overrides: jsonb('overrides').$type<Record<string, unknown>>().notNull().default({}),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('programme_affiliations_uq').on(t.tenantId, t.programId)],
);
