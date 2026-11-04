# API authorization matrix

Generated from the Nest route metadata (`@Auth` principal kinds and roles, guards) by `test/authz/scan.ts`.
Regenerate: `cd services/api && UPDATE_AUTHZ=1 ./node_modules/.bin/vitest run test/authz-matrix.spec.ts`. The test fails when this file is stale or a route is flagged `PUBLIC?`.

## Summary

- Routes: 2895
- Public (no @Auth, no guard): 101 (all on the allow list below unless flagged)
- Any signed-in user (no role list): 312; open to students and families, so each must scope to the caller
- Flagged for review: 40

Flags: `PUBLIC?` no @Auth and not on the public allow list; `BROAD` a write on a staff-sounding path open to students, families or any user; `OWNERSHIP?` an id in the path, open to non-staff, and no sign that the handler or its service reads the caller (each was reviewed: see *Reviewed* below and docs/security/SECURITY_AUDIT.md).

## Public routes allowed

- `^\/(health|ready|live|metrics)(\/|$)|^\/v1\/(health|ready)`: health and readiness probes
- `^\/v1\/auth\/`: sign-in, OTP, refresh, SSO callbacks (rate limited)
- `^\/v1\/devices\/(enroll|enrol)`: board enrolment with a one-time code (rate limited)
- `^\/v1\/pairing\/`: board pairing handshake with an HMAC code (rate limited)
- `webhook|\/callback|\/return`: payment gateway webhooks and return pages (signature checked)
- `^\/v1\/(public|verify)\b|\/verify\/`: public verification of certificates and public forms (rate limited)
- `^\/v1\/(admissions|enquiries|leads)\/(public|apply|forms?)|\/public\/`: public admission enquiry and application forms (rate limited)
- `^\/v1\/(branding|institutions\/by-slug|tenants\/(by-slug|lookup))`: institution branding before sign-in
- `^\/v1\/platform\/`: platform team (PlatformAdminGuard)
- `^\/v1\/chat\/inbound$`: email relay and WhatsApp replies: shared x-zynetix-inbound-secret (timing-safe), signed reply address
- `^\/v1\/class-notes\/:token$`: shared class notes: unguessable share token, revocable
- `^\/v1\/content\/sims\/phet\/:id$`: open-licence PhET simulations (no personal data)
- `^\/v1\/device-ingest\/`: biometric attendance devices: per-device ingest key in the path or header
- `^\/v1\/digilocker\/pull\/:tenantId$`: DigiLocker pull URI: HMAC-SHA256 signature with the client secret
- `^\/v1\/library\/sip2$`: SIP2 self-check kiosks: SIP2 login with the kiosk credentials
- `^\/v1\/lti\/`: LTI 1.3 launches: OIDC state, nonce and platform JWKS signature
- `^\/v1\/odata`: OData feed for Power BI: scoped kxo. API token (hashed, revocable)
- `^\/v1\/scorm\/`: SCORM player: signed, expiring launch token
- `^\/v1\/fees\/gateway-return\/(:provider|cashfree)\/:tenantSlug$`: hosted-checkout browser return: the post is signature-checked like the webhook, Cashfree is re-queried with the account keys
- `^\/v1\/transport\/gps\/:tenantSlug$`: GPS tracker webhook: per-institution shared secret

## Reviewed

Flagged routes read by hand, and what protects them. IDOR is also exercised on 40 high-risk routes by `test/idor.e2e.spec.ts`.

- `^\/v1\/academic-audit\/non-conformities\/:id`: ncAccess(): the owner or the department head only
- `^\/v1\/alumni-portal\/`: rows filtered by the alumnus (own donations, stories, sign-ups)
- `^\/v1\/campus-life\/(clubs|events|media)\/`: club and event pages visible to the whole institution; media limited to published galleries
- `^\/v1\/careers\/`: own attempts / resumes via assertCanSeeStudent
- `^\/v1\/chat\/threads\/:id`: member(): only thread members; role and settings changes need a thread admin
- `^\/v1\/content\/(courses|topics)\/:id$`: syllabus content shared by the institution (no personal data)
- `^\/v1\/conversations\/:id`: conversation participants only
- `^\/v1\/documents\/vault\/files\/:id`: canRead(): owner-visible files of the caller or their child, or a manager
- `^\/v1\/evaluation\/allocations\/:id`: allocation must belong to the examiner
- `^\/v1\/exam-sessions\/:id\/registration-window$`: dates of the window only (no personal data)
- `^\/v1\/examiner-portal\/assignments\/:id`: mine(): the examiner's own assignment and role
- `^\/v1\/grievances\/`: complainant, assigned officer or committee only
- `^\/v1\/homework\/:id`: teacher of the class, or the student's own submission
- `^\/v1\/hostel\/gate-passes\/:id\/parent-`: guardian of the pass holder only
- `^\/v1\/houses\/:id$`: house names and points (institution-wide)
- `^\/v1\/hr\/evaluations$`: rater kind checked against the caller (self, student of the teacher, peer, head)
- `^\/v1\/library\/topics\/:topicId\/resources$`: library resources (no personal data)
- `^\/v1\/lms\/`: ownAttempt() / course enrolment
- `^\/v1\/parent\/children\/`: child(): guardian of the child, or the student themself
- `^\/v1\/passport\/students\/`: assertCanSeeStudent
- `^\/v1\/placements\/internships\/:id`: the intern or placement staff
- `^\/v1\/platform\/`: PlatformAdminGuard
- `^\/v1\/projects\/`: project members, guides and coordinators only
- `^\/v1\/recordings\/:id`: teacher of the class or enrolled students only
- `^\/v1\/records\/`: record kit: each entity's read and write roles (RecordsService.assertRead/assertWrite)
- `^\/v1\/recycle-bin\/:id$`: entries of entities the caller may write only
- `^\/v1\/research\/theses\/:id$`: scholar, guide or research staff
- `^\/v1\/users\/:id\/photo$`: maySee(): same class, family, or staff
- `^\/v1\/welfare\/requests\/:id\/withdraw$`: the requester only
- `^\/v1\/whiteboards\/:id`: the board's owner
- `^\/v1\/year-plans\/:id\/items$`: the plan's teacher or the head of department

## Routes

| Method | Path | Who | Flags |
| --- | --- | --- | --- |
| GET | `/health` | PUBLIC |  |
| GET | `/metrics` | PUBLIC |  |
| GET | `/ready` | PUBLIC |  |
| POST | `/v1/abc/credit-files` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/academic-audit/audits` | hod, principal, quality_officer, tenant_admin |  |
| POST | `/v1/academic-audit/audits` | hod, principal, quality_officer, tenant_admin |  |
| GET | `/v1/academic-audit/audits/:id` | hod, principal, quality_officer, tenant_admin |  |
| POST | `/v1/academic-audit/audits/:id/complete` | hod, principal, quality_officer, tenant_admin |  |
| POST | `/v1/academic-audit/audits/:id/non-conformities` | hod, principal, quality_officer, tenant_admin |  |
| PUT | `/v1/academic-audit/audits/:id/results/:resultId` | hod, principal, quality_officer, tenant_admin |  |
| GET | `/v1/academic-audit/non-conformities` | any signed-in user |  |
| PUT | `/v1/academic-audit/non-conformities/:id` | any signed-in user | BROAD reviewed |
| POST | `/v1/academic-audit/non-conformities/:id/close` | any signed-in user | BROAD reviewed |
| GET | `/v1/academic-audit/options` | hod, principal, quality_officer, tenant_admin |  |
| GET | `/v1/academic-audit/summary` | hod, principal, quality_officer, tenant_admin |  |
| GET | `/v1/academic-audit/templates` | hod, principal, quality_officer, tenant_admin |  |
| POST | `/v1/academic-audit/templates` | principal, quality_officer, tenant_admin |  |
| GET | `/v1/academic-audit/templates/:id` | hod, principal, quality_officer, tenant_admin |  |
| POST | `/v1/academic-audit/templates/:id/archive` | principal, quality_officer, tenant_admin |  |
| GET | `/v1/academic-docs/inbox` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/academic-docs/requests` | any signed-in user |  |
| POST | `/v1/academic-docs/requests/:id/decide` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/academic-docs/requests/:id/document.pdf` | any signed-in user |  |
| POST | `/v1/academic-docs/requests/:id/duplicate` | any signed-in user |  |
| POST | `/v1/academic-docs/requests/:id/issue` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/academic-docs/requests/:id/pay` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/academic-docs/requests/:id/reissue` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/academic-docs/students/:studentId/requests` | any signed-in user |  |
| GET | `/v1/academic-ids` | admissions_officer, exam_controller, principal, tenant_admin |  |
| GET | `/v1/academic-planning/baskets/:id/subjects` | admissions_officer, exam_controller, hod, principal, teacher, tenant_admin |  |
| PUT | `/v1/academic-planning/baskets/:id/subjects` | hod, principal, tenant_admin |  |
| GET | `/v1/academic-planning/batches` | admissions_officer, exam_controller, hod, principal, teacher, tenant_admin |  |
| PUT | `/v1/academic-planning/batches` | hod, principal, tenant_admin |  |
| POST | `/v1/academic-planning/batches/split` | hod, principal, tenant_admin |  |
| GET | `/v1/academic-planning/period-structure` | admissions_officer, exam_controller, hod, principal, teacher, tenant_admin |  |
| GET | `/v1/academic-planning/working-days` | admissions_officer, exam_controller, hod, principal, teacher, tenant_admin |  |
| GET | `/v1/academic-planning/workload` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/academics/activity/:id` | accountant, admissions_officer, hod, librarian, principal, teacher, tenant_admin |  |
| POST | `/v1/academics/assessments/:id/lock` | hod, principal, tenant_admin |  |
| GET | `/v1/academics/directory` | accountant, admissions_officer, hod, librarian, principal, teacher, tenant_admin |  |
| GET | `/v1/academics/guardians/:userId` | accountant, admissions_officer, hod, librarian, principal, teacher, tenant_admin |  |
| GET | `/v1/academics/handover/pending` | accountant, admissions_officer, hod, librarian, principal, teacher, tenant_admin |  |
| GET | `/v1/academics/lesson-plans` | accountant, admissions_officer, hod, librarian, principal, teacher, tenant_admin |  |
| POST | `/v1/academics/lesson-plans/:id/decide` | hod, principal, tenant_admin |  |
| POST | `/v1/academics/lesson-plans/:id/submit` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/academics/reports/:kind` | accountant, admissions_officer, hod, librarian, principal, teacher, tenant_admin |  |
| GET | `/v1/academics/reports/:kind/export` | accountant, admissions_officer, hod, librarian, principal, teacher, tenant_admin |  |
| GET | `/v1/academics/requests` | accountant, admissions_officer, guardian, hod, librarian, principal, teacher, tenant_admin |  |
| POST | `/v1/academics/requests` | accountant, admissions_officer, guardian, hod, librarian, principal, teacher, tenant_admin |  |
| GET | `/v1/academics/requests/:id` | accountant, admissions_officer, guardian, hod, librarian, principal, teacher, tenant_admin |  |
| POST | `/v1/academics/requests/:id/cancel` | accountant, admissions_officer, guardian, hod, librarian, principal, teacher, tenant_admin |  |
| POST | `/v1/academics/requests/:id/decide` | accountant, admissions_officer, hod, librarian, principal, teacher, tenant_admin |  |
| GET | `/v1/academics/sections/:id` | accountant, admissions_officer, hod, librarian, principal, teacher, tenant_admin |  |
| GET | `/v1/academics/settings` | accountant, admissions_officer, hod, librarian, principal, teacher, tenant_admin |  |
| PUT | `/v1/academics/settings/:kind` | principal, tenant_admin |  |
| GET | `/v1/academics/subjects/:id` | accountant, admissions_officer, hod, librarian, principal, teacher, tenant_admin |  |
| GET | `/v1/academics/teachers/:id` | accountant, admissions_officer, hod, librarian, principal, teacher, tenant_admin |  |
| GET | `/v1/access-devices` | hr_manager, librarian, principal, tenant_admin, transport_manager |  |
| POST | `/v1/access-devices` | hr_manager, librarian, principal, tenant_admin, transport_manager |  |
| PUT | `/v1/access-devices/:id/active` | hr_manager, librarian, principal, tenant_admin, transport_manager |  |
| POST | `/v1/access-devices/:id/rotate-key` | hr_manager, librarian, principal, tenant_admin, transport_manager |  |
| GET | `/v1/accounts-depth/bank-accounts` | accountant, principal, tenant_admin |  |
| POST | `/v1/accounts-depth/bank/auto-match` | accountant, principal, tenant_admin |  |
| GET | `/v1/accounts-depth/bank/lines` | accountant, principal, tenant_admin |  |
| GET | `/v1/accounts-depth/bank/lines/:id/candidates` | accountant, principal, tenant_admin |  |
| POST | `/v1/accounts-depth/bank/lines/:id/ignore` | accountant, principal, tenant_admin |  |
| POST | `/v1/accounts-depth/bank/lines/:id/match` | accountant, principal, tenant_admin |  |
| POST | `/v1/accounts-depth/bank/lines/:id/settlement` | accountant, principal, tenant_admin |  |
| POST | `/v1/accounts-depth/bank/lines/:id/unmatch` | accountant, principal, tenant_admin |  |
| GET | `/v1/accounts-depth/bank/reconciliation` | accountant, principal, tenant_admin |  |
| GET | `/v1/accounts-depth/bank/statements` | accountant, principal, tenant_admin |  |
| POST | `/v1/accounts-depth/bank/statements` | accountant, principal, tenant_admin |  |
| GET | `/v1/accounts-depth/funds` | accountant, principal, tenant_admin |  |
| GET | `/v1/accounts-depth/settlements/bank-status` | accountant, principal, tenant_admin |  |
| GET | `/v1/accreditation/:fw/aqar.xlsx` | principal, quality_officer, tenant_admin |  |
| GET | `/v1/accreditation/:fw/dvv.xlsx` | accreditation_reviewer, hod, principal, quality_officer, tenant_admin |  |
| GET | `/v1/accreditation/:fw/evidence-pack.zip` | principal, quality_officer, tenant_admin |  |
| GET | `/v1/accreditation/:fw/evidence-repository` | accreditation_reviewer, hod, principal, quality_officer, tenant_admin |  |
| GET | `/v1/accreditation/:fw/export.xlsx` | accreditation_reviewer, hod, principal, quality_officer, tenant_admin |  |
| GET | `/v1/accreditation/:fw/export.zip` | principal, quality_officer, tenant_admin |  |
| GET | `/v1/accreditation/:fw/metrics/:code` | accreditation_reviewer, hod, principal, quality_officer, teacher, tenant_admin |  |
| PUT | `/v1/accreditation/:fw/metrics/:code` | accreditation_reviewer, hod, principal, quality_officer, teacher, tenant_admin |  |
| GET | `/v1/accreditation/:fw/metrics/:code/comments` | accreditation_reviewer, hod, principal, quality_officer, teacher, tenant_admin |  |
| POST | `/v1/accreditation/:fw/metrics/:code/comments` | accreditation_reviewer, hod, principal, quality_officer, teacher, tenant_admin |  |
| GET | `/v1/accreditation/:fw/metrics/:code/evidence` | accreditation_reviewer, hod, principal, quality_officer, teacher, tenant_admin |  |
| POST | `/v1/accreditation/:fw/metrics/:code/evidence` | accreditation_reviewer, hod, principal, quality_officer, teacher, tenant_admin |  |
| POST | `/v1/accreditation/:fw/metrics/:code/import` | accreditation_reviewer, hod, principal, quality_officer, teacher, tenant_admin |  |
| GET | `/v1/accreditation/:fw/metrics/:code/template.xlsx` | accreditation_reviewer, hod, principal, quality_officer, teacher, tenant_admin |  |
| GET | `/v1/accreditation/:fw/overview` | accreditation_reviewer, hod, principal, quality_officer, tenant_admin |  |
| GET | `/v1/accreditation/:fw/readiness` | accreditation_reviewer, hod, principal, quality_officer, tenant_admin |  |
| GET | `/v1/accreditation/:fw/settings` | accreditation_reviewer, hod, principal, quality_officer, tenant_admin |  |
| PUT | `/v1/accreditation/:fw/settings` | principal, quality_officer, tenant_admin |  |
| GET | `/v1/accreditation/:fw/tasks` | accreditation_reviewer, hod, principal, quality_officer, tenant_admin |  |
| POST | `/v1/accreditation/:fw/tasks` | hod, principal, quality_officer, tenant_admin |  |
| POST | `/v1/accreditation/:fw/tasks/remind` | hod, principal, quality_officer, tenant_admin |  |
| GET | `/v1/accreditation/dvv` | accreditation_reviewer, hod, principal, quality_officer, tenant_admin |  |
| POST | `/v1/accreditation/dvv` | accreditation_reviewer, principal, quality_officer, tenant_admin |  |
| PUT | `/v1/accreditation/dvv/:id` | accreditation_reviewer, principal, quality_officer, tenant_admin |  |
| GET | `/v1/accreditation/dvv/:id/documents` | accreditation_reviewer, hod, principal, quality_officer, tenant_admin |  |
| POST | `/v1/accreditation/dvv/:id/documents` | principal, quality_officer, tenant_admin |  |
| DELETE | `/v1/accreditation/evidence/:id` | principal, quality_officer, tenant_admin |  |
| PUT | `/v1/accreditation/evidence/:id` | principal, quality_officer, tenant_admin |  |
| GET | `/v1/accreditation/evidence/:id/download` | accreditation_reviewer, hod, principal, quality_officer, tenant_admin |  |
| POST | `/v1/accreditation/evidence/:id/file` | principal, quality_officer, tenant_admin |  |
| GET | `/v1/accreditation/faculty-evidence` | hod, principal, quality_officer, tenant_admin |  |
| POST | `/v1/accreditation/faculty-evidence/:id/verify` | principal, quality_officer, tenant_admin |  |
| GET | `/v1/accreditation/frameworks` | accreditation_reviewer, hod, principal, quality_officer, teacher, tenant_admin |  |
| GET | `/v1/accreditation/frameworks/:fw` | accreditation_reviewer, hod, principal, quality_officer, teacher, tenant_admin |  |
| PUT | `/v1/accreditation/iqac/actions/:id` | principal, quality_officer, tenant_admin |  |
| GET | `/v1/accreditation/iqac/atr.xlsx` | hod, principal, quality_officer, tenant_admin |  |
| GET | `/v1/accreditation/iqac/feedback-analysis` | hod, principal, quality_officer, tenant_admin |  |
| GET | `/v1/accreditation/iqac/feedback-reports` | hod, principal, quality_officer, tenant_admin |  |
| POST | `/v1/accreditation/iqac/feedback-reports` | principal, quality_officer, tenant_admin |  |
| PUT | `/v1/accreditation/iqac/feedback-reports/:id` | principal, quality_officer, tenant_admin |  |
| GET | `/v1/accreditation/iqac/meetings` | hod, principal, quality_officer, tenant_admin |  |
| POST | `/v1/accreditation/iqac/meetings` | principal, quality_officer, tenant_admin |  |
| PUT | `/v1/accreditation/iqac/meetings/:id` | principal, quality_officer, tenant_admin |  |
| POST | `/v1/accreditation/iqac/meetings/:id/actions` | principal, quality_officer, tenant_admin |  |
| GET | `/v1/accreditation/iqac/practices` | hod, principal, quality_officer, tenant_admin |  |
| POST | `/v1/accreditation/iqac/practices` | principal, quality_officer, tenant_admin |  |
| DELETE | `/v1/accreditation/iqac/practices/:id` | principal, quality_officer, tenant_admin |  |
| PUT | `/v1/accreditation/iqac/practices/:id` | principal, quality_officer, tenant_admin |  |
| GET | `/v1/accreditation/iqac/summary` | accreditation_reviewer, hod, principal, quality_officer, tenant_admin |  |
| GET | `/v1/accreditation/my-evidence` | hod, principal, quality_officer, teacher, tenant_admin |  |
| POST | `/v1/accreditation/my-evidence` | hod, principal, quality_officer, teacher, tenant_admin |  |
| POST | `/v1/accreditation/my-evidence/:id/file` | hod, principal, quality_officer, teacher, tenant_admin |  |
| GET | `/v1/accreditation/my-tasks` | accreditation_reviewer, hod, principal, quality_officer, teacher, tenant_admin |  |
| GET | `/v1/accreditation/people` | hod, principal, quality_officer, tenant_admin |  |
| DELETE | `/v1/accreditation/tasks/:id` | hod, principal, quality_officer, tenant_admin |  |
| PUT | `/v1/accreditation/tasks/:id` | accreditation_reviewer, hod, principal, quality_officer, teacher, tenant_admin |  |
| GET | `/v1/admin/access/matrix` | principal, tenant_admin |  |
| PUT | `/v1/admin/access/matrix` | principal, tenant_admin |  |
| POST | `/v1/admin/access/matrix/copy` | principal, tenant_admin |  |
| GET | `/v1/admin/access/matrix/history` | principal, tenant_admin |  |
| POST | `/v1/admin/access/matrix/reset` | principal, tenant_admin |  |
| GET | `/v1/admin/access/reports/approvals` | principal, tenant_admin |  |
| GET | `/v1/admin/access/reports/sign-ins` | principal, tenant_admin |  |
| GET | `/v1/admin/access/reports/usage` | principal, tenant_admin |  |
| GET | `/v1/admin/access/users/:id` | principal, tenant_admin |  |
| PUT | `/v1/admin/access/users/:id/roles` | principal, tenant_admin |  |
| DELETE | `/v1/admin/access/users/:id/sessions/:sid` | principal, tenant_admin |  |
| POST | `/v1/admin/access/users/:id/sign-out` | principal, tenant_admin |  |
| GET | `/v1/admin/analytics/admissions` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admin/analytics/attendance-week` | hod, principal, tenant_admin |  |
| GET | `/v1/admin/analytics/health` | hod, principal, tenant_admin |  |
| GET | `/v1/admin/attendance` | hod, principal, tenant_admin |  |
| GET | `/v1/admin/branding` | accountant, hr_manager, principal, tenant_admin |  |
| PUT | `/v1/admin/branding` | principal, tenant_admin |  |
| DELETE | `/v1/admin/branding/assets/:kind` | principal, tenant_admin |  |
| GET | `/v1/admin/branding/assets/:kind` | accountant, hr_manager, principal, tenant_admin |  |
| PUT | `/v1/admin/branding/assets/:kind` | principal, tenant_admin |  |
| POST | `/v1/admin/calendar` | principal, tenant_admin |  |
| DELETE | `/v1/admin/calendar/:id` | principal, tenant_admin |  |
| PUT | `/v1/admin/calendar/:id` | principal, tenant_admin |  |
| POST | `/v1/admin/calendar/publish` | principal, tenant_admin |  |
| GET | `/v1/admin/classes` | hod, principal, tenant_admin |  |
| GET | `/v1/admin/consents` | principal, tenant_admin |  |
| GET | `/v1/admin/dashboard` | accountant, admissions_officer, hod, hr_manager, principal, tenant_admin |  |
| GET | `/v1/admin/data-exports` | principal, tenant_admin |  |
| POST | `/v1/admin/data-exports` | principal, tenant_admin |  |
| DELETE | `/v1/admin/data-exports/:id` | principal, tenant_admin |  |
| GET | `/v1/admin/data-exports/:id/download` | principal, tenant_admin |  |
| POST | `/v1/admin/data-migration/:entity/preview` | principal, tenant_admin |  |
| POST | `/v1/admin/data-migration/:entity/run` | principal, tenant_admin |  |
| GET | `/v1/admin/data-migration/batches` | principal, tenant_admin |  |
| GET | `/v1/admin/data-migration/batches/:id` | principal, tenant_admin |  |
| POST | `/v1/admin/data-migration/batches/:id/rollback` | principal, tenant_admin |  |
| GET | `/v1/admin/data-migration/entities` | principal, tenant_admin |  |
| GET | `/v1/admin/data-migration/mappings` | principal, tenant_admin |  |
| POST | `/v1/admin/data-migration/mappings/:entity` | principal, tenant_admin |  |
| DELETE | `/v1/admin/data-migration/mappings/:id` | principal, tenant_admin |  |
| GET | `/v1/admin/departments` | principal, tenant_admin |  |
| POST | `/v1/admin/departments` | principal, tenant_admin |  |
| DELETE | `/v1/admin/departments/:id` | principal, tenant_admin |  |
| PUT | `/v1/admin/departments/:id` | principal, tenant_admin |  |
| GET | `/v1/admin/devices` | hod, principal, tenant_admin |  |
| GET | `/v1/admin/features` | principal, tenant_admin |  |
| PUT | `/v1/admin/features/:key` | principal, tenant_admin |  |
| GET | `/v1/admin/homework` | hod, principal, tenant_admin |  |
| POST | `/v1/admin/import/:kind` | principal, tenant_admin |  |
| GET | `/v1/admin/import/templates/:kind` | principal, tenant_admin |  |
| GET | `/v1/admin/institution/attendance-overrides` | principal, tenant_admin |  |
| DELETE | `/v1/admin/institution/attendance-overrides/:programId` | principal, tenant_admin |  |
| PUT | `/v1/admin/institution/attendance-overrides/:programId` | principal, tenant_admin |  |
| GET | `/v1/admin/institution/boards` | principal, tenant_admin |  |
| POST | `/v1/admin/institution/boards` | principal, tenant_admin |  |
| PUT | `/v1/admin/institution/boards/:id` | principal, tenant_admin |  |
| POST | `/v1/admin/institution/boards/:id/primary` | principal, tenant_admin |  |
| GET | `/v1/admin/institution/buildings` | principal, tenant_admin |  |
| POST | `/v1/admin/institution/buildings` | principal, tenant_admin |  |
| POST | `/v1/admin/institution/buildings/:id/floors` | principal, tenant_admin |  |
| GET | `/v1/admin/institution/campus-overview` | principal, tenant_admin, university_admin |  |
| GET | `/v1/admin/institution/campus-settings` | principal, tenant_admin |  |
| PUT | `/v1/admin/institution/campus-settings/:campusId` | principal, tenant_admin |  |
| GET | `/v1/admin/institution/fee-structures` | accountant, principal, tenant_admin |  |
| POST | `/v1/admin/institution/fee-structures` | accountant, principal, tenant_admin |  |
| POST | `/v1/admin/institution/fee-structures/:id/issue` | accountant, principal, tenant_admin |  |
| GET | `/v1/admin/institution/presets` | principal, tenant_admin |  |
| POST | `/v1/admin/institution/presets/:key/apply` | principal, tenant_admin |  |
| GET | `/v1/admin/institution/profile` | principal, tenant_admin |  |
| PUT | `/v1/admin/institution/profile` | principal, tenant_admin |  |
| PUT | `/v1/admin/institution/rooms/:roomId/floor` | principal, tenant_admin |  |
| GET | `/v1/admin/institution/setup` | principal, tenant_admin |  |
| PUT | `/v1/admin/institution/setup` | principal, tenant_admin |  |
| GET | `/v1/admin/notification-settings` | principal, tenant_admin |  |
| PUT | `/v1/admin/notification-settings` | principal, tenant_admin |  |
| GET | `/v1/admin/overview` | hod, principal, tenant_admin |  |
| GET | `/v1/admin/payments/gateway` | principal, tenant_admin |  |
| PUT | `/v1/admin/payments/gateway` | principal, tenant_admin |  |
| DELETE | `/v1/admin/payments/gateways` | principal, tenant_admin |  |
| GET | `/v1/admin/payments/gateways` | principal, tenant_admin |  |
| PUT | `/v1/admin/payments/gateways` | principal, tenant_admin |  |
| POST | `/v1/admin/payments/gateways/:scope/test` | principal, tenant_admin |  |
| DELETE | `/v1/admin/payments/razorpay` | principal, tenant_admin |  |
| GET | `/v1/admin/payments/razorpay` | principal, tenant_admin |  |
| PUT | `/v1/admin/payments/razorpay` | principal, tenant_admin |  |
| POST | `/v1/admin/payments/razorpay/test` | principal, tenant_admin |  |
| GET | `/v1/admin/recordings/retention` | principal, tenant_admin |  |
| GET | `/v1/admin/rooms` | principal, tenant_admin |  |
| PATCH | `/v1/admin/rooms/:id` | principal, tenant_admin |  |
| GET | `/v1/admin/security-policy` | principal, tenant_admin |  |
| PUT | `/v1/admin/security-policy` | principal, tenant_admin |  |
| GET | `/v1/admin/settings` | principal, tenant_admin |  |
| PUT | `/v1/admin/settings` | principal, tenant_admin |  |
| GET | `/v1/admin/sso/providers` | principal, tenant_admin |  |
| POST | `/v1/admin/sso/providers` | principal, tenant_admin |  |
| DELETE | `/v1/admin/sso/providers/:id` | principal, tenant_admin |  |
| PATCH | `/v1/admin/sso/providers/:id` | principal, tenant_admin |  |
| GET | `/v1/admin/staff` | principal, tenant_admin |  |
| GET | `/v1/admin/structure` | accountant, admissions_officer, exam_controller, hod, principal, tenant_admin |  |
| PUT | `/v1/admin/subjects/:id/course` | principal, tenant_admin |  |
| POST | `/v1/admin/terms` | principal, tenant_admin |  |
| DELETE | `/v1/admin/terms/:id` | principal, tenant_admin |  |
| PUT | `/v1/admin/terms/:id` | principal, tenant_admin |  |
| GET | `/v1/admin/timetable` | principal, tenant_admin |  |
| POST | `/v1/admin/timetable/slots` | principal, tenant_admin |  |
| DELETE | `/v1/admin/timetable/slots/:id` | principal, tenant_admin |  |
| PATCH | `/v1/admin/timetable/slots/:id` | principal, tenant_admin |  |
| GET | `/v1/admin/trusted-devices` | principal, tenant_admin |  |
| POST | `/v1/admin/trusted-devices/:id/revoke` | principal, tenant_admin |  |
| POST | `/v1/admin/users/:id/mfa/reset` | principal, tenant_admin |  |
| POST | `/v1/admin/users/:id/reset-password` | principal, tenant_admin |  |
| GET | `/v1/admissions/agents` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/agents` | admissions_officer, principal, tenant_admin |  |
| PATCH | `/v1/admissions/agents/:id` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/agents/:id/payouts` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/allotments/:id/respond` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/applications` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/applications/:id` | admissions_officer, principal, tenant_admin |  |
| PATCH | `/v1/admissions/applications/:id/admission-kind` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/applications/:id/admission-letter` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/applications/:id/admit` | admissions_officer, principal, tenant_admin |  |
| PUT | `/v1/admissions/applications/:id/agent` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/applications/:id/category` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/applications/:id/checklist` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/applications/:id/checklist` | admissions_officer, principal, tenant_admin |  |
| PUT | `/v1/admissions/applications/:id/claims` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/applications/:id/custody` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/applications/:id/desk` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/applications/:id/documents/:docId/file` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/applications/:id/documents/:docId/review` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/applications/:id/duplicates` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/applications/:id/enroll` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/applications/:id/fee/counter` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/applications/:id/fee/waive` | principal, tenant_admin |  |
| PUT | `/v1/admissions/applications/:id/index-marks` | admissions_officer, principal, tenant_admin |  |
| PUT | `/v1/admissions/applications/:id/preferences` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/applications/:id/prior-education` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/applications/:id/prior-education` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/applications/:id/provisional` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/applications/:id/refund-quote` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/applications/:id/request-correction` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/applications/:id/requests` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/applications/:id/scholarships` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/applications/:id/status` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/awaiting-register-no` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/broadcasts` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/broadcasts` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/broadcasts/:id/sends` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/broadcasts/preview` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/campaigns` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/campaigns` | admissions_officer, principal, tenant_admin |  |
| PATCH | `/v1/admissions/campaigns/:id` | admissions_officer, principal, tenant_admin |  |
| PATCH | `/v1/admissions/checklist-items/:id` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/commission-rules` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/commission-rules` | admissions_officer, principal, tenant_admin |  |
| DELETE | `/v1/admissions/commission-rules/:id` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/commissions` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/commissions/pay` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/counsellors` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/custody/:id/return` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/cycles` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/cycles` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/cycles/:id` | admissions_officer, principal, tenant_admin |  |
| PATCH | `/v1/admissions/cycles/:id` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/cycles/:id/entrance-results` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/cycles/:id/evaluate` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/cycles/:id/expire-offers` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/cycles/:id/external-allotments` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/cycles/:id/index-formula` | admissions_officer, principal, tenant_admin |  |
| PUT | `/v1/admissions/cycles/:id/index-formula` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/cycles/:id/landing` | admissions_officer, principal, tenant_admin |  |
| PUT | `/v1/admissions/cycles/:id/landing` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/cycles/:id/merit-lists` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/cycles/:id/merit-lists` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/cycles/:id/profile-eligibility` | admissions_officer, principal, tenant_admin |  |
| PUT | `/v1/admissions/cycles/:id/profile-eligibility` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/cycles/:id/quotas` | admissions_officer, principal, tenant_admin |  |
| PUT | `/v1/admissions/cycles/:id/quotas` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/cycles/:id/rank-list` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/cycles/:id/rank-list` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/cycles/:id/reservation` | admissions_officer, principal, tenant_admin |  |
| PUT | `/v1/admissions/cycles/:id/reservation` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/cycles/:id/reservation/dereserve` | principal, tenant_admin |  |
| GET | `/v1/admissions/cycles/:id/rounds` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/cycles/:id/rounds` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/cycles/:id/seat-matrix` | admissions_officer, principal, tenant_admin |  |
| PUT | `/v1/admissions/cycles/:id/seat-matrix` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/cycles/:id/status` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/cycles/:id/waitlist` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/cycles/:id/waitlist/promote` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/desk/funnel` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/desk/reports/:kind` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/enquiries` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/enquiries` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/enquiries/:id` | admissions_officer, principal, tenant_admin |  |
| PATCH | `/v1/admissions/enquiries/:id` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/enquiries/:id/activities` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/enquiries/:id/assign` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/enquiries/:id/duplicates` | admissions_officer, counsellor, principal, tenant_admin |  |
| POST | `/v1/admissions/enquiries/:id/merge` | admissions_officer, counsellor, principal, tenant_admin |  |
| POST | `/v1/admissions/enquiries/:id/message` | admissions_officer, counsellor, principal, tenant_admin |  |
| POST | `/v1/admissions/enquiries/:id/opt-out` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/enquiries/:id/stage` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/entrance-questions` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/entrance-questions` | admissions_officer, principal, tenant_admin |  |
| DELETE | `/v1/admissions/entrance-questions/:id` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/entrance-tests` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/entrance-tests` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/entrance-tests/:id/allocate` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/entrance-tests/:id/attempts` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/entrance-tests/:id/hall-ticket/:applicationId` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/entrance-tests/:id/halls` | admissions_officer, principal, tenant_admin |  |
| PUT | `/v1/admissions/entrance-tests/:id/online` | admissions_officer, principal, tenant_admin |  |
| PUT | `/v1/admissions/entrance-tests/:id/scores` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/entrance-tests/:id/seating` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/index-marks/bulk` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/index-presets` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/interviews` | admissions_officer, hod, principal, teacher, tenant_admin |  |
| POST | `/v1/admissions/interviews` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/interviews/:id` | admissions_officer, hod, principal, teacher, tenant_admin |  |
| PATCH | `/v1/admissions/interviews/:id` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/interviews/:id/complete` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/interviews/:id/no-show` | admissions_officer, principal, tenant_admin |  |
| PUT | `/v1/admissions/interviews/:id/sheet` | admissions_officer, hod, principal, teacher, tenant_admin |  |
| GET | `/v1/admissions/lead-connectors` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/lead-connectors` | admissions_officer, principal, tenant_admin |  |
| PATCH | `/v1/admissions/lead-connectors/:id` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/lead-spend` | admissions_officer, principal, tenant_admin |  |
| PUT | `/v1/admissions/lead-spend` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/lead-templates` | admissions_officer, counsellor, principal, tenant_admin |  |
| GET | `/v1/admissions/merit-lists/:id` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/merit-lists/:id/publish` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/online-configs` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/pass/catalog` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/payouts` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/pipeline` | admissions_officer, principal, tenant_admin |  |
| DELETE | `/v1/admissions/prior-education/:id` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/programme-settings` | admissions_officer, principal, tenant_admin |  |
| PUT | `/v1/admissions/programme-settings/:programId` | principal, tenant_admin |  |
| GET | `/v1/admissions/provisional-follow-ups` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/refund-slabs/ugc` | principal, tenant_admin |  |
| GET | `/v1/admissions/reports/campaigns` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/requests/:id/decide` | principal, tenant_admin |  |
| GET | `/v1/admissions/returns/aishe` | admissions_officer, exam_controller, principal, quality_officer, tenant_admin |  |
| GET | `/v1/admissions/returns/approval-list` | admissions_officer, exam_controller, principal, quality_officer, tenant_admin |  |
| GET | `/v1/admissions/returns/intake` | admissions_officer, exam_controller, principal, quality_officer, tenant_admin |  |
| GET | `/v1/admissions/rounds/:id/allotments` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/rounds/:id/close` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/rounds/:id/publish` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/source-roi` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/students/:id/credentials` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/admissions/students/:id/credentials` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/admissions/students/:id/prior-education` | admissions_officer, hod, principal, teacher, tenant_admin |  |
| POST | `/v1/admissions/students/:id/prior-education` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/affiliation` | exam_controller, hod, principal, teacher, tenant_admin |  |
| PUT | `/v1/affiliation` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/affiliation/history` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/affiliation/marks-card/:studentId` | any signed-in user |  |
| PUT | `/v1/affiliation/overrides` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/affiliation/profiles` | exam_controller, hod, principal, teacher, tenant_admin |  |
| GET | `/v1/affiliation/profiles/:code` | exam_controller, hod, principal, teacher, tenant_admin |  |
| DELETE | `/v1/affiliation/programmes/:programId` | exam_controller, principal, tenant_admin |  |
| PUT | `/v1/affiliation/programmes/:programId` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/affiliation/result-sheet` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/affiliation/rules` | exam_controller, hod, principal, teacher, tenant_admin |  |
| POST | `/v1/affiliation/tabulation-template` | exam_controller, principal, tenant_admin |  |
| PUT | `/v1/ai/actions/:id/decision` | any signed-in user |  |
| GET | `/v1/ai/admin/actions` | principal, quality_officer, tenant_admin |  |
| GET | `/v1/ai/admin/actions/summary` | principal, quality_officer, tenant_admin |  |
| GET | `/v1/ai/admin/evals/cases` | principal, quality_officer, tenant_admin |  |
| POST | `/v1/ai/admin/evals/cases` | principal, quality_officer, tenant_admin |  |
| DELETE | `/v1/ai/admin/evals/cases/:id` | principal, quality_officer, tenant_admin |  |
| POST | `/v1/ai/admin/evals/run` | principal, quality_officer, tenant_admin |  |
| GET | `/v1/ai/admin/evals/runs` | principal, quality_officer, tenant_admin |  |
| POST | `/v1/ai/board-summary` | hod, principal, teacher, tenant_admin; board token |  |
| POST | `/v1/ai/explain` | hod, principal, student, teacher, tenant_admin; board token |  |
| POST | `/v1/ai/homework` | hod, principal, teacher, tenant_admin; board token |  |
| POST | `/v1/ai/insights/admissions` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/ai/insights/careers` | hod, placement_officer, principal, tenant_admin |  |
| POST | `/v1/ai/insights/finance` | accountant, principal, tenant_admin |  |
| POST | `/v1/ai/insights/hr` | hr_manager, principal, tenant_admin |  |
| POST | `/v1/ai/insights/quality` | principal, quality_officer, tenant_admin |  |
| POST | `/v1/ai/insights/research` | hod, principal, research_coordinator, tenant_admin |  |
| POST | `/v1/ai/lecture` | hod, principal, teacher, tenant_admin; board token |  |
| POST | `/v1/ai/lesson-plan` | hod, principal, teacher, tenant_admin; board token |  |
| POST | `/v1/ai/parent/children/:studentId/insight` | guardian |  |
| POST | `/v1/ai/quiz` | hod, principal, teacher, tenant_admin; board token |  |
| POST | `/v1/ai/read-board` | hod, principal, teacher, tenant_admin; board token |  |
| POST | `/v1/ai/select-ask` | hod, principal, teacher, tenant_admin; board token |  |
| POST | `/v1/ai/tutor/ask` | student |  |
| GET | `/v1/ai/tutor/threads` | student |  |
| DELETE | `/v1/ai/tutor/threads/:id` | student |  |
| GET | `/v1/ai/tutor/threads/:id` | student |  |
| GET | `/v1/ai/usage` | principal, tenant_admin |  |
| GET | `/v1/alumni-portal/campaigns` | alumni |  |
| POST | `/v1/alumni-portal/campaigns/:id/pledges` | alumni |  |
| GET | `/v1/alumni-portal/donations/:id/receipt` | alumni |  |
| POST | `/v1/alumni-portal/feedback` | alumni |  |
| GET | `/v1/alumni-portal/giving` | alumni |  |
| GET | `/v1/alumni-portal/jobs` | alumni |  |
| POST | `/v1/alumni-portal/jobs` | alumni |  |
| POST | `/v1/alumni-portal/link` | placement_officer, principal, tenant_admin |  |
| GET | `/v1/alumni-portal/me` | alumni |  |
| PUT | `/v1/alumni-portal/me` | alumni |  |
| GET | `/v1/alumni-portal/referrals` | alumni |  |
| POST | `/v1/alumni-portal/referrals/:id/status` | alumni |  |
| GET | `/v1/alumni-portal/stories` | alumni |  |
| POST | `/v1/alumni-portal/stories` | alumni |  |
| PUT | `/v1/alumni-portal/stories/:id` | alumni |  |
| POST | `/v1/alumni-portal/stories/:id/submit` | alumni |  |
| GET | `/v1/alumni-portal/volunteering` | alumni |  |
| DELETE | `/v1/alumni-portal/volunteering/:id/signup` | alumni |  |
| POST | `/v1/alumni-portal/volunteering/:id/signup` | alumni |  |
| GET | `/v1/alumni-stories` | any signed-in user |  |
| GET | `/v1/alumni/campaigns` | accountant, placement_officer, principal, tenant_admin |  |
| POST | `/v1/alumni/campaigns` | accountant, placement_officer, principal, tenant_admin |  |
| GET | `/v1/alumni/campaigns/:id` | accountant, placement_officer, principal, tenant_admin |  |
| PUT | `/v1/alumni/campaigns/:id` | accountant, placement_officer, principal, tenant_admin |  |
| POST | `/v1/alumni/campaigns/:id/donations` | accountant, placement_officer, principal, tenant_admin |  |
| POST | `/v1/alumni/campaigns/:id/pledges` | accountant, placement_officer, principal, tenant_admin |  |
| GET | `/v1/alumni/donations` | accountant, placement_officer, principal, tenant_admin |  |
| GET | `/v1/alumni/donations/:id/receipt` | accountant, placement_officer, principal, tenant_admin |  |
| PATCH | `/v1/alumni/pledges/:id` | accountant, placement_officer, principal, tenant_admin |  |
| GET | `/v1/alumni/volunteering` | placement_officer, principal, tenant_admin |  |
| POST | `/v1/alumni/volunteering` | placement_officer, principal, tenant_admin |  |
| PUT | `/v1/alumni/volunteering/:id` | placement_officer, principal, tenant_admin |  |
| POST | `/v1/alumni/volunteering/:id/signups` | placement_officer, principal, tenant_admin |  |
| DELETE | `/v1/alumni/volunteering/:id/signups/:alumniId` | placement_officer, principal, tenant_admin |  |
| GET | `/v1/analytics/accreditation/:framework` | principal, tenant_admin (+FeatureGuard, FeatureGuard) |  |
| GET | `/v1/analytics/classroom` | hod, principal, tenant_admin (+FeatureGuard, FeatureGuard) |  |
| GET | `/v1/analytics/custom-reports` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| POST | `/v1/analytics/custom-reports` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| DELETE | `/v1/analytics/custom-reports/:id` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| PUT | `/v1/analytics/custom-reports/:id` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| GET | `/v1/analytics/custom-reports/:id/export` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| POST | `/v1/analytics/custom-reports/:id/run` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| DELETE | `/v1/analytics/custom-reports/:id/schedule` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| POST | `/v1/analytics/custom-reports/:id/schedule` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| GET | `/v1/analytics/custom-reports/datasets` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| POST | `/v1/analytics/custom-reports/preview` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| GET | `/v1/analytics/drilldown` | accountant, hod, hr_manager, principal, tenant_admin (+FeatureGuard) |  |
| GET | `/v1/analytics/filters` | accountant, hod, hr_manager, principal, tenant_admin (+FeatureGuard) |  |
| GET | `/v1/analytics/kpis` | principal, tenant_admin (+FeatureGuard) |  |
| GET | `/v1/analytics/reports` | accountant, hod, hr_manager, principal, tenant_admin (+FeatureGuard) |  |
| GET | `/v1/analytics/reports/:key/export` | accountant, hod, hr_manager, principal, tenant_admin (+FeatureGuard) |  |
| POST | `/v1/analytics/reports/:key/run` | accountant, hod, hr_manager, principal, tenant_admin (+FeatureGuard) |  |
| GET | `/v1/analytics/runs` | accountant, hod, hr_manager, principal, tenant_admin (+FeatureGuard) |  |
| GET | `/v1/analytics/schedules` | accountant, hod, hr_manager, principal, tenant_admin (+FeatureGuard) |  |
| POST | `/v1/analytics/schedules` | accountant, hod, hr_manager, principal, tenant_admin (+FeatureGuard) |  |
| DELETE | `/v1/analytics/schedules/:id` | accountant, hod, hr_manager, principal, tenant_admin (+FeatureGuard) |  |
| PATCH | `/v1/analytics/schedules/:id` | accountant, hod, hr_manager, principal, tenant_admin (+FeatureGuard) |  |
| GET | `/v1/analytics/studio/catalogue` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| GET | `/v1/analytics/studio/dashboards` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| POST | `/v1/analytics/studio/dashboards` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| DELETE | `/v1/analytics/studio/dashboards/:id` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| GET | `/v1/analytics/studio/dashboards/:id` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| PUT | `/v1/analytics/studio/dashboards/:id` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| POST | `/v1/analytics/studio/dashboards/:id/data` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| POST | `/v1/analytics/studio/dashboards/:id/duplicate` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| GET | `/v1/analytics/studio/dashboards/home` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| GET | `/v1/analytics/studio/datasets/:key/values/:field` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| POST | `/v1/analytics/studio/drill` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| POST | `/v1/analytics/studio/export` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| PUT | `/v1/analytics/studio/favourites` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| GET | `/v1/analytics/studio/folders` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| POST | `/v1/analytics/studio/folders/rename` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| POST | `/v1/analytics/studio/formula` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| GET | `/v1/analytics/studio/library` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| GET | `/v1/analytics/studio/library/:key` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| POST | `/v1/analytics/studio/library/:key/run` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| GET | `/v1/analytics/studio/people` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| POST | `/v1/analytics/studio/preview` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| GET | `/v1/analytics/studio/reports` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| POST | `/v1/analytics/studio/reports` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| DELETE | `/v1/analytics/studio/reports/:id` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| GET | `/v1/analytics/studio/reports/:id` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| PATCH | `/v1/analytics/studio/reports/:id` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| PUT | `/v1/analytics/studio/reports/:id` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| POST | `/v1/analytics/studio/reports/:id/duplicate` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| POST | `/v1/analytics/studio/reports/:id/run` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| GET | `/v1/analytics/studio/schedules` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| POST | `/v1/analytics/studio/schedules` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| DELETE | `/v1/analytics/studio/schedules/:id` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| PATCH | `/v1/analytics/studio/schedules/:id` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| POST | `/v1/analytics/studio/schedules/:id/run-now` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| GET | `/v1/analytics/studio/schedules/:id/runs` | accountant, admissions_officer, exam_controller, hod, hostel_warden, hr_manager, librarian, placement_officer, principal, store_keeper, teacher, tenant_admin, transport_manager (+FeatureGuard) |  |
| GET | `/v1/announcements` | hod, principal, tenant_admin |  |
| POST | `/v1/announcements` | hod, principal, tenant_admin |  |
| DELETE | `/v1/announcements/:id` | hod, principal, tenant_admin |  |
| GET | `/v1/announcements/:id` | hod, principal, tenant_admin |  |
| PATCH | `/v1/announcements/:id` | hod, principal, tenant_admin |  |
| GET | `/v1/announcements/:id/attachments/:attachmentId` | hod, principal, tenant_admin |  |
| POST | `/v1/announcements/:id/duplicate` | hod, principal, tenant_admin |  |
| POST | `/v1/announcements/:id/recall` | hod, principal, tenant_admin |  |
| GET | `/v1/announcements/:id/recipients` | hod, principal, tenant_admin |  |
| POST | `/v1/announcements/:id/remind` | hod, principal, tenant_admin |  |
| POST | `/v1/announcements/:id/send` | hod, principal, tenant_admin |  |
| GET | `/v1/announcements/inbox` | any signed-in user |  |
| GET | `/v1/announcements/inbox/:id` | any signed-in user |  |
| POST | `/v1/announcements/inbox/:id/ack` | any signed-in user |  |
| GET | `/v1/announcements/inbox/:id/attachments/:attachmentId` | any signed-in user |  |
| POST | `/v1/announcements/inbox/:id/read` | any signed-in user |  |
| GET | `/v1/announcements/people` | hod, principal, tenant_admin |  |
| POST | `/v1/announcements/preview` | hod, principal, tenant_admin |  |
| GET | `/v1/announcements/templates` | hod, principal, tenant_admin |  |
| POST | `/v1/announcements/templates` | hod, principal, tenant_admin |  |
| DELETE | `/v1/announcements/templates/:id` | hod, principal, tenant_admin |  |
| PATCH | `/v1/announcements/templates/:id` | hod, principal, tenant_admin |  |
| GET | `/v1/answer-cards/current` | board token |  |
| POST | `/v1/answer-sheet-accounts/:id/submit` | exam_controller, examiner, hod, principal, teacher, tenant_admin |  |
| GET | `/v1/api-tokens` | principal, tenant_admin |  |
| POST | `/v1/api-tokens` | principal, tenant_admin |  |
| DELETE | `/v1/api-tokens/:id` | principal, tenant_admin |  |
| GET | `/v1/assessment-tools/integrity/flags` | exam_controller, hod, principal, teacher, tenant_admin |  |
| POST | `/v1/assessment-tools/integrity/flags` | exam_controller, hod, principal, teacher, tenant_admin |  |
| POST | `/v1/assessment-tools/integrity/flags/:id/review` | exam_controller, hod, principal, tenant_admin |  |
| POST | `/v1/assessment-tools/integrity/report` | student |  |
| POST | `/v1/assessment-tools/integrity/similarity` | exam_controller, hod, principal, teacher, tenant_admin |  |
| GET | `/v1/assessment-tools/reattempts` | exam_controller, hod, principal, student, teacher, tenant_admin |  |
| POST | `/v1/assessment-tools/reattempts` | exam_controller, hod, principal, student, teacher, tenant_admin |  |
| POST | `/v1/assessment-tools/reattempts/:id/decide` | exam_controller, hod, principal, tenant_admin |  |
| GET | `/v1/assessment-tools/rubrics` | exam_controller, hod, principal, teacher, tenant_admin |  |
| POST | `/v1/assessment-tools/rubrics` | exam_controller, hod, principal, teacher, tenant_admin |  |
| PUT | `/v1/assessment-tools/rubrics/:id` | exam_controller, hod, principal, teacher, tenant_admin |  |
| POST | `/v1/assessment-tools/rubrics/:id/archive` | exam_controller, hod, principal, tenant_admin |  |
| POST | `/v1/assessment-tools/rubrics/:id/score` | exam_controller, hod, principal, teacher, tenant_admin |  |
| GET | `/v1/assessment-tools/rubrics/:id/scores` | exam_controller, hod, principal, teacher, tenant_admin |  |
| GET | `/v1/assessments` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/assessments` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/assessments/:id` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/assessments/:id/attendance-marks` | exam_controller, examiner, hod, principal, teacher, tenant_admin |  |
| PUT | `/v1/assessments/:id/component` | hod, principal, teacher, tenant_admin |  |
| PUT | `/v1/assessments/:id/marks` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/assessments/:id/moderate` | hod, principal, tenant_admin |  |
| POST | `/v1/assessments/:id/publish` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/assessments/:id/reopen` | hod, principal, tenant_admin |  |
| POST | `/v1/assessments/:id/submit` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/assessments/:id/unlock-requests` | exam_controller, hod, principal, teacher, tenant_admin |  |
| POST | `/v1/assessments/:id/unlock-requests` | exam_controller, hod, principal, teacher, tenant_admin |  |
| POST | `/v1/assessments/:id/verify` | hod, principal, tenant_admin |  |
| GET | `/v1/asset-ops/amc` | principal, store_keeper, tenant_admin |  |
| POST | `/v1/asset-ops/amc` | principal, store_keeper, tenant_admin |  |
| POST | `/v1/asset-ops/amc/:id/cancel` | principal, store_keeper, tenant_admin |  |
| POST | `/v1/asset-ops/amc/:id/visit` | principal, store_keeper, tenant_admin |  |
| PUT | `/v1/asset-ops/assets/:id/room` | principal, store_keeper, tenant_admin |  |
| PUT | `/v1/asset-ops/assets/:id/warranty` | principal, store_keeper, tenant_admin |  |
| GET | `/v1/asset-ops/coverage` | principal, store_keeper, tenant_admin |  |
| GET | `/v1/asset-ops/rooms/:roomId/assets` | principal, store_keeper, tenant_admin |  |
| GET | `/v1/asset-ops/smartboards` | principal, store_keeper, tenant_admin |  |
| POST | `/v1/asset-ops/smartboards/:deviceId/link` | principal, store_keeper, tenant_admin |  |
| GET | `/v1/assets` | principal, store_keeper, tenant_admin |  |
| POST | `/v1/assets` | principal, store_keeper, tenant_admin |  |
| GET | `/v1/assets/:id` | principal, store_keeper, tenant_admin |  |
| POST | `/v1/assets/:id/allocate` | principal, store_keeper, tenant_admin |  |
| POST | `/v1/assets/:id/condemn` | principal, store_keeper, tenant_admin |  |
| POST | `/v1/assets/:id/dispose` | principal, store_keeper, tenant_admin |  |
| POST | `/v1/assets/:id/maintenance` | principal, store_keeper, tenant_admin |  |
| POST | `/v1/assets/:id/return` | principal, store_keeper, tenant_admin |  |
| POST | `/v1/assets/:id/transfer` | principal, store_keeper, tenant_admin |  |
| GET | `/v1/assets/by-tag/:tag` | principal, store_keeper, tenant_admin |  |
| GET | `/v1/assets/condemnations` | principal, store_keeper, tenant_admin |  |
| POST | `/v1/assets/condemnations/:id/decision` | principal, tenant_admin |  |
| POST | `/v1/assets/condemnations/:id/write-off` | principal, store_keeper, tenant_admin |  |
| POST | `/v1/assets/gl/depreciation` | accountant, principal, store_keeper, tenant_admin |  |
| GET | `/v1/assets/maintenance-due` | principal, store_keeper, tenant_admin |  |
| GET | `/v1/assets/reports/depreciation` | accountant, principal, store_keeper, tenant_admin |  |
| GET | `/v1/assets/reports/labs` | accountant, hod, principal, quality_officer, store_keeper, tenant_admin |  |
| GET | `/v1/assets/reports/naac` | accountant, hod, principal, quality_officer, store_keeper, tenant_admin |  |
| GET | `/v1/assets/tags.pdf` | principal, store_keeper, tenant_admin |  |
| GET | `/v1/attendance` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/attendance` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/attendance-desk/alerts` | hod, principal, tenant_admin |  |
| POST | `/v1/attendance-desk/alerts/run` | principal, tenant_admin |  |
| GET | `/v1/attendance-desk/classes` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/attendance-desk/classes/:id/subjects` | exam_controller, hod, principal, teacher, tenant_admin |  |
| POST | `/v1/attendance-desk/copy` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/attendance-desk/dashboard` | hod, principal, tenant_admin |  |
| GET | `/v1/attendance-desk/day` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/attendance-desk/day` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/attendance-desk/detention` | exam_controller, hod, principal, teacher, tenant_admin |  |
| GET | `/v1/attendance-desk/detention-lists` | exam_controller, hod, principal, tenant_admin |  |
| POST | `/v1/attendance-desk/detention-lists` | exam_controller, hod, principal, tenant_admin |  |
| GET | `/v1/attendance-desk/detention-lists/:id` | exam_controller, hod, principal, tenant_admin |  |
| POST | `/v1/attendance-desk/detention-lists/:id/publish` | principal, tenant_admin |  |
| POST | `/v1/attendance-desk/detention-lists/:id/withdraw` | principal, tenant_admin |  |
| GET | `/v1/attendance-desk/device-bindings/:studentId` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/attendance-desk/device-bindings/:studentId/release` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/attendance-desk/leaves` | guardian, hod, principal, student, teacher, tenant_admin |  |
| POST | `/v1/attendance-desk/leaves/:id/cancel` | guardian, hod, principal, student, teacher, tenant_admin |  |
| POST | `/v1/attendance-desk/leaves/:id/decision` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/attendance-desk/leaves/:id/document` | guardian, hod, principal, student, teacher, tenant_admin |  |
| POST | `/v1/attendance-desk/leaves/:id/revoke` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/attendance-desk/leaves/mine` | guardian, student |  |
| POST | `/v1/attendance-desk/leaves/on-duty` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/attendance-desk/policy` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/attendance-desk/qr-scans` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/attendance-desk/qr-scans/:id/decision` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/attendance-desk/qr-scans/decide` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/attendance-desk/register` | exam_controller, hod, principal, teacher, tenant_admin |  |
| GET | `/v1/attendance-desk/reports/accreditation` | exam_controller, hod, principal, quality_officer, tenant_admin |  |
| GET | `/v1/attendance-desk/reports/compliance` | exam_controller, hod, principal, quality_officer, tenant_admin |  |
| GET | `/v1/attendance-desk/reports/subjects` | exam_controller, hod, principal, quality_officer, tenant_admin |  |
| GET | `/v1/attendance-desk/reports/trend` | exam_controller, hod, principal, quality_officer, tenant_admin |  |
| GET | `/v1/attendance-desk/sheet` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/attendance-desk/special/:id` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/attendance-desk/students/:id` | any signed-in user |  |
| GET | `/v1/attendance-desk/unmarked` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/attendance-desk/unmarked/remind` | hod, principal, tenant_admin |  |
| GET | `/v1/attendance/condonations` | guardian, hod, principal, student, teacher, tenant_admin |  |
| POST | `/v1/attendance/condonations` | guardian, hod, principal, student, teacher, tenant_admin |  |
| POST | `/v1/attendance/condonations/:id/decision` | principal, tenant_admin |  |
| GET | `/v1/attendance/condonations/:id/document` | guardian, hod, principal, student, teacher, tenant_admin |  |
| POST | `/v1/attendance/condonations/:id/fee` | accountant, principal, tenant_admin |  |
| GET | `/v1/attendance/corrections` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/attendance/corrections` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/attendance/corrections/:id/decision` | hod, principal, tenant_admin |  |
| GET | `/v1/attendance/eligibility` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/attendance/qr` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/attendance/shortage` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/audit` | principal, tenant_admin |  |
| GET | `/v1/audit/actions` | principal, tenant_admin |  |
| GET | `/v1/audit/actors` | principal, tenant_admin |  |
| GET | `/v1/audit/export` | principal, tenant_admin |  |
| POST | `/v1/auth/login` | PUBLIC |  |
| POST | `/v1/auth/mfa/verify` | PUBLIC |  |
| POST | `/v1/auth/otp/request` | PUBLIC |  |
| POST | `/v1/auth/otp/verify` | PUBLIC |  |
| GET | `/v1/auth/sso/callback` | PUBLIC |  |
| POST | `/v1/auth/sso/exchange` | PUBLIC |  |
| GET | `/v1/auth/sso/providers` | PUBLIC |  |
| POST | `/v1/auth/sso/start` | PUBLIC |  |
| POST | `/v1/badges` | any signed-in user; board token |  |
| GET | `/v1/badges/students/:id` | any signed-in user |  |
| GET | `/v1/billing/invoices` | principal, tenant_admin |  |
| POST | `/v1/billing/invoices/:id/pay` | principal, tenant_admin |  |
| GET | `/v1/billing/plans` | principal, tenant_admin |  |
| POST | `/v1/billing/renew` | principal, tenant_admin |  |
| GET | `/v1/billing/subscription` | principal, tenant_admin |  |
| POST | `/v1/billing/subscription` | principal, tenant_admin |  |
| POST | `/v1/billing/subscription/cancel` | principal, tenant_admin |  |
| GET | `/v1/billing/usage` | principal, tenant_admin |  |
| GET | `/v1/books/accounts` | accountant, principal, tenant_admin |  |
| POST | `/v1/books/accounts` | accountant, principal, tenant_admin |  |
| PATCH | `/v1/books/accounts/:id` | accountant, principal, tenant_admin |  |
| GET | `/v1/books/balance-sheet` | accountant, principal, tenant_admin |  |
| GET | `/v1/books/daybook` | accountant, principal, tenant_admin |  |
| GET | `/v1/books/income-expenditure` | accountant, principal, tenant_admin |  |
| GET | `/v1/books/ledger/:accountId` | accountant, principal, tenant_admin |  |
| PUT | `/v1/books/opening` | accountant, principal, tenant_admin |  |
| GET | `/v1/books/trial-balance` | accountant, principal, tenant_admin |  |
| POST | `/v1/books/vouchers` | accountant, principal, tenant_admin |  |
| POST | `/v1/books/vouchers/:id/void` | accountant, principal, tenant_admin |  |
| GET | `/v1/books/years` | accountant, principal, tenant_admin |  |
| POST | `/v1/books/years/:fy/close` | accountant, principal, tenant_admin |  |
| GET | `/v1/books/zoho.csv` | accountant, principal, tenant_admin |  |
| GET | `/v1/broadcasts` | hod, principal, tenant_admin |  |
| POST | `/v1/broadcasts` | hod, principal, tenant_admin |  |
| POST | `/v1/broadcasts/:id/ack` | device token; board token |  |
| POST | `/v1/broadcasts/:id/clear` | hod, principal, tenant_admin |  |
| GET | `/v1/broadcasts/:id/delivery` | hod, principal, tenant_admin |  |
| POST | `/v1/broadcasts/:id/displayed` | device token; board token |  |
| GET | `/v1/broadcasts/pending` | device token; board token |  |
| GET | `/v1/calendar` | any signed-in user |  |
| GET | `/v1/campus-life/achievements` | guardian, hod, principal, student, teacher, tenant_admin |  |
| GET | `/v1/campus-life/action-items` | any signed-in user |  |
| POST | `/v1/campus-life/action-items/:actionId/status` | any signed-in user |  |
| POST | `/v1/campus-life/activities/:activityId/attendance` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/campus-life/clashes` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/campus-life/club-budgets` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/campus-life/clubs` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/campus-life/clubs` | hod, principal, teacher, tenant_admin |  |
| PATCH | `/v1/campus-life/clubs/:id` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/campus-life/clubs/:id/achievements` | guardian, hod, principal, student, teacher, tenant_admin | OWNERSHIP? reviewed |
| POST | `/v1/campus-life/clubs/:id/achievements` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/campus-life/clubs/:id/activities` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/campus-life/clubs/:id/activities` | hod, principal, teacher, tenant_admin |  |
| PUT | `/v1/campus-life/clubs/:id/budget` | hod, principal, tenant_admin |  |
| POST | `/v1/campus-life/clubs/:id/join` | guardian, student |  |
| POST | `/v1/campus-life/clubs/:id/leave` | guardian, student |  |
| GET | `/v1/campus-life/clubs/:id/members` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/campus-life/clubs/:id/members` | hod, principal, teacher, tenant_admin |  |
| PATCH | `/v1/campus-life/clubs/:id/members/:memberId` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/campus-life/clubs/:id/members/:memberId/decision` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/campus-life/clubs/:id/members/:studentId/certificate` | any signed-in user |  |
| GET | `/v1/campus-life/clubs/:id/office-bearers` | guardian, hod, principal, student, teacher, tenant_admin | OWNERSHIP? reviewed |
| POST | `/v1/campus-life/clubs/:id/office-bearers` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/campus-life/clubs/:id/points` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/campus-life/committees` | hod, principal, tenant_admin |  |
| POST | `/v1/campus-life/committees` | hod, principal, tenant_admin |  |
| PATCH | `/v1/campus-life/committees/:id` | hod, principal, tenant_admin |  |
| GET | `/v1/campus-life/committees/:id/evidence` | hod, principal, tenant_admin |  |
| POST | `/v1/campus-life/committees/:id/evidence` | hod, principal, tenant_admin |  |
| GET | `/v1/campus-life/committees/:id/meetings` | hod, principal, tenant_admin |  |
| POST | `/v1/campus-life/committees/:id/meetings` | hod, principal, tenant_admin |  |
| GET | `/v1/campus-life/committees/:id/members` | hod, principal, tenant_admin |  |
| POST | `/v1/campus-life/committees/:id/members` | hod, principal, tenant_admin |  |
| PATCH | `/v1/campus-life/committees/:id/members/:memberId` | hod, principal, tenant_admin |  |
| GET | `/v1/campus-life/committees/:id/report-pack` | hod, principal, tenant_admin |  |
| POST | `/v1/campus-life/election-candidates/:candidateId/withdraw` | hod, principal, tenant_admin |  |
| DELETE | `/v1/campus-life/election-posts/:postId` | hod, principal, tenant_admin |  |
| POST | `/v1/campus-life/election-posts/:postId/candidates` | hod, principal, tenant_admin |  |
| POST | `/v1/campus-life/elections` | hod, principal, tenant_admin |  |
| GET | `/v1/campus-life/elections/:id` | hod, principal, tenant_admin |  |
| PATCH | `/v1/campus-life/elections/:id` | hod, principal, tenant_admin |  |
| POST | `/v1/campus-life/elections/:id/close` | hod, principal, tenant_admin |  |
| POST | `/v1/campus-life/elections/:id/open` | hod, principal, tenant_admin |  |
| POST | `/v1/campus-life/elections/:id/posts` | hod, principal, tenant_admin |  |
| POST | `/v1/campus-life/elections/:id/publish` | hod, principal, tenant_admin |  |
| POST | `/v1/campus-life/elections/:id/vote` | student |  |
| GET | `/v1/campus-life/events` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/campus-life/events` | hod, principal, teacher, tenant_admin |  |
| PATCH | `/v1/campus-life/events/:id` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/campus-life/events/:id/approval` | hod, principal, tenant_admin |  |
| POST | `/v1/campus-life/events/:id/cancel` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/campus-life/events/:id/cancel-registration` | guardian, student |  |
| POST | `/v1/campus-life/events/:id/certificates` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/campus-life/events/:id/check-in` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/campus-life/events/:id/check-in-external` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/campus-life/events/:id/clashes` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/campus-life/events/:id/duty-leave` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/campus-life/events/:id/duty-leave` | hod, principal, tenant_admin |  |
| GET | `/v1/campus-life/events/:id/external` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/campus-life/events/:id/external` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/campus-life/events/:id/feedback` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/campus-life/events/:id/feedback` | guardian, student |  |
| GET | `/v1/campus-life/events/:id/media` | guardian, hod, principal, student, teacher, tenant_admin | OWNERSHIP? reviewed |
| POST | `/v1/campus-life/events/:id/media` | hod, principal, student, teacher, tenant_admin |  |
| GET | `/v1/campus-life/events/:id/my-certificate` | guardian, student |  |
| POST | `/v1/campus-life/events/:id/propose` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/campus-life/events/:id/publish` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/campus-life/events/:id/refunds` | accountant, hod, principal, teacher, tenant_admin |  |
| POST | `/v1/campus-life/events/:id/register` | guardian, student |  |
| GET | `/v1/campus-life/events/:id/registrations` | hod, principal, teacher, tenant_admin |  |
| PUT | `/v1/campus-life/events/:id/report` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/campus-life/events/:id/summary` | hod, principal, teacher, tenant_admin |  |
| DELETE | `/v1/campus-life/evidence/:evidenceId` | hod, principal, tenant_admin |  |
| GET | `/v1/campus-life/evidence/:evidenceId/download` | hod, principal, tenant_admin |  |
| POST | `/v1/campus-life/external/:registrationId/cancel` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/campus-life/me/clubs` | guardian, student |  |
| GET | `/v1/campus-life/me/elections` | student |  |
| GET | `/v1/campus-life/me/events` | guardian, student |  |
| GET | `/v1/campus-life/me/registrations` | guardian, student |  |
| DELETE | `/v1/campus-life/media/:mediaId` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/campus-life/media/:mediaId/approve` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/campus-life/media/:mediaId/file` | guardian, hod, principal, student, teacher, tenant_admin | OWNERSHIP? reviewed |
| PATCH | `/v1/campus-life/meetings/:meetingId` | hod, principal, tenant_admin |  |
| POST | `/v1/campus-life/meetings/:meetingId/actions` | hod, principal, tenant_admin |  |
| POST | `/v1/campus-life/office-bearers/:bearerId/end` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/campus-life/refunds/:kind/:registrationId` | accountant, hod, principal, tenant_admin |  |
| POST | `/v1/campus-life/registrations/:registrationId/payment` | accountant, hod, principal, teacher, tenant_admin |  |
| GET | `/v1/campus-life/reports/event-register` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/campus-life/reports/naac` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/campus-life/reports/participation` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/campus-life/reports/unit-hours` | hod, principal, teacher, tenant_admin |  |
| DELETE | `/v1/campus-life/unit-activities/:activityId` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/campus-life/unit-activities/:activityId/hours` | hod, principal, teacher, tenant_admin |  |
| PUT | `/v1/campus-life/unit-activities/:activityId/hours` | hod, principal, teacher, tenant_admin |  |
| PATCH | `/v1/campus-life/unit-members/:memberId` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/campus-life/units/:id` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/campus-life/units/:id/activities` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/campus-life/units/:id/members` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/canteen/items` | any signed-in user |  |
| POST | `/v1/canteen/items` | canteen_manager, principal, tenant_admin |  |
| PATCH | `/v1/canteen/items/:id` | canteen_manager, principal, tenant_admin |  |
| GET | `/v1/canteen/meal-attendance` | canteen_manager, principal, tenant_admin |  |
| POST | `/v1/canteen/meal-attendance` | canteen_manager, principal, tenant_admin |  |
| GET | `/v1/canteen/ops/feedback` | canteen_manager, principal, tenant_admin |  |
| POST | `/v1/canteen/ops/feedback` | any signed-in user |  |
| GET | `/v1/canteen/ops/options` | canteen_manager, principal, tenant_admin |  |
| GET | `/v1/canteen/ops/stock` | canteen_manager, principal, tenant_admin |  |
| POST | `/v1/canteen/ops/stock` | canteen_manager, principal, tenant_admin |  |
| GET | `/v1/canteen/ops/summary` | canteen_manager, principal, tenant_admin |  |
| POST | `/v1/canteen/orders` | canteen_manager, principal, tenant_admin |  |
| GET | `/v1/canteen/students/:id` | any signed-in user |  |
| POST | `/v1/canteen/students/:id/topup-checkout` | any signed-in user |  |
| POST | `/v1/canteen/topups/:id/confirm` | any signed-in user |  |
| POST | `/v1/canteen/wallet/topup` | canteen_manager, principal, tenant_admin |  |
| POST | `/v1/careers/assistant/ask` | student |  |
| GET | `/v1/careers/assistant/history` | student |  |
| POST | `/v1/careers/attempts/:id/submit` | student |  |
| POST | `/v1/careers/mock-interviews` | student |  |
| POST | `/v1/careers/mock-interviews/:id/submit` | student |  |
| GET | `/v1/careers/mock-interviews/mine` | student |  |
| GET | `/v1/careers/paths` | hod, placement_officer, principal, student, teacher, tenant_admin |  |
| POST | `/v1/careers/paths` | placement_officer, principal, tenant_admin |  |
| PUT | `/v1/careers/paths/:id` | placement_officer, principal, tenant_admin |  |
| GET | `/v1/careers/recommendations` | hod, placement_officer, principal, student, tenant_admin |  |
| GET | `/v1/careers/resume` | student |  |
| PUT | `/v1/careers/resume` | student |  |
| GET | `/v1/careers/resume/draft` | student |  |
| GET | `/v1/careers/resumes` | hod, placement_officer, principal, tenant_admin |  |
| GET | `/v1/careers/resumes/:studentId` | guardian, hod, placement_officer, principal, student, tenant_admin |  |
| GET | `/v1/careers/resumes/:studentId/pdf` | guardian, hod, placement_officer, principal, student, tenant_admin |  |
| GET | `/v1/careers/tests` | hod, placement_officer, principal, student, tenant_admin |  |
| POST | `/v1/careers/tests` | placement_officer, principal, tenant_admin |  |
| PUT | `/v1/careers/tests/:id/active` | placement_officer, principal, tenant_admin |  |
| GET | `/v1/careers/tests/:id/results` | hod, placement_officer, principal, tenant_admin |  |
| POST | `/v1/careers/tests/:id/start` | student |  |
| GET | `/v1/cast/boards` | any signed-in user |  |
| POST | `/v1/chat/groups/linked` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/chat/inbound` | PUBLIC |  |
| GET | `/v1/chat/people` | any signed-in user |  |
| GET | `/v1/chat/threads` | any signed-in user |  |
| POST | `/v1/chat/threads` | any signed-in user |  |
| GET | `/v1/chat/threads/:id` | any signed-in user |  |
| POST | `/v1/chat/threads/:id/members` | any signed-in user |  |
| POST | `/v1/chat/threads/:id/members/:userId/role` | any signed-in user | BROAD reviewed |
| POST | `/v1/chat/threads/:id/messages` | any signed-in user |  |
| GET | `/v1/chat/threads/:id/messages/:messageId/attachment` | any signed-in user |  |
| POST | `/v1/chat/threads/:id/pin` | any signed-in user |  |
| POST | `/v1/chat/threads/:id/read` | any signed-in user |  |
| PATCH | `/v1/chat/threads/:id/settings` | any signed-in user | BROAD reviewed |
| POST | `/v1/chat/threads/:id/sync` | any signed-in user |  |
| POST | `/v1/chat/threads/:id/typing` | any signed-in user |  |
| GET | `/v1/class-notes/:token` | PUBLIC |  |
| GET | `/v1/classroom/buzzer` | board token |  |
| POST | `/v1/classroom/buzzer/lock` | board token |  |
| POST | `/v1/classroom/buzzer/reset` | board token |  |
| GET | `/v1/classroom/classrooms` | hod, principal, teacher; board token |  |
| POST | `/v1/classroom/classrooms/open` | board token |  |
| GET | `/v1/classroom/course-outcomes` | board token |  |
| POST | `/v1/classroom/end` | board token |  |
| GET | `/v1/classroom/now` | board token |  |
| POST | `/v1/classroom/now/open` | board token |  |
| POST | `/v1/classroom/teaching-log` | board token |  |
| GET | `/v1/classroom/today` | board token |  |
| GET | `/v1/classroom/trainings` | principal, tenant_admin |  |
| POST | `/v1/classroom/trainings` | hod, principal, teacher; board token |  |
| PATCH | `/v1/classroom/trainings/:id` | principal, tenant_admin |  |
| GET | `/v1/classroom/trainings/mine` | hod, principal, teacher; board token |  |
| GET | `/v1/classroom/trainings/slots` | hod, principal, teacher; board token |  |
| POST | `/v1/code/run` | hod, principal, student, teacher; board token |  |
| GET | `/v1/comms/audiences` | hod, principal, tenant_admin |  |
| POST | `/v1/comms/audiences` | hod, principal, tenant_admin |  |
| DELETE | `/v1/comms/audiences/:id` | hod, principal, tenant_admin |  |
| POST | `/v1/comms/audiences/preview` | hod, principal, tenant_admin |  |
| GET | `/v1/comms/campaigns` | hod, principal, tenant_admin |  |
| POST | `/v1/comms/campaigns` | hod, principal, tenant_admin |  |
| GET | `/v1/comms/campaigns/:id` | hod, principal, tenant_admin |  |
| POST | `/v1/comms/campaigns/:id/cancel` | hod, principal, tenant_admin |  |
| POST | `/v1/comms/run` | hod, principal, tenant_admin |  |
| GET | `/v1/comms/templates` | hod, principal, tenant_admin |  |
| POST | `/v1/comms/templates` | hod, principal, tenant_admin |  |
| PUT | `/v1/comms/templates/:id` | hod, principal, tenant_admin |  |
| GET | `/v1/connectors` | principal, tenant_admin |  |
| POST | `/v1/connectors` | tenant_admin |  |
| DELETE | `/v1/connectors/:id` | tenant_admin |  |
| PATCH | `/v1/connectors/:id` | tenant_admin |  |
| POST | `/v1/connectors/:id/bi-links` | tenant_admin |  |
| GET | `/v1/connectors/:id/deliveries` | principal, tenant_admin |  |
| POST | `/v1/connectors/:id/disable` | tenant_admin |  |
| POST | `/v1/connectors/:id/enable` | tenant_admin |  |
| POST | `/v1/connectors/:id/test` | tenant_admin |  |
| POST | `/v1/connectors/deliveries/:deliveryId/retry` | tenant_admin |  |
| GET | `/v1/connectors/library/loans` | librarian, principal, tenant_admin |  |
| GET | `/v1/connectors/library/search` | any signed-in user |  |
| GET | `/v1/connectors/types` | principal, tenant_admin |  |
| GET | `/v1/connectors/video/board` | board token |  |
| GET | `/v1/connectors/video/meetings` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/connectors/video/meetings` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/connectors/video/meetings/:id/attendance` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/connectors/video/meetings/:id/attendance/confirm` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/connectors/video/meetings/:id/participants/pull` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/connectors/video/mine` | any signed-in user |  |
| GET | `/v1/consents` | guardian, student |  |
| POST | `/v1/consents` | guardian, student |  |
| POST | `/v1/content/chapters/:id/topics` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/content/courses` | any signed-in user; board token |  |
| GET | `/v1/content/courses/:id` | any signed-in user; board token | OWNERSHIP? reviewed |
| POST | `/v1/content/courses/:id/chapters` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/content/curricula` | any signed-in user; board token |  |
| GET | `/v1/content/search` | any signed-in user; board token |  |
| GET | `/v1/content/sims/phet/:id` | PUBLIC |  |
| GET | `/v1/content/syllabus` | any signed-in user; board token |  |
| DELETE | `/v1/content/topics/:id` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/content/topics/:id` | any signed-in user; board token | OWNERSHIP? reviewed |
| PATCH | `/v1/content/topics/:id` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/content/topics/:id/videos` | any signed-in user; board token |  |
| POST | `/v1/content/topics/:id/videos` | hod, principal, teacher, tenant_admin; board token |  |
| GET | `/v1/content/topics/:id/videos/mine` | hod, principal, teacher, tenant_admin; board token |  |
| PUT | `/v1/content/topics/:id/videos/order` | hod, principal, teacher, tenant_admin; board token |  |
| GET | `/v1/content/video-approvals` | principal, tenant_admin |  |
| GET | `/v1/content/video-counts` | hod, principal, teacher, tenant_admin |  |
| DELETE | `/v1/content/videos/:id` | hod, principal, teacher, tenant_admin; board token |  |
| PATCH | `/v1/content/videos/:id` | hod, principal, teacher, tenant_admin; board token |  |
| POST | `/v1/content/videos/:id/approve` | principal, tenant_admin |  |
| POST | `/v1/content/videos/:id/reject` | principal, tenant_admin |  |
| POST | `/v1/content/videos/:id/share` | hod, principal, teacher, tenant_admin; board token |  |
| GET | `/v1/conversations` | any signed-in user |  |
| POST | `/v1/conversations` | any signed-in user |  |
| POST | `/v1/conversations/:id/assign` | any signed-in user |  |
| GET | `/v1/conversations/:id/messages` | any signed-in user |  |
| POST | `/v1/conversations/:id/messages` | any signed-in user |  |
| GET | `/v1/conversations/:id/messages/:messageId/attachment` | any signed-in user |  |
| POST | `/v1/conversations/:id/mute` | any signed-in user |  |
| POST | `/v1/conversations/:id/read` | any signed-in user |  |
| POST | `/v1/conversations/:id/status` | any signed-in user |  |
| PUT | `/v1/conversations/class-teachers/:sectionId` | principal, tenant_admin |  |
| GET | `/v1/conversations/contacts` | any signed-in user |  |
| GET | `/v1/conversations/families/:studentId` | any signed-in user |  |
| GET | `/v1/conversations/settings` | any signed-in user |  |
| PUT | `/v1/conversations/settings` | principal, tenant_admin |  |
| GET | `/v1/conversations/students` | any signed-in user |  |
| GET | `/v1/conversations/unread` | any signed-in user |  |
| GET | `/v1/counselling/sessions` | any signed-in user |  |
| POST | `/v1/counselling/sessions` | any signed-in user |  |
| GET | `/v1/counselling/sessions/:id` | any signed-in user |  |
| POST | `/v1/counselling/sessions/:id/cancel` | any signed-in user |  |
| PUT | `/v1/counselling/sessions/:id/notes` | counsellor |  |
| POST | `/v1/counselling/sessions/:id/outcome` | counsellor |  |
| POST | `/v1/counselling/sessions/:id/schedule` | counsellor, principal, tenant_admin |  |
| GET | `/v1/course-files` | hod, principal, quality_officer, teacher, tenant_admin |  |
| POST | `/v1/course-files` | hod, principal, quality_officer, teacher, tenant_admin |  |
| GET | `/v1/course-files/:id/download` | hod, principal, quality_officer, teacher, tenant_admin |  |
| POST | `/v1/course-files/:id/review` | hod, principal, tenant_admin |  |
| GET | `/v1/course-files/options` | hod, principal, quality_officer, teacher, tenant_admin |  |
| POST | `/v1/course-registration/allocate` | hod, principal, tenant_admin |  |
| GET | `/v1/course-registration/approvals` | hod, principal, tenant_admin |  |
| POST | `/v1/course-registration/approvals/decide` | hod, principal, tenant_admin |  |
| POST | `/v1/course-registration/me/core` | student |  |
| POST | `/v1/course-registration/me/drop` | student |  |
| GET | `/v1/course-registration/me/offerings` | student |  |
| PUT | `/v1/course-registration/me/preferences` | student |  |
| POST | `/v1/course-registration/me/register` | student |  |
| GET | `/v1/course-registration/me/registrations` | student |  |
| GET | `/v1/course-registration/me/teaching` | hod, principal, teacher |  |
| GET | `/v1/course-registration/offerings` | hod, principal, tenant_admin |  |
| POST | `/v1/course-registration/offerings` | hod, principal, tenant_admin |  |
| PATCH | `/v1/course-registration/offerings/:id` | hod, principal, tenant_admin |  |
| GET | `/v1/course-registration/offerings/:id/roster` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/course-registration/terms` | hod, principal, student, tenant_admin |  |
| GET | `/v1/course-registration/windows` | hod, principal, tenant_admin |  |
| PUT | `/v1/course-registration/windows` | principal, tenant_admin |  |
| DELETE | `/v1/coverage` | any signed-in user; board token |  |
| GET | `/v1/coverage` | any signed-in user; board token |  |
| POST | `/v1/coverage` | any signed-in user; board token |  |
| GET | `/v1/credential-tags` | hr_manager, librarian, principal, tenant_admin, transport_manager |  |
| POST | `/v1/credential-tags` | hr_manager, librarian, principal, tenant_admin, transport_manager |  |
| DELETE | `/v1/credential-tags/:id` | hr_manager, librarian, principal, tenant_admin, transport_manager |  |
| GET | `/v1/curriculum/diff` | accreditation_reviewer, exam_controller, hod, principal, quality_officer, teacher, tenant_admin, university_admin |  |
| GET | `/v1/curriculum/frameworks` | accreditation_reviewer, exam_controller, hod, principal, quality_officer, tenant_admin, university_admin |  |
| POST | `/v1/curriculum/frameworks` | hod, principal, tenant_admin, university_admin |  |
| PUT | `/v1/curriculum/frameworks/:id` | hod, principal, tenant_admin, university_admin |  |
| PUT | `/v1/curriculum/frameworks/regulations/:regulationId` | hod, principal, tenant_admin, university_admin |  |
| GET | `/v1/curriculum/imports` | hod, principal, tenant_admin |  |
| POST | `/v1/curriculum/imports` | hod, principal, tenant_admin |  |
| GET | `/v1/curriculum/imports/:id` | hod, principal, tenant_admin |  |
| POST | `/v1/curriculum/imports/:id/draft` | hod, principal, tenant_admin |  |
| GET | `/v1/curriculum/regulations` | accreditation_reviewer, exam_controller, hod, principal, quality_officer, teacher, tenant_admin, university_admin |  |
| POST | `/v1/curriculum/regulations` | hod, principal, tenant_admin |  |
| GET | `/v1/curriculum/students/:studentId` | accreditation_reviewer, exam_controller, guardian, hod, principal, quality_officer, student, teacher, tenant_admin, university_admin |  |
| GET | `/v1/curriculum/versions` | accreditation_reviewer, exam_controller, hod, principal, quality_officer, teacher, tenant_admin, university_admin |  |
| POST | `/v1/curriculum/versions` | hod, principal, tenant_admin |  |
| GET | `/v1/curriculum/versions/:id` | accreditation_reviewer, exam_controller, hod, principal, quality_officer, teacher, tenant_admin, university_admin |  |
| POST | `/v1/curriculum/versions/:id/activate` | principal, tenant_admin |  |
| POST | `/v1/curriculum/versions/:id/approve` | principal, tenant_admin |  |
| PUT | `/v1/curriculum/versions/:id/content` | hod, principal, tenant_admin |  |
| POST | `/v1/curriculum/versions/:id/pin` | principal, tenant_admin |  |
| GET | `/v1/delegations` | accountant, admissions_officer, canteen_manager, counsellor, driver, exam_controller, examiner, grievance_officer, hod, hostel_warden, hr_manager, icc_member, librarian, placement_officer, principal, quality_officer, research_coordinator, store_keeper, teacher, tenant_admin, transport_manager |  |
| POST | `/v1/delegations` | accountant, admissions_officer, canteen_manager, counsellor, driver, exam_controller, examiner, grievance_officer, hod, hostel_warden, hr_manager, icc_member, librarian, placement_officer, principal, quality_officer, research_coordinator, store_keeper, teacher, tenant_admin, transport_manager |  |
| POST | `/v1/delegations/:id/revoke` | accountant, admissions_officer, canteen_manager, counsellor, driver, exam_controller, examiner, grievance_officer, hod, hostel_warden, hr_manager, icc_member, librarian, placement_officer, principal, quality_officer, research_coordinator, store_keeper, teacher, tenant_admin, transport_manager |  |
| GET | `/v1/delegations/colleagues` | accountant, admissions_officer, canteen_manager, counsellor, driver, exam_controller, examiner, grievance_officer, hod, hostel_warden, hr_manager, icc_member, librarian, placement_officer, principal, quality_officer, research_coordinator, store_keeper, teacher, tenant_admin, transport_manager |  |
| GET | `/v1/departments` | hod, principal, tenant_admin |  |
| GET | `/v1/departments/:id/overview` | hod, principal, tenant_admin |  |
| GET | `/v1/device-events` | hr_manager, librarian, principal, tenant_admin, transport_manager |  |
| GET | `/v1/device-ingest/adms/:key/iclock/cdata` | PUBLIC |  |
| POST | `/v1/device-ingest/adms/:key/iclock/cdata` | PUBLIC |  |
| POST | `/v1/device-ingest/cosec/:key` | PUBLIC |  |
| POST | `/v1/device-ingest/events` | PUBLIC |  |
| POST | `/v1/devices` | principal, tenant_admin |  |
| PATCH | `/v1/devices/:id` | principal, tenant_admin |  |
| GET | `/v1/devices/:id/actions` | principal, tenant_admin |  |
| POST | `/v1/devices/:id/actions` | principal, tenant_admin |  |
| POST | `/v1/devices/:id/enrollment-code` | principal, tenant_admin |  |
| GET | `/v1/devices/:id/profiles` | principal, tenant_admin |  |
| DELETE | `/v1/devices/:id/profiles/:userId` | principal, tenant_admin |  |
| POST | `/v1/devices/:id/profiles/:userId/reset-pin` | principal, tenant_admin |  |
| POST | `/v1/devices/enroll` | PUBLIC |  |
| GET | `/v1/devices/fleet` | principal, tenant_admin |  |
| GET | `/v1/devices/fleet/actions` | principal, tenant_admin |  |
| GET | `/v1/devices/me/concept-videos` | device token; board token |  |
| GET | `/v1/devices/me/config` | device token; board token |  |
| GET | `/v1/devices/me/exam-room` | device token |  |
| GET | `/v1/devices/me/exam-room/plan` | device token; board token |  |
| POST | `/v1/devices/me/health` | device token; board token |  |
| POST | `/v1/devices/me/pairing-codes` | device token |  |
| GET | `/v1/devices/me/profiles` | device token; board token |  |
| POST | `/v1/devices/me/profiles/:userId/unlock` | device token; board token |  |
| DELETE | `/v1/devices/me/profiles/me` | board token |  |
| PUT | `/v1/devices/me/profiles/me/pin` | board token |  |
| GET | `/v1/devices/teacher-tap` | device token; board token |  |
| GET | `/v1/diary` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/diary` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/diary/:id/acknowledgements` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/digilocker/config` | principal, tenant_admin |  |
| PUT | `/v1/digilocker/config` | principal, tenant_admin |  |
| GET | `/v1/digilocker/documents` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/digilocker/documents` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/digilocker/documents/:id/check` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/digilocker/documents/:id/push` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/digilocker/documents/:id/verify` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/digilocker/pull/:tenantId` | PUBLIC |  |
| POST | `/v1/digilocker/push-pending` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/discipline/actions/:actionId/appeals` | guardian, student |  |
| GET | `/v1/discipline/appeals` | principal, tenant_admin |  |
| POST | `/v1/discipline/appeals/:id/decision` | principal, tenant_admin |  |
| GET | `/v1/discipline/incidents` | hod, hostel_warden, principal, teacher, tenant_admin |  |
| POST | `/v1/discipline/incidents` | hod, hostel_warden, principal, teacher, tenant_admin |  |
| POST | `/v1/discipline/incidents/:id/actions` | principal, tenant_admin |  |
| POST | `/v1/discipline/incidents/:id/close` | principal, tenant_admin |  |
| GET | `/v1/discipline/incidents/:id/parent-contacts` | hod, hostel_warden, principal, teacher, tenant_admin |  |
| POST | `/v1/discipline/incidents/:id/parent-contacts` | hod, principal, tenant_admin |  |
| POST | `/v1/discipline/incidents/:id/review` | principal, tenant_admin |  |
| GET | `/v1/discipline/incidents/:id/witnesses` | hod, hostel_warden, principal, teacher, tenant_admin |  |
| POST | `/v1/discipline/incidents/:id/witnesses` | hod, hostel_warden, principal, teacher, tenant_admin |  |
| GET | `/v1/discipline/my-notices` | guardian |  |
| POST | `/v1/discipline/parent-contacts/:contactId/acknowledge` | guardian |  |
| GET | `/v1/discipline/students/:studentId` | any signed-in user |  |
| GET | `/v1/documents/appointment-letters/:file` | accountant, hr_manager, principal, tenant_admin |  |
| POST | `/v1/documents/bulk-issue` | principal, tenant_admin |  |
| GET | `/v1/documents/designs` | accountant, hr_manager, principal, tenant_admin |  |
| POST | `/v1/documents/designs` | principal, tenant_admin |  |
| DELETE | `/v1/documents/designs/:id` | principal, tenant_admin |  |
| GET | `/v1/documents/designs/:id` | accountant, hr_manager, principal, tenant_admin |  |
| PUT | `/v1/documents/designs/:id` | principal, tenant_admin |  |
| GET | `/v1/documents/designs/:id/preview.:format` | accountant, hr_manager, principal, tenant_admin |  |
| GET | `/v1/documents/designs/:id/versions` | accountant, hr_manager, principal, tenant_admin |  |
| POST | `/v1/documents/designs/:id/versions/:version/restore` | principal, tenant_admin |  |
| GET | `/v1/documents/designs/bindings/:docType` | accountant, hr_manager, principal, tenant_admin |  |
| PUT | `/v1/documents/designs/defaults/:docType` | principal, tenant_admin |  |
| GET | `/v1/documents/designs/fonts/:file` | accountant, hr_manager, principal, tenant_admin |  |
| POST | `/v1/documents/designs/preview` | principal, tenant_admin |  |
| GET | `/v1/documents/designs/subjects` | accountant, hr_manager, principal, tenant_admin |  |
| GET | `/v1/documents/designs/subjects/:type/:id` | accountant, hr_manager, principal, tenant_admin |  |
| GET | `/v1/documents/fee-invoices/:file` | any signed-in user |  |
| GET | `/v1/documents/fee-receipts/:file` | any signed-in user |  |
| GET | `/v1/documents/id-cards/me.pdf` | any signed-in user |  |
| GET | `/v1/documents/id-cards/staff.pdf` | accountant, hr_manager, principal, tenant_admin |  |
| GET | `/v1/documents/id-cards/students.pdf` | accountant, hr_manager, principal, tenant_admin |  |
| GET | `/v1/documents/issued` | accountant, hr_manager, principal, tenant_admin |  |
| GET | `/v1/documents/issued/:id/pdf` | accountant, hr_manager, principal, tenant_admin |  |
| POST | `/v1/documents/issued/:id/reissue` | principal, tenant_admin |  |
| POST | `/v1/documents/issued/:id/revoke` | principal, tenant_admin |  |
| GET | `/v1/documents/requests` | accountant, hr_manager, principal, tenant_admin |  |
| POST | `/v1/documents/requests` | any signed-in user |  |
| POST | `/v1/documents/requests/:id/approve` | any signed-in user |  |
| POST | `/v1/documents/requests/:id/issue` | accountant, hr_manager, principal, tenant_admin |  |
| GET | `/v1/documents/requests/:id/pdf` | any signed-in user |  |
| POST | `/v1/documents/requests/:id/reject` | any signed-in user |  |
| POST | `/v1/documents/requests/:id/revoke` | principal, tenant_admin |  |
| GET | `/v1/documents/requests/mine` | any signed-in user |  |
| GET | `/v1/documents/templates` | accountant, hr_manager, principal, tenant_admin |  |
| POST | `/v1/documents/templates` | principal, tenant_admin |  |
| PUT | `/v1/documents/templates/:id` | principal, tenant_admin |  |
| GET | `/v1/documents/templates/available` | any signed-in user |  |
| GET | `/v1/documents/vault/:ownerType/:ownerId` | any signed-in user |  |
| POST | `/v1/documents/vault/:ownerType/:ownerId` | any signed-in user |  |
| GET | `/v1/documents/vault/expiring` | hr_manager, principal, tenant_admin |  |
| DELETE | `/v1/documents/vault/files/:id` | any signed-in user |  |
| GET | `/v1/documents/vault/files/:id` | any signed-in user |  |
| POST | `/v1/documents/vault/files/:id/restore` | any signed-in user |  |
| GET | `/v1/documents/vault/files/:id/versions` | any signed-in user | OWNERSHIP? reviewed |
| GET | `/v1/dpdp/grievance-officer` | any signed-in user |  |
| GET | `/v1/dpdp/me/export` | any signed-in user |  |
| GET | `/v1/dpdp/me/export.pdf` | any signed-in user |  |
| GET | `/v1/dpdp/me/requests` | any signed-in user |  |
| POST | `/v1/dpdp/me/requests` | any signed-in user |  |
| GET | `/v1/dpdp/requests` | principal, tenant_admin |  |
| POST | `/v1/dpdp/requests/:id/process` | principal, tenant_admin |  |
| GET | `/v1/early-alerts` | counsellor, hod, mentor, principal, teacher, tenant_admin |  |
| GET | `/v1/early-alerts/:id` | counsellor, hod, mentor, principal, teacher, tenant_admin |  |
| POST | `/v1/early-alerts/:id/interventions` | counsellor, hod, mentor, principal, teacher, tenant_admin |  |
| PUT | `/v1/early-alerts/:id/interventions/:iid/outcome` | counsellor, hod, mentor, principal, teacher, tenant_admin |  |
| PUT | `/v1/early-alerts/:id/status` | counsellor, hod, mentor, principal, teacher, tenant_admin |  |
| POST | `/v1/early-alerts/run` | counsellor, hod, principal, tenant_admin |  |
| GET | `/v1/early-alerts/section/:sectionId` | counsellor, hod, mentor, principal, teacher, tenant_admin; board token |  |
| GET | `/v1/early-years/classes/:sectionId/students` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/early-years/framework` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/early-years/framework/milestones` | principal, tenant_admin |  |
| POST | `/v1/early-years/framework/seed` | principal, tenant_admin |  |
| GET | `/v1/early-years/students/:id` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/early-years/students/:id/learning-story.pdf` | hod, principal, teacher, tenant_admin |  |
| PUT | `/v1/early-years/students/:id/milestones/:milestoneId` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/early-years/students/:id/observations` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/early-years/students/:id/observations/:oid/photo` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/early-years/terms` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/evaluation/allocations/:id` | examiner, external_examiner, hod, principal, teacher |  |
| GET | `/v1/evaluation/allocations/:id/annotations` | examiner, external_examiner, hod, principal, teacher |  |
| POST | `/v1/evaluation/allocations/:id/annotations` | examiner, external_examiner, hod, principal, teacher |  |
| DELETE | `/v1/evaluation/allocations/:id/annotations/:annId` | examiner, external_examiner, hod, principal, teacher |  |
| PUT | `/v1/evaluation/allocations/:id/marks` | examiner, external_examiner, hod, principal, teacher |  |
| GET | `/v1/evaluation/allocations/:id/pages/:index` | examiner, external_examiner, hod, principal, teacher |  |
| POST | `/v1/evaluation/allocations/:id/submit` | examiner, external_examiner, hod, principal, teacher |  |
| GET | `/v1/evaluation/allocations/mine` | examiner, external_examiner, hod, principal, teacher |  |
| GET | `/v1/evaluation/papers/:paperId` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/evaluation/papers/:paperId/allocate` | exam_controller, principal, tenant_admin |  |
| PUT | `/v1/evaluation/papers/:paperId/config` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/evaluation/papers/:paperId/finalise` | exam_controller, principal, tenant_admin |  |
| PUT | `/v1/evaluation/papers/:paperId/questions` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/evaluation/papers/:paperId/scripts` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/evaluation/papers/:paperId/scripts/:scriptId/annotations` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/evaluation/papers/:paperId/scripts/:scriptId/pages/:index` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/evaluation/papers/:paperId/scripts/bulk` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/evaluation/papers/:paperId/second-valuation` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/exam-cell/reports/:report` | exam_controller, hod, principal, tenant_admin |  |
| GET | `/v1/exam-cell/settings` | exam_controller, hod, principal, tenant_admin |  |
| PUT | `/v1/exam-cell/settings` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/exam-office/overview` | exam_controller, hod, principal, tenant_admin |  |
| GET | `/v1/exam-office/records/:kind` | exam_controller, hod, principal, tenant_admin |  |
| GET | `/v1/exam-office/records/:kind/:id` | exam_controller, hod, principal, tenant_admin |  |
| POST | `/v1/exam-office/records/:kind/:id/actions/:action` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/exam-office/reports/:report` | exam_controller, hod, principal, tenant_admin |  |
| GET | `/v1/exam-office/settings` | exam_controller, hod, principal, tenant_admin |  |
| PUT | `/v1/exam-office/settings` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/exam-ops/class-bands` | exam_controller, hod, principal, tenant_admin |  |
| PUT | `/v1/exam-ops/class-bands` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/exam-ops/normalisations` | exam_controller, hod, principal, tenant_admin |  |
| POST | `/v1/exam-ops/normalisations/:id/revert` | exam_controller, hod, principal, tenant_admin |  |
| POST | `/v1/exam-ops/normalise/:assessmentId` | exam_controller, hod, principal, tenant_admin |  |
| GET | `/v1/exam-ops/options` | exam_controller, hod, principal, tenant_admin |  |
| GET | `/v1/exam-papers/:paperId/double-entry` | exam_controller, examiner, hod, principal, teacher, tenant_admin |  |
| PUT | `/v1/exam-papers/:paperId/double-entry/:round` | exam_controller, examiner, hod, principal, teacher, tenant_admin |  |
| POST | `/v1/exam-papers/:paperId/double-entry/post` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/exam-papers/:paperId/double-entry/resolve` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/exam-sessions` | exam_controller, hod, principal, tenant_admin |  |
| POST | `/v1/exam-sessions` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/exam-sessions/:id` | exam_controller, hod, principal, tenant_admin |  |
| POST | `/v1/exam-sessions/:id/application` | any signed-in user |  |
| GET | `/v1/exam-sessions/:id/application/:studentId` | any signed-in user |  |
| POST | `/v1/exam-sessions/:id/application/:studentId/withdraw` | any signed-in user |  |
| GET | `/v1/exam-sessions/:id/applications` | exam_controller, hod, principal, tenant_admin |  |
| PUT | `/v1/exam-sessions/:id/approval-required` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/exam-sessions/:id/approve` | principal, tenant_admin |  |
| GET | `/v1/exam-sessions/:id/candidates` | exam_controller, hod, principal, tenant_admin |  |
| GET | `/v1/exam-sessions/:id/clashes` | exam_controller, hod, principal, tenant_admin |  |
| GET | `/v1/exam-sessions/:id/classification` | exam_controller, hod, principal, tenant_admin |  |
| GET | `/v1/exam-sessions/:id/consolidated.pdf` | exam_controller, hod, principal, tenant_admin |  |
| GET | `/v1/exam-sessions/:id/double-entry/mismatches` | exam_controller, hod, principal, tenant_admin |  |
| POST | `/v1/exam-sessions/:id/dry-run` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/exam-sessions/:id/duties` | exam_controller, hod, principal, tenant_admin |  |
| POST | `/v1/exam-sessions/:id/duties` | exam_controller, hod, principal, tenant_admin |  |
| DELETE | `/v1/exam-sessions/:id/duties/:dutyId` | exam_controller, hod, principal, tenant_admin |  |
| POST | `/v1/exam-sessions/:id/duties/:dutyId/substitute` | exam_controller, hod, principal, tenant_admin |  |
| POST | `/v1/exam-sessions/:id/duties/auto` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/exam-sessions/:id/eligibility/:studentId` | any signed-in user |  |
| POST | `/v1/exam-sessions/:id/freeze` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/exam-sessions/:id/grace` | exam_controller, hod, principal, tenant_admin |  |
| POST | `/v1/exam-sessions/:id/grace` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/exam-sessions/:id/grace-applications` | any signed-in user |  |
| GET | `/v1/exam-sessions/:id/hall-tickets` | exam_controller, hod, principal, tenant_admin |  |
| POST | `/v1/exam-sessions/:id/hall-tickets` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/exam-sessions/:id/hall-tickets/:studentId/pdf` | any signed-in user |  |
| GET | `/v1/exam-sessions/:id/internal-marks.csv` | exam_controller, hod, principal, tenant_admin |  |
| POST | `/v1/exam-sessions/:id/lock` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/exam-sessions/:id/malpractice` | exam_controller, hod, principal, tenant_admin |  |
| POST | `/v1/exam-sessions/:id/malpractice` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/exam-sessions/:id/papers` | exam_controller, principal, tenant_admin |  |
| DELETE | `/v1/exam-sessions/:id/papers/:paperId` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/exam-sessions/:id/papers/:paperId/reschedule` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/exam-sessions/:id/practicals` | exam_controller, hod, principal, tenant_admin |  |
| POST | `/v1/exam-sessions/:id/practicals` | exam_controller, hod, principal, tenant_admin |  |
| POST | `/v1/exam-sessions/:id/process` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/exam-sessions/:id/progression` | exam_controller, hod, principal, tenant_admin |  |
| POST | `/v1/exam-sessions/:id/publish` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/exam-sessions/:id/publish-approval` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/exam-sessions/:id/qp-appointments` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/exam-sessions/:id/qp-setting` | exam_controller, hod, principal, tenant_admin |  |
| GET | `/v1/exam-sessions/:id/ranks` | exam_controller, hod, principal, tenant_admin |  |
| POST | `/v1/exam-sessions/:id/register` | any signed-in user |  |
| GET | `/v1/exam-sessions/:id/registers/attendance-sheet.pdf` | exam_controller, examiner, hod, principal, teacher, tenant_admin |  |
| GET | `/v1/exam-sessions/:id/registers/d-form.pdf` | exam_controller, hod, principal, tenant_admin |  |
| GET | `/v1/exam-sessions/:id/registers/tabulation.pdf` | exam_controller, hod, principal, tenant_admin |  |
| GET | `/v1/exam-sessions/:id/registration-window` | any signed-in user | OWNERSHIP? reviewed |
| PUT | `/v1/exam-sessions/:id/registration-window` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/exam-sessions/:id/registrations` | exam_controller, hod, principal, tenant_admin |  |
| POST | `/v1/exam-sessions/:id/registrations/:studentId/override` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/exam-sessions/:id/request-approval` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/exam-sessions/:id/request-publish` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/exam-sessions/:id/result-rules` | exam_controller, hod, principal, tenant_admin |  |
| PUT | `/v1/exam-sessions/:id/result-rules` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/exam-sessions/:id/results` | exam_controller, hod, principal, tenant_admin |  |
| GET | `/v1/exam-sessions/:id/results.csv` | exam_controller, hod, principal, tenant_admin |  |
| POST | `/v1/exam-sessions/:id/results/:studentId/change` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/exam-sessions/:id/results/:studentId/revisions` | exam_controller, hod, principal, tenant_admin |  |
| POST | `/v1/exam-sessions/:id/return` | principal, tenant_admin |  |
| GET | `/v1/exam-sessions/:id/revaluations` | exam_controller, hod, principal, tenant_admin |  |
| GET | `/v1/exam-sessions/:id/revisions` | exam_controller, hod, principal, tenant_admin |  |
| POST | `/v1/exam-sessions/:id/rollback` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/exam-sessions/:id/runs` | exam_controller, hod, principal, tenant_admin |  |
| POST | `/v1/exam-sessions/:id/schedule` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/exam-sessions/:id/seating` | exam_controller, hod, principal, tenant_admin |  |
| POST | `/v1/exam-sessions/:id/seating` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/exam-sessions/:id/seating-plan` | exam_controller, hod, principal, tenant_admin |  |
| POST | `/v1/exam-sessions/:id/seating-plan` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/exam-sessions/:id/seating-plan/sittings/:slot/rooms/:roomId/pdf` | exam_controller, hod, principal, tenant_admin |  |
| POST | `/v1/exam-sessions/:id/subjects/:subjectId/draw` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/exam-sessions/:id/subjects/:subjectId/qp-coverage` | exam_controller, hod, principal, teacher, tenant_admin |  |
| GET | `/v1/exam-sessions/:id/supplementary` | exam_controller, hod, principal, tenant_admin |  |
| POST | `/v1/exam-sessions/:id/supplementary` | any signed-in user |  |
| DELETE | `/v1/exam-sessions/:id/supplementary/:regId` | exam_controller, hod, principal, tenant_admin |  |
| GET | `/v1/exam-sessions/:id/swaps` | exam_controller, hod, principal, tenant_admin |  |
| POST | `/v1/exam-sessions/:id/unfreeze` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/exam-sessions/:id/unpublish` | principal, tenant_admin |  |
| POST | `/v1/examiner-portal/assignments/:id/claims` | external_examiner |  |
| GET | `/v1/examiner-portal/assignments/:id/question-paper` | external_examiner | OWNERSHIP? reviewed |
| PUT | `/v1/examiner-portal/assignments/:id/question-paper` | external_examiner |  |
| POST | `/v1/examiner-portal/assignments/:id/question-paper/:action` | external_examiner |  |
| GET | `/v1/examiner-portal/assignments/:id/scripts` | external_examiner | OWNERSHIP? reviewed |
| GET | `/v1/examiner-portal/claims` | external_examiner |  |
| GET | `/v1/examiner-portal/me` | external_examiner |  |
| PUT | `/v1/examiner-portal/scripts/:id` | external_examiner |  |
| GET | `/v1/exit-tickets/:id` | hod, hod, principal, teacher, tenant_admin |  |
| PUT | `/v1/exit-tickets/:id` | board token |  |
| GET | `/v1/external-examiners` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/external-examiners` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/external-examiners/:id/assignments` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/external-examiners/assignments/:id/apply` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/external-examiners/assignments/:id/reinvite` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/external-examiners/assignments/:id/revoke` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/external-examiners/assignments/:id/scripts` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/external-examiners/assignments/:id/scripts` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/external-examiners/claims` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/external-examiners/claims/:id/decide` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/external-examiners/question-papers` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/external-examiners/question-papers/:id/:action` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/facilities/bookings` | accountant, canteen_manager, hod, hostel_warden, librarian, principal, store_keeper, teacher, tenant_admin, transport_manager |  |
| POST | `/v1/facilities/bookings` | accountant, canteen_manager, hod, hostel_warden, librarian, principal, store_keeper, teacher, tenant_admin, transport_manager |  |
| POST | `/v1/facilities/bookings/:id/cancel` | accountant, canteen_manager, hod, hostel_warden, librarian, principal, store_keeper, teacher, tenant_admin, transport_manager |  |
| POST | `/v1/facilities/bookings/:id/decision` | accountant, canteen_manager, hod, hostel_warden, librarian, principal, store_keeper, teacher, tenant_admin, transport_manager |  |
| GET | `/v1/facilities/rooms` | accountant, canteen_manager, hod, hostel_warden, librarian, principal, store_keeper, teacher, tenant_admin, transport_manager |  |
| GET | `/v1/facilities/rooms/:id/day` | accountant, canteen_manager, hod, hostel_warden, librarian, principal, store_keeper, teacher, tenant_admin, transport_manager |  |
| GET | `/v1/facilities/tickets` | accountant, canteen_manager, hod, hostel_warden, librarian, principal, store_keeper, teacher, tenant_admin, transport_manager |  |
| POST | `/v1/facilities/tickets` | accountant, canteen_manager, hod, hostel_warden, librarian, principal, store_keeper, teacher, tenant_admin, transport_manager |  |
| GET | `/v1/facilities/tickets/:id` | accountant, canteen_manager, hod, hostel_warden, librarian, principal, store_keeper, teacher, tenant_admin, transport_manager |  |
| POST | `/v1/facilities/tickets/:id/feedback` | accountant, canteen_manager, hod, hostel_warden, librarian, principal, store_keeper, teacher, tenant_admin, transport_manager |  |
| POST | `/v1/facilities/tickets/:id/status` | accountant, canteen_manager, hod, hostel_warden, librarian, principal, store_keeper, teacher, tenant_admin, transport_manager |  |
| GET | `/v1/facilities/tickets/summary` | accountant, canteen_manager, hod, hostel_warden, librarian, principal, store_keeper, teacher, tenant_admin, transport_manager |  |
| GET | `/v1/features` | any signed-in user |  |
| POST | `/v1/fee-accounts/cheques` | accountant, principal, tenant_admin |  |
| POST | `/v1/fee-accounts/cheques/:id/:action` | accountant, principal, tenant_admin |  |
| POST | `/v1/fee-accounts/closings` | accountant, principal, tenant_admin |  |
| POST | `/v1/fee-accounts/closings/:id/decide` | accountant, principal, tenant_admin |  |
| POST | `/v1/fee-accounts/closings/:id/handover` | accountant, principal, tenant_admin |  |
| GET | `/v1/fee-accounts/closings/expected` | accountant, principal, tenant_admin |  |
| POST | `/v1/fee-accounts/concessions` | accountant, principal, tenant_admin |  |
| POST | `/v1/fee-accounts/concessions/:id/decide` | accountant, principal, tenant_admin |  |
| GET | `/v1/fee-accounts/inbox` | accountant, principal, tenant_admin |  |
| GET | `/v1/fee-accounts/list/:entity` | accountant, principal, tenant_admin |  |
| GET | `/v1/fee-accounts/periods` | accountant, principal, tenant_admin |  |
| POST | `/v1/fee-accounts/periods/:period/close` | accountant, principal, tenant_admin |  |
| GET | `/v1/fee-accounts/records/:entity/:id` | accountant, principal, tenant_admin |  |
| POST | `/v1/fee-accounts/refunds` | accountant, principal, tenant_admin |  |
| POST | `/v1/fee-accounts/refunds/:id/decide` | accountant, hod, principal, tenant_admin |  |
| POST | `/v1/fee-accounts/refunds/:id/pay` | accountant, principal, tenant_admin |  |
| POST | `/v1/fee-accounts/refunds/:id/revert` | principal, tenant_admin |  |
| GET | `/v1/fee-accounts/reports/:key` | accountant, principal, tenant_admin |  |
| GET | `/v1/fee-accounts/settings` | accountant, principal, tenant_admin |  |
| PUT | `/v1/fee-accounts/settings` | accountant, principal, tenant_admin |  |
| POST | `/v1/fee-accounts/structures` | accountant, principal, tenant_admin |  |
| PATCH | `/v1/fee-accounts/structures/:id` | accountant, principal, tenant_admin |  |
| POST | `/v1/fee-accounts/structures/:id/decide` | principal, tenant_admin |  |
| POST | `/v1/fee-accounts/structures/:id/publish` | accountant, principal, tenant_admin |  |
| POST | `/v1/fee-accounts/structures/:id/submit` | accountant, principal, tenant_admin |  |
| POST | `/v1/fee-accounts/vouchers` | accountant, principal, tenant_admin |  |
| POST | `/v1/fee-accounts/vouchers/:id/decide` | accountant, principal, tenant_admin |  |
| POST | `/v1/fee-accounts/write-offs` | accountant, principal, tenant_admin |  |
| POST | `/v1/fee-accounts/write-offs/:id/decide` | principal, tenant_admin |  |
| GET | `/v1/fee-collect/carry-forward` | accountant, principal, tenant_admin |  |
| POST | `/v1/fee-collect/carry-forward` | accountant, principal, tenant_admin |  |
| GET | `/v1/fee-collect/carry-forward/history` | accountant, principal, tenant_admin |  |
| POST | `/v1/fee-collect/challans` | accountant, principal, tenant_admin |  |
| GET | `/v1/fee-collect/challans/:id` | accountant, principal, tenant_admin |  |
| POST | `/v1/fee-collect/challans/:id/cancel` | accountant, principal, tenant_admin |  |
| POST | `/v1/fee-collect/challans/reconcile` | accountant, principal, tenant_admin |  |
| POST | `/v1/fee-collect/counter` | accountant, principal, tenant_admin |  |
| GET | `/v1/fee-collect/counter-settings` | accountant, principal, tenant_admin |  |
| GET | `/v1/fee-collect/dues-check/:studentId` | accountant, exam_controller, hod, principal, tenant_admin |  |
| GET | `/v1/fee-collect/family/payments/:paymentId/receipt.pdf` | any signed-in user |  |
| POST | `/v1/fee-collect/govt-scholarships/:id/receive` | accountant, principal, tenant_admin |  |
| POST | `/v1/fee-collect/govt-scholarships/:id/reject` | accountant, principal, tenant_admin |  |
| POST | `/v1/fee-collect/govt-scholarships/:id/sanction` | accountant, principal, tenant_admin |  |
| POST | `/v1/fee-collect/govt-scholarships/:id/verify` | accountant, principal, tenant_admin |  |
| POST | `/v1/fee-collect/govt-scholarships/import-status` | accountant, principal, tenant_admin |  |
| GET | `/v1/fee-collect/invoices/:id/lines` | accountant, principal, tenant_admin |  |
| POST | `/v1/fee-collect/preview` | accountant, principal, tenant_admin |  |
| GET | `/v1/fee-collect/receipts/:id` | accountant, principal, tenant_admin |  |
| POST | `/v1/fee-collect/receipts/:id/cancel` | accountant, principal, tenant_admin |  |
| POST | `/v1/fee-collect/receipts/:id/cancel/decide` | accountant, hod, principal, tenant_admin |  |
| GET | `/v1/fee-collect/receipts/:id/pdf` | accountant, principal, tenant_admin |  |
| POST | `/v1/fee-collect/receipts/:id/print` | accountant, principal, tenant_admin |  |
| POST | `/v1/fee-collect/receipts/:id/reissue` | accountant, principal, tenant_admin |  |
| GET | `/v1/fee-collect/receipts/:id/upi` | any signed-in user |  |
| POST | `/v1/fee-collect/reminders/run` | accountant, principal, tenant_admin |  |
| GET | `/v1/fee-collect/reminders/runs` | accountant, principal, tenant_admin |  |
| GET | `/v1/fee-collect/students` | accountant, principal, tenant_admin |  |
| GET | `/v1/fee-collect/students/:id` | accountant, principal, tenant_admin |  |
| POST | `/v1/fee-collect/students/:id/from-advance` | accountant, principal, tenant_admin |  |
| POST | `/v1/fee-collect/summary/send` | accountant, principal, tenant_admin |  |
| GET | `/v1/fee-holds` | accountant, exam_controller, hod, principal, tenant_admin |  |
| GET | `/v1/fee-holds/:studentId` | accountant, exam_controller, hod, principal, tenant_admin |  |
| POST | `/v1/fee-holds/:studentId/overrides` | principal |  |
| DELETE | `/v1/fee-holds/overrides/:id` | principal |  |
| POST | `/v1/fee-setup/custom-plans` | accountant, principal, tenant_admin |  |
| POST | `/v1/fee-setup/custom-plans/:id/decide` | accountant, hod, principal, tenant_admin |  |
| GET | `/v1/fee-setup/heads` | accountant, principal, tenant_admin |  |
| GET | `/v1/fee-setup/instalment-plans` | accountant, principal, tenant_admin |  |
| GET | `/v1/fee-setup/invoices/:id/lines` | accountant, principal, tenant_admin |  |
| GET | `/v1/fee-setup/requests/:kind` | accountant, hod, principal, tenant_admin |  |
| GET | `/v1/fee-setup/structures/:id` | accountant, principal, tenant_admin |  |
| POST | `/v1/fee-setup/structures/:id/assign` | accountant, principal, tenant_admin |  |
| PUT | `/v1/fee-setup/structures/:id/items` | accountant, principal, tenant_admin |  |
| GET | `/v1/fee-setup/structures/:id/preview` | accountant, principal, tenant_admin |  |
| GET | `/v1/fee-setup/structures/:id/print` | accountant, principal, tenant_admin |  |
| POST | `/v1/fee-setup/structures/:id/reassign` | accountant, principal, tenant_admin |  |
| GET | `/v1/fee-setup/students/:id/structures` | accountant, principal, tenant_admin |  |
| POST | `/v1/fee-setup/students/:id/transfer` | accountant, principal, tenant_admin |  |
| GET | `/v1/fee-setup/students/:id/transfers` | accountant, principal, tenant_admin |  |
| POST | `/v1/fee-setup/waivers` | accountant, principal, tenant_admin |  |
| POST | `/v1/fee-setup/waivers/:id/decide` | accountant, hod, principal, tenant_admin |  |
| POST | `/v1/fees/accruals/sync` | principal, tenant_admin |  |
| GET | `/v1/fees/bank-transfers` | accountant, principal, tenant_admin |  |
| GET | `/v1/fees/bank-transfers/:id/proof` | any signed-in user |  |
| POST | `/v1/fees/bank-transfers/:id/reject` | accountant, principal, tenant_admin |  |
| POST | `/v1/fees/bank-transfers/:id/verify` | accountant, principal, tenant_admin |  |
| GET | `/v1/fees/credits` | accountant, principal, tenant_admin |  |
| POST | `/v1/fees/credits` | accountant, principal, tenant_admin |  |
| POST | `/v1/fees/credits/refund` | principal, tenant_admin |  |
| GET | `/v1/fees/credits/students/:studentId` | any signed-in user |  |
| POST | `/v1/fees/fee-refs/generate` | accountant, principal, tenant_admin |  |
| GET | `/v1/fees/flags` | accountant, principal, tenant_admin |  |
| POST | `/v1/fees/flags/:id/resolve` | accountant, principal, tenant_admin |  |
| POST | `/v1/fees/gateway-return/:provider/:tenantSlug` | PUBLIC |  |
| GET | `/v1/fees/gateway-return/cashfree/:tenantSlug` | PUBLIC |  |
| GET | `/v1/fees/instalment-plans` | accountant, principal, tenant_admin |  |
| POST | `/v1/fees/instalment-plans` | accountant, principal, tenant_admin |  |
| POST | `/v1/fees/instalment-plans/:id/active` | accountant, principal, tenant_admin |  |
| GET | `/v1/fees/invoices` | accountant, principal, tenant_admin |  |
| POST | `/v1/fees/invoices` | accountant, principal, tenant_admin |  |
| POST | `/v1/fees/invoices/:id/apply-credit` | accountant, principal, tenant_admin |  |
| POST | `/v1/fees/invoices/:id/cancel` | accountant, principal, tenant_admin |  |
| POST | `/v1/fees/invoices/:id/checkout` | any signed-in user |  |
| GET | `/v1/fees/invoices/:id/instalments` | any signed-in user |  |
| POST | `/v1/fees/invoices/:id/instalments` | accountant, principal, tenant_admin |  |
| POST | `/v1/fees/invoices/:id/payments` | accountant, principal, tenant_admin |  |
| GET | `/v1/fees/invoices/:id/upi` | any signed-in user |  |
| GET | `/v1/fees/late-fee-rule` | accountant, principal, tenant_admin |  |
| PUT | `/v1/fees/late-fee-rule` | principal, tenant_admin |  |
| GET | `/v1/fees/late-fees` | accountant, principal, tenant_admin |  |
| POST | `/v1/fees/late-fees/:id/waive` | principal, tenant_admin |  |
| POST | `/v1/fees/late-fees/run` | accountant, principal, tenant_admin |  |
| GET | `/v1/fees/payment-links` | accountant, principal, tenant_admin |  |
| POST | `/v1/fees/payment-links` | accountant, principal, tenant_admin |  |
| POST | `/v1/fees/payment-links/:id/cancel` | accountant, principal, tenant_admin |  |
| POST | `/v1/fees/payment-links/:id/resend` | accountant, principal, tenant_admin |  |
| GET | `/v1/fees/payments` | accountant, principal, tenant_admin |  |
| POST | `/v1/fees/payments/:id/confirm` | any signed-in user |  |
| GET | `/v1/fees/payments/:id/receipt` | any signed-in user |  |
| POST | `/v1/fees/payments/:id/refresh` | any signed-in user |  |
| POST | `/v1/fees/reminders` | accountant, principal, tenant_admin |  |
| GET | `/v1/fees/settlements` | accountant, principal, tenant_admin |  |
| GET | `/v1/fees/settlements/:id` | accountant, principal, tenant_admin |  |
| GET | `/v1/fees/settlements/exceptions` | accountant, principal, tenant_admin |  |
| POST | `/v1/fees/settlements/fetch` | accountant, principal, tenant_admin |  |
| POST | `/v1/fees/settlements/import` | accountant, principal, tenant_admin |  |
| POST | `/v1/fees/settlements/lines/:id/resolve` | accountant, principal, tenant_admin |  |
| POST | `/v1/fees/settlements/payments/:id/gateway-refund` | accountant, principal, tenant_admin |  |
| GET | `/v1/fees/settlements/unsettled` | accountant, principal, tenant_admin |  |
| GET | `/v1/fees/sponsor-invoices` | accountant, principal, tenant_admin |  |
| POST | `/v1/fees/sponsor-invoices` | accountant, principal, tenant_admin |  |
| GET | `/v1/fees/sponsor-invoices/:id` | accountant, principal, tenant_admin |  |
| POST | `/v1/fees/sponsor-invoices/:id/cancel` | accountant, principal, tenant_admin |  |
| POST | `/v1/fees/sponsor-invoices/:id/payments` | accountant, principal, tenant_admin |  |
| GET | `/v1/fees/sponsor-invoices/outstanding` | accountant, principal, tenant_admin |  |
| GET | `/v1/fees/sponsors` | accountant, principal, tenant_admin |  |
| POST | `/v1/fees/sponsors` | accountant, principal, tenant_admin |  |
| GET | `/v1/fees/students/:id` | any signed-in user |  |
| GET | `/v1/fees/students/:studentId/instalments` | any signed-in user |  |
| GET | `/v1/fees/summary` | accountant, principal, tenant_admin |  |
| POST | `/v1/fees/webhooks/:provider/:tenantSlug` | PUBLIC |  |
| POST | `/v1/fees/webhooks/payu/:tenantSlug` | PUBLIC |  |
| POST | `/v1/fees/webhooks/razorpay` | PUBLIC |  |
| POST | `/v1/fees/webhooks/razorpay/:tenantSlug` | PUBLIC |  |
| GET | `/v1/finance/budgets` | accountant, principal, tenant_admin |  |
| PUT | `/v1/finance/budgets` | accountant, principal, tenant_admin |  |
| POST | `/v1/finance/expenses` | accountant, principal, tenant_admin |  |
| GET | `/v1/finance/gl` | accountant, principal, tenant_admin |  |
| GET | `/v1/finance/gl.csv` | accountant, principal, tenant_admin |  |
| GET | `/v1/finance/gl.xml` | accountant, principal, tenant_admin |  |
| POST | `/v1/finance/refunds` | accountant, principal, tenant_admin |  |
| GET | `/v1/finance/scholarship-schemes` | any signed-in user |  |
| POST | `/v1/finance/scholarship-schemes` | accountant, principal, tenant_admin |  |
| PATCH | `/v1/finance/scholarship-schemes/:id` | accountant, principal, tenant_admin |  |
| GET | `/v1/finance/scholarships` | any signed-in user |  |
| POST | `/v1/finance/scholarships/:id/cancel` | guardian, student |  |
| POST | `/v1/finance/scholarships/:id/decide` | accountant, principal, tenant_admin |  |
| POST | `/v1/finance/scholarships/apply` | guardian, student |  |
| POST | `/v1/governance/documents/:id/hold` | principal, quality_officer, tenant_admin |  |
| GET | `/v1/governance/documents/:id/versions` | principal, quality_officer, tenant_admin |  |
| GET | `/v1/governance/incidents` | principal, quality_officer, tenant_admin |  |
| POST | `/v1/governance/incidents` | accountant, admissions_officer, canteen_manager, counsellor, driver, exam_controller, examiner, grievance_officer, hod, hostel_warden, hr_manager, icc_member, librarian, placement_officer, principal, quality_officer, research_coordinator, store_keeper, teacher, tenant_admin, transport_manager |  |
| GET | `/v1/governance/incidents/:id` | principal, quality_officer, tenant_admin |  |
| PUT | `/v1/governance/incidents/:id` | principal, quality_officer, tenant_admin |  |
| POST | `/v1/governance/incidents/:id/updates` | principal, quality_officer, tenant_admin |  |
| GET | `/v1/governance/retention` | principal, quality_officer, tenant_admin |  |
| DELETE | `/v1/governance/retention/:category` | principal, quality_officer, tenant_admin |  |
| PUT | `/v1/governance/retention/:category` | principal, quality_officer, tenant_admin |  |
| GET | `/v1/governance/retention/due` | principal, quality_officer, tenant_admin |  |
| POST | `/v1/governance/retention/run` | principal, quality_officer, tenant_admin |  |
| GET | `/v1/governance/rules` | principal, quality_officer, tenant_admin |  |
| POST | `/v1/governance/rules` | principal, quality_officer, tenant_admin |  |
| PUT | `/v1/governance/rules/:id` | principal, quality_officer, tenant_admin |  |
| POST | `/v1/governance/rules/:id/approve` | principal, quality_officer, tenant_admin |  |
| POST | `/v1/governance/rules/:id/move` | principal, quality_officer, tenant_admin |  |
| GET | `/v1/governance/rules/history` | principal, quality_officer, tenant_admin |  |
| GET | `/v1/governance/rules/resolve` | accountant, admissions_officer, canteen_manager, counsellor, driver, exam_controller, examiner, grievance_officer, hod, hostel_warden, hr_manager, icc_member, librarian, placement_officer, principal, quality_officer, research_coordinator, store_keeper, teacher, tenant_admin, transport_manager |  |
| POST | `/v1/grace-applications/:id/apply` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/grace-applications/:id/decide` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/grade-scales` | exam_controller, hod, principal, teacher, tenant_admin |  |
| POST | `/v1/grade-scales` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/grading-assist/evaluation/:allocationId/suggest` | examiner, hod, principal, teacher |  |
| POST | `/v1/grading-assist/homework/:homeworkId/:studentId/suggest` | examiner, hod, principal, teacher |  |
| GET | `/v1/grading-assist/suggestions` | examiner, hod, principal, teacher |  |
| PUT | `/v1/grading-assist/suggestions/:id/decision` | examiner, hod, principal, teacher |  |
| GET | `/v1/grievances` | grievance_officer, icc_member, principal, principal, tenant_admin |  |
| POST | `/v1/grievances` | any signed-in user |  |
| GET | `/v1/grievances/:id` | any signed-in user |  |
| POST | `/v1/grievances/:id/appeal` | any signed-in user |  |
| POST | `/v1/grievances/:id/appeal-decision` | principal, tenant_admin |  |
| POST | `/v1/grievances/:id/assign` | grievance_officer, icc_member, principal, principal, tenant_admin |  |
| POST | `/v1/grievances/:id/comments` | any signed-in user |  |
| POST | `/v1/grievances/:id/committee-stage` | icc_member, principal |  |
| GET | `/v1/grievances/:id/evidence` | any signed-in user |  |
| POST | `/v1/grievances/:id/evidence` | any signed-in user |  |
| POST | `/v1/grievances/:id/rating` | any signed-in user |  |
| POST | `/v1/grievances/:id/reopen` | any signed-in user |  |
| POST | `/v1/grievances/:id/resolve` | grievance_officer, icc_member, principal, principal, tenant_admin |  |
| POST | `/v1/grievances/:id/status` | grievance_officer, icc_member, principal, principal, tenant_admin |  |
| POST | `/v1/grievances/escalate-overdue` | grievance_officer, icc_member, principal, principal, tenant_admin |  |
| DELETE | `/v1/grievances/evidence/:evidenceId` | any signed-in user |  |
| GET | `/v1/grievances/evidence/:evidenceId/download` | any signed-in user |  |
| GET | `/v1/grievances/mine` | any signed-in user |  |
| GET | `/v1/grievances/stats` | grievance_officer, icc_member, principal, principal, tenant_admin |  |
| GET | `/v1/homework` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/homework` | hod, principal, teacher |  |
| GET | `/v1/homework/:id` | any signed-in user |  |
| DELETE | `/v1/homework/:id/extensions/:studentId` | any signed-in user |  |
| PUT | `/v1/homework/:id/extensions/:studentId` | any signed-in user |  |
| PUT | `/v1/homework/:id/groups` | any signed-in user |  |
| PUT | `/v1/homework/:id/marks` | any signed-in user |  |
| GET | `/v1/homework/:id/peer-review` | any signed-in user |  |
| PUT | `/v1/homework/:id/peer-review/:reviewId` | student |  |
| POST | `/v1/homework/:id/peer-review/assign` | any signed-in user |  |
| GET | `/v1/homework/:id/peer-review/mine` | student |  |
| GET | `/v1/homework/:id/peer-review/received` | student |  |
| POST | `/v1/homework/:id/push-marks` | any signed-in user |  |
| GET | `/v1/homework/:id/settings` | any signed-in user |  |
| PUT | `/v1/homework/:id/settings` | any signed-in user | BROAD reviewed |
| GET | `/v1/homework/:id/submissions` | any signed-in user |  |
| GET | `/v1/homework/:id/submissions/:studentId` | any signed-in user |  |
| POST | `/v1/homework/:id/submissions/:studentId` | guardian, student |  |
| GET | `/v1/homework/:id/submissions/:studentId/files/:index` | any signed-in user |  |
| POST | `/v1/homework/:id/submissions/:studentId/review` | any signed-in user |  |
| POST | `/v1/homework/:id/submissions/remind` | any signed-in user |  |
| POST | `/v1/homework/from-board` | board token |  |
| POST | `/v1/hostel/allotments` | hostel_warden, principal, tenant_admin |  |
| POST | `/v1/hostel/allotments/:id/transfer` | hostel_warden, principal, tenant_admin |  |
| POST | `/v1/hostel/allotments/:id/vacate` | hostel_warden, principal, tenant_admin |  |
| POST | `/v1/hostel/applications/auto-allot` | hostel_warden, principal, tenant_admin |  |
| GET | `/v1/hostel/applications/mine` | guardian, student |  |
| POST | `/v1/hostel/applications/mine` | guardian, student |  |
| GET | `/v1/hostel/beds` | hostel_warden, principal, tenant_admin |  |
| GET | `/v1/hostel/blocks` | hostel_warden, principal, tenant_admin |  |
| POST | `/v1/hostel/blocks` | hostel_warden, principal, tenant_admin |  |
| POST | `/v1/hostel/blocks/:id/rooms` | hostel_warden, principal, tenant_admin |  |
| GET | `/v1/hostel/complaints` | any signed-in user |  |
| POST | `/v1/hostel/complaints` | any signed-in user |  |
| POST | `/v1/hostel/complaints/:id/status` | hostel_warden, principal, tenant_admin |  |
| GET | `/v1/hostel/compliance` | accountant, hostel_warden, principal, quality_officer, tenant_admin |  |
| POST | `/v1/hostel/duties/plan` | hostel_warden, principal, tenant_admin |  |
| POST | `/v1/hostel/fees` | hostel_warden, principal, tenant_admin |  |
| GET | `/v1/hostel/gate-passes` | hostel_warden, principal, tenant_admin |  |
| POST | `/v1/hostel/gate-passes` | hostel_warden, principal, tenant_admin |  |
| POST | `/v1/hostel/gate-passes/:id/approve` | hostel_warden, principal, tenant_admin |  |
| POST | `/v1/hostel/gate-passes/:id/cancel` | hostel_warden, principal, tenant_admin |  |
| POST | `/v1/hostel/gate-passes/:id/in` | hostel_warden, principal, tenant_admin |  |
| POST | `/v1/hostel/gate-passes/:id/out` | hostel_warden, principal, tenant_admin |  |
| POST | `/v1/hostel/gate-passes/:id/parent-approve` | guardian |  |
| POST | `/v1/hostel/gate-passes/:id/parent-reject` | guardian |  |
| POST | `/v1/hostel/gate-passes/:id/reject` | hostel_warden, principal, tenant_admin |  |
| GET | `/v1/hostel/gate-passes/for-family` | guardian |  |
| POST | `/v1/hostel/gate-passes/requests` | guardian, student |  |
| POST | `/v1/hostel/gate/manual` | hostel_warden, principal, tenant_admin |  |
| GET | `/v1/hostel/gate/out-now` | hostel_warden, principal, tenant_admin |  |
| POST | `/v1/hostel/gate/scan` | hostel_warden, principal, tenant_admin |  |
| POST | `/v1/hostel/mess/bills/charge` | hostel_warden, principal, tenant_admin |  |
| POST | `/v1/hostel/mess/bills/run` | hostel_warden, principal, tenant_admin |  |
| POST | `/v1/hostel/mess/expenses/import-stock` | canteen_manager, hostel_warden, principal, tenant_admin |  |
| POST | `/v1/hostel/mess/fees` | hostel_warden, principal, tenant_admin |  |
| POST | `/v1/hostel/mess/inspections` | any signed-in user |  |
| POST | `/v1/hostel/mess/leaves/mine` | guardian, student |  |
| GET | `/v1/hostel/mess/menu` | any signed-in user |  |
| PUT | `/v1/hostel/mess/menu` | hostel_warden, principal, tenant_admin |  |
| GET | `/v1/hostel/mess/plans` | hostel_warden, principal, tenant_admin |  |
| POST | `/v1/hostel/mess/plans` | hostel_warden, principal, tenant_admin |  |
| POST | `/v1/hostel/mess/subscriptions` | hostel_warden, principal, tenant_admin |  |
| GET | `/v1/hostel/night-attendance` | hostel_warden, principal, tenant_admin |  |
| POST | `/v1/hostel/night-attendance` | hostel_warden, principal, tenant_admin |  |
| GET | `/v1/hostel/no-dues/:studentId` | any signed-in user |  |
| GET | `/v1/hostel/occupancy` | hostel_warden, principal, tenant_admin |  |
| GET | `/v1/hostel/reports/aishe` | accountant, hostel_warden, principal, quality_officer, tenant_admin |  |
| GET | `/v1/hostel/reports/defaulters` | accountant, hostel_warden, principal, quality_officer, tenant_admin |  |
| POST | `/v1/hostel/requests/mine` | guardian, student |  |
| GET | `/v1/hostel/safety` | any signed-in user |  |
| GET | `/v1/hostel/students/:id` | any signed-in user |  |
| GET | `/v1/hostel/students/:id/gate-qr` | hostel_warden, principal, student, tenant_admin |  |
| GET | `/v1/hostel/students/:id/requests` | any signed-in user |  |
| GET | `/v1/hostel/visitors` | hostel_warden, principal, tenant_admin |  |
| POST | `/v1/hostel/visitors` | hostel_warden, principal, tenant_admin |  |
| POST | `/v1/hostel/visitors/:id/out` | hostel_warden, principal, tenant_admin |  |
| GET | `/v1/hostel/waitlist` | hostel_warden, principal, tenant_admin |  |
| POST | `/v1/hostel/waitlist` | hostel_warden, principal, tenant_admin |  |
| POST | `/v1/hostel/waitlist/:id/allot` | hostel_warden, principal, tenant_admin |  |
| POST | `/v1/hostel/waitlist/:id/cancel` | hostel_warden, principal, tenant_admin |  |
| GET | `/v1/hostel/work-orders` | hostel_warden, principal, tenant_admin |  |
| POST | `/v1/hostel/work-orders` | hostel_warden, principal, tenant_admin |  |
| POST | `/v1/hostel/work-orders/:id/assign` | hostel_warden, principal, tenant_admin |  |
| POST | `/v1/hostel/work-orders/:id/complete` | hostel_warden, principal, tenant_admin |  |
| POST | `/v1/hostel/work-orders/:id/start` | hostel_warden, principal, tenant_admin |  |
| POST | `/v1/hostel/work-orders/:id/verify` | hostel_warden, principal, tenant_admin |  |
| GET | `/v1/hostel/work-orders/mine` | any signed-in user |  |
| POST | `/v1/houses` | principal, tenant_admin |  |
| GET | `/v1/houses/:id` | guardian, hod, principal, student, teacher, tenant_admin | OWNERSHIP? reviewed |
| POST | `/v1/houses/:id/members` | principal, tenant_admin |  |
| POST | `/v1/houses/:id/points` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/houses/leaderboard` | guardian, hod, principal, student, teacher, tenant_admin |  |
| GET | `/v1/hr/applicants/:id/appointment-letter` | hr_manager, principal, tenant_admin |  |
| GET | `/v1/hr/applicants/:id/file` | hr_manager, principal, tenant_admin |  |
| POST | `/v1/hr/applicants/:id/hire` | hr_manager, principal, tenant_admin |  |
| POST | `/v1/hr/applicants/:id/offer` | hr_manager, principal, tenant_admin |  |
| GET | `/v1/hr/applicants/:id/offers` | hr_manager, principal, tenant_admin |  |
| GET | `/v1/hr/applicants/:id/resume` | hod, hr_manager, principal, teacher, tenant_admin |  |
| POST | `/v1/hr/applicants/:id/resume` | hr_manager, principal, tenant_admin |  |
| PUT | `/v1/hr/applicants/:id/stage` | hr_manager, principal, tenant_admin |  |
| GET | `/v1/hr/appraisal-categories` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| GET | `/v1/hr/appraisal-cycles` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| POST | `/v1/hr/appraisal-cycles` | hr_manager, principal, tenant_admin |  |
| POST | `/v1/hr/appraisal-cycles/:id/close` | hr_manager, principal, tenant_admin |  |
| GET | `/v1/hr/appraisals` | hod, hr_manager, principal, tenant_admin |  |
| GET | `/v1/hr/appraisals/:id` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| PUT | `/v1/hr/appraisals/:id/committee` | hr_manager, principal, tenant_admin |  |
| PUT | `/v1/hr/appraisals/:id/finalise` | principal, tenant_admin |  |
| PUT | `/v1/hr/appraisals/:id/hod-review` | hod, hr_manager, principal, tenant_admin |  |
| GET | `/v1/hr/appraisals/me` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| PUT | `/v1/hr/appraisals/me` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| GET | `/v1/hr/attendance` | hr_manager, principal, tenant_admin |  |
| PUT | `/v1/hr/attendance` | hr_manager, principal, tenant_admin |  |
| POST | `/v1/hr/attendance/check-in` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| POST | `/v1/hr/attendance/check-out` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| POST | `/v1/hr/attendance/import` | hr_manager, principal, tenant_admin |  |
| GET | `/v1/hr/attendance/me` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| GET | `/v1/hr/attendance/summary` | accountant, hr_manager, principal, tenant_admin |  |
| GET | `/v1/hr/designations` | accountant, hr_manager, principal, tenant_admin |  |
| POST | `/v1/hr/designations` | hr_manager, principal, tenant_admin |  |
| POST | `/v1/hr/evaluations` | any signed-in user | BROAD reviewed |
| GET | `/v1/hr/evaluations/criteria` | any signed-in user |  |
| GET | `/v1/hr/evaluations/report` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| GET | `/v1/hr/evaluations/to-rate` | student |  |
| GET | `/v1/hr/history/:subjectType/:subjectId` | accountant, hod, hr_manager, principal, tenant_admin |  |
| GET | `/v1/hr/holidays` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| GET | `/v1/hr/interviews/:id/scores` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| PUT | `/v1/hr/interviews/:id/scores` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| GET | `/v1/hr/interviews/mine` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| GET | `/v1/hr/leave-types` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| POST | `/v1/hr/leave-types` | hr_manager, principal, tenant_admin |  |
| PUT | `/v1/hr/leave-types/:id` | hr_manager, principal, tenant_admin |  |
| GET | `/v1/hr/leave/balances` | accountant, hod, hr_manager, principal, tenant_admin |  |
| GET | `/v1/hr/leave/balances/me` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| POST | `/v1/hr/leave/carry-forward` | hr_manager, principal, tenant_admin |  |
| GET | `/v1/hr/leave/encashments` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| POST | `/v1/hr/leave/encashments` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| POST | `/v1/hr/leave/encashments/:id/decide` | principal, tenant_admin |  |
| GET | `/v1/hr/leave/requests` | hod, hr_manager, principal, tenant_admin |  |
| POST | `/v1/hr/leave/requests` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| GET | `/v1/hr/leave/requests/:id` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| POST | `/v1/hr/leave/requests/:id/approve` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| POST | `/v1/hr/leave/requests/:id/arrange-substitutes` | hod, hr_manager, principal, tenant_admin |  |
| POST | `/v1/hr/leave/requests/:id/cancel` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| GET | `/v1/hr/leave/requests/:id/document` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| POST | `/v1/hr/leave/requests/:id/document` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| POST | `/v1/hr/leave/requests/:id/reject` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| POST | `/v1/hr/leave/requests/:id/revoke` | hr_manager, principal, tenant_admin |  |
| GET | `/v1/hr/leave/requests/me` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| GET | `/v1/hr/loans` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| POST | `/v1/hr/loans` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| GET | `/v1/hr/loans/:id` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| POST | `/v1/hr/loans/:id/cancel` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| POST | `/v1/hr/loans/:id/close` | principal, tenant_admin |  |
| POST | `/v1/hr/loans/:id/decide` | principal, tenant_admin |  |
| GET | `/v1/hr/me` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| GET | `/v1/hr/module-settings` | accountant, hr_manager, principal, tenant_admin |  |
| PUT | `/v1/hr/module-settings` | hr_manager, principal, tenant_admin |  |
| GET | `/v1/hr/offers/:id/pdf` | hr_manager, principal, tenant_admin |  |
| PUT | `/v1/hr/offers/:id/status` | hr_manager, principal, tenant_admin |  |
| GET | `/v1/hr/onboarding` | hr_manager, principal, tenant_admin |  |
| PUT | `/v1/hr/onboarding/:id/done` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| GET | `/v1/hr/openings` | hr_manager, principal, tenant_admin |  |
| POST | `/v1/hr/openings` | hr_manager, principal, tenant_admin |  |
| PUT | `/v1/hr/openings/:id` | hr_manager, principal, tenant_admin |  |
| GET | `/v1/hr/openings/:id/applicants` | hr_manager, principal, tenant_admin |  |
| POST | `/v1/hr/openings/:id/applicants` | hr_manager, principal, tenant_admin |  |
| POST | `/v1/hr/openings/:id/decide` | principal, tenant_admin |  |
| POST | `/v1/hr/openings/requisitions` | hod, hr_manager, principal, tenant_admin |  |
| GET | `/v1/hr/payroll/adjustments` | accountant, hr_manager, principal, tenant_admin |  |
| POST | `/v1/hr/payroll/adjustments` | accountant, hr_manager, principal, tenant_admin |  |
| POST | `/v1/hr/payroll/adjustments/:id/decide` | principal, tenant_admin |  |
| POST | `/v1/hr/payroll/adjustments/revision-arrears` | accountant, hr_manager, principal, tenant_admin |  |
| GET | `/v1/hr/payroll/challans` | accountant, hr_manager, principal, tenant_admin |  |
| POST | `/v1/hr/payroll/challans` | accountant, hr_manager, principal, tenant_admin |  |
| GET | `/v1/hr/payroll/form16/:userId` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| GET | `/v1/hr/payroll/staff-options` | accountant, hr_manager, principal, tenant_admin |  |
| GET | `/v1/hr/payroll/tax-profile` | accountant, hr_manager, principal, tenant_admin |  |
| PUT | `/v1/hr/payroll/tax-profile` | principal, tenant_admin |  |
| GET | `/v1/hr/payroll/tds-summary` | accountant, hr_manager, principal, tenant_admin |  |
| GET | `/v1/hr/probation` | hod, hr_manager, principal, tenant_admin |  |
| POST | `/v1/hr/probation/:userId/decide` | principal, tenant_admin |  |
| GET | `/v1/hr/probation/:userId/history` | hod, hr_manager, principal, tenant_admin |  |
| POST | `/v1/hr/probation/:userId/recommend` | hod, hr_manager, principal, tenant_admin |  |
| GET | `/v1/hr/probation/reviews/:id/letter` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| GET | `/v1/hr/qualifications` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| POST | `/v1/hr/qualifications` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| DELETE | `/v1/hr/qualifications/:id` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| POST | `/v1/hr/qualifications/:id/verify` | hr_manager, principal, tenant_admin |  |
| GET | `/v1/hr/qualifications/search` | hr_manager, principal, tenant_admin |  |
| GET | `/v1/hr/reimbursements` | accountant, hr_manager, principal, tenant_admin |  |
| POST | `/v1/hr/reimbursements` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| GET | `/v1/hr/reimbursements/:id` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| GET | `/v1/hr/reimbursements/:id/bill` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| POST | `/v1/hr/reimbursements/:id/bill` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| POST | `/v1/hr/reimbursements/:id/cancel` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| POST | `/v1/hr/reimbursements/:id/decide` | hr_manager, principal, tenant_admin |  |
| GET | `/v1/hr/reimbursements/me` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| GET | `/v1/hr/reports/:kind` | accountant, hr_manager, principal, tenant_admin |  |
| GET | `/v1/hr/separations` | accountant, hod, hr_manager, librarian, principal, tenant_admin |  |
| POST | `/v1/hr/separations` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| GET | `/v1/hr/separations/:id` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| POST | `/v1/hr/separations/:id/accept` | hr_manager, principal, tenant_admin |  |
| PUT | `/v1/hr/separations/:id/clearances/:department` | accountant, hod, hr_manager, librarian, principal, tenant_admin |  |
| GET | `/v1/hr/separations/:id/experience-certificate` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| POST | `/v1/hr/separations/:id/relieve` | hr_manager, principal, tenant_admin |  |
| GET | `/v1/hr/separations/:id/relieving-letter` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| PUT | `/v1/hr/separations/:id/settlement` | hr_manager, principal, tenant_admin |  |
| GET | `/v1/hr/separations/:id/settlement/compute` | hr_manager, principal, tenant_admin |  |
| POST | `/v1/hr/separations/:id/withdraw` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| GET | `/v1/hr/separations/mine` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| GET | `/v1/hr/staff` | accountant, hr_manager, principal, tenant_admin |  |
| GET | `/v1/hr/staff-documents/:id/file` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| POST | `/v1/hr/staff-documents/:id/file` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| POST | `/v1/hr/staff-documents/:id/file/remove` | hr_manager, principal, tenant_admin |  |
| GET | `/v1/hr/staff/:userId` | accountant, hr_manager, principal, tenant_admin |  |
| PUT | `/v1/hr/staff/:userId` | hr_manager, principal, tenant_admin |  |
| PUT | `/v1/hr/staff/:userId/bank` | hr_manager, principal, tenant_admin |  |
| GET | `/v1/hr/staff/:userId/details` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| PUT | `/v1/hr/staff/:userId/details` | hr_manager, principal, tenant_admin |  |
| GET | `/v1/hr/staff/:userId/onboarding` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| POST | `/v1/hr/staff/:userId/onboarding` | hr_manager, principal, tenant_admin |  |
| POST | `/v1/hr/staff/:userId/onboarding/start` | hr_manager, principal, tenant_admin |  |
| GET | `/v1/hr/staff/:userId/service-book` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| POST | `/v1/hr/staff/:userId/service-book` | hr_manager, principal, tenant_admin |  |
| GET | `/v1/hr/tax-declarations` | accountant, hr_manager, principal, tenant_admin |  |
| GET | `/v1/hr/tax-declarations/:id` | accountant, hr_manager, principal, tenant_admin |  |
| POST | `/v1/hr/tax-declarations/:id/approve` | accountant, hr_manager, principal, tenant_admin |  |
| POST | `/v1/hr/tax-declarations/:id/reject` | accountant, hr_manager, principal, tenant_admin |  |
| POST | `/v1/hr/tax-declarations/:id/verify` | accountant, hr_manager, principal, tenant_admin |  |
| GET | `/v1/hr/tax-declarations/items/:id/proof` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| POST | `/v1/hr/tax-declarations/items/:id/proof` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| GET | `/v1/hr/tax-declarations/me` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| PUT | `/v1/hr/tax-declarations/me` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| GET | `/v1/hr/tax-declarations/me/all` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| POST | `/v1/hr/tax-declarations/me/submit` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| POST | `/v1/hr/tax-declarations/me/submit-proofs` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| GET | `/v1/hr/training-records` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| POST | `/v1/hr/training-records` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| DELETE | `/v1/hr/training-records/:id` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| GET | `/v1/hr/training-records/:id/certificate` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| POST | `/v1/hr/training-records/:id/certificate` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| POST | `/v1/hr/training-records/:id/verify` | hr_manager, principal, tenant_admin |  |
| GET | `/v1/hr/training-summary` | hr_manager, principal, tenant_admin |  |
| GET | `/v1/hr/transfers` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| POST | `/v1/hr/transfers` | hr_manager, principal, tenant_admin |  |
| POST | `/v1/hr/transfers/:id/cancel` | hr_manager, principal, tenant_admin |  |
| POST | `/v1/hr/transfers/apply-due` | hr_manager, principal, tenant_admin |  |
| GET | `/v1/hr/transfers/options` | hr_manager, principal, tenant_admin |  |
| GET | `/v1/hr/workload` | hod, hr_manager, principal, tenant_admin |  |
| GET | `/v1/impact/frameworks` | hod, placement_officer, principal, quality_officer, research_coordinator, teacher, tenant_admin |  |
| POST | `/v1/impact/frameworks` | principal, quality_officer, research_coordinator, tenant_admin |  |
| PUT | `/v1/impact/frameworks/:id` | principal, quality_officer, research_coordinator, tenant_admin |  |
| GET | `/v1/impact/frameworks/:id/dashboard` | hod, placement_officer, principal, quality_officer, research_coordinator, teacher, tenant_admin |  |
| GET | `/v1/impact/records` | hod, placement_officer, principal, quality_officer, research_coordinator, teacher, tenant_admin |  |
| POST | `/v1/impact/records` | hod, placement_officer, principal, quality_officer, research_coordinator, teacher, tenant_admin |  |
| GET | `/v1/institution/capabilities` | any signed-in user |  |
| GET | `/v1/integrity/homework/:id` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/integrity/homework/:id/check` | hod, principal, teacher, tenant_admin |  |
| PUT | `/v1/integrity/matches/:id` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/inventory/batches` | accountant, principal, store_keeper, tenant_admin |  |
| GET | `/v1/inventory/books/month` | accountant, principal, tenant_admin |  |
| POST | `/v1/inventory/books/month` | accountant, principal, tenant_admin |  |
| GET | `/v1/inventory/budget/:departmentId` | accountant, canteen_manager, hod, hostel_warden, librarian, principal, store_keeper, teacher, tenant_admin, transport_manager |  |
| GET | `/v1/inventory/categories` | accountant, canteen_manager, hod, hostel_warden, librarian, principal, store_keeper, teacher, tenant_admin, transport_manager |  |
| PUT | `/v1/inventory/categories/:id/vendors` | principal, store_keeper, tenant_admin |  |
| GET | `/v1/inventory/consumption` | accountant, principal, store_keeper, tenant_admin |  |
| GET | `/v1/inventory/debit-notes` | accountant, principal, store_keeper, tenant_admin |  |
| GET | `/v1/inventory/invoices` | accountant, principal, store_keeper, tenant_admin |  |
| POST | `/v1/inventory/invoices/:id/approve` | principal, tenant_admin |  |
| POST | `/v1/inventory/invoices/:id/paid` | accountant, principal, tenant_admin |  |
| GET | `/v1/inventory/issue-slips` | accountant, principal, store_keeper, tenant_admin |  |
| POST | `/v1/inventory/issue-slips` | principal, store_keeper, tenant_admin |  |
| GET | `/v1/inventory/issue-slips/:id` | accountant, principal, store_keeper, tenant_admin |  |
| GET | `/v1/inventory/items` | accountant, canteen_manager, hod, hostel_warden, librarian, principal, store_keeper, teacher, tenant_admin, transport_manager |  |
| POST | `/v1/inventory/items` | principal, store_keeper, tenant_admin |  |
| PATCH | `/v1/inventory/items/:id` | principal, store_keeper, tenant_admin |  |
| GET | `/v1/inventory/purchase-orders` | accountant, principal, store_keeper, tenant_admin |  |
| POST | `/v1/inventory/purchase-orders` | principal, store_keeper, tenant_admin |  |
| GET | `/v1/inventory/purchase-orders/:id` | accountant, principal, store_keeper, tenant_admin |  |
| POST | `/v1/inventory/purchase-orders/:id/amend` | principal, store_keeper, tenant_admin |  |
| POST | `/v1/inventory/purchase-orders/:id/cancel` | principal, store_keeper, tenant_admin |  |
| PUT | `/v1/inventory/purchase-orders/:id/committee` | principal, store_keeper, tenant_admin |  |
| POST | `/v1/inventory/purchase-orders/:id/decision` | principal, tenant_admin |  |
| POST | `/v1/inventory/purchase-orders/:id/invoices` | accountant, principal, store_keeper, tenant_admin |  |
| POST | `/v1/inventory/purchase-orders/:id/receipts` | principal, store_keeper, tenant_admin |  |
| GET | `/v1/inventory/rate-contracts/current` | principal, store_keeper, tenant_admin |  |
| GET | `/v1/inventory/reorder` | principal, store_keeper, tenant_admin |  |
| POST | `/v1/inventory/reorder/indent` | principal, store_keeper, tenant_admin |  |
| GET | `/v1/inventory/reports/ageing` | accountant, principal, store_keeper, tenant_admin |  |
| GET | `/v1/inventory/reports/dead-stock` | accountant, principal, store_keeper, tenant_admin |  |
| GET | `/v1/inventory/reports/ledger` | accountant, principal, store_keeper, tenant_admin |  |
| GET | `/v1/inventory/reports/msme-dues` | accountant, principal, store_keeper, tenant_admin |  |
| GET | `/v1/inventory/reports/purchase-register` | accountant, principal, store_keeper, tenant_admin |  |
| GET | `/v1/inventory/reports/stock-summary` | accountant, principal, store_keeper, tenant_admin |  |
| GET | `/v1/inventory/requisitions` | accountant, canteen_manager, hod, hostel_warden, librarian, principal, store_keeper, teacher, tenant_admin, transport_manager |  |
| POST | `/v1/inventory/requisitions` | accountant, canteen_manager, hod, hostel_warden, librarian, principal, store_keeper, teacher, tenant_admin, transport_manager |  |
| GET | `/v1/inventory/requisitions/:id` | accountant, canteen_manager, hod, hostel_warden, librarian, principal, store_keeper, teacher, tenant_admin, transport_manager |  |
| POST | `/v1/inventory/requisitions/:id/decision` | hod, principal, tenant_admin |  |
| GET | `/v1/inventory/returns` | principal, store_keeper, tenant_admin |  |
| POST | `/v1/inventory/returns` | principal, store_keeper, tenant_admin |  |
| GET | `/v1/inventory/rfqs` | principal, store_keeper, tenant_admin |  |
| POST | `/v1/inventory/rfqs` | principal, store_keeper, tenant_admin |  |
| GET | `/v1/inventory/rfqs/:id` | principal, store_keeper, tenant_admin |  |
| POST | `/v1/inventory/rfqs/:id/award` | principal, tenant_admin |  |
| POST | `/v1/inventory/rfqs/:id/quotes` | principal, store_keeper, tenant_admin |  |
| GET | `/v1/inventory/stock` | principal, store_keeper, tenant_admin |  |
| POST | `/v1/inventory/stock/in` | principal, store_keeper, tenant_admin |  |
| POST | `/v1/inventory/stock/issue` | principal, store_keeper, tenant_admin |  |
| GET | `/v1/inventory/stock/moves` | principal, store_keeper, tenant_admin |  |
| POST | `/v1/inventory/stock/out` | principal, store_keeper, tenant_admin |  |
| GET | `/v1/inventory/stock/transfers` | principal, store_keeper, tenant_admin |  |
| POST | `/v1/inventory/stock/transfers` | principal, store_keeper, tenant_admin |  |
| GET | `/v1/inventory/stores` | accountant, canteen_manager, hod, hostel_warden, librarian, principal, store_keeper, teacher, tenant_admin, transport_manager |  |
| POST | `/v1/inventory/stores` | principal, store_keeper, tenant_admin |  |
| GET | `/v1/inventory/vendors` | principal, store_keeper, tenant_admin |  |
| POST | `/v1/inventory/vendors` | principal, store_keeper, tenant_admin |  |
| GET | `/v1/inventory/vendors/:id` | accountant, principal, store_keeper, tenant_admin |  |
| POST | `/v1/inventory/vendors/:id/blacklist` | principal, tenant_admin |  |
| POST | `/v1/inventory/vendors/:id/ratings` | principal, store_keeper, tenant_admin |  |
| GET | `/v1/inventory/verifications` | principal, store_keeper, tenant_admin |  |
| POST | `/v1/inventory/verifications` | principal, store_keeper, tenant_admin |  |
| GET | `/v1/inventory/verifications/:id` | principal, store_keeper, tenant_admin |  |
| POST | `/v1/inventory/verifications/:id/close` | principal, store_keeper, tenant_admin |  |
| PUT | `/v1/inventory/verifications/:id/counts` | principal, store_keeper, tenant_admin |  |
| GET | `/v1/inventory/write-offs` | accountant, principal, store_keeper, tenant_admin |  |
| POST | `/v1/inventory/write-offs` | principal, store_keeper, tenant_admin |  |
| POST | `/v1/inventory/write-offs/:id/decision` | principal, tenant_admin |  |
| POST | `/v1/invigilation/duties/:id/swap` | exam_controller, examiner, hod, principal, teacher, tenant_admin |  |
| GET | `/v1/invigilation/mine` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/invigilation/swaps/:id/decide` | exam_controller, hod, principal, tenant_admin |  |
| GET | `/v1/lesson-plans` | any signed-in user |  |
| PUT | `/v1/lesson-plans` | any signed-in user |  |
| POST | `/v1/lesson-plans/:id/review` | any signed-in user |  |
| GET | `/v1/lesson-plans/current` | board token |  |
| POST | `/v1/lesson-plans/draft` | any signed-in user |  |
| GET | `/v1/lesson-plans/period` | any signed-in user |  |
| DELETE | `/v1/library/alerts/me` | any signed-in user |  |
| GET | `/v1/library/alerts/me` | any signed-in user |  |
| PUT | `/v1/library/alerts/me` | any signed-in user |  |
| GET | `/v1/library/books` | librarian, principal, tenant_admin |  |
| POST | `/v1/library/books` | librarian, principal, tenant_admin |  |
| GET | `/v1/library/books/:id/copies` | librarian, principal, tenant_admin |  |
| POST | `/v1/library/books/barcodes/assign` | librarian, principal, tenant_admin |  |
| GET | `/v1/library/books/labels.pdf` | librarian, principal, tenant_admin |  |
| GET | `/v1/library/call-number` | librarian, principal, tenant_admin |  |
| GET | `/v1/library/copies/labels.pdf` | librarian, principal, tenant_admin |  |
| GET | `/v1/library/copies/rfid.csv` | librarian, principal, tenant_admin |  |
| GET | `/v1/library/copy-catalogue` | librarian, principal, tenant_admin |  |
| POST | `/v1/library/copy-catalogue/import` | librarian, principal, tenant_admin |  |
| GET | `/v1/library/copy-catalogue/targets` | librarian, principal, tenant_admin |  |
| GET | `/v1/library/dashboard` | librarian, principal, tenant_admin |  |
| POST | `/v1/library/desk/issue` | librarian, principal, tenant_admin |  |
| GET | `/v1/library/desk/lookup` | librarian, principal, tenant_admin |  |
| POST | `/v1/library/desk/return` | librarian, principal, tenant_admin |  |
| POST | `/v1/library/dropbox` | librarian, principal, tenant_admin |  |
| GET | `/v1/library/eresources` | any signed-in user |  |
| POST | `/v1/library/eresources` | librarian, principal, tenant_admin |  |
| GET | `/v1/library/eresources/:id/access` | librarian, principal, tenant_admin |  |
| POST | `/v1/library/eresources/:id/open` | any signed-in user |  |
| POST | `/v1/library/eresources/:id/retire` | librarian, principal, tenant_admin |  |
| GET | `/v1/library/eresources/usage` | librarian, principal, tenant_admin |  |
| GET | `/v1/library/exits` | librarian, principal, tenant_admin |  |
| POST | `/v1/library/exits/staff/:separationId/clear` | librarian, principal, tenant_admin |  |
| GET | `/v1/library/fines` | librarian, principal, tenant_admin |  |
| POST | `/v1/library/gate/swipe` | librarian, principal, tenant_admin |  |
| GET | `/v1/library/isbn/:isbn` | librarian, principal, tenant_admin |  |
| GET | `/v1/library/loans` | librarian, principal, tenant_admin |  |
| POST | `/v1/library/loans` | librarian, principal, tenant_admin |  |
| POST | `/v1/library/loans/:id/damaged` | librarian, principal, tenant_admin |  |
| POST | `/v1/library/loans/:id/fine-paid` | librarian, principal, tenant_admin |  |
| POST | `/v1/library/loans/:id/lost` | librarian, principal, tenant_admin |  |
| POST | `/v1/library/loans/:id/renew` | any signed-in user |  |
| POST | `/v1/library/loans/:id/return` | librarian, principal, tenant_admin |  |
| GET | `/v1/library/marc/export` | librarian, principal, tenant_admin |  |
| POST | `/v1/library/marc/import` | librarian, principal, tenant_admin |  |
| POST | `/v1/library/marc/preview` | librarian, principal, tenant_admin |  |
| GET | `/v1/library/me` | any signed-in user |  |
| POST | `/v1/library/members/:id/fines-to-fees` | librarian, principal, tenant_admin |  |
| POST | `/v1/library/members/enrol` | librarian, principal, tenant_admin |  |
| GET | `/v1/library/naac` | librarian, principal, quality_officer, tenant_admin |  |
| GET | `/v1/library/new-arrivals` | any signed-in user |  |
| POST | `/v1/library/new-arrivals/notify` | librarian, principal, tenant_admin |  |
| GET | `/v1/library/no-dues/:studentId` | any signed-in user |  |
| POST | `/v1/library/no-dues/:studentId/clear` | librarian, principal, tenant_admin |  |
| GET | `/v1/library/opac` | any signed-in user |  |
| GET | `/v1/library/overdue-notices` | librarian, principal, tenant_admin |  |
| POST | `/v1/library/overdue-notices/run` | librarian, principal, tenant_admin |  |
| GET | `/v1/library/purchase-orders/:id/pdf` | librarian, principal, tenant_admin |  |
| GET | `/v1/library/repository` | any signed-in user |  |
| POST | `/v1/library/repository/:id/open` | any signed-in user |  |
| GET | `/v1/library/reservations` | any signed-in user |  |
| POST | `/v1/library/reservations` | any signed-in user |  |
| POST | `/v1/library/reservations/:id/cancel` | any signed-in user |  |
| GET | `/v1/library/rules/preview` | librarian, principal, tenant_admin |  |
| GET | `/v1/library/scan/:code` | librarian, principal, tenant_admin |  |
| POST | `/v1/library/self-checkout` | student |  |
| POST | `/v1/library/sip2` | PUBLIC |  |
| GET | `/v1/library/stock-checks` | librarian, principal, tenant_admin |  |
| POST | `/v1/library/stock-checks` | librarian, principal, tenant_admin |  |
| POST | `/v1/library/stock-checks/:id/close` | librarian, principal, tenant_admin |  |
| POST | `/v1/library/stock-checks/:id/scan` | librarian, principal, tenant_admin |  |
| GET | `/v1/library/students` | librarian, principal, tenant_admin |  |
| GET | `/v1/library/students/:id` | any signed-in user |  |
| POST | `/v1/library/suggestions` | guardian, hod, librarian, principal, student, teacher, tenant_admin |  |
| GET | `/v1/library/suggestions/mine` | any signed-in user |  |
| POST | `/v1/library/topic-links` | hod, librarian, principal, teacher, tenant_admin |  |
| DELETE | `/v1/library/topic-links/:id` | hod, librarian, principal, teacher, tenant_admin |  |
| GET | `/v1/library/topics` | hod, librarian, principal, teacher, tenant_admin |  |
| GET | `/v1/library/topics/:topicId/resources` | any signed-in user | OWNERSHIP? reviewed |
| GET | `/v1/library/weeding` | librarian, principal, tenant_admin |  |
| GET | `/v1/lms/courses` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/lms/courses` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/lms/courses/:id` | any signed-in user |  |
| PATCH | `/v1/lms/courses/:id` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/lms/courses/:id/analytics` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/lms/courses/:id/announcements` | hod, principal, teacher, tenant_admin |  |
| PUT | `/v1/lms/courses/:id/categories` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/lms/courses/:id/clone` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/lms/courses/:id/forum` | any signed-in user |  |
| POST | `/v1/lms/courses/:id/forum` | any signed-in user |  |
| GET | `/v1/lms/courses/:id/gradebook` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/lms/courses/:id/gradebook.csv` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/lms/courses/:id/modules` | hod, principal, teacher, tenant_admin |  |
| PUT | `/v1/lms/courses/:id/overrides` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/lms/forum/:threadId` | any signed-in user |  |
| POST | `/v1/lms/forum/:threadId/moderate` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/lms/forum/:threadId/posts` | any signed-in user |  |
| POST | `/v1/lms/forum/posts/:postId/hide` | hod, principal, teacher, tenant_admin |  |
| DELETE | `/v1/lms/items/:id` | hod, principal, teacher, tenant_admin |  |
| PATCH | `/v1/lms/items/:id/access` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/lms/items/:id/assign-slow-learners` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/lms/items/:id/progress` | student |  |
| DELETE | `/v1/lms/modules/:id` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/lms/modules/:id/items` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/lms/my` | guardian, student |  |
| GET | `/v1/lms/my-calendar` | guardian, student |  |
| GET | `/v1/lms/my-quizzes` | student |  |
| PUT | `/v1/lms/quiz-attempts/:attemptId/answers` | student | OWNERSHIP? reviewed |
| PUT | `/v1/lms/quiz-attempts/:attemptId/mark` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/lms/quiz-attempts/:attemptId/submit` | student |  |
| DELETE | `/v1/lms/quiz-questions/:questionId` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/lms/quizzes` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/lms/quizzes` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/lms/quizzes/:id` | hod, principal, teacher, tenant_admin |  |
| PATCH | `/v1/lms/quizzes/:id` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/lms/quizzes/:id/analysis` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/lms/quizzes/:id/attempts` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/lms/quizzes/:id/close` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/lms/quizzes/:id/publish` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/lms/quizzes/:id/questions` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/lms/quizzes/:id/questions/from-bank` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/lms/quizzes/:id/start` | student |  |
| GET | `/v1/lms/reports/assignments` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/lms/students/:studentId/recommendations` | any signed-in user |  |
| GET | `/v1/lti/jwks/:tenantId` | PUBLIC |  |
| GET | `/v1/lti/platform/:tenantId/auth` | PUBLIC |  |
| POST | `/v1/lti/platform/:tenantId/auth` | PUBLIC |  |
| GET | `/v1/lti/platforms` | principal, tenant_admin |  |
| POST | `/v1/lti/platforms` | principal, tenant_admin |  |
| DELETE | `/v1/lti/platforms/:id` | principal, tenant_admin |  |
| POST | `/v1/lti/provider/:tenantId/exchange` | PUBLIC |  |
| POST | `/v1/lti/provider/:tenantId/launch` | PUBLIC |  |
| GET | `/v1/lti/provider/:tenantId/login` | PUBLIC |  |
| POST | `/v1/lti/provider/:tenantId/login` | PUBLIC |  |
| GET | `/v1/lti/tools` | any signed-in user |  |
| POST | `/v1/lti/tools` | principal, tenant_admin |  |
| DELETE | `/v1/lti/tools/:id` | principal, tenant_admin |  |
| POST | `/v1/lti/tools/:id/launch` | any signed-in user |  |
| POST | `/v1/malpractice/:id/decide` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/marks-unlock-requests` | exam_controller, hod, principal, teacher, tenant_admin |  |
| POST | `/v1/marks-unlock-requests/:id/cancel` | exam_controller, hod, principal, teacher, tenant_admin |  |
| POST | `/v1/marks-unlock-requests/:id/decide` | exam_controller, hod, principal, tenant_admin |  |
| GET | `/v1/marks/students/:id` | any signed-in user |  |
| GET | `/v1/me` | any signed-in user |  |
| PATCH | `/v1/me` | any signed-in user |  |
| GET | `/v1/me/devices` | any signed-in user |  |
| DELETE | `/v1/me/devices/:id` | any signed-in user |  |
| GET | `/v1/me/devices/status` | any signed-in user |  |
| POST | `/v1/me/devices/trust` | any signed-in user |  |
| DELETE | `/v1/me/mfa` | any signed-in user |  |
| GET | `/v1/me/mfa` | any signed-in user |  |
| POST | `/v1/me/mfa/backup-codes` | any signed-in user |  |
| POST | `/v1/me/mfa/confirm` | any signed-in user |  |
| POST | `/v1/me/mfa/enrol` | any signed-in user |  |
| POST | `/v1/me/password` | any signed-in user |  |
| DELETE | `/v1/me/photo` | any signed-in user |  |
| POST | `/v1/me/photo` | any signed-in user |  |
| GET | `/v1/me/sessions` | any signed-in user |  |
| DELETE | `/v1/me/sessions/:id` | any signed-in user |  |
| POST | `/v1/me/sessions/revoke-others` | any signed-in user |  |
| GET | `/v1/mentoring/assignments` | counsellor, hod, principal, teacher, tenant_admin |  |
| POST | `/v1/mentoring/assignments` | hod, principal, tenant_admin |  |
| POST | `/v1/mentoring/assignments/:id/end` | hod, principal, tenant_admin |  |
| GET | `/v1/mentoring/assignments/:id/messages` | hod, principal, student, teacher |  |
| POST | `/v1/mentoring/assignments/:id/messages` | hod, principal, student, teacher |  |
| POST | `/v1/mentoring/assignments/bulk` | hod, principal, tenant_admin |  |
| GET | `/v1/mentoring/channels` | hod, principal, teacher |  |
| GET | `/v1/mentoring/family/:studentId` | guardian, student |  |
| GET | `/v1/mentoring/learner-rules` | counsellor, hod, principal, teacher, tenant_admin |  |
| PUT | `/v1/mentoring/learner-rules` | principal, tenant_admin |  |
| GET | `/v1/mentoring/learners` | counsellor, hod, principal, teacher, tenant_admin |  |
| POST | `/v1/mentoring/learners/plans` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/mentoring/mentors` | hod, principal, tenant_admin |  |
| GET | `/v1/mentoring/my-mentor` | student |  |
| GET | `/v1/mentoring/my-support` | student |  |
| GET | `/v1/mentoring/plans` | counsellor, hod, principal, teacher, tenant_admin |  |
| POST | `/v1/mentoring/plans` | hod, principal, teacher |  |
| PUT | `/v1/mentoring/plans/:id` | hod, principal, teacher |  |
| POST | `/v1/mentoring/plans/:id/close` | hod, principal, teacher |  |
| GET | `/v1/mentoring/plans/:id/progress` | counsellor, hod, principal, teacher, tenant_admin |  |
| POST | `/v1/mentoring/plans/:id/reassess` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/mentoring/plans/:id/remeasure` | hod, principal, teacher |  |
| POST | `/v1/mentoring/plans/:id/remedial` | hod, principal, teacher |  |
| POST | `/v1/mentoring/plans/:id/support` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/mentoring/reports/mentors` | counsellor, hod, principal, tenant_admin |  |
| GET | `/v1/mentoring/reports/outcomes` | counsellor, hod, principal, tenant_admin |  |
| GET | `/v1/mentoring/risk` | counsellor, hod, principal, teacher, tenant_admin |  |
| GET | `/v1/mentoring/sections/:id/insights` | counsellor, hod, principal, teacher, tenant_admin |  |
| GET | `/v1/mentoring/sessions` | counsellor, hod, principal, teacher, tenant_admin |  |
| POST | `/v1/mentoring/sessions` | hod, principal, teacher |  |
| POST | `/v1/mentoring/support/:id/done` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/module-settings/:module` | accountant, admissions_officer, canteen_manager, hostel_warden, librarian, principal, store_keeper, tenant_admin, transport_manager |  |
| PUT | `/v1/module-settings/:module` | accountant, admissions_officer, canteen_manager, hostel_warden, librarian, principal, store_keeper, tenant_admin, transport_manager |  |
| GET | `/v1/nad/batches` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/nad/batches` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/nad/batches/:id/file` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/nad/batches/:id/upload` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/notifications` | any signed-in user |  |
| POST | `/v1/notifications/:id/read` | any signed-in user |  |
| POST | `/v1/notifications/read-all` | any signed-in user |  |
| PUT | `/v1/obe/actions/:id` | hod, principal, quality_officer, tenant_admin |  |
| GET | `/v1/obe/approvals` | hod, hod, principal, principal, quality_officer, teacher, tenant_admin |  |
| GET | `/v1/obe/assessments/:id/cos` | hod, principal, quality_officer, teacher, tenant_admin |  |
| PUT | `/v1/obe/assessments/:id/cos` | hod, principal, quality_officer, teacher, tenant_admin |  |
| PUT | `/v1/obe/assessments/:id/question-marks` | exam_controller, hod, principal, quality_officer, teacher, tenant_admin |  |
| GET | `/v1/obe/assessments/:id/question-marks.xlsx` | exam_controller, hod, principal, quality_officer, teacher, tenant_admin |  |
| POST | `/v1/obe/assessments/:id/question-marks.xlsx` | exam_controller, hod, principal, quality_officer, teacher, tenant_admin |  |
| GET | `/v1/obe/assessments/:id/questions` | exam_controller, hod, principal, quality_officer, teacher, tenant_admin |  |
| PUT | `/v1/obe/assessments/:id/questions` | exam_controller, hod, principal, quality_officer, teacher, tenant_admin |  |
| POST | `/v1/obe/assessments/:id/questions/copy` | exam_controller, hod, principal, quality_officer, teacher, tenant_admin |  |
| GET | `/v1/obe/bloom` | hod, hod, principal, principal, quality_officer, teacher, tenant_admin |  |
| POST | `/v1/obe/check-co` | hod, principal, quality_officer, teacher, tenant_admin |  |
| GET | `/v1/obe/classroom-activities` | hod, principal, quality_officer, teacher, tenant_admin |  |
| POST | `/v1/obe/co-sets/:id/activate` | hod, principal, quality_officer, teacher, tenant_admin |  |
| GET | `/v1/obe/co-sets/:id/matrix` | hod, principal, quality_officer, teacher, tenant_admin |  |
| PUT | `/v1/obe/co-sets/:id/matrix` | hod, principal, quality_officer, teacher, tenant_admin |  |
| POST | `/v1/obe/co-sets/:id/outcomes` | hod, principal, quality_officer, teacher, tenant_admin |  |
| POST | `/v1/obe/co-sets/:id/review` | hod, hod, principal, principal, quality_officer, teacher, tenant_admin |  |
| GET | `/v1/obe/co-sets/:id/reviews` | hod, hod, principal, principal, quality_officer, teacher, tenant_admin |  |
| POST | `/v1/obe/co-sets/:id/submit` | hod, principal, quality_officer, teacher, tenant_admin |  |
| DELETE | `/v1/obe/course-outcomes/:id` | hod, principal, quality_officer, teacher, tenant_admin |  |
| PUT | `/v1/obe/course-outcomes/:id` | hod, principal, quality_officer, teacher, tenant_admin |  |
| GET | `/v1/obe/dashboard` | hod, hod, principal, principal, quality_officer, teacher, tenant_admin |  |
| POST | `/v1/obe/exit-surveys` | hod, principal, quality_officer, teacher, tenant_admin |  |
| POST | `/v1/obe/exit-surveys/:id/remind` | hod, principal, quality_officer, teacher, tenant_admin |  |
| GET | `/v1/obe/me` | hod, hod, principal, principal, quality_officer, teacher, tenant_admin |  |
| DELETE | `/v1/obe/outcomes/:id` | principal, quality_officer, tenant_admin |  |
| PUT | `/v1/obe/outcomes/:id` | principal, quality_officer, tenant_admin |  |
| GET | `/v1/obe/policies` | hod, hod, principal, principal, quality_officer, teacher, tenant_admin |  |
| POST | `/v1/obe/policies` | hod, principal, quality_officer, tenant_admin |  |
| PUT | `/v1/obe/polls/:id/cos` | hod, principal, quality_officer, teacher, tenant_admin |  |
| GET | `/v1/obe/presets` | hod, hod, principal, principal, quality_officer, teacher, tenant_admin |  |
| GET | `/v1/obe/programs/:programId/actions` | hod, principal, quality_officer, tenant_admin |  |
| POST | `/v1/obe/programs/:programId/actions` | hod, principal, quality_officer, tenant_admin |  |
| POST | `/v1/obe/programs/:programId/actions/from-gaps` | hod, principal, quality_officer, tenant_admin |  |
| GET | `/v1/obe/programs/:programId/articulation` | hod, hod, principal, principal, quality_officer, teacher, tenant_admin |  |
| GET | `/v1/obe/programs/:programId/attainment` | hod, principal, quality_officer, tenant_admin |  |
| GET | `/v1/obe/programs/:programId/attainment-report.:format` | hod, principal, quality_officer, tenant_admin |  |
| POST | `/v1/obe/programs/:programId/attainment/compute` | hod, principal, quality_officer, tenant_admin |  |
| GET | `/v1/obe/programs/:programId/attainment/students` | hod, principal, quality_officer, teacher, tenant_admin |  |
| GET | `/v1/obe/programs/:programId/attainment/tree` | hod, principal, quality_officer, tenant_admin |  |
| GET | `/v1/obe/programs/:programId/attainment/trend` | hod, principal, quality_officer, tenant_admin |  |
| GET | `/v1/obe/programs/:programId/batch-report.:format` | hod, principal, quality_officer, tenant_admin |  |
| GET | `/v1/obe/programs/:programId/batches` | hod, principal, quality_officer, tenant_admin |  |
| POST | `/v1/obe/programs/:programId/batches/compute` | hod, principal, quality_officer, tenant_admin |  |
| GET | `/v1/obe/programs/:programId/config` | hod, principal, quality_officer, teacher, tenant_admin |  |
| PUT | `/v1/obe/programs/:programId/config` | principal, quality_officer, tenant_admin |  |
| GET | `/v1/obe/programs/:programId/evidence` | hod, principal, quality_officer, tenant_admin |  |
| POST | `/v1/obe/programs/:programId/evidence` | hod, principal, quality_officer, tenant_admin |  |
| GET | `/v1/obe/programs/:programId/exit-surveys` | hod, principal, quality_officer, teacher, tenant_admin |  |
| GET | `/v1/obe/programs/:programId/framework` | hod, hod, principal, principal, quality_officer, teacher, tenant_admin |  |
| PUT | `/v1/obe/programs/:programId/framework` | principal, quality_officer, tenant_admin |  |
| GET | `/v1/obe/programs/:programId/naac-2-6.:format` | hod, principal, quality_officer, tenant_admin |  |
| GET | `/v1/obe/programs/:programId/outcomes` | hod, principal, quality_officer, teacher, tenant_admin |  |
| POST | `/v1/obe/programs/:programId/outcomes` | principal, quality_officer, tenant_admin |  |
| GET | `/v1/obe/programs/:programId/peo-mission` | hod, principal, quality_officer, teacher, tenant_admin |  |
| PUT | `/v1/obe/programs/:programId/peo-mission` | principal, quality_officer, tenant_admin |  |
| GET | `/v1/obe/programs/:programId/peo-po` | hod, hod, principal, principal, quality_officer, teacher, tenant_admin |  |
| PUT | `/v1/obe/programs/:programId/peo-po` | principal, quality_officer, tenant_admin |  |
| POST | `/v1/obe/programs/:programId/presets` | principal, quality_officer, tenant_admin |  |
| GET | `/v1/obe/programs/:programId/readiness` | hod, principal, quality_officer, tenant_admin |  |
| GET | `/v1/obe/programs/:programId/report.csv` | hod, principal, quality_officer, tenant_admin |  |
| GET | `/v1/obe/programs/:programId/report.pdf` | hod, principal, quality_officer, tenant_admin |  |
| GET | `/v1/obe/programs/:programId/sar.:format` | hod, principal, quality_officer, tenant_admin |  |
| GET | `/v1/obe/programs/:programId/surveys` | hod, principal, quality_officer, teacher, tenant_admin |  |
| GET | `/v1/obe/programs/:programId/targets` | hod, principal, quality_officer, tenant_admin |  |
| PUT | `/v1/obe/programs/:programId/targets` | hod, principal, quality_officer, tenant_admin |  |
| GET | `/v1/obe/programs/:programId/targets.xlsx` | hod, principal, quality_officer, tenant_admin |  |
| POST | `/v1/obe/programs/:programId/targets.xlsx` | hod, principal, quality_officer, tenant_admin |  |
| POST | `/v1/obe/programs/:programId/targets/copy` | hod, principal, quality_officer, tenant_admin |  |
| GET | `/v1/obe/programs/:programId/versions` | hod, principal, quality_officer, teacher, tenant_admin |  |
| POST | `/v1/obe/programs/:programId/versions` | principal, quality_officer, tenant_admin |  |
| GET | `/v1/obe/structure` | hod, hod, principal, principal, quality_officer, teacher, tenant_admin |  |
| GET | `/v1/obe/students/:id/outcomes` | counsellor, guardian, hod, mentor, principal, quality_officer, student, teacher, tenant_admin |  |
| GET | `/v1/obe/students/me/outcomes` | student |  |
| GET | `/v1/obe/subjects/:subjectId/assessments` | exam_controller, hod, principal, quality_officer, teacher, tenant_admin |  |
| GET | `/v1/obe/subjects/:subjectId/attainment` | hod, principal, quality_officer, teacher, tenant_admin |  |
| GET | `/v1/obe/subjects/:subjectId/attainment-report.:format` | hod, principal, quality_officer, teacher, tenant_admin |  |
| GET | `/v1/obe/subjects/:subjectId/co-sets` | hod, principal, quality_officer, teacher, tenant_admin |  |
| POST | `/v1/obe/subjects/:subjectId/co-sets` | hod, principal, quality_officer, teacher, tenant_admin |  |
| GET | `/v1/obe/subjects/:subjectId/course-file.:format` | hod, principal, quality_officer, teacher, tenant_admin |  |
| GET | `/v1/obe/subjects/:subjectId/units` | hod, hod, principal, principal, quality_officer, teacher, tenant_admin |  |
| PUT | `/v1/obe/subjects/:subjectId/units` | hod, hod, principal, principal, quality_officer, teacher, tenant_admin |  |
| POST | `/v1/obe/suggest-co` | hod, hod, principal, principal, quality_officer, teacher, tenant_admin |  |
| POST | `/v1/obe/surveys` | hod, principal, quality_officer, teacher, tenant_admin |  |
| POST | `/v1/obe/surveys/:id/ratings` | hod, principal, quality_officer, teacher, tenant_admin |  |
| GET | `/v1/odata` | PUBLIC |  |
| GET | `/v1/odata/:set` | PUBLIC |  |
| GET | `/v1/odata/$metadata` | PUBLIC |  |
| GET | `/v1/ops-records/:kind/:id` | accountant, admissions_officer, canteen_manager, hostel_warden, librarian, principal, store_keeper, tenant_admin, transport_manager |  |
| GET | `/v1/ops-reports` | accountant, admissions_officer, canteen_manager, hostel_warden, librarian, principal, store_keeper, tenant_admin, transport_manager |  |
| GET | `/v1/ops-reports/:id` | accountant, admissions_officer, canteen_manager, hostel_warden, librarian, principal, store_keeper, tenant_admin, transport_manager |  |
| POST | `/v1/pairing/claim` | hod, principal, teacher |  |
| POST | `/v1/pairing/offline-codes` | device token |  |
| POST | `/v1/pairing/offline-verify` | hod, principal, teacher |  |
| GET | `/v1/pairing/pending` | device token |  |
| GET | `/v1/pairing/signing-key` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/pairing/signing-key/rotate` | tenant_admin |  |
| POST | `/v1/pairing/tap-signin` | device token |  |
| GET | `/v1/parent-visibility` | principal, tenant_admin |  |
| PUT | `/v1/parent-visibility/:section` | principal, tenant_admin |  |
| GET | `/v1/parent/children` | guardian |  |
| GET | `/v1/parent/children/:id/attendance` | guardian, student |  |
| GET | `/v1/parent/children/:id/subjects` | guardian |  |
| GET | `/v1/parent/children/:id/summary` | guardian, student |  |
| GET | `/v1/parent/children/:id/timetable` | guardian, student |  |
| GET | `/v1/parent/children/:studentId/activities` | guardian |  |
| GET | `/v1/parent/children/:studentId/bank-transfers` | guardian |  |
| POST | `/v1/parent/children/:studentId/bank-transfers` | guardian | BROAD reviewed |
| GET | `/v1/parent/children/:studentId/behaviour` | guardian |  |
| GET | `/v1/parent/children/:studentId/diary` | guardian |  |
| POST | `/v1/parent/children/:studentId/diary/:entryId/acknowledge` | guardian |  |
| GET | `/v1/parent/children/:studentId/early-years` | guardian |  |
| GET | `/v1/parent/children/:studentId/early-years/learning-story.pdf` | guardian |  |
| GET | `/v1/parent/children/:studentId/early-years/observations/:oid/photo` | guardian |  |
| GET | `/v1/parent/children/:studentId/health` | guardian |  |
| GET | `/v1/parent/visibility` | any signed-in user |  |
| GET | `/v1/passport/me` | guardian, student |  |
| GET | `/v1/passport/students/:studentId` | any signed-in user |  |
| GET | `/v1/passport/students/:studentId/pdf` | any signed-in user |  |
| POST | `/v1/passport/students/:studentId/revoke` | hod, principal, tenant_admin |  |
| POST | `/v1/passport/students/:studentId/verify` | hod, principal, tenant_admin |  |
| GET | `/v1/past-exam-questions` | hod, principal, principal, teacher, tenant_admin |  |
| POST | `/v1/past-exam-questions/import` | hod, principal, tenant_admin |  |
| GET | `/v1/payroll/24q.csv` | accountant, hr_manager, principal, tenant_admin |  |
| GET | `/v1/payroll/bank-file` | accountant, hr_manager, principal, tenant_admin |  |
| PUT | `/v1/payroll/bank-file` | principal, tenant_admin |  |
| GET | `/v1/payroll/components` | accountant, hr_manager, principal, tenant_admin |  |
| POST | `/v1/payroll/components` | accountant, hr_manager, principal, tenant_admin |  |
| PUT | `/v1/payroll/components/:id` | accountant, hr_manager, principal, tenant_admin |  |
| GET | `/v1/payroll/components/:id/rates` | accountant, hr_manager, principal, tenant_admin |  |
| POST | `/v1/payroll/components/:id/rates` | accountant, hr_manager, principal, tenant_admin |  |
| GET | `/v1/payroll/pay-matrix` | accountant, hr_manager, principal, tenant_admin |  |
| POST | `/v1/payroll/pay-matrix/increments` | principal, tenant_admin |  |
| POST | `/v1/payroll/pay-matrix/levels` | principal, tenant_admin |  |
| GET | `/v1/payroll/pay-matrix/staff` | accountant, hr_manager, principal, tenant_admin |  |
| PUT | `/v1/payroll/pay-matrix/staff/:userId` | principal, tenant_admin |  |
| GET | `/v1/payroll/pay-matrix/staff/:userId/moves` | accountant, hr_manager, principal, tenant_admin |  |
| GET | `/v1/payroll/payslips/:id` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| GET | `/v1/payroll/payslips/:id/pdf` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| GET | `/v1/payroll/payslips/me` | accountant, hod, hr_manager, librarian, principal, teacher, tenant_admin |  |
| GET | `/v1/payroll/runs` | accountant, hr_manager, principal, tenant_admin |  |
| POST | `/v1/payroll/runs` | accountant, hr_manager, principal, tenant_admin |  |
| GET | `/v1/payroll/runs/:id` | accountant, hr_manager, principal, tenant_admin |  |
| POST | `/v1/payroll/runs/:id/approve` | principal, tenant_admin |  |
| GET | `/v1/payroll/runs/:id/bank-file` | accountant, hr_manager, principal, tenant_admin |  |
| GET | `/v1/payroll/runs/:id/bank-transfer.csv` | accountant, hr_manager, principal, tenant_admin |  |
| GET | `/v1/payroll/runs/:id/ecr.txt` | accountant, hr_manager, principal, tenant_admin |  |
| POST | `/v1/payroll/runs/:id/lock` | principal, tenant_admin |  |
| POST | `/v1/payroll/runs/:id/publish` | accountant, hr_manager, principal, tenant_admin |  |
| POST | `/v1/payroll/runs/:id/recompute` | accountant, hr_manager, principal, tenant_admin |  |
| POST | `/v1/payroll/runs/:id/reopen` | principal, tenant_admin |  |
| POST | `/v1/payroll/runs/:id/reverse` | principal, tenant_admin |  |
| GET | `/v1/payroll/runs/:id/statutory.csv` | accountant, hr_manager, principal, tenant_admin |  |
| GET | `/v1/payroll/runs/:id/tally.xml` | accountant, hr_manager, principal, tenant_admin |  |
| POST | `/v1/payroll/runs/:id/verify` | accountant, hr_manager, principal, tenant_admin |  |
| GET | `/v1/payroll/settings` | accountant, hr_manager, principal, tenant_admin |  |
| PUT | `/v1/payroll/settings` | principal, tenant_admin |  |
| GET | `/v1/payroll/structures/:userId` | accountant, hr_manager, principal, tenant_admin |  |
| PUT | `/v1/payroll/structures/:userId` | accountant, hr_manager, principal, tenant_admin |  |
| GET | `/v1/placements/alumni` | any signed-in user |  |
| POST | `/v1/placements/alumni` | placement_officer, principal, tenant_admin |  |
| GET | `/v1/placements/alumni-events` | any signed-in user |  |
| POST | `/v1/placements/alumni-events` | placement_officer, principal, tenant_admin |  |
| POST | `/v1/placements/alumni-events/:id/rsvps` | placement_officer, principal, tenant_admin |  |
| PUT | `/v1/placements/alumni/:id` | placement_officer, principal, tenant_admin |  |
| GET | `/v1/placements/apprenticeships/:id/stipends` | hod, placement_officer, principal, tenant_admin |  |
| PUT | `/v1/placements/apprenticeships/:id/stipends` | placement_officer, principal, tenant_admin |  |
| GET | `/v1/placements/brochure` | hod, placement_officer, principal, quality_officer, tenant_admin |  |
| GET | `/v1/placements/companies` | hod, placement_officer, principal, tenant_admin |  |
| POST | `/v1/placements/companies` | placement_officer, principal, tenant_admin |  |
| GET | `/v1/placements/companies/:id` | hod, placement_officer, principal, tenant_admin |  |
| PUT | `/v1/placements/companies/:id` | placement_officer, principal, tenant_admin |  |
| POST | `/v1/placements/companies/:id/contacts` | placement_officer, principal, tenant_admin |  |
| DELETE | `/v1/placements/companies/:id/portal-key` | placement_officer, principal, tenant_admin |  |
| POST | `/v1/placements/companies/:id/portal-key` | placement_officer, principal, tenant_admin |  |
| POST | `/v1/placements/companies/:id/verify` | placement_officer, principal, tenant_admin |  |
| DELETE | `/v1/placements/contacts/:id` | placement_officer, principal, tenant_admin |  |
| PUT | `/v1/placements/contacts/:id` | placement_officer, principal, tenant_admin |  |
| DELETE | `/v1/placements/documents/:id` | student |  |
| GET | `/v1/placements/documents/:id/file` | any signed-in user |  |
| GET | `/v1/placements/drives` | hod, placement_officer, principal, tenant_admin |  |
| POST | `/v1/placements/drives` | placement_officer, principal, tenant_admin |  |
| GET | `/v1/placements/drives/:id` | hod, placement_officer, principal, tenant_admin |  |
| PUT | `/v1/placements/drives/:id` | placement_officer, principal, tenant_admin |  |
| GET | `/v1/placements/drives/:id/eligible` | hod, placement_officer, principal, tenant_admin |  |
| POST | `/v1/placements/drives/:id/offers` | placement_officer, principal, tenant_admin |  |
| GET | `/v1/placements/drives/:id/registrations` | hod, placement_officer, principal, tenant_admin |  |
| POST | `/v1/placements/drives/:id/registrations` | placement_officer, principal, tenant_admin |  |
| POST | `/v1/placements/drives/:id/rounds` | placement_officer, principal, tenant_admin |  |
| POST | `/v1/placements/drives/:id/rounds/:roundId/import` | placement_officer, principal, tenant_admin |  |
| PUT | `/v1/placements/drives/:id/rounds/:roundId/results` | placement_officer, principal, tenant_admin |  |
| POST | `/v1/placements/drives/:id/rounds/:roundId/slots/auto` | placement_officer, principal, tenant_admin |  |
| GET | `/v1/placements/drives/:id/shortlist` | hod, placement_officer, principal, tenant_admin |  |
| GET | `/v1/placements/drives/:id/slots` | hod, placement_officer, principal, tenant_admin |  |
| POST | `/v1/placements/drives/:id/status` | placement_officer, principal, tenant_admin |  |
| GET | `/v1/placements/internships` | hod, placement_officer, principal, teacher, tenant_admin |  |
| POST | `/v1/placements/internships` | placement_officer, principal, student, tenant_admin |  |
| GET | `/v1/placements/internships/:id/attendance` | hod, placement_officer, principal, student, teacher, tenant_admin |  |
| POST | `/v1/placements/internships/:id/attendance` | hod, placement_officer, principal, student, teacher, tenant_admin |  |
| GET | `/v1/placements/internships/:id/certificate` | hod, placement_officer, principal, student, teacher, tenant_admin |  |
| POST | `/v1/placements/internships/:id/certificate` | placement_officer, principal, tenant_admin |  |
| GET | `/v1/placements/internships/:id/diary` | any signed-in user |  |
| POST | `/v1/placements/internships/:id/diary` | student |  |
| POST | `/v1/placements/internships/:id/evaluation` | hod, placement_officer, principal, teacher, tenant_admin |  |
| GET | `/v1/placements/internships/:id/links` | hod, placement_officer, principal, student, teacher, tenant_admin |  |
| POST | `/v1/placements/internships/:id/links` | hod, placement_officer, principal, teacher, tenant_admin |  |
| DELETE | `/v1/placements/internships/:id/links/:linkId` | hod, placement_officer, principal, teacher, tenant_admin |  |
| PUT | `/v1/placements/internships/:id/mentor` | placement_officer, principal, tenant_admin |  |
| POST | `/v1/placements/internships/:id/status` | placement_officer, principal, tenant_admin |  |
| GET | `/v1/placements/jobs/open` | hod, placement_officer, principal, student, tenant_admin |  |
| GET | `/v1/placements/mentoring-requests` | hod, placement_officer, principal, student, tenant_admin |  |
| POST | `/v1/placements/mentoring-requests` | student |  |
| POST | `/v1/placements/mentoring-requests/:id/respond` | placement_officer, principal, tenant_admin |  |
| GET | `/v1/placements/offers` | hod, placement_officer, principal, tenant_admin |  |
| POST | `/v1/placements/offers/:id/joining` | placement_officer, principal, tenant_admin |  |
| GET | `/v1/placements/offers/:id/letter` | any signed-in user |  |
| POST | `/v1/placements/offers/:id/letter` | placement_officer, principal, tenant_admin |  |
| POST | `/v1/placements/offers/:id/record-response` | placement_officer, principal, tenant_admin |  |
| POST | `/v1/placements/offers/:id/respond` | student |  |
| POST | `/v1/placements/offers/:id/revoke` | placement_officer, principal, tenant_admin |  |
| POST | `/v1/placements/offers/:id/withdraw` | placement_officer, principal, tenant_admin |  |
| GET | `/v1/placements/optins` | hod, placement_officer, principal, tenant_admin |  |
| POST | `/v1/placements/referrals` | student |  |
| POST | `/v1/placements/registrations/:id/recheck` | placement_officer, principal, tenant_admin |  |
| GET | `/v1/placements/reports` | hod, placement_officer, principal, quality_officer, tenant_admin |  |
| GET | `/v1/placements/reports/:id` | hod, placement_officer, principal, quality_officer, tenant_admin |  |
| PUT | `/v1/placements/slots/:id` | placement_officer, principal, tenant_admin |  |
| GET | `/v1/placements/stats` | hod, placement_officer, principal, tenant_admin |  |
| GET | `/v1/placements/students/:studentId/dashboard` | any signed-in user |  |
| POST | `/v1/placements/students/:studentId/debar` | placement_officer, principal, tenant_admin |  |
| GET | `/v1/placements/students/:studentId/documents` | any signed-in user |  |
| POST | `/v1/placements/students/:studentId/documents` | placement_officer, principal, student, tenant_admin |  |
| POST | `/v1/placements/students/:studentId/drives/:driveId/registration` | student |  |
| POST | `/v1/placements/students/:studentId/drives/:driveId/withdraw` | student |  |
| POST | `/v1/placements/students/:studentId/lift-debar` | placement_officer, principal, tenant_admin |  |
| PUT | `/v1/placements/students/:studentId/optin` | placement_officer, principal, student, tenant_admin |  |
| GET | `/v1/placements/students/:studentId/overview` | any signed-in user |  |
| GET | `/v1/placements/success-stories` | placement_officer, principal, tenant_admin |  |
| POST | `/v1/placements/success-stories/:id/review` | placement_officer, principal, tenant_admin |  |
| DELETE | `/v1/placements/training-sessions/:id` | placement_officer, principal, tenant_admin |  |
| PUT | `/v1/placements/training-sessions/:id/attendance` | placement_officer, principal, tenant_admin |  |
| GET | `/v1/placements/trainings/:id` | hod, placement_officer, principal, tenant_admin |  |
| PUT | `/v1/placements/trainings/:id/scores` | placement_officer, principal, tenant_admin |  |
| POST | `/v1/placements/trainings/:id/sessions` | placement_officer, principal, tenant_admin |  |
| GET | `/v1/platform/content-licenses` | any signed-in user (+PlatformAdminGuard) |  |
| PUT | `/v1/platform/content-licenses` | any signed-in user (+PlatformAdminGuard) |  |
| DELETE | `/v1/platform/content-licenses/:id` | any signed-in user (+PlatformAdminGuard) |  |
| GET | `/v1/platform/library` | any signed-in user (+PlatformAdminGuard) |  |
| GET | `/v1/platform/library/courses/:id` | any signed-in user (+PlatformAdminGuard) | OWNERSHIP? reviewed |
| GET | `/v1/platform/library/search` | any signed-in user (+PlatformAdminGuard) |  |
| GET | `/v1/platform/me` | any signed-in user (+PlatformAdminGuard) |  |
| POST | `/v1/platform/playlists/import` | any signed-in user (+PlatformAdminGuard) | BROAD reviewed |
| POST | `/v1/platform/playlists/preview` | any signed-in user (+PlatformAdminGuard) |  |
| GET | `/v1/platform/topics/:id/videos` | any signed-in user (+PlatformAdminGuard) | OWNERSHIP? reviewed |
| POST | `/v1/platform/topics/:id/videos` | any signed-in user (+PlatformAdminGuard) |  |
| PUT | `/v1/platform/topics/:id/videos/order` | any signed-in user (+PlatformAdminGuard) | OWNERSHIP? reviewed |
| DELETE | `/v1/platform/videos/:id` | any signed-in user (+PlatformAdminGuard) |  |
| PATCH | `/v1/platform/videos/:id` | any signed-in user (+PlatformAdminGuard) |  |
| GET | `/v1/polls/:id` | board token |  |
| PUT | `/v1/polls/:id` | board token |  |
| POST | `/v1/polls/:id/answer` | student |  |
| POST | `/v1/polls/:id/cards` | board token |  |
| POST | `/v1/polls/:id/close` | board token |  |
| PUT | `/v1/polls/:id/cos` | board token |  |
| POST | `/v1/practicals/:id/cancel` | exam_controller, hod, principal, tenant_admin |  |
| POST | `/v1/practicals/:id/marks` | any signed-in user |  |
| GET | `/v1/practicals/mine` | any signed-in user |  |
| GET | `/v1/profiles/staff/:id` | any signed-in user |  |
| GET | `/v1/profiles/students/:id/attendance` | any signed-in user |  |
| GET | `/v1/projects/:id/comments` | hod, principal, research_coordinator, student, teacher, tenant_admin | OWNERSHIP? reviewed |
| POST | `/v1/projects/:id/comments` | hod, principal, research_coordinator, student, teacher, tenant_admin |  |
| POST | `/v1/projects/:id/files` | hod, principal, research_coordinator, student, teacher, tenant_admin |  |
| PUT | `/v1/projects/:id/hub` | hod, principal, research_coordinator, student, teacher, tenant_admin | OWNERSHIP? reviewed |
| POST | `/v1/projects/:id/join` | student |  |
| GET | `/v1/projects/:id/matches` | hod, principal, research_coordinator, student, teacher, tenant_admin | OWNERSHIP? reviewed |
| GET | `/v1/projects/:id/requests` | hod, principal, research_coordinator, student, teacher, tenant_admin | OWNERSHIP? reviewed |
| GET | `/v1/projects/:id/reviews` | hod, principal, research_coordinator, student, teacher, tenant_admin | OWNERSHIP? reviewed |
| POST | `/v1/projects/:id/reviews` | hod, principal, research_coordinator, student, teacher, tenant_admin |  |
| POST | `/v1/projects/:id/viva` | hod, principal, research_coordinator, student, teacher, tenant_admin |  |
| GET | `/v1/projects/:id/workspace` | hod, principal, research_coordinator, student, teacher, tenant_admin |  |
| GET | `/v1/projects/discover` | hod, principal, research_coordinator, student, teacher, tenant_admin |  |
| DELETE | `/v1/projects/files/:fileId` | hod, principal, research_coordinator, student, teacher, tenant_admin |  |
| GET | `/v1/projects/files/:fileId/download` | hod, principal, research_coordinator, student, teacher, tenant_admin | OWNERSHIP? reviewed |
| GET | `/v1/projects/mine` | hod, principal, research_coordinator, student, teacher, tenant_admin |  |
| POST | `/v1/projects/portfolio` | student |  |
| DELETE | `/v1/projects/portfolio/:itemId` | student |  |
| POST | `/v1/projects/portfolio/:itemId/publish` | student | BROAD reviewed |
| GET | `/v1/projects/portfolio/mine` | student |  |
| GET | `/v1/projects/portfolio/student/:studentId` | any signed-in user |  |
| POST | `/v1/projects/requests/:rid/decide` | hod, principal, research_coordinator, student, teacher, tenant_admin |  |
| GET | `/v1/projects/showcase` | any signed-in user |  |
| POST | `/v1/projects/viva/:vivaId/result` | hod, principal, research_coordinator, student, teacher, tenant_admin |  |
| GET | `/v1/ptm/events` | guardian, hod, principal, teacher, tenant_admin |  |
| POST | `/v1/ptm/events` | principal, tenant_admin |  |
| POST | `/v1/ptm/events/:id/close` | principal, tenant_admin |  |
| GET | `/v1/ptm/events/:id/my-schedule` | hod, principal, teacher |  |
| POST | `/v1/ptm/events/:id/remind` | hod, principal, principal, teacher, tenant_admin |  |
| GET | `/v1/ptm/events/:id/slots` | guardian, hod, principal, teacher, tenant_admin |  |
| POST | `/v1/ptm/events/:id/slots` | hod, principal, principal, teacher, tenant_admin |  |
| GET | `/v1/ptm/my-bookings` | guardian |  |
| POST | `/v1/ptm/slots/:id/book` | guardian |  |
| POST | `/v1/ptm/slots/:id/cancel` | guardian, hod, principal, teacher, tenant_admin |  |
| POST | `/v1/ptm/slots/:id/reschedule` | guardian |  |
| POST | `/v1/public/admissions/:slug/applicant-login` | PUBLIC |  |
| GET | `/v1/public/admissions/:slug/applications/:appId/allotments` | PUBLIC |  |
| POST | `/v1/public/admissions/:slug/applications/:appId/allotments/:id/respond` | PUBLIC |  |
| PUT | `/v1/public/admissions/:slug/applications/:appId/preferences` | PUBLIC |  |
| GET | `/v1/public/admissions/:slug/applications/:id` | PUBLIC |  |
| GET | `/v1/public/admissions/:slug/applications/:id/corrections` | PUBLIC |  |
| POST | `/v1/public/admissions/:slug/applications/:id/documents/:key` | PUBLIC |  |
| POST | `/v1/public/admissions/:slug/applications/:id/fee/checkout` | PUBLIC |  |
| POST | `/v1/public/admissions/:slug/applications/:id/fee/confirm` | PUBLIC |  |
| POST | `/v1/public/admissions/:slug/applications/:id/fee/refresh` | PUBLIC |  |
| GET | `/v1/public/admissions/:slug/applications/:id/hall-ticket` | PUBLIC |  |
| POST | `/v1/public/admissions/:slug/applications/:id/offer/accept` | PUBLIC |  |
| POST | `/v1/public/admissions/:slug/applications/:id/offer/decline` | PUBLIC |  |
| GET | `/v1/public/admissions/:slug/applications/:id/online-tests` | PUBLIC |  |
| PUT | `/v1/public/admissions/:slug/applications/:id/online-tests/:testId/answers` | PUBLIC |  |
| POST | `/v1/public/admissions/:slug/applications/:id/online-tests/:testId/start` | PUBLIC |  |
| POST | `/v1/public/admissions/:slug/applications/:id/online-tests/:testId/submit` | PUBLIC |  |
| POST | `/v1/public/admissions/:slug/applications/:id/resubmit` | PUBLIC |  |
| POST | `/v1/public/admissions/:slug/applications/:id/withdraw` | PUBLIC |  |
| GET | `/v1/public/admissions/:slug/cycles` | PUBLIC |  |
| POST | `/v1/public/admissions/:slug/cycles/:cycleId/applications` | PUBLIC |  |
| POST | `/v1/public/admissions/:slug/cycles/:cycleId/drafts` | PUBLIC |  |
| GET | `/v1/public/admissions/:slug/drafts/:id` | PUBLIC |  |
| PUT | `/v1/public/admissions/:slug/drafts/:id` | PUBLIC |  |
| POST | `/v1/public/admissions/:slug/enquiries` | PUBLIC |  |
| GET | `/v1/public/admissions/:slug/landing/:cycleId` | PUBLIC |  |
| POST | `/v1/public/admissions/:slug/status` | PUBLIC |  |
| GET | `/v1/public/bi-export/:id/:dataset` | PUBLIC |  |
| GET | `/v1/public/boards/:slug/:file` | PUBLIC |  |
| GET | `/v1/public/branding/:slug` | PUBLIC |  |
| GET | `/v1/public/branding/:slug/:kind` | PUBLIC |  |
| GET | `/v1/public/careers/:slug` | PUBLIC |  |
| GET | `/v1/public/careers/:slug/openings/:id` | PUBLIC |  |
| POST | `/v1/public/careers/:slug/openings/:id/apply` | PUBLIC |  |
| GET | `/v1/public/checkout/:slug/:paymentId` | PUBLIC |  |
| GET | `/v1/public/events/:slug` | PUBLIC |  |
| GET | `/v1/public/events/:slug/:id` | PUBLIC |  |
| GET | `/v1/public/examiner-invite/:slug/:token` | PUBLIC |  |
| POST | `/v1/public/examiner-invite/:slug/:token/otp` | PUBLIC |  |
| POST | `/v1/public/examiner-invite/:slug/:token/verify` | PUBLIC |  |
| GET | `/v1/public/leads/:slug/:connectorId` | PUBLIC |  |
| POST | `/v1/public/leads/:slug/:connectorId` | PUBLIC |  |
| GET | `/v1/public/pay/:slug/:token` | PUBLIC |  |
| POST | `/v1/public/pay/:slug/:token/checkout` | PUBLIC |  |
| POST | `/v1/public/pay/:slug/:token/payments/:paymentId/refresh` | PUBLIC |  |
| GET | `/v1/public/recruiters/:slug` | PUBLIC |  |
| POST | `/v1/public/recruiters/:slug/drives` | PUBLIC |  |
| GET | `/v1/public/recruiters/:slug/drives/:id/rounds` | PUBLIC |  |
| PUT | `/v1/public/recruiters/:slug/drives/:id/rounds/:roundId/results` | PUBLIC |  |
| GET | `/v1/public/recruiters/:slug/drives/:id/shortlist` | PUBLIC |  |
| POST | `/v1/public/recruiters/:slug/feedback` | PUBLIC |  |
| GET | `/v1/public/recruiters/:slug/me` | PUBLIC |  |
| POST | `/v1/public/recruiters/:slug/register` | PUBLIC |  |
| POST | `/v1/public/verification-requests/:slug` | PUBLIC |  |
| GET | `/v1/public/verify-academic/:slug/:code` | PUBLIC |  |
| GET | `/v1/public/verify-degree/:slug/:code` | PUBLIC |  |
| GET | `/v1/public/verify-hallticket/:slug/:code` | PUBLIC |  |
| GET | `/v1/public/verify-id/:slug/:code` | PUBLIC |  |
| GET | `/v1/public/verify-passport/:slug/:token` | PUBLIC |  |
| GET | `/v1/public/verify/:slug/:token` | PUBLIC |  |
| DELETE | `/v1/push/devices` | any signed-in user |  |
| POST | `/v1/push/devices` | any signed-in user |  |
| POST | `/v1/qp-appointments/:id/cancel` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/qp-appointments/:id/respond` | any signed-in user |  |
| GET | `/v1/qp-appointments/mine` | any signed-in user |  |
| GET | `/v1/quality-hub/records/:entity/:id` | accountant, grievance_officer, hod, hr_manager, icc_member, placement_officer, principal, quality_officer, research_coordinator, tenant_admin |  |
| GET | `/v1/quality-hub/reports` | accountant, grievance_officer, hod, hr_manager, icc_member, placement_officer, principal, quality_officer, research_coordinator, tenant_admin |  |
| GET | `/v1/quality-hub/reports/:id` | accountant, grievance_officer, hod, hr_manager, icc_member, placement_officer, principal, quality_officer, research_coordinator, tenant_admin |  |
| GET | `/v1/quality-hub/settings` | grievance_officer, hod, placement_officer, principal, quality_officer, research_coordinator, tenant_admin |  |
| GET | `/v1/quality-hub/settings/:module` | grievance_officer, hod, placement_officer, principal, quality_officer, research_coordinator, tenant_admin |  |
| PUT | `/v1/quality-hub/settings/:module` | principal, quality_officer, tenant_admin |  |
| POST | `/v1/quality/actions/:id/remeasure` | hod, principal, quality_officer, tenant_admin |  |
| PUT | `/v1/quality/actions/:id/root-cause` | hod, principal, quality_officer, tenant_admin |  |
| GET | `/v1/quality/cqi` | hod, principal, quality_officer, tenant_admin |  |
| DELETE | `/v1/quality/criteria/:id` | principal, quality_officer, tenant_admin |  |
| PUT | `/v1/quality/criteria/:id` | hod, principal, quality_officer, tenant_admin |  |
| GET | `/v1/quality/criteria/:id/evidence` | hod, principal, quality_officer, tenant_admin |  |
| POST | `/v1/quality/criteria/:id/evidence` | hod, principal, quality_officer, tenant_admin |  |
| PUT | `/v1/quality/eval-questions/:id/co` | exam_controller, hod, principal, quality_officer, teacher, tenant_admin |  |
| GET | `/v1/quality/evidence/:id/file` | hod, principal, quality_officer, tenant_admin |  |
| POST | `/v1/quality/evidence/:id/file` | hod, principal, quality_officer, tenant_admin |  |
| POST | `/v1/quality/exam-papers/:paperId/apply-outcome-map` | exam_controller, hod, principal, quality_officer, tenant_admin |  |
| GET | `/v1/quality/exam-papers/:paperId/question-outcomes` | exam_controller, hod, principal, quality_officer, teacher, tenant_admin |  |
| GET | `/v1/quality/frameworks` | hod, principal, quality_officer, tenant_admin |  |
| POST | `/v1/quality/frameworks` | principal, quality_officer, tenant_admin |  |
| GET | `/v1/quality/frameworks/:id` | hod, principal, quality_officer, tenant_admin |  |
| POST | `/v1/quality/frameworks/:id/criteria` | principal, quality_officer, tenant_admin |  |
| POST | `/v1/quality/frameworks/:id/harvest` | principal, quality_officer, tenant_admin |  |
| POST | `/v1/quality/frameworks/:id/status` | principal, quality_officer, tenant_admin |  |
| GET | `/v1/question-bank/blueprints` | exam_controller, hod, principal, teacher, tenant_admin |  |
| POST | `/v1/question-bank/blueprints` | exam_controller, hod, principal, teacher, tenant_admin |  |
| GET | `/v1/question-bank/options` | exam_controller, hod, principal, teacher, tenant_admin |  |
| GET | `/v1/question-bank/papers` | exam_controller, hod, principal, teacher, tenant_admin |  |
| POST | `/v1/question-bank/papers` | exam_controller, hod, principal, teacher, tenant_admin |  |
| GET | `/v1/question-bank/papers/:id` | exam_controller, hod, principal, teacher, tenant_admin |  |
| GET | `/v1/question-bank/papers/:id/answer-key.pdf` | exam_controller, hod, principal, teacher, tenant_admin |  |
| POST | `/v1/question-bank/papers/:id/lock` | exam_controller, hod, principal, tenant_admin |  |
| GET | `/v1/question-bank/papers/:id/paper.pdf` | exam_controller, hod, principal, teacher, tenant_admin |  |
| POST | `/v1/question-bank/papers/:id/regenerate` | exam_controller, hod, principal, teacher, tenant_admin |  |
| GET | `/v1/question-bank/papers/:id/release` | exam_controller, hod, principal, tenant_admin |  |
| POST | `/v1/question-bank/papers/:id/release` | exam_controller, hod, principal, tenant_admin |  |
| POST | `/v1/question-bank/papers/:id/release/cancel` | exam_controller, hod, principal, tenant_admin |  |
| POST | `/v1/question-bank/papers/:id/scrutiny` | exam_controller, hod, principal, teacher, tenant_admin |  |
| POST | `/v1/question-bank/papers/:id/submit` | exam_controller, hod, principal, teacher, tenant_admin |  |
| GET | `/v1/question-bank/questions` | exam_controller, hod, principal, teacher, tenant_admin |  |
| POST | `/v1/question-bank/questions` | exam_controller, hod, principal, teacher, tenant_admin |  |
| GET | `/v1/question-bank/questions/:id` | exam_controller, hod, principal, teacher, tenant_admin |  |
| PATCH | `/v1/question-bank/questions/:id` | exam_controller, hod, principal, teacher, tenant_admin |  |
| POST | `/v1/question-bank/questions/:id/approve` | exam_controller, hod, principal, tenant_admin |  |
| POST | `/v1/question-bank/questions/:id/review` | exam_controller, hod, principal, teacher, tenant_admin |  |
| GET | `/v1/question-bank/questions/:id/usage` | exam_controller, hod, principal, tenant_admin |  |
| GET | `/v1/question-bank/releases` | exam_controller, hod, principal, tenant_admin |  |
| GET | `/v1/question-bank/releases/:paperId/paper.pdf` | exam_controller |  |
| GET | `/v1/question-bank/releases/mine` | exam_controller |  |
| GET | `/v1/question-bank/usage` | exam_controller, hod, principal, tenant_admin |  |
| POST | `/v1/readmissions` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/readmissions/search` | exam_controller, hod, principal, tenant_admin |  |
| GET | `/v1/readmissions/students/:studentId` | accreditation_reviewer, exam_controller, hod, principal, quality_officer, teacher, tenant_admin, university_admin |  |
| GET | `/v1/readmissions/students/:studentId/preview` | accreditation_reviewer, exam_controller, hod, principal, quality_officer, teacher, tenant_admin, university_admin |  |
| POST | `/v1/record-corrections/:id/apply` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/record-corrections/:id/decide` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/recordings` | any signed-in user; board token |  |
| GET | `/v1/recordings/:id` | any signed-in user; board token |  |
| PUT | `/v1/recordings/:id` | board token |  |
| GET | `/v1/recordings/:id/audio` | any signed-in user; board token |  |
| PUT | `/v1/recordings/:id/audio` | board token |  |
| GET | `/v1/recordings/:id/events` | any signed-in user; board token |  |
| PUT | `/v1/recordings/:id/events` | board token |  |
| POST | `/v1/recordings/:id/finish` | board token |  |
| POST | `/v1/recordings/:id/keep` | any signed-in user; board token |  |
| POST | `/v1/recordings/:id/share` | any signed-in user; board token |  |
| GET | `/v1/records/:entity` | any signed-in user |  |
| POST | `/v1/records/:entity` | any signed-in user |  |
| DELETE | `/v1/records/:entity/:id` | any signed-in user | OWNERSHIP? reviewed |
| GET | `/v1/records/:entity/:id` | any signed-in user | OWNERSHIP? reviewed |
| PATCH | `/v1/records/:entity/:id` | any signed-in user |  |
| POST | `/v1/records/:entity/:id/duplicate` | any signed-in user |  |
| GET | `/v1/records/:entity/:id/history` | any signed-in user | OWNERSHIP? reviewed |
| POST | `/v1/records/:entity/:id/move` | any signed-in user |  |
| POST | `/v1/records/:entity/bulk` | any signed-in user | BROAD reviewed |
| GET | `/v1/records/:entity/export` | any signed-in user |  |
| POST | `/v1/records/:entity/import` | any signed-in user | BROAD reviewed |
| GET | `/v1/records/:entity/import/:batchId` | any signed-in user | OWNERSHIP? reviewed |
| POST | `/v1/records/:entity/import/:batchId/commit` | any signed-in user | BROAD OWNERSHIP? reviewed |
| GET | `/v1/records/:entity/import/template` | any signed-in user |  |
| GET | `/v1/records/:entity/meta` | any signed-in user |  |
| POST | `/v1/records/:entity/reorder` | any signed-in user |  |
| GET | `/v1/recycle-bin` | any signed-in user |  |
| DELETE | `/v1/recycle-bin/:id` | any signed-in user |  |
| GET | `/v1/recycle-bin/:id` | any signed-in user | OWNERSHIP? reviewed |
| POST | `/v1/recycle-bin/:id/restore` | any signed-in user |  |
| POST | `/v1/recycle-bin/purge` | any signed-in user |  |
| POST | `/v1/recycle-bin/restore` | any signed-in user |  |
| GET | `/v1/recycle-bin/settings` | principal, tenant_admin |  |
| PUT | `/v1/recycle-bin/settings` | principal, tenant_admin |  |
| GET | `/v1/relative-grading/sessions/:sessionId` | exam_controller, hod, principal, tenant_admin |  |
| DELETE | `/v1/relative-grading/sessions/:sessionId/subjects/:subjectId` | exam_controller, principal, tenant_admin |  |
| PUT | `/v1/relative-grading/sessions/:sessionId/subjects/:subjectId` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/relative-grading/sessions/:sessionId/subjects/:subjectId/preview` | exam_controller, hod, principal, tenant_admin |  |
| GET | `/v1/relative-grading/settings` | exam_controller, hod, principal, tenant_admin |  |
| PUT | `/v1/relative-grading/settings` | exam_controller, principal, tenant_admin |  |
| PUT | `/v1/remote/:deviceId/photos/:photoId` | hod, principal, teacher |  |
| GET | `/v1/remote/photos/:photoId` | board token |  |
| GET | `/v1/research/conferences` | hod, principal, research_coordinator, teacher, tenant_admin |  |
| POST | `/v1/research/conferences` | hod, principal, research_coordinator, teacher, tenant_admin |  |
| GET | `/v1/research/datasets` | hod, principal, research_coordinator, teacher, tenant_admin |  |
| POST | `/v1/research/datasets` | hod, principal, research_coordinator, teacher, tenant_admin |  |
| DELETE | `/v1/research/datasets/:id` | hod, principal, research_coordinator, teacher, tenant_admin |  |
| POST | `/v1/research/datasets/:id/files` | hod, principal, research_coordinator, teacher, tenant_admin |  |
| GET | `/v1/research/datasets/:id/files/:index/download` | hod, principal, research_coordinator, teacher, tenant_admin |  |
| GET | `/v1/research/grants` | hod, principal, research_coordinator, teacher, tenant_admin |  |
| POST | `/v1/research/grants` | principal, research_coordinator, tenant_admin |  |
| GET | `/v1/research/grants/:id` | hod, principal, research_coordinator, teacher, tenant_admin |  |
| POST | `/v1/research/grants/:id/close` | principal, research_coordinator, tenant_admin |  |
| POST | `/v1/research/grants/:id/expenses` | hod, principal, research_coordinator, teacher, tenant_admin |  |
| GET | `/v1/research/kpis` | hod, principal, research_coordinator, tenant_admin |  |
| POST | `/v1/research/milestones/:id/complete` | hod, principal, research_coordinator, teacher, tenant_admin |  |
| GET | `/v1/research/office/summary` | hod, principal, research_coordinator, tenant_admin |  |
| GET | `/v1/research/patents` | hod, principal, research_coordinator, teacher, tenant_admin |  |
| POST | `/v1/research/patents` | hod, principal, research_coordinator, teacher, tenant_admin |  |
| POST | `/v1/research/patents/:id/status` | principal, research_coordinator, tenant_admin |  |
| GET | `/v1/research/projects` | hod, principal, research_coordinator, teacher, tenant_admin |  |
| POST | `/v1/research/projects` | principal, research_coordinator, tenant_admin |  |
| GET | `/v1/research/projects/:id` | hod, principal, research_coordinator, teacher, tenant_admin |  |
| POST | `/v1/research/projects/:id/members` | principal, research_coordinator, tenant_admin |  |
| POST | `/v1/research/projects/:id/milestones` | hod, principal, research_coordinator, teacher, tenant_admin |  |
| POST | `/v1/research/projects/:id/status` | principal, research_coordinator, tenant_admin |  |
| GET | `/v1/research/proposals` | hod, principal, research_coordinator, teacher, tenant_admin |  |
| POST | `/v1/research/proposals` | hod, principal, research_coordinator, teacher, tenant_admin |  |
| PUT | `/v1/research/proposals/:id` | hod, principal, research_coordinator, teacher, tenant_admin |  |
| POST | `/v1/research/proposals/:id/decision` | principal, research_coordinator, tenant_admin |  |
| POST | `/v1/research/proposals/:id/ethics` | principal, research_coordinator, tenant_admin |  |
| POST | `/v1/research/proposals/:id/submit` | hod, principal, research_coordinator, teacher, tenant_admin |  |
| POST | `/v1/research/proposals/:id/withdraw` | hod, principal, research_coordinator, teacher, tenant_admin |  |
| GET | `/v1/research/publications` | hod, principal, research_coordinator, teacher, tenant_admin |  |
| POST | `/v1/research/publications` | hod, principal, research_coordinator, teacher, tenant_admin |  |
| POST | `/v1/research/publications/import-doi` | hod, principal, research_coordinator, teacher, tenant_admin |  |
| POST | `/v1/research/publications/import-orcid` | hod, principal, research_coordinator, teacher, tenant_admin |  |
| GET | `/v1/research/reports/faculty` | hod, principal, research_coordinator, tenant_admin |  |
| GET | `/v1/research/reports/faculty-profile` | hod, principal, research_coordinator, teacher, tenant_admin |  |
| GET | `/v1/research/reports/faculty-profile.xlsx` | hod, principal, research_coordinator, teacher, tenant_admin |  |
| GET | `/v1/research/reports/naac-c3` | hod, principal, research_coordinator, tenant_admin |  |
| GET | `/v1/research/reports/nirf-rp` | hod, principal, research_coordinator, tenant_admin |  |
| GET | `/v1/research/reports/nirf-rp.xlsx` | hod, principal, research_coordinator, tenant_admin |  |
| GET | `/v1/research/scholars` | hod, principal, research_coordinator, teacher, tenant_admin |  |
| POST | `/v1/research/scholars` | principal, research_coordinator, tenant_admin |  |
| POST | `/v1/research/scholars/:id/allocate` | principal, research_coordinator, tenant_admin |  |
| GET | `/v1/research/scholars/:id/allocations` | hod, principal, research_coordinator, teacher, tenant_admin |  |
| POST | `/v1/research/scholars/:id/status` | principal, research_coordinator, tenant_admin |  |
| POST | `/v1/research/scholars/:id/thesis` | hod, principal, research_coordinator, teacher, tenant_admin |  |
| GET | `/v1/research/supervisors` | hod, principal, research_coordinator, tenant_admin |  |
| PUT | `/v1/research/supervisors/:userId` | principal, research_coordinator, tenant_admin |  |
| GET | `/v1/research/theses` | hod, principal, research_coordinator, teacher, tenant_admin |  |
| GET | `/v1/research/theses/:id` | hod, principal, research_coordinator, student, teacher, tenant_admin | OWNERSHIP? reviewed |
| PUT | `/v1/research/theses/:id` | hod, principal, research_coordinator, teacher, tenant_admin |  |
| PUT | `/v1/research/theses/:id/examiners` | principal, research_coordinator, tenant_admin |  |
| POST | `/v1/research/theses/:id/similarity` | hod, principal, research_coordinator, teacher, tenant_admin |  |
| POST | `/v1/research/theses/:id/stage` | hod, principal, research_coordinator, teacher, tenant_admin |  |
| POST | `/v1/research/theses/:id/vivas` | principal, research_coordinator, tenant_admin |  |
| GET | `/v1/research/theses/mine` | student |  |
| POST | `/v1/research/thesis-vivas/:vivaId/result` | principal, research_coordinator, tenant_admin |  |
| POST | `/v1/result-withholds/:id/release` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/results/students/:studentId` | any signed-in user |  |
| GET | `/v1/results/students/:studentId/backlogs` | any signed-in user |  |
| GET | `/v1/results/students/:studentId/exams` | any signed-in user |  |
| GET | `/v1/results/students/:studentId/marks-card.pdf` | any signed-in user |  |
| GET | `/v1/results/students/:studentId/progress-report.pdf` | any signed-in user |  |
| POST | `/v1/results/students/:studentId/revaluations` | any signed-in user |  |
| GET | `/v1/results/students/:studentId/transcript.pdf` | any signed-in user |  |
| GET | `/v1/retention/rules` | principal, tenant_admin |  |
| PUT | `/v1/retention/rules` | principal, tenant_admin |  |
| DELETE | `/v1/retention/rules/:id` | principal, tenant_admin |  |
| POST | `/v1/retention/run` | principal, tenant_admin |  |
| GET | `/v1/retention/sensitive/rules` | principal, tenant_admin |  |
| PUT | `/v1/retention/sensitive/rules/:dataClass` | principal, tenant_admin |  |
| POST | `/v1/retention/sensitive/run` | principal, tenant_admin |  |
| PUT | `/v1/retrieval/config` | principal, tenant_admin |  |
| POST | `/v1/retrieval/reindex` | principal, tenant_admin |  |
| GET | `/v1/retrieval/search` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/retrieval/status` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/revaluations/:id/complete` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/revaluations/:id/decide` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/saved-views` | any signed-in user |  |
| POST | `/v1/saved-views` | any signed-in user |  |
| DELETE | `/v1/saved-views/:id` | any signed-in user |  |
| PUT | `/v1/saved-views/:id` | any signed-in user |  |
| GET | `/v1/scheduling/attendance/rollup` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/scheduling/biometric/import` | principal, tenant_admin |  |
| GET | `/v1/scheduling/biometric/mappings` | principal, tenant_admin |  |
| PUT | `/v1/scheduling/biometric/mappings` | principal, tenant_admin |  |
| POST | `/v1/scheduling/calendar/sync` | principal, tenant_admin |  |
| GET | `/v1/scheduling/frequency` | hod, principal, tenant_admin |  |
| PUT | `/v1/scheduling/frequency/:subjectId` | principal, tenant_admin |  |
| GET | `/v1/scheduling/puc/sections` | hod, principal, tenant_admin |  |
| POST | `/v1/scheduling/puc/sections` | principal, tenant_admin |  |
| GET | `/v1/scheduling/term-presets` | principal, tenant_admin |  |
| POST | `/v1/scheduling/term-presets` | principal, tenant_admin |  |
| POST | `/v1/scheduling/timetable/generate` | principal, tenant_admin |  |
| GET | `/v1/scheme-presets` | exam_controller, hod, principal, teacher, tenant_admin |  |
| GET | `/v1/schemes` | exam_controller, hod, principal, teacher, tenant_admin |  |
| PUT | `/v1/schemes` | exam_controller, hod, principal, teacher, tenant_admin |  |
| GET | `/v1/schemes/:id` | exam_controller, hod, principal, teacher, tenant_admin |  |
| POST | `/v1/school-learning/boards/:id/evaluate` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/school-learning/boards/results/students/:studentId` | guardian, hod, principal, student, teacher, tenant_admin |  |
| GET | `/v1/school-learning/delayed-topics` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/school-learning/delayed-topics/remediate` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/school-learning/lesson-plans/:planId/outcomes` | hod, principal, teacher, tenant_admin |  |
| PUT | `/v1/school-learning/lesson-plans/:planId/outcomes` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/school-learning/outcome-tree` | hod, principal, teacher, tenant_admin |  |
| PUT | `/v1/school-learning/outcomes/:outcomeId/topics` | hod, principal, tenant_admin |  |
| GET | `/v1/school-learning/promotion/decisions` | hod, principal, tenant_admin |  |
| POST | `/v1/school-learning/promotion/decisions/approve` | principal, tenant_admin |  |
| POST | `/v1/school-learning/promotion/evaluate` | hod, principal, tenant_admin |  |
| GET | `/v1/school-learning/promotion/rules` | hod, principal, tenant_admin |  |
| POST | `/v1/school-learning/promotion/rules` | principal, tenant_admin |  |
| PUT | `/v1/school-learning/promotion/rules/:id` | principal, tenant_admin |  |
| POST | `/v1/school-learning/readiness/mocks` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/school-learning/readiness/sections/:sectionId` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/school-learning/readiness/students/:studentId` | guardian, hod, principal, student, teacher, tenant_admin |  |
| PUT | `/v1/school-learning/readiness/targets` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/school-learning/remedial` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/school-learning/remedial` | hod, principal, teacher, tenant_admin |  |
| PUT | `/v1/school-learning/remedial/:id` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/school-learning/remedial/generate` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/school-learning/students/:studentId/summary` | guardian, hod, principal, student, teacher, tenant_admin |  |
| GET | `/v1/school-learning/worksheets` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/school-learning/worksheets` | hod, principal, teacher, tenant_admin |  |
| DELETE | `/v1/school-learning/worksheets/:id` | hod, principal, tenant_admin |  |
| GET | `/v1/school-learning/worksheets/:id` | hod, principal, teacher, tenant_admin |  |
| PUT | `/v1/school-learning/worksheets/:id/scores` | hod, principal, teacher, tenant_admin |  |
| PUT | `/v1/school/mastery` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/school/mastery/sections/:sectionId` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/school/mastery/students/:studentId` | guardian, hod, principal, student, teacher, tenant_admin |  |
| GET | `/v1/school/outcomes` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/school/outcomes` | hod, principal, tenant_admin |  |
| POST | `/v1/school/puc/combinations` | principal, tenant_admin |  |
| POST | `/v1/school/puc/enrollments` | principal, tenant_admin |  |
| PUT | `/v1/school/puc/marks` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/school/puc/streams` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/school/puc/streams` | principal, tenant_admin |  |
| GET | `/v1/school/puc/students/:studentId` | guardian, hod, principal, student, teacher, tenant_admin |  |
| GET | `/v1/school/report-cards` | guardian, hod, principal, student, teacher, tenant_admin |  |
| PUT | `/v1/school/report-cards` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/school/report-cards/:id` | guardian, hod, principal, student, teacher, tenant_admin |  |
| GET | `/v1/school/report-cards/:id/pdf` | guardian, hod, principal, student, teacher, tenant_admin |  |
| GET | `/v1/scorm/content/:token/*path` | PUBLIC |  |
| GET | `/v1/scorm/packages` | any signed-in user |  |
| POST | `/v1/scorm/packages` | hod, principal, teacher, tenant_admin |  |
| DELETE | `/v1/scorm/packages/:id` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/scorm/packages/:id/attempts` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/scorm/packages/:id/launch` | any signed-in user |  |
| GET | `/v1/scorm/player/:token` | PUBLIC |  |
| POST | `/v1/scorm/track/:token` | PUBLIC |  |
| GET | `/v1/sdg/dashboard` | hod, placement_officer, principal, teacher, tenant_admin |  |
| GET | `/v1/sdg/goals` | any signed-in user |  |
| GET | `/v1/sdg/tags` | hod, placement_officer, principal, teacher, tenant_admin |  |
| POST | `/v1/sdg/tags` | hod, placement_officer, principal, teacher, tenant_admin |  |
| DELETE | `/v1/sdg/tags/:id` | hod, principal, tenant_admin |  |
| GET | `/v1/search` | any signed-in user (+FeatureGuard) |  |
| GET | `/v1/search/ask` | any signed-in user (+FeatureGuard) |  |
| GET | `/v1/sections/:id/answer-cards` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/sections/:id/exit-tickets` | hod, hod, principal, teacher, tenant_admin |  |
| GET | `/v1/sections/:id/polls` | hod, hod, principal, teacher, tenant_admin |  |
| GET | `/v1/sections/:id/roster` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/sessions/:id/end` | any signed-in user |  |
| GET | `/v1/sessions/current` | board token |  |
| POST | `/v1/sessions/current/end` | board token |  |
| POST | `/v1/sessions/current/live` | board token |  |
| GET | `/v1/skills` | hod, placement_officer, principal, teacher, tenant_admin |  |
| POST | `/v1/skills` | hod, principal, tenant_admin |  |
| GET | `/v1/skills/:id` | hod, placement_officer, principal, teacher, tenant_admin |  |
| PATCH | `/v1/skills/:id` | hod, principal, tenant_admin |  |
| GET | `/v1/skills/:id/evidence` | hod, placement_officer, principal, teacher, tenant_admin |  |
| POST | `/v1/skills/:id/evidence` | hod, placement_officer, principal, teacher, tenant_admin |  |
| POST | `/v1/skills/:id/maps` | hod, principal, tenant_admin |  |
| DELETE | `/v1/skills/:id/maps/:mapId` | hod, principal, tenant_admin |  |
| DELETE | `/v1/skills/evidence/:evidenceId` | hod, principal, tenant_admin |  |
| POST | `/v1/student-change-requests/:id/cancel` | any signed-in user |  |
| POST | `/v1/student-change-requests/:id/decide` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/student-change-requests/mine` | any signed-in user |  |
| POST | `/v1/student-clearance-items/:id/decide` | accountant, admissions_officer, hod, hostel_warden, librarian, principal, tenant_admin, transport_manager |  |
| GET | `/v1/student-clearances/:id` | accountant, admissions_officer, hod, hostel_warden, librarian, principal, tenant_admin, transport_manager |  |
| POST | `/v1/student-clearances/:id/recheck` | accountant, admissions_officer, hod, hostel_warden, librarian, principal, tenant_admin, transport_manager |  |
| GET | `/v1/student-health/classes/:sectionId/students` | counsellor, principal, tenant_admin |  |
| GET | `/v1/student-health/sections` | counsellor, principal, tenant_admin |  |
| GET | `/v1/student-health/students/:id` | counsellor, principal, tenant_admin |  |
| PUT | `/v1/student-health/students/:id/profile` | counsellor, principal, tenant_admin |  |
| POST | `/v1/student-health/students/:id/vaccinations` | counsellor, principal, tenant_admin |  |
| POST | `/v1/student-health/students/:id/visits` | counsellor, principal, tenant_admin |  |
| GET | `/v1/student-health/visits` | counsellor, principal, tenant_admin |  |
| GET | `/v1/student-leave` | any signed-in user |  |
| POST | `/v1/student-leave` | guardian, student |  |
| POST | `/v1/student-leave/:id/cancel` | guardian, student |  |
| POST | `/v1/student-leave/:id/decide` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/student/activities` | student |  |
| POST | `/v1/student/attendance/scan` | student |  |
| GET | `/v1/student/buzzer` | student |  |
| POST | `/v1/student/buzzer/press` | student |  |
| GET | `/v1/student/class-notes` | student |  |
| GET | `/v1/student/diary` | student |  |
| GET | `/v1/student/live` | student |  |
| GET | `/v1/student/me` | student |  |
| GET | `/v1/student/poll` | student |  |
| GET | `/v1/student/subjects` | student |  |
| GET | `/v1/students` | accountant, admissions_officer, hod, principal, tenant_admin |  |
| PUT | `/v1/students/:id/academic-ids` | admissions_officer, exam_controller, principal, tenant_admin |  |
| POST | `/v1/students/:id/admission-no` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/students/:id/change-requests` | any signed-in user |  |
| POST | `/v1/students/:id/change-requests` | any signed-in user |  |
| GET | `/v1/students/:id/clearances` | accountant, admissions_officer, hod, hostel_warden, librarian, principal, tenant_admin, transport_manager |  |
| POST | `/v1/students/:id/clearances` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/students/:id/details` | accountant, admissions_officer, hod, principal, tenant_admin |  |
| PUT | `/v1/students/:id/details` | accountant, admissions_officer, hod, principal, tenant_admin |  |
| POST | `/v1/students/:id/guardians` | admissions_officer, principal, tenant_admin |  |
| DELETE | `/v1/students/:id/guardians/:guardianId` | admissions_officer, principal, tenant_admin |  |
| PATCH | `/v1/students/:id/guardians/:guardianId` | admissions_officer, principal, tenant_admin |  |
| GET | `/v1/students/:id/profile` | accountant, admissions_officer, hod, principal, tenant_admin |  |
| POST | `/v1/students/:id/readmit` | principal, tenant_admin |  |
| POST | `/v1/students/:id/section` | principal, tenant_admin |  |
| GET | `/v1/students/:id/siblings` | accountant, admissions_officer, hod, principal, tenant_admin |  |
| POST | `/v1/students/:id/status` | principal, tenant_admin |  |
| GET | `/v1/students/:id/status-history` | accountant, admissions_officer, hod, principal, tenant_admin |  |
| GET | `/v1/students/:studentId/exam-applications` | any signed-in user |  |
| GET | `/v1/students/:studentId/grace-applications` | any signed-in user |  |
| GET | `/v1/students/:studentId/marks-ledger` | any signed-in user |  |
| GET | `/v1/students/:studentId/record-corrections` | any signed-in user |  |
| POST | `/v1/students/:studentId/record-corrections` | any signed-in user |  |
| GET | `/v1/students/absences` | accountant, admissions_officer, hod, principal, tenant_admin |  |
| POST | `/v1/students/promotions` | principal, tenant_admin |  |
| GET | `/v1/students/promotions/eligibility` | principal, tenant_admin |  |
| GET | `/v1/students/promotions/history` | principal, tenant_admin |  |
| POST | `/v1/students/rebalance` | principal, tenant_admin |  |
| GET | `/v1/students/reports/:kind` | accountant, admissions_officer, hod, principal, tenant_admin |  |
| POST | `/v1/students/roll-numbers` | principal, tenant_admin |  |
| GET | `/v1/surveys` | hod, principal, quality_officer, teacher, tenant_admin |  |
| POST | `/v1/surveys` | hod, principal, quality_officer, teacher, tenant_admin |  |
| GET | `/v1/surveys/:id` | hod, principal, quality_officer, teacher, tenant_admin |  |
| POST | `/v1/surveys/:id/close` | hod, principal, quality_officer, teacher, tenant_admin |  |
| GET | `/v1/surveys/:id/export.csv` | hod, principal, quality_officer, teacher, tenant_admin |  |
| POST | `/v1/surveys/:id/publish` | hod, principal, quality_officer, teacher, tenant_admin |  |
| POST | `/v1/surveys/:id/responses` | accountant, admissions_officer, alumni, canteen_manager, counsellor, driver, exam_controller, examiner, grievance_officer, guardian, hod, hostel_warden, hr_manager, icc_member, librarian, placement_officer, principal, quality_officer, research_coordinator, store_keeper, student, teacher, tenant_admin, transport_manager |  |
| GET | `/v1/surveys/:id/results` | hod, principal, quality_officer, teacher, tenant_admin |  |
| GET | `/v1/surveys/mine` | accountant, admissions_officer, alumni, canteen_manager, counsellor, driver, exam_controller, examiner, grievance_officer, guardian, hod, hostel_warden, hr_manager, icc_member, librarian, placement_officer, principal, quality_officer, research_coordinator, store_keeper, student, teacher, tenant_admin, transport_manager |  |
| GET | `/v1/surveys/outcomes` | hod, principal, quality_officer, teacher, tenant_admin |  |
| POST | `/v1/surveys/schedule/run` | principal, quality_officer, tenant_admin |  |
| GET | `/v1/surveys/series` | hod, principal, quality_officer, teacher, tenant_admin |  |
| GET | `/v1/surveys/series/:key/trend` | hod, principal, quality_officer, teacher, tenant_admin |  |
| POST | `/v1/sync/push` | board token; device token |  |
| GET | `/v1/tally/export.xml` | accountant, principal, tenant_admin |  |
| GET | `/v1/tally/log` | accountant, principal, tenant_admin |  |
| POST | `/v1/tally/log/:id/retry` | accountant, principal, tenant_admin |  |
| GET | `/v1/tally/mapping` | accountant, principal, tenant_admin |  |
| PUT | `/v1/tally/mapping` | accountant, principal, tenant_admin |  |
| POST | `/v1/tally/mark-imported` | accountant, principal, tenant_admin |  |
| GET | `/v1/tally/settings` | accountant, principal, tenant_admin |  |
| PUT | `/v1/tally/settings` | accountant, principal, tenant_admin |  |
| POST | `/v1/tally/sync` | accountant, principal, tenant_admin |  |
| POST | `/v1/tasks` | accountant, admissions_officer, canteen_manager, counsellor, driver, exam_controller, examiner, grievance_officer, hod, hostel_warden, hr_manager, icc_member, librarian, placement_officer, principal, quality_officer, research_coordinator, store_keeper, teacher, tenant_admin, transport_manager |  |
| POST | `/v1/tasks/:id/status` | accountant, admissions_officer, canteen_manager, counsellor, driver, exam_controller, examiner, grievance_officer, hod, hostel_warden, hr_manager, icc_member, librarian, placement_officer, principal, quality_officer, research_coordinator, store_keeper, teacher, tenant_admin, transport_manager |  |
| GET | `/v1/tasks/assigned-by-me` | accountant, admissions_officer, canteen_manager, counsellor, driver, exam_controller, examiner, grievance_officer, hod, hostel_warden, hr_manager, icc_member, librarian, placement_officer, principal, quality_officer, research_coordinator, store_keeper, teacher, tenant_admin, transport_manager |  |
| GET | `/v1/tasks/mine` | accountant, admissions_officer, canteen_manager, counsellor, driver, exam_controller, examiner, grievance_officer, hod, hostel_warden, hr_manager, icc_member, librarian, placement_officer, principal, quality_officer, research_coordinator, store_keeper, teacher, tenant_admin, transport_manager |  |
| GET | `/v1/tasks/people` | accountant, admissions_officer, canteen_manager, counsellor, driver, exam_controller, examiner, grievance_officer, hod, hostel_warden, hr_manager, icc_member, librarian, placement_officer, principal, quality_officer, research_coordinator, store_keeper, teacher, tenant_admin, transport_manager |  |
| GET | `/v1/teacher/classes` | hod, principal, teacher |  |
| GET | `/v1/teacher/diary` | hod, principal, teacher |  |
| POST | `/v1/teacher/diary` | hod, principal, teacher |  |
| GET | `/v1/teacher/homework` | hod, principal, teacher |  |
| GET | `/v1/teacher/session` | hod, principal, teacher |  |
| GET | `/v1/teacher/timetable` | hod, principal, teacher |  |
| POST | `/v1/teaching-log` | hod, principal, teacher, tenant_admin |  |
| POST | `/v1/teaching-log/:id/review` | hod, principal, tenant_admin |  |
| GET | `/v1/teaching-log/completion` | exam_controller, hod, principal, teacher, tenant_admin |  |
| GET | `/v1/teaching-log/pending` | hod, principal, teacher, tenant_admin |  |
| GET | `/v1/teaching-log/register` | exam_controller, hod, principal, teacher, tenant_admin |  |
| POST | `/v1/teaching-log/review` | hod, principal, tenant_admin |  |
| GET | `/v1/terms` | any signed-in user |  |
| GET | `/v1/timetable-studio/options` | hod, principal, tenant_admin |  |
| GET | `/v1/timetable-studio/versions` | hod, principal, tenant_admin |  |
| POST | `/v1/timetable-studio/versions` | principal, tenant_admin |  |
| GET | `/v1/timetable-studio/versions/:id` | hod, principal, tenant_admin |  |
| POST | `/v1/timetable-studio/versions/:id/check` | principal, tenant_admin |  |
| POST | `/v1/timetable-studio/versions/:id/discard` | principal, tenant_admin |  |
| POST | `/v1/timetable-studio/versions/:id/duplicate` | principal, tenant_admin |  |
| POST | `/v1/timetable-studio/versions/:id/generate` | principal, tenant_admin |  |
| GET | `/v1/timetable-studio/versions/:id/pdf` | hod, principal, tenant_admin |  |
| POST | `/v1/timetable-studio/versions/:id/publish` | principal, tenant_admin |  |
| POST | `/v1/timetable-studio/versions/:id/slots` | principal, tenant_admin |  |
| DELETE | `/v1/timetable-studio/versions/:id/slots/:slotId` | principal, tenant_admin |  |
| PATCH | `/v1/timetable-studio/versions/:id/slots/:slotId` | principal, tenant_admin |  |
| POST | `/v1/timetable-studio/versions/:id/slots/:slotId/lock` | principal, tenant_admin |  |
| GET | `/v1/timetable-studio/versions/:id/workload` | hod, principal, tenant_admin |  |
| GET | `/v1/timetable/me/substitutions` | hod, principal, teacher |  |
| GET | `/v1/timetable/substitutes` | hod, principal, tenant_admin |  |
| GET | `/v1/timetable/substitutions` | hod, principal, tenant_admin |  |
| POST | `/v1/timetable/substitutions` | hod, principal, tenant_admin |  |
| POST | `/v1/timetable/substitutions/:id/cancel` | hod, principal, tenant_admin |  |
| GET | `/v1/timetable/substitutions/needed` | hod, principal, tenant_admin |  |
| POST | `/v1/transport/assignments` | principal, tenant_admin, transport_manager |  |
| POST | `/v1/transport/assignments/:studentId/end` | principal, tenant_admin, transport_manager |  |
| GET | `/v1/transport/calendar` | principal, tenant_admin, transport_manager |  |
| GET | `/v1/transport/change-requests/mine` | guardian, student |  |
| POST | `/v1/transport/change-requests/mine` | guardian, student |  |
| GET | `/v1/transport/compliance` | principal, tenant_admin, transport_manager |  |
| GET | `/v1/transport/dashboard` | principal, tenant_admin, transport_manager |  |
| GET | `/v1/transport/drivers` | principal, tenant_admin, transport_manager |  |
| POST | `/v1/transport/drivers` | principal, tenant_admin, transport_manager |  |
| POST | `/v1/transport/duty/today` | principal, tenant_admin, transport_manager |  |
| GET | `/v1/transport/expenses` | principal, tenant_admin, transport_manager |  |
| POST | `/v1/transport/expenses` | principal, tenant_admin, transport_manager |  |
| GET | `/v1/transport/expenses/summary` | principal, tenant_admin, transport_manager |  |
| POST | `/v1/transport/fees` | principal, tenant_admin, transport_manager |  |
| POST | `/v1/transport/fees/month` | principal, tenant_admin, transport_manager |  |
| POST | `/v1/transport/gps/:tenantSlug` | PUBLIC |  |
| GET | `/v1/transport/gps/sources` | principal, tenant_admin, transport_manager |  |
| POST | `/v1/transport/gps/sources` | principal, tenant_admin, transport_manager |  |
| POST | `/v1/transport/gps/sources/:id/revoke` | principal, tenant_admin, transport_manager |  |
| POST | `/v1/transport/handovers/:id/verify` | driver, principal, tenant_admin, transport_manager |  |
| POST | `/v1/transport/handovers/otp` | driver, principal, tenant_admin, transport_manager |  |
| POST | `/v1/transport/handovers/photo` | driver, principal, tenant_admin, transport_manager |  |
| GET | `/v1/transport/incidents` | principal, tenant_admin, transport_manager |  |
| POST | `/v1/transport/incidents` | driver, principal, tenant_admin, transport_manager |  |
| POST | `/v1/transport/incidents/:id/resolve` | principal, tenant_admin, transport_manager |  |
| GET | `/v1/transport/me` | driver |  |
| GET | `/v1/transport/no-dues/:studentId` | any signed-in user |  |
| GET | `/v1/transport/passes/:studentId.pdf` | any signed-in user |  |
| GET | `/v1/transport/passes/route/:routeId.pdf` | principal, tenant_admin, transport_manager |  |
| GET | `/v1/transport/routes` | principal, tenant_admin, transport_manager |  |
| POST | `/v1/transport/routes` | principal, tenant_admin, transport_manager |  |
| GET | `/v1/transport/routes-public` | any signed-in user |  |
| GET | `/v1/transport/routes/:id` | principal, tenant_admin, transport_manager |  |
| PATCH | `/v1/transport/routes/:id` | principal, tenant_admin, transport_manager |  |
| POST | `/v1/transport/routes/:id/stops` | principal, tenant_admin, transport_manager |  |
| GET | `/v1/transport/students/:id` | any signed-in user |  |
| GET | `/v1/transport/students/:id/pickup-persons` | any signed-in user |  |
| GET | `/v1/transport/trips` | principal, tenant_admin, transport_manager |  |
| POST | `/v1/transport/trips` | driver |  |
| GET | `/v1/transport/trips/:id` | principal, tenant_admin, transport_manager |  |
| POST | `/v1/transport/trips/:id/end` | driver |  |
| POST | `/v1/transport/trips/:id/position` | driver |  |
| GET | `/v1/transport/vehicles` | principal, tenant_admin, transport_manager |  |
| POST | `/v1/transport/vehicles` | principal, tenant_admin, transport_manager |  |
| GET | `/v1/university-results/registers` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/university-results/registers` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/university-results/registers/:id` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/university-results/registers/:id/export` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/university-results/templates` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/university-results/templates` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/university-results/templates/samples` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/university/convocations` | exam_controller, hod, principal, tenant_admin, university_admin |  |
| POST | `/v1/university/convocations` | exam_controller, principal, tenant_admin, university_admin |  |
| GET | `/v1/university/convocations/:id` | exam_controller, hod, principal, tenant_admin, university_admin |  |
| POST | `/v1/university/convocations/:id/candidates` | exam_controller, principal, tenant_admin, university_admin |  |
| GET | `/v1/university/convocations/:id/candidates/:candidateId/certificate.pdf` | exam_controller, hod, principal, student, tenant_admin, university_admin |  |
| POST | `/v1/university/convocations/:id/candidates/:candidateId/withhold` | exam_controller, principal, tenant_admin, university_admin |  |
| POST | `/v1/university/convocations/:id/close` | exam_controller, principal, tenant_admin, university_admin |  |
| POST | `/v1/university/convocations/:id/eligible` | exam_controller, principal, tenant_admin, university_admin |  |
| POST | `/v1/university/convocations/:id/issue` | principal, tenant_admin, university_admin |  |
| POST | `/v1/university/convocations/:id/open` | exam_controller, principal, tenant_admin, university_admin |  |
| POST | `/v1/university/convocations/:id/register` | exam_controller, principal, student, tenant_admin, university_admin |  |
| GET | `/v1/university/degrees` | exam_controller, hod, principal, tenant_admin, university_admin |  |
| PUT | `/v1/university/departments/:id/faculty` | principal, tenant_admin, university_admin |  |
| POST | `/v1/university/faculties` | principal, tenant_admin, university_admin |  |
| PUT | `/v1/university/faculties/:id` | principal, tenant_admin, university_admin |  |
| GET | `/v1/university/governance` | exam_controller, hod, principal, tenant_admin, university_admin |  |
| GET | `/v1/university/hierarchy` | exam_controller, hod, principal, tenant_admin, university_admin |  |
| GET | `/v1/university/institutions` | exam_controller, hod, principal, tenant_admin, university_admin |  |
| POST | `/v1/university/institutions` | principal, tenant_admin, university_admin |  |
| PUT | `/v1/university/institutions/:id` | principal, tenant_admin, university_admin |  |
| GET | `/v1/users/:id/photo` | any signed-in user; board token |  |
| POST | `/v1/valuation-bundles/:id/count` | exam_controller, examiner, hod, principal, teacher, tenant_admin |  |
| POST | `/v1/valuation-bundles/:id/issue` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/valuation-bundles/:id/return` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/valuation-bundles/mine` | exam_controller, examiner, hod, principal, teacher, tenant_admin |  |
| POST | `/v1/valuation-camps/:id/close` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/valuation-camps/:id/daily` | exam_controller, hod, principal, tenant_admin |  |
| POST | `/v1/valuation-camps/:id/pack` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/verification-requests/:id/check` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/verification-requests/:id/pay` | exam_controller, principal, tenant_admin |  |
| POST | `/v1/verification-requests/:id/reject` | exam_controller, principal, tenant_admin |  |
| GET | `/v1/welfare/accommodations/exam-feed` | exam_controller, grievance_officer, hod, principal, tenant_admin |  |
| GET | `/v1/welfare/reports/grievances` | grievance_officer, icc_member, principal, principal, tenant_admin |  |
| GET | `/v1/welfare/requests` | any signed-in user |  |
| POST | `/v1/welfare/requests` | guardian, student |  |
| POST | `/v1/welfare/requests/:id/decision` | grievance_officer, principal, tenant_admin |  |
| POST | `/v1/welfare/requests/:id/disburse` | grievance_officer, principal, tenant_admin |  |
| POST | `/v1/welfare/requests/:id/review` | grievance_officer, principal, tenant_admin |  |
| POST | `/v1/welfare/requests/:id/withdraw` | guardian, student |  |
| POST | `/v1/welfare/undertakings/mine` | guardian, student |  |
| POST | `/v1/welfare/undertakings/request` | admissions_officer, grievance_officer, principal, tenant_admin |  |
| GET | `/v1/welfare/undertakings/summary` | admissions_officer, grievance_officer, hod, principal, tenant_admin |  |
| GET | `/v1/whiteboards` | any signed-in user; board token |  |
| GET | `/v1/whiteboards/:id` | any signed-in user; board token |  |
| PUT | `/v1/whiteboards/:id` | board token |  |
| POST | `/v1/whiteboards/:id/export` | board token |  |
| POST | `/v1/whiteboards/:id/share` | any signed-in user; board token |  |
| GET | `/v1/whiteboards/:id/versions` | any signed-in user; board token |  |
| POST | `/v1/whiteboards/:id/versions/:version/restore` | any signed-in user; board token |  |
| GET | `/v1/workflows/bound/:module/:sourceId` | accountant, admissions_officer, grievance_officer, principal, principal, principal, tenant_admin, tenant_admin, tenant_admin |  |
| POST | `/v1/workflows/bound/admission-waivers/:applicationId` | admissions_officer, principal, tenant_admin |  |
| POST | `/v1/workflows/bound/certificates/:id` | principal, tenant_admin |  |
| POST | `/v1/workflows/bound/grievances/:id/resolution` | grievance_officer, principal, tenant_admin |  |
| POST | `/v1/workflows/bound/refunds` | accountant, principal, tenant_admin |  |
| POST | `/v1/workflows/bound/scholarships/:id` | accountant, principal, tenant_admin |  |
| GET | `/v1/workflows/builder` | principal, tenant_admin |  |
| POST | `/v1/workflows/builder` | principal, tenant_admin |  |
| GET | `/v1/workflows/builder/:id` | principal, tenant_admin |  |
| POST | `/v1/workflows/builder/:id/active` | principal, tenant_admin |  |
| DELETE | `/v1/workflows/builder/:id/draft` | principal, tenant_admin |  |
| PUT | `/v1/workflows/builder/:id/draft` | principal, tenant_admin |  |
| POST | `/v1/workflows/builder/:id/publish` | principal, tenant_admin |  |
| POST | `/v1/workflows/builder/:id/test` | principal, tenant_admin |  |
| GET | `/v1/workflows/builder/runs` | principal, tenant_admin |  |
| GET | `/v1/workflows/definitions` | accountant, admissions_officer, canteen_manager, counsellor, driver, exam_controller, examiner, grievance_officer, hod, hostel_warden, hr_manager, icc_member, librarian, placement_officer, principal, quality_officer, research_coordinator, store_keeper, teacher, tenant_admin, transport_manager |  |
| POST | `/v1/workflows/definitions` | principal, tenant_admin |  |
| PATCH | `/v1/workflows/definitions/:id` | principal, tenant_admin |  |
| GET | `/v1/workflows/requests` | principal, tenant_admin |  |
| POST | `/v1/workflows/requests` | accountant, admissions_officer, canteen_manager, counsellor, driver, exam_controller, examiner, grievance_officer, hod, hostel_warden, hr_manager, icc_member, librarian, placement_officer, principal, quality_officer, research_coordinator, store_keeper, teacher, tenant_admin, transport_manager |  |
| GET | `/v1/workflows/requests/:id` | accountant, admissions_officer, canteen_manager, counsellor, driver, exam_controller, examiner, grievance_officer, hod, hostel_warden, hr_manager, icc_member, librarian, placement_officer, principal, quality_officer, research_coordinator, store_keeper, teacher, tenant_admin, transport_manager |  |
| POST | `/v1/workflows/requests/:id/cancel` | accountant, admissions_officer, canteen_manager, counsellor, driver, exam_controller, examiner, grievance_officer, hod, hostel_warden, hr_manager, icc_member, librarian, placement_officer, principal, quality_officer, research_coordinator, store_keeper, teacher, tenant_admin, transport_manager |  |
| POST | `/v1/workflows/requests/:id/decide` | accountant, admissions_officer, canteen_manager, counsellor, driver, exam_controller, examiner, grievance_officer, hod, hostel_warden, hr_manager, icc_member, librarian, placement_officer, principal, quality_officer, research_coordinator, store_keeper, teacher, tenant_admin, transport_manager |  |
| POST | `/v1/workflows/requests/:id/resubmit` | accountant, admissions_officer, canteen_manager, counsellor, driver, exam_controller, examiner, grievance_officer, hod, hostel_warden, hr_manager, icc_member, librarian, placement_officer, principal, quality_officer, research_coordinator, store_keeper, teacher, tenant_admin, transport_manager |  |
| GET | `/v1/workflows/requests/inbox` | accountant, admissions_officer, canteen_manager, counsellor, driver, exam_controller, examiner, grievance_officer, hod, hostel_warden, hr_manager, icc_member, librarian, placement_officer, principal, quality_officer, research_coordinator, store_keeper, teacher, tenant_admin, transport_manager |  |
| GET | `/v1/workflows/requests/mine` | accountant, admissions_officer, canteen_manager, counsellor, driver, exam_controller, examiner, grievance_officer, hod, hostel_warden, hr_manager, icc_member, librarian, placement_officer, principal, quality_officer, research_coordinator, store_keeper, teacher, tenant_admin, transport_manager |  |
| POST | `/v1/workflows/sla/run` | principal, tenant_admin |  |
| GET | `/v1/year-plans` | any signed-in user |  |
| PUT | `/v1/year-plans/:id/items` | any signed-in user |  |
| POST | `/v1/year-plans/generate` | any signed-in user |  |
