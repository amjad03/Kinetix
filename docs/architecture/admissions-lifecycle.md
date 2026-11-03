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

## Counselling, reservation and enrolment (admissions pass, migrations 0196-0197)

Code: `services/api/src/admissions/pass/` (pure rules in `reservation.ts`, `eligibility-profile.ts`, `register-number.ts`,
`checklist.ts`; services `seats`, `enrolment`, `returns`, `broadcast`). ERP tabs under Admissions: **Seat matrix**,
**Enrolment**, **Broadcasts**, **Returns**; the application page gains claims, the checklist and the Enrol card; public
`/apply/<slug>/status`. Completeness report: [ADMISSIONS_COMPLETENESS.md](../requirements/ADMISSIONS_COMPLETENESS.md).

**How the office uses it, in order**

1. *Admissions → Enrolment → Programmes* (principal): the branch code used in register numbers, the sanctioned intake and the
   approval (university affiliation order, AICTE EoA) with its validity. *Settings → Admissions*: the register-number template
   (`{region}{college}{yy}{branch}{seq:3}` builds VTU's USN; leave it empty where the university issues numbers through UUCMS),
   college and region codes, the fee account whose gateway takes application fees, the home-state boards, provisional days.
2. *Seat matrix*: pick the cycle, choose a preset (Karnataka private engineering 45/30/25, private MBA/MCA 50/50, state-university
   degree college, open merit), name the options and their intake, apply. Rows are option × seat type × category: GM is the open
   row; SC 17%, ST 7%, Category-1 4%, 2A 15%, 2B 4%, 3A 4%, 3B 5% inside government seats; PwD 5%, rural 15% and Kannada medium 5%
   earmarked inside each row; TFW (5%) and foreign-national (15%) seats outside the intake. Every share is editable.
3. *Eligibility from the university*: the presets offered follow the programme's affiliation profile (VTU BE / lateral / MBA /
   MCA, Karnataka state universities' UG and PG, RGUHS MBBS, UGC defaults). Choosing one adds its questions to the form (only
   before applications arrive) and *Evaluate* then checks the qualifying exam, the minimum with the category relaxation, the
   subjects, the entrance test and percentile, and age.
4. *Merit*: the index-mark formula takes entrance presets: KCET engineering (50% CET + 50% PUC PCM), KCET / COMEDK / JEE Main rank
   (lowest first), NEET (720, ties by Biology, Chemistry, Physics), PGCET, KMAT. Paste results by application or entrance roll
   number on *Seat matrix → Entrance results*; ranks and scores become marks and the rank list rebuilds.
5. *Claims* on the application: horizontal (PwD, rural, Kannada medium, 371J, sports, NCC, defence) and supernumerary (TFW needs a
   family income below Rs 8 lakh; foreign seats are for NRI/PIO/foreign applicants), verified by the office.
6. *Rounds* (Rank lists tab): each candidate is placed by rank in their own seat type, GM row first, then their category, then a
   supernumerary row they hold a claim for. Horizontal seats are then made good inside each row (Saurav Yadav, 2020): the lowest
   newcomer without the claim gives way and tries their other preferences. Publishing offers the seats (application → offered);
   freeze/float/slide accept; reject declines; no answer by the close forfeits (declined). Between rounds the principal runs
   *Convert unfilled seats*: SC ↔ ST where a candidate of the other waits, then reserved to GM, optionally government seats to
   management; each move is kept and shown under the matrix.
7. *KEA / COMEDK allotments*: paste the authority's list; each candidate becomes an accepted application holding the allotted
   seat (the reference makes a repeat import harmless) and counts as *outside* in the matrix.
8. *Checklist* on the application: made from the candidate (board outside the state → migration and eligibility certificates;
   reserved category → caste/income; KEA seat → study certificate and allotment order; claims → their certificates; lateral →
   diploma marks; transfer → both universities' approval; everyone → TC, marks cards, anti-ragging undertaking). Originals
   received go to the custody register. *Admit provisionally* defers what is missing to a date (within the provisional days) on
   the undertaking; the letter prints from *Admission letter*. The admission confirms itself when the last item is in.
9. *Enrol*: needs the checklist complete or the admission provisional. It makes the student (class, roll), the register number
   (USN with regular rolls 001-399 and lateral from 400, checked against the university's pattern), the fee profile (seat type,
   category, batch) and every published fee structure that applies, then sends the student and parent how to sign in (phone and
   one-time code; SMS only through the DLT template `admission.welcome`, else email; destinations are stored masked).
10. *Enrolment tab*: provisional admissions due this week or overdue, students awaiting a university register number.
11. *Broadcasts*: choose a registered template, the segment (stages, programme, campaign, follow-up due), count the recipients
    (opted-out families, merged duplicates and repeated numbers are left out), send. A background job sends in batches of 100
    and logs each message on the enquiry's trail; the idempotency key stops a double send; SMS/WhatsApp only 9 am-9 pm.
12. *Returns*: the university approval list (CSV), the intake return against the sanctioned intake (lateral and supernumerary
    outside it), and AISHE DCF-II block 5 by programme × category × gender with PwD, minorities and foreign nationals (the
    accreditation AISHE return now reads the same profile fields).
13. *Public status page* `/apply/<slug>/status`: application number + date of birth (10 tries per 15 minutes per address, a
    honeypot field); shows first name and initials, the stages reached and the next step, nothing else.

**Application fee** goes through the fees gateway adapter: the gateway account of the chosen fee account (any of Razorpay,
PayU, Cashfree, Easebuzz, CCAvenue), the payer and return/notice URLs for hosted checkouts, each webhook event once (signature
checked with the account that ordered), status polling (on return and hourly) and pending orders given up after 72 hours.

**Access**: admissions roles for everything above; the principal (or admin) alone converts seats and sets programme approvals;
returns are also open to the exam controller and quality officer. Every write is audited (`admissions.seat_plan_applied.v1`,
`admissions.seats_dereserved.v1`, `admissions.claims_verified.v1`, `admissions.checklist_item_updated.v1`,
`admissions.admitted_provisionally.v1`, `admissions.admission_confirmed.v1`, `student.register_no_assigned.v1`,
`admissions.credentials_issued.v1`, `admissions.broadcast_queued.v1`, …).

## Not done

DigiLocker fetch of documents (needs the institution's DigiLocker requester registration); a `domain_events` outbox for every
admissions fact (audit_log is the record).

## Tests

`services/api/test/admissions.e2e.spec.ts`, `admissions-pass.e2e.spec.ts`, `lifecycle.e2e.spec.ts`, `src/admissions/rules.spec.ts`,
`src/admissions/pass/pass.spec.ts`; ERP `src/lib/cycle-config.test.ts`.
Test DB admin: set `ZYNETIX_TEST_ADMIN_URL` (or `ZYNETIX_PG_ADMIN_URL`) to a superuser URL; without it `sudo -u postgres psql` is used.
