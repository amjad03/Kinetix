# Fees and payments

## What it does

- The accounts office (role `accountant`, plus principal and admin) **issues a fee to a class**:
  one invoice per active student, with a title, amount and due date. Families and students are
  notified ("Fee due: Semester 3 tuition · ₹42,500 due by Thu 15 Oct").
- Families **pay online** in the Parent App, or at the **fees counter** (cash, cheque, bank
  transfer, UPI to the institution), which the office records.
- Every successful payment gets a **receipt number** that runs in sequence per institution and
  Indian financial year: `RCPT/2026-27/00001`. Part payments add up on the invoice.
- The office sees billed, collected, outstanding and overdue totals per class.

Amounts are stored as integer **paise**.

## Online payments

```
App ── POST /v1/fees/invoices/:id/checkout ──► API creates a gateway order, stores a `created` payment
App ── gateway checkout (Razorpay SDK) ──► payment
App ── POST /v1/fees/payments/:id/confirm {providerPaymentId, signature} ──► API verifies the
       HMAC signature, marks the payment paid, numbers the receipt, credits the invoice
Gateway ── POST /v1/fees/webhooks/razorpay (signed) ──► same, if the app never confirmed
```

- **Exactly once:** marking paid locks the payment row; confirm and webhook can both arrive.
- **Webhook checks:** signature over the raw body (`rawBody` is enabled in Nest), the order must
  be ours, and the amount must match what was ordered.
- **Providers:** `PAYMENTS_PROVIDER=razorpay` (an Indian gateway; keys from env), `demo` for
  development (orders are made up, the app signs with a known secret, the apps say "Demo payment:
  no money moves"), or `none` (counter payments only).

## Open questions

- **Whose account receives the money.** Today the gateway keys are platform-wide. Production
  needs each institution's own Razorpay account (or Razorpay Route with linked accounts) and
  settlement reports per institution. To be decided with the pilot college.
- Fee structures (heads, concessions, instalments, late fees) and refunds.
- GST: tuition fees of recognised institutions are generally exempt; other charges may not be.
  Needs an accountant's review before invoices show tax lines.
