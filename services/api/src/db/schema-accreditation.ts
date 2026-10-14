// Accreditation and statutory reporting tables (migrations 0127, 0141 and 0142): metric entries per framework and year, DVV
// clarifications, framework settings, task assignment and comments, IQAC workspace and faculty evidence.
import { sql } from 'drizzle-orm';
import { boolean, date, index, integer, jsonb, numeric, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { departments, tenants, users } from './schema.js';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const by = (name: string) => uuid(name).references(() => users.id, { onDelete: 'set null' });

/**
 * What the institution entered for one metric of a framework in one academic year: a figure that overrides the computed
 * one, the year's inputs, the data template rows, the options ticked, a narrative and its own marking. Where nothing is
 * entered the inputs are computed from ERP data. Evidence files hang off the entry (obe_evidence scope 'metric').
 */
export const accreditationEntries = pgTable(
  'accreditation_entries',
  {
    id: id(),
    tenantId: tenantId(),
    /** Framework key (naac-aff-ug, nba-ug-eng-t2, nirf-engineering, aishe-dcf2 ...). The column keeps its first name. */
    body: text('body').notNull(),
    cycle: text('cycle').notNull(), // academic year, 2025-26
    metricCode: text('metric_code').notNull(),
    value: numeric('value', { precision: 16, scale: 4, mode: 'number' }),
    /** Inputs of the metric's formula entered for the year, by input key. */
    inputs: jsonb('inputs').$type<Record<string, number>>().notNull().default(sql`'{}'::jsonb`),
    /** Indexes of the options ticked, for choice metrics. */
    options: jsonb('options').$type<number[] | null>(),
    textValue: text('text_value').notNull().default(''),
    /** Rows of the metric's data template (each row an array of cell strings). */
    dataRows: jsonb('data_rows').notNull().default(sql`'[]'::jsonb`),
    /** Institution's own marking: points out of 4 for NAAC, marks for NBA and NIRF. */
    selfScore: numeric('self_score', { precision: 6, scale: 2, mode: 'number' }),
    note: text('note').notNull().default(''),
    updatedBy: by('updated_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('accreditation_entries_uq').on(t.tenantId, t.body, t.cycle, t.metricCode)],
);

/**
 * A clarification asked by the data validation and verification (DVV) partner, with the institution's response, the
 * figure the institution filed and the one DVV recommends, and the documents sent (obe_evidence scope 'dvv').
 */
export const dvvQueries = pgTable(
  'dvv_queries',
  {
    id: id(),
    tenantId: tenantId(),
    framework: text('framework').notNull().default('naac-aff-ug'),
    cycle: text('cycle').notNull(),
    metricCode: text('metric_code').notNull(),
    /** What DVV found: data_mismatch | documents_missing | formula | out_of_period | other. */
    deviation: text('deviation').notNull().default('other'),
    query: text('query').notNull(),
    heiValue: numeric('hei_value', { precision: 16, scale: 4, mode: 'number' }),
    dvvValue: numeric('dvv_value', { precision: 16, scale: 4, mode: 'number' }),
    response: text('response').notNull().default(''),
    status: text('status').notNull().default('open'), // open | answered | accepted | rejected | closed
    dueOn: date('due_on'),
    raisedBy: by('raised_by'),
    respondedBy: by('responded_by'),
    createdAt: createdAt(),
    answeredAt: timestamp('answered_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (t) => [index('dvv_queries_cycle_idx').on(t.cycle, t.metricCode), index('dvv_queries_framework_idx').on(t.framework, t.cycle)],
);

/** Per-framework settings of an institution: benchmark and weight overrides (for example NIRF category leaders). */
export const accreditationSettings = pgTable(
  'accreditation_settings',
  {
    id: id(),
    tenantId: tenantId(),
    framework: text('framework').notNull(),
    bench: jsonb('bench').$type<Record<string, number>>().notNull().default(sql`'{}'::jsonb`),
    weight: jsonb('weight').$type<Record<string, number>>().notNull().default(sql`'{}'::jsonb`),
    updatedBy: by('updated_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('accreditation_settings_uq').on(t.tenantId, t.framework)],
);

/** Who prepares a metric (or a whole criterion) for a cycle, by when, and where it stands in review. */
export const accreditationTasks = pgTable(
  'accreditation_tasks',
  {
    id: id(),
    tenantId: tenantId(),
    framework: text('framework').notNull(),
    cycle: text('cycle').notNull(),
    /** A metric code, or a criterion id for a criterion-level assignment. */
    scope: text('scope').notNull(),
    departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
    ownerId: by('owner_id'),
    reviewerId: by('reviewer_id'),
    dueOn: date('due_on'),
    status: text('status').notNull().default('assigned'), // assigned | in_progress | submitted | approved | returned
    note: text('note').notNull().default(''),
    lastRemindedOn: date('last_reminded_on'),
    createdBy: by('created_by'),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('accreditation_tasks_uq').on(t.tenantId, t.framework, t.cycle, t.scope), index('accreditation_tasks_owner_idx').on(t.ownerId)],
);

/** A comment on a metric for a cycle: reviewer notes, questions to the owner, decisions. */
export const accreditationComments = pgTable(
  'accreditation_comments',
  {
    id: id(),
    tenantId: tenantId(),
    framework: text('framework').notNull(),
    cycle: text('cycle').notNull(),
    metricCode: text('metric_code').notNull(),
    userId: by('user_id'),
    body: text('body').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('accreditation_comments_metric_idx').on(t.framework, t.cycle, t.metricCode)],
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
  // Migration 0161.
  kind: text('kind').notNull().default('regular'), // regular | special
  status: text('status').notNull().default('held'), // scheduled | held | minutes_approved
  venue: text('venue').notNull().default(''),
  present: smallint('present'),
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
    // Migration 0161: who acts, for which department and NAAC criterion, and how urgent. Status: open | in_progress | done | dropped.
    ownerUserId: by('owner_user_id'),
    departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
    criterion: text('criterion'),
    priority: text('priority').notNull().default('normal'), // low | normal | high
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

/** A member of the IQAC with the category NAAC lists (chairperson, management, teachers, experts, alumni ...) and the term. */
export const iqacMembers = pgTable('iqac_members', {
  id: id(),
  tenantId: tenantId(),
  name: text('name').notNull(),
  userId: by('user_id'),
  category: text('category').notNull(), // chairperson | coordinator | management | teacher | administrative | external_expert | alumni | student | employer | local_society
  designation: text('designation').notNull().default(''),
  organisation: text('organisation'),
  email: text('email'),
  phone: text('phone'),
  termFrom: date('term_from').notNull(),
  termTo: date('term_to'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt(),
});

/** A quality initiative of the year (IQAC calendar): workshops, audits, surveys, NIRF and AISHE participation. */
export const iqacInitiatives = pgTable('iqac_initiatives', {
  id: id(),
  tenantId: tenantId(),
  title: text('title').notNull(),
  kind: text('kind').notNull().default('other'), // workshop | audit | survey | ranking | collaboration | orientation | award | other
  criterion: text('criterion'),
  plannedOn: date('planned_on'),
  heldOn: date('held_on'),
  participants: integer('participants'),
  coordinatorUserId: by('coordinator_user_id'),
  outcome: text('outcome'),
  status: text('status').notNull().default('planned'), // planned | done | cancelled
  createdAt: createdAt(),
});

/** The AQAR of a year: when it is due, when it went to NAAC, and NAAC's acknowledgement. */
export const iqacAqarSubmissions = pgTable(
  'iqac_aqar_submissions',
  {
    id: id(),
    tenantId: tenantId(),
    year: text('year').notNull(),
    dueOn: date('due_on'),
    submittedOn: date('submitted_on'),
    reference: text('reference'),
    status: text('status').notNull().default('preparing'), // preparing | submitted | accepted | returned
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('iqac_aqar_year_uq').on(t.tenantId, t.year)],
);
