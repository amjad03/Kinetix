// HR and payroll pass (migrations 0198-0199): investment declarations and proofs, reimbursement claims, and the
// 7th CPC pay matrix with each move on it. Kept apart from schema.ts, which these tables reference.
import { sql } from 'drizzle-orm';
import { bigint, boolean, date, index, integer, jsonb, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { payrollAdjustments } from './schema-depth.js';
import { tenants, users } from './schema.js';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });
const by = (name: string) => uuid(name).references(() => users.id, { onDelete: 'set null' });
const paise = (name: string) => bigint(name, { mode: 'number' });

/** What the declaration changed on the staff record when it was approved or verified (for the history and for TDS). */
export interface AppliedDeclaration {
  basis: 'declared' | 'verified';
  regime: 'old' | 'new';
  section80cPaise: number;
  otherDeductionsPaise: number;
  hraExemptPaise: number;
  at: string;
}

/**
 * A staff member's investment declaration (Form 12BB) for a financial year: draft → submitted → approved (TDS uses the
 * declared figures) → proofs_submitted → verified (TDS uses the accepted figures); rejected sends it back to draft.
 */
export const taxDeclarations = pgTable(
  'tax_declarations',
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    fy: smallint('fy').notNull(),
    /** old | new: the regime chosen for the year (section 115BAC). */
    regime: text('regime').notNull().default('new'),
    /** draft | submitted | approved | proofs_submitted | verified | rejected */
    status: text('status').notNull().default('draft'),
    /** House rent paid (for the HRA exemption, section 10(13A)). */
    rentMonthlyPaise: paise('rent_monthly_paise').notNull().default(0),
    rentMonths: smallint('rent_months').notNull().default(0),
    /** Mumbai, Delhi, Kolkata or Chennai (50% of basic instead of 40%). */
    metro: boolean('metro').notNull().default(false),
    landlordName: text('landlord_name').notNull().default(''),
    /** The landlord's PAN (needed when rent passes ₹1 lakh a year), sealed like staff PANs. */
    landlordPanEnc: text('landlord_pan_enc'),
    submittedAt: ts('submitted_at'),
    approvedBy: by('approved_by'),
    approvedAt: ts('approved_at'),
    proofsSubmittedAt: ts('proofs_submitted_at'),
    verifiedBy: by('verified_by'),
    verifiedAt: ts('verified_at'),
    decisionNote: text('decision_note').notNull().default(''),
    applied: jsonb('applied').$type<AppliedDeclaration | null>(),
    version: integer('version').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('tax_declarations_user_fy_uq').on(t.tenantId, t.userId, t.fy), index('tax_declarations_status_idx').on(t.tenantId, t.fy, t.status)],
);

/** One investment or expense declared: section 80C (with its kind in the label), 80CCD(1B), 80D, 80E, 80G, 80TTA, 24(b). */
export const taxDeclarationItems = pgTable(
  'tax_declaration_items',
  {
    id: id(),
    tenantId: tenantId(),
    declarationId: uuid('declaration_id').notNull().references(() => taxDeclarations.id, { onDelete: 'cascade' }),
    section: text('section').notNull(),
    label: text('label').notNull().default(''),
    declaredPaise: paise('declared_paise').notNull(),
    /** none | submitted | accepted | rejected */
    proofStatus: text('proof_status').notNull().default('none'),
    proofKey: text('proof_key'),
    proofName: text('proof_name'),
    proofType: text('proof_type'),
    /** What the proof supports (may be less than declared). */
    acceptedPaise: paise('accepted_paise'),
    proofNote: text('proof_note').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [index('tax_declaration_items_decl_idx').on(t.declarationId)],
);

/** A claim against a bill (travel, conference, books, telephone, medical…), approved and paid on a payslip. */
export const reimbursementClaims = pgTable(
  'reimbursement_claims',
  {
    id: id(),
    tenantId: tenantId(),
    claimNo: text('claim_no').notNull(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    /** travel | conference | books | telephone | medical | fuel | other */
    category: text('category').notNull(),
    spentOn: date('spent_on').notNull(),
    amountPaise: paise('amount_paise').notNull(),
    approvedPaise: paise('approved_paise'),
    description: text('description').notNull().default(''),
    billKey: text('bill_key'),
    billName: text('bill_name'),
    billType: text('bill_type'),
    /** submitted | approved | rejected | paid | cancelled */
    status: text('status').notNull().default('submitted'),
    payMonth: text('pay_month'),
    adjustmentId: uuid('adjustment_id').references(() => payrollAdjustments.id, { onDelete: 'set null' }),
    decidedBy: by('decided_by'),
    decidedAt: ts('decided_at'),
    decisionNote: text('decision_note').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('reimbursement_claims_no_uq').on(t.tenantId, t.claimNo), index('reimbursement_claims_user_idx').on(t.tenantId, t.userId, t.status)],
);

/** A level of the pay matrix (UGC/AICTE 7th CPC academic levels 10 to 15, or the institution's own) and its cells (basic pay, paise). */
export const payMatrixLevels = pgTable(
  'pay_matrix_levels',
  {
    id: id(),
    tenantId: tenantId(),
    /** ugc_7cpc | aicte_7cpc | state | custom */
    scheme: text('scheme').notNull().default('ugc_7cpc'),
    level: text('level').notNull(),
    name: text('name').notNull(),
    /** The cadre the level is for (assistant_professor…), for promotions under CAS. */
    cadre: text('cadre'),
    cells: bigint('cells', { mode: 'number' }).array().notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('pay_matrix_levels_uq').on(t.tenantId, t.scheme, t.level)],
);

/** A move on the matrix: placement, annual increment or promotion (pay fixed one cell up, 7th CPC rule). */
export const payMatrixMoves = pgTable(
  'pay_matrix_moves',
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    /** placement | increment | promotion */
    kind: text('kind').notNull(),
    effectiveFrom: date('effective_from').notNull(),
    fromLevelId: uuid('from_level_id').references(() => payMatrixLevels.id, { onDelete: 'set null' }),
    fromCell: smallint('from_cell'),
    fromBasicPaise: paise('from_basic_paise'),
    toLevelId: uuid('to_level_id').notNull().references(() => payMatrixLevels.id, { onDelete: 'cascade' }),
    toCell: smallint('to_cell').notNull(),
    toBasicPaise: paise('to_basic_paise').notNull(),
    orderNo: text('order_no').notNull().default(''),
    note: text('note').notNull().default(''),
    createdBy: by('created_by'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('pay_matrix_moves_uq').on(t.tenantId, t.userId, t.kind, t.effectiveFrom)],
);
