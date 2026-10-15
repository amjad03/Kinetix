# OBE completeness audit

An independent check of the OBE module (commit 62e4192, guide `docs/assessment-obe.md`) against everything it was asked to do. Each requirement was checked in the code and then exercised: through the API tests, and on the Soundarya demo seed with the API (port 4310) and the ERP (port 3310) driven by Playwright.

Sources: the owner's specification; `docs/requirements/OBE_ACCREDITATION_DETAILED_SPEC.md`; `docs/research/MODULE_DEPTH_CHECKLIST.md` section 7; the Linways OBE features in `docs/research/LINWAYS_GAP_ANALYSIS.md` (CO-PO mapping, question-wise marks, course plan mapped to COs, rubric assessment, course file, PEO attainment); NBA SAR criteria 2 and 3 (Tier I, Tier II, management, pharmacy); NAAC 2.6.

**Before** is what commit 62e4192 had. **After** is this audit's result. Everything that was Partial or Missing has been built: migration `0185_obe_audit`, tests in `services/api/test/obe-audit.e2e.spec.ts` and `src/obe/attainment.spec.ts`, and strings in English, Hindi and Kannada (`apps/erp/src/i18n/messages/obe-audit.ts`).

## How it was exercised

- API tests: `obe.e2e`, `obe-depth.e2e`, `obe-flagship.e2e`, `obe-audit.e2e`, `src/obe/*.spec.ts` and the RLS tests: 6 files, 53 tests, all pass.
- Seed probe (`principal`, `iqac`, `hod.commerce`, `student.bcom` on the Soundarya seed): dashboard counts for each role, BCom policy (60% threshold, levels at 60/50/40% of students, CIE:SEE 40:60, direct:indirect 80:20), course and programme attainment, PO tree, PAM, batches, trend, approvals, targets, exit surveys, every OBE record kit list, and all 13 OBE documents (course file, course and programme attainment reports, batch report, NBA SAR, NAAC 2.6 in PDF and Excel, and the targets sheet) returning files.
- Playwright on the ERP as principal, head of department and IQAC: all 16 OBE pages and the 7 tabs of a course open without errors. The course plan was ticked and saved through the page and read back from the database. The targets sheet was downloaded and uploaded through the page ("95 rows and no errors"). The PEO-PO matrix shows each PEO's attainment (BCom: 2.62, 2.31 and 2.37). The paper editor shows difficulty and its spread. The verification queue lists the 8 actions waiting. A student's Course outcomes tab shows 27 COs.
- Flutter: Teacher app `obe_flagship_test.dart` (10 tests) and Student app `outcomes_test.dart` (5 tests) pass.

Exercising the module found three faults, now fixed. First, the ERP download proxy did not allow the targets sheet, so the Download button returned "Unknown download". Second, the PEO-PO strength cells were too narrow to show their value. Third, every course's course plan was empty, because there was no unit-CO mapping at all.

## Matrix

| # | Requirement | Before | After | Evidence |
| --- | --- | --- | --- | --- |
| 1 | Frameworks per programme: NBA engineering Tier I and II, management, pharmacy, NAAC 2.6 (and the institution's own) | Done | Done | `OBE_FRAMEWORKS` in `schema-obe-flagship.ts`; `PUT /v1/obe/programs/:id/framework`; flagship test "sets frameworks…" |
| 2 | Default rules: 80/20 direct/indirect, 40/60 CIE/SEE, 60% threshold, levels at 40/50/60% of students | Done | Done | `DEFAULT_ATTAINMENT_CONFIG` (`obe/attainment.ts`); seed probe shows the BCom policy with these values |
| 3 | Rules configurable per institution, programme and course, with history | Done | Done | `obe_policies` versions with the year they apply from; flagship test "switches methods and keeps policy history" |
| 4 | Alternative NBA methods (CO: students reaching the threshold, class average, average percentage; PO: course-weighted, CO-weighted, course average) | Done | Done | `CO_METHODS`, `PO_METHODS`; same test |
| 5 | Targets per CO and PO/PSO per year, with history | Partial: grid only, nobody named as setting a target | Done | Excel download and upload (checked first, then saved), "set by" and date on each target, fill blanks; `targets.xlsx` endpoints; audit test "downloads the targets as Excel…"; Playwright round trip |
| 6 | Question-wise CO and Bloom tags on tests, assignments, quizzes, labs and SEE | Done | Done | `assessment_questions` and `assessment_question_cos`; LMS quizzes counted when their questions carry a CO (`includeLms`); SEE exam papers; flagship test "sets a question paper…" |
| 7 | Question difficulty (Linways and checklist 7) | Missing | Done | `assessment_questions.difficulty` (0185); paper editor column and spread; course file "Difficulty spread"; SAR 2.2.2 "Difficulty levels"; audit test "tags questions with a difficulty…" |
| 8 | Rubric-level evidence for labs, projects and vivas (spec 6) | Missing | Done | Copy a paper from a marking rubric: each criterion becomes a question worth its top level, then tagged to COs (`POST …/questions/copy {rubricId}`); ERP "Copy from" menu; audit test "turns a marking rubric into a paper…" |
| 9 | Marks entry: ERP grid, Teacher app, Excel | Done | Done | `QuestionMarks.tsx` grid (paste from Excel, AB, Ctrl+S); `question-marks.xlsx` download and upload; Teacher app `PUT /v1/obe/assessments/:id/question-marks` (`apps/teacher/lib/core/api.dart`) |
| 10 | SEE totals shared out by the paper's blueprint | Done | Done | `blueprintShares`, `seeApportion`; flagship test "computes attainment from … apportioned SEE totals" |
| 11 | Vision and mission to PEOs to POs and PSOs to COs, with presets | Done | Done | `presets.ts` (NBA engineering, NBA 2025 engineering, management, pharmacy, UGC LOCF, BCom, BBA and BCA PSOs); `POST /programs/:id/presets` |
| 12 | Statements as a record kit list (add, edit, Excel import and export, history, guarded delete) | Partial: a plain editor with delete only | Done | `obe-statements` entity (`obe.records.ts`); delete refused while COs or the PEO-mission matrix use the statement; audit test "keeps the vision, mission…"; Outcomes and targets page |
| 13 | PEO-mission mapping | Done | Done | `peo_mission_map`; depth test "keeps the PEO-mission matrix…" |
| 14 | PEO-PO/PSO mapping and PEO attainment (spec 13, Linways) | Missing | Done | `peo_po_map` (0185); `GET/PUT /v1/obe/programs/:id/peo-po`; `peoAttainment` (unit test); PEOs and mission page; programme report section 6 "PEO attainment"; seed fills the matrix; audit test "maps PEOs to POs…" |
| 15 | Bloom verb checker with suggestions | Done | Done | `bloom.ts`; `POST /v1/obe/check-co`, `suggest-co`; depth and flagship tests |
| 16 | CO approval teacher → head of department → OBE coordinator → IQAC, with returns, comments and history | Done | Done | `workflow.ts`; flagship test "runs CO approval…"; Teacher app approvals (Flutter test) |
| 17 | Course and programme articulation matrices with justification | Done | Done | `co_outcome_map.justification`; course file "Justification of the mappings"; PAM in the programme report and SAR 3.1.3 |
| 18 | Course plan: units and topics mapped to COs (spec hierarchy "Units/Topics", Linways) | Missing | Done | `obe_unit_cos` (0185); `GET/PUT /v1/obe/subjects/:id/units`; course workspace "Course plan" tab; course file syllabus table with a COs column and the COs no unit serves; seed maps library-linked courses; audit test and Playwright save |
| 19 | Gap analysis to actions to action-taken report with evidence | Done | Done | `gaps` endpoint raises actions; ATR in the programme report and SAR 3.3.3 |
| 20 | Action workflow identified → assigned → in progress → evidence → done → verified (spec 10) | Partial: no verification step | Done | `verified_by/at/note` (0185); "Verify the action taken" (IQAC or principal, not the owner, needs the action taken, its date and evidence or a re-measurement); stage column; "waiting for verification" filter and home tile; ATR "Verified" column; audit test "closes the action-taken report…" |
| 21 | Year-on-year and batch trends | Done | Done | `/attainment/trend`, `/batches`, batch report; Trends and batches page |
| 22 | Content beyond the syllabus | Done | Done | `obe-gaps` kind `beyond_syllabus`; SAR 2.1.2 table |
| 23 | Course file PDF | Done | Done | `course-file.pdf/.xlsx` (seed probe: 161 KB PDF) |
| 24 | Course, programme and batch reports in PDF and Excel | Done | Done | seed probe: all return files; flagship test "exports the course file…" |
| 25 | NBA SAR criteria 2 and 3 | Partial: one layout for every framework, current year only | Done | Tier II numbering (2.1.1, 2.1.2, 2.2.2); Tier I adds 2.1.2 structure and 2.1.3 components (2.1.4 gaps); management reports criteria 3 and 4; CO and PO attainment for CAY, CAYm1 and CAYm2; question papers with higher-order marks share; audit test "builds the SAR for the framework…" |
| 26 | NAAC 2.6.1 to 2.6.3 | Done | Done | `naac-2-6.pdf/.xlsx` (seed probe 170 KB PDF) |
| 27 | Student CO attainment in the Student app and on the ERP student profile | Done | Done | `GET /v1/obe/students/me/outcomes` (6 courses for `student.bcom`); profile tab (Playwright: 27 COs); Student app `outcomes_test.dart` |
| 28 | Course exit, programme exit, alumni and employer surveys feeding indirect attainment, with a minimum number of responses | Done | Done | `obe_surveys.min_responses`, `indirectAttainment`; flagship test "delivers course and programme exit surveys…"; seed has all four kinds |
| 29 | Role dashboards with heat maps and pending work | Partial: no count of actions waiting for verification | Done | `GET /v1/obe/dashboard` scoped by role (principal 94 courses, head of commerce 30); course × CO and programme × PO heat; "to verify" on the actions tile |
| 30 | Record kit depth on every OBE list | Partial: statements were not a kit list | Done | `obe-statements`, `obe-actions` (with the verify action), `obe-gaps`, `obe-assignments`, `obe-surveys`, `obe-cos`: meta, list, filters, Excel export; import where records are entered by hand |
| 31 | Outcome lifecycle draft → review → approved → active → retired; approved outcomes change only by a new version | Done | Done | `co_sets.status` and `review_stage`; the matrix freezes on activation (obe test "versions COs…") |
| 32 | Historical reports reproducible after changes; every sensitive change audited | Done | Done | snapshots keep the rules used; `audit()` on every write, including `obe.peo_po.saved`, `obe.course_plan.saved`, `obe.action.verified` (counted in the audit test) |
| 33 | Coverage and data-completeness indicators, OBE readiness | Done | Done | dashboard `noCos`, `untagged`, `marks`; `GET /programs/:id/readiness` |
| 34 | Skill and SDG mapping of courses (checklist 7) | Done (skills module) | Done | `sdg_tags` on subjects (`skills/sdg.controller.ts`), seeded |
| 35 | Accreditation workspace: cycles, criteria, evidence, readiness, exports (spec 12) | Done (accreditation module) | Done | `services/api/src/accreditation` (frameworks, metrics, evidence repository, readiness, templates) |
| 36 | Tenant isolation | Done | Done | RLS on `peo_po_map` and `obe_unit_cos`; both in `TENANT_TABLES` (RLS test passes); another institution gets 404 (audit test) |

## Left as they are

- The course plan maps units (chapters) to COs. It needs a course linked to its syllabus in the content library. On the demo seed this happens only when the library has been imported. Without the library the tab explains this, and the course file says no syllabus is linked.
- PEO attainment is worked out from POs through the matrix, the usual NBA practice. Direct PEO surveys (an alumni survey on PEOs, three to five years after graduation) can be run as an alumni survey, but they do not feed the PEO figure.
