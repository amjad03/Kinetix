// Fees and accounts depth (migrations 0162, 0163, 0164): fee heads as records, student fee profiles, invoice lines and
// payment allocations by head, assignments, concession types, approval chains, fine waivers, one-student instalment
// plans, multi-mode receipts, bank challans, government scholarships, carried-forward dues, the reminder log, funds,
// and bank statements for reconciliation. Amounts are integer paise. Kept apart from schema.ts, which these reference.
import { sql } from 'drizzle-orm';
import { bigint, boolean, date, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { acctAccounts, acctVouchers, feeInvoices, feePayments, settlementBatches, students, tenants, users } from './schema.js';
import { feeStructures } from './schema-g1.js';
import { feeLateFees } from './schema-depth.js';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });
const paise = (name: string) => bigint(name, { mode: 'number' });
const userRef = (name: string) => uuid(name).references(() => users.id, { onDelete: 'set null' });
const studentRef = () => uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' });

/** One step of an approval: who decided at which level, and how. */
export interface TrailEntry {
  level: number;
  role: string;
  by: string;
  byName?: string;
  at: string;
  decision: 'approve' | 'reject' | 'forward';
  comment: string;
}

/**
 * A fee head (Tuition, Transport…): its allocation priority (`sort_order`, lower is paid first), the income ledger and
 * fund it posts to, GST rate and SAC, whether it is refundable, and whether it is optional (charged only to students in
 * the linked module: transport, hostel, or opted in).
 */
export const feeHeads = pgTable(
  'fee_heads',
  {
    id: id(),
    tenantId: tenantId(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    /** tuition, exam, lab, transport, hostel, uniform, books, library, fine, deposit or other. */
    kind: text('kind').notNull().default('other'),
    sortOrder: integer('sort_order').notNull().default(0),
    accountCode: text('account_code').notNull().default('4000'),
    fundCode: text('fund_code'),
    gstRate: numeric('gst_rate', { precision: 5, scale: 2, mode: 'number' }).notNull().default(0),
    sac: text('sac'),
    refundable: boolean('refundable').notNull().default(true),
    optional: boolean('optional').notNull().default(false),
    /** none, transport, hostel or opt_in. */
    linkedModule: text('linked_module').notNull().default('none'),
    /** Receipts made only of this head take their own series, e.g. "TRN/{FY}/". */
    receiptPrefix: text('receipt_prefix'),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('fee_heads_code_uq').on(t.tenantId, t.code)],
);

/** What a student's fees depend on beyond the class: quota, category, admission batch and optional heads chosen. */
export const feeStudentProfiles = pgTable(
  'fee_student_profiles',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: studentRef(),
    quota: text('quota'),
    category: text('category'),
    batch: text('batch'),
    optedHeads: text('opted_heads').array().notNull().default(sql`'{}'`),
    note: text('note').notNull().default(''),
    createdAt: createdAt(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('fee_student_profiles_student_uq').on(t.studentId)],
);

/** An invoice's charge by head; `waived_paise` is what concessions, write-offs and waivers took off the head. */
export const feeInvoiceLines = pgTable(
  'fee_invoice_lines',
  {
    id: id(),
    tenantId: tenantId(),
    invoiceId: uuid('invoice_id').notNull().references(() => feeInvoices.id, { onDelete: 'cascade' }),
    headCode: text('head_code').notNull(),
    headName: text('head_name').notNull(),
    priority: integer('priority').notNull().default(0),
    amountPaise: paise('amount_paise').notNull(),
    waivedPaise: paise('waived_paise').notNull().default(0),
    gstRate: numeric('gst_rate', { precision: 5, scale: 2, mode: 'number' }).notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('fee_invoice_lines_invoice_idx').on(t.invoiceId, t.priority)],
);

/** A fee structure given to a student, the invoice it raised and the share charged (100, or less for a late joiner). */
export const feeAssignments = pgTable(
  'fee_assignments',
  {
    id: id(),
    tenantId: tenantId(),
    structureId: uuid('structure_id').notNull().references(() => feeStructures.id, { onDelete: 'cascade' }),
    studentId: studentRef(),
    invoiceId: uuid('invoice_id').references(() => feeInvoices.id, { onDelete: 'set null' }),
    amountPaise: paise('amount_paise').notNull(),
    prorataPercent: integer('prorata_percent').notNull().default(100),
    /** active or superseded. */
    status: text('status').notNull().default('active'),
    assignedBy: userRef('assigned_by'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('fee_assignments_active_uq').on(t.structureId, t.studentId).where(sql`status = 'active'`)],
);

/** A kind of concession or scholarship (merit, sibling, staff ward, sports, government…) with its default value and heads. */
export const feeConcessionTypes = pgTable('fee_concession_types', {
  id: id(),
  tenantId: tenantId(),
  name: text('name').notNull(),
  /** merit, sibling, staff_ward, sports, government, need, management or other. */
  category: text('category').notNull().default('other'),
  /** percent or amount. */
  mode: text('mode').notNull().default('percent'),
  percent: integer('percent'),
  amountPaise: paise('amount_paise'),
  /** Heads it applies to; empty means every head. */
  headCodes: text('head_codes').array().notNull().default(sql`'{}'`),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt(),
});

/** A request to waive (part of) a late fee; it goes up the waiver approval chain. */
export const feeWaiverRequests = pgTable(
  'fee_waiver_requests',
  {
    id: id(),
    tenantId: tenantId(),
    number: text('number').notNull(),
    lateFeeId: uuid('late_fee_id').notNull().references(() => feeLateFees.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id').notNull().references(() => feeInvoices.id, { onDelete: 'cascade' }),
    studentId: studentRef(),
    amountPaise: paise('amount_paise').notNull(),
    reason: text('reason').notNull(),
    status: text('status').notNull().default('pending'),
    level: integer('level').notNull().default(0),
    trail: jsonb('trail').$type<TrailEntry[]>().notNull().default([]),
    requestedBy: userRef('requested_by'),
    decidedBy: userRef('decided_by'),
    decidedAt: ts('decided_at'),
    decisionNote: text('decision_note'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('fee_waiver_requests_number_uq').on(t.tenantId, t.number)],
);

export interface CustomPart {
  dueOn: string;
  amountPaise: number;
}

/** An instalment schedule made for one student's invoice; it applies once the chain approves it. */
export const feeCustomPlans = pgTable(
  'fee_custom_plans',
  {
    id: id(),
    tenantId: tenantId(),
    number: text('number').notNull(),
    invoiceId: uuid('invoice_id').notNull().references(() => feeInvoices.id, { onDelete: 'cascade' }),
    studentId: studentRef(),
    parts: jsonb('parts').$type<CustomPart[]>().notNull(),
    reason: text('reason').notNull(),
    status: text('status').notNull().default('pending'),
    level: integer('level').notNull().default(0),
    trail: jsonb('trail').$type<TrailEntry[]>().notNull().default([]),
    requestedBy: userRef('requested_by'),
    decidedBy: userRef('decided_by'),
    decidedAt: ts('decided_at'),
    decisionNote: text('decision_note'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('fee_custom_plans_number_uq').on(t.tenantId, t.number)],
);

export interface ReceiptMode {
  method: string;
  amountPaise: number;
  reference?: string | null;
  chequeNo?: string | null;
  bankName?: string | null;
  chequeDate?: string | null;
}

/**
 * A receipt as the family holds it: one number for everything paid together (several fees, several modes). Its
 * payments (fee_payments.receipt_id) carry the money per fee and mode. Never deleted: cancelled with a reason and an
 * approval, and reissued under a new number when needed.
 */
export const feeReceipts = pgTable(
  'fee_receipts',
  {
    id: id(),
    tenantId: tenantId(),
    receiptNo: text('receipt_no').notNull(),
    studentId: studentRef(),
    totalPaise: paise('total_paise').notNull(),
    /** The part kept as advance credit (more than was due). */
    advancePaise: paise('advance_paise').notNull().default(0),
    modes: jsonb('modes').$type<ReceiptMode[]>().notNull().default([]),
    /** active, cancel_pending, cancelled or bounced. */
    status: text('status').notNull().default('active'),
    note: text('note').notNull().default(''),
    cancelReason: text('cancel_reason'),
    cancelRequestedBy: userRef('cancel_requested_by'),
    cancelRequestedAt: ts('cancel_requested_at'),
    cancelledBy: userRef('cancelled_by'),
    cancelledAt: ts('cancelled_at'),
    reissueOf: uuid('reissue_of'),
    printCount: integer('print_count').notNull().default(0),
    lastPrintedAt: ts('last_printed_at'),
    collectedBy: userRef('collected_by'),
    collectedOn: date('collected_on').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('fee_receipts_no_uq').on(t.tenantId, t.receiptNo), index('fee_receipts_student_idx').on(t.studentId, t.collectedOn), index('fee_receipts_day_idx').on(t.tenantId, t.collectedOn)],
);

/** How much of a payment went to which head of which invoice (refunds add negative rows). */
export const feePaymentAllocations = pgTable(
  'fee_payment_allocations',
  {
    id: id(),
    tenantId: tenantId(),
    paymentId: uuid('payment_id').notNull().references(() => feePayments.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id').notNull().references(() => feeInvoices.id, { onDelete: 'cascade' }),
    lineId: uuid('line_id').references(() => feeInvoiceLines.id, { onDelete: 'set null' }),
    headCode: text('head_code').notNull(),
    amountPaise: paise('amount_paise').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('fee_payment_allocations_payment_idx').on(t.paymentId), index('fee_payment_allocations_invoice_idx').on(t.invoiceId)],
);

/** A bank challan: the family pays it at the bank; the bank's file marks it paid and the receipt follows. */
export const feeChallans = pgTable(
  'fee_challans',
  {
    id: id(),
    tenantId: tenantId(),
    number: text('number').notNull(),
    studentId: studentRef(),
    invoiceIds: uuid('invoice_ids').array().notNull().default(sql`'{}'`),
    amountPaise: paise('amount_paise').notNull(),
    bankName: text('bank_name').notNull(),
    bankAccount: text('bank_account').notNull().default(''),
    validUntil: date('valid_until').notNull(),
    /** issued, paid, expired or cancelled. */
    status: text('status').notNull().default('issued'),
    paidOn: date('paid_on'),
    bankRef: text('bank_ref'),
    receiptId: uuid('receipt_id').references(() => feeReceipts.id, { onDelete: 'set null' }),
    createdBy: userRef('created_by'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('fee_challans_number_uq').on(t.tenantId, t.number), index('fee_challans_status_idx').on(t.tenantId, t.status)],
);

/** A government (DBT) scholarship a student applied for: applied → sanctioned → received; money received pays dues. */
export const feeGovtScholarships = pgTable(
  'fee_govt_scholarships',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: studentRef(),
    scheme: text('scheme').notNull(),
    /** nsp (National Scholarship Portal), state, institution or other. */
    portal: text('portal').notNull().default('state'),
    applicationNo: text('application_no').notNull(),
    academicYear: text('academic_year').notNull(),
    /** applied, sanctioned, received, rejected or lapsed. */
    status: text('status').notNull().default('applied'),
    appliedPaise: paise('applied_paise').notNull().default(0),
    appliedOn: date('applied_on'),
    sanctionedPaise: paise('sanctioned_paise').notNull().default(0),
    sanctionedOn: date('sanctioned_on'),
    receivedPaise: paise('received_paise').notNull().default(0),
    receivedOn: date('received_on'),
    reference: text('reference'),
    note: text('note').notNull().default(''),
    receiptId: uuid('receipt_id').references(() => feeReceipts.id, { onDelete: 'set null' }),
    createdBy: userRef('created_by'),
    createdAt: createdAt(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('fee_govt_scholarships_app_uq').on(t.tenantId, t.portal, t.applicationNo), index('fee_govt_scholarships_student_idx').on(t.studentId)],
);

/** Dues moved from an invoice of one year to an arrears invoice of the next. */
export const feeCarryForwards = pgTable(
  'fee_carry_forwards',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: studentRef(),
    fromYear: text('from_year').notNull(),
    toYear: text('to_year').notNull(),
    fromInvoiceId: uuid('from_invoice_id').notNull().references(() => feeInvoices.id, { onDelete: 'cascade' }),
    toInvoiceId: uuid('to_invoice_id').notNull().references(() => feeInvoices.id, { onDelete: 'cascade' }),
    amountPaise: paise('amount_paise').notNull(),
    createdBy: userRef('created_by'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('fee_carry_forwards_from_uq').on(t.fromInvoiceId)],
);

/** One run of the fee reminders (the schedule or a person), with what went out on each channel. */
export const feeReminderRuns = pgTable(
  'fee_reminder_runs',
  {
    id: id(),
    tenantId: tenantId(),
    runOn: date('run_on').notNull(),
    kind: text('kind').notNull().default('scheduled'),
    students: integer('students').notNull().default(0),
    app: integer('app').notNull().default(0),
    sms: integer('sms').notNull().default(0),
    whatsapp: integer('whatsapp').notNull().default(0),
    skipped: jsonb('skipped').$type<string[]>().notNull().default([]),
    runBy: userRef('run_by'),
    createdAt: createdAt(),
  },
  (t) => [index('fee_reminder_runs_day_idx').on(t.tenantId, t.runOn)],
);

/** A fund kept as its own set of books (trust, college, hostel): vouchers name their fund and reports filter by it. */
export const acctFunds = pgTable(
  'acct_funds',
  {
    id: id(),
    tenantId: tenantId(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    note: text('note').notNull().default(''),
    active: boolean('active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('acct_funds_code_uq').on(t.tenantId, t.code)],
);

/** A bank statement imported for one bank ledger. */
export const acctBankStatements = pgTable('acct_bank_statements', {
  id: id(),
  tenantId: tenantId(),
  accountId: uuid('account_id').notNull().references(() => acctAccounts.id, { onDelete: 'cascade' }),
  fileName: text('file_name').notNull(),
  fromDate: date('from_date').notNull(),
  toDate: date('to_date').notNull(),
  closingPaise: paise('closing_paise'),
  lineCount: integer('line_count').notNull().default(0),
  matchedCount: integer('matched_count').notNull().default(0),
  importedBy: userRef('imported_by'),
  createdAt: createdAt(),
});

/** One line of a bank statement, matched to the voucher (or gateway settlement) it is, or left for a person. */
export const acctBankLines = pgTable(
  'acct_bank_lines',
  {
    id: id(),
    tenantId: tenantId(),
    statementId: uuid('statement_id').notNull().references(() => acctBankStatements.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id').notNull().references(() => acctAccounts.id, { onDelete: 'cascade' }),
    txnDate: date('txn_date').notNull(),
    description: text('description').notNull().default(''),
    reference: text('reference').notNull().default(''),
    /** Money out of the bank (withdrawal). */
    debitPaise: paise('debit_paise').notNull().default(0),
    /** Money into the bank (deposit). */
    creditPaise: paise('credit_paise').notNull().default(0),
    balancePaise: paise('balance_paise'),
    /** unmatched, matched or ignored. */
    status: text('status').notNull().default('unmatched'),
    voucherId: uuid('voucher_id').references(() => acctVouchers.id, { onDelete: 'set null' }),
    settlementBatchId: uuid('settlement_batch_id').references(() => settlementBatches.id, { onDelete: 'set null' }),
    matchKind: text('match_kind'),
    matchedBy: userRef('matched_by'),
    matchedAt: ts('matched_at'),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [index('acct_bank_lines_statement_idx').on(t.statementId), index('acct_bank_lines_status_idx').on(t.tenantId, t.accountId, t.status), uniqueIndex('acct_bank_lines_voucher_uq').on(t.voucherId).where(sql`voucher_id is not null`)],
);

/**
 * The principal letting a student's hall ticket, result or transfer certificate through although fee dues hold it
 * (migration 0181). Active until revoked; each grant and revoke is audited.
 */
export const feeHoldOverrides = pgTable(
  'fee_hold_overrides',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: studentRef(),
    /** hallTicket | results | tc */
    purpose: text('purpose').notNull(),
    reason: text('reason').notNull(),
    grantedBy: userRef('granted_by'),
    revokedAt: ts('revoked_at'),
    revokedBy: userRef('revoked_by'),
    createdAt: createdAt(),
  },
  (t) => [index('fee_hold_overrides_student_idx').on(t.studentId, t.purpose)],
);
