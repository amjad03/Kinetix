# Phone sign-in (OTP)

Teachers, parents and students sign in with their mobile number and a 6-digit code sent by SMS. Staff can still use email/phone + password (`POST /v1/auth/login`); both end in the same session.

## Contract

| Call | Body | Answer |
|---|---|---|
| `POST /v1/auth/otp/request` | `{tenant, phone}` (`tenant` is the institution's slug) | Always **`202 {retryAfterSeconds: 30, expiresInSeconds: 300}`**, whether or not the institution or phone exists. `400 PHONE_INVALID` for something that is not a phone number; `429 RATE_LIMITED` (with `retryAfterSeconds`) when a limit is hit. |
| `POST /v1/auth/otp/verify` | `{tenant, phone, code}` | **`201`** with exactly the body of `/v1/auth/login`: `{accessToken, user: {id, fullName, preferredLanguage, roles}}`. Wrong, expired, used or burned code, unknown phone or institution: **`401 OTP_INVALID`** ("Wrong or expired code"). `429 RATE_LIMITED` when a limit is hit. |

Phones are normalised to E.164 the same way as password login (`98000 00001`, `098000-00001`, `919800000001` and `+91 98000 00001` are all `+919800000001`). The apps should show the code field after any 202, offer "resend" after `retryAfterSeconds`, and treat `expiresInSeconds` as the code's lifetime.

## Flow

```
App                         API                                  Postgres (RLS)         SMS (MSG91)
 │ otp/request {tenant,phone} │                                       │                     │
 │──────────────────────────►│ rate limits (IP, 30 s gap, phone)      │                     │
 │                           │ tenant by slug (system lookup)         │                     │
 │                           │ withTenant: active user with phone? ──►│                     │
 │                           │   yes: spend older codes, store HMAC ─►│ otp_codes           │
 │                           │        audit auth.otp_sent             │                     │
 │◄── 202 (same either way) ─│ send (not awaited) ───────────────────────────────────────────►│ DLT template
 │ otp/verify {tenant,phone,code}                                     │                     │
 │──────────────────────────►│ rate limits (IP, phone)                │                     │
 │                           │ withTenant: latest unspent code FOR UPDATE                   │
 │                           │   wrong: attempts+1 (5th burns it), commit, 401             │
 │                           │   right: used_at, user active?, roles, audit auth.sign_in    │
 │◄── 201 {accessToken,user} │                                        │                     │
```

### Storage: a tenant table with RLS

`otp_codes` (`tenant_id`, `user_id`, `phone`, `code_hash`, `expires_at`, `attempts`, `used_at`, `created_at`) is an ordinary tenant table under row-level security (`migrations/0027_otp_codes_rls.sql`, listed in `TENANT_TABLES`). Both calls carry the institution's slug, so the tenant is known (one `SystemLookups.tenantBySlug`, as password login does) before any code is read or written, and every OTP query runs inside `DbService.withTenant`. No system-role access is needed, a row exists only for a real user, and a code can never be looked up across institutions. The same phone number at two institutions is two unrelated users with separate codes.

- Only `HMAC-SHA256(PAIRING_HMAC_SECRET, "otp:<tenantId>:<phone>:<code>")` is stored. Binding the hash to the tenant and phone makes a code useless anywhere else; the secret means a database dump alone cannot be brute-forced offline over the 10⁶ code space.
- A new code spends earlier unspent codes for that phone. Verification only looks at the newest unspent code, locked `FOR UPDATE`, so concurrent guesses are counted one by one.
- A code is spent when used, after **5** wrong tries (`auth.otp_burned` is audited), or when replaced; it expires after **5 minutes**.
- A wrong guess is committed before the 401 is thrown (the transaction does not roll back the attempt count).
- Rows are small and short-lived; a cleanup job can delete rows older than a day (not yet scheduled).

### Audit

`auth.otp_sent` (system, subject = user), `auth.otp_burned`, and `auth.sign_in` with `data.method` = `otp` or `password` (password login now audits too).

## Rate limits

Fixed windows, in memory with one instance and in Redis (shared) when `REDIS_URL` is set (`OTP_LIMITS` in `src/auth/otp.service.ts`):

| Key | Limit |
|---|---|
| Requests per IP | 30 / 10 min |
| Resend gap per institution + phone | 1 / 30 s |
| Requests per institution + phone | 3 / 10 min |
| Verifications per IP | 60 / 10 min |
| Verifications per institution + phone | 15 / 10 min (5 tries × 3 codes) |

The limits apply before the tenant and user lookups, so they are identical for existing and unknown phones. Behind a load balancer set `TRUST_PROXY` so the IP is the client's. A whole school on one NAT shares an IP; raise the IP limits if that shows up in practice.

## SMS providers

`SmsSender` (`src/auth/sms-sender.ts`) has one method, `sendOtp({to, code, appName, language})`.

- `SMS_PROVIDER=console` (default; development and tests): logs the code with a masked phone number. Tests replace `SmsSender` with a fake that records the code. Never use it in production.
- `SMS_PROVIDER=msg91`: [MSG91](https://msg91.com) (an Indian provider; data stays in India) Flow API v5, `POST https://control.msg91.com/api/v5/flow` with header `authkey`, body `{template_id, sender, short_url: "0", recipients: [{mobiles: "91XXXXXXXXXX", otp, app}]}`. Requires `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`, `MSG91_SENDER_ID` (startup fails without them). Secrets come only from the environment. Sending is not awaited by the request (same response time whether the phone exists), times out after 10 s, and failures are logged with the phone masked.

### DLT (TRAI) notes

Commercial SMS in India must be sent from a sender id (header) and template registered on a DLT platform (Jio, Vodafone Idea, Airtel, BSNL…) under the institution's or KINETIX's principal entity.

1. Register the principal entity and a 6-character header (e.g. `KINTIX`), set it as `MSG91_SENDER_ID`.
2. Register a **Service Implicit / OTP** content template, e.g. `{#var#} is your {#var#} sign-in code. It expires in 5 minutes. Do not share it.` Variables map to MSG91's `##otp##` and `##app##`; `SMS_APP_NAME` (default `KINETIX`) fills `app`.
3. Create the MSG91 Flow template with the DLT template id and use its id as `MSG91_TEMPLATE_ID`.
4. The wording, and its language, is fixed by the registered template. The user's `preferredLanguage` is passed to the sender so per-language templates (one DLT template per language, Unicode for Indic scripts) can be selected later; today one template is used for everyone.
5. Do not put links or anything but the code and app name in the message; OTP templates with extra content are rejected or throttled.

## Threat model

| Threat | Mitigation |
|---|---|
| Account enumeration (is this number registered?) | `otp/request` always answers the same 202 body; limits run before lookups; the SMS is sent after the response path without being awaited. Verification fails with one message for every reason. Residual: a database insert for real users makes the request slightly slower (milliseconds). |
| Brute-forcing a code | 6 digits, 5 tries per code then burned, 3 codes per 10 min per phone, 15 verifications per 10 min per phone and 60 per IP: at most ~15 guesses per 10 min against 10⁶ codes. |
| SMS pumping / toll fraud (sending many SMS at our cost) | No SMS unless the phone belongs to an active user of that institution; 3 per phone per 10 min, 30 s gap, 30 requests per IP per 10 min. Monitor `auth.otp_sent` volume per tenant. |
| Code reuse or replay | Codes are single-use, replaced by a newer code, and expire after 5 minutes. |
| Cross-institution use | Codes are stored under RLS and hashed with the tenant id and phone; the same number at another institution has its own codes. |
| Database leak | Only HMACs with a server secret; a leaked row cannot be turned back into the code without the secret, and codes expire in minutes. |
| SIM swap / SMS interception | Inherent to SMS OTP. Disabled users get no codes; staff with admin rights should prefer password (and SSO / a second factor later). |
| Logs leaking codes | Only the console sender logs codes (development); phone numbers in logs are masked. |
| Distributed attacks across instances | With `REDIS_URL`, all limits are shared; without it each instance has its own budget (single-instance deployments only). |
