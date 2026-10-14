// OBE depth (migration 0160): the PEO-mission consistency matrix, published versions of a programme's statements, and
// attainment targets per outcome and year. Kept apart from schema.ts, which these tables reference.
import { sql } from 'drizzle-orm';
import { integer, jsonb, numeric, pgTable, primaryKey, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { academicYears, programOutcomes, programs, tenants, users } from './schema.js';

const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' });

/** How strongly a PEO serves an element of the department mission (1 low, 2 medium, 3 high), and why. */
export const peoMissionMap = pgTable(
  'peo_mission_map',
  {
    tenantId: tenantId(),
    programId: uuid('program_id').notNull().references(() => programs.id, { onDelete: 'cascade' }),
    peoId: uuid('peo_id').notNull().references(() => programOutcomes.id, { onDelete: 'cascade' }),
    missionId: uuid('mission_id').notNull().references(() => programOutcomes.id, { onDelete: 'cascade' }),
    strength: smallint('strength').notNull(),
    justification: text('justification'),
  },
  (t) => [primaryKey({ name: 'peo_mission_map_pk', columns: [t.peoId, t.missionId] })],
);

/** A published version of the programme's vision, mission, PEOs, POs and PSOs, from the year it applies. */
export const programOutcomeVersions = pgTable(
  'program_outcome_versions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: tenantId(),
    programId: uuid('program_id').notNull().references(() => programs.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    effectiveFrom: text('effective_from').notNull(),
    note: text('note'),
    statements: jsonb('statements').$type<{ kind: string; code: string; statement: string }[]>().notNull().default(sql`'[]'::jsonb`),
    publishedBy: uuid('published_by').references(() => users.id, { onDelete: 'set null' }),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('program_outcome_versions_uq').on(t.programId, t.version)],
);

/** The attainment target of one CO or PO/PSO in a year, overriding the programme's target level (and threshold for COs). */
export const obeTargets = pgTable(
  'obe_targets',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: tenantId(),
    programId: uuid('program_id').notNull().references(() => programs.id, { onDelete: 'cascade' }),
    academicYearId: uuid('academic_year_id').notNull().references(() => academicYears.id, { onDelete: 'cascade' }),
    scope: text('scope').notNull(), // co | po
    targetId: uuid('target_id').notNull(),
    code: text('code').notNull(),
    targetLevel: numeric('target_level', { precision: 4, scale: 2, mode: 'number' }).notNull(),
    thresholdPercent: numeric('threshold_percent', { precision: 5, scale: 2, mode: 'number' }),
    rationale: text('rationale'),
    setBy: uuid('set_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('obe_targets_uq').on(t.academicYearId, t.targetId)],
);
