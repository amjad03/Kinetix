// Governance production pass (migrations 0218-0219): statutory committee meetings with attendance, agenda items and
// minutes the members approve and sign; policies with versions, four-eyes approval and acknowledgement; the RTI
// register; the compliance calendar; and the mandatory disclosure page. Kept apart from schema.ts, which they reference.
import { sql } from 'drizzle-orm';
import { bigint, boolean, date, index, integer, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { committeeMeetings, committeeMembers, tenants, users } from './schema.js';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const by = (name: string) => uuid(name).references(() => users.id, { onDelete: 'set null' });

/** Who was at a meeting: one row per member, present, absent or on leave. Quorum is counted from it. */
export const committeeMeetingAttendance = pgTable(
  'committee_meeting_attendance',
  {
    id: id(),
    tenantId: tenantId(),
    meetingId: uuid('meeting_id').notNull().references(() => committeeMeetings.id, { onDelete: 'cascade' }),
    memberId: uuid('member_id').notNull().references(() => committeeMembers.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('present'), // present | absent | leave
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('committee_meeting_attendance_uq').on(t.meetingId, t.memberId)],
);

/** One item of a meeting's agenda, and what the meeting resolved on it. */
export const committeeAgendaItems = pgTable(
  'committee_agenda_items',
  {
    id: id(),
    tenantId: tenantId(),
    meetingId: uuid('meeting_id').notNull().references(() => committeeMeetings.id, { onDelete: 'cascade' }),
    seq: smallint('seq').notNull(),
    title: text('title').notNull(),
    presenter: text('presenter').notNull().default(''),
    discussion: text('discussion').notNull().default(''),
    resolution: text('resolution').notNull().default(''),
    outcome: text('outcome').notNull().default('pending'), // pending | resolved | deferred | noted | rejected
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('committee_agenda_items_seq_uq').on(t.meetingId, t.seq)],
);

/**
 * A member's approval of (or objection to) the circulated minutes. The signature is an HMAC of the minutes' hash, the
 * member and the time, so a later change to the minutes shows the signature no longer matches.
 */
export const committeeMinuteSignoffs = pgTable(
  'committee_minute_signoffs',
  {
    id: id(),
    tenantId: tenantId(),
    meetingId: uuid('meeting_id').notNull().references(() => committeeMeetings.id, { onDelete: 'cascade' }),
    memberId: uuid('member_id').notNull().references(() => committeeMembers.id, { onDelete: 'cascade' }),
    userId: by('user_id'),
    decision: text('decision').notNull(), // approve | object
    comment: text('comment').notNull().default(''),
    minutesHash: text('minutes_hash').notNull(),
    signature: text('signature').notNull(),
    signedAt: timestamp('signed_at', { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex('committee_minute_signoffs_uq').on(t.meetingId, t.memberId, t.minutesHash)],
);

/** A policy of the institution (code of conduct, anti-ragging, POSH, data protection), kept as versions. */
export const governancePolicies = pgTable(
  'governance_policies',
  {
    id: id(),
    tenantId: tenantId(),
    code: text('code').notNull(),
    title: text('title').notNull(),
    category: text('category').notNull().default('other'),
    ownerUserId: by('owner_user_id'),
    /** Months between reviews; the next review is due that long after a version is published. */
    reviewMonths: smallint('review_months').notNull().default(24),
    nextReviewOn: date('next_review_on'),
    /** Shown on the public disclosure page once published. */
    public: boolean('public').notNull().default(false),
    /** Roles that must acknowledge each published version (empty: nobody). */
    audience: text('audience').array().notNull().default(sql`'{}'::text[]`),
    status: text('status').notNull().default('active'), // active | retired
    createdBy: by('created_by'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('governance_policies_code_uq').on(t.tenantId, t.code)],
);

/** One version of a policy: drafted, reviewed, approved by someone other than the author, then published. */
export const governancePolicyVersions = pgTable(
  'governance_policy_versions',
  {
    id: id(),
    tenantId: tenantId(),
    policyId: uuid('policy_id').notNull().references(() => governancePolicies.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    body: text('body').notNull(),
    changeNote: text('change_note').notNull().default(''),
    status: text('status').notNull().default('draft'), // draft | in_review | approved | published | superseded
    effectiveFrom: date('effective_from'),
    authoredBy: by('authored_by'),
    approvedBy: by('approved_by'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    /** sha256 of the body when approved, so the text people acknowledged is the text that was approved. */
    contentHash: text('content_hash'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('governance_policy_versions_uq').on(t.policyId, t.version), index('governance_policy_versions_status_idx').on(t.tenantId, t.status)],
);

/** Someone read and accepted a published version. */
export const governancePolicyAcks = pgTable(
  'governance_policy_acks',
  {
    id: id(),
    tenantId: tenantId(),
    versionId: uuid('version_id').notNull().references(() => governancePolicyVersions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex('governance_policy_acks_uq').on(t.versionId, t.userId), index('governance_policy_acks_user_idx').on(t.tenantId, t.userId)],
);

/**
 * A request under the Right to Information Act, 2005: received by the Public Information Officer, answered within 30
 * days (48 hours for life or liberty; 5 more days through an assistant PIO), transferred within 5 days under 6(3), and
 * the first appeal to the First Appellate Authority (filed within 30 days, decided within 30, at most 45).
 */
export const rtiRequests = pgTable(
  'rti_requests',
  {
    id: id(),
    tenantId: tenantId(),
    requestNo: text('request_no').notNull(),
    applicantName: text('applicant_name').notNull(),
    address: text('address').notNull().default(''),
    phone: text('phone').notNull().default(''),
    email: text('email').notNull().default(''),
    receivedOn: date('received_on').notNull(),
    mode: text('mode').notNull().default('post'), // post | online | in_person | email
    viaApio: boolean('via_apio').notNull().default(false),
    lifeLiberty: boolean('life_liberty').notNull().default(false),
    bpl: boolean('bpl').notNull().default(false),
    feePaise: bigint('fee_paise', { mode: 'number' }).notNull().default(0),
    feeRef: text('fee_ref').notNull().default(''),
    subject: text('subject').notNull(),
    information: text('information').notNull(),
    pioUserId: by('pio_user_id'),
    dueOn: date('due_on').notNull(),
    status: text('status').notNull().default('received'), // received | transferred | replied | rejected | closed
    transferredTo: text('transferred_to').notNull().default(''),
    transferredOn: date('transferred_on'),
    additionalFeePaise: bigint('additional_fee_paise', { mode: 'number' }).notNull().default(0),
    reply: text('reply').notNull().default(''),
    repliedOn: date('replied_on'),
    /** Section 8(1)(a)-(j), 9, 11 or 24 when information is refused. */
    rejectionSection: text('rejection_section').notNull().default(''),
    appealFiledOn: date('appeal_filed_on'),
    appealGrounds: text('appeal_grounds').notNull().default(''),
    appealDueOn: date('appeal_due_on'),
    faaUserId: by('faa_user_id'),
    appealDecision: text('appeal_decision').notNull().default(''),
    appealOutcome: text('appeal_outcome').notNull().default(''), // '' | allowed | partly_allowed | dismissed
    appealDecidedOn: date('appeal_decided_on'),
    secondAppeal: boolean('second_appeal').notNull().default(false),
    lastRemindedOn: date('last_reminded_on'),
    createdBy: by('created_by'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('rti_requests_no_uq').on(t.tenantId, t.requestNo), index('rti_requests_due_idx').on(t.tenantId, t.status, t.dueOn)],
);

/** A regulatory deadline (AISHE, NIRF, AQAR, AICTE EoA, ITR, PF) with its owner and reminders; recurring ones roll on. */
export const complianceDeadlines = pgTable(
  'compliance_deadlines',
  {
    id: id(),
    tenantId: tenantId(),
    title: text('title').notNull(),
    authority: text('authority').notNull().default('other'),
    frameworkKey: text('framework_key'),
    dueOn: date('due_on').notNull(),
    recurrence: text('recurrence').notNull().default('none'), // none | monthly | quarterly | annual
    ownerUserId: by('owner_user_id'),
    remindDays: integer('remind_days').array().notNull().default(sql`'{30,7,1}'::integer[]`),
    status: text('status').notNull().default('pending'), // pending | done | missed | waived
    completedOn: date('completed_on'),
    reference: text('reference').notNull().default(''),
    note: text('note').notNull().default(''),
    lastRemindedOn: date('last_reminded_on'),
    remindersSent: integer('reminders_sent').notNull().default(0),
    /** The next occurrence created when this one was done (recurring deadlines). */
    nextId: uuid('next_id'),
    createdBy: by('created_by'),
    createdAt: createdAt(),
  },
  (t) => [index('compliance_deadlines_due_idx').on(t.tenantId, t.status, t.dueOn)],
);

/** A line of the mandatory disclosure page the institution types in (AICTE permanent id, EoA letter, land area). */
export const disclosureItems = pgTable(
  'disclosure_items',
  {
    id: id(),
    tenantId: tenantId(),
    section: text('section').notNull(), // about | approvals | governance | academics | fees | infrastructure | other
    label: text('label').notNull(),
    value: text('value').notNull().default(''),
    url: text('url').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
    public: boolean('public').notNull().default(true),
    updatedBy: by('updated_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('disclosure_items_section_idx').on(t.tenantId, t.section, t.sortOrder)],
);

/** Whether the institution's mandatory disclosure page is published, and its opening note. One row per institution. */
export const disclosureSettings = pgTable(
  'disclosure_settings',
  {
    id: id(),
    tenantId: tenantId(),
    published: boolean('published').notNull().default(false),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    intro: text('intro').notNull().default(''),
    updatedBy: by('updated_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('disclosure_settings_tenant_uq').on(t.tenantId)],
);
