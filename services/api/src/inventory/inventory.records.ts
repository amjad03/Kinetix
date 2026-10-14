import { BadRequestException, ConflictException, Injectable, OnModuleInit } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { departmentOptions } from '../admin/structure.records.js';
import { audit } from '../common/audit.js';
import { nextNumber } from '../common/ops.js';
import { amcContracts } from '../db/schema-depth.js';
import { assets, departments, invInvoices, invItems, invPurchaseOrders, invRequisitions, invStores, invVendors, rooms, users } from '../db/schema.js';
import { assetCondemnations, invCategories, invGateEntries, invRateContracts, invStockVerifications } from '../db/schema-procurement.js';
import { fail, int, lc, outcome, required } from '../import/row-helpers.js';
import { RecordRegistry, type FieldOption, type KitCtx, type RecordEntity } from '../records/entity.js';
import { copyName, DateText, Int, OptionalRef, OptionalText, Ref, Text, uuidEq } from '../records/helpers.js';
import { eachRow } from '../records/import.js';
import { Rupees, rupeesCell } from '../records/money.js';
import { AssetsService } from './assets.service.js';
import { APPROVER_ROLES, STAFF_ROLES, STORE_ROLES } from './inventory.controller.js';
import { ProcurementService } from './procurement.service.js';
import { ensureCategory } from './stock.js';

/**
 * Stores, buying and assets as record kit entities (docs/requirements/RECORD_DEPTH_KIT.md): items, stores, categories,
 * vendors, rate contracts, indents, purchase orders, invoices, the gate register, stock verifications, assets, AMC
 * contracts and condemnations. Lists with their own workflows (indents, orders) keep their own create screens and
 * use the kit for the list, history, export, saved views, the recycle bin and bulk decisions.
 */

const ACCOUNTS = [...STORE_ROLES, 'accountant' as const];
const opt = (pairs: [string, string][]): FieldOption[] => pairs.map(([value, label]) => ({ value, label }));
const inList = (list: FieldOption[]) => (v: string) => list.some((o) => o.value === v);

export const UNITS = opt([['nos', 'Numbers'], ['kg', 'Kilogram'], ['g', 'Gram'], ['litre', 'Litre'], ['ml', 'Millilitre'], ['metre', 'Metre'], ['box', 'Box'], ['pack', 'Pack'], ['ream', 'Ream'], ['set', 'Set'], ['pair', 'Pair'], ['dozen', 'Dozen'], ['roll', 'Roll'], ['bottle', 'Bottle']]);
const STORE_KINDS = opt([['central', 'Central store'], ['department', 'Department store'], ['lab', 'Lab store']]);
const ACTIVE = opt([['yes', 'Active'], ['no', 'Inactive']]);
const REQ_STATUS = opt([['submitted', 'Waiting for approval'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['ordered', 'Ordered']]);
const BUDGET = opt([['within', 'Within budget'], ['exceeded', 'Over budget'], ['override', 'Approved over budget'], ['no_budget', 'No budget set']]);
const PO_STATUS = opt([['pending_approval', 'Waiting for approval'], ['issued', 'Issued'], ['partially_received', 'Partly received'], ['received', 'Received'], ['cancelled', 'Cancelled']]);
const MODES = opt([['direct', 'Direct purchase'], ['quotation', 'Quotations'], ['rate_contract', 'Rate contract'], ['gem', 'GeM'], ['tender', 'Tender']]);
const INVOICE_STATUS = opt([['matched', 'Matched'], ['mismatch', 'Mismatch'], ['approved', 'Approved'], ['paid', 'Paid']]);
const GATE_DIRECTION = opt([['in', 'Inward'], ['out', 'Outward']]);
const GATE_KIND = opt([['goods', 'Goods'], ['returnable', 'Returnable'], ['non_returnable', 'Non-returnable']]);
const GATE_STATUS = opt([['open', 'Open'], ['returned', 'Returned'], ['closed', 'Closed']]);
const VERIFY_STATUS = opt([['open', 'Open'], ['closed', 'Closed']]);
const ASSET_STATUS = opt([['active', 'In use'], ['in_maintenance', 'Under repair'], ['disposed', 'Disposed of']]);
const METHODS = opt([['slm', 'Straight line'], ['wdv', 'Written-down value']]);
const CONDEMN_STATUS = opt([['proposed', 'Proposed'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['written_off', 'Written off']]);

async function storeOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ id: invStores.id, name: invStores.name }).from(invStores).orderBy(asc(invStores.name))).map((r) => ({ value: r.id, label: r.name }));
}
async function categoryOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ name: invCategories.name }).from(invCategories).orderBy(asc(invCategories.name))).map((r) => ({ value: r.name, label: r.name }));
}
async function vendorOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ id: invVendors.id, name: invVendors.name }).from(invVendors).where(and(eq(invVendors.active, true), eq(invVendors.blacklisted, false))).orderBy(asc(invVendors.name))).map((r) => ({ value: r.id, label: r.name }));
}
async function itemOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ id: invItems.id, sku: invItems.sku, name: invItems.name, category: invItems.category }).from(invItems).where(eq(invItems.active, true)).orderBy(asc(invItems.category), asc(invItems.name))).map((r) => ({ value: r.id, label: `${r.sku} · ${r.name}`, group: r.category }));
}
async function staffOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.selectDistinct({ id: users.id, name: users.fullName }).from(users).where(and(eq(users.status, 'active'), sql`exists (select 1 from user_roles r where r.user_id = "users"."id" and r.role not in ('student', 'guardian', 'alumni'))`)).orderBy(asc(users.fullName))).map((r) => ({ value: r.id, label: r.name }));
}
export async function roomOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ id: rooms.id, name: rooms.name, kind: rooms.kind }).from(rooms).where(eq(rooms.active, true)).orderBy(asc(rooms.name))).map((r) => ({ value: r.id, label: r.name }));
}
async function assetOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ id: assets.id, tag: assets.tag, name: assets.name, category: assets.category }).from(assets).where(sql`${assets.status} <> 'disposed'`).orderBy(asc(assets.tag))).map((r) => ({ value: r.id, label: `${r.tag} · ${r.name}`, group: r.category }));
}

const lookup = async (ctx: KitCtx, options: (c: KitCtx) => Promise<FieldOption[]>, text: string, what: string) => {
  if (!text) return null;
  const hit = (await options(ctx)).find((o) => lc(o.label) === lc(text) || lc(o.label.split(' · ')[0]) === lc(text));
  return hit ? hit.value : fail(`No ${what} with this name`, text);
};

@Injectable()
export class InventoryRecords implements OnModuleInit {
  constructor(
    private readonly registry: RecordRegistry,
    private readonly proc: ProcurementService,
    private readonly assetsSvc: AssetsService,
  ) {}

  onModuleInit(): void {
    for (const e of [this.items(), this.stores(), this.categories(), this.vendors(), this.rateContracts(), this.requisitions(), this.orders(), this.invoices(), this.gate(), this.verifications(), this.assets(), this.amc(), this.condemnations()]) this.registry.register(e);
  }

  // ---- items --------------------------------------------------------------------------------------

  private items(): RecordEntity {
    const onHand = sql<number>`coalesce((select sum(s.qty)::int from inv_stock s where s.item_id = "inv_items"."id"), 0)`;
    return {
      key: 'inv-items',
      module: 'inventory',
      table: invItems,
      subjectType: 'inv_item',
      roles: { read: STORE_ROLES, write: STORE_ROLES },
      label: (r) => `${r.sku} ${r.name}`,
      list: {
        select: { id: invItems.id, sku: invItems.sku, name: invItems.name, category: invItems.category, unit: invItems.unit, reorderLevel: invItems.reorderLevel, reorderQty: invItems.reorderQty, description: invItems.description, active: invItems.active, lastPrice: sql<number>`(${invItems.lastPricePaise} / 100.0)::float8`, onHand, low: sql<boolean>`${invItems.active} and ${invItems.reorderLevel} > 0 and ${onHand} <= ${invItems.reorderLevel}` },
        search: [invItems.sku, invItems.name, invItems.category],
        filters: {
          category: { label: 'Category', options: categoryOptions, where: (v) => sql`lower(${invItems.category}) = ${lc(v)}` },
          stock: { label: 'Stock', options: opt([['low', 'At or below reorder level'], ['out', 'Out of stock']]), where: (v) => (v === 'low' ? sql`${invItems.reorderLevel} > 0 and ${onHand} <= ${invItems.reorderLevel}` : v === 'out' ? sql`${onHand} = 0` : undefined) },
          active: { label: 'Status', options: ACTIVE, where: (v) => (v === 'yes' ? eq(invItems.active, true) : v === 'no' ? eq(invItems.active, false) : undefined) },
        },
        sorts: { sku: invItems.sku, name: invItems.name, category: invItems.category, onHand, reorder: invItems.reorderLevel },
        defaultSort: { id: 'name', dir: 'asc' },
      },
      fields: {
        sku: { label: 'Item code (SKU)', type: 'text', schema: Text(40), column: invItems.sku, required: true, help: 'Unique; printed on bin cards' },
        name: { label: 'Name', type: 'text', schema: Text(120), column: invItems.name, required: true },
        category: { label: 'Category', type: 'select', schema: Text(60), column: invItems.category, options: categoryOptions, required: true, bulk: true },
        unit: { label: 'Unit', type: 'select', schema: z.enum(UNITS.map((u) => u.value) as [string, ...string[]]), column: invItems.unit, options: UNITS, required: true, bulk: true },
        reorderLevel: { label: 'Reorder level', type: 'number', schema: Int(0, 1_000_000), column: invItems.reorderLevel, bulk: true, help: 'Raise an indent when stock falls to this' },
        reorderQty: { label: 'Reorder quantity', type: 'number', schema: Int(0, 1_000_000), column: invItems.reorderQty, bulk: true },
        description: { label: 'Description', type: 'textarea', schema: z.string().trim().max(500), column: invItems.description },
        active: { label: 'Active', type: 'boolean', schema: z.boolean(), column: invItems.active, bulk: true, create: false },
      },
      duplicate: async (ctx, row) => ({ sku: await copyName(ctx.tx, invItems, invItems.sku, String(row.sku), undefined, (n) => (n === 1 ? '-COPY' : `-COPY${n}`)), name: `${row.name} (copy)` }),
      columns: [
        { key: 'sku', header: 'SKU' },
        { key: 'name', header: 'Item' },
        { key: 'category', header: 'Category' },
        { key: 'unit', header: 'Unit' },
        { key: 'onHand', header: 'On hand' },
        { key: 'reorderLevel', header: 'Reorder level' },
        { key: 'reorderQty', header: 'Reorder quantity' },
        { key: 'lastPrice', header: 'Last price (₹)' },
        { key: 'active', header: 'Active', value: (r) => (r.active ? 'Yes' : 'No') },
      ],
      import: {
        columns: [
          { key: 'sku', header: 'SKU', required: true, help: 'Unique item code; rows are matched on it', example: 'STN-001' },
          { key: 'name', header: 'Item', required: true, example: 'A4 paper (75 gsm)' },
          { key: 'category', header: 'Category', help: 'Created if new', example: 'Stationery', options: async (ctx) => (await categoryOptions(ctx)).map((o) => o.label) },
          { key: 'unit', header: 'Unit', help: UNITS.map((u) => u.value).join(', '), example: 'ream', options: UNITS.map((u) => u.value) },
          { key: 'reorder_level', header: 'Reorder level', example: '10' },
          { key: 'reorder_qty', header: 'Reorder quantity', example: '50' },
          { key: 'description', header: 'Description' },
        ],
        key: ['sku'],
        exists: async (ctx, r) => !!(await ctx.tx.select({ id: invItems.id }).from(invItems).where(sql`lower(${invItems.sku}) = ${lc(r.get('sku'))}`).limit(1))[0],
        run: (ctx, rows) =>
          eachRow(ctx.tx, rows, async (tx, r) => {
            const sku = required(r, 'sku');
            const unit = r.get('unit') || 'nos';
            if (!UNITS.some((u) => u.value === unit)) fail('Unknown unit', unit);
            const category = r.get('category') || 'general';
            await ensureCategory(tx, ctx.p.tenantId, category);
            const values = { name: required(r, 'name'), category, unit, reorderLevel: r.get('reorder_level') ? int(r.get('reorder_level'), 0, 1_000_000) : 0, reorderQty: r.get('reorder_qty') ? int(r.get('reorder_qty'), 0, 1_000_000) : 0, description: r.get('description') };
            const [found] = await tx.select().from(invItems).where(sql`lower(${invItems.sku}) = ${lc(sku)}`).limit(1);
            if (!found) {
              await tx.insert(invItems).values({ tenantId: ctx.p.tenantId, sku, ...values });
              return outcome(true, false, [sku, values.name]);
            }
            const changed = (Object.keys(values) as (keyof typeof values)[]).some((k) => String(found[k]) !== String(values[k]));
            if (changed) await tx.update(invItems).set(values).where(eq(invItems.id, found.id));
            return outcome(false, changed, [sku, values.name]);
          }),
      },
      create: async (ctx, v) => {
        await ensureCategory(ctx.tx, ctx.p.tenantId, String(v.category));
        const [row] = await ctx.tx.insert(invItems).values({ tenantId: ctx.p.tenantId, sku: String(v.sku), name: String(v.name), category: String(v.category), unit: String(v.unit), reorderLevel: Number(v.reorderLevel ?? 0), reorderQty: Number(v.reorderQty ?? 0), description: String(v.description ?? '') }).returning({ id: invItems.id });
        return row.id;
      },
    };
  }

  // ---- stores -------------------------------------------------------------------------------------

  private stores(): RecordEntity {
    const custodian = alias(users, 'custodian');
    const items = sql<number>`(select count(*)::int from inv_stock s where s.store_id = "inv_stores"."id" and s.qty > 0)`;
    return {
      key: 'inv-stores',
      module: 'inventory',
      table: invStores,
      subjectType: 'inv_store',
      roles: { read: STORE_ROLES, write: STORE_ROLES },
      label: (r) => String(r.name),
      list: {
        select: { id: invStores.id, name: invStores.name, kind: invStores.kind, location: invStores.location, departmentId: invStores.departmentId, departmentName: departments.name, custodianUserId: invStores.custodianUserId, custodianName: custodian.fullName, active: invStores.active, items },
        joins: (q) => q.leftJoin(departments, eq(departments.id, invStores.departmentId)).leftJoin(custodian, eq(custodian.id, invStores.custodianUserId)),
        search: [invStores.name, invStores.location, departments.name],
        filters: {
          kind: { label: 'Kind', options: STORE_KINDS, where: (v) => (inList(STORE_KINDS)(v) ? eq(invStores.kind, v) : undefined) },
          department: { label: 'Department', options: departmentOptions, where: (v) => uuidEq(invStores.departmentId, v) },
        },
        sorts: { name: invStores.name, kind: invStores.kind, department: departments.name, items },
        defaultSort: { id: 'name', dir: 'asc' },
      },
      fields: {
        name: { label: 'Name', type: 'text', schema: Text(80), column: invStores.name, required: true },
        kind: { label: 'Kind', type: 'select', schema: z.enum(['central', 'department', 'lab']), column: invStores.kind, options: STORE_KINDS, required: true, bulk: true },
        location: { label: 'Location', type: 'text', schema: z.string().trim().max(120), column: invStores.location },
        departmentId: { label: 'Department', type: 'select', schema: OptionalRef, column: invStores.departmentId, options: departmentOptions, bulk: true, help: 'For a department or lab store' },
        custodianUserId: { label: 'Custodian', type: 'select', schema: OptionalRef, column: invStores.custodianUserId, options: staffOptions, bulk: true },
        active: { label: 'Active', type: 'boolean', schema: z.boolean(), column: invStores.active, create: false, bulk: true },
      },
      duplicate: async (ctx, row) => ({ name: await copyName(ctx.tx, invStores, invStores.name, String(row.name)) }),
      columns: [
        { key: 'name', header: 'Store' },
        { key: 'kind', header: 'Kind', value: (r) => STORE_KINDS.find((o) => o.value === r.kind)?.label ?? String(r.kind) },
        { key: 'location', header: 'Location' },
        { key: 'departmentName', header: 'Department' },
        { key: 'custodianName', header: 'Custodian' },
        { key: 'items', header: 'Items in stock' },
      ],
      import: {
        columns: [
          { key: 'name', header: 'Store', required: true, example: 'Physics lab store' },
          { key: 'kind', header: 'Kind', help: 'central, department or lab', example: 'lab', options: ['central', 'department', 'lab'] },
          { key: 'location', header: 'Location', example: 'Block B, first floor' },
          { key: 'department', header: 'Department', options: async (ctx) => (await departmentOptions(ctx)).map((o) => o.label) },
        ],
        key: ['name'],
        exists: async (ctx, r) => !!(await ctx.tx.select({ id: invStores.id }).from(invStores).where(sql`lower(${invStores.name}) = ${lc(r.get('name'))}`).limit(1))[0],
        run: (ctx, rows) =>
          eachRow(ctx.tx, rows, async (tx, r) => {
            const name = required(r, 'name');
            const kind = r.get('kind') || 'central';
            if (!inList(STORE_KINDS)(kind)) fail('Kind is central, department or lab', kind);
            const departmentId = await lookup({ ...ctx, tx }, departmentOptions, r.get('department'), 'department');
            const [found] = await tx.select().from(invStores).where(sql`lower(${invStores.name}) = ${lc(name)}`).limit(1);
            if (!found) {
              await tx.insert(invStores).values({ tenantId: ctx.p.tenantId, name, kind, location: r.get('location'), departmentId });
              return outcome(true, false, [name]);
            }
            const changed = found.kind !== kind || found.location !== r.get('location') || found.departmentId !== departmentId;
            if (changed) await tx.update(invStores).set({ kind, location: r.get('location'), departmentId }).where(eq(invStores.id, found.id));
            return outcome(false, changed, [name]);
          }),
      },
    };
  }

  // ---- categories ---------------------------------------------------------------------------------

  private categories(): RecordEntity {
    const items = sql<number>`(select count(*)::int from inv_items i where lower(i.category) = lower("inv_categories"."name"))`;
    const vendors = sql<number>`(select count(*)::int from inv_approved_vendors a where a.category_id = "inv_categories"."id")`;
    const vendorNames = sql<string>`coalesce((select string_agg(v.name, ', ' order by v.name) from inv_approved_vendors a join inv_vendors v on v.id = a.vendor_id where a.category_id = "inv_categories"."id"), '')`;
    return {
      key: 'inv-categories',
      module: 'inventory',
      table: invCategories,
      subjectType: 'inv_category',
      roles: { read: STORE_ROLES, write: STORE_ROLES },
      label: (r) => String(r.name),
      list: {
        select: { id: invCategories.id, name: invCategories.name, description: invCategories.description, items, vendors, vendorNames },
        search: [invCategories.name, invCategories.description],
        sorts: { name: invCategories.name, items, vendors },
        defaultSort: { id: 'name', dir: 'asc' },
      },
      fields: {
        name: { label: 'Name', type: 'text', schema: Text(60), column: invCategories.name, required: true, help: 'Items name their category; renaming updates them' },
        description: { label: 'Description', type: 'textarea', schema: z.string().trim().max(300), column: invCategories.description },
      },
      create: async (ctx, v) => {
        const [row] = await ctx.tx.insert(invCategories).values({ tenantId: ctx.p.tenantId, name: String(v.name), description: String(v.description ?? '') }).returning({ id: invCategories.id });
        return row.id;
      },
      remove: {
        guard: async (ctx, id) => {
          const [c] = await ctx.tx.select({ name: invCategories.name }).from(invCategories).where(eq(invCategories.id, id));
          const [n] = c ? await ctx.tx.select({ n: sql<number>`count(*)::int` }).from(invItems).where(sql`lower(${invItems.category}) = lower(${c.name})`) : [{ n: 0 }];
          return n.n ? `${n.n} item${n.n === 1 ? '' : 's'} still use this category; move them first` : null;
        },
      },
      columns: [
        { key: 'name', header: 'Category' },
        { key: 'description', header: 'Description' },
        { key: 'items', header: 'Items' },
        { key: 'vendorNames', header: 'Approved vendors' },
      ],
    };
  }

  // ---- vendors ------------------------------------------------------------------------------------

  private vendors(): RecordEntity {
    const score = sql<number | null>`(select round(avg((r.quality + r.delivery + r.price) / 3.0), 1)::float8 from inv_vendor_ratings r where r.vendor_id = "inv_vendors"."id")`;
    const orders = sql<number>`(select count(*)::int from inv_purchase_orders o where o.vendor_id = "inv_vendors"."id")`;
    const ordered = sql<number>`(select (coalesce(sum(o.total_paise), 0) / 100.0)::float8 from inv_purchase_orders o where o.vendor_id = "inv_vendors"."id" and o.status <> 'cancelled')`;
    const Email = z.union([z.email().max(200), z.literal('')]).nullable().transform((v) => (v ? v.toLowerCase() : null));
    return {
      key: 'inv-vendors',
      module: 'procurement',
      table: invVendors,
      subjectType: 'inv_vendor',
      roles: { read: ACCOUNTS, write: STORE_ROLES },
      label: (r) => String(r.name),
      list: {
        select: { id: invVendors.id, name: invVendors.name, gstin: invVendors.gstin, pan: invVendors.pan, contactPerson: invVendors.contactPerson, phone: invVendors.phone, email: invVendors.email, address: invVendors.address, active: invVendors.active, blacklisted: invVendors.blacklisted, blacklistReason: invVendors.blacklistReason, score, orders, ordered },
        search: [invVendors.name, invVendors.gstin, invVendors.contactPerson, invVendors.phone, invVendors.email],
        filters: {
          state: { label: 'Status', options: opt([['active', 'Active'], ['blacklisted', 'Blacklisted'], ['inactive', 'Inactive']]), where: (v) => (v === 'active' ? and(eq(invVendors.active, true), eq(invVendors.blacklisted, false)) : v === 'blacklisted' ? eq(invVendors.blacklisted, true) : v === 'inactive' ? eq(invVendors.active, false) : undefined) },
          rating: { label: 'Rating', options: opt([['good', '4 and above'], ['poor', 'Below 3'], ['unrated', 'Not rated']]), where: (v) => (v === 'good' ? sql`${score} >= 4` : v === 'poor' ? sql`${score} < 3` : v === 'unrated' ? sql`${score} is null` : undefined) },
        },
        sorts: { name: invVendors.name, rating: score, orders, ordered },
        defaultSort: { id: 'name', dir: 'asc' },
      },
      fields: {
        name: { label: 'Name', type: 'text', schema: Text(120), column: invVendors.name, required: true },
        gstin: { label: 'GSTIN', type: 'text', schema: z.union([z.string().trim().regex(/^[0-9]{2}[A-Z0-9]{13}$/, 'A GSTIN has 15 characters, e.g. 29ABCDE1234F1Z5'), z.literal('')]).nullable().transform((v) => v || null), column: invVendors.gstin },
        pan: { label: 'PAN', type: 'text', schema: z.union([z.string().trim().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'A PAN looks like ABCDE1234F'), z.literal('')]).nullable().transform((v) => v || null), column: invVendors.pan },
        contactPerson: { label: 'Contact person', type: 'text', schema: z.string().trim().max(120), column: invVendors.contactPerson },
        phone: { label: 'Phone', type: 'phone', schema: z.string().trim().max(20), column: invVendors.phone },
        email: { label: 'Email', type: 'email', schema: Email, column: invVendors.email },
        address: { label: 'Address', type: 'textarea', schema: z.string().trim().max(300), column: invVendors.address },
        active: { label: 'Active', type: 'boolean', schema: z.boolean(), column: invVendors.active, create: false, bulk: true },
      },
      actions: {
        reinstate: {
          label: 'Lift blacklisting',
          roles: APPROVER_ROLES,
          apply: async (ctx, id) => {
            const [v] = await ctx.tx.select().from(invVendors).where(eq(invVendors.id, id));
            if (!v?.blacklisted) throw new ConflictException('This vendor is not blacklisted');
            await ctx.tx.update(invVendors).set({ blacklisted: false, blacklistReason: null, blacklistedAt: null }).where(eq(invVendors.id, id));
            await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: 'inventory.vendor_reinstated', subjectType: 'inv_vendor', subjectId: id, before: { blacklisted: true }, after: { blacklisted: false } });
          },
        },
      },
      columns: [
        { key: 'name', header: 'Vendor' },
        { key: 'gstin', header: 'GSTIN' },
        { key: 'pan', header: 'PAN' },
        { key: 'contactPerson', header: 'Contact' },
        { key: 'phone', header: 'Phone' },
        { key: 'email', header: 'Email' },
        { key: 'score', header: 'Rating (of 5)' },
        { key: 'orders', header: 'Orders' },
        { key: 'ordered', header: 'Ordered (₹)' },
        { key: 'blacklisted', header: 'Blacklisted', value: (r) => (r.blacklisted ? `Yes: ${r.blacklistReason ?? ''}` : 'No') },
      ],
      import: {
        columns: [
          { key: 'name', header: 'Vendor', required: true, help: 'Rows are matched on the name', example: 'Sri Lakshmi Stationers' },
          { key: 'gstin', header: 'GSTIN', example: '29ABCDE1234F1Z5' },
          { key: 'pan', header: 'PAN' },
          { key: 'contact_person', header: 'Contact person' },
          { key: 'phone', header: 'Phone', example: '+919845012345' },
          { key: 'email', header: 'Email' },
          { key: 'address', header: 'Address' },
        ],
        key: ['name'],
        exists: async (ctx, r) => !!(await ctx.tx.select({ id: invVendors.id }).from(invVendors).where(sql`lower(${invVendors.name}) = ${lc(r.get('name'))}`).limit(1))[0],
        run: (ctx, rows) =>
          eachRow(ctx.tx, rows, async (tx, r) => {
            const name = required(r, 'name');
            const gstin = r.get('gstin').toUpperCase() || null;
            if (gstin && !/^[0-9]{2}[A-Z0-9]{13}$/.test(gstin)) fail('A GSTIN has 15 characters', gstin);
            const values = { gstin, pan: r.get('pan').toUpperCase() || null, contactPerson: r.get('contact_person'), phone: r.get('phone'), email: r.get('email').toLowerCase() || null, address: r.get('address') };
            const [found] = await tx.select().from(invVendors).where(sql`lower(${invVendors.name}) = ${lc(name)}`).limit(1);
            if (!found) {
              await tx.insert(invVendors).values({ tenantId: ctx.p.tenantId, name, ...values });
              return outcome(true, false, [name]);
            }
            const changed = (Object.keys(values) as (keyof typeof values)[]).some((k) => (found[k] ?? '') !== (values[k] ?? ''));
            if (changed) await tx.update(invVendors).set(values).where(eq(invVendors.id, found.id));
            return outcome(false, changed, [name]);
          }),
      },
    };
  }

  // ---- rate contracts -----------------------------------------------------------------------------

  private rateContracts(): RecordEntity {
    const inForce = sql<boolean>`${invRateContracts.active} and current_date between ${invRateContracts.validFrom} and ${invRateContracts.validTo}`;
    return {
      key: 'inv-rate-contracts',
      module: 'procurement',
      table: invRateContracts,
      subjectType: 'inv_rate_contract',
      roles: { read: ACCOUNTS, write: STORE_ROLES },
      label: (r) => `${r.vendorName} · ${r.itemName}`,
      list: {
        select: { id: invRateContracts.id, vendorId: invRateContracts.vendorId, vendorName: invVendors.name, itemId: invRateContracts.itemId, itemName: invItems.name, sku: invItems.sku, unit: invItems.unit, rate: sql<number>`(${invRateContracts.ratePaise} / 100.0)::float8`, validFrom: invRateContracts.validFrom, validTo: invRateContracts.validTo, reference: invRateContracts.reference, active: invRateContracts.active, inForce },
        joins: (q) => q.innerJoin(invVendors, eq(invVendors.id, invRateContracts.vendorId)).innerJoin(invItems, eq(invItems.id, invRateContracts.itemId)),
        search: [invVendors.name, invItems.name, invItems.sku, invRateContracts.reference],
        filters: {
          vendor: { label: 'Vendor', options: vendorOptions, where: (v) => uuidEq(invRateContracts.vendorId, v) },
          state: { label: 'Status', options: opt([['current', 'In force'], ['expired', 'Expired'], ['inactive', 'Stopped']]), where: (v) => (v === 'current' ? inForce : v === 'expired' ? sql`${invRateContracts.validTo} < current_date` : v === 'inactive' ? eq(invRateContracts.active, false) : undefined) },
        },
        sorts: { vendor: invVendors.name, item: invItems.name, rate: invRateContracts.ratePaise, validTo: invRateContracts.validTo },
        defaultSort: { id: 'validTo', dir: 'desc' },
      },
      fields: {
        vendorId: { label: 'Vendor', type: 'select', schema: Ref, column: invRateContracts.vendorId, options: vendorOptions, required: true, edit: false },
        itemId: { label: 'Item', type: 'select', schema: Ref, column: invRateContracts.itemId, options: itemOptions, required: true, edit: false },
        ratePaise: { label: 'Rate (₹ per unit)', type: 'number', schema: Rupees, column: invRateContracts.ratePaise, rowKey: 'rate', required: true },
        validFrom: { label: 'Valid from', type: 'date', schema: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15'), column: invRateContracts.validFrom, required: true },
        validTo: { label: 'Valid to', type: 'date', schema: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15'), column: invRateContracts.validTo, required: true, bulk: true },
        reference: { label: 'Reference', type: 'text', schema: z.string().trim().max(120), column: invRateContracts.reference, help: 'Contract or tender number' },
        active: { label: 'In use', type: 'boolean', schema: z.boolean(), column: invRateContracts.active, create: false, bulk: true },
      },
      create: async (ctx, v) => {
        if (String(v.validTo) < String(v.validFrom)) throw new BadRequestException('The contract must end on or after it starts');
        await this.proc.assertVendorFor(ctx.tx, String(v.vendorId), [String(v.itemId)]);
        const [row] = await ctx.tx.insert(invRateContracts).values({ tenantId: ctx.p.tenantId, vendorId: String(v.vendorId), itemId: String(v.itemId), ratePaise: Number(v.ratePaise), validFrom: String(v.validFrom), validTo: String(v.validTo), reference: String(v.reference ?? ''), createdBy: ctx.p.userId }).returning({ id: invRateContracts.id });
        return row.id;
      },
      duplicate: () => ({ reference: '' }),
      columns: [
        { key: 'vendorName', header: 'Vendor' },
        { key: 'sku', header: 'SKU' },
        { key: 'itemName', header: 'Item' },
        { key: 'unit', header: 'Unit' },
        { key: 'rate', header: 'Rate (₹)' },
        { key: 'validFrom', header: 'Valid from' },
        { key: 'validTo', header: 'Valid to' },
        { key: 'reference', header: 'Reference' },
        { key: 'inForce', header: 'In force', value: (r) => (r.inForce ? 'Yes' : 'No') },
      ],
      import: {
        columns: [
          { key: 'vendor', header: 'Vendor', required: true, options: async (ctx) => (await vendorOptions(ctx)).map((o) => o.label) },
          { key: 'sku', header: 'SKU', required: true, example: 'STN-001' },
          { key: 'rate', header: 'Rate (₹)', required: true, example: '245.50' },
          { key: 'valid_from', header: 'Valid from', required: true, example: '2026-04-01' },
          { key: 'valid_to', header: 'Valid to', required: true, example: '2027-03-31' },
          { key: 'reference', header: 'Reference' },
        ],
        key: ['vendor', 'sku', 'valid_from'],
        exists: async (ctx, r) => !!(await ctx.tx.select({ id: invRateContracts.id }).from(invRateContracts).innerJoin(invVendors, eq(invVendors.id, invRateContracts.vendorId)).innerJoin(invItems, eq(invItems.id, invRateContracts.itemId)).where(and(sql`lower(${invVendors.name}) = ${lc(r.get('vendor'))}`, sql`lower(${invItems.sku}) = ${lc(r.get('sku'))}`, sql`${invRateContracts.validFrom}::text = ${r.get('valid_from')}`)).limit(1))[0],
        run: (ctx, rows) =>
          eachRow(ctx.tx, rows, async (tx, r) => {
            const c = { ...ctx, tx };
            const vendorId = (await lookup(c, vendorOptions, required(r, 'vendor'), 'vendor'))!;
            const [item] = await tx.select({ id: invItems.id }).from(invItems).where(sql`lower(${invItems.sku}) = ${lc(required(r, 'sku'))}`);
            if (!item) fail('No item with this SKU', r.get('sku'));
            const rate = rupeesCell(required(r, 'rate'));
            if (rate === null || Number.isNaN(rate) || rate <= 0) fail('Give the rate in rupees', r.get('rate'));
            const from = required(r, 'valid_from');
            const to = required(r, 'valid_to');
            if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) fail('Use dates like 2026-04-01, the end on or after the start', `${from} ${to}`);
            const [found] = await tx.select().from(invRateContracts).where(and(eq(invRateContracts.vendorId, vendorId), eq(invRateContracts.itemId, item!.id), sql`${invRateContracts.validFrom}::text = ${from}`));
            if (!found) {
              await tx.insert(invRateContracts).values({ tenantId: ctx.p.tenantId, vendorId, itemId: item!.id, ratePaise: rate!, validFrom: from, validTo: to, reference: r.get('reference'), createdBy: ctx.p.userId });
              return outcome(true, false, [r.get('vendor'), r.get('sku')]);
            }
            const changed = found.ratePaise !== rate || found.validTo !== to || found.reference !== r.get('reference');
            if (changed) await tx.update(invRateContracts).set({ ratePaise: rate!, validTo: to, reference: r.get('reference') }).where(eq(invRateContracts.id, found.id));
            return outcome(false, changed, [r.get('vendor'), r.get('sku')]);
          }),
      },
    };
  }

  // ---- indents ------------------------------------------------------------------------------------

  private requisitions(): RecordEntity {
    const requester = alias(users, 'requester');
    const lines = sql<number>`(select count(*)::int from inv_requisition_lines l where l.requisition_id = "inv_requisitions"."id")`;
    return {
      key: 'inv-requisitions',
      module: 'procurement',
      table: invRequisitions,
      subjectType: 'inv_requisition',
      roles: { read: STAFF_ROLES, write: STORE_ROLES },
      label: (r) => String(r.number),
      list: {
        select: { id: invRequisitions.id, number: invRequisitions.number, reason: invRequisitions.reason, status: invRequisitions.status, step: invRequisitions.step, budgetStatus: invRequisitions.budgetStatus, estimated: sql<number>`(${invRequisitions.estimatedPaise} / 100.0)::float8`, neededBy: invRequisitions.neededBy, departmentId: invRequisitions.departmentId, departmentName: departments.name, requesterName: requester.fullName, requestedBy: invRequisitions.requestedBy, lines, createdAt: invRequisitions.createdAt },
        joins: (q) => q.leftJoin(departments, eq(departments.id, invRequisitions.departmentId)).leftJoin(requester, eq(requester.id, invRequisitions.requestedBy)),
        search: [invRequisitions.number, invRequisitions.reason, requester.fullName, departments.name],
        filters: {
          status: { label: 'Status', options: REQ_STATUS, where: (v) => (inList(REQ_STATUS)(v) ? eq(invRequisitions.status, v) : undefined) },
          department: { label: 'Department', options: departmentOptions, where: (v) => uuidEq(invRequisitions.departmentId, v) },
          budget: { label: 'Budget', options: BUDGET, where: (v) => (inList(BUDGET)(v) ? eq(invRequisitions.budgetStatus, v) : undefined) },
          mine: { label: 'Waiting for', options: opt([['me', 'My decision']]), where: (v, ctx) => (v === 'me' ? sql`"inv_requisitions"."status" = 'submitted' and "inv_requisitions"."requested_by" <> ${ctx.p.userId} and ("inv_requisitions"."step" = 'principal' and ${ctx.p.roles.some((r) => APPROVER_ROLES.includes(r))} or "inv_requisitions"."step" = 'hod' and exists (select 1 from departments d where d.id = "inv_requisitions"."department_id" and d.head_user_id = ${ctx.p.userId}))` : undefined) },
        },
        sorts: { number: invRequisitions.number, created: invRequisitions.createdAt, estimated: invRequisitions.estimatedPaise, status: invRequisitions.status, neededBy: invRequisitions.neededBy },
        defaultSort: { id: 'created', dir: 'desc' },
        // Store and approvers see every indent; a head of department also their department's; anyone else their own.
        scope: (ctx) => (this.proc.seesAll(ctx.p) ? undefined : sql`("inv_requisitions"."requested_by" = ${ctx.p.userId} or exists (select 1 from departments d where d.id = "inv_requisitions"."department_id" and d.head_user_id = ${ctx.p.userId}))`),
      },
      remove: {
        guard: async (ctx, id) => {
          const [r] = await ctx.tx.select({ status: invRequisitions.status }).from(invRequisitions).where(eq(invRequisitions.id, id));
          return r && r.status === 'ordered' ? 'This indent has been ordered; cancel the order instead' : null;
        },
      },
      actions: {
        approve: {
          label: 'Approve',
          roles: [...APPROVER_ROLES, 'hod'],
          apply: async (ctx, id) => {
            const r = await this.proc.decideIndent(ctx.tx, ctx.p, id, { approve: true });
            return r.status === 'approved' ? 'Approved' : 'Forwarded to the principal';
          },
        },
      },
      columns: [
        { key: 'number', header: 'Indent' },
        { key: 'createdAt', header: 'Raised on', value: (r) => (r.createdAt instanceof Date ? r.createdAt.toISOString().slice(0, 10) : String(r.createdAt ?? '').slice(0, 10)) },
        { key: 'requesterName', header: 'Raised by' },
        { key: 'departmentName', header: 'Department' },
        { key: 'reason', header: 'Purpose' },
        { key: 'lines', header: 'Items' },
        { key: 'estimated', header: 'Estimate (₹)' },
        { key: 'budgetStatus', header: 'Budget', value: (r) => BUDGET.find((o) => o.value === r.budgetStatus)?.label ?? '' },
        { key: 'status', header: 'Status', value: (r) => REQ_STATUS.find((o) => o.value === r.status)?.label ?? String(r.status) },
      ],
    };
  }

  // ---- purchase orders ----------------------------------------------------------------------------

  private orders(): RecordEntity {
    const received = sql<number>`(select coalesce(sum(l.received_qty), 0)::int from inv_po_lines l where l.po_id = "inv_purchase_orders"."id")`;
    const ordered = sql<number>`(select coalesce(sum(l.qty), 0)::int from inv_po_lines l where l.po_id = "inv_purchase_orders"."id")`;
    return {
      key: 'inv-purchase-orders',
      module: 'procurement',
      table: invPurchaseOrders,
      subjectType: 'inv_purchase_order',
      roles: { read: ACCOUNTS, write: STORE_ROLES },
      label: (r) => String(r.number),
      list: {
        select: { id: invPurchaseOrders.id, number: invPurchaseOrders.number, vendorId: invPurchaseOrders.vendorId, vendorName: invVendors.name, storeName: invStores.name, departmentName: departments.name, status: invPurchaseOrders.status, approvalStatus: invPurchaseOrders.approvalStatus, purchaseMode: invPurchaseOrders.purchaseMode, total: sql<number>`(${invPurchaseOrders.totalPaise} / 100.0)::float8`, amendmentNo: invPurchaseOrders.amendmentNo, deliveryBy: invPurchaseOrders.deliveryBy, committee: sql<boolean>`${invPurchaseOrders.committeeMinutes} is not null`, received, ordered, createdAt: invPurchaseOrders.createdAt },
        joins: (q) => q.innerJoin(invVendors, eq(invVendors.id, invPurchaseOrders.vendorId)).innerJoin(invStores, eq(invStores.id, invPurchaseOrders.storeId)).leftJoin(departments, eq(departments.id, invPurchaseOrders.departmentId)),
        search: [invPurchaseOrders.number, invVendors.name, invPurchaseOrders.gemRef, invPurchaseOrders.tenderRef],
        filters: {
          status: { label: 'Status', options: PO_STATUS, where: (v) => (inList(PO_STATUS)(v) ? eq(invPurchaseOrders.status, v) : undefined) },
          mode: { label: 'Purchase mode', options: MODES, where: (v) => (inList(MODES)(v) ? eq(invPurchaseOrders.purchaseMode, v) : undefined) },
          vendor: { label: 'Vendor', options: vendorOptions, where: (v) => uuidEq(invPurchaseOrders.vendorId, v) },
          department: { label: 'Department', options: departmentOptions, where: (v) => uuidEq(invPurchaseOrders.departmentId, v) },
        },
        sorts: { number: invPurchaseOrders.number, created: invPurchaseOrders.createdAt, total: invPurchaseOrders.totalPaise, vendor: invVendors.name, deliveryBy: invPurchaseOrders.deliveryBy },
        defaultSort: { id: 'created', dir: 'desc' },
      },
      actions: {
        approve: { label: 'Approve', roles: APPROVER_ROLES, apply: async (ctx, id) => void (await this.proc.decidePo(ctx.tx, ctx.p, id, { approve: true })) },
      },
      columns: [
        { key: 'number', header: 'PO' },
        { key: 'createdAt', header: 'Date', value: (r) => (r.createdAt instanceof Date ? r.createdAt.toISOString().slice(0, 10) : String(r.createdAt ?? '').slice(0, 10)) },
        { key: 'vendorName', header: 'Vendor' },
        { key: 'departmentName', header: 'Department' },
        { key: 'purchaseMode', header: 'Mode', value: (r) => MODES.find((o) => o.value === r.purchaseMode)?.label ?? String(r.purchaseMode) },
        { key: 'total', header: 'Total (₹)' },
        { key: 'status', header: 'Status', value: (r) => PO_STATUS.find((o) => o.value === r.status)?.label ?? String(r.status) },
        { key: 'amendmentNo', header: 'Amendments' },
        { key: 'deliveryBy', header: 'Delivery by' },
      ],
    };
  }

  // ---- invoices -----------------------------------------------------------------------------------

  private invoices(): RecordEntity {
    return {
      key: 'inv-invoices',
      module: 'procurement',
      table: invInvoices,
      subjectType: 'inv_invoice',
      roles: { read: ACCOUNTS, write: ACCOUNTS },
      label: (r) => `${r.vendorName} ${r.invoiceNo}`,
      list: {
        select: { id: invInvoices.id, invoiceNo: invInvoices.invoiceNo, invoiceDate: invInvoices.invoiceDate, poId: invInvoices.poId, poNumber: invPurchaseOrders.number, vendorName: invVendors.name, amount: sql<number>`(${invInvoices.amountPaise} / 100.0)::float8`, expected: sql<number>`(${invInvoices.expectedPaise} / 100.0)::float8`, debit: sql<number>`(${invInvoices.debitPaise} / 100.0)::float8`, status: invInvoices.status, note: invInvoices.note, voucherNo: invInvoices.voucherNo, paidOn: invInvoices.paidOn, paymentMode: invInvoices.paymentMode, createdAt: invInvoices.createdAt },
        joins: (q) => q.innerJoin(invPurchaseOrders, eq(invPurchaseOrders.id, invInvoices.poId)).innerJoin(invVendors, eq(invVendors.id, invInvoices.vendorId)),
        search: [invInvoices.invoiceNo, invVendors.name, invPurchaseOrders.number, invInvoices.voucherNo],
        filters: {
          status: { label: 'Status', options: INVOICE_STATUS, where: (v) => (inList(INVOICE_STATUS)(v) ? eq(invInvoices.status, v) : undefined) },
          vendor: { label: 'Vendor', options: vendorOptions, where: (v) => uuidEq(invInvoices.vendorId, v) },
        },
        sorts: { invoiceNo: invInvoices.invoiceNo, created: invInvoices.createdAt, amount: invInvoices.amountPaise, vendor: invVendors.name, paidOn: invInvoices.paidOn },
        defaultSort: { id: 'created', dir: 'desc' },
      },
      remove: {
        guard: async (ctx, id) => {
          const [i] = await ctx.tx.select({ status: invInvoices.status }).from(invInvoices).where(eq(invInvoices.id, id));
          return i?.status === 'paid' ? 'A paid invoice stays on record' : null;
        },
      },
      columns: [
        { key: 'invoiceNo', header: 'Invoice' },
        { key: 'invoiceDate', header: 'Invoice date' },
        { key: 'vendorName', header: 'Vendor' },
        { key: 'poNumber', header: 'PO' },
        { key: 'amount', header: 'Amount (₹)' },
        { key: 'expected', header: 'Received value (₹)' },
        { key: 'debit', header: 'Debit notes (₹)' },
        { key: 'status', header: 'Status', value: (r) => INVOICE_STATUS.find((o) => o.value === r.status)?.label ?? String(r.status) },
        { key: 'voucherNo', header: 'Voucher' },
        { key: 'paidOn', header: 'Paid on' },
      ],
    };
  }

  // ---- gate register ------------------------------------------------------------------------------

  private gate(): RecordEntity {
    const overdue = sql<boolean>`${invGateEntries.kind} = 'returnable' and ${invGateEntries.status} = 'open' and ${invGateEntries.expectedReturnOn} < current_date`;
    const settle = (to: 'returned' | 'closed') => async (ctx: KitCtx, id: string) => {
      const [g] = await ctx.tx.select().from(invGateEntries).where(eq(invGateEntries.id, id));
      if (!g || g.status !== 'open') throw new ConflictException('This entry is not open');
      if (to === 'returned' && g.kind !== 'returnable') throw new ConflictException('Only a returnable item comes back');
      await ctx.tx.update(invGateEntries).set({ status: to, ...(to === 'returned' && { returnedOn: await this.proc.today(ctx.tx) }) }).where(eq(invGateEntries.id, id));
      await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: `inventory.gate_${to}`, subjectType: 'inv_gate_entry', subjectId: id, before: { status: 'open' }, after: { status: to } });
    };
    return {
      key: 'inv-gate-entries',
      module: 'inventory',
      table: invGateEntries,
      subjectType: 'inv_gate_entry',
      roles: { read: STORE_ROLES, write: STORE_ROLES },
      label: (r) => `${r.number} ${r.party}`,
      list: {
        select: { id: invGateEntries.id, number: invGateEntries.number, direction: invGateEntries.direction, kind: invGateEntries.kind, party: invGateEntries.party, vehicleNo: invGateEntries.vehicleNo, description: invGateEntries.description, qty: invGateEntries.qty, documentNo: invGateEntries.documentNo, poId: invGateEntries.poId, poNumber: invPurchaseOrders.number, expectedReturnOn: invGateEntries.expectedReturnOn, returnedOn: invGateEntries.returnedOn, status: invGateEntries.status, note: invGateEntries.note, overdue, createdAt: invGateEntries.createdAt },
        joins: (q) => q.leftJoin(invPurchaseOrders, eq(invPurchaseOrders.id, invGateEntries.poId)),
        search: [invGateEntries.number, invGateEntries.party, invGateEntries.description, invGateEntries.vehicleNo, invGateEntries.documentNo],
        filters: {
          direction: { label: 'Direction', options: GATE_DIRECTION, where: (v) => (inList(GATE_DIRECTION)(v) ? eq(invGateEntries.direction, v) : undefined) },
          kind: { label: 'Kind', options: GATE_KIND, where: (v) => (inList(GATE_KIND)(v) ? eq(invGateEntries.kind, v) : undefined) },
          status: { label: 'Status', options: [...GATE_STATUS, { value: 'overdue', label: 'Overdue return' }], where: (v) => (v === 'overdue' ? overdue : inList(GATE_STATUS)(v) ? eq(invGateEntries.status, v) : undefined) },
        },
        sorts: { number: invGateEntries.number, created: invGateEntries.createdAt, party: invGateEntries.party, expected: invGateEntries.expectedReturnOn },
        defaultSort: { id: 'created', dir: 'desc' },
      },
      fields: {
        direction: { label: 'Direction', type: 'select', schema: z.enum(['in', 'out']), column: invGateEntries.direction, options: GATE_DIRECTION, required: true, edit: false },
        kind: { label: 'Kind', type: 'select', schema: z.enum(['goods', 'returnable', 'non_returnable']), column: invGateEntries.kind, options: GATE_KIND, required: true, edit: false },
        party: { label: 'From or to', type: 'text', schema: Text(160), column: invGateEntries.party, required: true, help: 'Vendor, repairer or person' },
        description: { label: 'What', type: 'textarea', schema: Text(500), column: invGateEntries.description, required: true },
        qty: { label: 'Quantity', type: 'number', schema: Int(1, 1_000_000), column: invGateEntries.qty, required: true },
        vehicleNo: { label: 'Vehicle number', type: 'text', schema: z.string().trim().max(20), column: invGateEntries.vehicleNo },
        documentNo: { label: 'Challan or gate pass number', type: 'text', schema: z.string().trim().max(60), column: invGateEntries.documentNo },
        poId: { label: 'Purchase order', type: 'select', schema: OptionalRef, column: invGateEntries.poId, options: async (ctx) => (await ctx.tx.select({ id: invPurchaseOrders.id, number: invPurchaseOrders.number }).from(invPurchaseOrders).where(sql`${invPurchaseOrders.status} <> 'cancelled'`).orderBy(asc(invPurchaseOrders.number))).map((r) => ({ value: r.id, label: r.number })) },
        expectedReturnOn: { label: 'Expected back on', type: 'date', schema: DateText, column: invGateEntries.expectedReturnOn, help: 'For a returnable item going out' },
        note: { label: 'Note', type: 'textarea', schema: z.string().trim().max(300), column: invGateEntries.note },
      },
      create: async (ctx, v) => {
        if (v.kind === 'returnable' && v.direction === 'out' && !v.expectedReturnOn) throw new BadRequestException({ formErrors: [], fieldErrors: { expectedReturnOn: ['Say when it is expected back'] } });
        const [row] = await ctx.tx
          .insert(invGateEntries)
          .values({ tenantId: ctx.p.tenantId, number: await nextNumber(ctx.tx, ctx.p.tenantId, 'GE'), direction: String(v.direction), kind: String(v.kind), party: String(v.party), description: String(v.description), qty: Number(v.qty), vehicleNo: String(v.vehicleNo ?? ''), documentNo: String(v.documentNo ?? ''), poId: (v.poId as string | null) ?? null, expectedReturnOn: (v.expectedReturnOn as string | null) ?? null, note: String(v.note ?? ''), status: v.kind === 'returnable' ? 'open' : 'closed', recordedBy: ctx.p.userId })
          .returning({ id: invGateEntries.id });
        return row.id;
      },
      actions: {
        markReturned: { label: 'Mark returned', apply: settle('returned') },
        close: { label: 'Close', apply: settle('closed') },
      },
      columns: [
        { key: 'number', header: 'Entry' },
        { key: 'createdAt', header: 'Date', value: (r) => (r.createdAt instanceof Date ? r.createdAt.toISOString().slice(0, 16).replace('T', ' ') : String(r.createdAt ?? '')) },
        { key: 'direction', header: 'Direction', value: (r) => GATE_DIRECTION.find((o) => o.value === r.direction)?.label ?? String(r.direction) },
        { key: 'kind', header: 'Kind', value: (r) => GATE_KIND.find((o) => o.value === r.kind)?.label ?? String(r.kind) },
        { key: 'party', header: 'From or to' },
        { key: 'description', header: 'What' },
        { key: 'qty', header: 'Quantity' },
        { key: 'vehicleNo', header: 'Vehicle' },
        { key: 'documentNo', header: 'Document' },
        { key: 'poNumber', header: 'PO' },
        { key: 'expectedReturnOn', header: 'Expected back' },
        { key: 'returnedOn', header: 'Returned on' },
        { key: 'status', header: 'Status', value: (r) => GATE_STATUS.find((o) => o.value === r.status)?.label ?? String(r.status) },
      ],
    };
  }

  // ---- stock verifications ------------------------------------------------------------------------

  private verifications(): RecordEntity {
    const lines = sql<number>`(select count(*)::int from inv_stock_verification_lines l where l.verification_id = "inv_stock_verifications"."id")`;
    const counted = sql<number>`(select count(*)::int from inv_stock_verification_lines l where l.verification_id = "inv_stock_verifications"."id" and l.counted_qty is not null)`;
    const variance = sql<number>`(select count(*)::int from inv_stock_verification_lines l where l.verification_id = "inv_stock_verifications"."id" and l.counted_qty is not null and l.counted_qty <> l.book_qty)`;
    return {
      key: 'inv-verifications',
      module: 'inventory',
      table: invStockVerifications,
      subjectType: 'inv_stock_verification',
      roles: { read: STORE_ROLES, write: STORE_ROLES },
      label: (r) => `${r.number} ${r.storeName}`,
      list: {
        select: { id: invStockVerifications.id, number: invStockVerifications.number, storeId: invStockVerifications.storeId, storeName: invStores.name, fiscalYear: invStockVerifications.fiscalYear, status: invStockVerifications.status, note: invStockVerifications.note, lines, counted, variance, closedAt: invStockVerifications.closedAt, createdAt: invStockVerifications.createdAt },
        joins: (q) => q.innerJoin(invStores, eq(invStores.id, invStockVerifications.storeId)),
        search: [invStockVerifications.number, invStores.name],
        filters: {
          status: { label: 'Status', options: VERIFY_STATUS, where: (v) => (inList(VERIFY_STATUS)(v) ? eq(invStockVerifications.status, v) : undefined) },
          store: { label: 'Store', options: storeOptions, where: (v) => uuidEq(invStockVerifications.storeId, v) },
        },
        sorts: { number: invStockVerifications.number, created: invStockVerifications.createdAt, store: invStores.name },
        defaultSort: { id: 'created', dir: 'desc' },
      },
      remove: {
        guard: async (ctx, id) => {
          const [v] = await ctx.tx.select({ status: invStockVerifications.status }).from(invStockVerifications).where(eq(invStockVerifications.id, id));
          return v?.status === 'closed' ? 'A closed verification stays on record for the audit' : null;
        },
      },
      columns: [
        { key: 'number', header: 'Verification' },
        { key: 'storeName', header: 'Store' },
        { key: 'fiscalYear', header: 'Year' },
        { key: 'lines', header: 'Items' },
        { key: 'counted', header: 'Counted' },
        { key: 'variance', header: 'With a difference' },
        { key: 'status', header: 'Status', value: (r) => VERIFY_STATUS.find((o) => o.value === r.status)?.label ?? String(r.status) },
      ],
    };
  }

  // ---- assets -------------------------------------------------------------------------------------

  private assets(): RecordEntity {
    const holder = sql<string | null>`(select a.assigned_to from asset_allocations a where a.asset_id = "assets"."id" and a.returned_on is null limit 1)`;
    const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15');
    return {
      key: 'assets',
      module: 'assets',
      table: assets,
      subjectType: 'asset',
      roles: { read: [...STORE_ROLES, 'accountant'], write: STORE_ROLES },
      label: (r) => `${r.tag} ${r.name}`,
      list: {
        select: { id: assets.id, tag: assets.tag, name: assets.name, category: assets.category, location: assets.location, roomId: assets.roomId, roomName: rooms.name, departmentId: assets.departmentId, departmentName: departments.name, vendorId: assets.vendorId, vendorName: invVendors.name, purchasedOn: assets.purchasedOn, cost: sql<number>`(${assets.costPaise} / 100.0)::float8`, salvage: sql<number>`(${assets.salvagePaise} / 100.0)::float8`, usefulLifeYears: assets.usefulLifeYears, method: assets.method, wdvRatePct: assets.wdvRatePct, status: assets.status, serialNo: assets.serialNo, make: assets.make, model: assets.model, invoiceNo: assets.invoiceNo, warrantyUntil: assets.warrantyUntil, holder },
        joins: (q) => q.leftJoin(rooms, eq(rooms.id, assets.roomId)).leftJoin(departments, eq(departments.id, assets.departmentId)).leftJoin(invVendors, eq(invVendors.id, assets.vendorId)),
        search: [assets.tag, assets.name, assets.category, assets.location, assets.serialNo, rooms.name],
        filters: {
          status: { label: 'Status', options: ASSET_STATUS, where: (v) => (inList(ASSET_STATUS)(v) ? eq(assets.status, v) : undefined) },
          department: { label: 'Department', options: departmentOptions, where: (v) => uuidEq(assets.departmentId, v) },
          room: { label: 'Room', options: roomOptions, where: (v) => uuidEq(assets.roomId, v) },
          warranty: { label: 'Warranty', options: opt([['under', 'Under warranty'], ['ending', 'Ends within 60 days'], ['none', 'No warranty']]), where: (v) => (v === 'under' ? sql`${assets.warrantyUntil} >= current_date` : v === 'ending' ? sql`${assets.warrantyUntil} between current_date and current_date + 60` : v === 'none' ? sql`(${assets.warrantyUntil} is null or ${assets.warrantyUntil} < current_date)` : undefined) },
        },
        sorts: { tag: assets.tag, name: assets.name, category: assets.category, purchasedOn: assets.purchasedOn, cost: assets.costPaise, room: rooms.name, department: departments.name },
        defaultSort: { id: 'tag', dir: 'asc' },
      },
      fields: {
        name: { label: 'Name', type: 'text', schema: Text(120), column: assets.name, required: true },
        category: { label: 'Category', type: 'text', schema: Text(60), column: assets.category, required: true, bulk: true, help: 'Furniture, IT equipment, lab equipment…' },
        location: { label: 'Location', type: 'text', schema: z.string().trim().max(120), column: assets.location, edit: false, help: 'Later changes go through Move (the transfer register)' },
        roomId: { label: 'Room', type: 'select', schema: OptionalRef, column: assets.roomId, options: roomOptions, edit: false },
        departmentId: { label: 'Department', type: 'select', schema: OptionalRef, column: assets.departmentId, options: departmentOptions, edit: false },
        purchasedOn: { label: 'Purchased on', type: 'date', schema: Day, column: assets.purchasedOn, required: true, edit: false },
        costPaise: { label: 'Cost (₹)', type: 'number', schema: Rupees, column: assets.costPaise, rowKey: 'cost', required: true, edit: false },
        salvagePaise: { label: 'Salvage value (₹)', type: 'number', schema: Rupees, column: assets.salvagePaise, rowKey: 'salvage', edit: false },
        usefulLifeYears: { label: 'Useful life (years)', type: 'number', schema: Int(1, 50), column: assets.usefulLifeYears, required: true, edit: false },
        method: { label: 'Depreciation method', type: 'select', schema: z.enum(['slm', 'wdv']), column: assets.method, options: METHODS, edit: false },
        wdvRatePct: { label: 'Written-down rate (%)', type: 'number', schema: z.coerce.number().min(1).max(100).nullable(), column: assets.wdvRatePct, edit: false },
        vendorId: { label: 'Supplier', type: 'select', schema: OptionalRef, column: assets.vendorId, options: vendorOptions },
        invoiceNo: { label: 'Invoice number', type: 'text', schema: OptionalText(60), column: assets.invoiceNo },
        make: { label: 'Make', type: 'text', schema: OptionalText(80), column: assets.make, bulk: true },
        model: { label: 'Model', type: 'text', schema: OptionalText(80), column: assets.model, bulk: true },
        serialNo: { label: 'Serial number', type: 'text', schema: OptionalText(80), column: assets.serialNo },
        warrantyUntil: { label: 'Warranty until', type: 'date', schema: DateText, column: assets.warrantyUntil, bulk: true },
      },
      create: async (ctx, v) =>
        (
          await this.assetsSvc.register(ctx.tx, ctx.p, {
            name: String(v.name),
            category: String(v.category),
            location: String(v.location ?? ''),
            purchasedOn: String(v.purchasedOn),
            costPaise: Number(v.costPaise),
            salvagePaise: Number(v.salvagePaise ?? 0),
            usefulLifeYears: Number(v.usefulLifeYears),
            method: (v.method as 'slm' | 'wdv') ?? 'slm',
            wdvRatePct: (v.wdvRatePct as number | null) ?? null,
            departmentId: v.departmentId as string | null,
            roomId: v.roomId as string | null,
            vendorId: v.vendorId as string | null,
            invoiceNo: v.invoiceNo as string | null,
            make: v.make as string | null,
            model: v.model as string | null,
            serialNo: v.serialNo as string | null,
            warrantyUntil: v.warrantyUntil as string | null,
          })
        ).id,
      move: {
        label: 'Move to room',
        options: roomOptions,
        reason: true,
        apply: async (ctx, id, to, reason) => void (await this.assetsSvc.transfer(ctx.tx, ctx.p, id, { toRoomId: to, reason: reason ?? 'Moved' })),
      },
      remove: {
        guard: async (ctx, id) => {
          const [a] = await ctx.tx.select({ status: assets.status }).from(assets).where(eq(assets.id, id));
          const [gl] = await ctx.tx.select({ n: sql<number>`count(*)::int` }).from(sql`asset_gl_postings`).where(sql`asset_id = ${id}`);
          return a?.status === 'disposed' || gl.n > 0 ? 'This asset has accounting entries; condemn and write it off instead of deleting' : null;
        },
      },
      columns: [
        { key: 'tag', header: 'Tag' },
        { key: 'name', header: 'Asset' },
        { key: 'category', header: 'Category' },
        { key: 'make', header: 'Make' },
        { key: 'model', header: 'Model' },
        { key: 'serialNo', header: 'Serial no.' },
        { key: 'departmentName', header: 'Department' },
        { key: 'roomName', header: 'Room' },
        { key: 'location', header: 'Location' },
        { key: 'holder', header: 'Custodian' },
        { key: 'vendorName', header: 'Supplier' },
        { key: 'purchasedOn', header: 'Purchased' },
        { key: 'cost', header: 'Cost (₹)' },
        { key: 'warrantyUntil', header: 'Warranty until' },
        { key: 'status', header: 'Status', value: (r) => ASSET_STATUS.find((o) => o.value === r.status)?.label ?? String(r.status) },
      ],
      import: {
        columns: [
          { key: 'name', header: 'Asset', required: true, example: 'Dell OptiPlex 7010 desktop' },
          { key: 'category', header: 'Category', required: true, example: 'IT equipment' },
          { key: 'purchased_on', header: 'Purchased on', required: true, example: '2025-06-15' },
          { key: 'cost', header: 'Cost (₹)', required: true, example: '62000' },
          { key: 'useful_life', header: 'Useful life (years)', required: true, example: '5' },
          { key: 'salvage', header: 'Salvage value (₹)', example: '3100' },
          { key: 'method', header: 'Method', help: 'slm (straight line) or wdv (written-down value)', options: ['slm', 'wdv'] },
          { key: 'wdv_rate', header: 'Written-down rate (%)' },
          { key: 'room', header: 'Room', options: async (ctx) => (await roomOptions(ctx)).map((o) => o.label) },
          { key: 'department', header: 'Department', options: async (ctx) => (await departmentOptions(ctx)).map((o) => o.label) },
          { key: 'location', header: 'Location' },
          { key: 'make', header: 'Make' },
          { key: 'model', header: 'Model' },
          { key: 'serial_no', header: 'Serial number', help: 'Rows with a serial number already in the register are matched on it' },
          { key: 'warranty_until', header: 'Warranty until' },
        ],
        key: ['serial_no'],
        exists: async (ctx, r) => !!r.get('serial_no') && !!(await ctx.tx.select({ id: assets.id }).from(assets).where(sql`lower(${assets.serialNo}) = ${lc(r.get('serial_no'))}`).limit(1))[0],
        run: (ctx, rows) =>
          eachRow(ctx.tx, rows, async (tx, r) => {
            const c = { ...ctx, tx };
            const cost = rupeesCell(required(r, 'cost'));
            if (cost === null || Number.isNaN(cost) || cost < 100) fail('Give the cost in rupees', r.get('cost'));
            const salvage = rupeesCell(r.get('salvage')) ?? 0;
            if (Number.isNaN(salvage)) fail('Give the salvage value in rupees', r.get('salvage'));
            const day = required(r, 'purchased_on');
            if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) fail('Use a date like 2025-06-15', day);
            const warranty = r.get('warranty_until');
            if (warranty && !/^\d{4}-\d{2}-\d{2}$/.test(warranty)) fail('Use a date like 2027-06-15', warranty);
            const method = (r.get('method') || 'slm') as 'slm' | 'wdv';
            if (!['slm', 'wdv'].includes(method)) fail('Method is slm or wdv', method);
            const values = {
              name: required(r, 'name'),
              category: required(r, 'category'),
              location: r.get('location'),
              purchasedOn: day,
              costPaise: cost!,
              salvagePaise: salvage,
              usefulLifeYears: int(required(r, 'useful_life'), 1, 50),
              method,
              wdvRatePct: r.get('wdv_rate') ? Number(r.get('wdv_rate')) : null,
              roomId: await lookup(c, roomOptions, r.get('room'), 'room'),
              departmentId: await lookup(c, departmentOptions, r.get('department'), 'department'),
              make: r.get('make') || null,
              model: r.get('model') || null,
              serialNo: r.get('serial_no') || null,
              warrantyUntil: warranty || null,
            };
            const [found] = values.serialNo ? await tx.select().from(assets).where(sql`lower(${assets.serialNo}) = ${lc(values.serialNo)}`).limit(1) : [];
            if (!found) {
              try {
                await this.assetsSvc.register(tx, ctx.p, values);
              } catch (e) {
                fail((e as Error).message);
              }
              return outcome(true, false, [values.name]);
            }
            const changes = { name: values.name, category: values.category, make: values.make, model: values.model, warrantyUntil: values.warrantyUntil };
            const changed = (Object.keys(changes) as (keyof typeof changes)[]).some((k) => (found[k] ?? null) !== (changes[k] ?? null));
            if (changed) await tx.update(assets).set(changes).where(eq(assets.id, found.id));
            return outcome(false, changed, [found.tag, values.name]);
          }),
      },
    };
  }

  // ---- AMC contracts ------------------------------------------------------------------------------

  private amc(): RecordEntity {
    const state = sql<string>`case when ${amcContracts.status} = 'cancelled' then 'cancelled' when ${amcContracts.endsOn} < current_date then 'expired' when ${amcContracts.endsOn} <= current_date + 60 then 'expiring' else 'active' end`;
    const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15');
    return {
      key: 'amc-contracts',
      module: 'assets',
      table: amcContracts,
      subjectType: 'amc_contract',
      roles: { read: [...STORE_ROLES, 'accountant'], write: STORE_ROLES },
      label: (r) => String(r.title),
      list: {
        select: { id: amcContracts.id, title: amcContracts.title, assetId: amcContracts.assetId, assetTag: assets.tag, assetName: assets.name, vendorId: amcContracts.vendorId, vendorName: amcContracts.vendorName, supplier: sql<string>`coalesce(${invVendors.name}, ${amcContracts.vendorName})`, covers: amcContracts.covers, startsOn: amcContracts.startsOn, endsOn: amcContracts.endsOn, cost: sql<number>`(${amcContracts.costPaise} / 100.0)::float8`, visitsPerYear: amcContracts.visitsPerYear, visitsDone: amcContracts.visitsDone, contact: amcContracts.contact, status: amcContracts.status, state },
        joins: (q) => q.leftJoin(assets, eq(assets.id, amcContracts.assetId)).leftJoin(invVendors, eq(invVendors.id, amcContracts.vendorId)),
        search: [amcContracts.title, amcContracts.vendorName, invVendors.name, assets.tag, assets.name],
        filters: {
          state: { label: 'Status', options: opt([['active', 'Active'], ['expiring', 'Ending within 60 days'], ['expired', 'Expired'], ['cancelled', 'Cancelled']]), where: (v) => (['active', 'expiring', 'expired', 'cancelled'].includes(v) ? sql`${state} = ${v}` : undefined) },
        },
        sorts: { title: amcContracts.title, endsOn: amcContracts.endsOn, cost: amcContracts.costPaise },
        defaultSort: { id: 'endsOn', dir: 'asc' },
      },
      fields: {
        title: { label: 'Title', type: 'text', schema: Text(160), column: amcContracts.title, required: true },
        assetId: { label: 'Asset', type: 'select', schema: OptionalRef, column: amcContracts.assetId, options: assetOptions, help: 'Leave empty for a contract that covers many assets' },
        vendorId: { label: 'Vendor', type: 'select', schema: OptionalRef, column: amcContracts.vendorId, options: vendorOptions },
        vendorName: { label: 'Service provider (if not a vendor)', type: 'text', schema: z.string().trim().max(160), column: amcContracts.vendorName },
        covers: { label: 'What it covers', type: 'textarea', schema: z.string().trim().max(300), column: amcContracts.covers },
        startsOn: { label: 'Starts on', type: 'date', schema: Day, column: amcContracts.startsOn, required: true },
        endsOn: { label: 'Ends on', type: 'date', schema: Day, column: amcContracts.endsOn, required: true, bulk: true },
        costPaise: { label: 'Cost (₹)', type: 'number', schema: Rupees, column: amcContracts.costPaise, rowKey: 'cost' },
        visitsPerYear: { label: 'Visits a year', type: 'number', schema: Int(0, 52), column: amcContracts.visitsPerYear },
        contact: { label: 'Contact', type: 'text', schema: z.string().trim().max(160), column: amcContracts.contact },
      },
      create: async (ctx, v) => {
        if (String(v.endsOn) <= String(v.startsOn)) throw new BadRequestException({ formErrors: [], fieldErrors: { endsOn: ['The contract must end after it starts'] } });
        const [row] = await ctx.tx.insert(amcContracts).values({ tenantId: ctx.p.tenantId, title: String(v.title), assetId: (v.assetId as string | null) ?? null, vendorId: (v.vendorId as string | null) ?? null, vendorName: String(v.vendorName ?? ''), covers: String(v.covers ?? ''), startsOn: String(v.startsOn), endsOn: String(v.endsOn), costPaise: Number(v.costPaise ?? 0), visitsPerYear: Number(v.visitsPerYear ?? 0), contact: String(v.contact ?? ''), createdBy: ctx.p.userId }).returning({ id: amcContracts.id });
        return row.id;
      },
      duplicate: (_ctx, row) => ({ title: `${row.title} (renewal)`, visits_done: 0, status: 'active' }),
      actions: {
        cancel: {
          label: 'Cancel contract',
          tone: 'danger',
          apply: async (ctx, id) => {
            const [c] = await ctx.tx.update(amcContracts).set({ status: 'cancelled' }).where(and(eq(amcContracts.id, id), eq(amcContracts.status, 'active'))).returning({ id: amcContracts.id });
            if (!c) throw new ConflictException('This contract is already cancelled');
            await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: 'assets.amc_cancelled', subjectType: 'amc_contract', subjectId: id, before: { status: 'active' }, after: { status: 'cancelled' } });
          },
        },
      },
      columns: [
        { key: 'title', header: 'Contract' },
        { key: 'assetTag', header: 'Asset tag' },
        { key: 'assetName', header: 'Asset' },
        { key: 'supplier', header: 'Service provider' },
        { key: 'covers', header: 'Covers' },
        { key: 'startsOn', header: 'Starts' },
        { key: 'endsOn', header: 'Ends' },
        { key: 'cost', header: 'Cost (₹)' },
        { key: 'visitsDone', header: 'Visits done' },
        { key: 'visitsPerYear', header: 'Visits a year' },
        { key: 'state', header: 'Status' },
      ],
    };
  }

  // ---- condemnations ------------------------------------------------------------------------------

  private condemnations(): RecordEntity {
    const proposer = alias(users, 'proposer');
    return {
      key: 'asset-condemnations',
      module: 'assets',
      table: assetCondemnations,
      subjectType: 'asset_condemnation',
      roles: { read: [...STORE_ROLES, 'accountant'], write: STORE_ROLES },
      label: (r) => `${r.number} ${r.assetTag}`,
      list: {
        select: { id: assetCondemnations.id, number: assetCondemnations.number, assetId: assetCondemnations.assetId, assetTag: assets.tag, assetName: assets.name, bookCost: sql<number>`(${assets.costPaise} / 100.0)::float8`, reason: assetCondemnations.reason, condition: assetCondemnations.condition, status: assetCondemnations.status, committeeNote: assetCondemnations.committeeNote, disposalMode: assetCondemnations.disposalMode, realised: sql<number | null>`(${assetCondemnations.realisedPaise} / 100.0)::float8`, writtenOffOn: assetCondemnations.writtenOffOn, proposerName: proposer.fullName, createdAt: assetCondemnations.createdAt },
        joins: (q) => q.innerJoin(assets, eq(assets.id, assetCondemnations.assetId)).leftJoin(proposer, eq(proposer.id, assetCondemnations.proposedBy)),
        search: [assetCondemnations.number, assets.tag, assets.name, assetCondemnations.reason],
        filters: { status: { label: 'Status', options: CONDEMN_STATUS, where: (v) => (inList(CONDEMN_STATUS)(v) ? eq(assetCondemnations.status, v) : undefined) } },
        sorts: { number: assetCondemnations.number, created: assetCondemnations.createdAt, asset: assets.tag },
        defaultSort: { id: 'created', dir: 'desc' },
      },
      fields: {
        assetId: { label: 'Asset', type: 'select', schema: Ref, column: assetCondemnations.assetId, options: assetOptions, required: true, edit: false },
        reason: { label: 'Reason', type: 'textarea', schema: Text(500), column: assetCondemnations.reason, required: true, help: 'Beyond economical repair, obsolete, lost…' },
        condition: { label: 'Condition', type: 'text', schema: z.string().trim().max(300), column: assetCondemnations.condition },
      },
      create: async (ctx, v) => (await this.assetsSvc.propose(ctx.tx, ctx.p, String(v.assetId), { reason: String(v.reason), condition: String(v.condition ?? '') })).id,
      remove: {
        guard: async (ctx, id) => {
          const [c] = await ctx.tx.select({ status: assetCondemnations.status }).from(assetCondemnations).where(eq(assetCondemnations.id, id));
          return c?.status === 'written_off' ? 'A write-off stays on record' : null;
        },
      },
      actions: {
        approve: { label: 'Approve', roles: APPROVER_ROLES, apply: async (ctx, id) => void (await this.assetsSvc.decide(ctx.tx, ctx.p, id, { approve: true })) },
      },
      columns: [
        { key: 'number', header: 'Proposal' },
        { key: 'assetTag', header: 'Tag' },
        { key: 'assetName', header: 'Asset' },
        { key: 'bookCost', header: 'Cost (₹)' },
        { key: 'reason', header: 'Reason' },
        { key: 'proposerName', header: 'Proposed by' },
        { key: 'status', header: 'Status', value: (r) => CONDEMN_STATUS.find((o) => o.value === r.status)?.label ?? String(r.status) },
        { key: 'disposalMode', header: 'Disposed by' },
        { key: 'realised', header: 'Realised (₹)' },
        { key: 'writtenOffOn', header: 'Written off on' },
      ],
    };
  }
}
