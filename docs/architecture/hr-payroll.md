# HR and payroll

Staff records, departments and designations, staff attendance, leave, recruitment and an Indian
monthly payroll (PF, ESI, Karnataka Professional Tax, TDS). Code: `services/api/src/hr/`
(controllers, `payroll-math.ts` for the statutory maths, `biometric-csv.ts`, `exports.ts`).
ERP pages: `/hr/*` and `/payroll/*`. Teacher app: Me → Leave, Check-in, Payslips.

## Who can do what

| Role | HR records, attendance, leave admin, recruitment | Payroll draft / recompute / exports | Approve and lock a payroll run | Leave approval |
|---|---|---|---|---|
| `hr_manager` (new role) | yes | yes | no | every request |
| `accountant` | no | yes | no | no |
| `principal`, `tenant_admin` | yes | yes | yes | every request |
| `hod` | no | no | no | staff of the departments they head |
| any staff user | own profile (bank masked), own attendance, own leave, own payslips | | | |

Every write is audited (`audit_log.action` `hr.*`, `leave.*`, `payroll.*`). Bank exports and
payroll approval/lock are high-risk actions under SECURITY_PRIVACY_ACCEPTANCE.md and are audited
with the actor and the run version.

## Data (migrations 0053–0055, RLS in 0058)

- `designations`; departments are the existing `departments` table.
- `staff_profiles` (one per staff user): employee code (unique per institution), department,
  designation, employment type, joining/leaving dates, status, PAN, UAN, ESI number, tax regime,
  80C and other declared deductions, PF/ESI/PT switches, `version` for optimistic concurrency.
  The bank account number is **encrypted at rest** with the same AES-256-GCM `SecretBox` as the
  Razorpay secrets (`SECRETS_ENCRYPTION_KEY`), bound to `<tenantId>:staff.<userId>.bank_account`;
  only the last four digits are kept in clear. It is decrypted only for the bank-transfer export.
- `staff_attendance` (one row per staff per day; source `app`, `manual` or `biometric`).
- `leave_types`, `leave_balances` (opening/carried-forward days per year), `leave_requests`.
- `job_openings`, `job_applicants` (stage history in `stage_history`).
- `salary_components`, `salary_structures` (+ `salary_structure_lines`), `payroll_settings`,
  `payroll_runs`, `payslips`.

## Attendance

- App: `POST /v1/hr/attendance/check-in` and `/check-out` record the time for today (the
  institution's time zone). Checking in twice keeps the first time.
- Manual: `PUT /v1/hr/attendance {date, entries:[{userId, status, note?}]}`; status is
  `present`, `absent`, `half_day` or `on_leave`. Manual entries overwrite app/biometric ones.
- Biometric: `POST /v1/hr/attendance/import {csv}`. The adapter (`biometric-csv.ts`) reads
  `employee_code,date,in_time,out_time` (header required; dates `YYYY-MM-DD` or `DD-MM-YYYY`,
  times `HH:MM[:SS]`). Several punches for one person on one day collapse to the earliest in and
  latest out. Unknown employee codes are reported per line. Any device that exports CSV can be
  mapped to these columns; a device-specific adapter is a new parser with the same output.

## Leave

- Leave year = calendar year. A type is `paid` or unpaid, has `annualDays` and accrues
  `yearly` (all on 1 January) or `monthly` (annualDays/12 at the start of each month, rounded to
  half days). `available = opening + accrued(as of today) − used − pending`; nothing is stored
  per month, so accrual is idempotent and needs no job.
- `POST /v1/hr/leave/carry-forward {fromYear}` sets next year's opening to
  `min(closing balance, carryForwardMax)` per paid type; re-running gives the same result.
- Days requested exclude weekly offs (Sunday by default, `payroll_settings.weeklyOffs`) and
  institution-wide holidays from the academic calendar (`calendar_events` kind `holiday` with no
  program filter). Half-day requests are single-day.
- Workflow: apply (self) → `pending` → approve/reject (HR roles, or the HoD of the applicant's
  department; never one's own) → `approved`/`rejected`. The applicant may cancel a pending
  request, or an approved one that has not started. Overlapping requests and paid-leave
  requests beyond the balance are refused. Applicant and approver are notified (`leave`).

## Payroll

`payroll_runs.status`: `draft → approved → locked`. A draft can be recomputed any number of
times; `reopen` takes an approved run back to draft; a locked run is immutable (its payslips
are the record). Approve and lock need `expectedVersion` (409 on a stale version) and the
principal or administrator; locking publishes the payslips to staff (notification `payslip`).
One run per month per institution.

For each active staff member with a salary structure effective on the 1st of the month:

1. **Loss of pay days** = working days marked `absent` that are not covered by approved leave
   + 0.5 × `half_day` days + approved **unpaid** leave days. Weekly offs and holidays never
   count. Unmarked days count as present.
2. **Proration**: each earning × (days in month − LOP days) / days in month, rounded to the
   rupee. Fixed deductions (loan recovery, etc.) are not prorated.
3. **PF** (if enabled): PF wage = prorated earnings flagged `pfWage` (Basic, DA). Employee 12%
   of `min(PF wage, ceiling)` (₹15,000 ceiling, `pfCapAtCeiling` on by default). Employer 12%:
   EPS 8.33% of `min(PF wage, ₹15,000)`, the rest to EPF. Rounded to the rupee.
4. **ESI** (if enabled and gross ≤ ₹21,000): employee 0.75%, employer 3.25% of gross, each
   rounded **up** to the rupee.
5. **Professional Tax** (Karnataka default slabs, editable in settings): gross ≥ ₹25,000 →
   ₹200 a month, ₹300 in February; below that, nil.
6. **TDS** (sec. 192), regime per staff (`new` default, `old` optional). Projected annual
   income = gross already paid in locked runs this financial year + this month's gross × months
   left (including this one). New regime (FY 2025-26 slabs, ₹75,000 standard deduction, 87A
   rebate up to ₹12 lakh with marginal relief); old regime (₹50,000 standard deduction, PT,
   80C capped at ₹1.5 lakh including employee PF, other declared deductions, 87A up to ₹5
   lakh). 4% cess; annual tax rounded to ₹10. This month's TDS = (annual tax − TDS already
   deducted this year) / months left, rounded to the rupee. Surcharge (income over ₹50 lakh) is
   not computed: such cases must be handled by the accountant.

Known-value tests: `src/hr/payroll-math.spec.ts`.

## Exports (approved or locked runs; audited)

- `GET /v1/payroll/runs/:id/bank-transfer.csv`: beneficiary name, account number, IFSC, amount
  (rupees), narration. Staff without bank details are listed in an `X-Missing-Bank` header and left out.
- `GET /v1/payroll/runs/:id/statutory.csv?kind=pf|esi|pt|tds`: PF (UAN, gross, EPF wage, EPS
  wage, EDLI wage, employee, EPS, EPF, LOP days, in the ECR column order), ESI (IP number, days
  paid, wages, employee, employer), PT (employee, gross, PT) and TDS (PAN, regime, gross, TDS).
- `GET /v1/payroll/runs/:id/tally.xml`: one Tally journal voucher (Import Data / Vouchers) for
  the month. Debits: salary expense (gross), employer PF and ESI expense. Credits: PF payable
  (employee + employer), ESI payable, PT payable, TDS payable and salaries payable (net).
  Ledger names are editable in payroll settings and must exist in Tally.

## Payslips

`GET /v1/payroll/payslips/me` lists the caller's payslips from locked runs.
`GET /v1/payroll/payslips/:id/pdf` renders the PDF (self for locked runs; payroll roles for any).
PDFs come from the small built-in writer `src/common/pdf.ts` (Helvetica, English only).

## API summary

`/v1/hr`: `designations`, `staff`, `staff/:userId`, `staff/:userId/bank`, `me`,
`attendance` (`check-in`, `check-out`, `me`, `import`, `summary`), `leave-types`,
`leave/balances[/me]`, `leave/carry-forward`, `leave/requests[/me]`,
`leave/requests/:id/{approve,reject,cancel}`, `holidays`, `openings`,
`openings/:id/applicants`, `applicants/:id/stage`.

`/v1/payroll`: `settings`, `components`, `structures/:userId`, `runs`, `runs/:id`,
`runs/:id/{recompute,approve,lock,reopen}`, `runs/:id/{bank-transfer.csv,statutory.csv,tally.xml}`,
`payslips/me`, `payslips/:id`, `payslips/:id/pdf`.

## Depth (migrations 0165–0167)

**Staff master (0165).** `staff_profiles` gains category (teaching or non-teaching), cadre, post
(sanctioned, self-financing, guest), social category, religion, blood group, marital status, father's
or spouse's name, disability, address, emergency contact, Aadhaar (AES-GCM, only the last four
digits are shown), Ph.D. and NET/SET with years, pay scale and level, confirmation date, retirement
age and the LWF flag. `GET|PUT /v1/hr/staff/:userId/details` reads and writes them with the worked-out
retirement date, service years, prior teaching experience and publication counts. New tables
`staff_experience`, `staff_publications` and `staff_documents` (with scans) sit beside
`staff_qualifications`. Staff keep their own rows; HR verifies them, and a non-HR edit clears the
verification. Designations carry a cadre, a category and an order.

**Leave and attendance (0166).** Leave types gain a kind (regular, unpaid, duty, vacation,
compensatory off, maternity and others) and rules: the most days at a time, the notice period, a
supporting document for more than 2 days, gender, the sandwich rule, half days and credit
validity. HR can apply on someone's behalf. An applicant can name a delegate, who decides
requests in their place while the leave is approved. Approved leave can be withdrawn with a
reason, and substitutes can be arranged for its periods. Compensatory off is credited for a
holiday worked once it is approved. Attendance records late and early minutes against the
office hours (`officeStart`, `officeEnd`, grace), and every `lateMarksPerHalfDay` late marks in a
month cost half a day of pay. `attendance_regularisations` correct a day once approved.

**Recruitment.** Applicants carry screening details and a résumé. `job_interviews` are scheduled
with up to three panel members. Panel members score each criterion out of 10 at `/hr/interviews`,
and an interview is completed once the whole panel has scored. `POST /v1/hr/applicants/:id/hire`
creates the user, role, staff profile, service book entry and joining checklist, and closes a
filled opening. It also produces the appointment letter.

**Appraisal.** After the HoD's review, HR records a committee score with the student feedback
average (`PUT /v1/hr/appraisals/:id/committee`). The principal then finalises; without their own
figure, the committee's score stands.

**Payroll (0167).** A salary component can be a percentage of another one (DA as a percentage of
basic), with its rate history kept in `salary_component_rates`. When a rate is revised back to a
locked month, the difference is paid as arrears. A supplementary run, for chosen staff, follows the
month's locked regular run. A locked run is reversed only in order, latest first; its adjustments
are released for the next run. The Karnataka LWF is deducted in December (₹50 employee, ₹100
employer) and appears in the run's files. Other files are the EPFO ECR 2.0 text
(`runs/:id/ecr.txt`), Form 24Q annexures I and II (`/v1/payroll/24q.csv`), and a PT return by
slab, an LWF statement, staff by category, the 1:2:6 cadre ratio, the student-to-faculty ratio,
the NAAC teacher list and publications under `/v1/hr/reports/:kind`.

**Record kit.** All of these lists are `/v1/records/:entity` entities, each with add, edit,
recycle bin, bulk actions, import and export, history and saved views. The entities are
`staff-qualifications`, `staff-experience`, `staff-publications`, `staff-documents`,
`designations`, `leave-types`, `leave-requests`, `comp-off-credits`,
`attendance-regularisations`, `job-openings`, `job-applicants`, `job-interviews`,
`salary-components`, `payroll-adjustments`, `staff-loans`, `tds-challans`, `training-records`,
`appraisal-cycles`, `service-book`, `leave-encashments`, `onboarding-items`, `separations`,
`staff-transfers`, `delegations` and `payroll-runs`. The staff list adds the bulk actions
increment and promote. In the ERP, `components/hr/HrList.tsx` renders all of them from
`components/hr/hr-lists.tsx`. End-to-end tests: `test/hr-depth-kit.e2e.spec.ts`.
