# Academics and timetable: completeness against Linways and Camu (checklist sections 3 and 18, the module brief)

Audit of `docs/research/MODULE_DEPTH_CHECKLIST.md` section 3 (and the mentoring lines of section 18),
`TIMETABLE_ACADEMICS_DETAILED_SPEC.md` and the academics pass brief, exercised against the Soundarya seed (API on a
seeded database at port 4320, the ERP at port 3320 driven by Playwright at 1280px and 390px, the four Flutter apps'
widget tests). **Before** is the branch when this pass started; **after** is now.

Status words: **Have** (built and tested before), **Built** (missing, partial or broken before, built now),
**Deepened** (existed, gaps closed now). Migrations: `0200_timetable_versions`, `0201_teaching_logs`.
New API tests: `services/api/test/academics-pass.e2e.spec.ts` (10 workflows, figures worked by hand in comments) and
`src/timetable-studio/solver.spec.ts` (7). ERP `src/lib/timetable-studio.test.ts` (3). Flutter: student
`timetable_test.dart` (6), parent `timetable_test.dart` (3), teacher `diary_test.dart` (3), board
`todays_plan_test.dart` (+2).

Counts (42 items): before **24 Have, 9 Partial, 8 Missing, 1 Broken**; after **42 Done** (24 Have, 18 Built or Deepened).

## Academic structure

| Item | Before | After | Evidence |
|---|---|---|---|
| Departments, programmes, classes, courses on the record kit | Have | Have | `structure.records.ts`, `departments.records.ts` |
| Regulations / schemes (versioned) | Have | Have | `planning.records.ts` regulations, `curriculum/versions.records.ts` |
| Course master: credits, L-T-P-S, type, marks split | Have | Have | `subjects` (0153) |
| Semesters/terms and presets | Have | Have | `scheduling` term presets, `terms` |
| Sections, lab/tutorial batches | Have | Have | `student_batches`, Timetable → Setup → Batches |
| Elective / open-elective baskets, CBCS credits, prerequisites | Have | Have | `elective_baskets`, `subject_requisites`, `registration-rules.ts` |
| Choice-based registration: window, seat caps, ranked preferences, merit / FCFS / weighted allotment, waitlist, advisor approval | Have | Have | `course-registration.e2e.spec.ts` |
| ABC / SWAYAM credit transfer | Have | Have | `credit_transfers` |
| Faculty allocation with mid-semester hand-over and lab batches | Have | Have | `faculty_allocations` |

## Academic calendar

| Item | Before | After | Evidence |
|---|---|---|---|
| Holidays, exams, events by audience; drafts; publish to students | Have | Have | `calendar.controller.ts` |
| Working-day count by month | Have | Have | `/v1/academic-planning/working-days` |
| Working days against the university profile's minimum | Missing | Built | `RulesSchema.calendar` (UGC/KSHEC 90 a semester, 180 a year; school boards 220), per-term and year compliance with days short; test "checks the calendar against the university's working-day minimum" (103 days in the odd semester) |
| Event propagation | Partial: families were told, nothing else changed | Built | a published holiday cancels substitutions and special classes on its days (teachers told), reports periods that will not meet, emits `calendar.event_published`; test "...a holiday cancels the substitutions and special classes on it" |
| Compensatory working days honoured everywhere | Partial: teacher's day only | Built | board's current period, families' week, diary meetings and registers follow `working_day_swaps` |

## Timetable

| Item | Before | After | Evidence |
|---|---|---|---|
| Bell schedule / period structures | Have | Have | `period_structures` |
| Automatic generation | Partial: one class, theory only, frequency rules | Built | `timetable-studio/solver.ts`: many classes at once, L-T-P demand, teacher daily/weekly/consecutive limits, unavailability, smallest fitting room of the right kind, labs as consecutive blocks not crossing a break, batches side by side, combined classes, elective baskets in parallel for all classes with distinct teachers and rooms, locked periods kept, reasons for anything not placed; unit spec (7) and e2e "generates a week for two classes under every constraint" (17 periods) |
| Faculty unavailability | Missing | Built | `faculty_unavailability` (record kit: add, import, export, history, bin), teacher sets own, HOD their department; refused by the live editor (`TIMETABLE_TEACHER_UNAVAILABLE`) and avoided by the generator |
| Manual drag-and-drop with clash detection | Partial: form editor with server clash refusal | Built | Studio week grid (HTML5 drag, red cell over a clash computed in the browser, server re-check on drop, lab blocks and parallel electives move together, keyboard Move dialog, lock, remove); `PATCH …/slots/:id` with `dryRun`; e2e "checks a drag and drop" |
| Versioning and publishing | Missing | Built | `timetable_versions` / `timetable_version_slots`: draft → published → superseded / discarded, copy and roll back, diff against live, publish archives old periods (history kept), sets elective periods on course offerings, notifies teachers and families, `timetable.version_published` event; e2e "publishes the version…" |
| Room, faculty and class views | Have | Have | live `/timetable` and studio view-by |
| Printable PDFs | Partial: a list of rows | Built | landscape week grid PDF with signature lines for a class, teacher or room, from a version or live (`tt-grid` download) |
| Room and lab capacity | Have | Deepened | capacity and lab-kind checked per period and per batch in versions |
| Substitution (from the attendance pass) | Partial: the teacher's day and the board ignored covers | Deepened | Teacher App day lists periods covered for a colleague and ones covered by one; the board's current period and Today panel follow substitutes; families see the substitute; e2e "shows a substitute everywhere" |
| Workload reports | Have | Deepened | per-version teaching load (here, elsewhere, limit, busiest day, lab periods) beside the workload report against norms |

## Teaching records and course delivery

| Item | Before | After | Evidence |
|---|---|---|---|
| Year plan and lesson plan per period, HOD approval | Have | Have | `plans.controller.ts` |
| Teaching diary / work-done log | Missing | Built | `teaching_logs` (0201): per period or special class, topics, delivery, against plan (as planned / ahead / behind with a reason / no plan), substitute flag, source; written from ERP, Teacher App, board; e2e "keeps the teaching diary…" |
| Syllabus coverage % from the diary | Partial: topics marked by hand | Built | diary topics mark `topic_coverage`; coverage 3 of 4 = 75% in the test |
| Hours taken vs hours allotted register | Missing | Built | `GET /v1/teaching-log/register`: L-T-P × weeks allotted (68), scheduled 36, to date 30, held, logged, pace; hand-checked in the test |
| Syllabus completion by department, HOD review | Partial: coverage report only | Built | `GET /v1/teaching-log/completion`, ERP Teaching diary (completion, entries with bulk review and remark, course register), `academics.teaching_log_reviewed` event, teacher notified |
| Course file document pack for NBA | Partial | Deepened | cover with credits, L-T-P, faculty; NBA checklist (10 items); CO statements; teaching diary section |

## Mentoring (section 18)

| Item | Before | After | Evidence |
|---|---|---|---|
| Mentor allocation (bulk), meeting logs, confidential notes | Have | Have | `mentoring.e2e.spec.ts` |
| At-risk flags, slow/advanced learners, interventions | Have | Have | `mentoring/risk`, learner rules, intervention plans |
| Parent visibility, mentor channel, reports | Have | Have | `mentoring-extra.controller.ts` |

## Smart board and apps

| Item | Before | After | Evidence |
|---|---|---|---|
| Today's timetable on the smart board | Missing | Built | `GET /v1/classroom/today` (room's day with substitutes and specials, the teacher's day, current period); board Today's plan section; board widget tests |
| Today's timetable in the Teacher App | Have | Deepened | substitutions, batch, diary state on the period card |
| Topic coverage from the board | Have | Deepened | Books marks topics; "Save to diary" writes the period's entry with them (`POST /v1/classroom/teaching-log`) |
| Teacher App diary | Missing | Built | `diary_screen.dart`, `diary_test.dart` |
| Student timetable view | Missing (a "Coming soon" tile) | Built | More → Timetable: week by day, batch and elective filtered, substitutes, extras, holidays, compensatory days; `timetable_test.dart` |
| Parent timetable view | Missing | Built | per child under More; `timetable_test.dart` |
| Student and parent calendar | Have | Have | `CalendarScreen` in both apps |

## Hardening

- Every new endpoint has a role check and runs under the tenant's row-level security; tests show a teacher refused
  creating or publishing versions (403), a parent refused the register (403), another institution seeing no versions,
  unavailability or diary entries and getting 404 on ids. Bodies and queries go through zod (bad times, days, ranges,
  "both times or neither" → 400).
- Lists page on the server (versions `page/pageSize`; unavailability and diary on the record kit).
- Dates are IST via the tenant timezone; the diary refuses future dates and periods that do not meet that day.
- Authorization docs regenerated (`docs/security/AUTHZ_MATRIX.md`, `docs/product/role-matrix.md`).

## Demo data (Soundarya)

`services/api/src/db/soundarya/academics-pass.ts`: Bangalore University SEP profile, the college bell schedule, L-T-P
hours on BCom Sem 3, a Tally lab in batches B1/B2, an open elective basket, faculty allocations, three teachers'
unavailability, v1 (the live timetable, published) and a generated v2 draft (29 periods, everything placed, no
clashes), about 1,900 diary entries for the term-3 classes (≈400 reviewed by the Commerce HOD, ≈160 behind plan with
reasons), recent periods left to log.

## Screens checked

`apps/erp/scripts/academics-qa.mjs` loads 10 pages at 1280px and 390px (headings, no error state, no console errors,
no sideways scroll): all 20 pass. Screenshots: `docs/demo/screens/academics/01`–`08`.

## Not built / notes

- The generator is a greedy constraint solver with spreading heuristics, not an optimiser: when a week is over-full it
  reports what it could not place (with the reason) rather than searching every arrangement. Lab batches are
  preferred side by side but may land on different days when labs or teachers are busy.
- Most Soundarya courses have no linked syllabus in the content library, so completion shows coverage for the four BCom
  Sem 3 courses that do; the others show periods and diary entries only.
- `governance-access`, `welfare` and `depth-campus` e2e failures are date-dependent but belong to delegations,
  discipline/counselling/welfare and library; left as instructed. `authz-matrix` still flags two pre-existing public
  fee gateway-return routes.
