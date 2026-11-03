// Hostel production pass (migrations 0204-0205): the QR gate log, the hostel's committees, mess committee
// inspections and the month's mess spending behind the diet system bill.
import { sql } from 'drizzle-orm';
import { bigint, date, index, integer, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { canteenStockLog } from './schema-depth.js';
import { hostelLateEntries, hostels } from './schema-lht.js';
import { committees, hostelGatePasses, students, tenants, users } from './schema.js';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id);
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const by = (name: string) => uuid(name).references(() => users.id, { onDelete: 'set null' });

/** Every time a resident goes out of or comes in through the hostel gate: by QR scan or by hand, with or without a pass. */
export const hostelGateLogs = pgTable(
  'hostel_gate_logs',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    /** out | in */
    direction: text('direction').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull(),
    /** qr | manual */
    method: text('method').notNull().default('qr'),
    gatePassId: uuid('gate_pass_id').references(() => hostelGatePasses.id, { onDelete: 'set null' }),
    /** A coming-in after curfew (or after the pass ran out) is also a late entry. */
    lateEntryId: uuid('late_entry_id').references(() => hostelLateEntries.id, { onDelete: 'set null' }),
    minutesLate: integer('minutes_late').notNull().default(0),
    gate: text('gate').notNull().default(''),
    note: text('note').notNull().default(''),
    recordedBy: by('recorded_by'),
    createdAt: createdAt(),
  },
  (t) => [index('hostel_gate_logs_student_idx').on(t.studentId, t.at), index('hostel_gate_logs_at_idx').on(t.tenantId, t.at)],
);

/**
 * A committee (from the institution's committees) that serves the hostel: the anti-ragging committee and squad the
 * UGC regulations require, the mess committee, the hostel discipline committee.
 */
export const hostelCommittees = pgTable(
  'hostel_committees',
  {
    id: id(),
    tenantId: tenantId(),
    committeeId: uuid('committee_id').notNull().references(() => committees.id, { onDelete: 'cascade' }),
    /** null = every hostel */
    hostelId: uuid('hostel_id').references(() => hostels.id, { onDelete: 'cascade' }),
    /** anti_ragging | anti_ragging_squad | mess | discipline */
    purpose: text('purpose').notNull(),
    constitutedOn: date('constituted_on').notNull(),
    validUntil: date('valid_until'),
    /** The number residents call (shown on the student app with the national anti-ragging helpline). */
    helpline: text('helpline').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('hostel_committees_uq').on(t.committeeId)],
);

/** A mess committee member's check of a meal: quality, quantity and hygiene out of 5, remarks and what was done. */
export const messInspections = pgTable(
  'mess_inspections',
  {
    id: id(),
    tenantId: tenantId(),
    hostelId: uuid('hostel_id').references(() => hostels.id, { onDelete: 'set null' }),
    inspectedOn: date('inspected_on').notNull(),
    meal: text('meal').notNull(),
    quality: smallint('quality').notNull(),
    quantity: smallint('quantity').notNull(),
    hygiene: smallint('hygiene').notNull(),
    remarks: text('remarks').notNull().default(''),
    actionTaken: text('action_taken').notNull().default(''),
    /** open | closed */
    status: text('status').notNull().default('open'),
    inspectorUserId: uuid('inspector_user_id').notNull().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index('mess_inspections_on_idx').on(t.tenantId, t.inspectedOn)],
);

/** What the mess spent in a month (provisions, vegetables, milk, gas, wages…); a diet system plan shares it by diets eaten. */
export const messExpenses = pgTable(
  'mess_expenses',
  {
    id: id(),
    tenantId: tenantId(),
    month: text('month').notNull(),
    /** provisions | vegetables | milk | fuel | wages | other */
    head: text('head').notNull().default('provisions'),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    spentOn: date('spent_on').notNull(),
    note: text('note').notNull().default(''),
    /** The kitchen purchase it was brought in from, so a purchase is counted once. */
    stockLogId: uuid('stock_log_id').references(() => canteenStockLog.id, { onDelete: 'set null' }),
    createdBy: by('created_by'),
    createdAt: createdAt(),
  },
  (t) => [index('mess_expenses_month_idx').on(t.tenantId, t.month), uniqueIndex('mess_expenses_stock_uq').on(t.stockLogId).where(sql`stock_log_id is not null`)],
);
