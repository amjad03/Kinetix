# Platform foundation

Phase 00 capabilities added after the first foundation: step-up authentication, sessions, feature
flags, a domain event outbox, upload virus scanning, content licensing and global search.
Migrations 0076 to 0081 and 0084; schema in `services/api/src/db/schema-foundation.ts`.

## MFA and sessions (`src/auth/mfa.*`, `totp.ts`)

- TOTP (RFC 6238) with an authenticator app. `POST /v1/me/mfa/enrol` returns the secret and
  otpauth URI; `POST /v1/me/mfa/confirm` activates it and returns one-time backup codes
  (`/mfa/backup-codes` regenerates). `DELETE /v1/me/mfa` turns it off unless policy requires it.
  The secret is stored encrypted; the last accepted time step is kept so a code cannot be replayed.
- Policy: `GET/PUT /v1/admin/security-policy` sets `mfa_required_roles` per tenant (candidates:
  tenant_admin, principal, accountant, hr_manager, admissions_officer, store_keeper). A user in
  such a role signs in with a restricted session until the second factor is verified.
  `POST /v1/admin/users/:id/mfa/reset` is the lost-device path and is audited.
- Sessions: each sign-in creates a `user_sessions` row (label, IP, user agent, `mfa_verified`).
  `GET /v1/me/sessions`, `DELETE /v1/me/sessions/:id`, `POST /v1/me/sessions/revoke-others`.
  Revoked sessions are rejected by the auth guard on the next request.

## Feature flags (`src/flags/flags.ts`)

Code-defined flags with defaults (`FLAG_DEFINITIONS`); `feature_flags` rows override per
institution. `@RequireFeature('key')` answers 403 `FEATURE_DISABLED`. Current flags:
`analytics.reports`, `analytics.accreditation`, `search.global`, `classroom.analytics`,
`documents.virus_scan`. Add a flag by adding it to the map; no migration needed.

## Domain events (`src/events/events.ts`)

Transactional outbox: `emit(tx, ...)` inserts into `domain_events` inside the business
transaction, so an event exists only if the change committed. An in-process dispatcher claims due
rows with `FOR UPDATE SKIP LOCKED` (safe with many API instances), runs each registered consumer
in a transaction with an `event_consumptions` mark (at most once per consumer and event), retries
with backoff up to 8 attempts, and records `last_error`. Redis pub/sub wakes dispatchers early.
Events today: `admissions.student_enrolled`, `exams.results_published`,
`fees.payment_received`, `payroll.run_locked`. Consumers must be idempotent and tenant-aware.
This is an outbox, not a broker: there is no external bus yet.

## Upload scanning (`src/scanning/upload-scan.ts`)

`UPLOAD_SCAN=off` (default) accepts uploads as is. With `clamav`, a vault document is recorded in
`upload_scans` as `pending` and `vault_documents.scan_status` blocks download until a worker
streams it to clamd and marks it `clean`, or `infected` (kept, never served, audited with the
signature). If clamd is down the file stays quarantined and is retried (`error` after repeated
failures). Per-institution switch: flag `documents.virus_scan`. Only the vault is covered; other
upload paths are not yet scanned.

## Content licensing (`src/content/licensing.ts`, `platform/content-licenses.controller.ts`)

`content_licenses` holds rights holder, licence, expiry and optional `allowed_tenants` for a
course, topic or concept video. Platform admins manage them at `/v1/platform/content-licenses`.
Expired or not-allowed content is filtered out of content listings and search for other tenants.
Content without a row is unrestricted.

## Global search (`src/search/search.controller.ts`)

`GET /v1/search?q=&types=` over students, staff, courses, topics, documents and reports using
`pg_trgm` (migration 0080). Results are limited by role (students: office and academic roles;
staff: admin and HR) and by tenant row-level security, so an id or name never leaks to a role
that cannot open the record. Semantic (embedding) search is not built.
