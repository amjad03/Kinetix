# Finance, people and communication audit (agent B)

Scope: Fees, Finance/accounts, Admissions, HR/payroll, Communication. Test DB: `zynetix_test_audit_fin`.
No migrations were needed (0224 and 0225 stay unused).

The pass was cut short by a hard stop. I read and tested payroll statutory arithmetic and the gateway refund
path in depth. Admissions, Communication and Finance books (vouchers, Tally, budgets) were **not audited** in this
pass, so this document makes no claim about them beyond what is listed.

## Fees (gateways, refunds, reconciliation)

| ID | Severity | Area | File:line | Issue | Status | Test |
|----|----------|------|-----------|-------|--------|------|
| FEE-1 | High | Gateway refund concurrency | services/api/src/fees/settlements.controller.ts:200-230 | `gatewayRefund` checked "already refunded + this ≤ paid" in one transaction **without a row lock**, called the gateway outside any transaction, then recorded the refund in a second transaction. Two refunds sent at once (a double click, two accountants) both passed the check and both reached the gateway. `issueRefund` then refused the second one ("more than was paid"), so money left the gateway with no refund, ledger entry or reopened invoice in ZYNETIX. The pre-check also counted reverted refunds, which `issueRefund` does not. | Fixed: one transaction takes `FOR UPDATE` on the payment, re-checks with reverted refunds excluded, calls the gateway, then records the refund. A gateway error rolls back with nothing recorded. | test/fees-gateways.e2e.spec.ts (Razorpay case): two concurrent refunds of the remaining amount give exactly one 201 and one 400, and exactly one call reaches the gateway |
| FEE-2 | Medium | Gateway refund idempotency | services/api/src/fees/settlements.controller.ts:219 | `refundRef` is `rf_<id>_<Date.now()>`, so if a client retries after a timeout the gateway gets a new refund reference and the retry is not idempotent there. The row lock (FEE-1) only blocks concurrent requests, not a retry after the first refund has committed. The amount check still caps the total at what was paid. | Open. Fix: take an `Idempotency-Key` header (or derive the key from payment id + refunded-so-far), pass it as the provider's refund idempotency key or receipt, and store it on `fee_refunds` with a unique index (needs a migration). | n/a |
| FEE-3 | Medium | Refund recorded after the gateway call | services/api/src/fees/settlements.controller.ts:213-224 | If the DB commit fails after the gateway has accepted the refund, the refund is not recorded. Settlement matching does flag it later as `refund_not_recorded` (settlements.controller.ts `match()`). The fix also keeps a DB connection open for the length of the gateway call, which is acceptable for an occasional admin action. | Open (risk reduced). Fix: write a `pending` refund intent before the call, then confirm or void it afterwards. | n/a |

Gateway webhook and callback crediting (`gateway-flow.service.ts:275-298`) was reviewed. It takes `FOR UPDATE` on the
payment, ignores events that are already `paid`, rejects amount mismatches and rejects events signed by the wrong
account. I found no double-credit path there.

## HR / payroll

| ID | Severity | Area | File:line | Issue | Status | Test |
|----|----------|------|-----------|-------|--------|------|
| HR-1 | High | TDS on one-off pay (sec. 192) | services/api/src/hr/payroll-math.ts:155-190, 290-322 | In a regular run, approved bonus, arrears, overtime and leave encashment were added to the month's taxable pay, and `monthlyTds` projects that figure **× the months left in the year**. A ₹1 lakh April bonus was treated as ₹12 lakh of extra annual income. Staff on ₹50,000 a month (no tax due) had TDS deducted, and staff on higher pay were heavily over-deducted. | Fixed: structure pay is projected; one-off pay is added once, and the extra tax it causes is deducted in full that month (the same method as `supplementaryTds`). | src/hr/payroll-math.spec.ts "taxes a one-off bonus once…": ₹6 lakh/yr + ₹1 lakh bonus gives TDS 0; ₹2 lakh/month + ₹1 lakh bonus gives 24,375 + 27,300 |
| HR-2 | Medium | ESI coverage | services/api/src/hr/payroll-math.ts:33-41, 299-302 | ESI cover was decided on what the month actually paid. Overtime (₹20,000 rate + ₹3,000 OT) took a covered employee out of ESI for that month, and loss of pay brought an uncovered employee in (₹24,000 rate with 8 LOP days paid ₹17,600). Coverage should follow the wage rate, and contributions should be on the actual wages. | Fixed: `esi()` takes the coverage wage separately; the payslip uses the structure's full-month rate. | payroll-math.spec.ts "decides ESI cover on the monthly wage rate…" |
| HR-3 | Medium | ESI contribution period | services/api/src/hr/payroll-math.ts:33-41 | ESI contribution periods (Apr–Sep and Oct–Mar) are not modelled. An employee whose rate goes above ₹21,000 mid-period should keep contributing until the period ends. | Open. Fix: record coverage at the start of each period on the staff profile and pass it to `esi()`. | n/a |
| HR-4 | Low | ESI wages and bonus | services/api/src/hr/payroll.service.ts:268 | An annual bonus counts as ESI and PT wages unless someone sets `wage: false` on the adjustment. ESI wages exclude bonus paid at intervals of more than two months. | Open. Fix: default `wage = false` for `kind = 'bonus'`. | n/a |
| HR-5 | Low | EPS eligibility | services/api/src/hr/payroll-math.ts:24-31 | EPS (8.33%) is always split out. Members who are not eligible (joined after 1 Sep 2014 with PF wage above ₹15,000, or aged 58 or over) should have EPS 0 and the full employer 12% credited to EPF. | Open. Fix: add an `epsEligible` flag to the staff profile and set EPS = 0 when it is false. | n/a |
| HR-6 | Low | Income tax coverage | services/api/src/hr/payroll-math.ts:132-140 | There is no surcharge (income above ₹50 lakh, with marginal relief) and no senior-citizen basic exemption under the old regime. FY 2026-27 slabs, the ₹75,000 standard deduction, the ₹12 lakh 87A rebate and marginal relief are all correct. | Open. Fix: add the surcharge table and age-based old-regime slabs. | n/a |

Checked and correct: PF ceiling ₹15,000 with EPS capped at ₹1,250; ESI rates 0.75%/3.25% rounded up; Karnataka PT
₹200 a month (₹300 in February) from ₹25,000; financial year April–March (`fyStart`, `monthsLeftInFy`); days in
month via UTC (leap years correct); new and old regime slabs and the 87A rebate; cess rounded to ₹10.

## Admissions, Communication, Finance books

Not audited in this pass (time box). Nothing is claimed for them here.

## Linways comparison (only features verified in code or tests this pass)

| Feature | Linways | ZYNETIX | Verdict |
|---------|---------|---------|---------|
| Multiple payment gateways (Razorpay, PayU, Cashfree, Easebuzz, CCAvenue) | Yes | Yes, per fee account, credentials encrypted (fees-gateways e2e) | Par |
| Gateway refunds from the ERP, safe against concurrent requests | Partial | Yes (after FEE-1) | Ahead |
| Settlement reconciliation with exceptions | Yes | Yes (`settlements.controller.ts` match: unknown, duplicate, amount mismatch, refund not recorded) | Par |
| Payroll PF/ESI/PT/TDS with old and new regime | Yes | Yes, with LOP proration, supplementary runs and LWF | Par |
| Correct TDS on bonus and arrears in a regular run | Yes | Yes (after HR-1) | Par |
| ECR file and Form 16 | Yes | Yes (`hr-rules.spec.ts` ECR, Form 16 PDF e2e) | Par |
| ESI contribution-period continuity | Yes | No (HR-3) | Behind |

Closed in this pass: FEE-1, HR-1, HR-2.

## Tests run

- `src/hr/payroll-math.spec.ts`: the two new tests failed before the fix and pass after it. All HR unit specs (`src/hr/`) passed.
- `test/fees-gateways.e2e.spec.ts`: in a run with the fix, the concurrent-refund assertion sat in the shared helper and passed in all five gateway flows. Cashfree and CCAvenue then failed their own later "last refund" checks, because the extra refund changed which refund was last. I moved the assertion into the Razorpay case alone and fixed a duplicate `const co` that this introduced (commit `263aed0`). **That final version has not been run**: my last run waited 400 s on the shared heavy lock and never started. The run against the old code (to show it fails there) was also stopped. Rerun the file before merging.
