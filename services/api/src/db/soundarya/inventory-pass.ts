/**
 * The stores, purchase and asset pass on the demo college: HSN codes and GST rates on the item master, vendors with
 * their GST state and MSME registration (one in Maharashtra, so its supplies carry IGST), a value and cost layers on
 * every stock row (received over the last two years, so ageing and dead stock show), a hostel mess store and an
 * aviation lab store whose provisions and consumables are kept by batch with expiry (one batch expired, one expiring),
 * issue slips to departments, a write-off approved last month and one waiting, an inter-state order received with a
 * batch and a rejected lot, its invoice with IGST posted to the books and paid, an MSME invoice overdue, lab equipment
 * registers with calibration dates, and five years of asset additions and maintenance for NAAC 4.1 and 4.4.
 */
import type { Ctx } from './ctx.js';
import { addDays, at, rupees } from './kit.js';

const fyOf = (d: string) => {
  const y = Number(d.slice(0, 4));
  const s = Number(d.slice(5, 7)) >= 4 ? y : y - 1;
  return `${s}-${String((s + 1) % 100).padStart(2, '0')}`;
};

/** GST, HSN and last price by item code for the items the inventory stage made. */
const ITEM_TAX: Record<string, [hsn: string, gst: number, pricePaise: number]> = { 'STN-001': ['4802', 18, 30_000], 'CMP-004': ['8443', 18, 2_80_000], 'ELC-002': ['8414', 18, 2_10_000] };
const byCategory: Record<string, [string, number, number]> = {
  Stationery: ['4820', 18, 9_000],
  IT: ['8471', 18, 45_000],
  Sports: ['9506', 12, 60_000],
  Electrical: ['8539', 18, 21_000],
  Housekeeping: ['3402', 18, 12_000],
  Furniture: ['9403', 18, 2_60_000],
  'Lab consumables': ['3814', 18, 32_000],
};

export async function inventoryPass(c: Ctx): Promise<void> {
  const { kit: k } = c;
  const t = c.tenantId;
  const sk = c.byEmail.stores.id;
  const principal = c.byEmail.principal.id;
  const accounts = c.byEmail.accounts.id;
  const warden = c.byEmail.warden.id;
  const today = c.today;
  const d = (n: number) => addDays(today, n);

  // ---- item master: HSN, GST, a price for every item -----------------------------------------------------------------
  const items = await k.q<{ id: string; sku: string; name: string; category: string; lastPricePaise: string }>('select id, sku, name, category, last_price_paise as "lastPricePaise" from inv_items where tenant_id = $1 order by sku', [t]);
  for (const it of items) {
    const [hsn, gst, price] = ITEM_TAX[it.sku] ?? byCategory[it.category] ?? ['4820', 18, 10_000];
    await k.q('update inv_items set hsn_code = $2, gst_rate_pct = $3, last_price_paise = case when last_price_paise > 0 then last_price_paise else $4 end, item_type = $5 where id = $1', [it.id, hsn, gst, price, it.category === 'Furniture' ? 'durable' : 'consumable']);
  }

  // ---- vendors: GST state, MSME, an inter-state mill ------------------------------------------------------------------
  await k.q("update inv_vendors set state_code = substr(gstin, 1, 2), gst_registration = case when gstin is null then 'unregistered' else 'regular' end where tenant_id = $1", [t]);
  await k.q("update inv_vendors set msme_category = 'micro', msme_udyam_no = 'UDYAM-KA-03-0012345', payment_terms_days = 30 where tenant_id = $1 and name = 'Peenya Electricals'", [t]);
  await k.q("update inv_vendors set msme_category = 'small', msme_udyam_no = 'UDYAM-KA-03-0045678', payment_terms_days = 45 where tenant_id = $1 and name = 'Kaveri Furniture Works'", [t]);
  const [mill] = await k.ins<{ id: string }>('inv_vendors', [{ name: 'Mumbai Paper Mills', gstin: '27AAPFU0939F1ZV', pan: 'AAPFU0939F', stateCode: '27', gstRegistration: 'regular', msmeCategory: 'micro', msmeUdyamNo: 'UDYAM-MH-19-0004567', paymentTermsDays: 45, phone: '+912222334455', email: 'orders@mumbaipaper.demo.zynetix.in', contactPerson: 'Rohit Shah', address: 'MIDC Andheri East, Mumbai 400093', active: true }]);
  const [provisions] = await k.ins<{ id: string }>('inv_vendors', [{ name: 'Annapoorna Provision Stores', gstin: '29AAHFA5521K1ZC', pan: 'AAHFA5521K', stateCode: '29', gstRegistration: 'regular', phone: '+919845077001', email: 'annapoorna@demo.zynetix.in', contactPerson: 'Shivakumar', address: 'KR Market, Bengaluru', active: true }]);
  void provisions;

  // ---- values and cost layers on the stock the inventory stage put in -------------------------------------------------
  await k.q('update inv_stock s set value_paise = s.qty * i.last_price_paise from inv_items i where i.id = s.item_id and s.tenant_id = $1', [t]);
  // Receipts spread over two years (for ageing), issues over the term; two items left untouched for over a year (dead stock).
  const moves = await k.q<{ id: string; itemId: string; delta: number; kind: string }>('select id, item_id as "itemId", delta, kind from inv_stock_moves where tenant_id = $1 order by item_id, kind', [t]);
  const ix = new Map(items.map((it, i) => [it.id, i]));
  const ageDays = [12, 45, 75, 120, 200, 260, 330, 30, 60, 95, 150, 420, 460, 18, 25];
  for (const m of moves) {
    const i = ix.get(m.itemId) ?? 0;
    const dead = i === 11 || i === 12;
    const days = m.kind === 'grn' ? ageDays[i % ageDays.length] : dead ? ageDays[i % ageDays.length] - 10 : Math.max(1, Math.floor(ageDays[i % ageDays.length] / 3));
    await k.q('update inv_stock_moves m set created_at = $2, value_paise = m.delta * i.last_price_paise, unit_cost_paise = i.last_price_paise from inv_items i where i.id = m.item_id and m.id = $1', [m.id, at(d(-days), '11:00')]);
  }
  await k.q(
    `insert into inv_stock_layers (tenant_id, store_id, item_id, received_on, qty_in, qty_left, unit_cost_paise)
     select s.tenant_id, s.store_id, s.item_id, coalesce((select min((m.created_at at time zone 'Asia/Kolkata')::date) from inv_stock_moves m where m.store_id = s.store_id and m.item_id = s.item_id and m.delta > 0), $2::date), s.qty, s.qty, i.last_price_paise
     from inv_stock s join inv_items i on i.id = s.item_id where s.tenant_id = $1 and s.qty > 0`,
    [t, today],
  );

  // ---- the hostel mess store and the aviation lab store, kept by batch ----------------------------------------------
  const [mess, lab] = await k.ins<{ id: string }>('inv_stores', [
    { name: 'Hostel Mess Store', kind: 'mess', location: 'Boys hostel, ground floor', custodianUserId: warden },
    { name: 'Aviation Lab Store', kind: 'lab', location: 'Aviation Simulation Lab', departmentId: c.departments['Aviation Studies'] ?? null },
  ]);
  type Def = [sku: string, name: string, category: string, unit: string, hsn: string, gst: number, type: string, shelf: number | null, reorder: number];
  const defs: Def[] = [
    ['MES-RIC', 'Sona Masoori rice (25 kg bag)', 'Mess provisions', 'bag', '1006', 5, 'provision', 365, 20],
    ['MES-DAL', 'Toor dal (30 kg)', 'Mess provisions', 'bag', '0713', 5, 'provision', 270, 6],
    ['MES-OIL', 'Sunflower oil (15 litre tin)', 'Mess provisions', 'nos', '1512', 5, 'provision', 270, 8],
    ['MES-MLK', 'Milk powder (1 kg)', 'Mess provisions', 'pack', '0402', 5, 'provision', 180, 15],
    ['LAB-IPA', 'Isopropyl alcohol 99% (500 ml)', 'Lab consumables', 'bottle', '2905', 18, 'chemical', 730, 10],
    ['LAB-HYD', 'Hydraulic fluid MIL-H-5606 (1 litre)', 'Lab consumables', 'litre', '2710', 18, 'chemical', 1095, 6],
  ];
  const newItems = await k.ins<{ id: string; sku: string }>('inv_items', defs.map(([sku, name, category, unit, hsnCode, gst, itemType, shelfLifeDays, reorderLevel]) => ({ sku, name, category, unit, hsnCode, gstRatePct: gst, itemType, shelfLifeDays, reorderLevel, reorderQty: reorderLevel * 2, batchTracked: true, valuation: itemType === 'chemical' ? 'fifo' : 'weighted_average', active: true })));
  for (const cat of ['Mess provisions', 'Lab consumables']) await k.q('insert into inv_categories (tenant_id, name) values ($1, $2) on conflict do nothing', [t, cat]);
  const it = (sku: string) => newItems.find((x) => x.sku === sku)!.id;
  // [sku, store, batch, received days ago, expiry offset from today, qty in, qty issued, unit ₹]
  type Batch = [string, string, string, number, number, number, number, number];
  const batches: Batch[] = [
    ['MES-RIC', mess.id, 'RIC-2608', 70, 230, 40, 28, 1_420],
    ['MES-RIC', mess.id, 'RIC-2610', 20, 330, 40, 6, 1_460],
    ['MES-DAL', mess.id, 'DAL-2607', 95, 150, 12, 9, 4_350],
    ['MES-OIL', mess.id, 'OIL-2609', 40, 200, 20, 11, 2_240],
    ['MES-MLK', mess.id, 'MLK-2604', 190, -10, 10, 6, 480], // expired ten days ago: 4 packs waiting to be written off
    ['MES-MLK', mess.id, 'MLK-2609', 35, 18, 30, 8, 495], // expiring in 18 days
    ['LAB-IPA', lab.id, 'IPA-25A', 300, 430, 24, 15, 310],
    ['LAB-HYD', lab.id, 'HYD-24B', 400, 690, 10, 2, 1_850],
  ];
  const slips: { store: string; dept: string | null; to: string; day: number; lines: { item: string; qty: number; value: number; batch: string; expiry: string }[] }[] = [];
  for (const [sku, store, batchNo, ago, exp, qty, issued, unit] of batches) {
    const on = d(-ago);
    const unitCost = rupees(unit);
    const [mv] = await k.ins<{ id: string }>('inv_stock_moves', [{ storeId: store, itemId: it(sku), delta: qty, kind: 'grn', refType: 'goods_receipt', note: 'Supply on the rate contract', createdBy: sk, createdAt: at(on, '10:30'), unitCostPaise: unitCost, valuePaise: qty * unitCost, batchNo, expiryOn: d(exp) }]);
    await k.ins('inv_stock_layers', [{ storeId: store, itemId: it(sku), batchNo, mfgOn: addDays(on, -15), expiryOn: d(exp), receivedOn: on, qtyIn: qty, qtyLeft: qty - issued, unitCostPaise: unitCost, sourceMoveId: mv.id }], { returning: false });
    const mess_ = store === mess.id;
    slips.push({ store, dept: mess_ ? null : (c.departments['Aviation Studies'] ?? null), to: mess_ ? 'Hostel kitchen' : 'Aviation Simulation Lab', day: Math.max(1, Math.floor(ago / 2)), lines: [{ item: it(sku), qty: issued, value: issued * unitCost, batch: batchNo, expiry: d(exp) }] });
  }
  // Stock rows with the value left in the layers.
  await k.q(
    `insert into inv_stock (tenant_id, store_id, item_id, qty, value_paise)
     select tenant_id, store_id, item_id, sum(qty_left)::int, sum(qty_left::bigint * unit_cost_paise) from inv_stock_layers where tenant_id = $1 and store_id in ($2, $3) group by tenant_id, store_id, item_id`,
    [t, mess.id, lab.id],
  );
  let iss = 0;
  for (const s of slips) {
    const number = `ISS-${String(++iss).padStart(4, '0')}`;
    const day = d(-s.day);
    const [slip] = await k.ins<{ id: string }>('inv_issue_slips', [{ number, storeId: s.store, departmentId: s.dept, issuedTo: s.to, receivedBy: s.store === mess.id ? 'Head cook Ramesh' : 'Lab instructor', purpose: s.store === mess.id ? 'Kitchen requirement for the week' : 'Simulator maintenance and cleaning', valuePaise: s.lines.reduce((x, l) => x + l.value, 0), lines: s.lines.length, createdBy: sk, createdAt: at(day, '09:15') }]);
    await k.ins('inv_stock_moves', s.lines.map((l) => ({ storeId: s.store, itemId: l.item, delta: -l.qty, kind: 'issue', refType: 'inv_issue_slip', refId: slip.id, issuedTo: s.to, departmentId: s.dept, note: number, createdBy: sk, createdAt: at(day, '09:15'), unitCostPaise: Math.round(l.value / l.qty), valuePaise: -l.value, batchNo: l.batch, expiryOn: l.expiry })), { returning: false });
  }

  // ---- write-offs: last month's approved, this month's waiting ----------------------------------------------------
  const woDay = d(-34);
  const [woMv] = await k.ins<{ id: string }>('inv_stock_moves', [{ storeId: mess.id, itemId: it('MES-DAL'), delta: -1, kind: 'write_off', refType: 'inv_write_off', note: 'WO-0001: bag torn, weevils found at inspection', createdBy: sk, createdAt: at(woDay, '16:00'), unitCostPaise: rupees(4_350), valuePaise: -rupees(4_350), batchNo: 'DAL-2607' }]);
  await k.q('update inv_stock_layers set qty_left = qty_left - 1 where tenant_id = $1 and batch_no = $2', [t, 'DAL-2607']);
  await k.q('update inv_stock set qty = qty - 1, value_paise = value_paise - $3 where tenant_id = $1 and item_id = $2', [t, it('MES-DAL'), rupees(4_350)]);
  const [wo1] = await k.ins<{ id: string }>('inv_write_offs', [
    { number: 'WO-0001', storeId: mess.id, itemId: it('MES-DAL'), batchNo: 'DAL-2607', qty: 1, kind: 'damaged', reason: 'Bag torn, weevils found at the weekly mess inspection', disposalMode: 'destroy', status: 'approved', valuePaise: rupees(4_350), proposedBy: sk, decidedBy: principal, decidedAt: at(woDay, '16:00'), decisionNote: 'Approved; ask the vendor for better packing', createdAt: at(addDays(woDay, -1), '12:00') },
    { number: 'WO-0002', storeId: mess.id, itemId: it('MES-MLK'), batchNo: 'MLK-2604', qty: 4, kind: 'expired', reason: 'Milk powder batch MLK-2604 expired ten days ago', disposalMode: 'destroy', status: 'proposed', proposedBy: sk, createdAt: at(d(-2), '11:00') },
  ]);
  await k.q('update inv_stock_moves set ref_id = $2 where id = $1', [woMv.id, wo1.id]);

  // ---- an inter-state order with IGST, received with a rejected lot, invoiced, posted and paid --------------------------
  const store = (await k.q<{ id: string }>("select id from inv_stores where tenant_id = $1 and name = 'Main Store'", [t]))[0].id;
  const paper = items.find((x) => x.sku === 'STN-001')!;
  const [req] = await k.ins<{ id: string }>('inv_requisitions', [{ number: 'REQ-0101', requestedBy: c.byEmail['hod.commerce'].id, reason: 'Answer booklets and record paper for the semester-end examinations', status: 'ordered', decidedBy: principal, decidedAt: at(d(-26)), departmentId: c.departments['Commerce'], estimatedPaise: rupees(48_000), budgetStatus: 'within', createdAt: at(d(-28)) }]);
  await k.ins('inv_requisition_lines', [{ requisitionId: req.id, itemId: paper.id, qty: 200, estUnitPaise: rupees(240) }], { returning: false });
  // 200 reams at ₹235: taxable 47,000, IGST 18% 8,460, total 55,460.
  const [po] = await k.ins<{ id: string }>('inv_purchase_orders', [{ number: 'PO-0101', requisitionId: req.id, vendorId: mill.id, storeId: store, status: 'received', totalPaise: rupees(55_460), taxablePaise: rupees(47_000), taxPaise: rupees(8_460), interState: true, departmentId: c.departments['Commerce'], createdBy: sk, createdAt: at(d(-25)), purchaseMode: 'gem', gemRef: 'GEMC-511687759920241', approvalStatus: 'approved', approvedBy: principal, approvedAt: at(d(-25), '15:00'), committeeMinutes: 'Purchase committee met and accepted the GeM L1 offer of Mumbai Paper Mills.', committeeMetOn: d(-26), committeeMembers: 'Principal; Bursar; HoD Commerce; Store keeper' }]);
  const [pl] = await k.ins<{ id: string }>('inv_po_lines', [{ poId: po.id, itemId: paper.id, qty: 200, unitPricePaise: rupees(235), receivedQty: 200, gstRatePct: 18, taxPaise: rupees(8_460) }]);
  const [grn] = await k.ins<{ id: string }>('inv_goods_receipts', [{ poId: po.id, receivedBy: sk, number: 'GRN-0101', challanNo: 'MPM/DC/4471', note: 'Two consignments', inspectedBy: c.byEmail['hod.commerce'].id, inspectionNote: 'Ten reams damp at one corner; returned with the lorry', receivedOn: d(-18), receivedAt: at(d(-18), '12:30') }]);
  await k.ins('inv_goods_receipt_lines', [{ receiptId: grn.id, poLineId: pl.id, qty: 200, rejectedQty: 10, rejectReason: 'Damp and wrinkled', batchNo: 'MPM-2610' }], { returning: false });
  // Landed cost 235 + 42.30 = 277.30; rejected 10 = 2,773 on a debit note.
  const landed = rupees(277.3);
  const [grnMv] = await k.ins<{ id: string }>('inv_stock_moves', [{ storeId: store, itemId: paper.id, delta: 200, kind: 'grn', refType: 'goods_receipt', refId: grn.id, note: 'PO-0101', createdBy: sk, createdAt: at(d(-18), '12:30'), unitCostPaise: landed, valuePaise: 200 * landed, batchNo: 'MPM-2610' }]);
  await k.ins('inv_stock_layers', [{ storeId: store, itemId: paper.id, batchNo: 'MPM-2610', receivedOn: d(-18), qtyIn: 200, qtyLeft: 200, unitCostPaise: landed, sourceMoveId: grnMv.id }], { returning: false });
  await k.q('update inv_stock set qty = qty + 200, value_paise = value_paise + $3 where tenant_id = $1 and item_id = $2 and store_id = $4', [t, paper.id, 200 * landed, store]);
  const [dn] = await k.ins<{ id: string }>('inv_debit_notes', [{ number: 'DN-0101', vendorId: mill.id, poId: po.id, receiptId: grn.id, amountPaise: 10 * landed, reason: 'Rejected at receipt GRN-0101: Damp and wrinkled', status: 'adjusted', createdBy: sk }]);
  // The invoice: 200 × 235 = 47,000 + IGST 8,460 = 55,460, matched; due in 45 days (micro enterprise).
  const invDay = d(-17);
  const [invoice] = await k.ins<{ id: string }>('inv_invoices', [{ poId: po.id, vendorId: mill.id, invoiceNo: 'MPM/26-27/1188', invoiceDate: invDay, amountPaise: rupees(55_460), expectedPaise: rupees(55_460), taxablePaise: rupees(47_000), igstPaise: rupees(8_460), dueOn: addDays(invDay, 45), status: 'paid', voucherNo: 'PV-0101', paidOn: d(-5), paymentMode: 'neft', paymentRef: 'HDFC N306126677812', debitPaise: 10 * landed, createdBy: accounts }]);
  await k.q('update inv_debit_notes set invoice_id = $2 where id = $1', [dn.id, invoice.id]);
  // An MSME invoice past its 45 days (section 43B(h)).
  const elec = (await k.q<{ id: string }>("select id from inv_vendors where tenant_id = $1 and name = 'Peenya Electricals'", [t]))[0].id;
  const tl = items.find((x) => x.category === 'Electrical') ?? items[6];
  const [po2] = await k.ins<{ id: string }>('inv_purchase_orders', [{ number: 'PO-0102', vendorId: elec, storeId: store, status: 'received', totalPaise: rupees(9_912), taxablePaise: rupees(8_400), taxPaise: rupees(1_512), createdBy: sk, createdAt: at(d(-70)), purchaseMode: 'direct', approvalStatus: 'not_required' }]);
  await k.ins('inv_po_lines', [{ poId: po2.id, itemId: tl.id, qty: 40, unitPricePaise: rupees(210), receivedQty: 40, gstRatePct: 18, taxPaise: rupees(1_512) }], { returning: false });
  await k.ins('inv_invoices', [{ poId: po2.id, vendorId: elec, invoiceNo: 'PE/2026/0931', invoiceDate: d(-62), amountPaise: rupees(9_912), expectedPaise: rupees(9_912), taxablePaise: rupees(8_400), cgstPaise: rupees(756), sgstPaise: rupees(756), dueOn: d(-32), status: 'matched', createdBy: accounts }], { returning: false });

  // ---- the books: the purchase journal, the payment voucher, last year's depreciation ---------------------------------
  const acct = async (code: string, name: string, group: string) => {
    await k.q('insert into acct_accounts (tenant_id, code, name, group_type) values ($1,$2,$3,$4) on conflict (tenant_id, code) do nothing', [t, code, name, group]);
    return (await k.q<{ id: string }>('select id from acct_accounts where tenant_id = $1 and code = $2', [t, code]))[0]?.id;
  };
  const A = { stores: await acct('1300', 'Stores and Inventory', 'asset'), creditors: await acct('2000', 'Sundry Creditors', 'liability'), bank: await acct('1010', 'Bank Account', 'asset'), dep: await acct('5300', 'Depreciation', 'expense'), acc: await acct('1210', 'Accumulated Depreciation', 'asset') };
  const voucher = async (type: string, date: string, narration: string, sourceType: string, sourceId: string, lines: [string, number, number][]) => {
    const fy = fyOf(date);
    const [{ n }] = await k.q<{ n: string }>('select count(*)::int as n from acct_vouchers where tenant_id = $1 and financial_year = $2 and voucher_type = $3', [t, fy, type]);
    const [row] = await k.q<{ id: string }>('insert into acct_vouchers (tenant_id, financial_year, voucher_type, number, voucher_date, narration, source_type, source_id, posted_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id', [t, fy, type, `${{ payment: 'P', journal: 'J' }[type]}/${fy}/${String(Number(n) + 1).padStart(5, '0')}`, date, narration, sourceType, sourceId, accounts]);
    for (const [id, dr, cr] of lines) await k.q('insert into acct_voucher_lines (tenant_id, voucher_id, account_id, debit_paise, credit_paise) values ($1,$2,$3,$4,$5)', [t, row.id, id, dr, cr]);
    return row.id;
  };
  const jv = await voucher('journal', invDay, 'Purchase: Mumbai Paper Mills invoice MPM/26-27/1188 on PO-0101', 'inv_invoice', invoice.id, [[A.stores, rupees(55_460), 0], [A.creditors, 0, rupees(55_460)]]);
  const pv = await voucher('payment', d(-5), 'PV-0101: paid Mumbai Paper Mills for invoice MPM/26-27/1188, less debit notes ₹2,773.00', 'inv_payment', invoice.id, [[A.creditors, rupees(55_460), 0], [A.bank, 0, rupees(55_460) - 10 * landed], [A.stores, 0, 10 * landed]]);
  await k.q('update inv_invoices set journal_voucher_id = $2, payment_voucher_id = $3 where id = $1', [invoice.id, jv, pv]);
  await k.q('update inv_debit_notes set voucher_id = $2 where id = $1', [dn.id, pv]);

  // ---- assets: put-to-use dates, Income-tax blocks, lab registers, five years of maintenance ---------------------------
  await k.q(
    `update assets set put_to_use_on = purchased_on, it_block = case
       when category in ('IT', 'AV') then 'computers' when category = 'Furniture' or category = 'Library' then 'furniture' when category = 'Vehicle' then 'vehicles' else 'plant' end,
       lab_equipment = category = 'Lab equipment' or name like '%Computer Lab%' where tenant_id = $1`,
    [t],
  );
  const room = (name: string) => c.rooms.find((r) => r.name === name)?.id ?? null;
  const labAssets: [string, string, string, string, string, string, number, number, number][] = [
    ['SIMS-LAB-101', 'Cessna 172 cockpit procedures trainer', 'Lab equipment', 'Aviation Simulation Lab', 'Frasca', 'FPT-172', 2021, 640000, 120],
    ['SIMS-LAB-102', 'Aircraft engine cut-section model (Lycoming O-320)', 'Lab equipment', 'Aviation Simulation Lab', 'Aerotech', 'CS-O320', 2022, 185000, -20],
    ['SIMS-LAB-103', 'Weather station with anemometer', 'Lab equipment', 'Aviation Simulation Lab', 'Davis', 'Vantage Pro2', 2023, 72000, 45],
    ['SIMS-LAB-201', 'Network training rack (switches, routers)', 'Lab equipment', 'Computer Lab 2', 'Cisco', 'CCNA kit', 2024, 310000, 200],
    ['SIMS-LAB-202', 'Dell Precision workstations (20 nos)', 'IT', 'Computer Lab 2', 'Dell', 'Precision 3660', 2025, 1680000, 300],
  ];
  const added = await k.ins<{ id: string; tag: string }>('assets', labAssets.map(([tag, name, category, location, make, model, year, cost, calib], i) => ({ tag, name, category, location, roomId: room(location), make, model, serialNo: `SN-${year}-${4100 + i}`, purchasedOn: `${year}-07-1${i}`, putToUseOn: `${year}-07-2${i}`, costPaise: rupees(cost), salvagePaise: rupees(Math.round(cost * 0.05)), usefulLifeYears: 10, method: 'slm', itBlock: category === 'IT' ? 'computers' : 'plant', labEquipment: true, working: i !== 1, status: i === 1 ? 'in_maintenance' : 'active', calibrationDueOn: d(calib), warrantyUntil: `${year + 3}-07-1${i}`, vendorId: elec, departmentId: c.departments[location.startsWith('Aviation') ? 'Aviation Studies' : 'Computer Applications'] ?? null })));
  const maint: [number, string, string, number, string][] = [
    [0, 'service', 'Annual calibration of flight instruments', 18_500, '2022-09-14'],
    [0, 'service', 'Annual calibration of flight instruments', 19_200, '2023-09-12'],
    [0, 'repair', 'Yoke potentiometer replaced', 7_800, '2024-02-03'],
    [0, 'service', 'Annual calibration of flight instruments', 20_100, '2024-09-10'],
    [0, 'service', 'Annual calibration of flight instruments', 21_000, '2025-09-09'],
    [1, 'repair', 'Cut-section model: propeller hub repaired', 12_400, d(-9)],
    [3, 'service', 'Rack re-cabled and firmware updated', 9_600, '2025-01-18'],
    [4, 'service', 'Workstation preventive maintenance', 14_200, '2026-05-22'],
  ];
  await k.ins('asset_maintenance', maint.map(([a, kind, description, cost, doneOn]) => ({ assetId: added[a].id, kind, description, costPaise: rupees(cost), doneOn, nextDueOn: kind === 'service' ? addDays(doneOn, 365) : null, createdBy: sk })), { returning: false });
  // Last year's depreciation journal (Companies Act) for the register's posted entries.
  const [{ dep }] = await k.q<{ dep: string }>("select coalesce(sum((lines->0->>'debitPaise')::bigint), 0)::bigint as dep from asset_gl_postings where tenant_id = $1 and kind = 'depreciation' and fiscal_year = '2025-26'", [t]);
  if (Number(dep) > 0) {
    const v = await voucher('journal', '2026-03-31', 'Depreciation 2025-26 on the asset register (Companies Act, Schedule II)', 'asset_depreciation', '2025-26:seed', [[A.dep, Number(dep), 0], [A.acc, 0, Number(dep)]]);
    await k.q("update asset_gl_postings set voucher_id = $2 where tenant_id = $1 and fiscal_year = '2025-26' and kind = 'depreciation'", [t, v]);
  }

  // ---- numbering continues after the seeded documents ---------------------------------------------------------------
  for (const [kind, lastNo] of [['ISS', iss], ['WO', 2], ['GRN', 101], ['DN', 101], ['PV', 101]] as [string, number][]) {
    await k.q('insert into doc_counters (tenant_id, kind, last_no) values ($1,$2,$3) on conflict (tenant_id, kind) do update set last_no = greatest(doc_counters.last_no, excluded.last_no)', [t, kind, lastNo]);
  }
  await k.q("insert into doc_counters (tenant_id, kind, last_no) values ($1,'PO',102), ($1,'REQ',101) on conflict (tenant_id, kind) do update set last_no = greatest(doc_counters.last_no, excluded.last_no)", [t]);
}
