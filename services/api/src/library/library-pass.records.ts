import { BadRequestException, ConflictException, Injectable, OnModuleInit } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { auditUser } from '../common/audit.js';
import { Bool, choiceFilter, choices, oneOf, OptionalDecimal, OptionalInt, qual, Rupees, rupeesOf, wordsOf } from '../common/lht-kit.js';
import { nextNumber } from '../common/ops.js';
import { Clock } from '../common/time.js';
import { libraryBooks } from '../db/schema.js';
import { libraryEresources } from '../db/schema-depth.js';
import { libraryAcquisitions, libraryCopies, libraryMemberCategories } from '../db/schema-lht.js';
import { libraryBindingBatches, libraryBindingItems, libraryCircRules, libraryEresourceUsage, libraryInvoices, libraryPurchaseOrders, libraryVendors } from '../db/schema-library.js';
import { RecordRegistry, type FieldOption, type KitCtx, type RecordEntity } from '../records/entity.js';
import { DateText, Int, OptionalRef, Text, uuidEq } from '../records/helpers.js';
import { eachRow } from '../records/import.js';
import { fail, int, outcome, required } from '../import/row-helpers.js';
import { findCopy, syncCopies, tenantToday } from './circulation.js';
import { LIBRARY_ROLES } from './library.controller.js';
import { budgetOptions, poOptions, vendorOptions } from './library-more.records.js';
import { MATERIALS } from './library.records.js';

/** The circulation rules matrix, vendors, purchase orders and invoices, binding batches, and e-resource usage. */

const VENDOR_KINDS = choices(['books', 'Books'], ['journals', 'Journals and subscriptions'], ['binder', 'Binder'], ['eresources', 'E-resources'], ['other', 'Other']);
const PO_STATUSES = choices(['draft', 'Draft'], ['sent', 'Sent to the vendor'], ['partly_received', 'Partly received'], ['received', 'Received'], ['closed', 'Closed'], ['cancelled', 'Cancelled']);
const INVOICE_STATUSES = choices(['recorded', 'Recorded'], ['passed', 'Passed for payment'], ['paid', 'Paid']);
const BINDING_STATUSES = choices(['draft', 'Being made up'], ['sent', 'At the binder'], ['received', 'Back from the binder'], ['cancelled', 'Cancelled']);
const USAGE_SOURCES = choices(['provider', 'Provider report (COUNTER)'], ['manual', 'Counted by the library']);
const APPROVERS = ['tenant_admin', 'principal'] as const;

async function categoryOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx.select({ id: libraryMemberCategories.id, name: libraryMemberCategories.name }).from(libraryMemberCategories).orderBy(asc(libraryMemberCategories.sortOrder), asc(libraryMemberCategories.name));
  return rows.map((r) => ({ value: r.id, label: r.name }));
}
async function eresourceOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx.select({ id: libraryEresources.id, title: libraryEresources.title }).from(libraryEresources).orderBy(asc(libraryEresources.title));
  return rows.map((r) => ({ value: r.id, label: r.title }));
}

/** Splits an amount over lines in proportion to their weights, in whole paise (the remainder goes to the last line). */
export function allocate(totalPaise: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!weights.length) return [];
  if (sum <= 0) return weights.map((_, i) => (i === weights.length - 1 ? totalPaise : 0));
  const out = weights.map((w) => Math.floor((totalPaise * w) / sum));
  out[out.length - 1] += totalPaise - out.reduce((a, b) => a + b, 0);
  return out;
}

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15');

@Injectable()
export class LibraryPassRecords implements OnModuleInit {
  constructor(
    private readonly registry: RecordRegistry,
    private readonly clock: Clock,
  ) {}

  onModuleInit(): void {
    for (const e of [this.rules(), this.vendors(), this.orders(), this.invoices(), this.binding(), this.usage()]) this.registry.register(e);
  }

  private today(ctx: KitCtx) {
    return tenantToday(ctx.tx, this.clock.now());
  }

  // ---- the circulation rules matrix ---------------------------------------------------------------------------------

  rules(): RecordEntity {
    return {
      key: 'library-circ-rules',
      module: 'library',
      table: libraryCircRules,
      subjectType: 'library_circ_rule',
      roles: { read: LIBRARY_ROLES, write: ['tenant_admin', 'principal', 'librarian'] },
      label: (r) => `${(r.categoryName as string | null) ?? 'Every category'} · ${(MATERIALS.find((m) => m.value === r.material)?.label as string | undefined) ?? 'every material'}`,
      list: {
        select: {
          id: libraryCircRules.id,
          categoryId: libraryCircRules.categoryId,
          categoryName: libraryMemberCategories.name,
          material: libraryCircRules.material,
          loanDays: libraryCircRules.loanDays,
          maxItems: libraryCircRules.maxItems,
          fineRupees: rupeesOf(libraryCircRules.finePaisePerDay),
          graceDays: libraryCircRules.graceDays,
          maxFineRupees: rupeesOf(libraryCircRules.maxFinePaise),
          maxRenewals: libraryCircRules.maxRenewals,
          canReserve: libraryCircRules.canReserve,
          note: libraryCircRules.note,
          sortOrder: libraryCircRules.sortOrder,
        },
        joins: (q) => q.leftJoin(libraryMemberCategories, eq(libraryMemberCategories.id, libraryCircRules.categoryId)),
        search: [libraryMemberCategories.name, libraryCircRules.material, libraryCircRules.note],
        filters: {
          category: { label: 'Category', options: categoryOptions, where: (v) => uuidEq(libraryCircRules.categoryId, v) },
          material: choiceFilter('Material', libraryCircRules.material, MATERIALS),
        },
        sorts: { category: libraryMemberCategories.name, material: libraryCircRules.material, loanDays: libraryCircRules.loanDays, order: libraryCircRules.sortOrder },
        defaultSort: { id: 'category', dir: 'asc' },
        tiebreak: [libraryCircRules.material],
      },
      fields: {
        categoryId: { label: 'Member category', type: 'select', schema: OptionalRef, options: categoryOptions, column: libraryCircRules.categoryId, help: 'Empty for every category' },
        material: { label: 'Material', type: 'select', schema: z.union([z.literal(''), z.null(), oneOf(MATERIALS)]).transform((v) => v || null), options: MATERIALS, column: libraryCircRules.material, help: 'Empty for every material' },
        loanDays: { label: 'Loan days', type: 'number', schema: Int(0, 365), column: libraryCircRules.loanDays, required: true, help: '0 for reading in the library only' },
        maxItems: { label: 'Items at a time', type: 'number', schema: OptionalInt(0, 50), column: libraryCircRules.maxItems, help: 'Of this material; empty for only the category’s overall limit' },
        fine: { label: 'Fine per day (₹)', type: 'number', schema: Rupees, column: libraryCircRules.finePaisePerDay, rowKey: 'fineRupees', required: true },
        graceDays: { label: 'Grace days', type: 'number', schema: Int(0, 30), column: libraryCircRules.graceDays, help: 'Open days after the due date before a fine starts' },
        maxFine: { label: 'Most fine on one loan (₹)', type: 'number', schema: Rupees, column: libraryCircRules.maxFinePaise, rowKey: 'maxFineRupees', help: '0 for no cap' },
        maxRenewals: { label: 'Renewals', type: 'number', schema: Int(0, 20), column: libraryCircRules.maxRenewals, required: true },
        canReserve: { label: 'Can reserve', type: 'boolean', schema: Bool, column: libraryCircRules.canReserve },
        note: { label: 'Note', type: 'text', schema: z.string().trim().max(300), column: libraryCircRules.note },
      },
      validate: async (ctx, id) => {
        const [r] = await ctx.tx.select().from(libraryCircRules).where(eq(libraryCircRules.id, id));
        return !r.categoryId && !r.material ? 'Choose a member category, a material or both (the library settings hold the rule for everyone)' : null;
      },
      check: async (ctx, id) => {
        const [r] = await ctx.tx.select().from(libraryCircRules).where(eq(libraryCircRules.id, id));
        const [dup] = await ctx.tx.select({ id: libraryCircRules.id }).from(libraryCircRules).where(and(sql`${libraryCircRules.id} <> ${id}`, r.categoryId ? eq(libraryCircRules.categoryId, r.categoryId) : sql`${libraryCircRules.categoryId} is null`, r.material ? eq(libraryCircRules.material, r.material) : sql`${libraryCircRules.material} is null`));
        if (dup) throw new BadRequestException('There is already a rule for this category and material');
      },
      duplicate: async (_ctx, row) => ({ material: null, note: `${String(row.note ?? '')} (copy)`.trim() }),
      columns: [
        { key: 'categoryName', header: 'Category', value: (r) => (r.categoryName as string | null) ?? 'Every category' },
        { key: 'material', header: 'Material', value: (r) => MATERIALS.find((m) => m.value === r.material)?.label ?? 'Every material' },
        { key: 'loanDays', header: 'Loan days' },
        { key: 'maxItems', header: 'Items at a time' },
        { key: 'fineRupees', header: 'Fine per day (₹)' },
        { key: 'graceDays', header: 'Grace days' },
        { key: 'maxFineRupees', header: 'Fine cap (₹)' },
        { key: 'maxRenewals', header: 'Renewals' },
        { key: 'canReserve', header: 'Can reserve' },
        { key: 'note', header: 'Note' },
      ],
    };
  }

  // ---- vendors ------------------------------------------------------------------------------------------------------

  vendors(): RecordEntity {
    const orders = sql<number>`(select count(*)::int from library_purchase_orders o where o.vendor_id = ${qual(libraryVendors.id)})`;
    const invoiced = sql<number>`(select coalesce(sum(i.net_paise), 0)::bigint from library_invoices i where i.vendor_id = ${qual(libraryVendors.id)})`;
    return {
      key: 'library-vendors',
      module: 'library',
      table: libraryVendors,
      subjectType: 'library_vendor',
      roles: { read: LIBRARY_ROLES, write: LIBRARY_ROLES },
      label: (r) => String(r.name),
      list: {
        select: { id: libraryVendors.id, name: libraryVendors.name, kind: libraryVendors.kind, gstin: libraryVendors.gstin, contactPerson: libraryVendors.contactPerson, phone: libraryVendors.phone, email: libraryVendors.email, address: libraryVendors.address, discountPct: sql<number>`${libraryVendors.discountPct}::float8`, paymentTerms: libraryVendors.paymentTerms, active: libraryVendors.active, orders, invoicedRupees: rupeesOf(invoiced) },
        search: [libraryVendors.name, libraryVendors.gstin, libraryVendors.contactPerson, libraryVendors.phone, libraryVendors.email],
        filters: { kind: choiceFilter('Kind', libraryVendors.kind, VENDOR_KINDS), active: { label: 'Active', options: choices(['yes', 'Active'], ['no', 'Not used now']), where: (v) => (v === 'yes' ? eq(libraryVendors.active, true) : v === 'no' ? eq(libraryVendors.active, false) : undefined) } },
        sorts: { name: libraryVendors.name, kind: libraryVendors.kind, orders, invoiced },
        defaultSort: { id: 'name', dir: 'asc' },
      },
      fields: {
        name: { label: 'Name', type: 'text', schema: Text(160), column: libraryVendors.name, required: true },
        kind: { label: 'Supplies', type: 'select', schema: oneOf(VENDOR_KINDS), options: VENDOR_KINDS, column: libraryVendors.kind, required: true, bulk: true },
        gstin: { label: 'GSTIN', type: 'text', schema: z.string().trim().toUpperCase().regex(/^(\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z])?$/, 'A GSTIN has 15 characters, like 29ABCDE1234F1Z5'), column: libraryVendors.gstin },
        contactPerson: { label: 'Contact person', type: 'text', schema: z.string().trim().max(120), column: libraryVendors.contactPerson },
        phone: { label: 'Phone', type: 'text', schema: z.string().trim().regex(/^[+0-9 ()-]{0,20}$/, 'Digits, spaces and + only'), column: libraryVendors.phone },
        email: { label: 'Email', type: 'text', schema: z.union([z.literal(''), z.email('Give a valid email')]), column: libraryVendors.email },
        address: { label: 'Address', type: 'textarea', schema: z.string().trim().max(400), column: libraryVendors.address },
        discountPct: { label: 'Usual discount (%)', type: 'number', schema: OptionalDecimal(0, 60).transform((v) => String(v ?? 0)), column: libraryVendors.discountPct },
        paymentTerms: { label: 'Payment terms', type: 'text', schema: z.string().trim().max(120), column: libraryVendors.paymentTerms },
        active: { label: 'Active', type: 'boolean', schema: Bool, column: libraryVendors.active, create: false, bulk: true },
      },
      check: async (ctx, id) => {
        const [v] = await ctx.tx.select({ name: libraryVendors.name }).from(libraryVendors).where(eq(libraryVendors.id, id));
        const [dup] = await ctx.tx.select({ id: libraryVendors.id }).from(libraryVendors).where(and(sql`lower(${libraryVendors.name}) = ${v.name.toLowerCase()}`, sql`${libraryVendors.id} <> ${id}`));
        if (dup) throw new BadRequestException('There is already a vendor with this name');
      },
      columns: [
        { key: 'name', header: 'Vendor' },
        { key: 'kind', header: 'Supplies', value: wordsOf(VENDOR_KINDS, 'kind') },
        { key: 'gstin', header: 'GSTIN' },
        { key: 'contactPerson', header: 'Contact' },
        { key: 'phone', header: 'Phone' },
        { key: 'email', header: 'Email' },
        { key: 'discountPct', header: 'Discount (%)' },
        { key: 'orders', header: 'Orders' },
        { key: 'invoicedRupees', header: 'Invoiced (₹)' },
      ],
    };
  }

  // ---- purchase orders ------------------------------------------------------------------------------------------------

  orders(): RecordEntity {
    const lines = sql<number>`(select count(*)::int from library_acquisitions a where a.po_id = ${qual(libraryPurchaseOrders.id)})`;
    const copies = sql<number>`(select coalesce(sum(a.quantity), 0)::int from library_acquisitions a where a.po_id = ${qual(libraryPurchaseOrders.id)})`;
    const received = sql<number>`(select coalesce(sum(a.received_qty), 0)::int from library_acquisitions a where a.po_id = ${qual(libraryPurchaseOrders.id)})`;
    const gross = sql<number>`(select coalesce(sum(a.est_price_paise * a.quantity), 0)::bigint from library_acquisitions a where a.po_id = ${qual(libraryPurchaseOrders.id)})`;
    const net = sql<number>`(${gross} - round(${gross} * ${libraryPurchaseOrders.discountPct} / 100))`;
    const move = (to: string, from: string[]) => async (ctx: KitCtx, id: string) => {
      const [po] = await ctx.tx.select().from(libraryPurchaseOrders).where(eq(libraryPurchaseOrders.id, id)).for('update');
      if (!from.includes(po.status)) throw new ConflictException(`This order is ${po.status.replace('_', ' ')}`);
      await ctx.tx.update(libraryPurchaseOrders).set({ status: to }).where(eq(libraryPurchaseOrders.id, id));
      if (to === 'cancelled') await ctx.tx.update(libraryAcquisitions).set({ status: 'approved', poId: null, orderNo: '', orderedOn: null }).where(and(eq(libraryAcquisitions.poId, id), eq(libraryAcquisitions.receivedQty, 0)));
      await auditUser(ctx.tx, ctx.p, `library_po.${to}`, 'library_po', id, { changes: { status: { before: po.status, after: to } } });
    };
    return {
      key: 'library-purchase-orders',
      module: 'library',
      table: libraryPurchaseOrders,
      subjectType: 'library_po',
      roles: { read: LIBRARY_ROLES, write: LIBRARY_ROLES },
      label: (r) => `${r.number} ${r.vendorName ?? ''}`.trim(),
      list: {
        select: {
          id: libraryPurchaseOrders.id,
          number: libraryPurchaseOrders.number,
          vendorId: libraryPurchaseOrders.vendorId,
          vendorName: libraryVendors.name,
          orderedOn: libraryPurchaseOrders.orderedOn,
          expectedBy: libraryPurchaseOrders.expectedBy,
          discountPct: sql<number>`${libraryPurchaseOrders.discountPct}::float8`,
          status: libraryPurchaseOrders.status,
          note: libraryPurchaseOrders.note,
          lines,
          copies,
          received,
          grossRupees: rupeesOf(gross),
          netRupees: rupeesOf(net),
          createdAt: libraryPurchaseOrders.createdAt,
        },
        joins: (q) => q.innerJoin(libraryVendors, eq(libraryVendors.id, libraryPurchaseOrders.vendorId)),
        search: [libraryPurchaseOrders.number, libraryVendors.name, libraryPurchaseOrders.note],
        filters: { status: choiceFilter('Status', libraryPurchaseOrders.status, PO_STATUSES), vendor: { label: 'Vendor', options: vendorOptions, where: (v) => uuidEq(libraryPurchaseOrders.vendorId, v) } },
        sorts: { number: sql`length(${libraryPurchaseOrders.number}), ${libraryPurchaseOrders.number}`, ordered: libraryPurchaseOrders.orderedOn, vendor: libraryVendors.name, net, made: libraryPurchaseOrders.createdAt },
        defaultSort: { id: 'made', dir: 'desc' },
      },
      fields: {
        vendorId: { label: 'Vendor', type: 'select', schema: z.uuid('Choose the vendor'), options: vendorOptions, column: libraryPurchaseOrders.vendorId, required: true },
        expectedBy: { label: 'Expected by', type: 'date', schema: DateText, column: libraryPurchaseOrders.expectedBy },
        discountPct: { label: 'Discount (%)', type: 'number', schema: OptionalDecimal(0, 60).transform((v) => (v === null || v === undefined ? undefined : String(v))), column: libraryPurchaseOrders.discountPct, help: 'The vendor’s usual discount if empty' },
        note: { label: 'Note to the vendor', type: 'textarea', schema: z.string().trim().max(500), column: libraryPurchaseOrders.note },
      },
      create: async (ctx, v) => {
        const [vendor] = await ctx.tx.select().from(libraryVendors).where(eq(libraryVendors.id, String(v.vendorId)));
        if (!vendor) throw new BadRequestException('Vendor not found');
        const [po] = await ctx.tx
          .insert(libraryPurchaseOrders)
          .values({ tenantId: ctx.p.tenantId, number: await nextNumber(ctx.tx, ctx.p.tenantId, 'LPO'), vendorId: vendor.id, expectedBy: (v.expectedBy as string | null) ?? null, discountPct: (v.discountPct as string | undefined) ?? vendor.discountPct, note: String(v.note ?? ''), createdBy: ctx.p.userId })
          .returning({ id: libraryPurchaseOrders.id });
        return po.id;
      },
      remove: { guard: async (ctx, id) => ((await ctx.tx.select({ s: libraryPurchaseOrders.status }).from(libraryPurchaseOrders).where(eq(libraryPurchaseOrders.id, id)))[0]?.s === 'draft' ? null : 'Only a draft order can be deleted; cancel a sent one') },
      columns: [
        { key: 'number', header: 'Order no.' },
        { key: 'vendorName', header: 'Vendor' },
        { key: 'orderedOn', header: 'Ordered on' },
        { key: 'expectedBy', header: 'Expected by' },
        { key: 'status', header: 'Status', value: wordsOf(PO_STATUSES, 'status') },
        { key: 'lines', header: 'Titles' },
        { key: 'copies', header: 'Copies' },
        { key: 'received', header: 'Received' },
        { key: 'grossRupees', header: 'Gross (₹)' },
        { key: 'discountPct', header: 'Discount (%)' },
        { key: 'netRupees', header: 'Net (₹)' },
      ],
      actions: {
        send: {
          label: 'Send to the vendor',
          params: z.object({ orderedOn: ymd.optional() }).default({}),
          apply: async (ctx, id, raw) => {
            const [po] = await ctx.tx.select().from(libraryPurchaseOrders).where(eq(libraryPurchaseOrders.id, id)).for('update');
            if (po.status !== 'draft') throw new ConflictException('This order has already been sent');
            const ls = await ctx.tx.select().from(libraryAcquisitions).where(eq(libraryAcquisitions.poId, id));
            if (!ls.length) throw new ConflictException('Put approved requests on the order first');
            const on = (raw as { orderedOn?: string }).orderedOn ?? (await this.today(ctx));
            const [vendor] = await ctx.tx.select({ name: libraryVendors.name }).from(libraryVendors).where(eq(libraryVendors.id, po.vendorId));
            await ctx.tx.update(libraryAcquisitions).set({ status: 'ordered', orderNo: po.number, orderedOn: on, vendor: vendor.name, vendorId: po.vendorId }).where(and(eq(libraryAcquisitions.poId, id), eq(libraryAcquisitions.status, 'approved')));
            await ctx.tx.update(libraryPurchaseOrders).set({ status: 'sent', orderedOn: on, sentAt: this.clock.now() }).where(eq(libraryPurchaseOrders.id, id));
            await auditUser(ctx.tx, ctx.p, 'library_po.sent', 'library_po', id, { lines: ls.length, changes: { status: { before: 'draft', after: 'sent' } } });
            return `${ls.length} titles`;
          },
        },
        refresh: {
          label: 'Update from receipts',
          apply: async (ctx, id) => {
            const [po] = await ctx.tx.select().from(libraryPurchaseOrders).where(eq(libraryPurchaseOrders.id, id)).for('update');
            if (!['sent', 'partly_received', 'received'].includes(po.status)) throw new ConflictException(`This order is ${po.status}`);
            const [r] = await ctx.tx.select({ want: sql<number>`coalesce(sum(${libraryAcquisitions.quantity}), 0)::int`, got: sql<number>`coalesce(sum(${libraryAcquisitions.receivedQty}), 0)::int` }).from(libraryAcquisitions).where(and(eq(libraryAcquisitions.poId, id), sql`${libraryAcquisitions.status} <> 'cancelled'`));
            const to = r.got === 0 ? 'sent' : r.got >= r.want ? 'received' : 'partly_received';
            if (to !== po.status) {
              await ctx.tx.update(libraryPurchaseOrders).set({ status: to }).where(eq(libraryPurchaseOrders.id, id));
              await auditUser(ctx.tx, ctx.p, `library_po.${to}`, 'library_po', id, { changes: { status: { before: po.status, after: to } } });
            }
            return `${r.got} of ${r.want} copies received`;
          },
        },
        close: { label: 'Close', apply: move('closed', ['received', 'partly_received']) },
        cancel: { label: 'Cancel', tone: 'danger', apply: move('cancelled', ['draft', 'sent']) },
      },
    };
  }

  // ---- invoices -------------------------------------------------------------------------------------------------------

  invoices(): RecordEntity {
    return {
      key: 'library-invoices',
      module: 'library',
      table: libraryInvoices,
      subjectType: 'library_invoice',
      roles: { read: LIBRARY_ROLES, write: LIBRARY_ROLES },
      label: (r) => `${r.vendorName ?? ''} ${r.invoiceNo}`.trim(),
      list: {
        select: {
          id: libraryInvoices.id,
          vendorId: libraryInvoices.vendorId,
          vendorName: libraryVendors.name,
          poId: libraryInvoices.poId,
          poNumber: libraryPurchaseOrders.number,
          invoiceNo: libraryInvoices.invoiceNo,
          invoiceDate: libraryInvoices.invoiceDate,
          grossRupees: rupeesOf(libraryInvoices.grossPaise),
          discountRupees: rupeesOf(libraryInvoices.discountPaise),
          gstRupees: rupeesOf(libraryInvoices.gstPaise),
          netRupees: rupeesOf(libraryInvoices.netPaise),
          status: libraryInvoices.status,
          paidOn: libraryInvoices.paidOn,
          paymentRef: libraryInvoices.paymentRef,
          note: libraryInvoices.note,
        },
        joins: (q) => q.innerJoin(libraryVendors, eq(libraryVendors.id, libraryInvoices.vendorId)).leftJoin(libraryPurchaseOrders, eq(libraryPurchaseOrders.id, libraryInvoices.poId)),
        search: [libraryInvoices.invoiceNo, libraryVendors.name, libraryPurchaseOrders.number],
        filters: { status: choiceFilter('Status', libraryInvoices.status, INVOICE_STATUSES), vendor: { label: 'Vendor', options: vendorOptions, where: (v) => uuidEq(libraryInvoices.vendorId, v) } },
        sorts: { date: libraryInvoices.invoiceDate, vendor: libraryVendors.name, net: libraryInvoices.netPaise },
        defaultSort: { id: 'date', dir: 'desc' },
      },
      fields: {
        poId: { label: 'Purchase order', type: 'select', schema: OptionalRef, options: poOptions, column: libraryInvoices.poId, edit: false, help: 'The received lines of the order are marked invoiced and share the amount' },
        vendorId: { label: 'Vendor', type: 'select', schema: OptionalRef, options: vendorOptions, column: libraryInvoices.vendorId, edit: false, help: 'The order’s vendor if empty' },
        invoiceNo: { label: 'Invoice no.', type: 'text', schema: Text(60), column: libraryInvoices.invoiceNo, required: true },
        invoiceDate: { label: 'Invoice date', type: 'date', schema: ymd, column: libraryInvoices.invoiceDate, required: true },
        gross: { label: 'Gross (₹)', type: 'number', schema: Rupees, column: libraryInvoices.grossPaise, rowKey: 'grossRupees', required: true },
        discount: { label: 'Discount (₹)', type: 'number', schema: Rupees, column: libraryInvoices.discountPaise, rowKey: 'discountRupees' },
        gst: { label: 'GST (₹)', type: 'number', schema: Rupees, column: libraryInvoices.gstPaise, rowKey: 'gstRupees', help: 'Printed books are exempt; GST applies to e-resources and binding' },
        note: { label: 'Note', type: 'text', schema: z.string().trim().max(300), column: libraryInvoices.note },
      },
      create: async (ctx, v) => {
        const poId = (v.poId as string | null) ?? null;
        const po = poId ? (await ctx.tx.select().from(libraryPurchaseOrders).where(eq(libraryPurchaseOrders.id, poId)).for('update'))[0] : undefined;
        if (poId && !po) throw new BadRequestException('Purchase order not found');
        const vendorId = (v.vendorId as string | null) ?? po?.vendorId;
        if (!vendorId) throw new BadRequestException('Choose the vendor or the purchase order');
        if (po && po.vendorId !== vendorId) throw new BadRequestException('This order is to another vendor');
        const gross = Number(v.gross ?? 0);
        const discount = Number(v.discount ?? 0);
        const gst = Number(v.gst ?? 0);
        if (discount > gross) throw new BadRequestException('The discount is more than the gross amount');
        const netPaise = gross - discount + gst;
        const [dup] = await ctx.tx.select({ id: libraryInvoices.id }).from(libraryInvoices).where(and(eq(libraryInvoices.vendorId, vendorId), eq(libraryInvoices.invoiceNo, String(v.invoiceNo))));
        if (dup) throw new ConflictException('This vendor’s invoice is already recorded');
        const [inv] = await ctx.tx.insert(libraryInvoices).values({ tenantId: ctx.p.tenantId, vendorId, poId, invoiceNo: String(v.invoiceNo), invoiceDate: String(v.invoiceDate), grossPaise: gross, discountPaise: discount, gstPaise: gst, netPaise, note: String(v.note ?? ''), createdBy: ctx.p.userId }).returning();
        if (po) {
          // The received lines share the net amount by their value; they are now invoiced against the budget.
          const lines = await ctx.tx.select().from(libraryAcquisitions).where(and(eq(libraryAcquisitions.poId, po.id), inArray(libraryAcquisitions.status, ['received', 'ordered']), sql`${libraryAcquisitions.receivedQty} > 0`)).orderBy(asc(libraryAcquisitions.number));
          if (!lines.length) throw new ConflictException('Nothing on this order has been received yet');
          const shares = allocate(netPaise, lines.map((l) => l.estPricePaise * l.receivedQty));
          for (const [i, l] of lines.entries()) await ctx.tx.update(libraryAcquisitions).set({ status: 'invoiced', invoiceId: inv.id, invoiceNo: inv.invoiceNo, invoiceDate: inv.invoiceDate, invoiceAmountPaise: shares[i] }).where(eq(libraryAcquisitions.id, l.id));
          await auditUser(ctx.tx, ctx.p, 'library_po.invoiced', 'library_po', po.id, { invoiceId: inv.id, lines: lines.length, netPaise });
        }
        return inv.id;
      },
      remove: { guard: async (ctx, id) => ((await ctx.tx.select({ s: libraryInvoices.status }).from(libraryInvoices).where(eq(libraryInvoices.id, id)))[0]?.s === 'paid' ? 'A paid invoice cannot be deleted' : null) },
      columns: [
        { key: 'vendorName', header: 'Vendor' },
        { key: 'invoiceNo', header: 'Invoice no.' },
        { key: 'invoiceDate', header: 'Date' },
        { key: 'poNumber', header: 'Order' },
        { key: 'grossRupees', header: 'Gross (₹)' },
        { key: 'discountRupees', header: 'Discount (₹)' },
        { key: 'gstRupees', header: 'GST (₹)' },
        { key: 'netRupees', header: 'Net (₹)' },
        { key: 'status', header: 'Status', value: wordsOf(INVOICE_STATUSES, 'status') },
        { key: 'paidOn', header: 'Paid on' },
        { key: 'paymentRef', header: 'Payment ref.' },
      ],
      actions: {
        pass: {
          label: 'Pass for payment',
          roles: [...APPROVERS],
          apply: async (ctx, id) => {
            const [i] = await ctx.tx.select().from(libraryInvoices).where(eq(libraryInvoices.id, id)).for('update');
            if (i.status !== 'recorded') throw new ConflictException(`This invoice is ${i.status}`);
            if (i.createdBy === ctx.p.userId) throw new ConflictException('Someone other than the person who recorded the invoice passes it');
            await ctx.tx.update(libraryInvoices).set({ status: 'passed' }).where(eq(libraryInvoices.id, id));
            await auditUser(ctx.tx, ctx.p, 'library_invoice.passed', 'library_invoice', id, { changes: { status: { before: 'recorded', after: 'passed' } } });
          },
        },
        paid: {
          label: 'Paid',
          roles: [...APPROVERS, 'accountant'],
          params: z.object({ paidOn: ymd.optional(), paymentRef: z.string().trim().min(2, 'Give the cheque, UTR or voucher number').max(60) }),
          apply: async (ctx, id, raw) => {
            const p = raw as { paidOn?: string; paymentRef: string };
            const [i] = await ctx.tx.select().from(libraryInvoices).where(eq(libraryInvoices.id, id)).for('update');
            if (i.status === 'paid') return;
            if (i.status !== 'passed') throw new ConflictException('Pass the invoice for payment first');
            await ctx.tx.update(libraryInvoices).set({ status: 'paid', paidOn: p.paidOn ?? (await this.today(ctx)), paymentRef: p.paymentRef }).where(eq(libraryInvoices.id, id));
            await auditUser(ctx.tx, ctx.p, 'library_invoice.paid', 'library_invoice', id, { paymentRef: p.paymentRef, changes: { status: { before: 'passed', after: 'paid' } } });
          },
        },
      },
    };
  }

  // ---- binding --------------------------------------------------------------------------------------------------------

  binding(): RecordEntity {
    const items = sql<number>`(select count(*)::int from library_binding_items i where i.batch_id = ${qual(libraryBindingBatches.id)})`;
    const restore = async (ctx: KitCtx, id: string) => {
      const rows = await ctx.tx.select().from(libraryBindingItems).where(eq(libraryBindingItems.batchId, id));
      for (const r of rows) if (r.copyId) await ctx.tx.update(libraryCopies).set({ status: r.priorStatus === 'damaged' ? 'available' : r.priorStatus }).where(and(eq(libraryCopies.id, r.copyId), eq(libraryCopies.status, 'binding')));
      const books = rows.length ? await ctx.tx.selectDistinct({ id: libraryCopies.bookId }).from(libraryCopies).where(inArray(libraryCopies.id, rows.map((r) => r.copyId).filter((x): x is string => !!x))) : [];
      for (const b of books) await syncCopies(ctx.tx, b.id);
      return rows.length;
    };
    return {
      key: 'library-binding',
      module: 'library',
      table: libraryBindingBatches,
      subjectType: 'library_binding',
      roles: { read: LIBRARY_ROLES, write: LIBRARY_ROLES },
      label: (r) => String(r.number),
      list: {
        select: {
          id: libraryBindingBatches.id,
          number: libraryBindingBatches.number,
          vendorId: libraryBindingBatches.vendorId,
          vendorName: libraryVendors.name,
          sentOn: libraryBindingBatches.sentOn,
          expectedOn: libraryBindingBatches.expectedOn,
          receivedOn: libraryBindingBatches.receivedOn,
          status: libraryBindingBatches.status,
          costRupees: rupeesOf(libraryBindingBatches.costPaise),
          budgetId: libraryBindingBatches.budgetId,
          note: libraryBindingBatches.note,
          items,
          late: sql<boolean>`${libraryBindingBatches.status} = 'sent' and ${libraryBindingBatches.expectedOn} < (now() at time zone 'Asia/Kolkata')::date`,
          createdAt: libraryBindingBatches.createdAt,
        },
        joins: (q) => q.leftJoin(libraryVendors, eq(libraryVendors.id, libraryBindingBatches.vendorId)),
        search: [libraryBindingBatches.number, libraryVendors.name, libraryBindingBatches.note],
        filters: { status: choiceFilter('Status', libraryBindingBatches.status, BINDING_STATUSES), vendor: { label: 'Binder', options: vendorOptions, where: (v) => uuidEq(libraryBindingBatches.vendorId, v) } },
        sorts: { number: sql`length(${libraryBindingBatches.number}), ${libraryBindingBatches.number}`, sent: libraryBindingBatches.sentOn, expected: libraryBindingBatches.expectedOn, made: libraryBindingBatches.createdAt },
        defaultSort: { id: 'made', dir: 'desc' },
      },
      fields: {
        vendorId: { label: 'Binder', type: 'select', schema: OptionalRef, options: vendorOptions, column: libraryBindingBatches.vendorId },
        expectedOn: { label: 'Expected back', type: 'date', schema: DateText, column: libraryBindingBatches.expectedOn },
        cost: { label: 'Cost (₹)', type: 'number', schema: Rupees, column: libraryBindingBatches.costPaise, rowKey: 'costRupees' },
        budgetId: { label: 'Budget', type: 'select', schema: OptionalRef, options: budgetOptions, column: libraryBindingBatches.budgetId },
        note: { label: 'Note', type: 'textarea', schema: z.string().trim().max(500), column: libraryBindingBatches.note },
      },
      create: async (ctx, v) =>
        (
          await ctx.tx
            .insert(libraryBindingBatches)
            .values({ tenantId: ctx.p.tenantId, number: await nextNumber(ctx.tx, ctx.p.tenantId, 'LBB'), vendorId: (v.vendorId as string | null) ?? null, expectedOn: (v.expectedOn as string | null) ?? null, costPaise: Number(v.cost ?? 0), budgetId: (v.budgetId as string | null) ?? null, note: String(v.note ?? ''), createdBy: ctx.p.userId })
            .returning({ id: libraryBindingBatches.id })
        )[0].id,
      remove: { guard: async (ctx, id) => ((await ctx.tx.select({ s: libraryBindingBatches.status }).from(libraryBindingBatches).where(eq(libraryBindingBatches.id, id)))[0]?.s === 'sent' ? 'The batch is at the binder; receive or cancel it first' : null) },
      columns: [
        { key: 'number', header: 'Batch' },
        { key: 'vendorName', header: 'Binder' },
        { key: 'status', header: 'Status', value: wordsOf(BINDING_STATUSES, 'status') },
        { key: 'items', header: 'Items' },
        { key: 'sentOn', header: 'Sent on' },
        { key: 'expectedOn', header: 'Expected back' },
        { key: 'receivedOn', header: 'Received on' },
        { key: 'costRupees', header: 'Cost (₹)' },
      ],
      actions: {
        addCopies: {
          label: 'Add copies',
          params: z.object({ codes: z.string().trim().min(1, 'Scan or type accession numbers').max(5000), instructions: z.string().trim().max(200).default('') }),
          apply: async (ctx, id, raw) => {
            const { codes, instructions } = raw as { codes: string; instructions: string };
            const [b] = await ctx.tx.select().from(libraryBindingBatches).where(eq(libraryBindingBatches.id, id)).for('update');
            if (b.status !== 'draft') throw new ConflictException('Copies are added while the batch is being made up');
            let added = 0;
            const refused: string[] = [];
            for (const code of codes.split(/[\s,;]+/).filter(Boolean).slice(0, 300)) {
              const copy = await findCopy(ctx.tx, code).catch(() => null);
              if (!copy || !['available', 'damaged'].includes(copy.status)) {
                refused.push(code);
                continue;
              }
              const [book] = await ctx.tx.select({ title: libraryBooks.title }).from(libraryBooks).where(eq(libraryBooks.id, copy.bookId));
              const [row] = await ctx.tx.insert(libraryBindingItems).values({ tenantId: ctx.p.tenantId, batchId: id, copyId: copy.id, label: `${copy.accessionNo} ${book.title}`.slice(0, 200), priorStatus: copy.status, instructions }).onConflictDoNothing().returning({ id: libraryBindingItems.id });
              if (row) {
                await ctx.tx.update(libraryCopies).set({ status: 'binding' }).where(eq(libraryCopies.id, copy.id));
                await syncCopies(ctx.tx, copy.bookId);
                added++;
              }
            }
            await auditUser(ctx.tx, ctx.p, 'library_binding.copies_added', 'library_binding', id, { added, refused });
            return refused.length ? `${added} added; not on the shelf: ${refused.slice(0, 10).join(', ')}` : `${added} added`;
          },
        },
        send: {
          label: 'Send to the binder',
          params: z.object({ sentOn: ymd.optional() }).default({}),
          apply: async (ctx, id, raw) => {
            const [b] = await ctx.tx.select().from(libraryBindingBatches).where(eq(libraryBindingBatches.id, id)).for('update');
            if (b.status !== 'draft') throw new ConflictException('This batch has already gone');
            const [{ n }] = await ctx.tx.select({ n: sql<number>`count(*)::int` }).from(libraryBindingItems).where(eq(libraryBindingItems.batchId, id));
            if (!n) throw new ConflictException('Add copies to the batch first');
            await ctx.tx.update(libraryBindingBatches).set({ status: 'sent', sentOn: (raw as { sentOn?: string }).sentOn ?? (await this.today(ctx)) }).where(eq(libraryBindingBatches.id, id));
            await auditUser(ctx.tx, ctx.p, 'library_binding.sent', 'library_binding', id, { items: n, changes: { status: { before: 'draft', after: 'sent' } } });
          },
        },
        receive: {
          label: 'Received back',
          params: z.object({ receivedOn: ymd.optional(), cost: Rupees.optional() }).default({}),
          apply: async (ctx, id, raw) => {
            const p = raw as { receivedOn?: string; cost?: number };
            const [b] = await ctx.tx.select().from(libraryBindingBatches).where(eq(libraryBindingBatches.id, id)).for('update');
            if (b.status !== 'sent') throw new ConflictException('Only a batch at the binder can be received');
            const n = await restore(ctx, id);
            await ctx.tx.update(libraryBindingBatches).set({ status: 'received', receivedOn: p.receivedOn ?? (await this.today(ctx)), ...(p.cost !== undefined && { costPaise: p.cost }) }).where(eq(libraryBindingBatches.id, id));
            await auditUser(ctx.tx, ctx.p, 'library_binding.received', 'library_binding', id, { items: n, changes: { status: { before: 'sent', after: 'received' } } });
            return `${n} back on the shelf`;
          },
        },
        cancel: {
          label: 'Cancel',
          tone: 'danger',
          apply: async (ctx, id) => {
            const [b] = await ctx.tx.select().from(libraryBindingBatches).where(eq(libraryBindingBatches.id, id)).for('update');
            if (!['draft', 'sent'].includes(b.status)) throw new ConflictException(`This batch is ${b.status}`);
            await restore(ctx, id);
            await ctx.tx.update(libraryBindingBatches).set({ status: 'cancelled' }).where(eq(libraryBindingBatches.id, id));
            await auditUser(ctx.tx, ctx.p, 'library_binding.cancelled', 'library_binding', id, { changes: { status: { before: b.status, after: 'cancelled' } } });
          },
        },
      },
    };
  }

  // ---- e-resource usage -----------------------------------------------------------------------------------------------

  usage(): RecordEntity {
    return {
      key: 'library-eresource-usage',
      module: 'library',
      table: libraryEresourceUsage,
      subjectType: 'library_eresource_usage',
      roles: { read: LIBRARY_ROLES, write: LIBRARY_ROLES },
      label: (r) => `${r.title ?? ''} ${r.month}`.trim(),
      list: {
        select: { id: libraryEresourceUsage.id, resourceId: libraryEresourceUsage.resourceId, title: libraryEresources.title, provider: libraryEresources.provider, month: libraryEresourceUsage.month, sessions: libraryEresourceUsage.sessions, searches: libraryEresourceUsage.searches, downloads: libraryEresourceUsage.downloads, source: libraryEresourceUsage.source },
        joins: (q) => q.innerJoin(libraryEresources, eq(libraryEresources.id, libraryEresourceUsage.resourceId)),
        search: [libraryEresources.title, libraryEresourceUsage.month],
        filters: { resource: { label: 'E-resource', options: eresourceOptions, where: (v) => uuidEq(libraryEresourceUsage.resourceId, v) }, year: { label: 'Year', where: (v) => (/^\d{4}$/.test(v) ? sql`${libraryEresourceUsage.month} like ${`${v}-%`}` : undefined) } },
        sorts: { month: libraryEresourceUsage.month, title: libraryEresources.title, downloads: libraryEresourceUsage.downloads },
        defaultSort: { id: 'month', dir: 'desc' },
        tiebreak: [libraryEresources.title],
      },
      fields: {
        resourceId: { label: 'E-resource', type: 'select', schema: z.uuid('Choose the e-resource'), options: eresourceOptions, column: libraryEresourceUsage.resourceId, required: true, edit: false },
        month: { label: 'Month', type: 'text', schema: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month like 2026-09'), column: libraryEresourceUsage.month, required: true, edit: false },
        sessions: { label: 'Sessions', type: 'number', schema: Int(0, 10_000_000), column: libraryEresourceUsage.sessions },
        searches: { label: 'Searches', type: 'number', schema: Int(0, 10_000_000), column: libraryEresourceUsage.searches },
        downloads: { label: 'Downloads (full text)', type: 'number', schema: Int(0, 10_000_000), column: libraryEresourceUsage.downloads },
        source: { label: 'From', type: 'select', schema: oneOf(USAGE_SOURCES), options: USAGE_SOURCES, column: libraryEresourceUsage.source },
      },
      check: async (ctx, id) => {
        const [u] = await ctx.tx.select().from(libraryEresourceUsage).where(eq(libraryEresourceUsage.id, id));
        const [dup] = await ctx.tx.select({ id: libraryEresourceUsage.id }).from(libraryEresourceUsage).where(and(eq(libraryEresourceUsage.resourceId, u.resourceId), eq(libraryEresourceUsage.month, u.month), sql`${libraryEresourceUsage.id} <> ${id}`));
        if (dup) throw new BadRequestException('This month is already recorded for the e-resource; edit it instead');
      },
      columns: [
        { key: 'title', header: 'E-resource' },
        { key: 'month', header: 'Month' },
        { key: 'sessions', header: 'Sessions' },
        { key: 'searches', header: 'Searches' },
        { key: 'downloads', header: 'Downloads' },
        { key: 'source', header: 'From', value: wordsOf(USAGE_SOURCES, 'source') },
      ],
      import: {
        columns: [
          { key: 'resource', header: 'E-resource', required: true, help: 'Its title as in the e-resources list', example: 'N-LIST e-journals' },
          { key: 'month', header: 'Month', required: true, example: '2026-09' },
          { key: 'sessions', header: 'Sessions', example: '120' },
          { key: 'searches', header: 'Searches', example: '340' },
          { key: 'downloads', header: 'Downloads', example: '85' },
        ],
        key: ['resource', 'month'],
        exists: async (ctx, r) => {
          const [e] = await ctx.tx.select({ id: libraryEresources.id }).from(libraryEresources).where(sql`lower(${libraryEresources.title}) = ${r.get('resource').toLowerCase()}`).limit(1);
          if (!e) return false;
          return !!(await ctx.tx.select({ id: libraryEresourceUsage.id }).from(libraryEresourceUsage).where(and(eq(libraryEresourceUsage.resourceId, e.id), eq(libraryEresourceUsage.month, r.get('month')))))[0];
        },
        run: async (ctx, rows) =>
          eachRow(ctx.tx, rows, async (tx, r) => {
            const title = required(r, 'resource');
            const month = required(r, 'month');
            if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) fail('Use a month like 2026-09', month);
            const [e] = await tx.select({ id: libraryEresources.id }).from(libraryEresources).where(sql`lower(${libraryEresources.title}) = ${title.toLowerCase()}`).limit(1);
            if (!e) fail('No e-resource has this title', title);
            const values = { sessions: r.get('sessions') ? int(r.get('sessions'), 0, 10_000_000) : 0, searches: r.get('searches') ? int(r.get('searches'), 0, 10_000_000) : 0, downloads: r.get('downloads') ? int(r.get('downloads'), 0, 10_000_000) : 0 };
            const [have] = await tx.select({ id: libraryEresourceUsage.id }).from(libraryEresourceUsage).where(and(eq(libraryEresourceUsage.resourceId, e!.id), eq(libraryEresourceUsage.month, month)));
            if (have) {
              await tx.update(libraryEresourceUsage).set(values).where(eq(libraryEresourceUsage.id, have.id));
              return outcome(false, true, [title, month]);
            }
            await tx.insert(libraryEresourceUsage).values({ tenantId: ctx.p.tenantId, resourceId: e!.id, month, source: 'provider', ...values });
            return outcome(true, false, [title, month]);
          }),
      },
    };
  }
}

