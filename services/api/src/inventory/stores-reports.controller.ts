import { BadRequestException, Controller, Get, NotFoundException, Query } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { Day } from '../common/ops.js';
import { DbService, type Tx } from '../db/db.service.js';
import { STORE_ROLES } from './inventory.controller.js';
import { ProcurementService } from './procurement.service.js';
import { AGE_BUCKETS, ageBucket, companiesActSchedule, daysBetween, fyEndOf, fyOf, fyStartOf, IT_BLOCKS, itActBlocks, itBlockFor, lastFiveFys } from './stores.logic.js';

/** Stores and purchase reports: the store, the accounts office and the principal. */
const REPORT_ROLES: RoleName[] = [...STORE_ROLES, 'accountant'];
/** NAAC and the lab register: also the IQAC (quality officer) and heads of department. */
const NAAC_ROLES: RoleName[] = [...REPORT_ROLES, 'quality_officer', 'hod'];

const Fy = z.string().regex(/^\d{4}-\d{2}$/).refine((s) => (Number(s.slice(0, 4)) + 1) % 100 === Number(s.slice(5)), 'Use a financial year like 2026-27');
const uuidOr = (v?: string) => (v && z.uuid().safeParse(v).success ? v : null);
const IST = (col: string) => sql.raw(`(${col} at time zone 'Asia/Kolkata')::date`);

/**
 * Reports of the stores, purchase and asset pass, all computed on the server from the ledger: stock summary and stock
 * ledger with values, stock ageing, non-moving (dead) stock, the purchase register with GST, MSME dues, the
 * depreciation registers under the Companies Act and the Income-tax Act, laboratory equipment registers, and NAAC
 * criteria 4.1 (infrastructure augmentation) and 4.4 (maintenance) for five years.
 */
@Controller('v1/inventory/reports')
export class StoresReportsController {
  constructor(
    private readonly db: DbService,
    private readonly proc: ProcurementService,
  ) {}

  /** Quantity and value by store and item on a day (today when no day is given), with totals by category and store. */
  @Get('stock-summary')
  @Auth('user', REPORT_ROLES)
  stockSummary(@CurrentPrincipal() p: UserPrincipal, @Query('asOn') asOn?: string, @Query('storeId') storeId?: string, @Query('category') category?: string) {
    const day = asOn ? Day.parse(asOn) : null;
    const store = uuidOr(storeId);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const on = day ?? (await this.proc.today(tx));
      type Row = { storeId: string; store: string; storeKind: string; itemId: string; sku: string; item: string; category: string; unit: string; valuation: string; qty: number; valuePaise: string; reorderLevel: number };
      // Today: the stock as it stands; a past day: rebuilt from the ledger up to that day.
      const { rows } = !day
        ? await tx.execute<Row>(sql`
        select st.id as "storeId", st.name as store, st.kind as "storeKind", i.id as "itemId", i.sku, i.name as item, i.category, i.unit, i.valuation, i.reorder_level as "reorderLevel", s.qty, s.value_paise as "valuePaise"
        from inv_stock s join inv_items i on i.id = s.item_id join inv_stores st on st.id = s.store_id
        where (s.qty <> 0 or s.value_paise <> 0) and (${store}::uuid is null or s.store_id = ${store}::uuid) and (${category ?? null}::text is null or lower(i.category) = lower(${category ?? null}::text))
        order by st.name, i.category, i.name`)
        : await tx.execute<Row>(sql`
        select st.id as "storeId", st.name as store, st.kind as "storeKind", i.id as "itemId", i.sku, i.name as item, i.category, i.unit, i.valuation, i.reorder_level as "reorderLevel",
               sum(m.delta)::int as qty, sum(m.value_paise)::bigint as "valuePaise"
        from inv_stock_moves m join inv_items i on i.id = m.item_id join inv_stores st on st.id = m.store_id
        where ${IST('m.created_at')} <= ${on}::date and (${store}::uuid is null or m.store_id = ${store}::uuid) and (${category ?? null}::text is null or lower(i.category) = lower(${category ?? null}::text))
        group by st.id, i.id having sum(m.delta) <> 0 or sum(m.value_paise) <> 0 order by st.name, i.category, i.name`);
      const lines = rows.map((r) => ({ ...r, valuePaise: Number(r.valuePaise), avgCostPaise: r.qty > 0 ? Math.round(Number(r.valuePaise) / r.qty) : 0 }));
      const by = (k: 'category' | 'store') => [...new Set(lines.map((l) => l[k]))].map((name) => ({ name, items: lines.filter((l) => l[k] === name).length, valuePaise: lines.filter((l) => l[k] === name).reduce((s, l) => s + l.valuePaise, 0) }));
      return { asOn: on, lines, byCategory: by('category'), byStore: by('store'), totalPaise: lines.reduce((s, l) => s + l.valuePaise, 0) };
    });
  }

  /** An item's stock ledger in a store or all stores: opening, every move with its running quantity and value, closing. */
  @Get('ledger')
  @Auth('user', REPORT_ROLES)
  ledger(@CurrentPrincipal() p: UserPrincipal, @Query('itemId') itemId?: string, @Query('storeId') storeId?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const item = uuidOr(itemId);
    if (!item) throw new BadRequestException('Choose the item');
    const store = uuidOr(storeId);
    const f = from ? Day.parse(from) : '1900-01-01';
    const t = to ? Day.parse(to) : '2999-12-31';
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [it] = (await tx.execute<{ sku: string; name: string; unit: string; valuation: string }>(sql`select sku, name, unit, valuation from inv_items where id = ${item}::uuid`)).rows;
      if (!it) throw new NotFoundException('Item not found');
      const where = sql`m.item_id = ${item}::uuid and (${store}::uuid is null or m.store_id = ${store}::uuid)`;
      const [open] = (await tx.execute<{ qty: number; value: string }>(sql`select coalesce(sum(m.delta), 0)::int as qty, coalesce(sum(m.value_paise), 0)::bigint as value from inv_stock_moves m where ${where} and ${IST('m.created_at')} < ${f}::date`)).rows;
      const { rows } = await tx.execute<{ id: string; on: string; store: string; kind: string; delta: number; valuePaise: string; unitCostPaise: string | null; batchNo: string | null; issuedTo: string | null; department: string | null; note: string }>(sql`
        select m.id, to_char(m.created_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as on, st.name as store, m.kind, m.delta, m.value_paise as "valuePaise", m.unit_cost_paise as "unitCostPaise", m.batch_no as "batchNo", m.issued_to as "issuedTo", d.name as department, m.note
        from inv_stock_moves m join inv_stores st on st.id = m.store_id left join departments d on d.id = m.department_id
        where ${where} and ${IST('m.created_at')} between ${f}::date and ${t}::date order by m.created_at, m.id limit 5000`);
      let qty = open.qty;
      let value = Number(open.value);
      const moves = rows.map((r) => {
        qty += r.delta;
        value += Number(r.valuePaise);
        return { ...r, valuePaise: Number(r.valuePaise), unitCostPaise: r.unitCostPaise === null ? null : Number(r.unitCostPaise), balanceQty: qty, balancePaise: value };
      });
      return { item: it, from: f === '1900-01-01' ? null : f, to: t === '2999-12-31' ? null : t, opening: { qty: open.qty, valuePaise: Number(open.value) }, moves, closing: { qty, valuePaise: value }, inwardQty: rows.filter((r) => r.delta > 0).reduce((s, r) => s + r.delta, 0), outwardQty: -rows.filter((r) => r.delta < 0).reduce((s, r) => s + r.delta, 0) };
    });
  }

  /** What is held by how long ago it was received (0–30, 31–90, 91–180, 181–365, over 365 days), quantity and value. */
  @Get('ageing')
  @Auth('user', REPORT_ROLES)
  ageing(@CurrentPrincipal() p: UserPrincipal, @Query('storeId') storeId?: string) {
    const store = uuidOr(storeId);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await this.proc.today(tx);
      const { rows } = await tx.execute<{ itemId: string; sku: string; item: string; category: string; unit: string; store: string; receivedOn: string; qty: number; unitCostPaise: string }>(sql`
        select i.id as "itemId", i.sku, i.name as item, i.category, i.unit, st.name as store, l.received_on::text as "receivedOn", l.qty_left as qty, l.unit_cost_paise as "unitCostPaise"
        from inv_stock_layers l join inv_items i on i.id = l.item_id join inv_stores st on st.id = l.store_id
        where l.qty_left > 0 and (${store}::uuid is null or l.store_id = ${store}::uuid) order by i.name`);
      const out = new Map<string, { itemId: string; sku: string; item: string; category: string; unit: string; store: string; buckets: Record<string, { qty: number; valuePaise: number }>; qty: number; valuePaise: number; oldestOn: string }>();
      for (const r of rows) {
        const k = `${r.store}|${r.itemId}`;
        const cur = out.get(k) ?? { itemId: r.itemId, sku: r.sku, item: r.item, category: r.category, unit: r.unit, store: r.store, buckets: Object.fromEntries(AGE_BUCKETS.map((b) => [b, { qty: 0, valuePaise: 0 }])), qty: 0, valuePaise: 0, oldestOn: r.receivedOn };
        const b = ageBucket(daysBetween(r.receivedOn, today));
        const v = r.qty * Number(r.unitCostPaise);
        cur.buckets[b].qty += r.qty;
        cur.buckets[b].valuePaise += v;
        cur.qty += r.qty;
        cur.valuePaise += v;
        if (r.receivedOn < cur.oldestOn) cur.oldestOn = r.receivedOn;
        out.set(k, cur);
      }
      const lines = [...out.values()].sort((a, b) => a.oldestOn.localeCompare(b.oldestOn));
      return { asOn: today, buckets: AGE_BUCKETS, lines, totals: Object.fromEntries(AGE_BUCKETS.map((b) => [b, lines.reduce((s, l) => s + l.buckets[b].valuePaise, 0)])), totalPaise: lines.reduce((s, l) => s + l.valuePaise, 0) };
    });
  }

  /** Non-moving (dead) stock: held, and nothing issued, transferred or written off for `days` days (365 by default). */
  @Get('dead-stock')
  @Auth('user', REPORT_ROLES)
  deadStock(@CurrentPrincipal() p: UserPrincipal, @Query('days') daysQ?: string, @Query('storeId') storeId?: string) {
    const days = Math.min(3650, Math.max(30, Number(daysQ) || 365));
    const store = uuidOr(storeId);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await this.proc.today(tx);
      const { rows } = await tx.execute<{ storeId: string; store: string; itemId: string; sku: string; item: string; category: string; unit: string; qty: number; valuePaise: string; lastOut: string | null; lastIn: string | null }>(sql`
        select st.id as "storeId", st.name as store, i.id as "itemId", i.sku, i.name as item, i.category, i.unit, s.qty, s.value_paise as "valuePaise",
          (select max(${IST('m.created_at')})::text from inv_stock_moves m where m.store_id = s.store_id and m.item_id = s.item_id and m.delta < 0) as "lastOut",
          (select max(${IST('m.created_at')})::text from inv_stock_moves m where m.store_id = s.store_id and m.item_id = s.item_id and m.delta > 0) as "lastIn"
        from inv_stock s join inv_items i on i.id = s.item_id join inv_stores st on st.id = s.store_id
        where s.qty > 0 and (${store}::uuid is null or s.store_id = ${store}::uuid)
          and not exists (select 1 from inv_stock_moves m where m.store_id = s.store_id and m.item_id = s.item_id and m.delta < 0 and ${IST('m.created_at')} > ${today}::date - ${days}::int)
          and coalesce((select min(l.received_on) from inv_stock_layers l where l.store_id = s.store_id and l.item_id = s.item_id and l.qty_left > 0), ${today}::date) <= ${today}::date - ${days}::int
        order by s.value_paise desc`);
      const lines = rows.map((r) => ({ ...r, valuePaise: Number(r.valuePaise), idleDays: daysBetween(r.lastOut ?? r.lastIn ?? today, today) }));
      return { days, asOn: today, lines, totalPaise: lines.reduce((s, l) => s + l.valuePaise, 0) };
    });
  }

  /** Purchase register with GST (the input side of GSTR-2B): invoices in a period with CGST, SGST and IGST, and an HSN summary. */
  @Get('purchase-register')
  @Auth('user', REPORT_ROLES)
  purchaseRegister(@CurrentPrincipal() p: UserPrincipal, @Query('from') from?: string, @Query('to') to?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await this.proc.today(tx);
      const f = from ? Day.parse(from) : fyStartOf(fyOf(today));
      const t = to ? Day.parse(to) : today;
      const { rows } = await tx.execute<{ id: string; on: string; invoiceNo: string; vendor: string; gstin: string | null; stateCode: string | null; po: string; department: string | null; purchaseMode: string; reference: string | null; taxablePaise: string; cgstPaise: string; sgstPaise: string; igstPaise: string; amountPaise: string; status: string; dueOn: string | null; paidOn: string | null; voucher: string | null }>(sql`
        select i.id, coalesce(i.invoice_date, ${IST('i.created_at')})::text as on, i.invoice_no as "invoiceNo", v.name as vendor, v.gstin, v.state_code as "stateCode", po.number as po, d.name as department, po.purchase_mode as "purchaseMode", coalesce(po.gem_ref, po.tender_ref) as reference,
          coalesce(i.taxable_paise, i.amount_paise) as "taxablePaise", i.cgst_paise as "cgstPaise", i.sgst_paise as "sgstPaise", i.igst_paise as "igstPaise", i.amount_paise as "amountPaise", i.status, i.due_on::text as "dueOn", i.paid_on::text as "paidOn", av.number as voucher
        from inv_invoices i join inv_vendors v on v.id = i.vendor_id join inv_purchase_orders po on po.id = i.po_id left join departments d on d.id = po.department_id left join acct_vouchers av on av.id = i.journal_voucher_id
        where coalesce(i.invoice_date, ${IST('i.created_at')}) between ${f}::date and ${t}::date order by 2, i.invoice_no limit 5000`);
      const lines = rows.map((r) => ({ ...r, taxablePaise: Number(r.taxablePaise), cgstPaise: Number(r.cgstPaise), sgstPaise: Number(r.sgstPaise), igstPaise: Number(r.igstPaise), amountPaise: Number(r.amountPaise) }));
      const { rows: hsn } = await tx.execute<{ hsn: string; gstRatePct: string; qty: number; taxablePaise: string; taxPaise: string }>(sql`
        select coalesce(it.hsn_code, '—') as hsn, pl.gst_rate_pct as "gstRatePct", sum(pl.received_qty)::int as qty, sum(pl.received_qty::bigint * pl.unit_price_paise)::bigint as "taxablePaise", sum(round(pl.received_qty::numeric * pl.unit_price_paise * pl.gst_rate_pct / 100))::bigint as "taxPaise"
        from inv_po_lines pl join inv_items it on it.id = pl.item_id
        where pl.received_qty > 0 and pl.po_id in (select po_id from inv_invoices i where coalesce(i.invoice_date, ${IST('i.created_at')}) between ${f}::date and ${t}::date)
        group by 1, 2 order by 1, 2`);
      const sum = (k: 'taxablePaise' | 'cgstPaise' | 'sgstPaise' | 'igstPaise' | 'amountPaise') => lines.reduce((s, l) => s + l[k], 0);
      return { from: f, to: t, lines, hsn: hsn.map((h) => ({ ...h, gstRatePct: Number(h.gstRatePct), taxablePaise: Number(h.taxablePaise), taxPaise: Number(h.taxPaise) })), totals: { taxablePaise: sum('taxablePaise'), cgstPaise: sum('cgstPaise'), sgstPaise: sum('sgstPaise'), igstPaise: sum('igstPaise'), amountPaise: sum('amountPaise') } };
    });
  }

  /**
   * Unpaid invoices of micro and small enterprises by their MSMED due date (45 days at most). Past due, the interest is
   * owed under section 16 and the expense is disallowed under section 43B(h) of the Income-tax Act until paid.
   */
  @Get('msme-dues')
  @Auth('user', REPORT_ROLES)
  msmeDues(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await this.proc.today(tx);
      const { rows } = await tx.execute<{ id: string; invoiceNo: string; vendor: string; udyam: string | null; category: string; amountPaise: string; dueOn: string; status: string }>(sql`
        select i.id, i.invoice_no as "invoiceNo", v.name as vendor, v.msme_udyam_no as udyam, v.msme_category as category, (i.amount_paise - i.debit_paise) as "amountPaise", i.due_on::text as "dueOn", i.status
        from inv_invoices i join inv_vendors v on v.id = i.vendor_id
        where v.msme_category in ('micro', 'small') and i.status <> 'paid' and i.due_on is not null order by i.due_on`);
      const lines = rows.map((r) => ({ ...r, amountPaise: Number(r.amountPaise), overdueDays: Math.max(0, daysBetween(r.dueOn, today)) }));
      return { asOn: today, lines, overduePaise: lines.filter((l) => l.overdueDays > 0).reduce((s, l) => s + l.amountPaise, 0) };
    });
  }
}

/** Asset reports: depreciation registers, laboratory equipment and NAAC 4.1 and 4.4. */
@Controller('v1/assets/reports')
export class AssetReportsController {
  constructor(
    private readonly db: DbService,
    private readonly proc: ProcurementService,
  ) {}

  private async assetRows(tx: Tx) {
    const { rows } = await tx.execute<{ id: string; tag: string; name: string; category: string; costPaise: string; salvagePaise: string; usefulLifeYears: number; method: string; wdvRatePct: string | null; purchasedOn: string; putToUseOn: string | null; disposedOn: string | null; disposalPaise: string | null; itBlock: string | null; department: string | null }>(sql`
      select a.id, a.tag, a.name, a.category, a.cost_paise as "costPaise", a.salvage_paise as "salvagePaise", a.useful_life_years as "usefulLifeYears", a.method, a.wdv_rate_pct as "wdvRatePct", a.purchased_on::text as "purchasedOn", a.put_to_use_on::text as "putToUseOn", a.disposed_on::text as "disposedOn", a.disposal_paise as "disposalPaise", a.it_block as "itBlock", d.name as department
      from assets a left join departments d on d.id = a.department_id order by a.tag`);
    return rows.map((r) => ({ ...r, costPaise: Number(r.costPaise), salvagePaise: Number(r.salvagePaise), wdvRatePct: r.wdvRatePct === null ? null : Number(r.wdvRatePct), disposalPaise: r.disposalPaise === null ? null : Number(r.disposalPaise), putToUseOn: r.putToUseOn ?? r.purchasedOn }));
  }

  /**
   * The depreciation register of a financial year: each asset under the Companies Act (opening, additions, depreciation
   * by days in use, disposals, closing), and the Income-tax Act statement by block (opening WDV, additions over and
   * under 180 days, sale money, depreciation, closing WDV).
   */
  @Get('depreciation')
  @Auth('user', REPORT_ROLES)
  depreciation(@CurrentPrincipal() p: UserPrincipal, @Query('fy') fyQ?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const fy = fyQ ? Fy.parse(fyQ) : fyOf(await this.proc.today(tx));
      const list = (await this.assetRows(tx)).filter((a) => a.putToUseOn <= fyEndOf(fy) && (!a.disposedOn || a.disposedOn >= fyStartOf(fy)));
      const companies = list.map((a) => {
        const y = companiesActSchedule(a, fy).find((r) => r.fiscalYear === fy);
        const addition = fyOf(a.putToUseOn) === fy;
        return { id: a.id, tag: a.tag, name: a.name, category: a.category, department: a.department, method: a.method, usefulLifeYears: a.usefulLifeYears, putToUseOn: a.putToUseOn, days: y?.days ?? 0, openingPaise: addition ? 0 : (y?.openingPaise ?? 0), additionPaise: addition ? a.costPaise : 0, depreciationPaise: y?.depreciationPaise ?? 0, disposedOn: a.disposedOn && fyOf(a.disposedOn) === fy ? a.disposedOn : null, closingPaise: a.disposedOn && fyOf(a.disposedOn) === fy ? 0 : (y?.closingPaise ?? a.costPaise) };
      });
      const all = await this.assetRows(tx);
      const blocks = itActBlocks(all.map((a) => ({ block: a.itBlock ?? itBlockFor(a.category), costPaise: a.costPaise, putToUseOn: a.putToUseOn, disposedOn: a.disposedOn, disposalPaise: a.disposalPaise })), fy);
      const t = (k: 'openingPaise' | 'additionPaise' | 'depreciationPaise' | 'closingPaise') => companies.reduce((s, r) => s + r[k], 0);
      return { fiscalYear: fy, companiesAct: { assets: companies, totals: { openingPaise: t('openingPaise'), additionPaise: t('additionPaise'), depreciationPaise: t('depreciationPaise'), closingPaise: t('closingPaise') } }, incomeTaxAct: { blocks, rates: IT_BLOCKS, depreciationPaise: blocks.reduce((s, b) => s + b.depreciationPaise, 0) } };
    });
  }

  /**
   * Laboratory equipment registers (AICTE norms, NAAC 4.1.1): each laboratory with its equipment (make, model, serial,
   * cost, date, working or not, service and calibration due, AMC or warranty), and its consumables store.
   */
  @Get('labs')
  @Auth('user', NAAC_ROLES)
  labs(@CurrentPrincipal() p: UserPrincipal, @Query('roomId') roomId?: string) {
    const room = uuidOr(roomId);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await this.proc.today(tx);
      const { rows } = await tx.execute<{ roomId: string | null; room: string | null; capacity: number | null; department: string | null; id: string; tag: string; name: string; make: string | null; model: string | null; serialNo: string | null; costPaise: string; purchasedOn: string; status: string; working: boolean; vendor: string | null; nextServiceOn: string | null; calibrationDueOn: string | null; warrantyUntil: string | null; amcUntil: string | null }>(sql`
        select r.id as "roomId", r.name as room, r.capacity, d.name as department, a.id, a.tag, a.name, a.make, a.model, a.serial_no as "serialNo", a.cost_paise as "costPaise", a.purchased_on::text as "purchasedOn", a.status, a.working, v.name as vendor,
          (select max(m.next_due_on)::text from asset_maintenance m where m.asset_id = a.id) as "nextServiceOn", a.calibration_due_on::text as "calibrationDueOn", a.warranty_until::text as "warrantyUntil",
          (select max(c.ends_on)::text from amc_contracts c where c.asset_id = a.id and c.status = 'active') as "amcUntil"
        from assets a left join rooms r on r.id = a.room_id left join departments d on d.id = a.department_id left join inv_vendors v on v.id = a.vendor_id
        where (a.lab_equipment or r.kind = 'lab') and a.status <> 'disposed' and (${room}::uuid is null or a.room_id = ${room}::uuid)
        order by r.name nulls last, a.name, a.tag`);
      const labs = new Map<string, { roomId: string | null; room: string; capacity: number | null; department: string | null; equipment: unknown[]; costPaise: number; working: number; notWorking: number; dueSoon: number }>();
      const soon = new Date(Date.parse(`${today}T00:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10);
      for (const r of rows) {
        const k = r.roomId ?? 'none';
        const cur = labs.get(k) ?? { roomId: r.roomId, room: r.room ?? 'Not placed in a room', capacity: r.capacity, department: r.department, equipment: [], costPaise: 0, working: 0, notWorking: 0, dueSoon: 0 };
        const working = r.working && r.status === 'active';
        const due = [r.nextServiceOn, r.calibrationDueOn].some((d) => d && d <= soon);
        cur.equipment.push({ ...r, costPaise: Number(r.costPaise), working, cover: r.amcUntil && r.amcUntil >= today ? 'amc' : r.warrantyUntil && r.warrantyUntil >= today ? 'warranty' : 'none', due });
        cur.costPaise += Number(r.costPaise);
        cur[working ? 'working' : 'notWorking']++;
        if (due) cur.dueSoon++;
        labs.set(k, cur);
      }
      return { asOn: today, labs: [...labs.values()], totals: { labs: labs.size, equipment: rows.length, costPaise: rows.reduce((s, r) => s + Number(r.costPaise), 0) } };
    });
  }

  /**
   * NAAC 4.1 and 4.4 for the five years ending with `fy`: spending, excluding salary, on augmenting infrastructure
   * (assets put to use: buildings, labs, IT, furniture, library) and on maintaining physical and academic facilities
   * (repairs and servicing, AMCs, facility tickets), with each as a percentage of the year's spending excluding salary
   * (from the books when they have it; otherwise left blank for the IQAC to fill from audited accounts).
   */
  @Get('naac')
  @Auth('user', NAAC_ROLES)
  naac(@CurrentPrincipal() p: UserPrincipal, @Query('fy') fyQ?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const fy = fyQ ? Fy.parse(fyQ) : fyOf(await this.proc.today(tx));
      const years = lastFiveFys(fy);
      const from = fyStartOf(years[0]);
      const to = fyEndOf(fy);
      const fyExpr = (col: string) => sql.raw(`(extract(year from ${col})::int - case when extract(month from ${col}) < 4 then 1 else 0 end)`);
      const { rows: infra } = await tx.execute<{ y: number; head: string; paise: string }>(sql`
        select ${fyExpr("coalesce(a.put_to_use_on, a.purchased_on)")} as y,
          case when a.lab_equipment or r.kind = 'lab' then 'Laboratory equipment' when ${sql.raw("lower(a.category)")} ~ '(computer|it |laptop|server|software|smartboard|projector|printer)' then 'Computers and IT' when ${sql.raw("lower(a.category)")} ~ 'furniture' then 'Furniture' when ${sql.raw("lower(a.category)")} ~ '(book|library)' then 'Library' when ${sql.raw("lower(a.category)")} ~ '(building|civil)' then 'Buildings' else 'Other equipment' end as head,
          sum(a.cost_paise)::bigint as paise
        from assets a left join rooms r on r.id = a.room_id where coalesce(a.put_to_use_on, a.purchased_on) between ${from}::date and ${to}::date group by 1, 2`);
      const { rows: maint } = await tx.execute<{ y: number; head: string; paise: string }>(sql`
        with m as (
          select am.done_on as d, case when a.lab_equipment or ${sql.raw("lower(a.category)")} ~ '(computer|it |laptop|server|smartboard|projector|lab|book)' then 'academic' else 'physical' end as head, am.cost_paise as paise
            from asset_maintenance am join assets a on a.id = am.asset_id where am.cost_paise > 0
          union all select c.starts_on, case when a.id is not null and (a.lab_equipment or ${sql.raw("lower(coalesce(a.category, ''))")} ~ '(computer|it |laptop|server|smartboard|projector|lab)') then 'academic' else 'physical' end, c.cost_paise
            from amc_contracts c left join assets a on a.id = c.asset_id where c.status <> 'cancelled' and c.cost_paise > 0
          union all select (t.resolved_at at time zone 'Asia/Kolkata')::date, case when t.category in ('it', 'lab') then 'academic' else 'physical' end, t.cost_paise
            from maintenance_tickets t where t.resolved_at is not null and t.cost_paise > 0
        )
        select ${fyExpr('d')} as y, head, sum(paise)::bigint as paise from m where d between ${from}::date and ${to}::date group by 1, 2`);
      // Spending excluding salary from the books: expense accounts other than salaries and depreciation (a non-cash charge), plus capital additions.
      const { rows: books } = await tx.execute<{ y: number; paise: string }>(sql`
        select ${fyExpr('v.voucher_date')} as y, sum(l.debit_paise - l.credit_paise)::bigint as paise
        from acct_voucher_lines l join acct_vouchers v on v.id = l.voucher_id join acct_accounts a on a.id = l.account_id
        where v.voided_at is null and not v.is_closing and a.group_type = 'expense' and a.code not in ('5000', '5300') and v.voucher_date between ${from}::date and ${to}::date group by 1`);
      const label = (y: number) => `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
      const out = years.map((year) => {
        const y = Number(year.slice(0, 4));
        const heads = infra.filter((r) => Number(r.y) === y).map((r) => ({ head: r.head, paise: Number(r.paise) }));
        const augmentation = heads.reduce((s, h) => s + h.paise, 0);
        const physical = maint.filter((r) => Number(r.y) === y && r.head === 'physical').reduce((s, r) => s + Number(r.paise), 0);
        const academic = maint.filter((r) => Number(r.y) === y && r.head === 'academic').reduce((s, r) => s + Number(r.paise), 0);
        const revenue = Number(books.find((r) => Number(r.y) === y)?.paise ?? 0);
        const total = revenue > 0 ? revenue + augmentation : null;
        const pct = (n: number) => (total ? Math.round((n * 10_000) / total) / 100 : null);
        return { fiscalYear: label(y), augmentationPaise: augmentation, augmentationHeads: heads, maintenancePhysicalPaise: physical, maintenanceAcademicPaise: academic, maintenancePaise: physical + academic, totalNonSalaryPaise: total, augmentationPct: pct(augmentation), maintenancePct: pct(physical + academic) };
      });
      const avg = (k: 'augmentationPct' | 'maintenancePct') => { const xs = out.map((r) => r[k]).filter((x): x is number => x !== null); return xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 100) / 100 : null; };
      return { fiscalYear: fy, metric41: '4.1.2 Expenditure, excluding salary, for infrastructure augmentation', metric44: '4.4.1 Expenditure on maintenance of infrastructure (physical and academic support facilities), excluding salary', years: out, average: { augmentationPct: avg('augmentationPct'), maintenancePct: avg('maintenancePct') } };
    });
  }
}
