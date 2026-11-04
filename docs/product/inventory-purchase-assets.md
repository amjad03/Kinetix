# Stores, purchase and assets: user guide

Who uses it: the **store keeper** (stores, receipts, issues, write-off proposals), **heads of department** (approve
their department's indents, in the ERP or the Teacher App), the **principal or administrator** (final approval,
write-offs, orders above the approval limit), the **accountant** (invoices, payments, the books, reports) and the
**IQAC** (lab registers, NAAC 4.1 and 4.4). Demo logins: `stores`, `hod.commerce`, `principal`, `accounts`, `iqac` at
`@soundarya.demo.zynetix.in` (docs/demo/SOUNDARYA_DEMO_LOGINS.md).

## Item master and stores (Inventory)

- **Items**: code, name, category, unit, **HSN code**, **GST rate**, **type** (consumable, lab chemical, mess
  provision, spare, durable), **kept by batch with expiry**, shelf life, **valuation** (weighted average or FIFO),
  reorder level and quantity. Import and export through the usual list tools.
- **Stores**: central, department, lab, **hostel mess** and hostel stores, each with a custodian.
- Every stock change is a ledger row with its cost. The **stock value** shows beside each quantity.
- When an item falls to its reorder level the store keepers get a notice; **Reorder** raises the indent.

## Buying

1. **Indent** (anyone on the staff; teachers also from the Teacher App → Profile → Indents). The head of department
   approves first (from the app too), then the principal, who sees the department's budget left this year.
2. **Quotations**: open an RFQ for the approved indent, enter each vendor's prices; the comparison ranks **L1, L2, L3**
   on the total with GST.
3. **Purchase order**: the mode (direct up to the limit, quotations, rate contract, **GeM** with its reference, tender)
   is checked against the purchase rules. GST is worked out per line: **CGST + SGST** when the vendor's GSTIN is in the
   institution's state (procurement settings, `institutionStateCode`), **IGST** otherwise.
4. **Receipt (GRN)**: what was accepted goes into the store at the landed cost (with GST, since a college takes no input
   credit unless the setting says so); what was refused at inspection goes on a **debit note**. Batch items need the
   batch number; expiry comes from the batch or the shelf life. **Durables** are registered as assets, one per unit.
5. **Invoice**: matched three ways (ordered price and GST, received quantity) within the tolerance; a difference waits
   for the principal. An accepted invoice is posted to the **books**: Stores and Inventory (or Fixed Assets) against
   Sundry Creditors. Micro and small enterprises get a due date of at most **45 days** (MSMED Act).
6. **Payment**: the payment voucher pays the invoice less the debit notes, and posts to the books.

Vendors: the **GSTIN is checked** (state, PAN, check character, and against the PAN when given); MSME vendors carry
their Udyam number. Ratings, blacklisting, rate contracts and approved vendors per category are on Purchase.

## Issues, batches and write-offs

- **Issue slips** (Inventory → Issue slips): up to three items to a department in one numbered slip; each leaves at its
  cost, the earliest-expiring batch first. Expired stock is never issued.
- **Batches and expiry**: every batch held, expired ones in red and those expiring soon (the inventory setting
  `expiryAlertDays`) in amber.
- **Write-offs**: the store proposes (expired, damaged, obsolete, lost, shortage, with the batch and how it is
  disposed of); the principal approves or rejects with a reason, never their own proposal. Only then does the stock
  leave.
- **Transfers** carry the batches and their cost to the other store. **Stock verification** closes with adjustments
  by an approver.
- **Post a month to the books** (Issue slips, for the principal): stores consumed and stock losses for a month that has
  ended.

## Assets

- Register with QR tags, room, department, custodian, warranty, AMC, maintenance, transfer, condemnation and write-off.
- **Depreciation** is posted under the **Companies Act** (Schedule II): from the day the asset was put to use,
  pro-rata by days, straight line or written-down value. The **Income-tax Act** block statement (WDV by block, half
  rate under 180 days) is a report.
- **Lab equipment** is marked on the asset; the lab registers show working status, next service and calibration.

## Reports (Stores and asset reports)

Stock summary with value, batches expiring, ageing, dead (non-moving) stock, purchase register with CGST, SGST and IGST
and the HSN summary, MSME dues, Companies Act and Income-tax Act depreciation, lab equipment registers, and NAAC 4.1.2
and 4.4.1 for five years. Filters (financial year, period, idle days, expiry window) are in the URL. Older registers
(stock register, durable articles, purchase orders, indents, debit notes) stay in Ops reports with Excel downloads.

## Settings

Inventory: negative stock, reorder alerts, issues only against an indent, write-offs need approval, expiry alert
days. Purchase: direct, quotation and tender limits, minimum quotations, invoice tolerance, approval limit, budget
check, institution GST state, GST input credit, posting to the books. Assets: capitalisation limit, register durables
from receipts.
