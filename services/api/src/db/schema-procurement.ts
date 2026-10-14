// Procurement, stores, assets and facilities depth (migrations 0171, 0172): item categories with approved vendors,
// vendor ratings, rate contracts, the approval trail of indents and orders, order amendments, debit notes, stock
// verification, the gate register, asset transfers and condemnation, facility bookings and maintenance tickets.
// Kept apart from schema.ts, which they reference.
import { sql } from 'drizzle-orm';
import { bigint, boolean, check, date, index, integer, jsonb, pgTable, smallint, text, time, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { assets, departments, invGoodsReceipts, invInvoices, invItems, invPurchaseOrders, invRequisitions, invReturns, invStores, invVendors, rooms, tenants, users } from './schema.js';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const paise = (name: string) => bigint(name, { mode: 'number' });
const by = (name: string) => uuid(name).references(() => users.id, { onDelete: 'set null' });

/** Item categories (stationery, lab chemicals, IT consumables…); items carry the category's name. */
export const invCategories = pgTable(
  'inv_categories',
  { id: id(), tenantId: tenantId(), name: text('name').notNull(), description: text('description').notNull().default(''), createdAt: createdAt() },
  (t) => [uniqueIndex('inv_categories_name_uq').on(t.tenantId, sql`lower(${t.name})`)],
);

/** The approved vendor list of a category: orders for its items go to these vendors only (when the list is not empty). */
export const invApprovedVendors = pgTable(
  'inv_approved_vendors',
  {
    id: id(),
    tenantId: tenantId(),
    categoryId: uuid('category_id').notNull().references(() => invCategories.id, { onDelete: 'cascade' }),
    vendorId: uuid('vendor_id').notNull().references(() => invVendors.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('inv_approved_vendors_uq').on(t.categoryId, t.vendorId)],
);

/** A rating of a vendor's supply (quality, delivery, price; 1 to 5), usually after an order. */
export const invVendorRatings = pgTable(
  'inv_vendor_ratings',
  {
    id: id(),
    tenantId: tenantId(),
    vendorId: uuid('vendor_id').notNull().references(() => invVendors.id, { onDelete: 'cascade' }),
    poId: uuid('po_id').references(() => invPurchaseOrders.id, { onDelete: 'set null' }),
    quality: smallint('quality').notNull(),
    delivery: smallint('delivery').notNull(),
    price: smallint('price').notNull(),
    note: text('note').notNull().default(''),
    ratedBy: by('rated_by'),
    createdAt: createdAt(),
  },
  (t) => [index('inv_vendor_ratings_vendor_idx').on(t.vendorId)],
);

/** A rate contract: the agreed price of an item from a vendor for a period. */
export const invRateContracts = pgTable(
  'inv_rate_contracts',
  {
    id: id(),
    tenantId: tenantId(),
    vendorId: uuid('vendor_id').notNull().references(() => invVendors.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id').notNull().references(() => invItems.id, { onDelete: 'cascade' }),
    ratePaise: paise('rate_paise').notNull(),
    validFrom: date('valid_from').notNull(),
    validTo: date('valid_to').notNull(),
    reference: text('reference').notNull().default(''),
    active: boolean('active').notNull().default(true),
    createdBy: by('created_by'),
    createdAt: createdAt(),
  },
  (t) => [index('inv_rate_contracts_item_idx').on(t.itemId, t.validTo), check('inv_rate_contracts_dates_ck', sql`${t.validTo} >= ${t.validFrom}`)],
);

/** Each decision on an indent or a purchase order: the step, who decided, the note and any budget override. */
export const invApprovals = pgTable(
  'inv_approvals',
  {
    id: id(),
    tenantId: tenantId(),
    requisitionId: uuid('requisition_id').references(() => invRequisitions.id, { onDelete: 'cascade' }),
    poId: uuid('po_id').references(() => invPurchaseOrders.id, { onDelete: 'cascade' }),
    /** hod, principal (indents) or order (purchase orders). */
    step: text('step').notNull(),
    decision: text('decision').notNull(),
    note: text('note'),
    budgetOverride: boolean('budget_override').notNull().default(false),
    decidedBy: by('decided_by'),
    createdAt: createdAt(),
  },
  (t) => [index('inv_approvals_req_idx').on(t.requisitionId), index('inv_approvals_po_idx').on(t.poId)],
);

/** An approved order changed afterwards: what it was and what it became; the order goes back for approval. */
export const invPoAmendments = pgTable('inv_po_amendments', {
  id: id(),
  tenantId: tenantId(),
  poId: uuid('po_id').notNull().references(() => invPurchaseOrders.id, { onDelete: 'cascade' }),
  amendmentNo: integer('amendment_no').notNull(),
  reason: text('reason').notNull(),
  before: jsonb('before').notNull(),
  after: jsonb('after').notNull(),
  amendedBy: by('amended_by'),
  createdAt: createdAt(),
});

/** A debit note to a vendor: goods rejected at receipt or returned later; open until set off against an invoice. */
export const invDebitNotes = pgTable(
  'inv_debit_notes',
  {
    id: id(),
    tenantId: tenantId(),
    number: text('number').notNull(),
    vendorId: uuid('vendor_id').notNull().references(() => invVendors.id),
    poId: uuid('po_id').notNull().references(() => invPurchaseOrders.id),
    receiptId: uuid('receipt_id').references(() => invGoodsReceipts.id, { onDelete: 'set null' }),
    returnId: uuid('return_id').references(() => invReturns.id, { onDelete: 'set null' }),
    amountPaise: paise('amount_paise').notNull(),
    reason: text('reason').notNull(),
    /** open | adjusted */
    status: text('status').notNull().default('open'),
    invoiceId: uuid('invoice_id').references(() => invInvoices.id, { onDelete: 'set null' }),
    createdBy: by('created_by'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('inv_debit_notes_number_uq').on(t.tenantId, t.number), index('inv_debit_notes_po_idx').on(t.poId)],
);

/** A physical stock verification of a store (the annual lab audit): book against counted, and the adjustment on close. */
export const invStockVerifications = pgTable(
  'inv_stock_verifications',
  {
    id: id(),
    tenantId: tenantId(),
    number: text('number').notNull(),
    storeId: uuid('store_id').notNull().references(() => invStores.id),
    fiscalYear: text('fiscal_year').notNull(),
    /** open | closed */
    status: text('status').notNull().default('open'),
    note: text('note').notNull().default(''),
    startedBy: by('started_by'),
    closedBy: by('closed_by'),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('inv_stock_verifications_number_uq').on(t.tenantId, t.number)],
);

export const invStockVerificationLines = pgTable(
  'inv_stock_verification_lines',
  {
    id: id(),
    tenantId: tenantId(),
    verificationId: uuid('verification_id').notNull().references(() => invStockVerifications.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id').notNull().references(() => invItems.id),
    bookQty: integer('book_qty').notNull(),
    countedQty: integer('counted_qty'),
    remark: text('remark').notNull().default(''),
    countedBy: by('counted_by'),
    countedAt: timestamp('counted_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('inv_stock_verification_lines_uq').on(t.verificationId, t.itemId)],
);

/** The gate register: goods coming in or going out, and returnable items out for repair or loan until they come back. */
export const invGateEntries = pgTable(
  'inv_gate_entries',
  {
    id: id(),
    tenantId: tenantId(),
    number: text('number').notNull(),
    /** in | out */
    direction: text('direction').notNull(),
    /** goods | returnable | non_returnable */
    kind: text('kind').notNull().default('goods'),
    party: text('party').notNull(),
    vehicleNo: text('vehicle_no').notNull().default(''),
    description: text('description').notNull(),
    qty: integer('qty').notNull().default(1),
    documentNo: text('document_no').notNull().default(''),
    poId: uuid('po_id').references(() => invPurchaseOrders.id, { onDelete: 'set null' }),
    expectedReturnOn: date('expected_return_on'),
    returnedOn: date('returned_on'),
    /** open | returned | closed */
    status: text('status').notNull().default('open'),
    note: text('note').notNull().default(''),
    recordedBy: by('recorded_by'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('inv_gate_entries_number_uq').on(t.tenantId, t.number), index('inv_gate_entries_at_idx').on(t.tenantId, t.createdAt)],
);

/** An asset moved to another place, room or department. */
export const assetTransfers = pgTable(
  'asset_transfers',
  {
    id: id(),
    tenantId: tenantId(),
    assetId: uuid('asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
    fromLocation: text('from_location').notNull().default(''),
    toLocation: text('to_location').notNull().default(''),
    fromRoomId: uuid('from_room_id').references(() => rooms.id, { onDelete: 'set null' }),
    toRoomId: uuid('to_room_id').references(() => rooms.id, { onDelete: 'set null' }),
    fromDepartmentId: uuid('from_department_id').references(() => departments.id, { onDelete: 'set null' }),
    toDepartmentId: uuid('to_department_id').references(() => departments.id, { onDelete: 'set null' }),
    reason: text('reason').notNull(),
    transferredOn: date('transferred_on').notNull(),
    createdBy: by('created_by'),
    createdAt: createdAt(),
  },
  (t) => [index('asset_transfers_asset_idx').on(t.assetId, t.transferredOn)],
);

/** Condemnation: an asset proposed for write-off, decided by the committee, then written off (disposed of). */
export const assetCondemnations = pgTable(
  'asset_condemnations',
  {
    id: id(),
    tenantId: tenantId(),
    number: text('number').notNull(),
    assetId: uuid('asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(),
    condition: text('condition').notNull().default(''),
    proposedBy: by('proposed_by'),
    /** proposed | approved | rejected | written_off */
    status: text('status').notNull().default('proposed'),
    committeeNote: text('committee_note'),
    decidedBy: by('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    /** auction | scrap | donate | buyback */
    disposalMode: text('disposal_mode'),
    realisedPaise: paise('realised_paise'),
    writtenOffOn: date('written_off_on'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('asset_condemnations_number_uq').on(t.tenantId, t.number), uniqueIndex('asset_condemnations_open_uq').on(t.assetId).where(sql`status in ('proposed', 'approved')`)],
);

/** A booking of a hall, lab or room: checked against other bookings and the timetable, then approved. */
export const facilityBookings = pgTable(
  'facility_bookings',
  {
    id: id(),
    tenantId: tenantId(),
    number: text('number').notNull(),
    roomId: uuid('room_id').notNull().references(() => rooms.id),
    title: text('title').notNull(),
    purpose: text('purpose').notNull().default(''),
    organiser: text('organiser').notNull().default(''),
    attendees: integer('attendees'),
    onDate: date('on_date').notNull(),
    startsAt: time('starts_at').notNull(),
    endsAt: time('ends_at').notNull(),
    /** pending | approved | rejected | cancelled */
    status: text('status').notNull().default('pending'),
    bookedBy: by('booked_by'),
    decidedBy: by('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionNote: text('decision_note'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('facility_bookings_number_uq').on(t.tenantId, t.number), index('facility_bookings_room_idx').on(t.roomId, t.onDate), check('facility_bookings_time_ck', sql`${t.endsAt} > ${t.startsAt}`)],
);

/** A maintenance ticket (electrical, IT, civil…) with a response deadline from its priority. */
export const maintenanceTickets = pgTable(
  'maintenance_tickets',
  {
    id: id(),
    tenantId: tenantId(),
    number: text('number').notNull(),
    /** electrical | it | civil | plumbing | carpentry | housekeeping | other */
    category: text('category').notNull(),
    /** low | normal | high | urgent */
    priority: text('priority').notNull().default('normal'),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    roomId: uuid('room_id').references(() => rooms.id, { onDelete: 'set null' }),
    assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),
    location: text('location').notNull().default(''),
    raisedBy: by('raised_by'),
    assigneeUserId: uuid('assignee_user_id').references(() => users.id, { onDelete: 'set null' }),
    assigneeName: text('assignee_name').notNull().default(''),
    /** open | assigned | in_progress | on_hold | resolved | closed */
    status: text('status').notNull().default('open'),
    slaHours: integer('sla_hours').notNull(),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    resolution: text('resolution'),
    costPaise: paise('cost_paise').notNull().default(0),
    /** The requester's rating of the fix, 1 to 5. */
    rating: smallint('rating'),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('maintenance_tickets_number_uq').on(t.tenantId, t.number), index('maintenance_tickets_status_idx').on(t.tenantId, t.status, t.dueAt)],
);
