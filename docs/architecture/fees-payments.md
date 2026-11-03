# Fees and payments

User guide and design notes for fees, collection, online payments and the fee accounts' books. The audit of what is
built, item by item, is [FEES_COMPLETENESS.md](../requirements/FEES_COMPLETENESS.md); screenshots are in
[docs/demo/screens/fees/](../demo/screens/fees/).

## What it does

- The accounts office (role `accountant`, plus principal and admin) **issues fees** to a class, or charges fee
  structures (heads, instalments, concessions) to students. Families and students are notified ("Fee due: Semester 3
  tuition · ₹42,500 due by Thu 15 Oct").
- Families **pay online** in the Parent App and the Student App (the whole balance, the instalment due now, or a part
  when the institution allows it), through a **payment link** sent by SMS, WhatsApp or email, by scanning the **UPI QR**
  printed on the invoice, or at the **fees counter** (cash, cheque, DD, card or UPI on the POS machine, bank transfer; several
  modes on one receipt).
- Every payment gets a **receipt number** in its fee account's series and the Indian financial year
  (`RCPT/2026-27/00001`, `SET/2026-27/00001`). Receipts are never deleted: cancelling needs a reason and an approval.
- The office sees billed, collected, outstanding and overdue totals, ageing, defaulters with their guardians' contacts,
  and the books (ledgers, trial balance, income and expenditure, balance sheet) per fee account.

Amounts are stored as integer **paise** everywhere; dates are the institution's local (IST) dates.

## Fee accounts: the trust and the college keep separate books

A **fee account** (`fee_accounts`, ERP → Fees → Setup → *Fee accounts*) is one body that receives fees: the
institution, the trust that runs the hostel and buses, a sister school. Each has its own legal name, PAN, GSTIN, **80G
registration** (donation receipts), **receipt series** (`receiptPrefix`, e.g. `SET/{FY}/`, numbers restart each
financial year), **bank and cash ledgers**, **UPI ID** for QR codes, **Tally company**, a fund in the books, and
optionally **its own payment gateway**.

- Each **fee head** and **fee structure** names its fee account (hostel, mess and transport heads go to the trust); an
  invoice takes its head's account. One counter collection that covers heads of two accounts makes **one receipt per
  account**, each in its own series.
- Hostel and transport fees are on the **same ledger** as tuition: the same invoice, receipt and dues views, posted to
  the trust's books.
- Reports and the books filter by fee account (`account=` on every report).

## Online payments: five gateways behind one adapter

Supported: **Razorpay, PayU, Cashfree, Easebuzz and CCAvenue** (`src/fees/payment-provider.ts`, `src/fees/gateways.ts`).
Each institution, and each fee account that wants its own, enters **its own merchant credentials**; the money settles
straight into that body's bank account. ZYNETIX never holds the money and takes no commission.

```
App/link ── POST /v1/fees/invoices/:id/checkout {amountPaise?} ──► API picks the fee account's gateway (else the
            institution's), creates the order, stores a `created` payment and returns the order plus a launch link
App ── Razorpay SDK on phones, else the launch page in the browser (/v1/public/checkout/:slug/:paymentId?t=…,
       a short-lived signed link that auto-posts the gateway's hosted checkout or opens Cashfree's/Razorpay's web SDK)
Payer's browser ── gateway-return/:provider/:slug ──► API checks the gateway's signature or hash, then credits
Gateway ── POST /v1/fees/webhooks/:provider/:slug (signed) ──► credited once, whatever arrives first
App ── POST /v1/fees/payments/:id/refresh ──► API asks the gateway (status polling) when the payer comes back
Job ── fees.gateway_status (hourly) ──► asks about payments still pending; gives up after 72 hours (cancelled)
```

- **Signatures**: Razorpay HMAC-SHA256 (order|payment; webhook body), PayU SHA-512 reverse hash, Cashfree HMAC
  (timestamp + body, base64), Easebuzz SHA-512 response hash, CCAvenue AES-128 encrypted response with the working key.
  A body that does not verify is refused (401) and nothing changes.
- **Idempotency**: every webhook is recorded once (`gateway_webhook_events`, unique per institution, provider and
  event); marking a payment paid locks its row, so the app's confirmation, the browser return, the webhook and the poll can
  all arrive and the receipt is made once. The amount must match what was ordered.
- **Refunds** go back through the gateway of the payment's own fee account (`refund` API of each provider) and are
  journalled. **Settlements** are imported from each gateway's API or its settlement file and matched order → settlement
  → bank (exceptions queue: unknown payment, amount mismatch, not settled).
- **Credentials** (`payment_gateway_accounts`, one row per institution and per fee account): key id or merchant id,
  key secret / salt / working key and webhook secret, **encrypted at rest** (AES-256-GCM, `SECRETS_ENCRYPTION_KEY`, bound
  to the institution, the fee account and the field; rotated by `pnpm secrets:rotate`). Secrets are never returned;
  the ERP shows the last four characters. **Test or live** is set per gateway; tests run against each gateway's
  documented sandbox payloads with the HTTP calls stood in locally.
- **Managing them** (principal or tenant admin; ERP → Fees → *Online payments*): `GET/PUT/DELETE
  /v1/admin/payments/gateways[/:scope]`, `POST /v1/admin/payments/gateways/:scope/test` (a real call with the saved
  keys). The page shows the webhook address to paste into the gateway's dashboard.
- **Server modes**: `PAYMENTS_PROVIDER=razorpay` (production; any gateway; requires `SECRETS_ENCRYPTION_KEY`), `demo`
  (orders are made up, the apps show "Demo payment: no money moves"), `none` (counter only).
  `PAYMENT_GATEWAY_TEST_BASE` (tests and local e2e only) points every gateway's API at a local stand-in.
- **Ownership first**: checkout checks that the invoice belongs to the caller (the student, a guardian, or fee staff)
  before it says anything about the gateway setting.

### Onboarding an institution (or a fee account) for online payments

1. The body opens a merchant account **in its own name** with the gateway and completes its KYC; until activation it can
   use the gateway's test mode.
2. Copy the API credentials (Razorpay key id and secret; PayU key and salt; Cashfree app id and secret; Easebuzz key and
   salt; CCAvenue merchant id, access code and working key).
3. ERP → Fees → *Online payments* → *Add a gateway*: choose the fee account (or the institution), the gateway and test or
   live, paste the credentials and save, then **Test connection**.
4. In the gateway's dashboard, add the webhook address shown on that page (events: payment captured / order paid /
   refund processed, or the gateway's equivalents) and its secret.
5. Families can pay in the apps and through links at once. To stop, remove the gateway; counter payments always work.

## Paying in the apps, by link and by UPI QR

- **Parent and Student apps**: the fee list shows a **Pay now** button where the fee's account takes online payments.
  The pay sheet offers **Full**, **Instalment ₹…** (the instalments due by today, else the next one) and **Part** (only
  when *Settings → Online rules → allow part payments* is on, with a smallest part). Razorpay opens its SDK on phones;
  every other gateway (and Razorpay on desktop builds) opens the launch page in the browser, and the app checks with the
  server when the payer comes back ("I have paid: check"). Receipts list with **Download the receipt (PDF)** (the office's
  printed receipt). Code: `apps/parent/lib/features/fees/`, `apps/student/lib/features/fees/fee_pay.dart`.
- **Payment links** (ERP → Fees → *Payment links*, or from a student's dues): a link for an invoice's balance or an
  instalment, valid for a set number of days (default 7), sent by **SMS, WhatsApp and email** to the family; it can be
  resent or cancelled, and expires by itself (daily job). The public page (`/pay/:slug/:token`) shows the fee and the
  amount and pays through the same checkout; the token is stored only as a hash and the page is rate-limited.
- **UPI QR**: an **amount-bound UPI intent** (`upi://pay?pa=…&pn=…&am=…&tn=…&tr=…&mc=8220`, NPCI format) of the fee
  account's UPI ID is printed on invoices, payment links and receipts (`GET /v1/fees/invoices/:id/upi`,
  `/v1/fee-collect/receipts/:id/upi`). The reference carries the student's fee reference and the link or invoice number,
  so the bank statement import matches the credit.
- **Counter POS**: card and UPI payments on the institution's POS machine are entered with the terminal id and the POS
  slip's reference (`posTerminal`), so they reconcile with the acquirer's settlement.
- **Bank challans and NEFT**: each student has a **fee reference** (`SPU25BCM001`, ERP → Fees → *Generate fee
  references*) quoted in NEFT narrations and on challans. A bank statement import (`/accounts/bank`) matches credits to
  challan numbers, UTRs of recorded transfers and fee references, and receipts them.

## Concessions, scholarships and dues

- **Concessions, waivers, write-offs and fines** are per head, with approval limits; each change to a charge is an
  accrual entry (below).
- **Government scholarships**: Karnataka **SSP** (post-matric, Vidyasiri, fee concession), central (NSP) and others,
  each with application number, category, **expected** amount, the institution's **verification** date, the **portal
  status** (imported from the portal's CSV), sanction and money **received** (in parts; each receipt pays the dues).
  While an application is pending and *hold dues* is on, the expected amount is **held back from reminders, defaulter
  lists and fee holds**; a rejection releases it. Report: *Scholarship tracker* (expected vs received).
- **Mid-year changes**: a structure change recalculates the invoices still open (delta charged or reduced); a
  **programme transfer** previews and applies the new structure from a date (old charges reduced pro rata, new ones
  raised), recorded in `fee_programme_transfers`; a **readmission** takes the new structure and a one-time readmission fee
  while the earlier dues stay on the student; a **discontinued** student's refund follows the refund bands in Settings
  (percent and deduction by days since admission, UGC-style), out of the fee account's own bank.
- **Overpayment** goes to the student's advance and is used on the next dues. **Duplicate payments** (paid twice online,
  the same reference twice, the same amount the same day) are flagged for the accountant (ERP → Fees → *Duplicates*):
  not a duplicate, keep as advance (journalled), or refund.
- **Cheque bounce** reverses the receipt, adds the bounce charge and tells the family; **receipt cancellation** needs a
  reason and an approver other than the requester.
- **Day-end cash closing** per cashier with denominations; differences are recorded.

## Reminders and escalation

*Settings → Reminders* holds a schedule of steps, each days before (−7), on (0) or after (+7, +15, +30) the due date,
with the audience (family, class teacher, principal, accountant), the channels (app, SMS, WhatsApp, email) and an
optional smallest overdue amount. A daily job sends each step once per invoice (`fee_reminder_sends`), skips amounts held
for scholarships, and the *Reminders sent* report lists what went out.

## Books: double entry for every money event

- **Basis**: *cash* (income when received, the default) or **accrual** (from a set date: income when charged). On the
  accrual basis every charge and change is posted as it happens: fee and fine (receivable / income), concession,
  scholarship, waiver, write-off and withdrawal (expense or income reversal / receivable), cheque bounce charge; receipts
  clear the receivable and refunds reverse it. `fee_accruals` keeps what the books were told per invoice head, so a
  recalculation posts only the difference.
- Receipts, refunds, concessions, waivers, fines, bounce reversals and advance moves make **vouchers** in the fee
  account's fund: ledgers, day, cash and bank books, **trial balance, income and expenditure, balance sheet** per fee
  account.
- **GST** only on heads marked taxable (rate per head; tuition is exempt); the *GST* report lists taxable value and tax.
  **80G** receipts for donations show the fee account's 80G registration.
- **TallyPrime**: live sync of vouchers as XML over HTTP to the Tally gateway (per fee account's Tally company; ledgers
  created first), a **retry queue** with back-off (hourly job), a ledger **mapping** screen, and a Tally XML export.
  **Zoho Books**: journal CSV export (`/v1/books/zoho.csv`). The Tally host must be a public address (no internal
  network).
- **Bank account numbers** of ledgers and challans are stored encrypted (`••••1234|<sealed>`), shown masked in lists and
  in full only on the printed challan.

## Reports

ERP → Accounts → Reports (each filters by date, fee account and class, and exports to Excel): daily collection,
mode-wise, head-wise, cashier collection, receipt register, outstanding **ageing** (current, 0–30, 31–60, 61–90, 90+),
**defaulters** with guardian name, phone and email and the last reminder, concession and discount registers,
**scholarship tracker**, refund register, **gateway reconciliation**, **GST**, payment links, reminders sent,
duplicates, fee account summary, the books, and the **audit trail** of fee actions.

## Performance and limits

- `GET /v1/fees/invoices` is **paged by cursor** (oldest due first, then roll number; `limit` up to 500, `nextCursor`
  for the next page; filters `sectionId`, `studentId`, `status`, `dueBefore`).
- `GET /v1/fees/summary` is reused for the dashboard cache's time (`DASHBOARD_CACHE_MS`, 30 s) and recomputed at once
  after a payment, an issue or a cancellation in that API instance.

## Demo data

The Soundarya seed (`pnpm db:seed:soundarya`) sets up the college and the **Soundarya Educational Trust** as fee
accounts (hostel and transport heads on the trust), a Cashfree sandbox gateway for the trust (switched off until its
test keys are entered), online rules (part payments from ₹1,000), a five-step reminder schedule, fee references for every
student, five SSP and central scholarship applications in each state, payment links (opened, sent, cancelled) and a
duplicate UPI receipt waiting for review.
