// Transport production pass (migrations 0206-0207): distance-based fare slabs, the school-bus safety checklist per
// vehicle, and the ledger of transport fee changes made after a month was billed (moves and cancellations).
import { sql } from 'drizzle-orm';
import { bigint, boolean, date, index, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { feeInvoices, students, tenants, transportAssignments, transportVehicles, users } from './schema.js';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id);
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const by = (name: string) => uuid(name).references(() => users.id, { onDelete: 'set null' });

/** A distance band and its monthly fee: a stop `fromKm < distance <= toKm` from the campus pays this (unless it has its own fee). */
export const transportFareSlabs = pgTable(
  'transport_fare_slabs',
  {
    id: id(),
    tenantId: tenantId(),
    fromKm: numeric('from_km', { precision: 7, scale: 2, mode: 'number' }).notNull(),
    toKm: numeric('to_km', { precision: 7, scale: 2, mode: 'number' }).notNull(),
    monthlyFeePaise: bigint('monthly_fee_paise', { mode: 'number' }).notNull(),
    note: text('note').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('transport_fare_slabs_from_uq').on(t.tenantId, t.fromKm)],
);

/** The items of the school-bus safety checklist (Supreme Court 1997 guidelines, CBSE and state transport rules). */
export const SAFETY_ITEMS = [
  'speedGovernor',
  'gpsWorking',
  'cctvWorking',
  'firstAidBox',
  'fireExtinguisher',
  'emergencyExit',
  'windowGrills',
  'doorLocks',
  'yellowPaint',
  'schoolBusSign',
  'schoolNamePhone',
  'seatBelts',
  'panicButton',
] as const;
export type SafetyItem = (typeof SAFETY_ITEMS)[number];

/** One inspection of a vehicle against the safety checklist: what was found, who checked, when the next is due. */
export const transportSafetyChecks = pgTable(
  'transport_safety_checks',
  {
    id: id(),
    tenantId: tenantId(),
    vehicleId: uuid('vehicle_id').notNull().references(() => transportVehicles.id, { onDelete: 'cascade' }),
    checkedOn: date('checked_on').notNull(),
    items: jsonb('items').$type<Partial<Record<SafetyItem, boolean>>>().notNull().default({}),
    passed: boolean('passed').notNull().default(false),
    nextDueOn: date('next_due_on'),
    note: text('note').notNull().default(''),
    checkedBy: by('checked_by'),
    createdAt: createdAt(),
  },
  (t) => [index('transport_safety_checks_vehicle_idx').on(t.vehicleId, t.checkedOn)],
);

/**
 * A transport fee change after the month was already billed: a move to a dearer stop (charged), a move to a cheaper
 * one or a cancelled seat (credited off the unpaid transport fee; what was already paid waits as a refund).
 */
export const transportFeeAdjustments = pgTable(
  'transport_fee_adjustments',
  {
    id: id(),
    tenantId: tenantId(),
    assignmentId: uuid('assignment_id').notNull().references(() => transportAssignments.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    /** move_charge | move_credit | cancel_credit */
    kind: text('kind').notNull(),
    /** The month whose fee changes (YYYY-MM). */
    month: text('month').notNull(),
    /** Positive is charged, negative is credited. */
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    /** For a credit: how much came off unpaid transport fees; the rest is a refund due. */
    appliedPaise: bigint('applied_paise', { mode: 'number' }).notNull().default(0),
    refundDuePaise: bigint('refund_due_paise', { mode: 'number' }).notNull().default(0),
    invoiceId: uuid('invoice_id').references(() => feeInvoices.id, { onDelete: 'set null' }),
    note: text('note').notNull().default(''),
    createdBy: by('created_by'),
    createdAt: createdAt(),
  },
  (t) => [index('transport_fee_adjustments_student_idx').on(t.studentId, t.month)],
);
