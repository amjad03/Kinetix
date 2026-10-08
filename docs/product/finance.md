# Finance: scholarships, budgets, GL export

All endpoints are under `/v1/finance`; the accounts office, principal and administrator use them (the same roles as fees). Amounts are integer paise.

## Scholarships and concessions
- **Schemes** (`scholarship_schemes`): a percentage off or a fixed amount off, with optional eligibility: a minimum average over *published* marks, a maximum declared family income, and an apply-until date. Closing a scheme hides it from families.
- **Apply:** a student or guardian applies for their own child (`POST /scholarships/apply`). Eligibility is checked on apply and again on approval. One open application per scheme and student.
- **Approve:** takes the discount off the student's open fees, oldest first (percentage of each open balance, or the fixed amount spread across them). Each invoice reduced is recorded on the application (`adjustments`, `awardedPaise`) and in the audit log. A fee reduced to what was already paid becomes paid. Fees issued after approval are not discounted.

## Budgets
- One budget per department (the cost centre) per financial year (April to March, "2026-27"): `PUT /budgets`, report `GET /budgets?fiscalYear=`.
- **Actuals** by source: purchase orders that name a department (`inv_purchase_orders.department_id`, cancelled ones excluded), payroll employer cost for approved or locked runs of staff in the department (a person in two departments counts in both), and **expenses** entered here (`POST /expenses`: events, travel, repairs). Variance = budget minus actual; used % = actual / budget.

## Refunds
`POST /refunds` refunds part or all of a paid fee payment (never more than was paid). The invoice's received amount goes down and it is due again if now short. Recorded in `fee_refunds`; the money movement itself happens outside KINETIX.

## GL export
Journal entries for a date range (`GET /gl`, `/gl.csv`, `/gl.xml`):
- each paid fee: Dr Cash (cash payments) or Bank Account, Cr Fee Income, numbered by receipt;
- each refund: Dr Fee Refunds, Cr Bank Account;
- each approved or locked payroll run whose month ends in the range: the same balanced journal as the payroll Tally export, with the ledger names from payroll settings.

Every voucher balances (checked before export). The XML is Tally "Import Data, Vouchers" format. Ledger names for fees are fixed (Cash, Bank Account, Fee Income, Fee Refunds): create them in Tally first or rename in the file. Each export is audited.

## Screens
ERP: Scholarships (applications and schemes), Budgets, GL export. Student App: More, Scholarships (open schemes, apply with income when the scheme tests it, status of applications).

Not built: scholarship funds with a budget cap, discounts on fees issued later, multi-level approval, per-category budgets, fixed-asset and vendor-payment journals.
