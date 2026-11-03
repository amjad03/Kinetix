// Admissions pass (migrations 0196-0197): de-reservation moves, programme approvals and branch codes, the admission
// document checklist, credentials issued at enrolment, and broadcasts to lead segments. Kept apart from schema.ts.
import { sql } from 'drizzle-orm';
import { boolean, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { admissionCampaigns, admissionCycles, applications, enquiries, programs, students, tenants, users } from './schema.js';
import { messageTemplates } from './schema-pathways.js';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const userRef = (name: string) => uuid(name).references(() => users.id, { onDelete: 'set null' });

/** Seats moved between rows after a round: SC ↔ ST, a reserved row to GM, government seats surrendered. */
export const admissionSeatConversions = pgTable(
  'admission_seat_conversions',
  {
    id: id(),
    tenantId: tenantId(),
    cycleId: uuid('cycle_id').notNull().references(() => admissionCycles.id, { onDelete: 'cascade' }),
    afterRound: integer('after_round').notNull(),
    optionLabel: text('option_label').notNull(),
    fromSeatType: text('from_seat_type').notNull(),
    fromCategory: text('from_category').notNull(),
    toSeatType: text('to_seat_type').notNull(),
    toCategory: text('to_category').notNull(),
    seats: integer('seats').notNull(),
    reason: text('reason').notNull(),
    createdBy: userRef('created_by'),
    createdAt: createdAt(),
  },
  (t) => [index('admission_seat_conversions_cycle_idx').on(t.cycleId, t.createdAt)],
);

/** A programme's branch code (register numbers), sanctioned intake and the approval it rests on. */
export const admissionProgrammeSettings = pgTable(
  'admission_programme_settings',
  {
    id: id(),
    tenantId: tenantId(),
    programId: uuid('program_id').notNull().references(() => programs.id, { onDelete: 'cascade' }),
    branchCode: text('branch_code'),
    sanctionedIntake: integer('sanctioned_intake'),
    approvalBody: text('approval_body'),
    approvalRef: text('approval_ref'),
    approvalValidTo: date('approval_valid_to'),
    updatedBy: userRef('updated_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('admission_programme_settings_uq').on(t.programId)],
);

/** One certificate or original an admitted candidate must hand in, with its status and due date. */
export const admissionChecklistItems = pgTable(
  'admission_checklist_items',
  {
    id: id(),
    tenantId: tenantId(),
    applicationId: uuid('application_id').notNull().references(() => applications.id, { onDelete: 'cascade' }),
    itemKey: text('item_key').notNull(),
    label: text('label').notNull(),
    required: boolean('required').notNull().default(true),
    /** The college keeps the original (it then goes on the custody register). */
    original: boolean('original').notNull().default(false),
    why: text('why'),
    /** pending | received | verified | deferred | waived */
    status: text('status').notNull().default('pending'),
    dueOn: date('due_on'),
    referenceNo: text('reference_no'),
    note: text('note'),
    updatedBy: userRef('updated_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('admission_checklist_items_uq').on(t.applicationId, t.itemKey), index('admission_checklist_items_due_idx').on(t.tenantId, t.status, t.dueOn)],
);

/** Sign-in details sent to a new student or parent: to whom (masked), how, and whether it went. */
export const admissionCredentialIssues = pgTable(
  'admission_credential_issues',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    /** student | parent */
    role: text('role').notNull(),
    /** sms | email */
    channel: text('channel').notNull(),
    destination: text('destination').notNull(),
    /** sent | failed | skipped */
    status: text('status').notNull(),
    error: text('error'),
    issuedBy: userRef('issued_by'),
    createdAt: createdAt(),
  },
  (t) => [index('admission_credential_issues_student_idx').on(t.studentId, t.createdAt)],
);

/** A message to a segment of leads through a registered template, sent by a background job. */
export const admissionBroadcasts = pgTable(
  'admission_broadcasts',
  {
    id: id(),
    tenantId: tenantId(),
    campaignId: uuid('campaign_id').references(() => admissionCampaigns.id, { onDelete: 'set null' }),
    templateId: uuid('template_id').notNull().references(() => messageTemplates.id),
    channel: text('channel').notNull(),
    /** The filter the recipients were chosen by: { stage, programId, source, campaignId, followUpDue }. */
    segment: jsonb('segment').$type<Record<string, unknown>>().notNull().default({}),
    /** queued | sending | done */
    status: text('status').notNull().default('queued'),
    total: integer('total').notNull().default(0),
    sent: integer('sent').notNull().default(0),
    skipped: integer('skipped').notNull().default(0),
    failed: integer('failed').notNull().default(0),
    idempotencyKey: text('idempotency_key'),
    createdBy: userRef('created_by'),
    createdAt: createdAt(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('admission_broadcasts_idem_uq').on(t.tenantId, t.idempotencyKey).where(sql`${t.idempotencyKey} is not null`)],
);

export const admissionBroadcastSends = pgTable(
  'admission_broadcast_sends',
  {
    id: id(),
    tenantId: tenantId(),
    broadcastId: uuid('broadcast_id').notNull().references(() => admissionBroadcasts.id, { onDelete: 'cascade' }),
    enquiryId: uuid('enquiry_id').notNull().references(() => enquiries.id, { onDelete: 'cascade' }),
    /** queued | sent | skipped | failed */
    status: text('status').notNull().default('queued'),
    reason: text('reason'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('admission_broadcast_sends_uq').on(t.broadcastId, t.enquiryId), index('admission_broadcast_sends_status_idx').on(t.broadcastId, t.status)],
);
