# Security, privacy and reliability audit (pre-go-live)

Audit of the whole product (API `services/api`, ERP `apps/erp`, infrastructure `infra/`) against
[SECURITY_PRIVACY_ACCEPTANCE.md](../requirements/SECURITY_PRIVACY_ACCEPTANCE.md), the OWASP Top 10 (2021) and the DPDP Act 2023,
November 2026. Every finding has a severity, where it was, what was changed and the test that keeps it fixed. Performance is in
[docs/operations/PERFORMANCE.md](../operations/PERFORMANCE.md); the per-route authorization matrix is
[AUTHZ_MATRIX.md](AUTHZ_MATRIX.md).

Severity: **Critical** exploitable remotely without an account, or exposes many institutions' data; **High** exposes personal or
financial data or defeats a control with modest effort; **Medium** weakens a control or needs another flaw; **Low** defence in
depth; **Info** no risk today.

## Summary

| | Critical | High | Medium | Low | Info |
| --- | --- | --- | --- | --- | --- |
| Found | 1 | 6 | 14 | 4 | 2 |
| Fixed in this pass | 1 | 6 | 12 | 4 | 2 |
| Open (accepted or handed over, below) | 0 | 0 | 2 | 0 | 0 |

What was already in good shape and is now pinned by tests: row-level security on every tenant table (the app role has
`NOBYPASSRLS`; `test/rls.e2e.spec.ts` checks every table in `TENANT_TABLES`), parameterised SQL through Drizzle almost
everywhere, a `@Auth` decorator on every non-public route, ownership helpers (`assertCanSeeStudent`, `child()`, `canRead()`,
`member()`), session revocation, OTP limits, MFA (TOTP + backup codes), webhook signatures, signed and expiring download links,
upload type sniffing and ClamAV quarantine, masked Aadhaar for students (last 4 + hash only), encrypted staff Aadhaar and bank
accounts, DPDP data-principal requests (`/v1/dpdp/me/*`), consents and retention jobs, non-root containers.

## 1. Authorization

The route map is read from the Nest metadata of the running module graph (`services/api/test/authz/scan.ts`), not from source
text: 2,707 routes, 89 public, 302 open to any signed-in user. `test/authz-matrix.spec.ts` regenerates
`docs/security/AUTHZ_MATRIX.md` and fails when it is stale, when a route without `@Auth` is not on the reviewed public list, or
when a route the heuristics flag (`BROAD`: a staff-sounding write open to students/families; `OWNERSHIP?`: an id in the path,
open to non-staff, with no sign that the handler reads the caller) has not been reviewed. All 40 flagged routes were read by
hand; each has its protecting check recorded in the matrix.

IDOR was exercised on 40 high-risk routes (marks, results, transcripts, fees, documents vault, chat/conversations, health,
diary, early years, passport, careers, hall tickets): a guardian of child A and a student C ask for child B by id and must get
403/404, while B's own guardian gets 200 (`test/idor.e2e.spec.ts`). No leak was found; the routes keep their checks.

Tenant isolation: every request handler goes through `DbService.withTenant` (RLS). The owner-role `db.system` is used only for
pre-tenant lookups (slug, enrolment code, SSO domain), the platform team's guarded endpoints and background job pollers;
each use was reviewed. Raw SQL with `sql.raw` (53 places) only splices constants, whitelisted identifiers or validated
operators; the one place that spliced request data (analytics classroom date range) now binds parameters.

| # | Sev | Finding | Location | Fix | Test |
| --- | --- | --- | --- | --- | --- |
| A1 | High | A removed role kept working for up to 12 hours: `AuthGuard` trusted the roles inside the JWT. Taking `principal` away from someone did not stop them until their token expired. | `src/auth/auth.guard.ts` | Roles are read from `user_roles` on every request, in the same query that already read the campus scope (no extra round trip). | `security.e2e` "a role taken away stops working at once" |
| A2 | Info | 89 public routes: all token-, signature- or secret-gated (webhooks, LTI, SCORM, DigiLocker, device ingest, OData feed tokens, BI export signed links, admissions applicant tokens) or public by nature (branding, verification pages). | `AUTHZ_MATRIX.md` *Public routes allowed* | Allow list with the reason for each; new public routes fail CI until reviewed. | `authz-matrix.spec` |

## 2. OWASP Top 10

| # | Sev | Finding | Location | Fix | Test |
| --- | --- | --- | --- | --- | --- |
| O1 | Critical | Dependencies: `next` 16.3.8 (two unauthenticated RCE advisories and a server-actions DoS), `shell-quote` (critical, dev), `sharp`/libvips, libheif, librsvg (high), `body-parser` and `multer` DoS, `zod` memory exhaustion. `pnpm audit`: 3 critical, 8 high. | `pnpm-lock.yaml` | next 16.4.4, sharp 0.35.5, zod 4.6.7, overrides for shell-quote, body-parser, multer. Now 0 critical, 1 high (vite 8.3.2 `launch-editor`, dev server on Windows only). CI fails on any new critical. | `pnpm audit --audit-level critical` in CI |
| O2 | High | Password sign-in: only 10 tries a minute per account (14,400 guesses a day each) and no limit across accounts from one address (credential stuffing); no lockout. | `src/auth/auth.controller.ts` | Per-IP budget (`LOGIN_PER_IP_PER_MINUTE`, 60), lockout after 10 wrong passwords in 15 minutes (even the right password is refused until the window ends), per-account 20/min. Shared through Redis across instances. | `security.e2e` lockout, per-IP |
| O3 | High | SSRF: webhook, connector, SSO discovery/token/JWKS, DigiLocker, NAD and LTI JWKS URLs were checked only as text (a DNS name pointing at 169.254.169.254 or the VPC passed), redirects were followed, and the Tally gateway host was not checked at all. | `src/connectors/safe-url.ts` and callers, `src/tally/tally.controller.ts`, `src/integrations/common.ts`, `src/sso/*` | `assertPublicUrl`: in production the host must resolve only to public addresses (private, link-local/metadata, CGNAT, multicast, IPv4-mapped IPv6 in either notation refused); `redirect: 'manual'` everywhere. | `src/connectors/safe-url.spec.ts` |
| O4 | High | `/metrics` was public unless `METRICS_TOKEN` was set (it was not, in Terraform), and compared with `!==`. | `src/observability/observability.ts`, `infra/terraform/secrets.tf` | Token generated by Terraform and injected; constant-time comparison; the API refuses to start in production without one. | `security.e2e` "/metrics needs the token" |
| O5 | Medium | Production could start with test-only settings: `RAZORPAY_FAKE`/`PAYU_FAKE`, `PAYMENTS_PROVIDER=demo`, `SMS_PROVIDER=console` (sign-in codes written to the log), a short `JWT_SECRET`, no CORS list, admins without MFA. | `src/config/env.ts` | `DEPLOYMENT=production` (set by Terraform for prod) runs `productionProblems()` and refuses to start. | `security.e2e` "refuses to start in production" |
| O6 | Medium | Security headers missing on the API: no HSTS, `nosniff`, `frame-ancestors`, CSP or `Cache-Control: no-store` on signed-in answers; `X-Powered-By` sent. | `src/setup.ts` | `securityHeaders` middleware (pages the API serves to be framed or to run scripts, LTI, SCORM, simulations, shared notes, keep their own). | `security.e2e` headers, no-store |
| O7 | Medium | ERP sent no CSP, HSTS, `X-Frame-Options` or `Permissions-Policy` (clickjacking of signed-in staff pages). | `apps/erp/next.config.ts` | CSP (`default-src 'self'`, `connect-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, forms to self and HTTPS LTI tools), HSTS, XFO DENY, Permissions-Policy. | `apps/erp/src/lib/security-headers.test.ts` |
| O8 | Medium | No rate limit on the unauthenticated `/v1/public/*` pages (admission forms, enquiry, verification lookups, recruiter portal): scraping and form spam. | `src/setup.ts` | Per-IP budget `PUBLIC_PER_IP_PER_MINUTE` (120) for `/v1/public`, answered 429 `RATE_LIMITED`. | `security.e2e` "rate limits the public pages" |
| O9 | Medium | CORS allowed any origin. Bearer tokens (no cookies) make this low impact, but there is no reason to allow it. | `src/setup.ts` | `CORS_ORIGINS` allow list (Terraform: the ERP domain); required in production. | `security.e2e` production check |
| O10 | Medium | Swagger UI (`/docs`, the full route map) served in production. | `src/main.ts` | Off with `DEPLOYMENT=production` unless `API_DOCS=true`. | manual |
| O11 | Medium | Virus scanning skipped for attachments stored through `putBlob` in projects, research datasets, grievance tickets, committees and event media (the scanner was called by hand in four other callers). | `src/common/blob.ts` and callers | `putBlob` takes the scanner and scans before writing; nothing can store a blob unscanned. | existing scan tests (`foundation.e2e`), callers' suites |
| O12 | Medium | MFA for administrators was optional: no institution policy meant no second factor for `tenant_admin`/`principal`. | `src/auth/mfa.service.ts` | `MFA_ENFORCED_ROLES` is a floor on top of each institution's policy; production requires at least `tenant_admin,principal` (Terraform sets these plus accountant, HR manager, exam controller). | `security.e2e` "requires two-factor for the enforced roles" |
| O13 | Medium | Unknown logins answered faster than wrong passwords (no Argon2 work), so response time told which logins exist. | `src/auth/auth.controller.ts` | The same Argon2 verify against a dummy hash. | `security.e2e` lockout (behaviour), code review |
| O14 | Low | Argon2 parameters came from the library default; an upgrade could change them silently. | `src/auth/password-policy.ts` | Pinned Argon2id 64 MiB / t=3 / p=4 (above OWASP's 19 MiB / t=2); sign-in re-hashes weaker stored hashes. | `passwords.e2e`, `security.e2e` |
| O15 | Low | ERP "return after sign-in" path allowed control characters (`/\t/evil.example` becomes `//evil.example` in browsers: open redirect). | `apps/erp/src/lib/return-path.ts` | Control characters refused. | `return-path.test.ts` |
| O16 | Low | JWT verification did not pin the algorithm. | `src/auth/tokens.service.ts` | `algorithms: ['HS256']`. | all sign-in suites |
| O17 | Low | Analytics classroom range spliced dates into `sql.raw` (validated upstream by a regex). | `src/analytics/queries.ts` | Bound parameters. | `analytics.e2e` |
| O18 (X1, fixed in the LMS pass) | Medium | SCORM packages (teacher-uploaded HTML and JS) were served from the API origin, framed by a same-origin player that exposed its own tracking link to the package. | `src/integrations/scorm.controller.ts`, `package-tokens.ts`, `xapi.controller.ts`, `src/setup.ts`, `src/config/env.ts`, `infra/terraform/{alb,ecs,variables}.tf` | Package files are served only from a separate content host (`SCORM_CONTENT_ORIGIN`, Terraform `content_domain`, required with `DEPLOYMENT=production`, must differ from the API host); on that host `contentHostGuard` answers nothing but `/v1/scorm/content/*` and the health checks, and package files are refused on every other host. Every file carries `Content-Security-Policy: sandbox allow-scripts allow-forms allow-popups…` without `allow-same-origin` (an opaque origin: no cookies, storage or DOM of any ZYNETIX page, no top navigation), `connect-src` limited to the content origin (cmi5: plus the xAPI endpoint), `frame-ancestors` the player's origin. The player frames the package with the same sandbox attribute, a nonce-only script CSP, and talks to it by `postMessage` from its own frame only. Content links are signed separately (scope `c`, no learner) and cannot save tracking; the player link (scope `p`) cannot read files; cmi5 gets a one-use fetch link and a per-learner credential. Signed with a key of their own (not shared with other signed values). | `test/lms-pass.e2e.spec.ts` "SCORM on its own sandboxed origin" (3 tests) and "cmi5 over xAPI" (2), `integrations.e2e` SCORM, `security.e2e` production check |

Checked and in order: XSS in the ERP (three `dangerouslySetInnerHTML`: API-drawn QR SVG, and the document editor whose
template colours are schema-validated hex/palette tokens and text escaped; no rich-text HTML in messages, which are plain
text); CSRF (session cookie `httpOnly`, `SameSite=Lax`, `Secure` in production; Next.js server actions check the origin; the
four POST route handlers refuse cross-site `Sec-Fetch-Site`); file uploads (size limits on every multipart route, magic-number
type checks, path-traversal-proof storage keys, downloads as attachments with `nosniff`); open redirects in SSO (return
addresses on a per-provider allow list); OTP (always 202, per-phone and per-IP limits, resend gap); secrets in the repository
(none; `scripts/secret-scan.sh` runs in CI); logs (phones masked, no tokens or bodies; the new error reports are scrubbed).

## 3. Privacy (DPDP Act 2023)

| # | Sev | Finding | Location | Fix | Test |
| --- | --- | --- | --- | --- | --- |
| P1 | High | Special-category data in clear: health conditions, medications, allergies and notes, nurse and sick-bay visit complaints and treatment, counselling notes. A database dump or a misdirected query exposed children's medical and counselling records. | `src/school-life/health.controller.ts`, `src/hostel/hostel.records.ts`, `src/welfare/counselling.controller.ts` | Column encryption with the existing secret box (`src/common/sensitive.ts`): AES-256-GCM under `SECRETS_ENCRYPTION_KEY`, versioned `v<n>.…`, bound to institution + student + field (a value copied to another student does not decrypt). Old plain rows stay readable and are sealed on write or by rotation. Blood group and emergency contacts stay plain (printed on ID cards). | `test/dpdp-encryption.e2e.spec.ts` |
| P2 | High | Key rotation (`pnpm secrets:rotate`) re-encrypted only the payment secrets: after removing an old key, staff MFA secrets, staff Aadhaar and bank accounts, SSO client secrets, connector settings and pairing signing keys would no longer decrypt. | `src/db/rotate-secrets.ts` | `rotateAll` covers every encrypted column, row by row; values that cannot be decrypted are counted and left alone. | `dpdp-encryption.e2e` "key rotation" |
| P3 | Medium | Uploaded photos (profile photos, early-years observations of young children) were stored with their EXIF: GPS position, device, time. | `src/profile/profile.controller.ts`, `src/school-life/early-years.controller.ts` | Decoded and saved again without metadata, upright, size-capped (`src/common/image.ts`); a file that only has a JPEG header is refused. | `security.e2e` "photos are stored without their EXIF" |
| P4 | Medium (open) | Staff PAN and UAN are plain text (read only by payroll roles and statutory exports); fee-depth payee `bank_account` and IFSC plain. | `staff_profiles`, `fee-depth` tables | Not changed in this pass: PAN is read by eight payroll/TDS paths and raw-SQL reports; the fee tables belong to the fees work in progress. Encrypt with `sensitive.ts` (bindings `staff.<user>.pan`) when those modules are next touched. | — |

Already in place and verified: consent records and parental consent for minors (`/v1/consents`), data-principal access,
correction and erasure requests with export (`/v1/dpdp/me/*`, processed by principal/admin), grievance officer contact,
retention rules for health and counselling (`welfare/retention.controller.ts`, redact or delete), recycle-bin purge, masked
Aadhaar for students, audit of every health and counselling read.

## 4. Reliability

| # | Sev | Finding | Fix |
| --- | --- | --- | --- |
| R1 | Info | No error tracking: unexpected errors were only in the logs. | `ERROR_WEBHOOK_URL`: 500s and unhandled rejections sent as JSON with ids and the stack only, scrubbed of tokens, emails and numbers, 60 a minute at most (`src/observability/error-reporter.ts`, unit spec). |
| R2 | Medium | CI ran only on pull requests and `main`; no dependency or secret checks. | `.github/workflows/ci.yml`: every push; `security` job (pnpm audit critical, secret scan, authorization matrix and unit specs). |
| R3 | Medium | The quarterly restore drill was a manual checklist with nothing to prove completeness. | `scripts/restore-drill.sh`: dump, restore into a scratch database, compare every table's row count, the newest migration and the RLS policies; object storage checksums (local) or versioning and sampled downloads (S3). Ran locally: 758 tables, all counts equal, 750 policies. |

Already in place: `/health` (liveness) and `/ready` (database, migrations, Redis), graceful shutdown (`enableShutdownHooks`,
jobs drain, pools close last), JSON logs with request/trace/tenant/user ids, OpenTelemetry traces, Prometheus metrics and alert
rules, non-root containers (API and ERP `node`, code runner uid 10001 with seccomp), RDS PITR 14 days and S3 versioning.

## Open items

| # | Sev | Item | Recommendation |
| --- | --- | --- | --- |
| ~~X1~~ | Fixed | SCORM packages served from the API origin: fixed as O18 (separate content host, sandboxed files, split signed links). Before go-live, point `content_domain` (ideally a separate registrable domain) at the ALB and add it to the certificate. | Done. |
| X2 | Medium | P4 above. Staff PAN/UAN are now encrypted (`pan_enc`, `uan_enc`); donor PAN and fee payee bank details remain (S8 below). | As in S8. |
| S6 | Medium | Messaging webhooks: verify Meta `X-Hub-Signature-256` and SNS signatures, not only the URL secret. | See the final audit. |
| S7 | Medium | DPDP erasure: delete the photo object, student DOB/address, donor PAN after retention. | See the final audit. |
| — | Low | DNS rebinding between the address check and the request (SSRF). | Route outbound requests to tenant-typed hosts through an egress proxy or NAT with a deny list for the VPC and 169.254.0.0/16. |
| — | Low | ERP CSP keeps `'unsafe-inline'` for scripts (Next.js bootstrap). | Move to per-request nonces (`proxy.ts`) once the pages are checked. |
| — | Low | Access tokens live 12 hours with no refresh rotation (sessions are revocable and roles now re-read each request). | 1-hour access token plus rotating refresh token when the apps can renew silently. |
| — | Info | vite 8.3.2 advisory (dev server on Windows). | Bump with the next vitest release. |

For the fees work in progress (not changed here, per the split of work): `POST /v1/fees/invoices/:id/checkout` answers
"payments not configured" before checking that the caller may see the invoice (reveals only the institution's setting);
`fee-depth` `bank_account` is stored in clear; `GET /v1/fees/invoices` is the slowest list under load (PERFORMANCE.md).

Tests that fail today for reasons unrelated to this audit (fixed calendar dates that are now in the past):
`governance-access` and `hr-depth-kit` (delegation "upcoming"), `welfare` (appeal window, counselling schedule, disbursement),
`payments-connectors` (meeting listing).

## Final cross-cutting audit (November 2026)

Re-check of this baseline plus the modules merged after it (communication, research, governance, chat safety). Details,
the per-entry justification of the public allow list and the tests: [docs/audit/SECURITY_FINAL_AUDIT.md](../audit/SECURITY_FINAL_AUDIT.md).

| # | Sev | Finding | Status | Test |
| --- | --- | --- | --- | --- |
| S1 | Medium | CSV formula injection in exam-cell reports, the university tabulation register and the Zoho journal; the shared writer missed a leading tab/CR. | Fixed: one `neutraliseFormula` rule (`common/pdf.ts`) for every exporter. | `src/common/csv-injection.spec.ts` |
| S2 | Medium | Public route allow list unanchored (`webhook`, `verify`, `/public/`, `/v1/platform/` anywhere in a path) and three stale entries: a staff route that forgot `@Auth` could pass CI. | Fixed: anchored entries; the spec fails on stale entries and canary staff paths. | `authz-matrix.spec` |
| S3 | Medium | Global `text/plain` parser (256 KB) on every route: drained ADMS/SIP2/xAPI bodies, capped device pushes, string bodies on a preflight-free content type. | Fixed: only the messaging webhook reads text/plain. | `communication-pass.e2e`, `attendance-pass.e2e` |
| S4 | Low | WhatsApp verify echoed `hub.challenge` as `text/html`. | Fixed: `text/plain`, short token only. | `communication-pass.e2e` |
| S5 | Medium | DPDP erasure kept push registrations and session IPs/browsers. | Fixed. | `roles-annotations-dpdp.e2e` |
| S6 | Medium | Messaging webhooks trust only the URL secret; Meta `X-Hub-Signature-256` and SNS message signatures are not verified. | Open | — |
| S7 | Medium | DPDP erasure leaves the photo object in storage, student DOB/address, donor PAN. | Open | — |
| S8 | Medium | Donor PAN and fee-depth payee bank accounts in clear (staff PAN/UAN are now encrypted: half of X2 closed). | Open (replaces X2) | — |
| S9 | Low | NAD batch CSV not formula-neutralised (machine file, hashed into the batch reference). | Accepted | — |
| S10 | Low | Audit log append-only for the app role, but not tamper-evident against the owner role. | Open | — |

## Pre-go-live checklist

- [ ] **External penetration test by a CERT-In empanelled auditor** (web API, ERP, Parent/Student/Teacher apps, board pairing),
      scope agreed in writing, findings fixed and retested; keep the report for the institutions' due diligence.
- [ ] CERT-In directions (28 April 2022): incident reporting contact registered, reportable incidents reported within 6 hours,
      logs of all systems kept 180 days in India (CloudWatch `log_retention_days` ≥ 180 in prod), NTP from NIC/NPL or AWS time.
- [ ] `DEPLOYMENT=production` on the prod task (Terraform does this); the API starts, so `productionProblems()` passed.
- [ ] `SECRETS_ENCRYPTION_KEY` set and backed up in Secrets Manager; run `pnpm secrets:rotate` once to seal health and
      counselling rows created before this release; rehearse a key rotation on staging.
- [ ] MFA enrolled by every principal, administrator, accountant, HR manager and exam controller (forced at next sign-in).
- [ ] `CORS_ORIGINS`, `METRICS_TOKEN` (Prometheus scrape config uses it), `ERROR_WEBHOOK_URL` (receiver hosted in India).
- [ ] `UPLOAD_SCAN=clamav` with the ClamAV task running; `documents.virus_scan` flag on.
- [ ] AWS WAF on the ALB (managed common rules + rate rule), GuardDuty, CloudTrail, Config, IAM Access Analyzer on.
- [ ] `scripts/restore-drill.sh` run against a PITR copy of prod and an S3 sample; report filed; RPO/RTO confirmed.
- [ ] Load test (`scripts/perf`) on the production-sized staging stack; p95 within `docs/operations/performance-budgets.md`.
- [ ] `pnpm audit --audit-level high` clean or each remaining advisory accepted in writing; container images scanned (ECR).
- [ ] Data-processing agreement with each institution; privacy notice lists MSG91, FCM, Razorpay/PayU, AI/ASR providers in India.
- [ ] DPDP: grievance officer published per institution; consent flows for under-18s verified with a pilot school; retention
      rules set (health visits, counselling, recordings).
- [ ] Open item X2 scheduled. X1 is fixed (O18): `content_domain` in DNS and on the ACM certificate before SCORM is offered to schools.
