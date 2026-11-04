# Final security audit (cross-cutting), November 2026

Scope: authentication, authorization and tenant isolation, input validation, injection (SQL, CSV/formula, HTML), file
uploads and downloads, SSRF, webhooks, rate limits, secrets and PII in logs, headers/CORS/cookies, the public route allow
list, dependencies, field encryption, DPDP export and erasure, audit-log integrity and the Flutter apps' token storage.
Baseline: [docs/security/SECURITY_AUDIT.md](../security/SECURITY_AUDIT.md) (its findings were re-checked, not repeated).
The modules merged after that baseline (communication, research, governance, chat safety) were read in full where they
touch the scope above.

Severity as in the baseline: **Critical** remote without an account or many institutions; **High** personal or financial
data, or a control defeated with modest effort; **Medium** weakens a control or needs another flaw; **Low** defence in
depth.

## Summary

| | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- |
| New findings | 0 | 0 | 6 | 4 |
| Fixed in this pass | 0 | 0 | 4 | 1 |
| Open (below, with the fix) | 0 | 0 | 2 (+2 carried) | 3 (+3 carried) |

## Findings

| ID | Sev | Area | File:line | Issue | Status | Test |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Medium | CSV / formula injection | `services/api/src/exam-cell/exam-cell.logic.ts:284`, `src/university-results/tabulation.logic.ts:216`, `src/fee-flagship/flagship.logic.ts:31`, `src/admissions/pass/pass.controller.ts:78`, `src/common/pdf.ts:193` | Exam-cell reports and internal-marks exports, the university tabulation register and the Zoho Books journal quoted cells but let a leading `=`, `+`, `-`, `@` run as a formula when staff open the file (student names, subject titles, narrations and payer names are typed by people; admission fields by the public). The shared writer and the admissions export missed a leading tab or carriage return. | Fixed: one `neutraliseFormula` rule in `common/pdf.ts` (OWASP list, plain numbers and the lone `-` placeholder kept); every exporter above uses `csvCell` from there. | `src/common/csv-injection.spec.ts` |
| S2 | Medium | Authorization (public routes) | `services/api/test/authz/scan.ts:30` | Routes without `@Auth` are public by default, so the allow list is the control that keeps a forgotten `@Auth` out of production. Its patterns admitted any path *containing* `webhook`, `callback`, `return`, `verify` or `/public/`, the whole `/v1/auth/` and `/v1/platform/` namespaces (guarded routes are never "public", so the platform entry only ever admitted an unguarded one), and three entries matched no route at all. A staff route such as `/v1/hr/payroll/return` or `/v1/integrations/webhooks` with the decorator missing would have passed CI. | Fixed: every entry anchored to its namespace, `/v1/auth` to the six sign-in routes, stale and platform entries removed. The spec now fails on a stale entry and on canary staff paths. | `test/authz-matrix.spec.ts` "every public allow-list entry is used", "the public allow list is anchored" |
| S3 | Medium | DoS / request parsing | `services/api/src/setup.ts:42` | The communication pass added a global `text/plain` body parser (256 KB) for Amazon SNS. On every route it drained the request stream that ADMS punch logs, SIP2 and xAPI read themselves (punches were answered `OK: 0` and dropped; the academics audit patched the reader on main), refused ADMS batches over 256 KB with 413 although the handler allows 2 MB, and handed a string body to every route on a content type browsers may send cross-site without a CORS preflight. Not a DoS amplifier on its own (JSON is 8 MB globally), but a parser has no business on routes that do not use it. | Fixed: no global text parser; the messaging webhook reads its own text/plain body (256 KB, SNS's maximum) through `readRawBody`. Compatible with the reader fix on main. | `test/communication-pass.e2e.spec.ts` (413 above 256 KB on the webhook, 401 not 413 elsewhere, SES bounce still applied), `test/attendance-pass.e2e.spec.ts` ADMS |
| S4 | Low | Reflected content | `services/api/src/comms/comms-webhooks.controller.ts:37` | The WhatsApp verify step echoed `hub.challenge` as `text/html` (needs the institution's webhook secret, and the API's `default-src 'none'` CSP blocks script, so low). | Fixed: `text/plain`, and the challenge must be a short token. | `test/communication-pass.e2e.spec.ts` |
| S5 | Medium | DPDP erasure | `services/api/src/dpdp/dpdp.service.ts:205` | An approved erasure left the person's push registrations (their phone kept receiving pushes, which carry children's names) and their sessions with IP addresses and browsers. | Fixed: push devices deleted; sessions revoked and stripped of IP and user agent (rows kept for counts). | `test/roles-annotations-dpdp.e2e.spec.ts` "blocks erasure when retention applies and anonymises otherwise" |
| S6 | Medium | Webhook authenticity | `services/api/src/comms/comms-webhooks.controller.ts:68` | Messaging callbacks (MSG91, Kaleyra, Gupshup, Meta, SES) are authenticated only by the per-institution secret in the URL. Meta signs every POST (`X-Hub-Signature-256`, HMAC-SHA256 of the raw body with the app secret) and SNS signs every message; neither is checked, so a leaked URL (proxy or provider logs) lets anyone mark sends delivered, opt numbers out, or post a "reply" into a parent's conversation. Replays are absorbed (each event key applied once). | Open | Fix: store the Meta app secret with the channel settings and verify `X-Hub-Signature-256` with `timingSafeEqual` over `req.rawBody`; verify SNS `Signature` (SignatureVersion 2, `SigningCertURL` on `sns.<region>.amazonaws.com`, cache the certificate); drop the path token from access logs (`observability.ts` logs the route pattern, keep it that way). |
| S7 | Medium | DPDP erasure | `services/api/src/dpdp/dpdp.service.ts:206` | Erasure nulls `users.photo_key` but leaves the photo object in storage; the student row keeps date of birth and address; the alumni donation keeps the donor's PAN. | Open | Fix: delete the storage object before nulling the key (`ObjectStorage.delete`), add `dob`/`address` to the student anonymisation when no retention rule applies, and blank `alumni_donations.donor_pan` once the 80G retention period ends. |
| S8 | Medium | Encryption at rest | `services/api/src/db/schema.ts:7277` (`alumni_donations.donor_pan`), `src/db/schema-fee-depth.ts:262` (`bank_account`), `src/db/schema.ts:4728` (`inv_vendors.pan`) | Donor PAN (individuals, for 80G receipts) and fee-depth payee bank accounts are plain text. Staff PAN and UAN are now encrypted (`pan_enc`, `uan_enc`), which closes half of the baseline's X2. Vendor PAN is mostly a business identifier (Low). | Open | Fix: `sealStaffId`-style columns (`donor_pan_enc` + last 4) bound to `alumni.<donation>.pan`, same for payee `bank_account`; add both to `rotateAll`. |
| S9 | Low | CSV / NAD batch | `services/api/src/integrations/digilocker.controller.ts:226,298` | The NAD upload CSV quotes every cell but does not neutralise formulas. It is a machine file for the NAD portal and its hash is the batch reference, so the apostrophe would change what NAD receives. | Open (accepted) | Fix if needed: refuse names starting with `= + - @` at student entry instead of altering the batch. |
| S10 | Low | Audit-log integrity | `services/api/migrations/0001_rls.sql:42` | The app role cannot update or delete `audit_log` (tested in `rls.e2e`), but the owner role and a DBA can, undetected. | Open | Fix: hash-chain rows (`prev_hash`, `hash = sha256(prev_hash ‖ row)`) checked by a nightly job, or ship the log to S3 with Object Lock. |

Carried over from the baseline and re-checked (still open): access tokens live 12 hours with no refresh rotation
(`src/auth/tokens.service.ts:62`; sessions are revocable and roles are re-read every request); DNS rebinding between the
SSRF address check and the request; the ERP CSP keeps `'unsafe-inline'` for scripts; fee-depth `bank_account` (S8).

## Checked and in order

- **Passwords and sign-in**: Argon2id pinned (64 MiB, t=3, p=4), re-hash on sign-in, dummy-hash timing for unknown logins,
  per-IP and per-account limits with lockout (`auth.controller.ts`). OTP: 5 attempts per code then burned, per-phone and
  per-IP verify limits (`otp.service.ts:18-32,105`). MFA token is a separate 5-minute audience. JWT pinned to HS256.
- **Sessions and logout**: every request re-reads the session, the account status and the roles (`auth.guard.ts:70-77`);
  sign-out and a disabled account stop a token at once. No refresh token exists, so there is no refresh reuse to detect.
- **Tenant isolation**: request handlers go through `withTenant` (RLS, `NOBYPASSRLS` app role). The owner connection in
  controllers is used only through `SystemLookups` (slug, enrolment code, SSO domain, BI export link id) and
  `PlatformAdminGuard` routes; the new public disclosure page resolves the slug and then reads inside `withTenant`.
- **SQL**: new `sql.raw` uses since the baseline splice constants only (placement progression kinds, legacy table names
  from a fixed ternary, IST date expressions, stores report categories).
- **SSRF**: Crossref, ORCID and Open Library lookups use fixed hosts with `encodeURIComponent`; SRU targets, ISBN and AI
  provider URLs come from the operator's environment, not from tenants; SNS subscription confirmation is limited to
  `https://sns.<region>.amazonaws.com`; tenant-typed URLs keep `assertPublicUrl` and `redirect: 'manual'`.
- **Governance and research (new)**: every governance route has `@Auth` with `GOVERNANCE_ROLES`/`RTI_ROLES`; policy text
  is readable only by its audience or when public; the public disclosure page needs the institution to publish it.
- **ERP rendering**: four `dangerouslySetInnerHTML`: the chart theme CSS (shadcn, config keys), the API-drawn UPI QR SVG,
  and the document editor's schema-validated SVG; no user HTML or markdown is rendered as HTML.
- **Downloads**: `Content-Disposition` file names are built from sanitised titles, ids or fixed words; `nosniff` on all.
- **Flutter**: parent, student, teacher and board keep tokens in `flutter_secure_storage` (Keystore/Keychain), migrate
  old preference copies once, and log only error messages, never the token. Demo builds keep nothing.
- **Dependencies**: `pnpm audit --prod`: 0 critical, 0 high, 1 moderate (`qs` via `@nestjs/core`, `arrayFormat: 'comma'`
  stringify crash; the API does not stringify with that format). Bump with the next Nest release.

## Public route allow list (every entry justified)

`services/api/test/authz/scan.ts` `PUBLIC_ALLOWED`, after S2. Each entry must match at least one public route.

| Pattern | Why it is public | What protects it |
| --- | --- | --- |
| `/health`, `/ready`, `/live`, `/metrics` | Load balancer and Prometheus | `/metrics` needs `METRICS_TOKEN` (constant-time); the probes reveal nothing |
| `/v1/auth/{login, otp/request, otp/verify, mfa/verify, sso/providers, sso/start, sso/callback, sso/exchange}` | Signing in | Per-IP and per-account limits, lockout, OTP attempts, 5-minute MFA token, SSO state + nonce + PKCE, return addresses on an allow list |
| `/v1/devices/enroll` | Board enrolment | One-time enrolment code, rate limited |
| `/v1/(fees\|comms)/webhooks/…` | Payment gateways and messaging providers call back | Gateways: provider signature over the raw body; messaging: per-institution secret in the path (S6 asks for provider signatures too); events applied once |
| `/v1/fees/gateway-return/…` | Browser return from hosted checkout | Signature checked like the webhook; Cashfree re-queried with the account keys |
| `/v1/public/…` | Verification pages, admission forms and applicant portal, careers, recruiters, disclosure, events, branding, pay links, BI export links | Per-IP budget; unguessable codes; applicant and recruiter tokens; signed, expiring pay and export links |
| `/v1/chat/inbound` | Email relay and WhatsApp replies | Shared inbound secret (timing-safe), signed reply address |
| `/v1/class-notes/:token` | Shared class notes | Unguessable, revocable share token |
| `/v1/content/sims/phet/:id` | Open-licence simulations | No personal data |
| `/v1/device-ingest/…` | Biometric devices | Per-device ingest key |
| `/v1/digilocker/pull/:tenantId` | DigiLocker pull | HMAC-SHA256 with the client secret |
| `/v1/library/sip2` | Self-check kiosks | SIP2 login with the kiosk credentials |
| `/v1/lti/…` | LTI 1.3 launches | OIDC state, nonce, platform JWKS signature |
| `/v1/odata` | Power BI feed | Scoped, hashed, revocable API token |
| `/v1/scorm/…`, `/v1/xapi/…` | SCORM player and cmi5 units | Signed expiring tokens, separate content origin, one-use fetch link |
| `/v1/transport/gps/:tenantSlug` | GPS trackers | Per-institution shared secret |

## Tests run

- `vitest -c vitest.scan.config.ts`: `src/common/csv-injection.spec.ts` (new, 2), exam-cell, university-results,
  fee-flagship, hr-lib and grading unit specs (51 passed); `test/authz-matrix.spec.ts` (6 passed, 2 new; failed before
  the allow-list change with 3 stale entries and 8 admitted canaries).
- e2e on `zynetix_test_audit_sec`: `communication-pass` passed (16 tests) with the S4 challenge assertions.
- **Not yet confirmed (the session stopped first):** the e2e run covering S3 (`communication-pass` with the
  413/401 assertions, `attendance-pass` ADMS) and S5 (`roles-annotations-dpdp` erasure), and the full API `tsc`.
  Both were still running when work stopped. Run them before merging:
  `ZYNETIX_TEST_DB=<db> vitest run test/communication-pass.e2e.spec.ts test/attendance-pass.e2e.spec.ts test/roles-annotations-dpdp.e2e.spec.ts`
  and `tsc --noEmit -p services/api/tsconfig.json`.
