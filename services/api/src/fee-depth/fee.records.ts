import { BadRequestException, ConflictException, Injectable, OnModuleInit } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { auditUser } from '../common/audit.js';
import { acctAccounts, academicYears, campuses, feeInvoices, programs, sections, students, users } from '../db/schema.js';
import { feeStructures } from '../db/schema-g1.js';
import { feeInstalmentPlans } from '../db/schema-depth.js';
import { feeCashClosings, feeCheques, feeConcessions, feeRefundRequests, feeWriteOffs } from '../db/schema-fee-accounts.js';
import { acctFunds, feeChallans, feeConcessionTypes, feeCustomPlans, feeGovtScholarships, feeHeads, feeReceipts, feeStudentProfiles, feeWaiverRequests } from '../db/schema-fee-depth.js';
import { chequeNext, type ChequeAction } from '../fee-accounts/fee-accounts.logic.js';
import { FEE_ROLES } from '../fees/fees.service.js';
import { planProblem } from '../fees/fees-depth.logic.js';
import { fail, lc, outcome, required, type Row as ImportRow } from '../import/row-helpers.js';
import { RecordRegistry, type FieldOption, type KitCtx, type RecordEntity } from '../records/entity.js';
import { copyName, DateText, Int, OptionalText, Text, uuidEq } from '../records/helpers.js';
import { eachRow } from '../records/import.js';
import { CodeList, joinCodes, never, opts, rowOf, rupeeField, rupeesOf, Rupees, setColumn } from './kit.js';

const W = FEE_ROLES;
const HEAD_KINDS = ['tuition', 'exam', 'lab', 'transport', 'hostel', 'uniform', 'books', 'library', 'fine', 'deposit', 'admission', 'other'];
const LINKED = ['none', 'transport', 'hostel', 'opt_in'];
const CONCESSION_CATEGORIES = ['merit', 'sibling', 'staff_ward', 'sports', 'government', 'need', 'management', 'other'];
const QUOTAS = ['government', 'management', 'nri', 'sports', 'other'];
const PORTALS = ['nsp', 'state', 'institution', 'other'];
const yes = (v: string) => ['yes', 'y', 'true', '1'].includes(lc(v));
const num = (v: string, what: string) => {
  const n = Number(v.replace(/[₹,\s]/g, ''));
  if (!v || !Number.isFinite(n) || n < 0) fail('This value is not valid', `${what}: ${v || '(empty)'}`);
  return n;
};

async function incomeAccounts(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx.select({ code: acctAccounts.code, name: acctAccounts.name }).from(acctAccounts).where(and(eq(acctAccounts.groupType, 'income'), eq(acctAccounts.active, true))).orderBy(asc(acctAccounts.code));
  return rows.length ? rows.map((r) => ({ value: r.code, label: `${r.code} ${r.name}` })) : [{ value: '4000', label: '4000 Fee Income' }, { value: '4100', label: '4100 Other Income' }];
}
async function fundOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ code: acctFunds.code, name: acctFunds.name }).from(acctFunds).where(eq(acctFunds.active, true)).orderBy(asc(acctFunds.sortOrder))).map((f) => ({ value: f.code, label: `${f.code} ${f.name}` }));
}
async function headOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ code: feeHeads.code, name: feeHeads.name }).from(feeHeads).where(eq(feeHeads.active, true)).orderBy(asc(feeHeads.sortOrder))).map((h) => ({ value: h.code, label: `${h.code} ${h.name}` }));
}
async function programOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ id: programs.id, name: programs.name }).from(programs).orderBy(asc(programs.sortOrder), asc(programs.name))).map((p) => ({ value: p.id, label: p.name }));
}
async function campusOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ id: campuses.id, name: campuses.name }).from(campuses).orderBy(asc(campuses.name))).map((c) => ({ value: c.id, label: c.name }));
}
async function planOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ id: feeInstalmentPlans.id, name: feeInstalmentPlans.name }).from(feeInstalmentPlans).where(eq(feeInstalmentPlans.active, true)).orderBy(asc(feeInstalmentPlans.name))).map((p) => ({ value: p.id, label: p.name }));
}
async function yearOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.selectDistinct({ label: academicYears.label }).from(academicYears).orderBy(asc(academicYears.label))).map((y) => ({ value: y.label, label: y.label }));
}
async function sectionOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ id: sections.id, name: sections.displayName }).from(sections).orderBy(asc(sections.displayName))).map((s) => ({ value: s.id, label: s.name }));
}
async function cashierOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx.execute<{ id: string; name: string }>(sql`select distinct u.id, u.full_name as name from fee_receipts r join users u on u.id = r.collected_by order by 2`);
  return rows.rows.map((r) => ({ value: r.id, label: r.name }));
}

/** A student by roll number (and class, when roll numbers repeat across classes). */
async function studentByRoll(ctx: KitCtx, roll: string, cls?: string): Promise<{ id: string; sectionId: string }> {
  const rows = await ctx.tx
    .select({ id: students.id, sectionId: students.sectionId, section: sections.displayName })
    .from(students)
    .innerJoin(sections, eq(sections.id, students.sectionId))
    .where(sql`lower(${students.rollNo}) = ${lc(roll)}`);
  const hit = cls ? rows.filter((r) => lc(r.section) === lc(cls)) : rows;
  if (!hit.length) fail('No student with this roll number', roll);
  if (hit.length > 1) fail('More than one student has this roll number; give the class too', roll);
  return hit[0];
}

// ---- Fee heads -----------------------------------------------------------------------------------------

// Subqueries name the list's own table: a one-table select leaves its columns unqualified.
const headInUse = sql<number>`(select count(*)::int from fee_invoice_lines l where l.head_code = fee_heads.code)`;

export function feeHeadsEntity(): RecordEntity {
  return {
    key: 'fee-heads',
    module: 'fees',
    table: feeHeads,
    subjectType: 'fee_head',
    roles: { read: W, write: W },
    label: (r) => `${r.code} ${r.name}`,
    list: {
      select: { id: feeHeads.id, code: feeHeads.code, name: feeHeads.name, kind: feeHeads.kind, sortOrder: feeHeads.sortOrder, accountCode: feeHeads.accountCode, fundCode: feeHeads.fundCode, gstRate: feeHeads.gstRate, sac: feeHeads.sac, refundable: feeHeads.refundable, optional: feeHeads.optional, linkedModule: feeHeads.linkedModule, receiptPrefix: feeHeads.receiptPrefix, active: feeHeads.active, used: headInUse },
      search: [feeHeads.code, feeHeads.name],
      filters: {
        kind: { label: 'Kind', options: opts(HEAD_KINDS), where: (v) => (HEAD_KINDS.includes(v) ? eq(feeHeads.kind, v) : undefined) },
        optional: { label: 'Optional', options: [{ value: 'yes', label: 'Optional' }, { value: 'no', label: 'Compulsory' }], where: (v) => (v === 'yes' ? eq(feeHeads.optional, true) : v === 'no' ? eq(feeHeads.optional, false) : undefined) },
        gst: { label: 'GST', options: [{ value: 'taxable', label: 'Taxable' }, { value: 'exempt', label: 'Exempt' }], where: (v) => (v === 'taxable' ? sql`${feeHeads.gstRate} > 0` : v === 'exempt' ? sql`${feeHeads.gstRate} = 0` : undefined) },
        active: { label: 'Status', options: [{ value: 'yes', label: 'Active' }, { value: 'no', label: 'Switched off' }], where: (v) => (v === 'yes' ? eq(feeHeads.active, true) : v === 'no' ? eq(feeHeads.active, false) : undefined) },
      },
      sorts: { order: feeHeads.sortOrder, code: feeHeads.code, name: feeHeads.name, kind: feeHeads.kind, gst: feeHeads.gstRate },
      defaultSort: { id: 'order', dir: 'asc' },
    },
    fields: {
      code: { label: 'Code', type: 'text', schema: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,8}$/, 'Codes are 2 to 8 capital letters or digits'), column: feeHeads.code, required: true, edit: false, help: 'Short code used on structures and imports, e.g. TUI' },
      name: { label: 'Name', type: 'text', schema: Text(80), column: feeHeads.name, required: true },
      kind: { label: 'Kind', type: 'select', schema: z.enum(HEAD_KINDS as [string, ...string[]]), column: feeHeads.kind, options: opts(HEAD_KINDS), bulk: true },
      accountCode: { label: 'Income ledger', type: 'select', schema: Text(12), column: feeHeads.accountCode, options: incomeAccounts, bulk: true, help: 'The income account receipts of this head post to' },
      fundCode: { label: 'Fund', type: 'select', schema: OptionalText(12), column: feeHeads.fundCode, options: fundOptions, bulk: true, help: 'The books (trust, college, hostel) it belongs to; blank for the main books' },
      gstRate: { label: 'GST %', type: 'number', schema: z.coerce.number().min(0).max(28), column: feeHeads.gstRate, bulk: true, help: '0 for exempt education services' },
      sac: { label: 'SAC code', type: 'text', schema: OptionalText(10), column: feeHeads.sac, help: 'Service accounting code on GST invoices' },
      refundable: { label: 'Refundable', type: 'boolean', schema: z.boolean(), column: feeHeads.refundable, bulk: true },
      optional: { label: 'Optional', type: 'boolean', schema: z.boolean(), column: feeHeads.optional, bulk: true, help: 'Charged only to students in the linked module or who opted in' },
      linkedModule: { label: 'Linked to', type: 'select', schema: z.enum(LINKED as [string, ...string[]]), column: feeHeads.linkedModule, options: [{ value: 'none', label: 'Nothing' }, { value: 'transport', label: 'Transport (students on a route)' }, { value: 'hostel', label: 'Hostel (students with a bed)' }, { value: 'opt_in', label: 'Students who opted in' }], bulk: true },
      receiptPrefix: { label: 'Own receipt series', type: 'text', schema: OptionalText(30), column: feeHeads.receiptPrefix, help: 'A prefix to number this head’s receipts on their own, such as TRN/' },
      active: { label: 'Active', type: 'boolean', schema: z.boolean(), column: feeHeads.active, bulk: true, create: false },
    },
    order: { column: feeHeads.sortOrder },
    duplicate: async (ctx, row) => {
      for (let n = 2; n < 100; n++) {
        const code = `${String(row.code).slice(0, 6)}${n}`;
        const [hit] = await ctx.tx.select({ id: feeHeads.id }).from(feeHeads).where(eq(feeHeads.code, code));
        if (!hit) return { code, name: await copyName(ctx.tx, feeHeads, feeHeads.name, String(row.name)) };
      }
      throw new ConflictException('No free code for the copy');
    },
    remove: { guard: async (ctx, id) => ((await rowOf<{ code: string }>(ctx, feeHeads, id)) && Number((await ctx.tx.execute<{ n: number }>(sql`select count(*)::int as n from fee_invoice_lines l join fee_heads h on h.code = l.head_code where h.id = ${id}::uuid`)).rows[0].n) > 0 ? 'This head is on invoices; switch it off instead' : null) },
    columns: [
      { key: 'code', header: 'Code' },
      { key: 'name', header: 'Head' },
      { key: 'kind', header: 'Kind' },
      { key: 'sortOrder', header: 'Priority' },
      { key: 'accountCode', header: 'Income ledger' },
      { key: 'fundCode', header: 'Fund' },
      { key: 'gstRate', header: 'GST %' },
      { key: 'sac', header: 'SAC' },
      { key: 'refundable', header: 'Refundable' },
      { key: 'optional', header: 'Optional' },
      { key: 'linkedModule', header: 'Linked to' },
      { key: 'active', header: 'Active' },
    ],
    import: {
      columns: [
        { key: 'code', header: 'Code', required: true, example: 'HST', help: 'Rows are matched on the code' },
        { key: 'name', header: 'Name', required: true, example: 'Hostel rent' },
        { key: 'kind', header: 'Kind', options: HEAD_KINDS, example: 'hostel' },
        { key: 'account_code', header: 'Income ledger', example: '4000', help: 'Account code; blank for 4000' },
        { key: 'gst_rate', header: 'GST %', example: '0' },
        { key: 'refundable', header: 'Refundable', options: ['yes', 'no'], example: 'yes' },
        { key: 'optional', header: 'Optional', options: ['yes', 'no'], example: 'yes' },
        { key: 'linked_to', header: 'Linked to', options: LINKED, example: 'hostel' },
      ],
      key: ['code'],
      exists: async (ctx, r) => !!(await ctx.tx.select({ id: feeHeads.id }).from(feeHeads).where(eq(feeHeads.code, r.get('code').toUpperCase())))[0],
      run: (ctx, rows) =>
        eachRow(ctx.tx, rows, async (tx, r) => {
          const code = required(r, 'code').toUpperCase();
          if (!/^[A-Z0-9]{2,8}$/.test(code)) fail('Codes are 2 to 8 capital letters or digits', code);
          const kind = lc(r.get('kind')) || 'other';
          if (!HEAD_KINDS.includes(kind)) fail('Choose one of the listed values', kind);
          const linked = lc(r.get('linked_to')) || 'none';
          if (!LINKED.includes(linked)) fail('Choose one of the listed values', linked);
          const gst = r.get('gst_rate') ? num(r.get('gst_rate'), 'GST') : 0;
          if (gst > 28) fail('GST is at most 28%', String(gst));
          const values = { name: required(r, 'name'), kind, accountCode: r.get('account_code') || '4000', gstRate: gst, refundable: r.get('refundable') ? yes(r.get('refundable')) : true, optional: yes(r.get('optional')), linkedModule: linked };
          const [found] = await tx.select().from(feeHeads).where(eq(feeHeads.code, code));
          if (!found) {
            await tx.insert(feeHeads).values({ tenantId: ctx.p.tenantId, code, sortOrder: 1_000_000, ...values });
            return outcome(true, false, [code, values.name]);
          }
          await tx.update(feeHeads).set(values).where(eq(feeHeads.id, found.id));
          return outcome(false, true, [code, values.name]);
        }),
    },
  };
}

// ---- Fee structures ----------------------------------------------------------------------------------------

const structureTotal = sql<number>`(select coalesce(sum((i->>'amountPaise')::bigint), 0) from jsonb_array_elements(${feeStructures.items}) i)`.mapWith(Number);
const structureAssigned = sql<number>`(select count(*)::int from fee_assignments a where a.structure_id = ${feeStructures.id} and a.status = 'active')`;

/** A structure field that may change only while the structure is a draft or was rejected. */
function draftOnly(column: Parameters<typeof setColumn>[2], convert: (v: unknown) => unknown = (v) => v) {
  return async (ctx: KitCtx, id: string, v: unknown) => {
    const fs = await rowOf<{ status: string }>(ctx, feeStructures, id);
    if (!['draft', 'rejected'].includes(fs.status)) throw new ConflictException('Only a draft or a rejected structure can be changed');
    await setColumn(ctx, feeStructures, column, id, convert(v));
  };
}

/** "TUI=38000; EXM=3500" → items. */
function parseItems(text: string, heads: { code: string; name: string }[]) {
  const items = text
    .split(/[;\n]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((part) => {
      const m = /^([A-Za-z0-9]{2,8})\s*[=:]\s*([\d,.]+)$/.exec(part);
      if (!m) fail('Write heads like TUI=38000; EXM=3500', part);
      const h = heads.find((x) => x.code === m![1].toUpperCase());
      if (!h) fail('There is no fee head with this code', m![1]);
      return { head: h!.name, code: h!.code, amountPaise: Math.round(num(m![2], h!.code) * 100) };
    });
  if (!items.length) fail('This value is required', 'heads');
  return items;
}

export function feeStructuresEntity(): RecordEntity {
  return {
    key: 'fee-structures',
    module: 'fees',
    table: feeStructures,
    subjectType: 'fee_structure',
    roles: { read: W, write: W },
    label: (r) => String(r.name),
    list: {
      select: {
        id: feeStructures.id,
        name: feeStructures.name,
        academicYear: feeStructures.academicYear,
        programId: feeStructures.programId,
        program: programs.name,
        campusId: feeStructures.campusId,
        batch: feeStructures.batch,
        quota: feeStructures.quota,
        category: feeStructures.category,
        term: feeStructures.term,
        dueInDays: feeStructures.dueInDays,
        perCreditRupees: rupeesOf(feeStructures.perCreditPaise),
        creditHead: feeStructures.creditHead,
        instalmentPlanId: feeStructures.instalmentPlanId,
        status: feeStructures.status,
        active: feeStructures.active,
        heads: sql<number>`jsonb_array_length(${feeStructures.items})`,
        totalPaise: structureTotal,
        assigned: structureAssigned,
        sortOrder: feeStructures.sortOrder,
        createdAt: feeStructures.createdAt,
      },
      joins: (q) => q.leftJoin(programs, eq(programs.id, feeStructures.programId)),
      search: [feeStructures.name, programs.name, feeStructures.batch, feeStructures.quota, feeStructures.category],
      filters: {
        status: { label: 'Status', options: opts(['draft', 'pending', 'approved', 'published', 'rejected']), where: (v) => eq(feeStructures.status, v) },
        year: { label: 'Year', options: yearOptions, where: (v) => eq(feeStructures.academicYear, v) },
        program: { label: 'Programme', options: programOptions, where: (v) => uuidEq(feeStructures.programId, v) },
        quota: { label: 'Quota', options: opts(QUOTAS), where: (v) => sql`lower(${feeStructures.quota}) = ${lc(v)}` },
      },
      sorts: { name: feeStructures.name, year: feeStructures.academicYear, program: programs.name, total: structureTotal, status: feeStructures.status, created: feeStructures.createdAt, assigned: structureAssigned },
      defaultSort: { id: 'created', dir: 'desc' },
    },
    fields: {
      name: { label: 'Name', type: 'text', schema: Text(120), rowKey: 'name', apply: draftOnly(feeStructures.name), required: true },
      academicYear: { label: 'Academic year', type: 'text', schema: z.string().regex(/^\d{4}-\d{2}$/, 'Use a year like 2026-27'), rowKey: 'academicYear', apply: draftOnly(feeStructures.academicYear), required: true, bulk: true },
      programId: { label: 'Programme', type: 'select', schema: z.union([z.uuid(), z.literal('')]).nullable().transform((v) => v || null), rowKey: 'programId', apply: draftOnly(feeStructures.programId), options: programOptions, bulk: true },
      campusId: { label: 'Campus', type: 'select', schema: z.union([z.uuid(), z.literal('')]).nullable().transform((v) => v || null), rowKey: 'campusId', apply: draftOnly(feeStructures.campusId), options: campusOptions },
      term: { label: 'Semester / year', type: 'number', schema: z.union([Int(1, 12), z.literal('')]).nullable().transform((v) => (v === '' ? null : v)), rowKey: 'term', apply: draftOnly(feeStructures.term), help: 'Blank for every semester' },
      batch: { label: 'Batch (admission year)', type: 'text', schema: OptionalText(10), rowKey: 'batch', apply: draftOnly(feeStructures.batch), bulk: true, help: 'e.g. 2025; blank for every batch' },
      quota: { label: 'Quota', type: 'select', schema: OptionalText(40), rowKey: 'quota', apply: draftOnly(feeStructures.quota), options: opts(QUOTAS), bulk: true },
      category: { label: 'Category', type: 'text', schema: OptionalText(40), rowKey: 'category', apply: draftOnly(feeStructures.category), help: 'e.g. GM, OBC, SC/ST; blank for every category' },
      dueInDays: { label: 'Due in (days)', type: 'number', schema: Int(0, 365), rowKey: 'dueInDays', apply: draftOnly(feeStructures.dueInDays), bulk: true },
      perCreditRupees: { label: 'Fee per credit (₹)', type: 'number', schema: Rupees, rowKey: 'perCreditRupees', apply: draftOnly(feeStructures.perCreditPaise, (v) => Math.round(Number(v) * 100)), help: 'Charged for each registered credit, on top of the heads' },
      creditHead: { label: 'Credit fee head', type: 'select', schema: OptionalText(12), rowKey: 'creditHead', apply: draftOnly(feeStructures.creditHead), options: headOptions },
      instalmentPlanId: { label: 'Instalment plan', type: 'select', schema: z.union([z.uuid(), z.literal('')]).nullable().transform((v) => v || null), rowKey: 'instalmentPlanId', apply: draftOnly(feeStructures.instalmentPlanId), options: planOptions, bulk: true },
    },
    create: async (ctx, v) => {
      const [row] = await ctx.tx
        .insert(feeStructures)
        .values({ tenantId: ctx.p.tenantId, name: String(v.name), academicYear: (v.academicYear as string) ?? null, programId: (v.programId as string) ?? null, campusId: (v.campusId as string) ?? null, term: (v.term as number) ?? null, batch: (v.batch as string) ?? null, quota: (v.quota as string) ?? null, category: (v.category as string) ?? null, dueInDays: (v.dueInDays as number) ?? 30, perCreditPaise: Math.round(Number(v.perCreditRupees ?? 0) * 100), creditHead: (v.creditHead as string) ?? null, instalmentPlanId: (v.instalmentPlanId as string) ?? null, items: [], status: 'draft', active: false, createdBy: ctx.p.userId })
        .returning({ id: feeStructures.id });
      return row.id;
    },
    duplicate: async (ctx, row) => ({ name: await copyName(ctx.tx, feeStructures, feeStructures.name, String(row.name)), status: 'draft', active: false, submitted_by: null, submitted_at: null, decided_by: null, decided_at: null, decision_note: null, published_at: null, created_by: ctx.p.userId }),
    remove: { guard: async (ctx, id) => (Number((await ctx.tx.execute<{ n: number }>(sql`select count(*)::int as n from fee_assignments where structure_id = ${id}::uuid and status = 'active'`)).rows[0].n) > 0 ? 'Students have been given this structure; switch it off instead' : null) },
    columns: [
      { key: 'name', header: 'Structure' },
      { key: 'academicYear', header: 'Year' },
      { key: 'program', header: 'Programme' },
      { key: 'term', header: 'Semester' },
      { key: 'batch', header: 'Batch' },
      { key: 'quota', header: 'Quota' },
      { key: 'category', header: 'Category' },
      { key: 'totalPaise', header: 'Total (₹)', value: (r) => Number(r.totalPaise) / 100 },
      { key: 'status', header: 'Status' },
      { key: 'assigned', header: 'Students' },
    ],
    actions: {
      submit: {
        label: 'Send for approval',
        apply: async (ctx, id) => {
          const fs = await rowOf<{ status: string; items: unknown[]; name: string }>(ctx, feeStructures, id);
          if (!['draft', 'rejected'].includes(fs.status)) throw new ConflictException('This structure has already been sent');
          if (!fs.items.length) throw new BadRequestException('Add its fee heads first');
          await ctx.tx.update(feeStructures).set({ status: 'pending', submittedBy: ctx.p.userId, submittedAt: new Date(), decisionNote: null }).where(eq(feeStructures.id, id));
          await auditUser(ctx.tx, ctx.p, 'fee_structure.submitted', 'fee_structure', id);
        },
      },
      publish: {
        label: 'Publish',
        apply: async (ctx, id) => {
          const fs = await rowOf<{ status: string }>(ctx, feeStructures, id);
          if (fs.status !== 'approved') throw new ConflictException('Only an approved structure can be published');
          await ctx.tx.update(feeStructures).set({ status: 'published', active: true, publishedAt: new Date() }).where(eq(feeStructures.id, id));
          await auditUser(ctx.tx, ctx.p, 'fee_structure.published', 'fee_structure', id);
        },
      },
      switchOff: {
        label: 'Switch off',
        apply: async (ctx, id) => {
          await ctx.tx.update(feeStructures).set({ active: false }).where(eq(feeStructures.id, id));
          await auditUser(ctx.tx, ctx.p, 'fee_structure.switched_off', 'fee_structure', id);
        },
      },
    },
    import: {
      columns: [
        { key: 'name', header: 'Name', required: true, example: 'BCom Sem 1 2026-27 (Government)', help: 'Rows are matched on the name' },
        { key: 'academic_year', header: 'Academic year', required: true, example: '2026-27' },
        { key: 'program', header: 'Programme', example: 'BCom', options: async (ctx) => (await programOptions(ctx)).map((p) => p.label) },
        { key: 'term', header: 'Semester', example: '1' },
        { key: 'batch', header: 'Batch', example: '2026' },
        { key: 'quota', header: 'Quota', example: 'government', options: QUOTAS },
        { key: 'category', header: 'Category', example: 'GM' },
        { key: 'heads', header: 'Heads', required: true, example: 'TUI=38000; EXM=3500; LAB=2000', help: 'Head code = amount in rupees, separated by semicolons' },
        { key: 'due_in_days', header: 'Due in days', example: '30' },
      ],
      key: ['name'],
      exists: async (ctx, r) => !!(await ctx.tx.select({ id: feeStructures.id }).from(feeStructures).where(sql`lower(${feeStructures.name}) = ${lc(r.get('name'))}`))[0],
      run: async (ctx, rows) => {
        const heads = await ctx.tx.select({ code: feeHeads.code, name: feeHeads.name }).from(feeHeads);
        const progs = await programOptions(ctx);
        return eachRow(ctx.tx, rows, async (tx, r: ImportRow) => {
          const name = required(r, 'name');
          const year = required(r, 'academic_year');
          if (!/^\d{4}-\d{2}$/.test(year)) fail('Use a year like 2026-27', year);
          const prog = r.get('program') ? progs.find((p) => lc(p.label) === lc(r.get('program'))) : undefined;
          if (r.get('program') && !prog) fail('No programme with this name', r.get('program'));
          const term = r.get('term') ? Math.trunc(num(r.get('term'), 'Semester')) : null;
          const values = { academicYear: year, programId: prog?.value ?? null, term, batch: r.get('batch') || null, quota: r.get('quota') ? lc(r.get('quota')) : null, category: r.get('category') || null, items: parseItems(required(r, 'heads'), heads), dueInDays: r.get('due_in_days') ? Math.trunc(num(r.get('due_in_days'), 'Due in days')) : 30 };
          const [found] = await tx.select().from(feeStructures).where(sql`lower(${feeStructures.name}) = ${lc(name)}`);
          if (!found) {
            await tx.insert(feeStructures).values({ tenantId: ctx.p.tenantId, name, ...values, status: 'draft', active: false, createdBy: ctx.p.userId });
            return outcome(true, false, [name]);
          }
          if (!['draft', 'rejected'].includes(found.status)) fail('Only a draft or a rejected structure can be changed', name);
          await tx.update(feeStructures).set(values).where(eq(feeStructures.id, found.id));
          return outcome(false, true, [name]);
        });
      },
    },
  };
}

// ---- Concession types ---------------------------------------------------------------------------------------

export function concessionTypesEntity(): RecordEntity {
  return {
    key: 'fee-concession-types',
    module: 'fees',
    table: feeConcessionTypes,
    subjectType: 'fee_concession_type',
    roles: { read: W, write: W },
    label: (r) => String(r.name),
    list: {
      select: { id: feeConcessionTypes.id, name: feeConcessionTypes.name, category: feeConcessionTypes.category, mode: feeConcessionTypes.mode, percent: feeConcessionTypes.percent, amountRupees: rupeesOf(feeConcessionTypes.amountPaise), headCodes: joinCodes(feeConcessionTypes.headCodes), active: feeConcessionTypes.active, sortOrder: feeConcessionTypes.sortOrder, used: sql<number>`(select count(*)::int from fee_concessions c where c.type_id = fee_concession_types.id)` },
      search: [feeConcessionTypes.name],
      filters: {
        category: { label: 'Category', options: opts(CONCESSION_CATEGORIES), where: (v) => eq(feeConcessionTypes.category, v) },
        active: { label: 'Status', options: [{ value: 'yes', label: 'Active' }, { value: 'no', label: 'Switched off' }], where: (v) => (v === 'yes' ? eq(feeConcessionTypes.active, true) : v === 'no' ? eq(feeConcessionTypes.active, false) : undefined) },
      },
      sorts: { order: feeConcessionTypes.sortOrder, name: feeConcessionTypes.name, category: feeConcessionTypes.category },
      defaultSort: { id: 'order', dir: 'asc' },
    },
    fields: {
      name: { label: 'Name', type: 'text', schema: Text(80), column: feeConcessionTypes.name, required: true },
      category: { label: 'Category', type: 'select', schema: z.enum(CONCESSION_CATEGORIES as [string, ...string[]]), column: feeConcessionTypes.category, options: opts(CONCESSION_CATEGORIES), required: true, bulk: true },
      mode: { label: 'Given as', type: 'select', schema: z.enum(['percent', 'amount']), column: feeConcessionTypes.mode, options: [{ value: 'percent', label: 'Percent of the heads' }, { value: 'amount', label: 'Fixed amount' }], required: true },
      percent: { label: 'Percent', type: 'number', schema: z.union([Int(1, 100), z.literal('')]).nullable().transform((v) => (v === '' ? null : v)), column: feeConcessionTypes.percent },
      amountRupees: rupeeField('Amount (₹)', feeConcessionTypes, feeConcessionTypes.amountPaise, 'amountRupees'),
      headCodes: { label: 'Heads it covers', type: 'text', schema: CodeList, rowKey: 'headCodes', apply: (ctx, id, v) => setColumn(ctx, feeConcessionTypes, feeConcessionTypes.headCodes, id, v), help: 'Head codes with commas, e.g. TUI, LAB; blank for every head' },
      active: { label: 'Active', type: 'boolean', schema: z.boolean(), column: feeConcessionTypes.active, bulk: true, create: false },
    },
    order: { column: feeConcessionTypes.sortOrder },
    duplicate: async (ctx, row) => ({ name: await copyName(ctx.tx, feeConcessionTypes, feeConcessionTypes.name, String(row.name)) }),
    columns: [
      { key: 'name', header: 'Type' },
      { key: 'category', header: 'Category' },
      { key: 'mode', header: 'Given as' },
      { key: 'percent', header: 'Percent' },
      { key: 'amountRupees', header: 'Amount (₹)' },
      { key: 'headCodes', header: 'Heads' },
      { key: 'active', header: 'Active' },
    ],
    import: {
      columns: [
        { key: 'name', header: 'Name', required: true, example: 'Sibling concession' },
        { key: 'category', header: 'Category', required: true, options: CONCESSION_CATEGORIES, example: 'sibling' },
        { key: 'percent', header: 'Percent', example: '10', help: 'Give a percent or an amount' },
        { key: 'amount', header: 'Amount (₹)', example: '' },
        { key: 'heads', header: 'Heads', example: 'TUI', help: 'Head codes with commas; blank for every head' },
      ],
      key: ['name'],
      exists: async (ctx, r) => !!(await ctx.tx.select({ id: feeConcessionTypes.id }).from(feeConcessionTypes).where(sql`lower(${feeConcessionTypes.name}) = ${lc(r.get('name'))}`))[0],
      run: (ctx, rows) =>
        eachRow(ctx.tx, rows, async (tx, r) => {
          const name = required(r, 'name');
          const category = lc(required(r, 'category'));
          if (!CONCESSION_CATEGORIES.includes(category)) fail('Choose one of the listed values', category);
          const percent = r.get('percent') ? Math.trunc(num(r.get('percent'), 'Percent')) : null;
          const amount = r.get('amount') ? Math.round(num(r.get('amount'), 'Amount') * 100) : null;
          if (percent === null && amount === null) fail('Give a percent or an amount', name);
          if (percent !== null && (percent < 1 || percent > 100)) fail('A percent is 1 to 100', String(percent));
          const values = { category, mode: percent !== null ? 'percent' : 'amount', percent, amountPaise: amount, headCodes: CodeList.parse(r.get('heads')) };
          const [found] = await tx.select().from(feeConcessionTypes).where(sql`lower(${feeConcessionTypes.name}) = ${lc(name)}`);
          if (!found) {
            await tx.insert(feeConcessionTypes).values({ tenantId: ctx.p.tenantId, name, sortOrder: 1_000_000, ...values });
            return outcome(true, false, [name]);
          }
          await tx.update(feeConcessionTypes).set(values).where(eq(feeConcessionTypes.id, found.id));
          return outcome(false, true, [name]);
        }),
    },
  };
}

// ---- Instalment plans ---------------------------------------------------------------------------------------

/** "40@0; 30@60; 30@120": percent @ days after the due date. */
const PlanText = z
  .string()
  .trim()
  .min(3)
  .max(300)
  .transform((v, c) => {
    const parts = v
      .split(/[;\n]+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => /^(\d+(?:\.\d+)?)\s*%?\s*@\s*(\d+)$/.exec(x));
    if (parts.some((m) => !m)) {
      c.addIssue({ code: 'custom', message: 'Write each instalment as percent@days, e.g. 40@0; 30@60; 30@120' });
      return z.NEVER;
    }
    const plan = parts.map((m) => ({ percent: Number(m![1]), dueAfterDays: Number(m![2]) }));
    const problem = planProblem(plan);
    if (problem) {
      c.addIssue({ code: 'custom', message: problem });
      return z.NEVER;
    }
    return plan;
  });

export function instalmentPlansEntity(): RecordEntity {
  return {
    key: 'fee-instalment-plans',
    module: 'fees',
    table: feeInstalmentPlans,
    subjectType: 'fee_instalment_plan',
    roles: { read: W, write: W },
    label: (r) => String(r.name),
    list: {
      select: { id: feeInstalmentPlans.id, name: feeInstalmentPlans.name, parts: sql<string>`(select string_agg((x->>'percent') || '@' || (x->>'dueAfterDays'), '; ') from jsonb_array_elements(fee_instalment_plans.parts) x)`, count: sql<number>`jsonb_array_length(${feeInstalmentPlans.parts})`, active: feeInstalmentPlans.active, used: sql<number>`(select count(distinct i.invoice_id)::int from fee_instalments i where i.plan_id = fee_instalment_plans.id)`, createdAt: feeInstalmentPlans.createdAt },
      search: [feeInstalmentPlans.name],
      filters: { active: { label: 'Status', options: [{ value: 'yes', label: 'Active' }, { value: 'no', label: 'Switched off' }], where: (v) => (v === 'yes' ? eq(feeInstalmentPlans.active, true) : v === 'no' ? eq(feeInstalmentPlans.active, false) : undefined) } },
      sorts: { name: feeInstalmentPlans.name, created: feeInstalmentPlans.createdAt },
      defaultSort: { id: 'name', dir: 'asc' },
    },
    fields: {
      name: { label: 'Name', type: 'text', schema: Text(80), column: feeInstalmentPlans.name, required: true },
      parts: { label: 'Instalments', type: 'text', schema: PlanText, rowKey: 'parts', required: true, apply: (ctx, id, v) => setColumn(ctx, feeInstalmentPlans, feeInstalmentPlans.parts, id, v), help: 'percent@days after the due date, e.g. 40@0; 30@60; 30@120' },
      active: { label: 'Active', type: 'boolean', schema: z.boolean(), column: feeInstalmentPlans.active, bulk: true, create: false },
    },
    create: async (ctx, v) => {
      const [row] = await ctx.tx.insert(feeInstalmentPlans).values({ tenantId: ctx.p.tenantId, name: String(v.name), parts: v.parts as { percent: number; dueAfterDays: number }[] }).returning({ id: feeInstalmentPlans.id });
      return row.id;
    },
    duplicate: async (ctx, row) => ({ name: await copyName(ctx.tx, feeInstalmentPlans, feeInstalmentPlans.name, String(row.name)) }),
    columns: [
      { key: 'name', header: 'Plan' },
      { key: 'parts', header: 'Instalments (percent@days)' },
      { key: 'used', header: 'Invoices' },
      { key: 'active', header: 'Active' },
    ],
  };
}

// ---- Student fee profiles -----------------------------------------------------------------------------------

/** Saves one value of a student's fee profile (made the first time it is needed). */
const profileField = (column: 'quota' | 'category' | 'batch' | 'optedHeads') => async (ctx: KitCtx, id: string, v: unknown) => {
  await ctx.tx
    .insert(feeStudentProfiles)
    .values({ tenantId: ctx.p.tenantId, studentId: id, [column]: v })
    .onConflictDoUpdate({ target: feeStudentProfiles.studentId, set: { [column]: v, updatedAt: new Date() } });
};

export function feeProfilesEntity(): RecordEntity {
  return {
    key: 'fee-profiles',
    module: 'fees',
    table: students,
    subjectType: 'student',
    roles: { read: W, write: W },
    label: (r) => `${r.rollNo} ${r.fullName}`,
    list: {
      select: { id: students.id, fullName: students.fullName, rollNo: students.rollNo, sectionId: students.sectionId, section: sections.displayName, status: students.status, quota: feeStudentProfiles.quota, category: feeStudentProfiles.category, batch: feeStudentProfiles.batch, optedHeads: sql<string>`array_to_string(${feeStudentProfiles.optedHeads}, ', ')`, duePaise: sql<number>`coalesce((select sum(i.amount_paise - i.paid_paise) from fee_invoices i where i.student_id = ${students.id} and i.status = 'due'), 0)::bigint`.mapWith(Number) },
      joins: (q) => q.innerJoin(sections, eq(sections.id, students.sectionId)).leftJoin(feeStudentProfiles, eq(feeStudentProfiles.studentId, students.id)),
      search: [students.fullName, students.rollNo],
      filters: {
        section: { label: 'Class', options: sectionOptions, where: (v) => uuidEq(students.sectionId, v) },
        quota: { label: 'Quota', options: [...opts(QUOTAS), { value: 'none', label: 'Not set' }], where: (v) => (v === 'none' ? sql`${feeStudentProfiles.quota} is null` : sql`lower(${feeStudentProfiles.quota}) = ${lc(v)}`) },
        status: { label: 'Status', options: opts(['active', 'enrolled', 'alumni', 'withdrawn', 'suspended']), where: (v) => eq(students.status, v) },
        due: { label: 'Dues', options: [{ value: 'yes', label: 'Has dues' }, { value: 'no', label: 'Nothing due' }], where: (v) => (v === 'yes' ? sql`exists (select 1 from fee_invoices i where i.student_id = ${students.id} and i.status = 'due')` : v === 'no' ? sql`not exists (select 1 from fee_invoices i where i.student_id = ${students.id} and i.status = 'due')` : undefined) },
      },
      sorts: { name: students.fullName, roll: students.rollNo, section: sections.displayName, quota: feeStudentProfiles.quota, batch: feeStudentProfiles.batch },
      defaultSort: { id: 'section', dir: 'asc' },
      tiebreak: [students.rollNo],
    },
    fields: {
      quota: { label: 'Quota', type: 'select', schema: OptionalText(40), rowKey: 'quota', options: opts(QUOTAS), apply: profileField('quota'), bulk: true, create: false },
      category: { label: 'Category', type: 'text', schema: OptionalText(40), rowKey: 'category', apply: profileField('category'), bulk: true, create: false, help: 'Fee category, e.g. GM, OBC, SC/ST' },
      batch: { label: 'Batch (admission year)', type: 'text', schema: OptionalText(10), rowKey: 'batch', apply: profileField('batch'), bulk: true, create: false },
      optedHeads: { label: 'Optional heads taken', type: 'text', schema: CodeList, rowKey: 'optedHeads', apply: profileField('optedHeads'), bulk: true, create: false, help: 'Codes of optional heads they opted into, e.g. UNI, BKS' },
    },
    remove: { guard: never('Students are added and removed on the Students page') },
    columns: [
      { key: 'rollNo', header: 'Roll no' },
      { key: 'fullName', header: 'Student' },
      { key: 'section', header: 'Class' },
      { key: 'quota', header: 'Quota' },
      { key: 'category', header: 'Category' },
      { key: 'batch', header: 'Batch' },
      { key: 'optedHeads', header: 'Optional heads' },
      { key: 'duePaise', header: 'Due (₹)', value: (r) => Number(r.duePaise) / 100 },
    ],
    import: {
      columns: [
        { key: 'roll_no', header: 'Roll no', required: true, example: 'BC24-017' },
        { key: 'class', header: 'Class', example: 'BCom Sem 3 A', help: 'Only when roll numbers repeat across classes' },
        { key: 'quota', header: 'Quota', options: QUOTAS, example: 'government' },
        { key: 'category', header: 'Category', example: 'OBC' },
        { key: 'batch', header: 'Batch', example: '2024' },
        { key: 'optional_heads', header: 'Optional heads', example: 'UNI' },
      ],
      key: ['roll_no'],
      exists: async () => true,
      run: (ctx, rows) =>
        eachRow(ctx.tx, rows, async (tx, r) => {
          const st = await studentByRoll({ tx, p: ctx.p }, required(r, 'roll_no'), r.get('class') || undefined);
          const set: Record<string, unknown> = {};
          if (r.get('quota')) set.quota = lc(r.get('quota'));
          if (r.get('category')) set.category = r.get('category');
          if (r.get('batch')) set.batch = r.get('batch');
          if (r.get('optional_heads')) set.optedHeads = CodeList.parse(r.get('optional_heads'));
          if (!Object.keys(set).length) return outcome(false, false, [r.get('roll_no')]);
          await tx.insert(feeStudentProfiles).values({ tenantId: ctx.p.tenantId, studentId: st.id, ...set }).onConflictDoUpdate({ target: feeStudentProfiles.studentId, set: { ...set, updatedAt: new Date() } });
          return outcome(false, true, [r.get('roll_no')]);
        }),
    },
  };
}

// ---- Invoices ------------------------------------------------------------------------------------------------

export function feeInvoicesEntity(): RecordEntity {
  const balance = sql<number>`(${feeInvoices.amountPaise} - ${feeInvoices.paidPaise})::bigint`.mapWith(Number);
  return {
    key: 'fee-invoices',
    module: 'fees',
    table: feeInvoices,
    subjectType: 'fee_invoice',
    roles: { read: W, write: W },
    label: (r) => `${r.invoiceNo ?? ''} ${r.title} (${r.student})`.trim(),
    list: {
      select: { id: feeInvoices.id, invoiceNo: feeInvoices.invoiceNo, title: feeInvoices.title, kind: feeInvoices.kind, academicYear: feeInvoices.academicYear, studentId: feeInvoices.studentId, student: students.fullName, rollNo: students.rollNo, section: sections.displayName, amountPaise: feeInvoices.amountPaise, paidPaise: feeInvoices.paidPaise, balancePaise: balance, dueOn: feeInvoices.dueOn, status: feeInvoices.status, carriedPaise: feeInvoices.carriedPaise, createdAt: feeInvoices.createdAt },
      joins: (q) => q.innerJoin(students, eq(students.id, feeInvoices.studentId)).innerJoin(sections, eq(sections.id, feeInvoices.sectionId)),
      search: [feeInvoices.title, feeInvoices.invoiceNo, students.fullName, students.rollNo],
      filters: {
        status: { label: 'Status', options: opts(['due', 'paid', 'cancelled']), where: (v) => (['due', 'paid', 'cancelled'].includes(v) ? eq(feeInvoices.status, v as 'due') : undefined) },
        overdue: { label: 'Overdue', options: [{ value: 'yes', label: 'Overdue' }], where: (v) => (v === 'yes' ? sql`${feeInvoices.status} = 'due' and ${feeInvoices.dueOn} < (now() at time zone 'Asia/Kolkata')::date` : undefined) },
        kind: { label: 'Kind', options: opts(['fee', 'arrears', 'revision', 'charge']), where: (v) => eq(feeInvoices.kind, v) },
        section: { label: 'Class', options: sectionOptions, where: (v) => uuidEq(feeInvoices.sectionId, v) },
        year: { label: 'Year', options: yearOptions, where: (v) => eq(feeInvoices.academicYear, v) },
      },
      sorts: { due: feeInvoices.dueOn, number: feeInvoices.invoiceNo, student: students.fullName, amount: feeInvoices.amountPaise, balance, created: feeInvoices.createdAt, section: sections.displayName },
      defaultSort: { id: 'created', dir: 'desc' },
    },
    fields: {
      title: { label: 'Title', type: 'text', schema: Text(120), column: feeInvoices.title, create: false },
      dueOn: { label: 'Due on', type: 'date', schema: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15'), column: feeInvoices.dueOn, create: false, bulk: true },
    },
    remove: {
      guard: async (ctx, id) => {
        const inv = await rowOf<{ paidPaise: number; status: string }>(ctx, feeInvoices, id);
        if (inv.paidPaise > 0) return 'Money has been received against this invoice; it cannot be deleted';
        const [pays] = (await ctx.tx.execute<{ n: number }>(sql`select count(*)::int as n from fee_payments where invoice_id = ${id}::uuid`)).rows;
        return Number(pays.n) > 0 ? 'Payments were recorded against this invoice; cancel it instead' : null;
      },
    },
    columns: [
      { key: 'invoiceNo', header: 'Invoice' },
      { key: 'rollNo', header: 'Roll no' },
      { key: 'student', header: 'Student' },
      { key: 'section', header: 'Class' },
      { key: 'title', header: 'Title' },
      { key: 'kind', header: 'Kind' },
      { key: 'academicYear', header: 'Year' },
      { key: 'amountPaise', header: 'Amount (₹)', value: (r) => Number(r.amountPaise) / 100 },
      { key: 'paidPaise', header: 'Paid (₹)', value: (r) => Number(r.paidPaise) / 100 },
      { key: 'balancePaise', header: 'Balance (₹)', value: (r) => Number(r.balancePaise) / 100 },
      { key: 'dueOn', header: 'Due on' },
      { key: 'status', header: 'Status' },
    ],
    actions: {
      cancel: {
        label: 'Cancel invoice',
        tone: 'danger',
        apply: async (ctx, id) => {
          const inv = await rowOf<{ paidPaise: number; status: string }>(ctx, feeInvoices, id);
          if (inv.status === 'cancelled') return 'Already cancelled';
          if (inv.paidPaise > 0) throw new ConflictException('Money has been received against this invoice; it cannot be cancelled');
          await ctx.tx.update(feeInvoices).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(feeInvoices.id, id));
          await auditUser(ctx.tx, ctx.p, 'fees.cancelled', 'fee_invoice', id);
        },
      },
    },
  };
}

// ---- Receipts --------------------------------------------------------------------------------------------------

export function feeReceiptsEntity(): RecordEntity {
  const modes = sql<string>`(select string_agg(distinct m->>'method', ' + ') from jsonb_array_elements(${feeReceipts.modes}) m)`;
  return {
    key: 'fee-receipts',
    module: 'fees',
    table: feeReceipts,
    subjectType: 'fee_receipt',
    historyTypes: ['fee_payment'],
    roles: { read: W, write: W },
    label: (r) => `${r.receiptNo} (${r.student})`,
    list: {
      select: { id: feeReceipts.id, receiptNo: feeReceipts.receiptNo, studentId: feeReceipts.studentId, student: students.fullName, rollNo: students.rollNo, totalPaise: feeReceipts.totalPaise, advancePaise: feeReceipts.advancePaise, modes, status: feeReceipts.status, collectedOn: feeReceipts.collectedOn, cashier: users.fullName, printCount: feeReceipts.printCount, createdAt: feeReceipts.createdAt },
      joins: (q) => q.innerJoin(students, eq(students.id, feeReceipts.studentId)).leftJoin(users, eq(users.id, feeReceipts.collectedBy)),
      search: [feeReceipts.receiptNo, students.fullName, students.rollNo],
      filters: {
        status: { label: 'Status', options: opts(['active', 'cancel_pending', 'cancelled', 'bounced']), where: (v) => eq(feeReceipts.status, v) },
        mode: { label: 'Mode', options: opts(['cash', 'cheque', 'dd', 'card', 'upi', 'bank_transfer', 'online', 'scholarship', 'credit']), where: (v) => sql`exists (select 1 from jsonb_array_elements(${feeReceipts.modes}) m where m->>'method' = ${v})` },
        cashier: { label: 'Cashier', options: cashierOptions, where: (v) => uuidEq(feeReceipts.collectedBy, v) },
        day: { label: 'Date', options: [{ value: 'today', label: 'Today' }, { value: 'week', label: 'Last 7 days' }, { value: 'month', label: 'This month' }], where: (v) => (v === 'today' ? sql`${feeReceipts.collectedOn} = (now() at time zone 'Asia/Kolkata')::date` : v === 'week' ? sql`${feeReceipts.collectedOn} > (now() at time zone 'Asia/Kolkata')::date - 7` : v === 'month' ? sql`date_trunc('month', ${feeReceipts.collectedOn}) = date_trunc('month', (now() at time zone 'Asia/Kolkata')::date)` : undefined) },
      },
      sorts: { date: feeReceipts.createdAt, number: feeReceipts.receiptNo, student: students.fullName, amount: feeReceipts.totalPaise },
      defaultSort: { id: 'date', dir: 'desc' },
    },
    remove: { guard: never('Receipts are never deleted; ask to cancel it instead') },
    columns: [
      { key: 'receiptNo', header: 'Receipt' },
      { key: 'collectedOn', header: 'Date' },
      { key: 'rollNo', header: 'Roll no' },
      { key: 'student', header: 'Student' },
      { key: 'modes', header: 'Modes' },
      { key: 'totalPaise', header: 'Amount (₹)', value: (r) => Number(r.totalPaise) / 100 },
      { key: 'advancePaise', header: 'Advance (₹)', value: (r) => Number(r.advancePaise) / 100 },
      { key: 'cashier', header: 'Cashier' },
      { key: 'status', header: 'Status' },
      { key: 'printCount', header: 'Prints' },
    ],
  };
}

// ---- Desk requests and registers --------------------------------------------------------------------------------

/** A request list (concessions, refunds, write-offs, waivers, plans): decided ones stay, pending or rejected ones may go to the bin. */
const keepDecided = (table: Parameters<typeof rowOf>[1], keep: string[], why: string) => async (ctx: KitCtx, id: string) => (keep.includes((await rowOf<{ status: string }>(ctx, table, id)).status) ? why : null);

export function concessionsEntity(): RecordEntity {
  return {
    key: 'fee-concessions',
    module: 'fees',
    table: feeConcessions,
    subjectType: 'fee_concession',
    roles: { read: W, write: W },
    label: (r) => `${r.number} (${r.student})`,
    list: {
      select: { id: feeConcessions.id, number: feeConcessions.number, studentId: feeConcessions.studentId, student: students.fullName, rollNo: students.rollNo, kind: feeConcessions.kind, type: feeConcessionTypes.name, percent: feeConcessions.percent, amountPaise: feeConcessions.amountPaise, appliedPaise: feeConcessions.appliedPaise, headCodes: joinCodes(feeConcessions.headCodes), status: feeConcessions.status, level: feeConcessions.level, reason: feeConcessions.reason, createdAt: feeConcessions.createdAt },
      joins: (q) => q.innerJoin(students, eq(students.id, feeConcessions.studentId)).leftJoin(feeConcessionTypes, eq(feeConcessionTypes.id, feeConcessions.typeId)),
      search: [feeConcessions.number, students.fullName, students.rollNo, feeConcessions.reason],
      filters: {
        status: { label: 'Status', options: opts(['pending', 'approved', 'rejected']), where: (v) => eq(feeConcessions.status, v) },
        kind: { label: 'Kind', options: opts(['concession', 'scholarship', 'sponsor', 'sibling', 'staff_ward', 'merit', 'sports', 'government', 'need', 'management', 'other']), where: (v) => eq(feeConcessions.kind, v) },
        type: { label: 'Type', options: async (ctx) => (await ctx.tx.select({ id: feeConcessionTypes.id, name: feeConcessionTypes.name }).from(feeConcessionTypes).orderBy(asc(feeConcessionTypes.sortOrder))).map((t) => ({ value: t.id, label: t.name })), where: (v) => uuidEq(feeConcessions.typeId, v) },
      },
      sorts: { date: feeConcessions.createdAt, number: feeConcessions.number, student: students.fullName, amount: feeConcessions.amountPaise },
      defaultSort: { id: 'date', dir: 'desc' },
    },
    remove: { guard: keepDecided(feeConcessions, ['approved'], 'An approved concession has reduced the fees; it stays on record') },
    columns: [
      { key: 'number', header: 'Number' },
      { key: 'rollNo', header: 'Roll no' },
      { key: 'student', header: 'Student' },
      { key: 'type', header: 'Type' },
      { key: 'kind', header: 'Kind' },
      { key: 'headCodes', header: 'Heads' },
      { key: 'amountPaise', header: 'Asked (₹)', value: (r) => Number(r.amountPaise) / 100 },
      { key: 'appliedPaise', header: 'Applied (₹)', value: (r) => Number(r.appliedPaise) / 100 },
      { key: 'status', header: 'Status' },
      { key: 'reason', header: 'Reason' },
    ],
  };
}

export function refundsEntity(): RecordEntity {
  return {
    key: 'fee-refunds',
    module: 'fees',
    table: feeRefundRequests,
    subjectType: 'fee_refund_request',
    roles: { read: W, write: W },
    label: (r) => `${r.number} (${r.student})`,
    list: {
      select: { id: feeRefundRequests.id, number: feeRefundRequests.number, student: students.fullName, rollNo: students.rollNo, amountPaise: feeRefundRequests.amountPaise, reason: feeRefundRequests.reason, status: feeRefundRequests.status, closeDues: feeRefundRequests.closeDues, payMode: feeRefundRequests.payMode, payeeName: feeRefundRequests.payeeName, createdAt: feeRefundRequests.createdAt },
      joins: (q) => q.innerJoin(students, eq(students.id, feeRefundRequests.studentId)),
      search: [feeRefundRequests.number, students.fullName, students.rollNo, feeRefundRequests.reason],
      filters: { status: { label: 'Status', options: opts(['requested', 'approved', 'paid', 'rejected', 'reverted']), where: (v) => eq(feeRefundRequests.status, v) } },
      sorts: { date: feeRefundRequests.createdAt, number: feeRefundRequests.number, student: students.fullName, amount: feeRefundRequests.amountPaise },
      defaultSort: { id: 'date', dir: 'desc' },
    },
    remove: { guard: keepDecided(feeRefundRequests, ['approved', 'paid', 'reverted'], 'An approved or paid refund stays on record') },
    columns: [
      { key: 'number', header: 'Number' },
      { key: 'rollNo', header: 'Roll no' },
      { key: 'student', header: 'Student' },
      { key: 'amountPaise', header: 'Amount (₹)', value: (r) => Number(r.amountPaise) / 100 },
      { key: 'closeDues', header: 'Withdrawal' },
      { key: 'payMode', header: 'Paid by' },
      { key: 'status', header: 'Status' },
      { key: 'reason', header: 'Reason' },
    ],
  };
}

export function writeOffsEntity(): RecordEntity {
  return {
    key: 'fee-write-offs',
    module: 'fees',
    table: feeWriteOffs,
    subjectType: 'fee_write_off',
    roles: { read: W, write: W },
    label: (r) => `${r.number} (${r.student})`,
    list: {
      select: { id: feeWriteOffs.id, number: feeWriteOffs.number, student: students.fullName, rollNo: students.rollNo, title: feeInvoices.title, amountPaise: feeWriteOffs.amountPaise, reason: feeWriteOffs.reason, status: feeWriteOffs.status, createdAt: feeWriteOffs.createdAt },
      joins: (q) => q.innerJoin(students, eq(students.id, feeWriteOffs.studentId)).innerJoin(feeInvoices, eq(feeInvoices.id, feeWriteOffs.invoiceId)),
      search: [feeWriteOffs.number, students.fullName, feeWriteOffs.reason],
      filters: { status: { label: 'Status', options: opts(['pending', 'approved', 'rejected']), where: (v) => eq(feeWriteOffs.status, v) } },
      sorts: { date: feeWriteOffs.createdAt, number: feeWriteOffs.number, amount: feeWriteOffs.amountPaise },
      defaultSort: { id: 'date', dir: 'desc' },
    },
    remove: { guard: keepDecided(feeWriteOffs, ['approved'], 'An approved write-off stays on record') },
    columns: [
      { key: 'number', header: 'Number' },
      { key: 'student', header: 'Student' },
      { key: 'title', header: 'Invoice' },
      { key: 'amountPaise', header: 'Amount (₹)', value: (r) => Number(r.amountPaise) / 100 },
      { key: 'status', header: 'Status' },
      { key: 'reason', header: 'Reason' },
    ],
  };
}

export function chequesEntity(): RecordEntity {
  const step = (action: ChequeAction) => async (ctx: KitCtx, id: string, params: unknown) => {
    // The date of the step; today when not given.
    const on = (params as { on?: string } | undefined)?.on ?? String((await ctx.tx.execute<{ d: string }>(sql`select (now() at time zone 'Asia/Kolkata')::date::text as d`)).rows[0].d);
    const chq = await rowOf<{ status: string }>(ctx, feeCheques, id);
    const to = chequeNext(chq.status, action);
    if (!to) throw new ConflictException(`A ${chq.status} cheque cannot be marked that way`);
    await ctx.tx.update(feeCheques).set(to === 'deposited' ? { status: to, depositedOn: on } : { status: to, clearedOn: on }).where(eq(feeCheques.id, id));
    await auditUser(ctx.tx, ctx.p, `cheque.${to}`, 'fee_cheque', id, { on });
  };
  const OnParams = z.object({ on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15').optional() });
  return {
    key: 'fee-cheques',
    module: 'fees',
    table: feeCheques,
    subjectType: 'fee_cheque',
    roles: { read: W, write: W },
    label: (r) => `${r.kind === 'dd' ? 'DD' : 'Cheque'} ${r.chequeNo} (${r.student})`,
    list: {
      select: { id: feeCheques.id, chequeNo: feeCheques.chequeNo, kind: feeCheques.kind, bankName: feeCheques.bankName, chequeDate: feeCheques.chequeDate, student: students.fullName, rollNo: students.rollNo, amountPaise: feeCheques.amountPaise, status: feeCheques.status, depositedOn: feeCheques.depositedOn, clearedOn: feeCheques.clearedOn, bouncedOn: feeCheques.bouncedOn, bounceReason: feeCheques.bounceReason, receiptNo: feeReceipts.receiptNo },
      joins: (q) => q.innerJoin(students, eq(students.id, feeCheques.studentId)).leftJoin(feeReceipts, eq(feeReceipts.id, feeCheques.receiptId)),
      search: [feeCheques.chequeNo, feeCheques.bankName, students.fullName, feeReceipts.receiptNo],
      filters: {
        status: { label: 'Status', options: opts(['received', 'deposited', 'cleared', 'bounced']), where: (v) => eq(feeCheques.status, v) },
        kind: { label: 'Instrument', options: [{ value: 'cheque', label: 'Cheque' }, { value: 'dd', label: 'Demand draft' }], where: (v) => eq(feeCheques.kind, v) },
      },
      sorts: { date: feeCheques.chequeDate, number: feeCheques.chequeNo, amount: feeCheques.amountPaise, student: students.fullName },
      defaultSort: { id: 'date', dir: 'desc' },
    },
    remove: { guard: never('The cheque register keeps every cheque; mark it bounced if it was returned') },
    actions: {
      deposit: { label: 'Mark deposited', params: OnParams, apply: step('deposit') },
      clear: { label: 'Mark cleared', params: OnParams, apply: step('clear') },
    },
    columns: [
      { key: 'chequeNo', header: 'Number' },
      { key: 'kind', header: 'Instrument' },
      { key: 'bankName', header: 'Bank' },
      { key: 'chequeDate', header: 'Date' },
      { key: 'student', header: 'Student' },
      { key: 'receiptNo', header: 'Receipt' },
      { key: 'amountPaise', header: 'Amount (₹)', value: (r) => Number(r.amountPaise) / 100 },
      { key: 'status', header: 'Status' },
      { key: 'depositedOn', header: 'Deposited' },
      { key: 'clearedOn', header: 'Cleared' },
      { key: 'bounceReason', header: 'Returned because' },
    ],
  };
}

export function closingsEntity(): RecordEntity {
  return {
    key: 'fee-closings',
    module: 'fees',
    table: feeCashClosings,
    subjectType: 'fee_cash_closing',
    roles: { read: W, write: W },
    label: (r) => `${r.closingDate} ${r.cashier}`,
    list: {
      select: { id: feeCashClosings.id, closingDate: feeCashClosings.closingDate, cashier: users.fullName, systemPaise: feeCashClosings.systemPaise, countedPaise: feeCashClosings.countedPaise, variancePaise: sql<number>`(${feeCashClosings.countedPaise} - ${feeCashClosings.systemPaise})::bigint`.mapWith(Number), receiptCount: feeCashClosings.receiptCount, status: feeCashClosings.status, handedTo: sql<string | null>`(select full_name from users h where h.id = ${feeCashClosings.handedTo})` },
      joins: (q) => q.innerJoin(users, eq(users.id, feeCashClosings.cashierId)),
      search: [users.fullName],
      filters: { status: { label: 'Status', options: opts(['submitted', 'verified', 'rejected']), where: (v) => eq(feeCashClosings.status, v) } },
      sorts: { date: feeCashClosings.closingDate, cashier: users.fullName, variance: sql`(${feeCashClosings.countedPaise} - ${feeCashClosings.systemPaise})` },
      defaultSort: { id: 'date', dir: 'desc' },
    },
    remove: { guard: keepDecided(feeCashClosings, ['verified', 'submitted'], 'A day’s cash count stays on record; a rejected one is counted again') },
    columns: [
      { key: 'closingDate', header: 'Date' },
      { key: 'cashier', header: 'Cashier' },
      { key: 'receiptCount', header: 'Receipts' },
      { key: 'systemPaise', header: 'System (₹)', value: (r) => Number(r.systemPaise) / 100 },
      { key: 'countedPaise', header: 'Counted (₹)', value: (r) => Number(r.countedPaise) / 100 },
      { key: 'variancePaise', header: 'Difference (₹)', value: (r) => Number(r.variancePaise) / 100 },
      { key: 'status', header: 'Status' },
      { key: 'handedTo', header: 'Handed to' },
    ],
  };
}

// ---- Government scholarships ------------------------------------------------------------------------------

export function govtScholarshipsEntity(): RecordEntity {
  return {
    key: 'fee-govt-scholarships',
    module: 'fees',
    table: feeGovtScholarships,
    subjectType: 'govt_scholarship',
    roles: { read: W, write: W },
    label: (r) => `${r.scheme} ${r.applicationNo} (${r.student})`,
    list: {
      select: { id: feeGovtScholarships.id, studentId: feeGovtScholarships.studentId, student: students.fullName, rollNo: students.rollNo, section: sections.displayName, scheme: feeGovtScholarships.scheme, portal: feeGovtScholarships.portal, applicationNo: feeGovtScholarships.applicationNo, academicYear: feeGovtScholarships.academicYear, status: feeGovtScholarships.status, appliedRupees: rupeesOf(feeGovtScholarships.appliedPaise), appliedPaise: feeGovtScholarships.appliedPaise, appliedOn: feeGovtScholarships.appliedOn, sanctionedPaise: feeGovtScholarships.sanctionedPaise, receivedPaise: feeGovtScholarships.receivedPaise, receivedOn: feeGovtScholarships.receivedOn, note: feeGovtScholarships.note, rollForCreate: students.rollNo },
      joins: (q) => q.innerJoin(students, eq(students.id, feeGovtScholarships.studentId)).innerJoin(sections, eq(sections.id, students.sectionId)),
      search: [feeGovtScholarships.scheme, feeGovtScholarships.applicationNo, students.fullName, students.rollNo],
      filters: {
        status: { label: 'Status', options: opts(['applied', 'sanctioned', 'received', 'rejected', 'lapsed']), where: (v) => eq(feeGovtScholarships.status, v) },
        portal: { label: 'Portal', options: [{ value: 'nsp', label: 'National Scholarship Portal' }, { value: 'state', label: 'State portal' }, { value: 'institution', label: 'Institution' }, { value: 'other', label: 'Other' }], where: (v) => eq(feeGovtScholarships.portal, v) },
        year: { label: 'Year', options: yearOptions, where: (v) => eq(feeGovtScholarships.academicYear, v) },
      },
      sorts: { student: students.fullName, scheme: feeGovtScholarships.scheme, applied: feeGovtScholarships.appliedOn, received: feeGovtScholarships.receivedOn, amount: feeGovtScholarships.appliedPaise },
      defaultSort: { id: 'applied', dir: 'desc' },
    },
    fields: {
      rollForCreate: { label: 'Student roll no', type: 'text', schema: Text(40), rowKey: 'rollForCreate', required: true, edit: false, apply: async () => undefined, help: 'The student’s roll number' },
      scheme: { label: 'Scheme', type: 'text', schema: Text(120), column: feeGovtScholarships.scheme, required: true, help: 'e.g. Post-matric scholarship (SC/ST)' },
      portal: { label: 'Portal', type: 'select', schema: z.enum(PORTALS as [string, ...string[]]), column: feeGovtScholarships.portal, options: [{ value: 'nsp', label: 'National Scholarship Portal' }, { value: 'state', label: 'State portal' }, { value: 'institution', label: 'Institution' }, { value: 'other', label: 'Other' }], required: true, bulk: true },
      applicationNo: { label: 'Application number', type: 'text', schema: Text(60), column: feeGovtScholarships.applicationNo, required: true },
      academicYear: { label: 'Academic year', type: 'text', schema: z.string().regex(/^\d{4}-\d{2}$/, 'Use a year like 2026-27'), column: feeGovtScholarships.academicYear, required: true, bulk: true },
      appliedRupees: rupeeField('Amount applied for (₹)', feeGovtScholarships, feeGovtScholarships.appliedPaise, 'appliedRupees'),
      appliedOn: { label: 'Applied on', type: 'date', schema: DateText, column: feeGovtScholarships.appliedOn },
      note: { label: 'Note', type: 'textarea', schema: z.string().trim().max(500).default(''), column: feeGovtScholarships.note },
    },
    create: async (ctx, v) => {
      const st = await studentByRoll(ctx, String(v.rollForCreate)).catch((e) => {
        throw new BadRequestException({ formErrors: [], fieldErrors: { rollForCreate: [(e as Error).message] } });
      });
      const [row] = await ctx.tx
        .insert(feeGovtScholarships)
        .values({ tenantId: ctx.p.tenantId, studentId: st.id, scheme: String(v.scheme), portal: String(v.portal ?? 'state'), applicationNo: String(v.applicationNo), academicYear: String(v.academicYear), appliedPaise: Math.round(Number(v.appliedRupees ?? 0) * 100), appliedOn: (v.appliedOn as string) ?? null, note: String(v.note ?? ''), createdBy: ctx.p.userId })
        .returning({ id: feeGovtScholarships.id });
      return row.id;
    },
    remove: { guard: keepDecided(feeGovtScholarships, ['received'], 'Received scholarship money is on a receipt; it stays on record') },
    columns: [
      { key: 'rollNo', header: 'Roll no' },
      { key: 'student', header: 'Student' },
      { key: 'section', header: 'Class' },
      { key: 'scheme', header: 'Scheme' },
      { key: 'portal', header: 'Portal' },
      { key: 'applicationNo', header: 'Application' },
      { key: 'academicYear', header: 'Year' },
      { key: 'appliedPaise', header: 'Applied (₹)', value: (r) => Number(r.appliedPaise) / 100 },
      { key: 'sanctionedPaise', header: 'Sanctioned (₹)', value: (r) => Number(r.sanctionedPaise) / 100 },
      { key: 'receivedPaise', header: 'Received (₹)', value: (r) => Number(r.receivedPaise) / 100 },
      { key: 'status', header: 'Status' },
    ],
    import: {
      columns: [
        { key: 'roll_no', header: 'Roll no', required: true, example: 'BC24-017' },
        { key: 'class', header: 'Class', example: '', help: 'Only when roll numbers repeat across classes' },
        { key: 'scheme', header: 'Scheme', required: true, example: 'Post-matric scholarship (SC/ST)' },
        { key: 'portal', header: 'Portal', required: true, options: PORTALS, example: 'state' },
        { key: 'application_no', header: 'Application number', required: true, example: 'KA2026PM004512' },
        { key: 'academic_year', header: 'Academic year', required: true, example: '2026-27' },
        { key: 'applied_amount', header: 'Amount applied (₹)', example: '25000' },
        { key: 'applied_on', header: 'Applied on', example: '2026-08-14' },
        { key: 'sanctioned_amount', header: 'Amount sanctioned (₹)', example: '' },
      ],
      key: ['portal', 'application_no'],
      exists: async (ctx, r) => !!(await ctx.tx.select({ id: feeGovtScholarships.id }).from(feeGovtScholarships).where(and(eq(feeGovtScholarships.portal, lc(r.get('portal'))), eq(feeGovtScholarships.applicationNo, r.get('application_no')))))[0],
      run: (ctx, rows) =>
        eachRow(ctx.tx, rows, async (tx, r) => {
          const st = await studentByRoll({ tx, p: ctx.p }, required(r, 'roll_no'), r.get('class') || undefined);
          const portal = lc(required(r, 'portal'));
          if (!PORTALS.includes(portal)) fail('Choose one of the listed values', portal);
          const year = required(r, 'academic_year');
          if (!/^\d{4}-\d{2}$/.test(year)) fail('Use a year like 2026-27', year);
          const appNo = required(r, 'application_no');
          const sanctioned = r.get('sanctioned_amount') ? Math.round(num(r.get('sanctioned_amount'), 'Sanctioned') * 100) : 0;
          const values = { studentId: st.id, scheme: required(r, 'scheme'), academicYear: year, appliedPaise: r.get('applied_amount') ? Math.round(num(r.get('applied_amount'), 'Applied') * 100) : 0, appliedOn: r.get('applied_on') || null, ...(sanctioned > 0 ? { sanctionedPaise: sanctioned, status: 'sanctioned' } : {}) };
          const [found] = await tx.select().from(feeGovtScholarships).where(and(eq(feeGovtScholarships.portal, portal), eq(feeGovtScholarships.applicationNo, appNo)));
          if (!found) {
            await tx.insert(feeGovtScholarships).values({ tenantId: ctx.p.tenantId, portal, applicationNo: appNo, createdBy: ctx.p.userId, ...values });
            return outcome(true, false, [appNo]);
          }
          if (['received', 'rejected', 'lapsed'].includes(found.status)) fail('This scholarship is closed', appNo);
          await tx.update(feeGovtScholarships).set({ ...values, updatedAt: new Date() }).where(eq(feeGovtScholarships.id, found.id));
          return outcome(false, true, [appNo]);
        }),
    },
  };
}

// ---- Challans, waivers and one-student plans --------------------------------------------------------------

export function challansEntity(): RecordEntity {
  return {
    key: 'fee-challans',
    module: 'fees',
    table: feeChallans,
    subjectType: 'fee_challan',
    roles: { read: W, write: W },
    label: (r) => `${r.number} (${r.student})`,
    list: {
      select: { id: feeChallans.id, number: feeChallans.number, student: students.fullName, rollNo: students.rollNo, amountPaise: feeChallans.amountPaise, bankName: feeChallans.bankName, validUntil: feeChallans.validUntil, status: sql<string>`case when ${feeChallans.status} = 'issued' and ${feeChallans.validUntil} < (now() at time zone 'Asia/Kolkata')::date then 'expired' else ${feeChallans.status} end`, paidOn: feeChallans.paidOn, bankRef: feeChallans.bankRef, createdAt: feeChallans.createdAt },
      joins: (q) => q.innerJoin(students, eq(students.id, feeChallans.studentId)),
      search: [feeChallans.number, students.fullName, students.rollNo, feeChallans.bankRef],
      filters: { status: { label: 'Status', options: opts(['issued', 'paid', 'expired', 'cancelled']), where: (v) => (v === 'expired' ? sql`${feeChallans.status} = 'issued' and ${feeChallans.validUntil} < (now() at time zone 'Asia/Kolkata')::date` : v === 'issued' ? sql`${feeChallans.status} = 'issued' and ${feeChallans.validUntil} >= (now() at time zone 'Asia/Kolkata')::date` : eq(feeChallans.status, v)) } },
      sorts: { date: feeChallans.createdAt, number: feeChallans.number, amount: feeChallans.amountPaise, valid: feeChallans.validUntil },
      defaultSort: { id: 'date', dir: 'desc' },
    },
    remove: { guard: keepDecided(feeChallans, ['paid', 'issued'], 'A challan stays on record; cancel an unpaid one instead') },
    columns: [
      { key: 'number', header: 'Challan' },
      { key: 'rollNo', header: 'Roll no' },
      { key: 'student', header: 'Student' },
      { key: 'bankName', header: 'Bank' },
      { key: 'amountPaise', header: 'Amount (₹)', value: (r) => Number(r.amountPaise) / 100 },
      { key: 'validUntil', header: 'Valid until' },
      { key: 'status', header: 'Status' },
      { key: 'paidOn', header: 'Paid on' },
      { key: 'bankRef', header: 'Bank reference' },
    ],
  };
}

function requestEntity(key: 'fee-waivers' | 'fee-custom-plans'): RecordEntity {
  const t = key === 'fee-waivers' ? feeWaiverRequests : feeCustomPlans;
  const amount = key === 'fee-waivers' ? feeWaiverRequests.amountPaise : sql<number>`(select coalesce(sum((x->>'amountPaise')::bigint), 0) from jsonb_array_elements(${feeCustomPlans.parts}) x)`.mapWith(Number);
  return {
    key,
    module: 'fees',
    table: t,
    subjectType: key === 'fee-waivers' ? 'fee_waiver_request' : 'fee_custom_plan',
    roles: { read: W, write: W },
    label: (r) => `${r.number} (${r.student})`,
    list: {
      select: { id: t.id, number: t.number, student: students.fullName, rollNo: students.rollNo, invoice: feeInvoices.title, amountPaise: amount, reason: t.reason, status: t.status, level: t.level, createdAt: t.createdAt },
      joins: (q) => q.innerJoin(students, eq(students.id, t.studentId)).innerJoin(feeInvoices, eq(feeInvoices.id, t.invoiceId)),
      search: [t.number, students.fullName, students.rollNo, t.reason],
      filters: { status: { label: 'Status', options: opts(['pending', 'approved', 'rejected']), where: (v) => eq(t.status, v) } },
      sorts: { date: t.createdAt, number: t.number, student: students.fullName },
      defaultSort: { id: 'date', dir: 'desc' },
    },
    remove: { guard: keepDecided(t, ['approved'], 'An approved request stays on record') },
    columns: [
      { key: 'number', header: 'Number' },
      { key: 'student', header: 'Student' },
      { key: 'invoice', header: 'Invoice' },
      { key: 'amountPaise', header: 'Amount (₹)', value: (r) => Number(r.amountPaise) / 100 },
      { key: 'status', header: 'Status' },
      { key: 'reason', header: 'Reason' },
    ],
  };
}

@Injectable()
export class FeeRecords implements OnModuleInit {
  constructor(private readonly registry: RecordRegistry) {}

  onModuleInit(): void {
    for (const e of [feeHeadsEntity(), feeStructuresEntity(), concessionTypesEntity(), instalmentPlansEntity(), feeProfilesEntity(), feeInvoicesEntity(), feeReceiptsEntity(), concessionsEntity(), refundsEntity(), writeOffsEntity(), chequesEntity(), closingsEntity(), govtScholarshipsEntity(), challansEntity(), requestEntity('fee-waivers'), requestEntity('fee-custom-plans')]) this.registry.register(e);
  }
}
