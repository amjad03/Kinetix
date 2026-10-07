# Admissions CRM and student lifecycle

Code: `services/api/src/admissions`, `services/api/src/students`, `services/api/src/fees/application-fees.service.ts`,
rules in `packages/shared/src/admissions.ts`. Migrations 0041-0045. ERP: `/admissions`, `/students`, public `/apply/<slug>`.

## Flow

enquiry (web form, walk-in, phone) -> counsellor follow-ups -> application to a **cycle** -> fee and documents ->
review -> eligibility check -> merit list -> publish (offers) -> applicant accepts -> enrol -> active student.

## Model

- `enquiries`, `enquiry_activities`: stages `new, contacted, counselling, applied, converted, lost, deferred`
  (`ENQUIRY_STAGE_MOVES`). New enquiries go to the admissions officer with the fewest open ones. The same phone asking
  again about the same program is logged as a note, not a second enquiry. `converted` is set only by enrolment; `lost` needs a reason.
- `admission_cycles`: one program + academic year: seats, entry term, fee, offer validity, and JSON for the per-program
  `formFields`, `documents`, `eligibility` (age, minimums, allowed choices) and `meritRules` (weighted number answers).
  Form and documents are locked once an application exists. A cycle cannot open without a class for its entry term.
- `applications`: applicant, guardian, `answers`, status (`APPLICATION_MOVES`), `fee_status`, merit score/rank. The applicant
  has no login: a random token (SHA-256 stored, shown once in the tracking link) sent as `x-application-token`.
- `application_documents` (PDF/JPEG/PNG, 5 MB, type checked by magic bytes, reviewed verified/rejected), `application_payments`
  (online through the institution's own Razorpay/demo gateway with signature check and the existing webhook URL, or at the counter;
  receipt numbers share the fee receipt series; the principal/admin can waive).
- `merit_lists`: versioned ranking snapshots. Only the latest can be published; publishing offers the top ranks for the seats still
  free and waitlists the rest. Seats = cycle seats minus offered/accepted/enrolled.
- Student lifecycle: `students.status` (`applicant, enrolled, active, on_leave, detained, promoted, transferred, alumni, dropped`),
  `student_lifecycle_events` (append-only for the app role; reason, actor, effective date, batch), `promotion_batches`,
  guardians gain `is_primary` (one per student) and `is_emergency_contact`.

## Rules

`STUDENT_TRANSITIONS` + `transitionProblem`: reason required for on_leave, detained, transferred, dropped; alumni only from the
final term; final-term students graduate instead of being promoted; transferred, alumni and dropped are final. Transfer/dropout
disables a student-only login. Bulk promotion (`POST /v1/students/promotions`, `dryRun` supported) moves active students to the
next-term class of the same program (still `active`, a `promotion` event), detains the listed ones, graduates final-term classes,
skips students not active; one transaction. Roll numbers are kept unless taken.

## API and access

`/v1/admissions/*` for `tenant_admin, principal, admissions_officer`; fee waiver principal/admin only. `/v1/students` profile for those plus
`hod, accountant`; status, class change and promotion for `tenant_admin, principal`; guardians also for admissions officers.
Public: `/v1/public/admissions/:slug/*` (rate limited, honeypot on the enquiry and application forms).

## Audit

Every change writes `audit_log` with versioned names from `AdmissionsEvents` (e.g. `admissions.application.status_changed.v1`,
`students.status_changed.v1`); an application's history is shown on its review page, a student's on the profile timeline.

## Not done

Notifications to applicants (SMS/email), entrance tests, reservation quotas, sibling/TC workflows, a `domain_events` outbox
(audit_log is the record for now).

## Tests

`services/api/test/admissions.e2e.spec.ts`, `lifecycle.e2e.spec.ts`, `src/admissions/rules.spec.ts`; ERP `src/lib/cycle-config.test.ts`.
Test DB admin: set `KINETIX_TEST_ADMIN_URL` (or `KINETIX_PG_ADMIN_URL`) to a superuser URL; without it `sudo -u postgres psql` is used.
