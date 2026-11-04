# Campus operations, governance and ERP-wide QA: final audit (agent D)

Scope: Hostel and mess, Transport, Library, Inventory / assets / procurement, Governance / IQAC / NAAC / NIRF /
compliance, and the ERP-wide QA sweep (every `apps/erp/src/app/**/page.tsx` route for the main roles at 1280px and
390px). Time-boxed review; code was read on the real request paths, not taken from the completeness docs.

Migrations reserved: 0228, 0229 (not needed: every fix is in code). Test DB: `zynetix_test_audit_ops`. QA demo DB:
`zynetix_audit_qa_demo` (Soundarya seed), API on :4471, ERP dev server on :3471, env file in the session scratchpad.

## Summary

| Severity | Found | Fixed | Open |
| --- | --- | --- | --- |
| High | 2 | 2 | 0 |
| Medium | 6 | 5 | 1 |
| Low | 7 | 2 | 5 |
| QA sweep | 1 | 0 | 1 |

The main class of defect in these modules was **the date in the wrong time zone**: code that took
`new Date().toISOString().slice(0, 10)` or SQL `current_date` / `timestamptz::date`, which is the UTC date on our
hosts and is still yesterday from 00:00 to 05:30 IST. Each affected path now uses the institution's time zone
(`tenantToday` / `todayIn` in code, the new `LOCAL_TODAY` / `localDateOf` SQL helpers in
`services/api/src/common/local-today-sql.ts` for list filters).

## Findings

| ID | Sev | Area | File:line | Issue | Status | Test |
| --- | --- | --- | --- | --- | --- | --- |
| D-01 | High | Governance (rule registry) | `governance/rule-params.ts:10` | `governedParams` defaulted "today" to the UTC date. Every governed rule lookup (pass mark, grace marks, credit limits, admission index weights, quota seats) between 00:00 and 05:30 IST used yesterday's rule version, so a rule that takes effect today was not applied for the first 5.5 hours (exam results, course registration and admissions computed in that window used the old rule). | Fixed: defaults to `todayIn(tx, now)` (tenant zone) | API build (tsc); governance-pass e2e |
| D-02 | High | Transport | `transport/transport-ops.controller.ts:286`, `transport/transport.controller.ts:539` | Bus pass validity was `months x 30.44 days`: a 12-month pass from 1 June ran to 1 June next year (one day too long) and a 1-month pass from 31 Jan ran to 2 Mar. Printed on pass cards and shown to parents. | Fixed: `passValidUntil` (calendar months, day before the same date, clamped to a shorter month) | `src/transport/transport-rules.spec.ts` "passValidUntil" (failed first, passes) |
| D-03 | Medium | Governance | `governance/governance.controller.ts:83` | `GET /v1/governance/rules/resolve` without `on` resolved the rule in force on the UTC date. | Fixed (`tenantToday`) | tsc; e2e |
| D-04 | Medium | Governance | `governance/governance.service.ts:57` | Retiring a rule stamped `effectiveTo` with the UTC date: retired at 01:00 IST, it showed as having ended yesterday. | Fixed | tsc; e2e |
| D-05 | Medium | Governance (committees / IQAC) | `governance/committee-gov.service.ts:108` | Meeting action items were flagged overdue against the UTC date (not overdue until 05:30 IST on the day after the due date). | Fixed (`this.today(tx)`) | tsc; e2e |
| D-06 | Medium | Governance, Hostel, Inventory list filters | `governance/governance.records.ts:80,84`, `hostel/hostel.records.ts:1178,1181,1238`, `inventory/inventory.records.ts:437,648,780,927`, `inventory/facilities.records.ts:161` | SQL `current_date` (server date, UTC) in "In force today", hostel staff "Serving now", duties "Upcoming/Past", rate contracts "Expired", returnable gate passes "Overdue", asset warranty and AMC "expiring/expired", facility bookings "Today". | Fixed (`LOCAL_TODAY`) | tsc; inventory-pass e2e |
| D-07 | Medium | Hostel | `hostel/campus-ops.controller.ts:72,266` | Work-order overdue flag and the "rate a meal only after it has been served" check used the UTC date: from 00:00 to 05:30 IST a work order due yesterday was not yet overdue, and the meal-date check was a day behind. | Fixed (`tenantToday`) | tsc |
| D-08 | Medium | Hostel (NAAC/AISHE report) | `hostel/hostel-pass.controller.ts:355` | NAAC hostel `occupancyPercent` counted residents in closed rooms and allotments that start later, against beds in open rooms only: could exceed 100%. | Fixed (only open rooms, `starts_on <= today`) | hostel-pass e2e "AISHE and NAAC" |
| D-09 | Medium | Governance (records) | `governance/governance.records.ts:14` | "New version" of a rule started its draft from the UTC date. | Fixed (`todayIn`) | tsc |
| D-10 | Low | Transport | `transport/transport-ops.controller.ts:370` | Desk "handovers today" compared `handed_at::date` (UTC). | Fixed (`localDateOf`) | tsc |
| D-11 | Low | Hostel, Library reports | `hostel/hostel-pass.controller.ts` (7 `*_at::date` casts in the annual report), `library/library-pass.controller.ts:325-362` | Year-range counts (sick bay, complaints, books added, e-resources) cast `timestamptz::date` in UTC: a record made 00:00-05:30 IST on 1 April lands in the previous financial year. | Open: wrap each with `localDateOf(col)` | - |
| D-12 | Low | Hostel | `hostel/allotment.ts:95` | `vacate` accepts a future `on` date and closes the allotment immediately (bed shows free while the student is still in it). | Open: refuse `on > today`, or keep a scheduled vacate that closes on the day | - |
| D-13 | Low | Hostel | `hostel/hostel-rules.ts:65` | `settle` counts days used from the 1st of the vacate month even when the student moved in that month; the unused-fee refund is right only if the joining month was charged in full. | Open: pass `startsOn` and pro-rate from `max(startsOn, month start)` | - |
| D-14 | Low | Hostel | `hostel/hostel-ops.controller.ts:256-264` | Occupancy desk `occupied` counts allotments that start in the future, and a bed with two active holds counts twice in `held`. | Open: `a.starts_on <= today`, `count(distinct hd.bed_id)` | - |
| D-15 | Low | Inventory | `inventory/stores.logic.ts:172` | `scheduleIiWdvRate` divided by `costPaise`: a zero-cost (donated) asset or a zero useful life gave a `NaN`/`Infinity` WDV rate. | Fixed: rate 0 | `src/inventory/stores.logic.spec.ts` "zero-cost" |
| D-16 | Low | Inventory exports | `inventory/inventory.records.ts:549,591,1064,1112` | "Raised on" / "Date" export columns take the UTC date of `createdAt`. | Open: format with the tenant zone | - |

Checked and found correct: library late fine (closed weekdays and calendar holidays skipped, grace in open days,
cap, integer paise, `library/fines.ts`), weighted-average / FIFO issue cost with no paisa left on an empty store,
FEFO draw order, GST split (odd paisa to SGST, IGST across states), Companies Act Schedule II SLM/WDV with
pro-rata and residual floor, Income-tax block WDV with the 180-day half rate and section 50 gain, MSMED 45-day due
date, hostel vacate settlement arithmetic (deposit less damages and dues, negative net = owed), mess rebate.

## Linways comparison

| Module | Feature | Linways | ZYNETIX | Verdict |
| --- | --- | --- | --- | --- |
| Hostel | Rooms, beds, allotment, waitlist, transfer, vacate settlement | Yes | Yes, with category points, bed holds, ledger posting | Ahead |
| Hostel | Mess bills, rebates, diet system | Basic | Fixed / per-day / diet system, leave rebate, kitchen stock import | Ahead |
| Hostel | Gate passes, parent approval, QR gate log | Yes | Yes, plus curfew and late-entry rules, parent app history | Ahead |
| Hostel | AISHE / NAAC hostel figures | Unknown | Built (occupancy fixed in D-08) | Ahead |
| Transport | Routes, stops, fees, pickup reports | Yes | Yes, distance fare slabs, pro-rata, RFID boarding, handovers | Ahead |
| Transport | Bus pass with validity | Yes | Yes (validity fixed in D-02) | Par |
| Transport | Live GPS | Yes | Adapter built, no live vendor verified | Behind |
| Library | Circulation, fines, reservations, MARC, OPAC | Yes (Koha) | Yes, holiday-aware fines, SIP2 bridge | Par |
| Library | RFID self-issue hardware | Yes | Protocol bridge only, no hardware verified | Behind |
| Inventory | Stores, FIFO / weighted average, batches, expiry | Basic | Built | Ahead |
| Procurement | Indent, PO, GRN, GST, MSME due dates, rate contracts | Yes | Built | Par |
| Assets | Register, Companies Act and IT Act depreciation, AMC, warranty | Basic | Built | Ahead |
| Governance | Rule registry with four-eyes approval and dated versions | No | Built (date bug fixed in D-01) | Ahead |
| Governance | Committees, minutes sign-off, actions | Yes | Built | Par |
| IQAC / NAAC | SSR / AQAR criterion metrics, DVV | Yes (flagship) | Built, official-template match unverified | Behind |
| NIRF | Data capture and score estimate | Yes | Built (indicative, benchmarks settable) | Par |

Closed in this pass: D-01 to D-10 and D-15. Tests run: `transport-rules.spec.ts` (8 pass; the 2 new cases failed first), e2e `hostel-pass` and `transport-pass` (21 pass), e2e `governance-pass`, `inventory-pass`, `hostel-depth`, `governance-access` (37 pass), API build `tsc -p tsconfig.build.json` clean. No new feature surface was added; the gaps marked Behind need real vendors or a
domain reviewer.

## ERP-wide QA sweep

Status at the hard stop: the sweep ran on the demo DB `zynetix_audit_qa_demo` (API :4471, ERP dev :3471). The
server-side route x role matrix had covered **97 of the ~350 static routes** when the session was stopped; the
Playwright browser pass (console errors, failed requests, error states, blank pages, sideways scroll, raw i18n keys,
broken links at 1280px and 390px) did not start. Re-run in full with:

```
ERP_URL=http://localhost:3471 API_URL=http://localhost:4471 OUT=/tmp/final-qa CONCURRENCY=3 \
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node apps/erp/scripts/final-qa.mjs
```

(`BROWSER=0` for the matrix only, `MATRIX_FROM=<matrix.json>` to go straight to the browser pass; the report lands in
`OUT/report.md` with the full table and every browser issue.)

Findings so far:
- No route returned a server error, a Next error page, a 403 or a 404 for any role in the part of the matrix that ran
  (0 error / denied / not-found cells).
- Teacher (`deepa.nair`), student and parent are redirected on every ERP route (`/auth/end?reason=denied`): by design,
  they use the Teacher, Student and Parent apps (`canUseErp`, `apps/erp/src/lib/access.ts:199`). The HoD is the
  teaching role the ERP serves.
- Role gating matches the menu: the accountant opens Accounts but is redirected from Academic audit, Academic
  planning and Accreditation; the HoD is redirected from Accounts and from Academic structure and settings.
- Setup notes: the API build needs `NODE_OPTIONS=--max-old-space-size=6144` and a built `packages/shared`; the
  Soundarya seed needs `SECRETS_ENCRYPTION_KEY` (it stores connector settings) or it stops with a 503.
- Open (QA-01, Medium): finish the remaining matrix routes and the browser pass; fix what it reports.

Route x role matrix (server-side request with each role's session; ok = 200, redir = redirected, 403/404/ERR as shown):

| Route | admin | principal | hod | teacher | accountant | student | parent |
|---|---|---|---|---|---|---|---|
| `/` | ok | ok | ok | redir | ok | redir | redir |
| `/academics` | ok | ok | ok | redir | ok | redir | redir |
| `/academic-audit` | ok | ok | ok | redir | redir | redir | redir |
| `/academics/planning` | ok | ok | ok | redir | redir | redir | redir |
| `/academics/structure` | ok | ok | redir | redir | redir | redir | redir |
| `/academics/settings` | ok | ok | redir | redir | redir | redir | redir |
| `/account/password` | ok | ok | ok | redir | ok | redir | redir |
| `/account/security` | ok | ok | ok | redir | ok | redir | redir |
| `/accounts` | ok | ok | redir | redir | ok | redir | redir |
| `/accounts/bank` | ok | ok | redir | redir | ok | redir | redir |
| `/accounts/reports` | ok | ok | redir | redir | ok | redir | redir |
| `/accounts/settings` | ok | ok | redir | redir | ok | redir | redir |
| `/accreditation` | ok | ok | ok | redir | redir | redir | redir |
| `/accreditation/iqac` | ok | ok | ok | redir | redir | redir | redir |
| `/accreditation/my-evidence` | ok | ok | ok | redir | redir | redir | redir |
| `/accreditation/my-tasks` | ok | ok | ok | redir | redir | redir | redir |
| `/admissions` | ok | ok | redir | redir | redir | redir | redir |
| `/admissions-tools` | ok | ok | redir | redir | redir | redir | redir |
| `/admissions/applications` | ok | ok | redir | redir | redir | redir | redir |
| `/admissions/broadcasts` | ok | ok | redir | redir | redir | redir | redir |
| `/admissions/cycles` | ok | ok | redir | redir | redir | redir | redir |
| `/admissions/campaigns` | ok | ok | redir | redir | redir | redir | redir |
| `/admissions/depth` | ok | ok | redir | redir | redir | redir | redir |
| `/admissions/enquiries` | ok | ok | redir | redir | redir | redir | redir |
| `/admissions/enrolment` | ok | ok | redir | redir | redir | redir | redir |
| `/admissions/entrance` | ok | ok | redir | redir | redir | redir | redir |
| `/admissions/office` | ok | ok | redir | redir | redir | redir | redir |
| `/admissions/interviews` | ok | ok | redir | redir | redir | redir | redir |
| `/admissions/online-test` | ok | ok | redir | redir | redir | redir | redir |
| `/admissions/returns` | ok | ok | redir | redir | redir | redir | redir |
| `/admissions/partners` | ok | ok | redir | redir | redir | redir | redir |
| `/admissions/reports` | ok | ok | redir | redir | redir | redir | redir |
| `/admissions/seats` | ok | ok | redir | redir | redir | redir | redir |
| `/ai/audit` | ok | ok | redir | redir | redir | redir | redir |
| `/ai` | ok | ok | redir | redir | redir | redir | redir |
| `/analytics` | ok | ok | ok | redir | ok | redir | redir |
| `/ai/evals` | ok | ok | redir | redir | redir | redir | redir |
| `/alumni` | ok | ok | redir | redir | ok | redir | redir |
| `/analytics/campaigns` | ok | ok | redir | redir | redir | redir | redir |
| `/assets` | ok | ok | redir | redir | redir | redir | redir |
| `/assessment-tools` | ok | ok | ok | redir | redir | redir | redir |
| `/assets/amc` | ok | ok | redir | redir | redir | redir | redir |
| `/attendance/eligibility` | ok | ok | ok | redir | redir | redir | redir |
| `/attendance` | ok | ok | ok | redir | redir | redir | redir |
| `/attendance/governance` | ok | ok | ok | redir | redir | redir | redir |
| `/attendance/leave` | ok | ok | ok | redir | redir | redir | redir |
| `/attendance/mark` | ok | ok | ok | redir | redir | redir | redir |
| `/attendance/qr-review` | ok | ok | ok | redir | redir | redir | redir |
| `/attendance/register` | ok | ok | ok | redir | redir | redir | redir |
| `/attendance/reports` | ok | ok | ok | redir | redir | redir | redir |
| `/attendance/student` | ok | ok | ok | redir | redir | redir | redir |
| `/attendance/unmarked` | ok | ok | ok | redir | redir | redir | redir |
| `/audit` | ok | ok | redir | redir | redir | redir | redir |
| `/billing` | ok | ok | redir | redir | redir | redir | redir |
| `/books` | ok | ok | redir | redir | ok | redir | redir |
| `/budgets` | ok | ok | redir | redir | ok | redir | redir |
| `/boards` | ok | ok | ok | redir | redir | redir | redir |
| `/canteen` | ok | ok | redir | redir | redir | redir | redir |
| `/campus-life` | ok | ok | ok | redir | redir | redir | redir |
| `/calendar` | ok | ok | ok | redir | ok | redir | redir |
| `/canteen/operations` | ok | ok | redir | redir | redir | redir | redir |
| `/careers` | ok | ok | ok | redir | redir | redir | redir |
| `/cast` | ok | ok | ok | ok | ok | ok | ok |
| `/classes` | ok | ok | ok | redir | redir | redir | redir |
| `/chat` | ok | ok | ok | redir | ok | redir | redir |
| `/communication` | ok | ok | ok | redir | redir | redir | redir |
| `/communication/credits` | ok | ok | redir | redir | ok | redir | redir |
| `/communication/consent` | ok | ok | ok | redir | redir | redir | redir |
| `/communication/log` | ok | ok | ok | redir | redir | redir | redir |
| `/connectors` | ok | ok | redir | redir | redir | redir | redir |
| `/communication/suppressions` | ok | ok | ok | redir | redir | redir | redir |
| `/conversations` | ok | ok | redir | redir | ok | redir | redir |
| `/course-files` | ok | ok | ok | redir | redir | redir | redir |
| `/courses` | ok | ok | ok | redir | redir | redir | redir |
| `/course-registration` | ok | ok | ok | redir | redir | redir | redir |
| `/courses/insights` | ok | ok | ok | redir | redir | redir | redir |
| `/curriculum` | ok | ok | ok | redir | redir | redir | redir |
| `/curriculum/equivalences` | ok | ok | ok | redir | redir | redir | redir |
| `/curriculum/readmission` | ok | ok | ok | redir | redir | redir | redir |
| `/department` | ok | ok | ok | redir | redir | redir | redir |
| `/delegations` | ok | ok | ok | redir | ok | redir | redir |
| `/department/plan` | ok | ok | ok | redir | redir | redir | redir |
| `/department/syllabus` | ok | ok | ok | redir | redir | redir | redir |
| `/departments` | ok | ok | redir | redir | redir | redir | redir |
| `/devices` | ok | ok | redir | redir | redir | redir | redir |
| `/diary` | ok | ok | ok | redir | redir | redir | redir |
| `/documents` | ok | ok | redir | redir | ok | redir | redir |
| `/documents/id-cards` | ok | ok | redir | redir | ok | redir | redir |
| `/documents/issued` | ok | ok | redir | redir | ok | redir | redir |
| `/documents/templates/wording` | ok | ok | redir | redir | ok | redir | redir |
| `/documents/templates` | ok | ok | redir | redir | ok | redir | redir |
| `/documents/vault` | ok | ok | redir | redir | ok | redir | redir |
| `/early-alerts` | ok | ok | ok | redir | redir | redir | redir |
| `/dpdp` | ok | ok | redir | redir | redir | redir | redir |
| `/early-years` | ok | ok | ok | redir | redir | redir | redir |
| `/evaluation` | ok | ok | redir | redir | redir | redir | redir |
| `/evaluation/desk` | redir | ok | ok | redir | redir | redir | redir |
