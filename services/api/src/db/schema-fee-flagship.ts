// Fees flagship (migrations 0189, 0190, 0191): fee accounts (separate collecting entities with their own receipt
// series, bank and books), gateway webhook events kept once, payment links, the accrual postings of invoices,
// duplicate-payment flags, programme transfers and the reminder steps sent. Amounts are integer paise.
import { sql } from 'drizzle-orm';
import { bigint, boolean, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { acctAccounts, acctVouchers, feeInvoices, feePayments, students, tenants, users } from './schema.js';
import { acctFunds } from './schema-fee-depth.js';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });
const paise = (name: string) => bigint(name, { mode: 'number' });
const userRef = (name: string) => uuid(name).references(() => users.id, { onDelete: 'set null' });

/**
 * A fee account: one collecting entity of the institution (the trust, the college, the hostel) with its own receipt
 * number series, bank and cash ledgers, books (a fund), UPI id, 80G and GST registrations, Tally company and gateway
 * credentials. The default account takes every head that names none.
 */
export const feeAccounts = pgTable(
  'fee_accounts',
  {
    id: id(),
    tenantId: tenantId(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    legalName: text('legal_name').notNull().default(''),
    /** trust, institution, hostel, transport or other. */
    kind: text('kind').notNull().default('institution'),
    pan: text('pan'),
    gstin: text('gstin'),
    /** The 80G registration (for donation receipts). */
    reg80g: text('reg_80g'),
    address: text('address').notNull().default(''),
    fundId: uuid('fund_id').references(() => acctFunds.id, { onDelete: 'set null' }),
    bankAccountId: uuid('bank_account_id').references(() => acctAccounts.id, { onDelete: 'set null' }),
    cashAccountId: uuid('cash_account_id').references(() => acctAccounts.id, { onDelete: 'set null' }),
    /** The receipt series, e.g. "SET/{FY}/"; numbers restart each financial year. */
    receiptPrefix: text('receipt_prefix'),
    upiVpa: text('upi_vpa'),
    upiPayeeName: text('upi_payee_name'),
    tallyCompany: text('tally_company'),
    isDefault: boolean('is_default').notNull().default(false),
    active: boolean('active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('fee_accounts_code_uq').on(t.tenantId, t.code)],
);

/** A gateway's notice, kept once: the same event (a retried webhook) is acknowledged and not processed again. */
export const gatewayWebhookEvents = pgTable(
  'gateway_webhook_events',
  {
    id: id(),
    tenantId: tenantId(),
    provider: text('provider').notNull(),
    eventKey: text('event_key').notNull(),
    /** payment or refund. */
    kind: text('kind').notNull().default('payment'),
    orderId: text('order_id'),
    paymentId: uuid('payment_id').references(() => feePayments.id, { onDelete: 'set null' }),
    /** credited, already_paid, failed, amount_mismatch, unknown_order or ignored. */
    outcome: text('outcome').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('gateway_webhook_events_uq').on(t.tenantId, t.provider, t.eventKey)],
);

export interface LinkSend {
  channel: 'sms' | 'whatsapp' | 'email';
  to: string;
  at: string;
  ok: boolean;
  error?: string;
}

/**
 * A payment link sent to a family: opens a page that pays one fee (in full or, when allowed, in part) through the
 * fee account's gateway, until it expires. The token is kept only as a hash.
 */
export const feePaymentLinks = pgTable(
  'fee_payment_links',
  {
    id: id(),
    tenantId: tenantId(),
    tokenHash: text('token_hash').notNull(),
    number: text('number').notNull(),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id').notNull().references(() => feeInvoices.id, { onDelete: 'cascade' }),
    amountPaise: paise('amount_paise').notNull(),
    allowPartial: boolean('allow_partial').notNull().default(false),
    expiresAt: ts('expires_at').notNull(),
    /** active, paid, expired or cancelled. */
    status: text('status').notNull().default('active'),
    channels: text('channels').array().notNull().default(sql`'{}'`),
    sent: jsonb('sent').$type<LinkSend[]>().notNull().default([]),
    openedAt: ts('opened_at'),
    paymentId: uuid('payment_id').references(() => feePayments.id, { onDelete: 'set null' }),
    paidAt: ts('paid_at'),
    createdBy: userRef('created_by'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('fee_payment_links_token_uq').on(t.tokenHash), uniqueIndex('fee_payment_links_number_uq').on(t.tenantId, t.number), index('fee_payment_links_student_idx').on(t.studentId, t.status)],
);

/**
 * What the books were told about an invoice's head on the accrual basis: a charge (positive, receivable against
 * income) or a reduction (negative, an expense against the receivable), and the journal that posted it.
 * kind: fee, fine, bounce_charge, revision, concession, scholarship, waiver, write_off, withdrawal or adjustment.
 */
export const feeAccruals = pgTable(
  'fee_accruals',
  {
    id: id(),
    tenantId: tenantId(),
    invoiceId: uuid('invoice_id').notNull().references(() => feeInvoices.id, { onDelete: 'cascade' }),
    headCode: text('head_code').notNull(),
    kind: text('kind').notNull(),
    paise: paise('paise').notNull(),
    voucherId: uuid('voucher_id').references(() => acctVouchers.id, { onDelete: 'set null' }),
    note: text('note').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [index('fee_accruals_invoice_idx').on(t.invoiceId, t.headCode)],
);

/** A payment that looks like a duplicate, kept and flagged for a person to settle. */
export const feePaymentFlags = pgTable(
  'fee_payment_flags',
  {
    id: id(),
    tenantId: tenantId(),
    paymentId: uuid('payment_id').notNull().references(() => feePayments.id, { onDelete: 'cascade' }),
    otherPaymentId: uuid('other_payment_id').references(() => feePayments.id, { onDelete: 'set null' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull().default('duplicate'),
    /** same_reference, same_amount_day or paid_twice_online. */
    reason: text('reason').notNull(),
    amountPaise: paise('amount_paise').notNull(),
    /** open or resolved. */
    status: text('status').notNull().default('open'),
    /** not_duplicate, kept_as_advance or refunded. */
    resolution: text('resolution'),
    resolvedBy: userRef('resolved_by'),
    resolvedAt: ts('resolved_at'),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('fee_payment_flags_payment_uq').on(t.paymentId, t.kind), index('fee_payment_flags_status_idx').on(t.tenantId, t.status)],
);

/** A student moved to another programme or fee structure part way through the year, and how the fees were recalculated. */
export const feeProgrammeTransfers = pgTable(
  'fee_programme_transfers',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    fromStructureId: uuid('from_structure_id'),
    toStructureId: uuid('to_structure_id').notNull(),
    fromSectionId: uuid('from_section_id'),
    toSectionId: uuid('to_section_id'),
    effectiveOn: date('effective_on').notNull(),
    /** The share of the year the old structure is kept for. */
    usedPercent: integer('used_percent').notNull(),
    oldKeptPaise: paise('old_kept_paise').notNull().default(0),
    oldReducedPaise: paise('old_reduced_paise').notNull().default(0),
    newChargedPaise: paise('new_charged_paise').notNull().default(0),
    newInvoiceId: uuid('new_invoice_id').references(() => feeInvoices.id, { onDelete: 'set null' }),
    /** transfer or readmission. */
    kind: text('kind').notNull().default('transfer'),
    reason: text('reason').notNull(),
    createdBy: userRef('created_by'),
    createdAt: createdAt(),
  },
  (t) => [index('fee_programme_transfers_student_idx').on(t.studentId)],
);

/** One reminder step sent for an invoice on a channel to an audience (so each step goes out once). */
export const feeReminderSends = pgTable(
  'fee_reminder_sends',
  {
    id: id(),
    tenantId: tenantId(),
    invoiceId: uuid('invoice_id').notNull().references(() => feeInvoices.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    /** "d-7", "d0", "d+15". */
    step: text('step').notNull(),
    channel: text('channel').notNull(),
    audience: text('audience').notNull().default('family'),
    sentOn: date('sent_on').notNull(),
    balancePaise: paise('balance_paise').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('fee_reminder_sends_uq').on(t.invoiceId, t.step, t.channel, t.audience), index('fee_reminder_sends_day_idx').on(t.tenantId, t.sentOn)],
);
