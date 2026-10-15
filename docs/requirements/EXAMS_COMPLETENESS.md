# Examinations and results: completeness against Linways (checklist sections 5 and 6)

Audit of `docs/research/MODULE_DEPTH_CHECKLIST.md` sections 5 and 6 and the examinations brief, exercised against the
Soundarya seed (API calls and the ERP pages with Playwright at 1280px and 390px). **Before** is the state of the branch
when this work started; **after** is the state now. Evidence names the code and the test that proves the item.

Status words: **Have** (built and tested before this work), **Built** (missing or partial before, built now),
**Deepened** (existed, gaps closed now), **Partial** (what is still missing is said).

Test files referred to below are in `services/api/test/` unless stated. The new end-to-end file is
`exam-flagship.e2e.spec.ts` (9 tests, fees and analyses worked by hand in its comments).

## Section 5: examinations and evaluation

### Internal (CIA)

| Item | Before | After | Evidence |
|---|---|---|---|
| Assessment scheme per course with weights and best-of-N | Have | Have | `exams/schemes.controller.ts`, `grading.ts` (bestOf), `exams.e2e.spec.ts`; affiliation presets (`affiliation/registry`) |
| Internal mark grid with lock and HOD approval | Partial: submit/verify/lock, reopen only by HOD on their own | Built: teacher asks to unlock with a reason; HOD of the subject's department or controller decides (never the asker); approval reopens; audited; teacher told | `exam-cell/marks-unlock.ts`, `flagship.records.ts` (kit list `marks-unlock-requests`), migration 0188; ERP `/exams/unlock-requests`; Teacher App marks entry menu and `paper_setting_screen.dart`; test "unlocks submitted marks only on the approval…" |
| Normalisation of internal marks to the university maximum | Have | Have | scheme scaling and affiliation `assessment` rules; `exam-cell/internal-marks.ts` |
| Attendance-linked internal marks (slabs) | Have | Have | `exam-cell/internal-marks.ts` attendance slabs; `exam-cell.e2e.spec.ts` |
| Internal mark submission to the university (portal format) | Have | Have | `affiliation/result-sheet.ts`, `/exams/university` |
| CO-wise questions in internal marks | Have (OBE) | Have | OBE question-wise marks (owned by the OBE module; not changed here) |

### Exam setup and conduct

| Item | Before | After | Evidence |
|---|---|---|---|
| Exam types: regular, supplementary, improvement, special, practical, viva | Have | Have | `exam-records.ts` KINDS |
| Exam registration with eligibility (attendance, dues, prerequisites) and fee | Partial: whole-session eligibility, fee as a separate due marked paid by hand | Built: application per subject (this term, backlog, improvement), each subject checked (attendance after condonation, NE on internal marks, prerequisites), whole-application blockers (overdue fees, backlog limit), application number, the fee as an **invoice on the fee account** (paid at the counter, online or in the apps; settles the exam fee and releases the hall ticket), late fee and super-fine slabs, withdraw with invoice cancelled, controller override | `exam-cell/applications.ts`, `applications.logic.ts`, `exam-fees.ts`, migration 0186; ERP `/exams/[id]/applications`; Student and Parent apps "Exam applications"; tests "checks each subject…", "adds the late fee…" |
| Backlog / supplementary / improvement registration | Partial: office-entered supplementary registrations | Built: the candidate chooses failed (backlog) and passed (improvement) subjects at the supplementary rate; registrations feed result processing | test "takes backlog and improvement papers…" |
| Hall tickets bulk issue with blocking and QR | Have | Deepened: an unpaid exam fee and a missing registration hold the ticket; repeaters' tickets list their registered papers | `exams.controller.ts` hall-tickets; tests in `exam-flagship`, `depth-exams.e2e.spec.ts` |
| Exam timetable and clash detection for backlog students | Have | Have | `/v1/exam-sessions/:id/clashes`, `exam-cell.e2e.spec.ts` |
| Seating (mixing, alternate), halls, door notices, charts | Have | Have | `exams/seating.ts`, `exam-registration.controller.ts` seating plan PDFs |
| Invigilation roster by load, swaps, remuneration | Have | Have | `exam-cell.e2e.spec.ts` roster and swap; Teacher App duties |
| Answer-sheet accounting, absentee and malpractice statement per hall | Have | Deepened: hall **attendance (signature) sheet** and **D-form** PDFs per paper and hall | `exam-cell/registers.ts`; ERP `/exams/[id]/registers`; test "prints the attendance sheet, D-form…" |
| Malpractice register with committee decision and penalty | Have | Have | `exam-cell.e2e.spec.ts` |
| Question paper setting: setter, moderator, blueprint (CO/Bloom), multiple sets, scrutiny, secure release | Partial: paper engine with blueprint, scrutiny and timed release; no appointments, no sets per session, no draw | Built: controller appoints setter and moderator per paper (task with due date, remuneration), accept/decline, only the accepted setter makes sets A, B… from the bank, scrutiny only by the appointed moderator, coverage per set (marks by CO, Bloom, unit, difficulty, higher-order share, overlap between sets, blueprint gaps), random draw from locked sets, only the drawn set sealed for release N minutes before the paper, reserves stay sealed | `exam-cell/qp-setting.ts`, `qp.logic.ts`, migration 0187, `question-bank.controller.ts`, `paper-release.controller.ts`; kit list `qp-appointments`; ERP `/exams/[id]/papers`; Teacher App "Paper setting"; test "sets the question paper…" |
| Question bank with Bloom, difficulty, CO, unit, usage | Have | Have | `question-bank.e2e.spec.ts` |
| Online exam with pool, randomisation, timer, auto-grade | Have | Have | `assessment-tools.e2e.spec.ts` (proctoring beyond integrity flags is not built) |

### Valuation

| Item | Before | After | Evidence |
|---|---|---|---|
| False/dummy numbers kept from the evaluator | Have | Have | `evaluation` anonymised scripts, `evaluation.e2e.spec.ts` |
| Valuation camp, bundles, examiners, daily count | Have | Have | `exam-cell/valuation.ts`, `exam-cell.e2e.spec.ts` |
| On-screen evaluation with ink, per-question marks, double and third valuation on deviation | Have | Have | `evaluation.logic.ts` (third valuation), script ink (`assist` seed), `evaluation.e2e.spec.ts` |
| External examiner portal and remuneration | Have | Have | `/examiner`, `migration-results-examiner.e2e.spec.ts` |
| Double entry of marks with mismatch report | Have | Have | `exam-cell.e2e.spec.ts` |

### Post-exam

| Item | Before | After | Evidence |
|---|---|---|---|
| Moderation from result statistics with approval | Have | Have | `exam-office` moderation, `exam-office.e2e.spec.ts` |
| Grace marks by rule and on application, locked once applied | Have | Have | `affiliation/maths.ts` applyGrace, `exam-cell.e2e.spec.ts` |
| Revaluation, retotalling, photocopy with fee and change rule | Partial: fee recorded on the request only | Deepened: the fee is an invoice on the fee account; a request is decided only once paid; turning down an unpaid request cancels the invoice; apps choose the kind | `exams/results.controller.ts`, `exam-fees.ts`; test "puts the revaluation fee on the fee account…"; `exams.e2e.spec.ts` |
| Supplementary/improvement: best-of-attempts, carry-over internal | Have | Have | `exams.service.ts` latestAttempts, attempt policy |
| Withheld results with release | Have | Have | `exam-cell.e2e.spec.ts` |
| Absent vs zero vs malpractice; re-admission; transfer credit; postponement notice | Have | Have | `profileChecks`, `relative-grading-readmission.e2e.spec.ts`, credit transfers, reschedule test |
| Reports: tabulation register, pass % by course and teacher, toppers, analysis by gender/category, exam-fee statement | Have (on screen and CSV) | Deepened: tabulation register PDF; pass % by class, grade distribution, year-on-year comparison | `exam-cell/reports.ts`; ERP results desk registers; test "analyses results by class, grade and year (worked by hand)" |

## Section 6: results, grade cards and documents

| Item | Before | After | Evidence |
|---|---|---|---|
| Grading schemes (absolute, relative, CGPA, boards) | Have | Have | `grading.ts`, `relative-grading.ts`, affiliation registry |
| SGPA/CGPA with rounding and percentage formula on the card | Have | Have | `affiliation/maths.ts`, marks-card contract |
| Result processing: dry run, freeze, publish, rollback, approval | Have | Have | `exam-cell.e2e.spec.ts` |
| Rank list, class/division, repeaters excluded | Have | Have | `exam-cell/reports.ts` ranks, `ranks.ts` |
| Progress report to parents | Have | Have | `progress-report.pdf` |
| Consolidated mark list, grade card, transcript | Have | Deepened: a **marks ledger** of every attempt with the attempt that counts | `academic-docs`, `exam-cell/registers.ts` ledger; ERP registers page |
| Provisional, degree, migration, medium certificates | Have | Have | `academic-docs`, `degrees` |
| Certificate designer, serials, security QR, signature | Have | Have | document engine |
| Online verification | Have | Have | `VerificationPublicController` |
| DigiLocker/NAD push and ABC credit file | Have | Have | `integrations/digilocker.controller.ts`, `integrations.e2e.spec.ts` |
| Duplicate certificate, name/DOB correction | Have | Have | `documents-desk.ts` |
| Results to students and parents with withheld shown | Have | Have | `exam-cell.e2e.spec.ts` publish test; apps results with CO view (`outcomes_screen.dart`) |
| Grade change after publication, versioned | Have | Have | result revisions, `exam-cell.e2e.spec.ts` |
| Reports: result register, distinctions, gold medals, NIRF, pending certificates | Have | Have | `exam-cell/reports.ts` |
| University result import (VTU/BU) and reconciliation | Have | Have | `affiliation/result-sheet.ts`, `/exams/university` |

## Apps

| Item | Before | After | Evidence |
|---|---|---|---|
| Students/parents: timetable, hall ticket download, results, revaluation | Have | Deepened: exam applications (choose backlog/improvement, live fee, application number, invoice, fee status) in both apps; revaluation kind (revaluation, retotalling, photocopy) | `apps/student/lib/features/exams/exam_applications_screen.dart`, `apps/parent/...`; widget tests `exam_applications_test.dart` (both apps) |
| Teachers: invigilation duties, marks entry, valuation queue | Have | Deepened: paper setting appointments (accept, decline with reason), unlock requests (ask from marks entry, withdraw) | `apps/teacher/lib/features/work/paper_setting_screen.dart`; `paper_setting_test.dart`, `marks_test.dart` |

## Record kit

New lists use the record kit: `qp-appointments` (filters, sort, export, history, edit while open, cancel action,
delete only unanswered) and `marks-unlock-requests` (scope: own requests, a head of department's subjects; approve and
turn-down actions; decided requests stay on record). Applications are a per-session desk list with CSV export (the
registration row has a composite key, so it is not a kit entity).

## Demo data (Soundarya)

`services/api/src/db/soundarya/exam-flagship.ts`: application numbers and subjects for the BCom semester 5 session; the
BCom semester 3 supplementary session with six papers, an open window, eight applications (backlog and improvement)
with invoiced fees, half paid at the counter; paper setting with Corporate Accounting sets A and B locked and one drawn
and sealed, Cost Accounting set A with the moderator and B in draft, Financial Management appointed and overdue; two
unlock requests (one waiting, one approved).

## Screens checked

`apps/erp/scripts/exams-qa.mjs` loads 31 exams and results pages at 1280px and 390px: each loads with its heading, no
error state, no sideways scroll. One pre-existing development-only React warning remains on Exam cell > Duties
(missing list key inside the records table toolbar); the page works. Screenshots: `docs/demo/screens/exams/01`–`08`.

## Not built

- Remote proctoring (camera) for online exams; integrity flags exist.
- The applications list is not a record-kit entity (see Record kit).
