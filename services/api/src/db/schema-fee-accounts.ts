// Fees and accounts desk (migration 0132): approval workflows for concessions, refunds, write-offs and vouchers,
// the cheque register, day-end cash closing, month close and the module settings. Amounts are integer paise.
// Kept apart from schema.ts, which these tables reference.
import { sql } from 'drizzle-orm';
import { bigint, boolean, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { acctVouchers, feeInvoices, feePayments, feeRefunds, students, tenants, users } from './schema.js';
import type { TrailEntry } from './schema-fee-depth.js';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });
const paise = (name: string) => bigint(name, { mode: 'number' });
const userRef = (name: string) => uuid(name).references(() => users.id, { onDelete: 'set null' });

/** A concession, scholarship or sponsorship for one student; approved ones reduce the invoice. kind: concession, scholarship, sponsor, sibling, staff_ward or merit. */
export const feeConcessions = pgTable(
  'fee_concessions',
  {
    id: id(),
    tenantId: tenantId(),
    number: text('number').notNull(),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id').references(() => feeInvoices.id, { onDelete: 'set null' }),
    kind: text('kind').notNull(),
    sponsorName: text('sponsor_name'),
    percent: integer('percent'),
    amountPaise: paise('amount_paise').notNull(),
    appliedPaise: paise('applied_paise').notNull().default(0),
    reason: text('reason').notNull(),
    /** pending, approved, rejected or cancelled. */
    status: text('status').notNull().default('pending'),
    requestedBy: userRef('requested_by'),
    decidedBy: userRef('decided_by'),
    decidedAt: ts('decided_at'),
    decisionNote: text('decision_note'),
    createdAt: createdAt(),
    /** The concession type, the approval level reached, each decision so far and the heads it reduces (migration 0162). */
    typeId: uuid('type_id'),
    level: integer('level').notNull().default(0),
    trail: jsonb('trail').$type<TrailEntry[]>().notNull().default([]),
    headCodes: text('head_codes').array().notNull().default(sql`'{}'`),
  },
  (t) => [uniqueIndex('fee_concessions_number_uq').on(t.tenantId, t.number), index('fee_concessions_student_idx').on(t.studentId)],
);

/** One cheque or DD taken at the counter: received, deposited, cleared or bounced. */
export const feeCheques = pgTable(
  'fee_cheques',
  {
    id: id(),
    tenantId: tenantId(),
    paymentId: uuid('payment_id').notNull().references(() => feePayments.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    chequeNo: text('cheque_no').notNull(),
    bankName: text('bank_name').notNull(),
    chequeDate: date('cheque_date').notNull(),
    amountPaise: paise('amount_paise').notNull(),
    status: text('status').notNull().default('received'),
    depositedOn: date('deposited_on'),
    clearedOn: date('cleared_on'),
    bouncedOn: date('bounced_on'),
    bounceReason: text('bounce_reason'),
    bounceChargePaise: paise('bounce_charge_paise').notNull().default(0),
    chargeInvoiceId: uuid('charge_invoice_id').references(() => feeInvoices.id, { onDelete: 'set null' }),
    createdBy: userRef('created_by'),
    createdAt: createdAt(),
    /** The receipt the cheque paid (a bounce reverses all of it), and cheque or dd (migration 0163). */
    receiptId: uuid('receipt_id'),
    kind: text('kind').notNull().default('cheque'),
  },
  (t) => [uniqueIndex('fee_cheques_payment_uq').on(t.paymentId), index('fee_cheques_status_idx').on(t.tenantId, t.status)],
);

/** A refund asked for, approved, then paid out (the payout creates the fee_refunds row and its voucher). */
export const feeRefundRequests = pgTable(
  'fee_refund_requests',
  {
    id: id(),
    tenantId: tenantId(),
    number: text('number').notNull(),
    paymentId: uuid('payment_id').notNull().references(() => feePayments.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id').notNull().references(() => feeInvoices.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    amountPaise: paise('amount_paise').notNull(),
    reason: text('reason').notNull(),
    /** requested, approved, rejected or paid. */
    status: text('status').notNull().default('requested'),
    payMode: text('pay_mode'),
    payReference: text('pay_reference'),
    refundId: uuid('refund_id').references(() => feeRefunds.id, { onDelete: 'set null' }),
    requestedBy: userRef('requested_by'),
    decidedBy: userRef('decided_by'),
    decidedAt: ts('decided_at'),
    decisionNote: text('decision_note'),
    paidBy: userRef('paid_by'),
    paidAt: ts('paid_at'),
    createdAt: createdAt(),
    /** Approval level and trail, whether the refunded part stops being charged (a withdrawal), the rule's quote, the
     * payee's bank details for NEFT, and a reversal of a paid refund (migration 0163). */
    level: integer('level').notNull().default(0),
    trail: jsonb('trail').$type<TrailEntry[]>().notNull().default([]),
    closeDues: boolean('close_dues').notNull().default(false),
    quote: jsonb('quote').$type<Record<string, unknown> | null>(),
    payeeName: text('payee_name'),
    payeeAccount: text('payee_account'),
    payeeIfsc: text('payee_ifsc'),
    revertedBy: userRef('reverted_by'),
    revertedAt: ts('reverted_at'),
    revertReason: text('revert_reason'),
  },
  (t) => [uniqueIndex('fee_refund_requests_number_uq').on(t.tenantId, t.number)],
);

/** An unrecoverable balance written off after approval (posted as a journal to bad debts). */
export const feeWriteOffs = pgTable(
  'fee_write_offs',
  {
    id: id(),
    tenantId: tenantId(),
    number: text('number').notNull(),
    invoiceId: uuid('invoice_id').notNull().references(() => feeInvoices.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    amountPaise: paise('amount_paise').notNull(),
    reason: text('reason').notNull(),
    status: text('status').notNull().default('pending'),
    requestedBy: userRef('requested_by'),
    decidedBy: userRef('decided_by'),
    decidedAt: ts('decided_at'),
    decisionNote: text('decision_note'),
    voucherId: uuid('voucher_id').references(() => acctVouchers.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('fee_write_offs_number_uq').on(t.tenantId, t.number)],
);

export interface VoucherRequestLine {
  accountId: string;
  debitPaise: number;
  creditPaise: number;
}

/** A voucher entered by a clerk that posts to the books only once approved. */
export const acctVoucherRequests = pgTable(
  'acct_voucher_requests',
  {
    id: id(),
    tenantId: tenantId(),
    number: text('number').notNull(),
    voucherType: text('voucher_type').notNull(),
    voucherDate: date('voucher_date').notNull(),
    narration: text('narration').notNull().default(''),
    lines: jsonb('lines').$type<VoucherRequestLine[]>().notNull(),
    amountPaise: paise('amount_paise').notNull(),
    status: text('status').notNull().default('pending'),
    requestedBy: userRef('requested_by'),
    decidedBy: userRef('decided_by'),
    decidedAt: ts('decided_at'),
    decisionNote: text('decision_note'),
    voucherId: uuid('voucher_id').references(() => acctVouchers.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    /** Fund (books) and department (budget) of the voucher, and the budget warning the maker saw (migration 0164). */
    fundId: uuid('fund_id'),
    departmentId: uuid('department_id'),
    budgetNote: text('budget_note'),
  },
  (t) => [uniqueIndex('acct_voucher_requests_number_uq').on(t.tenantId, t.number)],
);

/** A cashier's day-end count against the cash receipts the system recorded; the accounts head verifies it. */
export const feeCashClosings = pgTable(
  'fee_cash_closings',
  {
    id: id(),
    tenantId: tenantId(),
    closingDate: date('closing_date').notNull(),
    cashierId: uuid('cashier_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    systemPaise: paise('system_paise').notNull(),
    countedPaise: paise('counted_paise').notNull(),
    receiptCount: integer('receipt_count').notNull().default(0),
    /** Note value in rupees to count, e.g. { "500": 12, "100": 7 }. */
    denominations: jsonb('denominations').$type<Record<string, number>>().notNull().default({}),
    note: text('note').notNull().default(''),
    /** submitted, verified or rejected. */
    status: text('status').notNull().default('submitted'),
    verifiedBy: userRef('verified_by'),
    verifiedAt: ts('verified_at'),
    decisionNote: text('decision_note'),
    createdAt: createdAt(),
    /** Who took the cash over from the cashier (migration 0163). */
    handedTo: userRef('handed_to'),
    handedAt: ts('handed_at'),
  },
  (t) => [uniqueIndex('fee_cash_closings_uq').on(t.tenantId, t.closingDate, t.cashierId)],
);

/** A closed month ("2026-09"): no voucher can be approved into it afterwards. */
export const acctPeriodCloses = pgTable(
  'acct_period_closes',
  {
    id: id(),
    tenantId: tenantId(),
    period: text('period').notNull(),
    closedBy: userRef('closed_by'),
    closedAt: ts('closed_at').notNull().defaultNow(),
    note: text('note').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('acct_period_closes_uq').on(t.tenantId, t.period)],
);

/** One level of an approval chain: the role that decides there, and the most it may approve on its own (rupees; null = any). */
export interface ChainStep {
  role: string;
  limitRupees: number | null;
}
/** What unpaid dues hold back, and from how much. */
export interface DuesBlock {
  hallTicket?: boolean;
  results?: boolean;
  tc?: boolean;
  minRupees?: number;
}
/** When reminders go out on their own: days before and after the due date, on which channels; and the daily summary. */
export interface ReminderSchedule {
  enabled?: boolean;
  daysBefore?: number[];
  daysAfter?: number[];
  channels?: ('app' | 'sms' | 'whatsapp')[];
  dailySummary?: boolean;
}
/** The gateway charge passed on to the payer: a percent, a flat amount, or both. */
export interface ConvenienceFee {
  percent?: number;
  flatRupees?: number;
}
/** A withdrawal refund band (UGC style): withdrawn up to `untilDays` after the course start, `percent` back less `deductionRupees`. */
export interface RefundSlab {
  untilDays: number | null;
  percent: number;
  deductionRupees: number;
}

export interface Series {
  prefix: string;
  next: number;
  pad: number;
  suffix?: string;
}
export interface FeeHead {
  code: string;
  name: string;
  /** GST percent (0 for exempt education services). */
  gstRate: number;
  /** Income account code the head posts to. */
  accountCode: string;
}
export interface PaymentModeSetting {
  mode: 'cash' | 'cheque' | 'dd' | 'online' | 'bank_transfer' | 'upi';
  enabled: boolean;
  accountCode: string;
}

/** The desk's settings: numbering series, fee heads, payment modes, gateway choice, account mappings and approval limits. */
export const feeAccountsSettings = pgTable(
  'fee_accounts_settings',
  {
    id: id(),
    tenantId: tenantId(),
    series: jsonb('series').$type<Record<string, Series>>().notNull().default({}),
    feeHeads: jsonb('fee_heads').$type<FeeHead[]>().notNull().default([]),
    paymentModes: jsonb('payment_modes').$type<PaymentModeSetting[]>().notNull().default([]),
    gateway: text('gateway').notNull().default('razorpay'),
    mappings: jsonb('mappings').$type<Record<string, string>>().notNull().default({}),
    approvals: jsonb('approvals').$type<Record<string, number | boolean>>().notNull().default({}),
    updatedBy: userRef('updated_by'),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    createdAt: createdAt(),
    /** Approval chains by kind (concession, refund, waiver, customPlan, receiptCancel), dues blocks, the reminder
     * schedule, the online convenience fee and the refund slabs (migration 0162). */
    chains: jsonb('chains').$type<Record<string, ChainStep[]>>().notNull().default({}),
    duesBlock: jsonb('dues_block').$type<DuesBlock>().notNull().default({}),
    reminders: jsonb('reminders').$type<ReminderSchedule>().notNull().default({}),
    convenience: jsonb('convenience').$type<ConvenienceFee>().notNull().default({}),
    refundRules: jsonb('refund_rules').$type<RefundSlab[]>().notNull().default([]),
  },
  (t) => [uniqueIndex('fee_accounts_settings_uq').on(t.tenantId)],
);
