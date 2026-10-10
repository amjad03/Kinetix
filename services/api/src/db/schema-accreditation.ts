// Accreditation and statutory reporting tables (migration 0124): metric entries for NAAC, NBA and NIRF, DVV queries, IQAC workspace and faculty evidence.
import { sql } from 'drizzle-orm';
import { boolean, date, index, jsonb, numeric, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { tenants, users } from './schema.js';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const by = (name: string) => uuid(name).references(() => users.id, { onDelete: 'set null' });

/** A figure, a data table or a narrative for one metric of a framework (NAAC, NBA or NIRF) in one cycle; where none is entered the figure is computed from ERP data. */
export const accreditationEntries = pgTable(
  'accreditation_entries',
  {
    id: id(),
    tenantId: tenantId(),
    body: text('body').notNull(), // naac | nba | nirf
    cycle: text('cycle').notNull(), // 2025-26, or a span such as 2021-26 for a self-study report
    metricCode: text('metric_code').notNull(),
    value: numeric('value', { precision: 16, scale: 4, mode: 'number' }),
    textValue: text('text_value').notNull().default(''),
    /** Rows of the metric's data template (each row an array of cell strings). */
    dataRows: jsonb('data_rows').notNull().default(sql`'[]'::jsonb`),
    /** Institution's own marking out of 4 for metrics that are not scored from a benchmark. */
    selfScore: numeric('self_score', { precision: 4, scale: 2, mode: 'number' }),
    note: text('note').notNull().default(''),
    updatedBy: by('updated_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('accreditation_entries_uq').on(t.tenantId, t.body, t.cycle, t.metricCode)],
);

/** A clarification asked by a data validation and verification (DVV) reviewer, with the institution's reply. */
export const dvvQueries = pgTable(
  'dvv_queries',
  {
    id: id(),
    tenantId: tenantId(),
    cycle: text('cycle').notNull(),
    metricCode: text('metric_code').notNull(),
    query: text('query').notNull(),
    response: text('response').notNull().default(''),
    status: text('status').notNull().default('open'), // open | answered | closed
    raisedBy: by('raised_by'),
    createdAt: createdAt(),
    answeredAt: timestamp('answered_at', { withTimezone: true }),
  },
  (t) => [index('dvv_queries_cycle_idx').on(t.cycle, t.metricCode)],
);

export const iqacMeetings = pgTable('iqac_meetings', {
  id: id(),
  tenantId: tenantId(),
  title: text('title').notNull(),
  meetingOn: date('meeting_on').notNull(),
  agenda: text('agenda').notNull().default(''),
  minutes: text('minutes').notNull().default(''),
  attendees: text('attendees').notNull().default(''),
  createdBy: by('created_by'),
  createdAt: createdAt(),
});

export const iqacActions = pgTable(
  'iqac_actions',
  {
    id: id(),
    tenantId: tenantId(),
    meetingId: uuid('meeting_id').notNull().references(() => iqacMeetings.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    ownerName: text('owner_name').notNull().default(''),
    dueOn: date('due_on'),
    status: text('status').notNull().default('open'), // open | done
    actionTaken: text('action_taken').notNull().default(''),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('iqac_actions_meeting_idx').on(t.meetingId)],
);

/** A best practice (NAAC 7.2) or the institution's distinctiveness statement (7.3), written to the format NAAC asks for. */
export const iqacPractices = pgTable('iqac_practices', {
  id: id(),
  tenantId: tenantId(),
  kind: text('kind').notNull(), // best_practice | distinctiveness
  title: text('title').notNull(),
  year: text('year').notNull().default(''),
  objectives: text('objectives').notNull().default(''),
  context: text('context').notNull().default(''),
  practice: text('practice').notNull().default(''),
  evidence: text('evidence').notNull().default(''),
  problems: text('problems').notNull().default(''),
  createdBy: by('created_by'),
  createdAt: createdAt(),
});

/** Stakeholder feedback analysis and the action taken on it (the action taken report). */
export const iqacFeedbackReports = pgTable('iqac_feedback_reports', {
  id: id(),
  tenantId: tenantId(),
  cycle: text('cycle').notNull(),
  stakeholder: text('stakeholder').notNull(), // students | teachers | employers | alumni | parents
  summary: text('summary').notNull(),
  averageRating: numeric('average_rating', { precision: 4, scale: 2, mode: 'number' }),
  responses: smallint('responses'),
  actionTaken: text('action_taken').notNull().default(''),
  status: text('status').notNull().default('analysed'), // analysed | action_planned | action_taken
  createdBy: by('created_by'),
  createdAt: createdAt(),
});

/** Evidence a teacher uploads about their own work (publication, FDP, award, patent) when the ERP does not hold it. */
export const facultyEvidence = pgTable(
  'faculty_evidence',
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // publication | fdp | award | patent | book | other
    title: text('title').notNull(),
    year: smallint('year'),
    venue: text('venue').notNull().default(''),
    url: text('url'),
    fileKey: text('file_key'),
    fileName: text('file_name'),
    verified: boolean('verified').notNull().default(false),
    verifiedBy: by('verified_by'),
    createdAt: createdAt(),
  },
  (t) => [index('faculty_evidence_user_idx').on(t.userId)],
);
