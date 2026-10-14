// Student information and admissions depth (migrations 0150-0152): the student's own profile (identifiers, personal
// and category details, address, custom fields), profile change requests, no-dues clearances; and for admissions the
// counsellor assignment rules, approval requests (management quota, cancellation with refund, programme change),
// refund slabs, the original-certificate custody register and saved application drafts. Kept apart from schema.ts.
import { sql } from 'drizzle-orm';
import { bigint, boolean, date, index, integer, jsonb, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { admissionCycles, applications, programs, students, tenants, users } from './schema.js';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const userRef = (name: string) => uuid(name).references(() => users.id, { onDelete: 'set null' });

// ---------------------------------------------------------------------------------------------
// Student information
// ---------------------------------------------------------------------------------------------

/**
 * A student's own details beside the roll: identifiers (admission, university register, UDISE PEN; Aadhaar kept only
 * as its last four digits and a salted hash), personal and category details for statutory returns, address, and the
 * institution's custom fields. One row per student.
 */
export const studentProfiles = pgTable(
  'student_profiles',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    admissionNo: text('admission_no'),
    registerNo: text('register_no'),
    penNo: text('pen_no'),
    aadhaarLast4: text('aadhaar_last4'),
    aadhaarHash: text('aadhaar_hash'),
    dateOfBirth: date('date_of_birth'),
    /** male | female | other */
    gender: text('gender'),
    /** general | obc | sc | st | ews | other */
    category: text('category'),
    religion: text('religion'),
    motherTongue: text('mother_tongue'),
    nationality: text('nationality').notNull().default('Indian'),
    isMinority: boolean('is_minority').notNull().default(false),
    /** The disability as stated (PwD), or null. */
    disability: text('disability'),
    /** regular | lateral | transfer | readmission */
    admissionType: text('admission_type').notNull().default('regular'),
    addressLine: text('address_line'),
    city: text('city'),
    district: text('district'),
    state: text('state'),
    pincode: text('pincode'),
    /** Custom field values by key (student_custom_fields). */
    custom: jsonb('custom').$type<Record<string, string | number | boolean | null>>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('student_profiles_student_uq').on(t.studentId),
    uniqueIndex('student_profiles_admission_no_uq').on(t.tenantId, t.admissionNo),
    uniqueIndex('student_profiles_register_no_uq').on(t.tenantId, t.registerNo),
    index('student_profiles_aadhaar_idx').on(t.tenantId, t.aadhaarHash),
  ],
);

/** A field the institution adds to every student's profile, with who may see it and who may change it. */
export const studentCustomFields = pgTable(
  'student_custom_fields',
  {
    id: id(),
    tenantId: tenantId(),
    key: text('key').notNull(),
    label: text('label').notNull(),
    /** text | number | date | select | boolean */
    type: text('type').notNull().default('text'),
    options: jsonb('options').$type<string[]>().notNull().default([]),
    required: boolean('required').notNull().default(false),
    help: text('help'),
    /** Roles that may see the value (empty: everyone who may open the profile). */
    viewRoles: jsonb('view_roles').$type<string[]>().notNull().default([]),
    /** Roles that may change it (empty: the profile editors). */
    editRoles: jsonb('edit_roles').$type<string[]>().notNull().default([]),
    /** Students and parents may ask for a change to it through a change request. */
    requestable: boolean('requestable').notNull().default(true),
    active: boolean('active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('student_custom_fields_key_uq').on(t.tenantId, t.key)],
);

/** A student's or parent's request to correct a profile detail; staff approve (the change is applied) or reject it. */
export const studentChangeRequests = pgTable(
  'student_change_requests',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    /** A profile field key, or `custom.<key>`. */
    field: text('field').notNull(),
    fieldLabel: text('field_label').notNull(),
    currentValue: text('current_value'),
    newValue: text('new_value').notNull(),
    reason: text('reason').notNull().default(''),
    /** pending | approved | rejected | cancelled */
    status: text('status').notNull().default('pending'),
    /** student | guardian | staff */
    requestedAs: text('requested_as').notNull().default('staff'),
    requestedBy: userRef('requested_by'),
    decidedBy: userRef('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionNote: text('decision_note'),
    createdAt: createdAt(),
  },
  (t) => [index('student_change_requests_status_idx').on(t.tenantId, t.status, t.createdAt), index('student_change_requests_student_idx').on(t.studentId)],
);

/** A no-dues clearance for a student leaving (TC) or completing: one line per department that must sign off. */
export const studentClearances = pgTable(
  'student_clearances',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    /** tc | course_completion | migration | other */
    purpose: text('purpose').notNull().default('tc'),
    /** open | cleared | cancelled */
    status: text('status').notNull().default('open'),
    note: text('note'),
    requestedBy: userRef('requested_by'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('student_clearances_status_idx').on(t.tenantId, t.status, t.createdAt), index('student_clearances_student_idx').on(t.studentId)],
);

export const studentClearanceItems = pgTable(
  'student_clearance_items',
  {
    id: id(),
    tenantId: tenantId(),
    clearanceId: uuid('clearance_id').notNull().references(() => studentClearances.id, { onDelete: 'cascade' }),
    /** fees | library | hostel | transport | lab | sports | exams */
    department: text('department').notNull(),
    /** pending | cleared | blocked */
    status: text('status').notNull().default('pending'),
    /** What the system found owing when the clearance was raised or rechecked. */
    duesPaise: bigint('dues_paise', { mode: 'number' }).notNull().default(0),
    finding: text('finding'),
    note: text('note'),
    decidedBy: userRef('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('student_clearance_items_uq').on(t.clearanceId, t.department)],
);

// ---------------------------------------------------------------------------------------------
// Admissions
// ---------------------------------------------------------------------------------------------

/** How new enquiries are shared out among counsellors: the first active rule that matches (in order) decides. */
export const admissionAssignmentRules = pgTable(
  'admission_assignment_rules',
  {
    id: id(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    programId: uuid('program_id').references(() => programs.id, { onDelete: 'cascade' }),
    source: text('source'),
    /** Matched against the enquiry's city or region (case-insensitive). */
    region: text('region'),
    /** round_robin | least_loaded */
    mode: text('mode').notNull().default('round_robin'),
    counsellorIds: jsonb('counsellor_ids').$type<string[]>().notNull().default([]),
    nextIndex: integer('next_index').notNull().default(0),
    active: boolean('active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('admission_assignment_rules_name_uq').on(t.tenantId, t.name)],
);

/**
 * A decision the admissions office cannot take alone: a management-quota seat (with the donation-free declaration),
 * a cancellation with its refund, or a change of programme after admission. The principal approves or rejects.
 */
export const admissionRequests = pgTable(
  'admission_requests',
  {
    id: id(),
    tenantId: tenantId(),
    applicationId: uuid('application_id').notNull().references(() => applications.id, { onDelete: 'cascade' }),
    /** management_quota | cancellation | programme_change */
    kind: text('kind').notNull(),
    /** pending | approved | rejected */
    status: text('status').notNull().default('pending'),
    reason: text('reason').notNull(),
    /** Per kind: { declaration } | { paidPaise, refundPaise, percent, slab, daysFromClose } | { toCycleId, toCycleName } */
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    requestedBy: userRef('requested_by'),
    decidedBy: userRef('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionNote: text('decision_note'),
    createdAt: createdAt(),
  },
  (t) => [index('admission_requests_status_idx').on(t.tenantId, t.status, t.createdAt), index('admission_requests_app_idx').on(t.applicationId)],
);

/**
 * The refund policy for a cancelled admission (UGC 2018 by default): by how many days from the cycle's last date of
 * admission the cancellation comes (negative: before), the share refunded and any processing deduction.
 */
export const admissionRefundSlabs = pgTable('admission_refund_slabs', {
  id: id(),
  tenantId: tenantId(),
  label: text('label').notNull(),
  /** Applies up to this many days from the last date (inclusive); null: any later day. */
  uptoDays: integer('upto_days'),
  percent: smallint('percent').notNull(),
  /** Processing charge taken from the refund: a share of the fee… */
  deductionPercent: smallint('deduction_percent').notNull().default(0),
  /** …at most this much (0: no cap). */
  deductionCapPaise: bigint('deduction_cap_paise', { mode: 'number' }).notNull().default(0),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt(),
});

/** The register of original certificates held in custody: received from whom, kept, and returned against a signature. */
export const admissionCustodyItems = pgTable(
  'admission_custody_items',
  {
    id: id(),
    tenantId: tenantId(),
    applicationId: uuid('application_id').references(() => applications.id, { onDelete: 'set null' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'set null' }),
    holderName: text('holder_name').notNull(),
    document: text('document').notNull(),
    referenceNo: text('reference_no'),
    receivedOn: date('received_on').notNull(),
    receivedBy: userRef('received_by'),
    /** held | returned */
    status: text('status').notNull().default('held'),
    returnedOn: date('returned_on'),
    returnedTo: text('returned_to'),
    returnedBy: userRef('returned_by'),
    /** Who signed for it on return. */
    acknowledgement: text('acknowledgement'),
    note: text('note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('admission_custody_status_idx').on(t.tenantId, t.status, t.receivedOn), index('admission_custody_student_idx').on(t.studentId)],
);

/** An application the applicant has started and saved, resumed from a secret link until it is submitted. */
export const applicationDrafts = pgTable(
  'application_drafts',
  {
    id: id(),
    tenantId: tenantId(),
    cycleId: uuid('cycle_id').notNull().references(() => admissionCycles.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    applicantName: text('applicant_name').notNull().default(''),
    phone: text('phone').notNull().default(''),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    step: smallint('step').notNull().default(1),
    submittedApplicationId: uuid('submitted_application_id').references(() => applications.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('application_drafts_cycle_idx').on(t.tenantId, t.cycleId, t.createdAt)],
);
