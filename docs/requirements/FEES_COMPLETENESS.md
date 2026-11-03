# Fees, finance and accounts: completeness (checklist section 8 and the owner's list)

Audit of `docs/research/MODULE_DEPTH_CHECKLIST.md` section 8, `FEES_FINANCE_DETAILED_SPEC.md` and the owner-approved
extras in the fees brief, exercised against the Soundarya seed (API calls, 43 ERP pages with Playwright at 1280px and
390px, app widget tests). **Before** is the branch at `8429b7a` when this pass started; **after** is now. Evidence names
the code and the test that proves the item. User guide: [fees-payments.md](../architecture/fees-payments.md).
Screenshots: [docs/demo/screens/fees/](../demo/screens/fees/).

Status words: **Have** (built and tested before), **Built** (missing or partial before, built now), **Deepened** (existed;
gaps closed now), **Partial** (what is still missing is said).

Migrations: **0189** (fee accounts, gateway accounts per fee account, webhook events, payment links), **0190** (accrual
entries, settings basis/online/escalations, bank line matching, fee references, SSP fields, duplicate flags, programme
transfers), **0191** (reminder sends, Tally retry queue and company). The security audit's 0192 is merged on top.

New end-to-end files (in `services/api/test/`): `fees-gateways.e2e.spec.ts` (10 tests: every gateway's order,
checkout, signed webhook, replay, wrong signature, status poll, refund and settlement, against documented sandbox
payloads served locally) and `fees-flagship.e2e.spec.ts` (15 tests; the accrual invariant *receivable = outstanding*
is worked by hand in its comments).

## Summary

| | Items | Have before | Partial/missing before | Done after | Partial after |
|---|---|---|---|---|---|
| Checklist section 8 | 36 | 27 | 9 | 36 | 0 |
| Owner's extras | 40 | 6 | 34 | 39 | 1 |
| Audit findings for fees (security pass) | 4 | 0 | 4 | 4 | 0 |

## Checklist section 8

### Fee setup

| Item | Before | After | Evidence |
|---|---|---|---|
| Fee heads: priority, ledger mapping, GST flag, refundable flag | Have | Deepened: each head names its **fee account** | `fee-depth/fee.records.ts` (fee-heads), migration 0189; ERP `/fees/setup` |
| Fee structures by programme × batch × quota × category × term; bulk upload | Have | Deepened: structure names its fee account | `fee-depth/setup.service.ts`; `fee-depth.e2e.spec.ts` |
| Optional fees (transport, hostel, uniform, books) | Have | Deepened: hostel and transport heads post to the trust's account on the same ledger | seed `soundarya/fee-flagship.ts`; test "sets up two fee accounts with their own series, books, bank and UPI…" |
| Instalment plans with fines; custom plan with approval | Have | Have | `fee-depth` instalments, `fee_custom_plans`; `fee-depth.e2e.spec.ts` |
| Fine rules: per day, slab, cap, waivable | Have | Deepened: fines are accrual entries (kind `fine`) | `fees/accruals.ts`; flagship test "journalises a concession, a late fee and its waiver" |

### Assignment and concessions

| Item | Before | After | Evidence |
|---|---|---|---|
| Bulk assignment, re-assignment with delta, mid-year join pro rata | Partial: re-assignment delta on open invoices; no programme transfer | Built: **programme transfer** (preview, apply from a date, old charges reduced pro rata, new raised) and **readmission** (new structure, readmission fee, earlier dues kept) | `fee-flagship/flagship.controller.ts` transfer, `flagship.logic.ts` transferPlan, `fee_programme_transfers`; ERP TransferDialog; test "moves a student to another programme…" |
| Concession types, % or amount, per head | Have | Deepened: accrual kind `concession` | `fee-accounts.controller.ts` |
| Concession approval chain with limits | Have | Have | `fee-accounts/chains.ts`; `fee-accounts.e2e.spec.ts` |
| Government scholarship tracking with balance adjusted | Have (applied → sanctioned → received) | Deepened: Karnataka **SSP** and central portals, expected amount, verification, portal status import (CSV), held dues, partial receipts | see owner's list |
| Discount views | Have | Have | report `discounts` |

### Collection

| Item | Before | After | Evidence |
|---|---|---|---|
| Counter: cash, cheque, DD, card/POS, UPI; several modes on one receipt | Have | Deepened: **POS terminal** id with the slip reference; one receipt per fee account | `fee-depth/collection.service.ts`; `fee-depth.e2e.spec.ts` |
| Partial payment by head priority, manual allocation | Have | Have | `fees/fee-lines.ts`; `fees.e2e.spec.ts` |
| Bank challan and reconciliation upload | Have | Deepened: challans also matched from the **bank statement** (challan no., UTR, fee reference); account number encrypted | `fee-depth/bank-fees.ts`, `bank-numbers.ts`; flagship test "a bank statement receipts challans, NEFT…"; `fee-depth.e2e` challan test |
| Online through two or more gateways, convenience fee, webhook, auto receipt | Have (Razorpay, PayU) | Built: **five gateways** per institution and per fee account (see owner's list) | `fees-gateways.e2e.spec.ts` |
| Receipt series per head/account, cancellation with approval, duplicate print | Partial: one series per institution | Built: **series per fee account** (`SET/{FY}/`), cancellation and duplicate print unchanged | `fees/receipts.ts` nextReceiptNo; flagship test "one payment across two fee accounts makes one receipt per account…" |
| Cheque lifecycle, bounce reversal, penalty, notice | Have | Deepened: bounce charge is an accrual entry | `fee-accounts.controller.ts` |
| Advance kept in a wallet, used later | Have | Deepened: a duplicate kept as advance is journalled | `fees/duplicates.ts`; flagship test "flags a duplicate payment…" |
| Refunds: rule-based, approval, NEFT, revert | Have | Deepened: online refunds go back through the payment's own gateway; refund out of the fee account's bank | `settlements.controller.ts`, `finance.controller.ts`; flagship test "a withdrawal refund comes out of the trust's bank…" |
| Carry-forward; dues block hall tickets, results, TCs | Have | Deepened: carry-forward per fee account; held scholarship amounts do not block | `collection.controller.ts`, `dues.service.ts` |
| Day-end closing per cashier with denominations | Have | Have | `fee-accounts.logic.ts` denominationTotal; `fee-accounts.e2e.spec.ts` |
| Reminders on a schedule, defaulters list | Have | Deepened: **escalation steps** and defaulters with guardian contacts (see owner's list) | `fee-depth/dues.service.ts` |
| Parent and student fee view, history, receipt download | Partial: Parent App paid by Razorpay SDK on phones only; Student App read-only; no PDF in the apps | Built: both apps pay (full, instalment, part), every gateway through the browser launch page, receipts download as the office PDF | Parent `test/fees_test.dart` (17), Student `test/fee_pay_test.dart` (7) |

### Accounts

| Item | Before | After | Evidence |
|---|---|---|---|
| Chart of accounts, several banks, fund accounting (trust/college/hostel) | Partial: funds in the books, but one receipt series, one gateway and one bank for fees | Built: **fee accounts** with own fund, bank and cash ledgers, series, UPI ID, gateway and Tally company | `fee-flagship/fee-accounts.records.ts`, `fees/fee-accounts-core.ts`; ERP `/fees/setup?tab=accounts` (screenshot 01) |
| Vouchers with maker-checker | Have | Have | `acct_voucher_requests`; `fee-accounts.e2e.spec.ts` |
| Ledger, day/cash/bank book, TB, I&E, balance sheet, year close | Have | Deepened: per fee account (fund filter) | `fee-accounts-reads.controller.ts`; Playwright reports pages |
| Bank reconciliation with auto-match | Have | Deepened: fee credits matched and receipted | `fee-depth/bank-fees.ts` |
| Tally Prime: mapping, push or XML, sync log | Partial: push and XML, no retry, one company | Deepened: **retry queue** with back-off (hourly), per-account **company**, ledgers created first, public-address check | `tally/tally.controller.ts`, migration 0191; `gateway-books-tally-sso.e2e.spec.ts` |
| Budget per department with utilisation | Have | Have | `/budgets` |
| GST invoice for taxable services; 80G receipt | Have | Deepened: GST only on taxable heads checked in the flagship test; 80G from the fee account's registration | `fee-depth` gst_rate; flagship test |
| Gateway settlement reconciliation with exceptions | Have (Razorpay, PayU) | Deepened: all five gateways, per fee account, report *gateway-recon* | `settlements.controller.ts`; `fees-gateways.e2e` |
| Reports: by head/date/mode/cashier, ageing, registers, daily summary, structure print | Partial: no mode-wise, no ageing buckets, no defaulters with contacts | Built: see owner's list | `fee-flagship/reports.ts` |

## Owner's extras

### 1. Gateways behind one adapter

| Item | Before | After | Evidence |
|---|---|---|---|
| Razorpay | Have (SDK, webhook, refund, settlement) | Deepened: web checkout and return for browsers; per fee account | `fees/payment-provider.ts` |
| PayU | Partial: hosted checkout and webhook | Built: verify API status polling, refunds, settlements | `payment-provider.ts` PayuProvider; `fees-gateways.e2e` |
| Cashfree | Missing | Built: order, web SDK, signed webhook (timestamp+body), status, refund, settlements | `fees/gateways.ts`; `fees-gateways.e2e` |
| Easebuzz | Missing | Built: initiate, hosted page, SHA-512 hash, status, refund, settlements | same |
| CCAvenue | Missing | Built: AES-encrypted request/response with the working key, status, refund | same |
| Per institution and per fee account credentials, encrypted | Partial: one Razorpay row per institution | Built: one row per scope, AAD bound to the fee account, rotation | `payment-gateway.service.ts`, `db/rotate-secrets.ts`; ERP `/fees/gateways` (screenshot 02) |
| Webhook signature and idempotency | Have (Razorpay) | Built: every gateway; `gateway_webhook_events` unique key; replay ignored | `gateway-flow.service.ts`; each gateway's test ("…signed webhook once…") |
| Status polling | Missing | Built: on return, by the app, hourly job, give up after 72 h | `GatewayFlow.pollPending` |
| Refunds API | Have (Razorpay) | Built: all five | `fees-gateways.e2e` |
| Settlement import and reconciliation | Have (Razorpay, PayU) | Built: all five | same |
| Sandbox tests with mocked HTTP | Partial (Razorpay fake) | Built: `PAYMENT_GATEWAY_TEST_BASE` local stand-in with documented payloads | `fees-gateways.e2e.spec.ts` |

### 2. Paying

| Item | Before | After | Evidence |
|---|---|---|---|
| Parent App pays dues, chooses instalment, part if allowed | Partial: whole or typed amount, Razorpay on phones | Built | `apps/parent/lib/features/fees/fees_screen.dart` PaySheet; `fees_test.dart` |
| Student App pays | Missing (read-only) | Built | `apps/student/lib/features/fees/fee_pay.dart`; `fee_pay_test.dart` |
| Receipts list and PDF download in the apps | Partial: list only | Built | `GET /v1/fee-collect/family/payments/:id/receipt.pdf`; app tests |
| Payment links by SMS/WhatsApp/email with expiry | Missing | Built: create, resend, cancel, daily expiry, public page, rate limits, hashed token | `fees/payment-links.controller.ts`, `app/pay/[slug]/[token]`; flagship test; screenshots 03, 08 |
| Dynamic amount-bound UPI QR (NPCI intent) on invoices and receipts | Missing | Built | `fees/upi.ts`; ERP UpiQrDialog; flagship test "a family sees the amount-bound UPI QR of its own fee only" |
| Counter card/UPI POS reference | Partial: reference only | Built: terminal id | `collection.service.ts` |
| Bank challan / NEFT auto-matching from the statement | Partial: challan paid file only | Built: challan number, UTR, fee reference | `fee-depth/bank-fees.ts`; flagship test "a bank statement receipts challans, NEFT…" |

### 3. Accounts, scholarships, tax, reminders

| Item | Before | After | Evidence |
|---|---|---|---|
| Separate fee accounts per trust/institution (series, banks, gateway) | Missing | Built | see section 8 |
| Karnataka SSP and other scholarships: status, expected vs received, adjusting dues | Partial: generic applied/sanctioned/received | Built: SSP/NSP/central portals, verify, CSV status import, partial receipts, held dues, tracker report | `flagship.controller.ts` verify/import-status, `dues.service.ts`; flagship test "tracks a Karnataka SSP scholarship…"; screenshot 04 |
| GST only on taxable heads | Have | Have (checked) | flagship test |
| 80G receipts | Have (donations) | Deepened: registration from the fee account | `fee_accounts.reg_80g` |
| Hostel and transport fees on the same ledger | Partial | Built: heads on the trust's account, same invoices and dues | seed; flagship test |
| Configurable reminders before/on/after, escalations | Partial: fixed reminder runs | Built: steps with audience, channels, minimum; sent once; report | `dues.service.ts` escalate, `fee_reminder_sends`; flagship test "reminders follow the schedule…" |

### 4. Accounting

| Item | Before | After | Evidence |
|---|---|---|---|
| Auto double entry: receipt, refund | Have (cash basis) | Deepened: per fee account's fund and bank | `receipts.ts`, `books.service.ts` |
| Concession, waiver, fine, cheque bounce journals | Partial: on receipt only | Built: **accrual basis** from a set date; every charge and reduction posted; recalculation posts the difference | `fees/accruals.ts`, `fee_accruals`; flagship test "books each fee as it is charged…" (receivable = outstanding by hand) |
| Ledgers, TB, P&L, BS per fee account | Partial | Built | fund filter; Playwright |
| TallyPrime live sync, retry queue, mapping UI; Tally XML export | Partial | Built | `tally.controller.ts`; ERP `/tally` |
| Zoho Books export | Missing | Built: journal CSV | `GET /v1/books/zoho.csv`; ERP reports card |

### 5. Edge cases

| Item | Before | After | Evidence |
|---|---|---|---|
| Partial head-wise allocation | Have | Have | `fees.e2e` |
| Overpayment to advance | Have | Have | `fee-depth.e2e` |
| Mid-year structure change recalculation | Have | Deepened: accrual differences | flagship test |
| Programme transfer | Missing | Built | flagship test |
| Readmission dues | Missing | Built (readmission fee, earlier dues kept) | `flagship.controller.ts` |
| Discontinued refund rules | Have (refund bands) | Deepened: out of the fee account's bank, receivable square | flagship test |
| Cheque bounce penalty | Have | Deepened | as above |
| Duplicate payment detection | Missing | Built: three rules, review queue, resolutions journalled | `fees/duplicates.ts`; ERP `/fees/duplicates` (screenshot 06) |
| Day-end cash closing with denominations | Have | Have | `fee-accounts.e2e` |
| Receipt cancellation with approval and reason | Have | Have | `fee-accounts.e2e` |
| Integer paise everywhere | Have | Have: exact rupee parsing in gateway responses (`rupeesToPaise` string-based) | `payment-provider.ts` |

### 6. Reports

| Item | Before | After | Evidence |
|---|---|---|---|
| Daily collection | Have | Have | report `daily-collection` |
| Mode-wise | Missing | Built | `fee-flagship/reports.ts` |
| Head-wise | Have | Have | `head-collection` |
| Ageing | Partial: overdue total | Built: buckets current, 0–30, 31–60, 61–90, 90+ | screenshot 07 |
| Defaulters with contact | Partial: no contacts | Built: guardian, phone, email, last reminder, held amounts | screenshot 05 |
| Concession and scholarship registers | Have | Deepened: scholarship tracker | reports |
| Refund register | Have | Have | `refunds` |
| Gateway settlement reconciliation | Have | Deepened: five gateways | `gateway-recon` |
| GST | Have | Have | `gst` |
| Audit trail | Partial: per record history | Built: fee actions report | `audit-trail` |
| Payment links, reminders sent, duplicates, fee account summary | Missing | Built | reports |
| A part of the reports at 390px | — | **Partial**: wide registers scroll inside their table on phones (no page-level sideways scroll); they are read on a computer | Playwright 390px |

## Hardening

| Item | After | Evidence |
|---|---|---|
| Role checks | Gateways: principal and tenant admin; links, flags, transfers, reports: fee staff; pay: the student, guardians, fee staff; teachers refused | `fees-flagship.e2e` 403 cases |
| Tenant isolation | Every new table under row-level security (migrations' DO block); other institution's links, flags and accounts not visible | flagship test "reports: … another institution sees none of it"; `rls.e2e.spec.ts` |
| Ownership before gateway at checkout (audit finding 4) | Fixed | `fees.controller.ts` checkout; `fees.e2e` |
| Invoice list paged (audit finding 1) | Keyset cursor, `limit` ≤ 500; ERP pages through it | `fees.e2e` "issues a fee…" pages; `apps/erp/src/lib/fee-invoices.test.ts` |
| Fee summary not re-aggregated each call (audit finding 2) | Cached per institution, recomputed after a change | `src/fees/summary-cache.spec.ts` |
| Bank account numbers encrypted (audit finding 3) | Ledgers and challans sealed with the column-encryption helper, masked lists, rotation job | `fee-depth/bank-numbers.ts`, `db/rotate-secrets.ts`; `fee-depth.e2e` |
| Validation | zod on every body and query; amounts integer paise with caps | controllers |
| Idempotency | webhooks, links, receipts, reminder steps, accrual sync | unique indexes in 0189–0191 |
| No N+1 | per-account gateway names cached per request; reports single queries | `fees.controller.ts` students/:id, `reports.ts` |
| No secrets or PII in logs | gateway errors logged by code; secrets never returned; tokens hashed | `gateway-flow.service.ts`, `payment-links.controller.ts` |

## Tests

- API e2e (`zynetix_test_fees3`): fees-gateways 10, fees-flagship 15, fees 7, fee-depth 18, fee-accounts 10, payments 7,
  foundation 16, gateway-books-tally-sso 17, finance 6, security 10, rls 6: 122 tests, all passing. Unit: summary
  cache 2.
- ERP: `tsc` clean; vitest 87 files, 481 tests passing (new: `gateways.test.ts`, `fee-invoices.test.ts`).
- Flutter: Parent App fees 17 tests; Student App 352 tests including `fee_pay_test.dart` (7); `flutter analyze` clean.
- Playwright (`apps/erp/scripts/fees-qa.mjs`): 43 fee, accounts and finance pages at 1280px and 390px, 86 checks, no
  sideways scroll, no console errors (one data error in the seeded settings was found and fixed); 8 screenshots.

## Not done, and why

- **Live gateway calls**: every gateway is tested against its documented sandbox payloads with HTTP stood in locally;
  a live run needs each merchant's sandbox credentials, which the institution enters (no code change).
- **Cashfree's native SDK in the apps**: Cashfree (and PayU, Easebuzz, CCAvenue) open their hosted or web checkout in
  the browser from the apps; adding native SDKs would add four plugins to both apps for no change in what the payer sees.
- **Wide report registers on phones** scroll inside their table rather than reflowing (listed above).
