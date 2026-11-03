// Library pass tables (migrations 0202, 0203): the circulation rules matrix, overdue notices, stock verification by
// copy, vendors, purchase orders and invoices, binding, and e-resource usage. Kept apart from schema.ts and
// schema-lht.ts, which they reference.
import { sql } from 'drizzle-orm';
import { bigint, boolean, date, index, integer, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { libraryLoans, libraryStockChecks, tenants, users } from './schema.js';
import { libraryEresources } from './schema-depth.js';
import { libraryBudgets, libraryCopies, libraryMemberCategories, libraryPeriodicals } from './schema-lht.js';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const paise = (name: string) => bigint(name, { mode: 'number' });
const by = (name: string) => uuid(name).references(() => users.id, { onDelete: 'set null' });
const ts = (name: string) => timestamp(name, { withTimezone: true });

/**
 * One cell of the circulation rules matrix: a member category (or every category) by material (or every material).
 * The most specific cell wins; a member with no matching cell uses their category's figures.
 */
export const libraryCircRules = pgTable('library_circ_rules', {
  id: id(),
  tenantId: tenantId(),
  categoryId: uuid('category_id').references(() => libraryMemberCategories.id, { onDelete: 'cascade' }),
  /** book | reference | thesis | cd | map | other; null for every material. */
  material: text('material'),
  loanDays: integer('loan_days').notNull(),
  /** Items of this material out at once (null: only the category's overall limit). */
  maxItems: integer('max_items'),
  finePaisePerDay: integer('fine_paise_per_day').notNull(),
  /** Days after the due date before the fine starts. */
  graceDays: integer('grace_days').notNull().default(0),
  /** The most a late fine on one loan can reach (0: no cap). */
  maxFinePaise: paise('max_fine_paise').notNull().default(0),
  maxRenewals: integer('max_renewals').notNull(),
  canReserve: boolean('can_reserve').notNull().default(true),
  note: text('note').notNull().default(''),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt(),
});

/** A notice sent about a loan: due soon, the first and second overdue notices and the final one. */
export const libraryOverdueNotices = pgTable(
  'library_overdue_notices',
  {
    id: id(),
    tenantId: tenantId(),
    loanId: uuid('loan_id').notNull().references(() => libraryLoans.id, { onDelete: 'cascade' }),
    /** due_soon | first | second | final */
    step: text('step').notNull(),
    daysOverdue: integer('days_overdue').notNull().default(0),
    /** The channels it went out on, comma-separated (app, sms, whatsapp). */
    channels: text('channels').notNull().default('app'),
    recipients: integer('recipients').notNull().default(0),
    sentBy: by('sent_by'),
    sentAt: ts('sent_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('library_overdue_notices_uq').on(t.loanId, t.step), index('library_overdue_notices_sent_idx').on(t.tenantId, t.sentAt)],
);

/** A copy found on the shelf during a stock verification, with the status it had before. */
export const libraryStockCheckCopies = pgTable(
  'library_stock_check_copies',
  {
    id: id(),
    tenantId: tenantId(),
    checkId: uuid('check_id').notNull().references(() => libraryStockChecks.id, { onDelete: 'cascade' }),
    copyId: uuid('copy_id').notNull().references(() => libraryCopies.id, { onDelete: 'cascade' }),
    priorStatus: text('prior_status').notNull(),
    scannedBy: by('scanned_by'),
    scannedAt: ts('scanned_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('library_stock_check_copies_uq').on(t.checkId, t.copyId)],
);

/** A bookseller, subscription agent, binder or e-resource vendor. */
export const libraryVendors = pgTable('library_vendors', {
  id: id(),
  tenantId: tenantId(),
  name: text('name').notNull(),
  /** books | journals | binder | eresources | other */
  kind: text('kind').notNull().default('books'),
  gstin: text('gstin').notNull().default(''),
  contactPerson: text('contact_person').notNull().default(''),
  phone: text('phone').notNull().default(''),
  email: text('email').notNull().default(''),
  address: text('address').notNull().default(''),
  /** The vendor's usual trade discount on books, in per cent. */
  discountPct: numeric('discount_pct', { precision: 5, scale: 2 }).notNull().default('0'),
  paymentTerms: text('payment_terms').notNull().default(''),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
});

/** A purchase order to one vendor; its lines are the approved acquisition requests placed on it. */
export const libraryPurchaseOrders = pgTable('library_purchase_orders', {
  id: id(),
  tenantId: tenantId(),
  number: text('number').notNull(),
  vendorId: uuid('vendor_id').notNull().references(() => libraryVendors.id),
  orderedOn: date('ordered_on'),
  expectedBy: date('expected_by'),
  discountPct: numeric('discount_pct', { precision: 5, scale: 2 }).notNull().default('0'),
  /** draft | sent | partly_received | received | closed | cancelled */
  status: text('status').notNull().default('draft'),
  note: text('note').notNull().default(''),
  createdBy: by('created_by'),
  sentAt: ts('sent_at'),
  createdAt: createdAt(),
});

/** A vendor's invoice for an order: gross, trade discount, GST and net. */
export const libraryInvoices = pgTable('library_invoices', {
  id: id(),
  tenantId: tenantId(),
  vendorId: uuid('vendor_id').notNull().references(() => libraryVendors.id),
  poId: uuid('po_id').references(() => libraryPurchaseOrders.id, { onDelete: 'set null' }),
  invoiceNo: text('invoice_no').notNull(),
  invoiceDate: date('invoice_date').notNull(),
  grossPaise: paise('gross_paise').notNull().default(0),
  discountPaise: paise('discount_paise').notNull().default(0),
  gstPaise: paise('gst_paise').notNull().default(0),
  netPaise: paise('net_paise').notNull().default(0),
  /** recorded | passed (for payment) | paid */
  status: text('status').notNull().default('recorded'),
  paidOn: date('paid_on'),
  paymentRef: text('payment_ref').notNull().default(''),
  note: text('note').notNull().default(''),
  createdBy: by('created_by'),
  createdAt: createdAt(),
});

/** Books and journal volumes sent to the binder together. */
export const libraryBindingBatches = pgTable('library_binding_batches', {
  id: id(),
  tenantId: tenantId(),
  number: text('number').notNull(),
  vendorId: uuid('vendor_id').references(() => libraryVendors.id, { onDelete: 'set null' }),
  sentOn: date('sent_on'),
  expectedOn: date('expected_on'),
  receivedOn: date('received_on'),
  /** draft | sent | received | cancelled */
  status: text('status').notNull().default('draft'),
  costPaise: paise('cost_paise').notNull().default(0),
  budgetId: uuid('budget_id').references(() => libraryBudgets.id, { onDelete: 'set null' }),
  note: text('note').notNull().default(''),
  createdBy: by('created_by'),
  createdAt: createdAt(),
});

/** One copy (or a periodical's volume) in a binding batch, with its status before it went. */
export const libraryBindingItems = pgTable(
  'library_binding_items',
  {
    id: id(),
    tenantId: tenantId(),
    batchId: uuid('batch_id').notNull().references(() => libraryBindingBatches.id, { onDelete: 'cascade' }),
    copyId: uuid('copy_id').references(() => libraryCopies.id, { onDelete: 'cascade' }),
    periodicalId: uuid('periodical_id').references(() => libraryPeriodicals.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    priorStatus: text('prior_status').notNull().default('available'),
    instructions: text('instructions').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('library_binding_items_copy_uq').on(t.batchId, t.copyId)],
);

/** A month of an e-resource's use from the provider's (COUNTER) report: sessions, searches and downloads. */
export const libraryEresourceUsage = pgTable(
  'library_eresource_usage',
  {
    id: id(),
    tenantId: tenantId(),
    resourceId: uuid('resource_id').notNull().references(() => libraryEresources.id, { onDelete: 'cascade' }),
    /** YYYY-MM */
    month: text('month').notNull(),
    sessions: integer('sessions').notNull().default(0),
    searches: integer('searches').notNull().default(0),
    downloads: integer('downloads').notNull().default(0),
    /** provider (their usage report) | manual */
    source: text('source').notNull().default('provider'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('library_eresource_usage_uq').on(t.resourceId, t.month)],
);
