# Inventory, purchase and assets: completeness against Linways, Camu and Tally/ERPNext-level stores (checklist section 13 and the pass brief)

Audit of `docs/research/MODULE_DEPTH_CHECKLIST.md` section 13, `INVENTORY_PROCUREMENT_ASSET_DETAILED_SPEC.md` and the
inventory pass brief, read in code and exercised against the Soundarya seed (API on a seeded database, the ERP pages in
Playwright at 1280px and 390px with `apps/erp/scripts/inventory-qa.mjs`), API e2e and Teacher App widget tests.
**Before** is the branch at `5b13f65`.

Status words: **Have** (built and tested before), **Built** (missing, partial or broken before, built now),
**Deepened** (existed, gaps closed now). Migrations: `0208_inventory_valuation_batches`,
`0209_purchase_gst_books_assets`. New tests: `services/api/test/inventory-pass.e2e.spec.ts` (8 workflows, every figure
worked by hand in comments), `test/soundarya-inventory-pass.e2e.spec.ts` (seed: stock agrees with its layers, every
voucher balances), `src/inventory/stores.logic.spec.ts` (15 rules: GSTIN, GST split, FIFO/FEFO, weighted average,
ageing, Schedule II, IT Act blocks, MSME), `apps/erp/src/lib/inventory-pass.test.ts` (3),
`apps/teacher/test/indent_decision_test.dart` (2). Adjusted older tests: the depreciation test buys on 1 April (the
charge is now pro-rata by days), sample GSTINs carry a valid check character, a store keeper's immediate write-off now
needs the principal, and `procurement-depth` uses the IST day (it failed after 18:30 UTC).

Counts (52 items): before **27 Have, 13 Partial, 10 Missing, 2 Broken**; after **52 Done** (27 Have, 25 Built or Deepened).

## Item master and stock

| Item | Before | After | Evidence |
|---|---|---|---|
| Item master with categories, units, record kit (add, edit, history, bin, import, export) | Have | Have | `inventory.records.ts` `inv-items`, `inv-categories` |
| HSN code and GST rate on the item | Missing | Built | `inv_items.hsn_code`, `gst_rate_pct` (0208); HSN 4/6/8 digits, GST rate from the tariff (0, 0.1, 0.25, 1.5, 3, 5, 12, 18, 28, 40); kit fields, filters, import columns; test "checks GSTINs, PANs, HSN codes and GST rates" |
| Item type (consumable, lab chemical, mess provision, spare, durable) | Missing | Built | `item_type` (0208); durables go to the asset register on receipt |
| Multiple stores: central, department, lab, hostel mess, hostel | Partial: central, department, lab | Built | `STORE_KINDS` with `mess` and `hostel`; seed Hostel Mess Store and Aviation Lab Store |
| Stock ledger: every change a ledger row | Have | Deepened | `inv_stock_moves` now carries unit cost, signed value, batch and expiry; `GET /v1/inventory/reports/ledger` with running quantity and value |
| Valuation: FIFO or weighted average | Missing: quantity only, reports at the last price | Built | cost layers `inv_stock_layers` (0208), `stores.logic.ts` `drawLayers`/`issueCost`; item `valuation`; tests: 30 issued at average = ₹8,803.80, FIFO slip = ₹950 |
| Stock value beside each quantity | Missing | Built | `inv_stock.value_paise`, backfilled at the last price (0208); `GET …/reports/stock-summary` |
| Reorder levels and the reorder indent | Have | Have | `GET /v1/inventory/reorder`, `POST /reorder/indent` |
| Reorder alerts | Broken: the `reorderAlerts` setting existed and did nothing | Built | the move that takes an item to its level writes `inventory.reorder_level_reached`; `StockAlerts` tells every store keeper (not on transfers between stores); test checks one notice |
| Batch and expiry for lab chemicals and mess provisions | Missing | Built | `batch_tracked`, `shelf_life_days`; batch, manufacture and expiry at receipt (required for batch items); issued first-expiring first; expired stock refused (`STOCK_SHORT` with the expired count); `GET /v1/inventory/batches?expiring=N`; ERP **Batches and expiry** |

## Purchase cycle

| Item | Before | After | Evidence |
|---|---|---|---|
| Indent from a department, with an estimate | Have | Have | `POST /v1/inventory/requisitions`, ERP Indents, Teacher App indents |
| Budget-head check against the department's budget for the year | Have | Have | `budgetOf`, `BUDGET_EXCEEDED` with override and note |
| Approval chain: head of department, then the principal | Have | Deepened | notices to the next decider and the requester, `procurement.indent_decided` event; Teacher App: the head approves or rejects (reason) the department's indents |
| RFQ and quotations | Have | Have | `POST /rfqs`, `/rfqs/:id/quotes` |
| Quotation comparison, L1 | Partial: cheapest flagged, before GST | Deepened | quotes priced with GST (line rate or the item's; IGST for another state); comparative statement ranked L1, L2, L3 on the total with GST; test figures 16,320 / 18,502.40 / 18,880 |
| Purchase order with purchase modes (direct, quotations, rate contract, GeM, tender) | Have | Have | `purchaseModeProblem`, GeM and tender references |
| GST on the order: CGST and SGST within the state, IGST between states | Missing | Built | `inv_po_lines.gst_rate_pct`, `tax_paise`, `inv_purchase_orders.taxable_paise`, `tax_paise`, `inter_state` (0209); state from the vendor's GSTIN against `institutionStateCode`; amendments and their reversal recompute it |
| PO approval above a value, amendment back through approval, committee minutes | Have | Deepened | approvers notified of a waiting order or amendment; `procurement.po_approved` event |
| GRN with quality inspection and rejected goods | Partial: rejected quantity only | Deepened | `inspection_note`, `inspected_by`, `received_on` (0208); rejected goods to a debit note at the landed cost |
| Partial receipt, idempotent receipt | Have | Have | idempotency key; test repeats a receipt |
| Purchase invoice and three-way match | Partial: amount only, before GST | Deepened | expected = received quantity × order price + GST; taxable, CGST, SGST, IGST stored on the invoice (0209); tolerance from settings |
| Posting to the accounting books | Missing | Built | `purchase-books.ts`: purchase journal (Stores and Inventory, or Fixed Assets for durables and units at or above `capitaliseAbovePaise`; Input GST when `gstInputCredit`) against Sundry Creditors; payment voucher with debit notes set off; depreciation and disposal journals; month's stores journal; test checks every line of each voucher |
| Payment voucher, debit notes set off | Have | Deepened | now also a payment voucher in the books |
| GeM purchase reference | Have | Have | `gemRef` required for GeM orders |
| Vendor master with GST validation | Partial: 15 characters only | Built | `gstinProblem`: state code, PAN pattern, Z, check character, PAN match; state code and registration type derived (0209); kit `check`; import validated |
| Vendor rating and blacklist | Have | Have | `POST /vendors/:id/ratings`, `/blacklist` |
| MSME vendors and the 45-day rule | Missing | Built | Udyam number and category (0209); invoice due date by MSMED Act section 15; `GET …/reports/msme-dues` (section 43B(h)) |
| Rate contracts and approved vendors per category | Have | Deepened | "in force" now reads the IST day |

## Stock movement

| Item | Before | After | Evidence |
|---|---|---|---|
| Issue to departments | Partial: one item at a time, unnumbered | Built | numbered issue slips (ISS series) of several items, against an approved indent when `issueNeedsRequisition`; `inv_issue_slips` (0208), kit list `inv-issue-slips` |
| `issueNeedsRequisition` setting | Broken: had no effect | Built | single-item issue and slips without an indent refused with `ISSUE_NEEDS_INDENT` when on |
| Returns (from departments, to vendors) | Have | Deepened | an issue comes back at the cost it went out at |
| Inter-store transfer | Have | Deepened | batches and their cost travel with the goods |
| Stock verification with adjustment by an approver | Have | Deepened | adjustments valued at cost, may take expired stock |
| Scrap and disposal of stock with approval | Partial: immediate stock out | Built | write-offs (WO series) proposed by the store and approved by the principal (not the proposer), with kind, batch, disposal mode and amount realised; immediate stock out only for approvers while `writeOffNeedsApproval`; kit list `inv-write-offs`; ERP **Write-offs** |
| Gate register for goods and returnable items | Have | Have | `inv-gate-entries` |
| Consumption by department | Have | Deepened | valued at the issue cost, IST dates |

## Fixed assets

| Item | Before | After | Evidence |
|---|---|---|---|
| Asset register with tag, QR label, location, custodian | Have | Deepened | `custodian_user_id` (0209); durables received on an order registered one asset per unit with the order, vendor and receipt |
| Depreciation SLM/WDV under the Companies Act | Partial: whole years from purchase | Built | `companiesActSchedule`: from the day put to use, pro-rata by days in the year of addition and sale, never below residual, Schedule II WDV rate when none is set; postings use it; test: 1 Oct 2025 put to use → ₹9,473.97 |
| Depreciation under the Income-tax Act | Missing | Built | `itActBlocks`: block WDV, half rate under 180 days, sale money off the block, short-term gain; `it_block` per asset; `GET /v1/assets/reports/depreciation` |
| AMC and warranty tracking | Have | Deepened | coverage reads the IST day (was UTC) |
| Maintenance tickets with SLA | Have | Have | `maintenance-tickets` |
| Transfer and disposal (condemnation, write-off) | Have | Deepened | disposal posts to the books; `assets.disposed` event |
| Lab equipment registers for AICTE and NAAC | Missing | Built | `lab_equipment`, `working`, `calibration_due_on` (0209); `GET /v1/assets/reports/labs` by laboratory with service, calibration and cover |

## Reports

| Item | Before | After | Evidence |
|---|---|---|---|
| Stock summary | Partial: quantities, value at the last price | Built | `reports/stock-summary` by store, item and category, today or any day |
| Consumption | Have | Deepened | value at cost |
| Ageing | Missing | Built | `reports/ageing` from the layers (0–30 … over 365 days) |
| Dead (non-moving) stock | Partial: catalog report at the last price, UTC dates | Built | `reports/dead-stock?days=`; durables' dead-stock register stays in Ops reports |
| Purchase register | Partial: orders only | Built | `reports/purchase-register` with CGST, SGST, IGST and an HSN summary |
| NAAC 4.1 and 4.4 expenditure | Partial: amounts by year | Built | `reports/naac`: five years, augmentation by head, physical and academic maintenance, % of spending excluding salary from the books |
| Ops report catalog dates | Broken: UTC dates | Built | inventory and purchase catalog reports read IST dates and values at cost |

## Hardening

- **Roles**: every new endpoint has `@Auth` with the module's roles (store, accountant, approvers, IQAC and heads for
  NAAC and labs); the e2e refuses a teacher on every report, an accountant proposing a write-off, a head on the
  purchase register; the authorization matrix is regenerated.
- **Tenant isolation**: new tables have RLS (0208); the e2e shows another institution sees no slips, write-offs, stock or labs and gets 404 on an order.
- **Validation**: Zod on every body (GST rates, HSN, GSTIN, Udyam, months, quantities); query parameters parsed or ignored.
- **Money and dates**: integer paise everywhere, GST rounded per line, the odd paisa to SGST; IST for "today" and report days.
- **Idempotency**: receipts by key; payments refuse a second time; postings to the books by source (a re-run returns the first voucher).
- **No N+1 on lists**: kit lists paginate on the server; slips paginate.

## Not done

- Live GSTIN lookup against the GST portal (needs a GSP licence); the check is structural with the check character.
- E-invoice (IRN) for purchases: vendors issue it; the register keeps the invoice number.
