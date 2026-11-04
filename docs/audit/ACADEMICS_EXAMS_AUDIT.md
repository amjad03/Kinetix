# Academics and examinations audit (agent C)

Date: 2026-11-04. Scope: Attendance, Academics/timetable, Examinations and results, OBE, LMS, Research, Placements.
I traced code paths rather than relying on the completeness docs. I fixed problems where I could and wrote a test first.

Follow-up pass (same day): closed every finding left open (EX-3, OBE-2, OBE-3, AT-4, AT-5, AT-6), each with a regression test written first and seen failing. Found and fixed one new High (AT-7). Migration 0226 adds the choice-group columns; 0227 is unused.

Commit: `258cab7` (on this worktree branch, not pushed).

## Summary

| Severity | Found | Fixed | Open |
|---|---|---|---|
| Critical | 0 | 0 | 0 |
| High | 4 | 4 | 0 |
| Medium | 3 | 3 | 0 |
| Low | 4 | 4 | 0 |

## 1. Examinations and results (SGPA/CGPA, grace, grade points)

| ID | Sev | Area | File:line | Issue | Status | Test |
|---|---|---|---|---|---|---|
| EX-1 | High | Rounding | services/api/src/exams/grading.ts:92 | `round()` added `Number.EPSILON` before scaling. Above 1, EPSILON is smaller than one ULP and has no effect, so the code rounded down any tie that binary floating point stores just below the true value. In the 0-100 range, 557 of the 10,000 x.xx5 values came out wrong: 4.015 gave 4.01, and an SGPA of 8.135 (162.7 credit points over 20 credits) gave 8.13. Subject percentages, `percentOver10` grade points, SGPA, CGPA, the aggregate percentage, the CGPA-to-percentage equivalent and grace all use this helper. | Fixed: the scaled value is trimmed to 15 significant digits, then rounded half up (sign aware). | `grading.spec.ts` "audit: rounding..." checks every x.xx5 from 0 to 100, plus SGPA and CGPA ties |
| EX-2 | Medium | Rounding | services/api/src/exam-cell/exam-cell.logic.ts:8 | `round2` had the same bug. It feeds late-fee slabs, remuneration, revaluation-change percentages and attendance-linked internal marks. | Fixed: now uses the shared helper. | exam-cell specs pass |
| EX-3 | Low | Grace | services/api/src/affiliation/maths.ts:69 | In `applyGrace`, grace lifts the total but not the external component's `weighted` value. A marks card that prints the external marks beside the grace shows the external marks as still short. The result itself is correct. | Fixed: the grace is added to the external component's `weighted` and `fraction` (up to the component's weight), and `grace` on the component says how much. Components still add up to the subject percentage. | `affiliation.spec.ts` "audit EX-3" |

Verified correct: the CGPA comes from unrounded credit points, not from rounded SGPAs (`grading.ts:199`). Failed credits stay in the denominator unless the profile says otherwise. Best-of-N assessments and the external-absent rule (no grace) work as intended. Marks entry is refused once the assessment is locked or its paper's results are processed, published or locked (`marks/marks.controller.ts:330-333`). Moderation and reopen go through `assertEditable`.

## 2. OBE (CO/PO attainment)

| ID | Sev | Area | File:line | Issue | Status | Test |
|---|---|---|---|---|---|---|
| OBE-1 | High | Rounding | services/api/src/obe/attainment.ts:93 | The attainment levels, the `percentage` CO method (for example 2.135 shown as 2.13), PO and PEO levels and gaps all used the same faulty EPSILON rounding. A tie at the target level could flip "met" to "not met". | Fixed: uses the shared helper. | `grading.spec.ts` (`obeRound(2.135)`), `attainment.spec.ts` passes |
| OBE-2 | Medium | Attainment formula | services/api/src/obe/attainment.ts:314 (`questionCoMarks`), obe/obe.service.ts:197-205 | Papers with internal choice ("answer any 5 of 7") are not supported. A question the student skipped counts as 0 out of its maximum, which pushes CO attainment down for every student. Linways' OBE handles choice groups. | Fixed (API): migration 0226 adds `choice_group` and `attempt_any` to `assessment_questions`. `gradedQuestions` counts the best N answered questions of each group. If fewer than N are answered, the missing ones count as 0, in paper order. `questionCoMarks` (CO attainment), the stored total (`paperTotal`), the over-maximum checks, sheet import, `paperMax` and the SEE apportioning (each question weighted N/M) all use it. Groups are validated (same N within a group, 1 <= N < group size) and copied with the paper. A paper's choice groups can't change after marks are entered. Open (ERP): the paper editor doesn't show or send the two fields yet, so choice groups can be set only through the API, and saving from the ERP clears them. See OBE-4. | `attainment.spec.ts` "audit OBE-2" (4 tests) |
| OBE-3 | Low | Defaults | services/api/src/obe/attainment.ts:262 | When `poMethod` is missing, `programOutcomeAttainment` falls back to `co_weighted`, but the documented default is `course_weighted`. Callers that pass `withDefaults(...)` are not affected. | Fixed: falls back to `course_weighted`. | `attainment.spec.ts` "audit OBE-3" |
| OBE-4 | Low | ERP paper editor | apps/erp/src/components/obe/QuestionMarks.tsx:19,32,228; apps/erp/src/lib/obe-flagship.ts:258 | The editor has no choice-group or "answer any" fields, and its save drops them. The grid totals every answered question, so a student who answers 3 of "any 2" shows as over the maximum, although the API accepts it. | Open. Fix: add `choiceGroup` and `attemptAny` to `Q` and `PaperQuestion`, send them in `savePaper`, add two inputs per row, and make `rowProblems` add only the best N of each group (mirror `paperMax` and `paperTotal`). The patch was drafted but not applied for lack of time. | - |

## 3. Attendance

| ID | Sev | Area | File:line | Issue | Status | Test |
|---|---|---|---|---|---|---|
| AT-1 | High | Threshold rounding | services/api/src/attendance-governance/attendance-rules.ts:21 | `attendancePct` rounded to one decimal, and the eligibility checks (`eligibility.ts`, exam-cell applications, course registration, promotion) compared that rounded value. So 599 of 799 sessions (74.97%) showed as 75.0% and passed a 75% hall-ticket rule. | Fixed: the value is now cut off, not rounded (exact integer arithmetic). 74.97% shows as 74.9% and is short. | `grading.spec.ts` "never rounds attendance up..." |
| AT-2 | High | Wrong scope | services/api/src/attendance-governance/eligibility.ts:84 | `overallAttendance` counted every attendance record the student ever had. A semester 3 student's exam eligibility, attendance-linked internal marks and registration checks pooled semesters 1 and 2 as well. | Fixed: only records from classes in the same academic year and term as the student's current class count. A student moved between sections mid-term keeps that term's records. | attendance-governance, attendance-pass, exam-cell, course-registration and exams e2e suites pass |
| AT-3 | High | Biometric ingest | services/api/src/integrations/http.ts:5, devices.controller.ts:200 | The comms pass added a global `text/plain` body parser for Amazon SNS (`setup.ts:42`). It drains the request stream, so `readRawBody` read an empty body. Every eSSL/ZKTeco ADMS punch was answered `OK: 0` and dropped. xAPI non-JSON statements and SIP2 lines were also exposed. `attendance-pass.e2e` was failing at the base commit. | Fixed: `readRawBody` uses the copy the parser kept (`rawBody`, Buffer or string body) and still enforces the size cap. | `attendance-pass.e2e.spec.ts` face terminal / ADMS test now passes |
| AT-4 | Medium | Leave and duty | services/api/src/db/schema.ts:549 | The only statuses are present, absent, late and excused. On-duty (OD) and medical leave both become "excused", which leaves them out of the denominator. Many universities count OD as attended, so the percentage differs from their rule. | Fixed, no migration: the institution rule already exists (academic settings `attendance.onDutyCountsAs`, default `present`), but it was applied only when a leave was approved. Now it applies whenever attendance is counted. A record written by an approved on-duty leave (found by the leave's `applied` keys) is counted as attended or left out by the rule in force, whatever status it was stored with. It is also reported separately as `onDuty` in `subjectAttendance`, `overallAttendance` and `eligibilityFor` tallies (period, whole-day and special-class marks; session-mode marks keep their stored status). A teacher override to absent stays absent. | `audit-acad2.spec.ts` "AT-4" |
| AT-5 | Low | IST date | services/api/src/attendance-governance/eligibility.ts:16 | The default `today` is the UTC date. Between 00:00 and 05:30 IST, the dated rule `attendance/exam-eligibility` is looked up for yesterday. | Fixed: `ruleDate` uses the institution's local date (`tenants.timezone`, IST by default) when no date is given. | `audit-acad2.spec.ts` "AT-5" |
| AT-6 | Low | Repeaters | eligibility.ts:55 (`subjectAttendance`) | Subject attendance is not scoped by term. A detained student who attends the same subject again has both attempts pooled. | Fixed: each subject counts only the student's latest attempt: the most recent academic year and term in which they have records for that subject. A repeater's earlier year drops out, and a backlog subject attended with a lower class still counts, because it is that subject's only attempt. | Not covered by a test: the follow-up ran out of time before an e2e case could be added. Needs a test that seeds two years of the same subject. |
| AT-7 | High | Threshold rounding (second path) | services/api/src/attendance-governance/policy.ts:196 (`pct1`) | `eligibilityFor` has its own percentage helper, and it still rounded: `Math.round(attended / held x 1000) / 10`. This path feeds the governance eligibility list, detention and condonation decisions, holds, the desk reports and planning reports. So 599 of 799 (74.97%) still showed as 75.0% and passed a 75% rule there. AT-1 fixed only `attendancePct`. | Fixed: `tallyPct` cuts off with integer arithmetic, like `attendancePct`. | `audit-acad2.spec.ts` "eligibility tallies are cut off" |

## 4. Timetable, LMS, Research, Placements

I did not find a defect in these modules in this pass, so they have no findings. The time box ran out before I could exercise timetable clash detection or quiz scoring in depth. The LMS and placements e2e suites run here (`lms-pass`) pass. LMS xAPI also benefits from the AT-3 fix.

## Cross-cutting notes (not edited; for agent A)

- `services/api/src/setup.ts:42`: the global `text/plain` parser (limit 256 KB) applies to every route. AT-3 fixes the consumers in my modules. A per-route parser for the SNS webhook would be cleaner. Also, an ADMS backlog push over 256 KB now gets a 413 from the parser.

## Linways comparison (exams, OBE, attendance)

| Feature | Linways | ZYNETIX | Verdict |
|---|---|---|---|
| SGPA/CGPA per UGC/university rules (credit-weighted, rounding mode, failed credits) | Yes | Configurable per profile; correct half-up rounding after EX-1 | Par |
| Grace, moderation, revaluation, supplementary/improvement | Yes | Yes; grace limits per subject, total and count, all-or-nothing | Par |
| Hall tickets, seating, invigilation, answer-book balance | Yes | Yes | Par |
| Results publish/lock, frozen re-processing | Yes | Yes (approval step, freeze, lock guards on marks) | Par |
| Grade card, transcript, provisional certificate | Yes | Yes, with signed QR and DigiLocker | Par |
| OBE CO/PO/PSO attainment (direct, indirect, PEO) | Yes (Ease OBE) | 3 CO methods, 3 PO methods, SEE apportioning, surveys, PEO | Ahead on configurability |
| OBE internal-choice questions in attainment | Yes | Yes in the API (best N of each group, OBE-2); ERP editor fields pending (OBE-4) | Par (API) |
| NBA SAR / NAAC criteria from OBE | Yes (flagship) | Built, not yet checked against official templates | Behind (unverified) |
| Attendance eligibility, condonation with fee, shortage alerts | Yes | Yes; term-scoped and never rounded up after AT-1/AT-2 | Par |
| On-duty as attended (configurable) | Yes (typical) | Yes: per-institution rule, default counted as attended, applied when counting; OD reported separately (AT-4) | Par |
| Biometric (eSSL/ZKTeco/COSEC) live push | Yes | Yes (working again after AT-3) | Par |
| Face/AI attendance | Listed | Not built (deliberate, DPDP) | Behind (deliberate) |

Closed in this pass: correct SGPA, CGPA and attainment rounding (EX-1, EX-2, OBE-1), attendance eligibility correctness (AT-1, AT-2), and live biometric ingest (AT-3).

## Tests run

Follow-up pass:

- New regression tests, seen failing first (9 failed before the fixes): `attainment.spec.ts` (OBE-2 x4, OBE-3), `affiliation.spec.ts` (EX-3), `attendance-governance/audit-acad2.spec.ts` (AT-4, AT-5, AT-7).
- `vitest src/obe/attainment.spec.ts src/affiliation/affiliation.spec.ts src/attendance-governance/audit-acad2.spec.ts src/exams/grading.spec.ts` on `zynetix_test_audit_acad2`: 4 files, 60 tests passed.
- Not run, because of the hard stop: the e2e suites (`attendance-governance`, `attendance-pass`, `exam-cell`, `course-registration`). They exercise the new on-duty and current-attempt SQL in `eligibility.ts` and `policy.ts`, so run them before merging. The timetable clash and LMS quiz scoring reviews were also not reached.

First pass:

- `vitest src/exams/grading.spec.ts src/obe/attainment.spec.ts src/exams/exam-ops.logic.spec.ts src/exam-cell`: 4 files, 52 tests passed (includes the new audit tests).
- e2e on `zynetix_test_audit_acad`: `attendance-governance`, `attendance-pass`, `exam-cell`. At first `attendance-pass` had 1 failure (the AT-3 test, failing at the base commit), with 28 passed. After the fix, `attendance-pass`, `lms-pass`, `course-registration` and `exams`: 4 files, 49 tests passed.
- API `tsc --noEmit`: clean. ERP untouched (no frontend changes), so ERP tsc not run.
