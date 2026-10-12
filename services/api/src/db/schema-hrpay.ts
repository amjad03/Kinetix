// HR and payroll workflows (migration 0133): module settings, loans and advances, leave encashment and the service book.
// Kept apart from schema.ts, which these tables reference.
import { sql } from 'drizzle-orm';
import { bigint, date, index, jsonb, numeric, pgTable, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { payrollAdjustments } from './schema-depth.js';
import { leaveTypes, tenants, users } from './schema.js';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });
const by = (name: string) => uuid(name).references(() => users.id, { onDelete: 'set null' });

/** A numbering series: `{FY}` is the Indian financial year, `{YYYY}`/`{YY}` the calendar year. */
export interface Series {
  prefix: string;
  next: number;
  digits: number;
  suffix: string;
}
export interface EncashmentRules {
  maxDaysPerYear: number;
  minBalanceAfter: number;
}
export interface AttendanceRules {
  officeStart: string;
  graceMinutes: number;
  halfDayAfterMinutes: number;
  minHoursFullDay: number;
}
export interface LoanRules {
  maxInstallments: number;
  maxAdvancePaise: number;
  maxLoanPaise: number;
}

/** One row per institution; created with defaults on first read. */
export const hrSettings = pgTable('hr_settings', {
  tenantId: uuid('tenant_id').primaryKey().references(() => tenants.id, { onDelete: 'cascade' }),
  employeeSeries: jsonb('employee_series').$type<Series>().notNull(),
  payslipSeries: jsonb('payslip_series').$type<Series>().notNull(),
  /** 1: the HoD or HR decides leave. 2: the HoD recommends, then the principal or HR approves. */
  leaveLevels: smallint('leave_levels').notNull().default(1),
  encashment: jsonb('encashment').$type<EncashmentRules>().notNull(),
  attendance: jsonb('attendance').$type<AttendanceRules>().notNull(),
  loans: jsonb('loans').$type<LoanRules>().notNull(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

/** A salary advance or staff loan; once approved, each instalment becomes an approved payroll recovery. */
export const staffLoans = pgTable(
  'staff_loans',
  {
    id: id(),
    tenantId: tenantId(),
    loanNo: text('loan_no').notNull(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // advance | loan
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    installments: smallint('installments').notNull(),
    emiPaise: bigint('emi_paise', { mode: 'number' }).notNull(),
    startMonth: text('start_month').notNull(), // YYYY-MM
    purpose: text('purpose').notNull().default(''),
    status: text('status').notNull().default('pending'), // pending | approved | rejected | cancelled | closed
    decidedBy: by('decided_by'),
    decidedAt: ts('decided_at'),
    decisionNote: text('decision_note'),
    createdBy: by('created_by'),
    createdAt: createdAt(),
  },
  (t) => [index('staff_loans_user_idx').on(t.userId, t.status)],
);

/** Earned leave paid out in a month's payroll; the days leave the balance while pending or approved. */
export const leaveEncashments = pgTable('leave_encashments', {
  id: id(),
  tenantId: tenantId(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  leaveTypeId: uuid('leave_type_id').notNull().references(() => leaveTypes.id),
  year: smallint('year').notNull(),
  days: numeric('days', { precision: 5, scale: 1, mode: 'number' }).notNull(),
  amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
  payMonth: text('pay_month').notNull(),
  status: text('status').notNull().default('pending'), // pending | approved | rejected
  adjustmentId: uuid('adjustment_id').references(() => payrollAdjustments.id, { onDelete: 'set null' }),
  decidedBy: by('decided_by'),
  decidedAt: ts('decided_at'),
  decisionNote: text('decision_note'),
  createdBy: by('created_by'),
  createdAt: createdAt(),
});

/** Manual service book entries (orders, increments, awards, remarks); the rest of the book is derived. */
export const serviceBookEntries = pgTable(
  'service_book_entries',
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    onDate: date('on_date').notNull(),
    title: text('title').notNull(),
    details: text('details').notNull().default(''),
    orderNo: text('order_no'),
    createdBy: by('created_by'),
    createdAt: createdAt(),
  },
  (t) => [index('service_book_user_idx').on(t.userId, t.onDate)],
);
