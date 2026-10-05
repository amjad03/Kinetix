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

## Online payments: each institution's own Razorpay account

**Owner decision:** every institution receives online fee payments **directly in its own Razorpay
account**. Razorpay settles to the institution's bank account; the institution is Razorpay's
merchant (KYC, settlements, refunds, disputes and settlement reports are in its own Razorpay
dashboard). KINETIX never holds the money and takes **no commission** in this model, so there is no
platform account, no Razorpay Route and no split settlement. There are no platform-wide Razorpay
keys: `RAZORPAY_*` environment variables are gone.

```
App ── POST /v1/fees/invoices/:id/checkout ──► API loads the institution's keys, creates the order in
       ITS Razorpay account, stores a `created` payment; the response carries ITS key id
App ── gateway checkout (Razorpay SDK, with that key id) ──► payment into the institution's account
App ── POST /v1/fees/payments/:id/confirm {providerPaymentId, signature} ──► API verifies the HMAC
       with the institution's key secret, marks the payment paid, numbers the receipt, credits the invoice
Gateway ── POST /v1/fees/webhooks/razorpay/:tenantSlug (signed) ──► same, if the app never confirmed;
       verified with that institution's webhook secret
```

- **Keys per institution** (`payment_gateway_accounts`, one row per tenant, row-level security):
  key id (public), key secret and webhook secret. The secrets are **encrypted at rest** with
  AES-256-GCM under the master key `SECRETS_ENCRYPTION_KEY` (32 bytes, base64; from Secrets Manager,
  never the database). Each value is `v<version>.<iv>.<tag>.<ciphertext>` with the tenant id and
  field as associated data, so it cannot be moved to another institution or column. The key is
  versioned for rotation (`SECRETS_ENCRYPTION_KEY_VERSION`, `SECRETS_ENCRYPTION_OLD_KEYS`,
  `rotate-secrets`; see [security.md](../operations/security.md#secrets)). Code:
  `services/api/src/common/secret-box.ts`, `src/fees/payment-gateway.service.ts`.
- **Managing them** (`principal`, `tenant_admin`; ERP → Settings → *Online payments (Razorpay)*):
  - `GET /v1/admin/payments/razorpay` → `{provider, configured, keyId, mode, keySecretLast4,
    updatedAt, webhookPath}`. `mode` is `live` for `rzp_live_…` keys, else `test`. Secrets are
    **never returned** by any endpoint.
  - `PUT /v1/admin/payments/razorpay {keyId, keySecret?, webhookSecret?}`: both secrets are
    required the first time (`PAYMENTS_KEYS_REQUIRED`), the key secret again when the key id
    changes (`PAYMENTS_KEY_SECRET_REQUIRED`); a secret left out keeps the stored one. Audited as
    `payments.razorpay_updated` with the key id, mode and which secrets changed — never the secrets.
  - `POST /v1/admin/payments/razorpay/test` lists one order with the institution's keys and answers
    `{ok: true}` or `{ok: false, error: AUTHENTICATION_FAILED | GATEWAY_ERROR | NETWORK_ERROR |
    PAYMENTS_NOT_CONFIGURED}` (audited as `payments.razorpay_tested`).
  - `DELETE /v1/admin/payments/razorpay` stops online payments (`payments.razorpay_removed`).
- **Not set up:** `GET /v1/fees/students/:id` returns `onlinePayments: null` (the apps say "Please
  pay at the fees counter") and checkout fails with 503 `PAYMENTS_NOT_CONFIGURED`. Cash, cheque,
  bank transfer and UPI recorded by the accounts office work regardless.
- **Exactly once:** marking paid locks the payment row; confirm and webhook can both arrive.
- **Webhook checks:** signature over the raw body (`rawBody` is enabled in Nest) with the webhook
  secret of the institution named in the URL; the order must belong to that institution (row-level
  security: another institution's order is not found and is ignored), and the amount must match
  what was ordered. A body signed with another institution's secret is rejected (401). The old
  platform URL `POST /v1/fees/webhooks/razorpay` still works for webhooks set up earlier: the order
  names the institution, whose webhook secret must have signed the body.
- **Server modes:** `PAYMENTS_PROVIDER=razorpay` (production; requires `SECRETS_ENCRYPTION_KEY`),
  `demo` for development (orders are made up, the app signs with a known secret, the apps say "Demo
  payment: no money moves"; keys can still be saved and tested), or `none` (counter payments only).
  `RAZORPAY_FAKE=true` (tests and local e2e only) replaces Razorpay's HTTP API with a fake while the
  signatures are still checked with each institution's secrets.
- **Parent App:** the checkout opens with the `keyId` from the checkout response; nothing is
  hard-coded in the app (`apps/parent/lib/features/fees/razorpay_gateway.dart`).

### Onboarding an institution for online payments

1. The institution creates a **Razorpay account in its own name** and completes Razorpay's **KYC**
   (PAN, bank account for settlements, registration documents). Activation takes a few days; until
   then it can use test mode.
2. In the Razorpay dashboard, *Account & Settings → API keys*: **generate API keys** (test keys first
   if wanted, then live) and copy the key id and key secret.
3. *Account & Settings → Webhooks*: **add a webhook** with the URL shown in ERP → Settings → *Online
   payments (Razorpay)* (`https://<api_domain>/v1/fees/webhooks/razorpay/<institution slug>`), a
   secret of its choice, and the events `payment.captured` and `order.paid`.
4. The principal or administrator enters the key id, key secret and webhook secret in that Settings
   section, saves, and presses **Test connection**. Families can then pay in the Parent App.
5. To change keys (e.g. after regenerating them in Razorpay), enter the new ones and save; to stop
   online payments, remove the account (API `DELETE`).

## Open questions

- Fee structures (heads, concessions, instalments, late fees) and refunds.
- GST: tuition fees of recognised institutions are generally exempt; other charges may not be.
  Needs an accountant's review before invoices show tax lines.
