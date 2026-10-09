// Depth tables for exams, quality, HR, finance, assets, library, hostel, canteen, health and mentoring (migration 0118). Kept apart from schema.ts, which they reference.
import { sql } from 'drizzle-orm';
import { bigint, boolean, date, index, integer, jsonb, numeric, pgTable, smallint, text, time, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import {
  academicYears,
  assessments,
  assets,
  examSessions,
  feeInvoices,
  hostelComplaints,
  hostelRooms,
  interventionPlans,
  invItems,
  invPurchaseOrders,
  invVendors,
  libraryBooks,
  libraryLoans,
  payrollRuns,
  qbPapers,
  rooms,
  students,
  subjects,
  tenants,
  topics,
  users,
} from './schema.js';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const marks = (name: string) => numeric(name, { precision: 6, scale: 2, mode: 'number' });
const paise = (name: string) => bigint(name, { mode: 'number' });
const by = (name: string) => uuid(name).references(() => users.id, { onDelete: 'set null' });


// ---- Exams and the question bank ---------------------------------------------------------------------

/** A locked paper is released to the exam controller at a set time; before that the secure copy stays shut. */
export const qbPaperReleases = pgTable(
  'qb_paper_releases',
  {
    id: id(),
    tenantId: tenantId(),
    paperId: uuid('paper_id').notNull().references(() => qbPapers.id, { onDelete: 'cascade' }),
    releaseAt: timestamp('release_at', { withTimezone: true }).notNull(),
    controllerId: uuid('controller_id').notNull().references(() => users.id),
    status: text('status').notNull().default('scheduled'), // scheduled | released | cancelled
    releasedAt: timestamp('released_at', { withTimezone: true }),
    createdBy: by('created_by'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('qb_paper_releases_paper_uq').on(t.paperId)],
);

/** A practical, viva or project sitting: a batch, a room, a time and the examiners. */
export const examPracticalSlots = pgTable(
  'exam_practical_slots',
  {
    id: id(),
    tenantId: tenantId(),
    sessionId: uuid('session_id').notNull().references(() => examSessions.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id').notNull().references(() => subjects.id),
    kind: text('kind').notNull().default('practical'), // practical | viva | project
    batchLabel: text('batch_label').notNull().default(''),
    roomId: uuid('room_id').references(() => rooms.id, { onDelete: 'set null' }),
    slotDate: date('slot_date').notNull(),
    startsAt: time('starts_at').notNull(),
    endsAt: time('ends_at').notNull(),
    internalExaminerId: uuid('internal_examiner_id').notNull().references(() => users.id),
    externalExaminerName: text('external_examiner_name').notNull().default(''),
    externalExaminerOrg: text('external_examiner_org').notNull().default(''),
    maxMarks: marks('max_marks').notNull().default(0),
    status: text('status').notNull().default('scheduled'), // scheduled | done | cancelled
    createdBy: by('created_by'),
    createdAt: createdAt(),
  },
  (t) => [index('exam_practical_slots_session_idx').on(t.sessionId, t.slotDate)],
);

export const examPracticalCandidates = pgTable(
  'exam_practical_candidates',
  {
    id: id(),
    tenantId: tenantId(),
    slotId: uuid('slot_id').notNull().references(() => examPracticalSlots.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id),
    present: boolean('present'),
    marks: marks('marks'),
    remarks: text('remarks'),
  },
  (t) => [uniqueIndex('exam_practical_candidates_uq').on(t.slotId, t.studentId)],
);

/** One row per institution: the class bands (distinction, first class …) used on result sheets. */
export const resultClassBands = pgTable(
  'result_class_bands',
  {
    id: id(),
    tenantId: tenantId(),
    bands: jsonb('bands').$type<{ name: string; minPercent: number }[]>().notNull(),
    updatedBy: by('updated_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('result_class_bands_tenant_uq').on(t.tenantId)],
);

/** A bulk normalisation of one assessment's marks (scale, add, or lift to a pass floor); the before values are kept so it can be undone. */
export const markNormalisations = pgTable('mark_normalisations', {
  id: id(),
  tenantId: tenantId(),
  assessmentId: uuid('assessment_id').notNull().references(() => assessments.id, { onDelete: 'cascade' }),
  method: text('method').notNull(), // scale | add | floor
  value: numeric('value', { precision: 8, scale: 3, mode: 'number' }).notNull(),
  affected: integer('affected').notNull().default(0),
  before: jsonb('before').$type<{ studentId: string; moderated: number | null }[]>().notNull().default(sql`'[]'::jsonb`),
  reason: text('reason').notNull().default(''),
  appliedBy: by('applied_by'),
  appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
  revertedAt: timestamp('reverted_at', { withTimezone: true }),
});

// ---- Quality ------------------------------------------------------------------------------------------

/** An accreditation framework an institution builds for itself (or copies from a coded pack): a tree of criteria. */
export const accreditationFrameworks = pgTable('accreditation_frameworks', {
  id: id(),
  tenantId: tenantId(),
  body: text('body').notNull().default('custom'), // naac | nba | nirf | iqac | custom
  name: text('name').notNull(),
  version: text('version').notNull().default(''),
  status: text('status').notNull().default('draft'), // draft | active | archived
  createdBy: by('created_by'),
  createdAt: createdAt(),
});

export const accreditationCriteria = pgTable(
  'accreditation_criteria',
  {
    id: id(),
    tenantId: tenantId(),
    frameworkId: uuid('framework_id').notNull().references(() => accreditationFrameworks.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id'),
    code: text('code').notNull(),
    title: text('title').notNull(),
    metric: text('metric').notNull().default(''),
    unit: text('unit').notNull().default(''),
    target: numeric('target', { precision: 12, scale: 2, mode: 'number' }),
    actual: numeric('actual', { precision: 12, scale: 2, mode: 'number' }),
    weight: numeric('weight', { precision: 6, scale: 2, mode: 'number' }).notNull().default(1),
    ownerId: by('owner_id'),
    /** Where the evidence engine reads the figure from (placements, exams, surveys …); empty = entered by hand. */
    harvestSource: text('harvest_source').notNull().default(''),
    sort: integer('sort').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('accreditation_criteria_code_uq').on(t.frameworkId, t.code), index('accreditation_criteria_parent_idx').on(t.parentId)],
);

// ---- HR and payroll -----------------------------------------------------------------------------------

export const staffQualifications = pgTable(
  'staff_qualifications',
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // degree | certification | skill | experience
    title: text('title').notNull(),
    institution: text('institution').notNull().default(''),
    year: smallint('year'),
    level: text('level').notNull().default(''),
    verifiedBy: by('verified_by'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('staff_qualifications_user_idx').on(t.userId, t.kind)],
);

/** One rating of a teacher by a student, the head of department, a peer or the teacher themselves (criterion scores 1 to 5). */
export const teachingEvaluations = pgTable(
  'teaching_evaluations',
  {
    id: id(),
    tenantId: tenantId(),
    staffUserId: uuid('staff_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    academicYearId: uuid('academic_year_id').notNull().references(() => academicYears.id),
    subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'set null' }),
    raterKind: text('rater_kind').notNull(), // student | hod | peer | self
    /** Kept to stop repeat ratings; never returned for student ratings. */
    raterUserId: uuid('rater_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    scores: jsonb('scores').$type<Record<string, number>>().notNull(),
    average: numeric('average', { precision: 4, scale: 2, mode: 'number' }).notNull(),
    comment: text('comment').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [index('teaching_evaluations_staff_idx').on(t.staffUserId, t.academicYearId)],
);

/** Overtime, arrears, revisions and bonuses added to a month's payslip once approved. */
export const payrollAdjustments = pgTable(
  'payroll_adjustments',
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // overtime | arrear | bonus | recovery
    payMonth: text('pay_month').notNull(), // YYYY-MM
    hours: numeric('hours', { precision: 6, scale: 2, mode: 'number' }),
    ratePaise: paise('rate_paise'),
    amountPaise: paise('amount_paise').notNull(),
    reason: text('reason').notNull().default(''),
    status: text('status').notNull().default('pending'), // pending | approved | rejected
    runId: uuid('run_id').references(() => payrollRuns.id, { onDelete: 'set null' }),
    createdBy: by('created_by'),
    decidedBy: by('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('payroll_adjustments_month_idx').on(t.tenantId, t.payMonth, t.status)],
);

/** The institution's tax deduction details printed on Form 16. */
export const payrollTaxProfile = pgTable(
  'payroll_tax_profile',
  {
    id: id(),
    tenantId: tenantId(),
    tan: text('tan').notNull(),
    pan: text('pan').notNull(),
    deductorName: text('deductor_name').notNull(),
    deductorAddress: text('deductor_address').notNull().default(''),
    responsiblePerson: text('responsible_person').notNull().default(''),
    responsibleDesignation: text('responsible_designation').notNull().default(''),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('payroll_tax_profile_tenant_uq').on(t.tenantId)],
);

/** A tax deposit challan (TDS paid to the government) for a month. */
export const tdsChallans = pgTable(
  'tds_challans',
  {
    id: id(),
    tenantId: tenantId(),
    financialYear: text('financial_year').notNull(), // 2026-27
    payMonth: text('pay_month').notNull(), // YYYY-MM the deduction belongs to
    section: text('section').notNull().default('192'),
    bsrCode: text('bsr_code').notNull(),
    challanSerial: text('challan_serial').notNull(),
    depositedOn: date('deposited_on').notNull(),
    tdsPaise: paise('tds_paise').notNull(),
    interestPaise: paise('interest_paise').notNull().default(0),
    createdBy: by('created_by'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('tds_challans_uq').on(t.tenantId, t.bsrCode, t.challanSerial)],
);

// ---- Fees ---------------------------------------------------------------------------------------------

export const feeInstalmentPlans = pgTable('fee_instalment_plans', {
  id: id(),
  tenantId: tenantId(),
  name: text('name').notNull(),
  parts: jsonb('parts').$type<{ percent: number; dueAfterDays: number }[]>().notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
});

export const feeInstalments = pgTable(
  'fee_instalments',
  {
    id: id(),
    tenantId: tenantId(),
    invoiceId: uuid('invoice_id').notNull().references(() => feeInvoices.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id').references(() => feeInstalmentPlans.id, { onDelete: 'set null' }),
    seq: smallint('seq').notNull(),
    dueOn: date('due_on').notNull(),
    amountPaise: paise('amount_paise').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('fee_instalments_uq').on(t.invoiceId, t.seq)],
);

/** The late-fee rule: after the grace days a flat fine plus a daily amount, up to a cap. */
export const feeLateFeeRules = pgTable('fee_late_fee_rules', {
  id: id(),
  tenantId: tenantId(),
  name: text('name').notNull(),
  graceDays: integer('grace_days').notNull().default(0),
  flatPaise: paise('flat_paise').notNull().default(0),
  perDayPaise: paise('per_day_paise').notNull().default(0),
  capPaise: paise('cap_paise'),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
});

export const feeLateFees = pgTable(
  'fee_late_fees',
  {
    id: id(),
    tenantId: tenantId(),
    invoiceId: uuid('invoice_id').notNull().references(() => feeInvoices.id, { onDelete: 'cascade' }),
    ruleId: uuid('rule_id').references(() => feeLateFeeRules.id, { onDelete: 'set null' }),
    daysLate: integer('days_late').notNull(),
    appliedPaise: paise('applied_paise').notNull().default(0),
    waivedPaise: paise('waived_paise').notNull().default(0),
    waiveReason: text('waive_reason'),
    lastRunOn: date('last_run_on').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('fee_late_fees_invoice_uq').on(t.invoiceId)],
);

/** A student's advance or credit balance, as a ledger: advances in, adjustments against invoices out. */
export const studentCredits = pgTable(
  'student_credits',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    amountPaise: paise('amount_paise').notNull(), // + advance / credit note, - applied to an invoice or refunded
    kind: text('kind').notNull(), // advance | applied | refund | adjustment
    invoiceId: uuid('invoice_id').references(() => feeInvoices.id, { onDelete: 'set null' }),
    note: text('note').notNull().default(''),
    createdBy: by('created_by'),
    createdAt: createdAt(),
  },
  (t) => [index('student_credits_student_idx').on(t.studentId, t.createdAt)],
);

// ---- Assets and inventory -----------------------------------------------------------------------------

export const amcContracts = pgTable(
  'amc_contracts',
  {
    id: id(),
    tenantId: tenantId(),
    title: text('title').notNull(),
    assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),
    vendorId: uuid('vendor_id').references(() => invVendors.id, { onDelete: 'set null' }),
    vendorName: text('vendor_name').notNull().default(''),
    covers: text('covers').notNull().default(''),
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on').notNull(),
    costPaise: paise('cost_paise').notNull().default(0),
    visitsPerYear: smallint('visits_per_year').notNull().default(0),
    visitsDone: smallint('visits_done').notNull().default(0),
    contact: text('contact').notNull().default(''),
    status: text('status').notNull().default('active'), // active | cancelled
    createdBy: by('created_by'),
    createdAt: createdAt(),
  },
  (t) => [index('amc_contracts_end_idx').on(t.tenantId, t.endsOn)],
);

// ---- Library ------------------------------------------------------------------------------------------

export const libraryReservations = pgTable(
  'library_reservations',
  {
    id: id(),
    tenantId: tenantId(),
    bookId: uuid('book_id').notNull().references(() => libraryBooks.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('waiting'), // waiting | ready | fulfilled | cancelled | expired
    readyAt: timestamp('ready_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    loanId: uuid('loan_id').references(() => libraryLoans.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('library_reservations_book_idx').on(t.bookId, t.status, t.createdAt)],
);

export const libraryEresources = pgTable('library_eresources', {
  id: id(),
  tenantId: tenantId(),
  title: text('title').notNull(),
  kind: text('kind').notNull().default('ebook'), // ebook | journal | database | video | other
  publisher: text('publisher').notNull().default(''),
  url: text('url').notNull(),
  licenceUntil: date('licence_until'),
  seats: integer('seats'),
  status: text('status').notNull().default('active'), // active | retired
  createdBy: by('created_by'),
  createdAt: createdAt(),
});

export const libraryEresourceAccess = pgTable(
  'library_eresource_access',
  {
    id: id(),
    tenantId: tenantId(),
    resourceId: uuid('resource_id').notNull().references(() => libraryEresources.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    accessedAt: timestamp('accessed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('library_eresource_access_idx').on(t.resourceId, t.accessedAt)],
);

/** A library book or e-resource recommended for a curriculum topic. */
export const resourceTopicLinks = pgTable(
  'resource_topic_links',
  {
    id: id(),
    tenantId: tenantId(),
    topicId: uuid('topic_id').notNull().references(() => topics.id, { onDelete: 'cascade' }),
    resourceKind: text('resource_kind').notNull(), // book | eresource
    resourceId: uuid('resource_id').notNull(),
    createdBy: by('created_by'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('resource_topic_links_uq').on(t.topicId, t.resourceKind, t.resourceId)],
);

// ---- Hostel and canteen -------------------------------------------------------------------------------

/** Maintenance work raised from a hostel complaint (or directly): assigned, done, then checked by the warden. */
export const hostelWorkOrders = pgTable(
  'hostel_work_orders',
  {
    id: id(),
    tenantId: tenantId(),
    complaintId: uuid('complaint_id').references(() => hostelComplaints.id, { onDelete: 'set null' }),
    roomId: uuid('room_id').references(() => hostelRooms.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    category: text('category').notNull().default('general'),
    priority: text('priority').notNull().default('normal'), // low | normal | high | urgent
    assigneeName: text('assignee_name').notNull().default(''),
    assigneeUserId: by('assignee_user_id'),
    status: text('status').notNull().default('open'), // open | assigned | in_progress | done | verified | reopened
    dueOn: date('due_on'),
    costPaise: paise('cost_paise').notNull().default(0),
    note: text('note').notNull().default(''),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    verifiedBy: by('verified_by'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdBy: by('created_by'),
    createdAt: createdAt(),
  },
  (t) => [index('hostel_work_orders_status_idx').on(t.tenantId, t.status)],
);

/** Kitchen stock movements: purchases from vendors, use per meal and wastage, linked to the store's items. */
export const canteenStockLog = pgTable(
  'canteen_stock_log',
  {
    id: id(),
    tenantId: tenantId(),
    kind: text('kind').notNull(), // purchase | use | waste
    loggedOn: date('logged_on').notNull(),
    meal: text('meal'), // breakfast | lunch | snacks | dinner
    itemName: text('item_name').notNull(),
    invItemId: uuid('inv_item_id').references(() => invItems.id, { onDelete: 'set null' }),
    vendorId: uuid('vendor_id').references(() => invVendors.id, { onDelete: 'set null' }),
    purchaseOrderId: uuid('purchase_order_id').references(() => invPurchaseOrders.id, { onDelete: 'set null' }),
    quantity: numeric('quantity', { precision: 10, scale: 2, mode: 'number' }).notNull(),
    unit: text('unit').notNull().default('kg'),
    costPaise: paise('cost_paise').notNull().default(0),
    reason: text('reason').notNull().default(''),
    recordedBy: by('recorded_by'),
    createdAt: createdAt(),
  },
  (t) => [index('canteen_stock_log_idx').on(t.tenantId, t.loggedOn, t.kind)],
);

export const canteenFeedback = pgTable(
  'canteen_feedback',
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'set null' }),
    mealDate: date('meal_date').notNull(),
    meal: text('meal').notNull(),
    rating: smallint('rating').notNull(),
    comment: text('comment').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('canteen_feedback_uq').on(t.userId, t.mealDate, t.meal)],
);

// ---- Health, counselling and mentoring ----------------------------------------------------------------

/** How long sensitive records are kept, and whether they are deleted or stripped of the student link afterwards. */
export const retentionRules = pgTable(
  'retention_rules',
  {
    id: id(),
    tenantId: tenantId(),
    dataClass: text('data_class').notNull(), // health_visits | counselling | welfare
    retainMonths: integer('retain_months').notNull(),
    action: text('action').notNull().default('delete'), // delete | redact
    active: boolean('active').notNull().default(true),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    lastRunCount: integer('last_run_count'),
    updatedBy: by('updated_by'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('retention_rules_class_uq').on(t.tenantId, t.dataClass)],
);

/** Support set against an intervention plan (a remedial class, tutoring, a content pack), with the due date. */
export const interventionSupport = pgTable(
  'intervention_support',
  {
    id: id(),
    tenantId: tenantId(),
    planId: uuid('plan_id').notNull().references(() => interventionPlans.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // content | tutoring | remedial_class | counselling | other
    title: text('title').notNull(),
    ref: text('ref'),
    dueOn: date('due_on'),
    done: boolean('done').notNull().default(false),
    createdBy: by('created_by'),
    createdAt: createdAt(),
  },
  (t) => [index('intervention_support_plan_idx').on(t.planId)],
);

/** The risk score when a plan opened and again at reassessment; the plan's outcome follows from the change. */
export const interventionReassessments = pgTable(
  'intervention_reassessments',
  {
    id: id(),
    tenantId: tenantId(),
    planId: uuid('plan_id').notNull().references(() => interventionPlans.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    scoreBefore: smallint('score_before').notNull(),
    scoreAfter: smallint('score_after'),
    signalsBefore: jsonb('signals_before').$type<{ kind: string; value: number }[]>().notNull().default(sql`'[]'::jsonb`),
    signalsAfter: jsonb('signals_after').$type<{ kind: string; value: number }[]>(),
    dueOn: date('due_on').notNull(),
    assessedAt: timestamp('assessed_at', { withTimezone: true }),
    outcome: text('outcome'), // improved | no_change | worse
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('intervention_reassessments_plan_uq').on(t.planId)],
);

export const DEPTH_TABLES = [
  'qb_paper_releases',
  'exam_practical_slots',
  'exam_practical_candidates',
  'result_class_bands',
  'mark_normalisations',
  'accreditation_frameworks',
  'accreditation_criteria',
  'staff_qualifications',
  'teaching_evaluations',
  'payroll_adjustments',
  'payroll_tax_profile',
  'tds_challans',
  'fee_instalment_plans',
  'fee_instalments',
  'fee_late_fee_rules',
  'fee_late_fees',
  'student_credits',
  'amc_contracts',
  'library_reservations',
  'library_eresources',
  'library_eresource_access',
  'resource_topic_links',
  'hostel_work_orders',
  'canteen_stock_log',
  'canteen_feedback',
  'retention_rules',
  'intervention_support',
  'intervention_reassessments',
] as const;

