import { ConflictException, Injectable, type OnModuleInit } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { staffProfiles, users } from '../db/schema.js';
import { payMatrixLevels, reimbursementClaims, taxDeclarations } from '../db/schema-hr3.js';
import { RecordRegistry, type RecordEntity } from '../records/entity.js';
import { HR_ROLES, isPayrollStaff, PAYROLL_APPROVERS, PAYROLL_ROLES, STAFF_ROLES } from './hr.access.js';
import { choiceFilter, labelOf, opts, ownRows, rupeesOf, staffDepartmentFilter, staffFilter } from './kit-shared.js';
import { PayMatrixService } from './pay-matrix.service.js';
import { CLAIM_CATEGORIES, claimStatusSql, ReimbursementsService, type ClaimCategory } from './reimbursements.service.js';
import { TaxDeclarationsService } from './tax-declarations.service.js';

export const CLAIM_CATEGORY_OPTS = opts([
  ['travel', 'Official travel'],
  ['conference', 'Conference / seminar'],
  ['books', 'Books and journals'],
  ['telephone', 'Telephone and internet'],
  ['medical', 'Medical'],
  ['fuel', 'Fuel'],
  ['other', 'Other'],
]);
export const CLAIM_STATUS = opts([
  ['submitted', 'Waiting'],
  ['approved', 'Approved'],
  ['paid', 'Paid'],
  ['rejected', 'Rejected'],
  ['cancelled', 'Cancelled'],
]);
export const DECLARATION_STATUS = opts([
  ['draft', 'Draft'],
  ['submitted', 'Waiting for approval'],
  ['approved', 'Approved (declared figures)'],
  ['proofs_submitted', 'Proofs waiting'],
  ['verified', 'Verified (proof figures)'],
  ['rejected', 'Sent back'],
]);
const REGIMES = opts([
  ['new', 'New regime'],
  ['old', 'Old regime'],
]);
const SCHEMES = opts([
  ['ugc_7cpc', 'UGC 7th CPC'],
  ['aicte_7cpc', 'AICTE 7th CPC'],
  ['state', 'State scale'],
  ['custom', 'Institution scale'],
]);
const Note = z.object({ note: z.string().trim().max(500).default('') });

/** The record kit lists of this pass: reimbursement claims, investment declarations and pay matrix levels. */
@Injectable()
export class HrPassRecords implements OnModuleInit {
  constructor(
    private readonly registry: RecordRegistry,
    private readonly claims: ReimbursementsService,
    private readonly declarations: TaxDeclarationsService,
    private readonly matrix: PayMatrixService,
  ) {}

  onModuleInit() {
    this.registry.register(this.claimsEntity());
    this.registry.register(this.declarationsEntity());
    this.registry.register(this.levelsEntity());
  }

  private claimsEntity(): RecordEntity {
    const c = reimbursementClaims;
    return {
      key: 'reimbursement-claims',
      module: 'payroll',
      table: c,
      subjectType: 'reimbursement_claim',
      roles: { read: [...STAFF_ROLES], write: [...STAFF_ROLES] },
      label: (r) => `${r.claimNo} ${r.staffName ?? ''}`,
      list: {
        select: { id: c.id, claimNo: c.claimNo, userId: c.userId, staffName: users.fullName, employeeCode: staffProfiles.employeeCode, category: c.category, spentOn: c.spentOn, amount: rupeesOf(c.amountPaise), approved: rupeesOf(c.approvedPaise), description: c.description, hasBill: sql<boolean>`${c.billKey} is not null`, status: claimStatusSql, payMonth: c.payMonth, decisionNote: c.decisionNote, createdAt: c.createdAt },
        joins: (q) => q.innerJoin(users, eq(users.id, c.userId)).leftJoin(staffProfiles, eq(staffProfiles.userId, c.userId)),
        search: [users.fullName, staffProfiles.employeeCode, c.claimNo, c.description],
        scope: ownRows(c.userId, ['accountant']),
        filters: {
          status: { label: 'Status', options: CLAIM_STATUS, where: (v) => (CLAIM_STATUS.some((o) => o.value === v) ? sql`${claimStatusSql} = ${v}` : undefined) },
          category: choiceFilter('Category', CLAIM_CATEGORY_OPTS, c.category),
          month: { label: 'Pay month', where: (v) => (/^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? eq(c.payMonth, v) : undefined) },
          user: staffFilter(c.userId),
          department: staffDepartmentFilter(c.userId),
        },
        sorts: { created: c.createdAt, spent: c.spentOn, staff: users.fullName, amount: c.amountPaise, claimNo: c.claimNo },
        defaultSort: { id: 'created', dir: 'desc' },
      },
      fields: {
        category: { label: 'Category', type: 'select', schema: z.enum(CLAIM_CATEGORIES), options: CLAIM_CATEGORY_OPTS, required: true, edit: false },
        spentOn: { label: 'Bill date', type: 'date', schema: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), required: true, edit: false },
        amountPaise: { label: 'Amount (₹)', type: 'number', schema: z.coerce.number().min(1).max(10_00_000).transform((v) => Math.round(v * 100)), required: true, edit: false },
        description: { label: 'What it was for', type: 'textarea', schema: z.string().trim().min(3, 'Say what the bill is for').max(500), required: true, edit: false },
      },
      create: async (ctx, v) => (await this.claims.create(ctx.tx, ctx.p, { category: v.category as ClaimCategory, spentOn: String(v.spentOn), amountPaise: Number(v.amountPaise), description: String(v.description) })).id,
      remove: {
        guard: async (ctx, id) => {
          const [x] = await ctx.tx.select({ status: c.status, userId: c.userId }).from(c).where(eq(c.id, id));
          if (x && x.status !== 'submitted' && x.status !== 'cancelled') return 'An approved or rejected claim stays on record';
          if (x && x.userId !== ctx.p.userId && !isPayrollStaff(ctx.p)) return 'Not your claim';
          return null;
        },
      },
      actions: {
        approve: {
          label: 'Approve',
          roles: HR_ROLES,
          inputs: [{ key: 'payMonth', label: 'Pay in month (YYYY-MM)', type: 'text' }, { key: 'note', label: 'Note', type: 'textarea' }],
          params: z.object({ payMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional().or(z.literal('').transform(() => undefined)), note: z.string().trim().max(500).default('') }),
          apply: async (ctx, id, p) => void (await this.claims.decide(ctx.tx, ctx.p, id, { approve: true, ...(p as { payMonth?: string; note: string }) })),
        },
        reject: { label: 'Reject', roles: HR_ROLES, tone: 'danger', inputs: [{ key: 'note', label: 'Why', type: 'textarea', required: true }], params: z.object({ note: z.string().trim().min(3, 'Say why').max(500) }), apply: async (ctx, id, p) => void (await this.claims.decide(ctx.tx, ctx.p, id, { approve: false, note: (p as { note: string }).note })) },
        cancel: { label: 'Cancel', tone: 'danger', apply: async (ctx, id) => void (await this.claims.cancel(ctx.tx, ctx.p, id)) },
      },
      columns: [
        { key: 'claimNo', header: 'Claim' },
        { key: 'staffName', header: 'Staff member' },
        { key: 'employeeCode', header: 'Employee code' },
        { key: 'category', header: 'Category', value: (r) => labelOf(CLAIM_CATEGORY_OPTS, r.category) },
        { key: 'spentOn', header: 'Bill date' },
        { key: 'amount', header: 'Claimed (₹)' },
        { key: 'approved', header: 'Approved (₹)' },
        { key: 'payMonth', header: 'Pay month' },
        { key: 'status', header: 'Status', value: (r) => labelOf(CLAIM_STATUS, r.status) },
        { key: 'description', header: 'For' },
      ],
    };
  }

  private declarationsEntity(): RecordEntity {
    const d = taxDeclarations;
    const declared = sql<number>`(select coalesce(sum(i.declared_paise), 0) / 100.0 from tax_declaration_items i where i.declaration_id = ${d.id})::float8`;
    const proofs = sql<number>`(select count(*)::int from tax_declaration_items i where i.declaration_id = ${d.id} and i.proof_status <> 'none')`;
    return {
      key: 'tax-declarations',
      module: 'payroll',
      table: d,
      subjectType: 'tax_declaration',
      roles: { read: [...STAFF_ROLES], write: PAYROLL_ROLES },
      label: (r) => `${r.staffName ?? ''} FY ${r.fy}`,
      list: {
        select: { id: d.id, userId: d.userId, staffName: users.fullName, employeeCode: staffProfiles.employeeCode, fy: d.fy, regime: d.regime, status: d.status, declared, proofs, submittedAt: d.submittedAt, verifiedAt: d.verifiedAt, version: d.version },
        joins: (q) => q.innerJoin(users, eq(users.id, d.userId)).leftJoin(staffProfiles, eq(staffProfiles.userId, d.userId)),
        search: [users.fullName, staffProfiles.employeeCode],
        scope: ownRows(d.userId, ['accountant']),
        filters: {
          fy: { label: 'Financial year', where: (v) => (/^\d{4}$/.test(v) ? eq(d.fy, Number(v)) : undefined) },
          status: choiceFilter('Status', DECLARATION_STATUS, d.status),
          regime: choiceFilter('Regime', REGIMES, d.regime),
          user: staffFilter(d.userId),
          department: staffDepartmentFilter(d.userId),
        },
        sorts: { staff: users.fullName, submitted: d.submittedAt, fy: d.fy, declared },
        defaultSort: { id: 'submitted', dir: 'desc' },
      },
      remove: {
        guard: async (ctx, id) => {
          const [x] = await ctx.tx.select({ status: d.status }).from(d).where(eq(d.id, id));
          return x && x.status !== 'draft' && x.status !== 'rejected' ? 'A declaration that reached payroll stays on record' : null;
        },
      },
      actions: {
        approve: { label: 'Approve', inputs: [{ key: 'note', label: 'Note', type: 'textarea' }], params: Note, apply: async (ctx, id, p) => void (await this.declarations.approve(ctx.tx, ctx.p, id, undefined, (p as { note: string }).note)) },
        sendBack: { label: 'Send back', tone: 'danger', inputs: [{ key: 'note', label: 'What needs changing', type: 'textarea', required: true }], params: z.object({ note: z.string().trim().min(3).max(500) }), apply: async (ctx, id, p) => void (await this.declarations.reject(ctx.tx, ctx.p, id, undefined, (p as { note: string }).note)) },
      },
      columns: [
        { key: 'staffName', header: 'Staff member' },
        { key: 'employeeCode', header: 'Employee code' },
        { key: 'fy', header: 'Financial year', value: (r) => `${r.fy}-${String(Number(r.fy) + 1).slice(2)}` },
        { key: 'regime', header: 'Regime', value: (r) => labelOf(REGIMES, r.regime) },
        { key: 'declared', header: 'Declared (₹)' },
        { key: 'proofs', header: 'Proofs' },
        { key: 'status', header: 'Status', value: (r) => labelOf(DECLARATION_STATUS, r.status) },
        { key: 'submittedAt', header: 'Submitted' },
      ],
    };
  }

  private levelsEntity(): RecordEntity {
    const l = payMatrixLevels;
    const staff = sql<number>`(select count(*)::int from staff_profiles sp where sp.pay_level_id = ${l.id} and sp.status <> 'exited')`;
    return {
      key: 'pay-matrix-levels',
      module: 'payroll',
      table: l,
      subjectType: 'pay_matrix_level',
      roles: { read: PAYROLL_ROLES, write: PAYROLL_APPROVERS },
      label: (r) => `Level ${r.level}: ${r.name}`,
      list: {
        select: { id: l.id, scheme: l.scheme, level: l.level, name: l.name, cadre: l.cadre, entry: sql<number>`(${l.cells}[1] / 100.0)::float8`, top: sql<number>`(${l.cells}[array_length(${l.cells}, 1)] / 100.0)::float8`, cellCount: sql<number>`array_length(${l.cells}, 1)`, staff, sortOrder: l.sortOrder },
        search: [l.level, l.name],
        filters: { scheme: choiceFilter('Scheme', SCHEMES, l.scheme) },
        sorts: { order: l.sortOrder, level: l.level, entry: sql`${l.cells}[1]` },
        defaultSort: { id: 'order', dir: 'asc' },
      },
      fields: {
        scheme: { label: 'Scheme', type: 'select', schema: z.enum(['ugc_7cpc', 'aicte_7cpc', 'state', 'custom']), options: SCHEMES, required: true, column: l.scheme },
        level: { label: 'Level', type: 'text', schema: z.string().trim().min(1).max(10), required: true, column: l.level },
        name: { label: 'Name', type: 'text', schema: z.string().trim().min(2).max(120), required: true, column: l.name },
        cadre: { label: 'Cadre', type: 'text', schema: z.string().trim().max(40).nullish().transform((v) => v || null), column: l.cadre },
        entryPaise: { label: 'Entry pay (₹)', type: 'number', schema: z.coerce.number().min(1000).max(10_00_000).transform((v) => Math.round(v * 100)), edit: false, help: 'Each next cell is 3% more, to the nearest ₹100' },
        count: { label: 'Cells', type: 'number', schema: z.coerce.number().int().min(1).max(60), edit: false },
      },
      create: async (ctx, v) => {
        await this.matrix.levels(ctx.tx, ctx.p.tenantId);
        return (await this.matrix.addLevel(ctx.tx, ctx.p, { scheme: String(v.scheme), level: String(v.level), name: String(v.name), cadre: (v.cadre as string | null) ?? null, entryPaise: Number(v.entryPaise), count: Number(v.count) })).id;
      },
      remove: {
        guard: async (ctx, id) => {
          const [x] = await ctx.tx.select({ n: sql<number>`count(*)::int` }).from(staffProfiles).where(eq(staffProfiles.payLevelId, id));
          if (x && x.n > 0) throw new ConflictException('Staff are placed on this level');
          return null;
        },
      },
      columns: [
        { key: 'scheme', header: 'Scheme', value: (r) => labelOf(SCHEMES, r.scheme) },
        { key: 'level', header: 'Level' },
        { key: 'name', header: 'Name' },
        { key: 'entry', header: 'Entry pay (₹)' },
        { key: 'top', header: 'Top of level (₹)' },
        { key: 'cellCount', header: 'Cells' },
        { key: 'staff', header: 'Staff on it' },
      ],
    };
  }
}
