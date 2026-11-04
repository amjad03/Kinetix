# Academics and examinations audit (agent C)

Date: 2026-11-04. Scope: Attendance, Academics/timetable, Examinations and results, OBE, LMS, Research, Placements.
I traced code paths rather than relying on the completeness docs. I fixed problems where I could and wrote a test first. No migrations were needed, so 0226 and 0227 are still unused.

Commit: `258cab7` (on this worktree branch, not pushed).

## Summary

| Severity | Found | Fixed | Open |
|---|---|---|---|
| Critical | 0 | 0 | 0 |
| High | 3 | 3 | 0 |
| Medium | 3 | 1 | 2 |
| Low | 4 | 0 | 4 |

## 1. Examinations and results (SGPA/CGPA, grace, grade points)

| ID | Sev | Area | File:line | Issue | Status | Test |
|---|---|---|---|---|---|---|
| EX-1 | High | Rounding | services/api/src/exams/grading.ts:92 | `round()` added `Number.EPSILON` before scaling. Above 1, EPSILON is smaller than one ULP and has no effect, so the code rounded down any tie that binary floating point stores just below the true value. In the 0-100 range, 557 of the 10,000 x.xx5 values came out wrong: 4.015 gave 4.01, and an SGPA of 8.135 (162.7 credit points over 20 credits) gave 8.13. Subject percentages, `percentOver10` grade points, SGPA, CGPA, the aggregate percentage, the CGPA-to-percentage equivalent and grace all use this helper. | Fixed: the scaled value is trimmed to 15 significant digits, then rounded half up (sign aware). | `grading.spec.ts` "audit: rounding..." checks every x.xx5 from 0 to 100, plus SGPA and CGPA ties |
| EX-2 | Medium | Rounding | services/api/src/exam-cell/exam-cell.logic.ts:8 | `round2` had the same bug. It feeds late-fee slabs, remuneration, revaluation-change percentages and attendance-linked internal marks. | Fixed: now uses the shared helper. | exam-cell specs pass |
| EX-3 | Low | Grace | services/api/src/affiliation/maths.ts:69 | In `applyGrace`, grace lifts the total but not the external component's `weighted` value. A marks card that prints the external marks beside the grace shows the external marks as still short. The result itself is correct. | Open. Fix: add a `graceApplied` note on the external component, or print grace as its own column. | - |

Verified correct: the CGPA comes from unrounded credit points, not from rounded SGPAs (`grading.ts:199`). Failed credits stay in the denominator unless the profile says otherwise. Best-of-N assessments and the external-absent rule (no grace) work as intended. Marks entry is refused once the assessment is locked or its paper's results are processed, published or locked (`marks/marks.controller.ts:330-333`). Moderation and reopen go through `assertEditable`.

## 2. OBE (CO/PO attainment)

| ID | Sev | Area | File:line | Issue | Status | Test |
|---|---|---|---|---|---|---|
| OBE-1 | High | Rounding | services/api/src/obe/attainment.ts:93 | The attainment levels, the `percentage` CO method (for example 2.135 shown as 2.13), PO and PEO levels and gaps all used the same faulty EPSILON rounding. A tie at the target level could flip "met" to "not met". | Fixed: uses the shared helper. | `grading.spec.ts` (`obeRound(2.135)`), `attainment.spec.ts` passes |
| OBE-2 | Medium | Attainment formula | services/api/src/obe/attainment.ts:314 (`questionCoMarks`), obe/obe.service.ts:197-205 | Papers with internal choice ("answer any 5 of 7") are not supported. A question the student skipped counts as 0 out of its maximum, which pushes CO attainment down for every student. Linways' OBE handles choice groups. | Open. Fix: add `choiceGroup` and `attemptAny` to the question sheet. In `questionCoMarks`, count only the best `attemptAny` questions of each group (or the ones attempted) in `max`. Needs one column, so one migration. | - |
| OBE-3 | Low | Defaults | services/api/src/obe/attainment.ts:262 | When `poMethod` is missing, `programOutcomeAttainment` falls back to `co_weighted`, but the documented default is `course_weighted`. Callers that pass `withDefaults(...)` are not affected. | Open. Fix: use `?? 'course_weighted'`. | - |

## 3. Attendance

| ID | Sev | Area | File:line | Issue | Status | Test |
|---|---|---|---|---|---|---|
| AT-1 | High | Threshold rounding | services/api/src/attendance-governance/attendance-rules.ts:21 | `attendancePct` rounded to one decimal, and the eligibility checks (`eligibility.ts`, exam-cell applications, course registration, promotion) compared that rounded value. So 599 of 799 sessions (74.97%) showed as 75.0% and passed a 75% hall-ticket rule. | Fixed: the value is now cut off, not rounded (exact integer arithmetic). 74.97% shows as 74.9% and is short. | `grading.spec.ts` "never rounds attendance up..." |
| AT-2 | High | Wrong scope | services/api/src/attendance-governance/eligibility.ts:84 | `overallAttendance` counted every attendance record the student ever had. A semester 3 student's exam eligibility, attendance-linked internal marks and registration checks pooled semesters 1 and 2 as well. | Fixed: only records from classes in the same academic year and term as the student's current class count. A student moved between sections mid-term keeps that term's records. | attendance-governance, attendance-pass, exam-cell, course-registration and exams e2e suites pass |
| AT-3 | High | Biometric ingest | services/api/src/integrations/http.ts:5, devices.controller.ts:200 | The comms pass added a global `text/plain` body parser for Amazon SNS (`setup.ts:42`). It drains the request stream, so `readRawBody` read an empty body. Every eSSL/ZKTeco ADMS punch was answered `OK: 0` and dropped. xAPI non-JSON statements and SIP2 lines were also exposed. `attendance-pass.e2e` was failing at the base commit. | Fixed: `readRawBody` uses the copy the parser kept (`rawBody`, Buffer or string body) and still enforces the size cap. | `attendance-pass.e2e.spec.ts` face terminal / ADMS test now passes |
| AT-4 | Medium | Leave and duty | services/api/src/db/schema.ts:549 | The only statuses are present, absent, late and excused. On-duty (OD) and medical leave both become "excused", which leaves them out of the denominator. Many universities count OD as attended, so the percentage differs from their rule. | Open. Fix: add `on_duty` to the enum (migration). Add a profile switch `attendance.onDutyCounts: 'present' or 'excluded'` and use it in `attendancePct`. | - |
| AT-5 | Low | IST date | services/api/src/attendance-governance/eligibility.ts:16 | The default `today` is the UTC date. Between 00:00 and 05:30 IST, the dated rule `attendance/exam-eligibility` is looked up for yesterday. | Open. Fix: use `localParts(clock.now(), tenant.timezone)` for the date. | - |
| AT-6 | Low | Repeaters | eligibility.ts:55 (`subjectAttendance`) | Subject attendance is not scoped by term. A detained student who attends the same subject again has both attempts pooled. | Open. Fix: apply the same year and term filter as AT-2 for regular sessions, and leave it off for backlog sessions. | - |

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
| OBE internal-choice questions in attainment | Yes | No (OBE-2) | Behind |
| NBA SAR / NAAC criteria from OBE | Yes (flagship) | Built, not yet checked against official templates | Behind (unverified) |
| Attendance eligibility, condonation with fee, shortage alerts | Yes | Yes; term-scoped and never rounded up after AT-1/AT-2 | Par |
| On-duty as attended (configurable) | Yes (typical) | No (AT-4) | Behind |
| Biometric (eSSL/ZKTeco/COSEC) live push | Yes | Yes (working again after AT-3) | Par |
| Face/AI attendance | Listed | Not built (deliberate, DPDP) | Behind (deliberate) |

Closed in this pass: correct SGPA, CGPA and attainment rounding (EX-1, EX-2, OBE-1), attendance eligibility correctness (AT-1, AT-2), and live biometric ingest (AT-3).

## Tests run

- `vitest src/exams/grading.spec.ts src/obe/attainment.spec.ts src/exams/exam-ops.logic.spec.ts src/exam-cell`: 4 files, 52 tests passed (includes the new audit tests).
- e2e on `zynetix_test_audit_acad`: `attendance-governance`, `attendance-pass`, `exam-cell`. At first `attendance-pass` had 1 failure (the AT-3 test, failing at the base commit), with 28 passed. After the fix, `attendance-pass`, `lms-pass`, `course-registration` and `exams`: 4 files, 49 tests passed.
- API `tsc --noEmit`: clean. ERP untouched (no frontend changes), so ERP tsc not run.
