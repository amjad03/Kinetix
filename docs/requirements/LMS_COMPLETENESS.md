# LMS and online learning: completeness against Linways, Moodle and the Indian ERPs (checklist section 17 and the pass brief)

Audit of `docs/research/MODULE_DEPTH_CHECKLIST.md` section 17, `LMS_LEARNING_DETAILED_SPEC.md` and the LMS pass brief
(courses and content, SCORM / xAPI / cmi5, assignments with rubrics and a plagiarism hook, quizzes and question banks,
gradebook and OBE, forums with moderation, live classes, learning paths, certificates, analytics, offline use, the
Teacher, Student and Parent apps, NAAC/NBA evidence, the SCORM security finding X1), read in code and exercised
against the Soundarya seed (API on the seeded `zynetix_lms_demo` database, ERP pages in Playwright at 1280px and
390px with `apps/erp/scripts/lms-qa.mjs`), API e2e and app widget tests. **Before** is the branch at `e8e71e5`.

Status words: **Have** (built and tested before), **Built** (missing before, built now), **Deepened** (partial before,
gaps closed now), **Fixed** (broken before). Migrations: `0214_lms_authoring_quiz_live_forum`,
`0215_lms_paths_certificates_xapi`. New tests: `services/api/test/lms-pass.e2e.spec.ts` (23: pure rules, SCORM
isolation 3, cmi5 2, authoring and offline 4, quizzes 3, live 2, forum 2, certificates and paths 2, analytics,
evidence, rubric and plagiarism, other institution; figures worked by hand in comments), the updated SCORM test in
`integrations.e2e`, the production check in `security.e2e`, `apps/erp/src/lib/lms-pass.test.ts` (3),
`apps/student/test/lms_pass_test.dart` (7) and `courses_test.dart`, `apps/teacher/test/lms_test.dart` (4),
`apps/parent/test/courses_test.dart` (+2).

Counts (65 items): before **20 Have, 8 Partial, 33 Missing, 4 Broken**; after **65 Done** (20 Have, 45 Built,
Deepened or Fixed).

## Courses and content

| Item | Before | After | Evidence |
|---|---|---|---|
| One course per class and subject, draft and published, clone for next year, announcements | Have | Have | `lms.controller.ts`, `lms-ext.controller.ts`, lms e2e |
| Modules and ordered items; edit items, rename modules, reorder within and across modules | Partial: add and delete only | Deepened | `PATCH items/:id`, `PATCH modules/:id`, `PUT courses/:id/order` (every module and item once); ERP ↑ ↓ and **Edit**; test "adds a lesson page…" |
| Items linking topics, concept videos, homework, assessments, worksheets, files, PDFs, slides, links, simulations | Have | Have | `checkRef` |
| Lesson pages written in the LMS | Missing | Built | `lms_items.body`, kind `page` (0214); ERP and Teacher App **Add a lesson page**; Student App reads it (also offline) |
| Web links limited to http(s) | Missing: any URL scheme | Built | `WebUrl` refine; test refuses `javascript:` |
| Item completion rules: opened, marked as done, passed | Broken: any item could be ticked off with `completed: true` (a quiz item without taking it) | Fixed | `completion_rule`, `pass_pct` (0214); `items/:id/progress` refuses `completed` on pass items (409); quiz and package results complete their items |
| Release date, prerequisite item, remedial audience (slow learners) | Have | Have | `lms-depth.controller.ts` |
| Courses to finish first (course prerequisites) | Missing | Built | `prerequisite_course_ids`; no self or two-way cycle (400); content locked, progress and offline sync refused until done; test "locks a course until…" |
| Course completion rules (share of items, lowest grade) | Missing | Built | `completion_pct`, `min_grade_pct` (0214), `completionOf`; test 3 of 4 = 75% then 100% |
| Course list in a fixed number of queries | Broken: one manage check per course (N+1), no counts | Fixed | `LmsService.manageable`; items and active learners per course in one query |

## Content standards: SCORM, cmi5, xAPI

| Item | Before | After | Evidence |
|---|---|---|---|
| SCORM 1.2 / 2004 import, player, tracking, attempts report | Have | Have | `scorm.controller.ts` |
| SCORM served from the API origin (SECURITY_AUDIT X1) | Broken (open finding) | Fixed | Separate content host `SCORM_CONTENT_ORIGIN` (required in production, Terraform `content_domain`), `contentHostGuard`, sandboxed files (`sandbox` without `allow-same-origin`, `connect-src` own origin, `frame-ancestors` the player), nonce-CSP player with a sandboxed iframe and `postMessage` from its own frame only, split signed links (content links name no learner and cannot track); zip paths outside the package refused; tests "SCORM on its own sandboxed origin" (3); audit O18 |
| SCORM progress completes the course item (by pass mark or status) | Missing | Built | `package-progress.ts` (`scormOutcome`, `packageItemDone`); test 14/20 not done, 18/20 = 90% done |
| cmi5 import and launch | Missing | Built | `parseCmi5` (first AU, relative url only, moveOn, masteryScore), launch parameters, LMS.LaunchData (0215) |
| xAPI for cmi5 units: one-use fetch, statements, state, CORS for sandboxed units | Missing | Built | `xapi.controller.ts`, `lms_xapi_statements`, `lms_xapi_state` (0215); actor and registration checked; moveOn completes the item; tests "cmi5 over xAPI" (2) |

## Assignments

| Item | Before | After | Evidence |
|---|---|---|---|
| Create, submit with files, late policy, cut-off, attempts, extensions, groups with individual marks | Have | Have | homework module, lms-depth e2e |
| Peer review | Have | Have | `peer-review.controller.ts` |
| Rubric marking | Partial: a rubric could be chosen but marks were typed | Built | `GET homework/:id/rubric`, `PUT homework/:id/rubric-marks` (`rubricMarks`, late penalty applied, `rubric_scores` kept, `rubric_selections` 0214); test 5 of 6 points of 20 = 16.67 |
| Plagiarism check hook | Partial: a teacher had to run the integrity check | Deepened | `plagiarism-hook.ts` on every typed hand-in: similarity against the class (group mates excepted) on both submissions (`similarity_pct` 0214), teacher told over the threshold, `homework.submission_received` / `homework.similarity_flagged` events for an external checker; test 100% and the event |
| Push marks to internal marks; submission compliance report | Have | Have | `assignment-depth.controller.ts` |

## Quizzes and question banks

| Item | Before | After | Evidence |
|---|---|---|---|
| Question bank with CO, Bloom level and difficulty; paper blueprint | Have | Have | `question-bank` |
| Copy bank questions into a quiz | Have | Deepened | difficulty and CO copied (CO attainment reads them) |
| Random draw from a pool, question shuffle, time limit, attempts, auto-submit at close | Have | Have | `quizzes.controller.ts` |
| Option shuffle per attempt | Missing | Built | `option_orders` (0214), answers mapped back (`toOriginal`); test finds "Credit" wherever it is shown |
| Negative marking | Missing | Built | `negative_pct`, question `negative_marks`; blank and short answers lose nothing; attempt never below 0; test 4 − 1 = 3 of 8 |
| Proctoring signals; strict auto-submit | Missing | Built | `lms_quiz_events` (0214), `proctorVerdict`, `flagged`, `auto_submitted`; Student App reports leaving the app; test three violations submit and flag |
| Answer review policy | Partial: right/wrong always returned on submit | Built | `review` never / after submit / after close; `GET quiz-attempts/:id/review` (403 under "never") |
| Auto-marking of choice and short answers, code on the runner, hand marking | Have | Have | Teacher App now marks too |
| Item analysis (difficulty and discrimination) | Have | Have | `quizzes/:id/analysis` |
| Quiz scores to internal marks | Missing | Built | `POST quizzes/:id/push-marks` (best score, absent without attempt, refuses while answers wait for marking or after submission in the register); test 3 marks, 2 absent |
| Quiz list in a fixed number of queries | Broken (N+1 manage check) | Fixed | `manageable`; flagged count added |

## Gradebook and OBE

| Item | Before | After | Evidence |
|---|---|---|---|
| Weighted categories, teacher overrides with reasons, CSV | Have | Have | `lms.service.ts` gradebook |
| Quizzes as a gradebook category | Missing | Built | source `quiz` (0214), best attempt per quiz; test 5 of 10 = 50% |
| Homework and quizzes to internal marks | Partial: homework only | Deepened | see above |
| Quiz results to CO attainment | Have | Have | `obe.service.ts` reads `co_id` |

## Discussions

| Item | Before | After | Evidence |
|---|---|---|---|
| Course forums: threads, replies, pin, lock, hide | Have | Have | `lms-ext.controller.ts` |
| Reply notification to the author | Missing | Built | `lmsTexts.forumReply` (en/hi/kn); test |
| Report a discussion or reply; hold after N reports; teachers told | Missing | Built | `forum_reports` (0214), `POST forum/:id/report`; test |
| Pre-moderation of student posts | Missing | Built | `held` (0214), setting `forumModeration`; held posts visible to the author and teachers only; test |
| Moderation queue: approve, hide, dismiss | Missing | Built | `GET courses/:id/forum/queue`, `POST forum/moderation`; ERP **Moderation** tab, Teacher App |
| Edit own reply within a window, withdraw | Missing | Built | `PATCH forum/posts/:id` (clock-based window), `withdraw`; test 409 after 20 minutes |

## Live classes

| Item | Before | After | Evidence |
|---|---|---|---|
| Online classes from the Zoom/Teams connectors with the participant report as attendance | Have | Have | `meeting-attendance.controller.ts` |
| Live classes of a course on any service (Meet, Zoom, Teams, Jitsi, Webex), class and families told | Missing | Built | `lms_live_sessions` (0214), `providerOf`; https only |
| Join through ZYNETIX; attendance from joins (present, late, absent) confirmed into the period | Missing | Built | `lms_live_joins`, `POST live/:id/join` (15 minutes before to the end), `GET/POST live/:id/attendance`; test late at 12 minutes, written to `attendance_records` |
| Upcoming live classes for students and families | Missing | Built | `GET my-live`; Student App **Join** |

## Learning paths and certificates

| Item | Before | After | Evidence |
|---|---|---|---|
| Learning paths: courses in order, required and optional, for a programme or class | Missing | Built | `lms_learning_paths`, `lms_path_steps` (0215), `pathProgress`; ERP **Learning paths**; test 1 of 2 = 50%, complete |
| Completion certificates for courses and paths, QR verification, revoke | Missing | Built | `lms_certificates` (0215) through the document register (`course_completion_certificate`, serial `CC…`, PDF, public verify valid → revoked); issue to all eligible, self-claim by setting; tests |

## Analytics

| Item | Before | After | Evidence |
|---|---|---|---|
| Engagement per student and per item | Have | Have | `courses/:id/analytics` |
| Students at risk per course with reasons by thresholds | Missing | Built | `GET courses/:id/at-risk` (`riskOf`: inactive, low engagement, low quiz, overdue, missed live; four thresholds in the settings); ERP **At risk** tab, Teacher App; test |
| Institution LMS overview | Missing | Built | `GET overview`; ERP **LMS overview** |
| Mastery and what to practise next; student calendar of deadlines | Have | Have | `recommendations`, `my-calendar` |
| One student's LMS summary for family and mentors | Missing | Built | `GET students/:id/summary` (own family or staff; another family 404) |

## Apps

| Item | Before | After | Evidence |
|---|---|---|---|
| Student: courses with the grade | Have | Deepened | progress bar, item states (done, locked), rule, minutes and size per item |
| Student: lesson pages, **Mark as done**, SCORM/cmi5 lessons, live join from an item | Missing | Built | `courses_view.dart` `LessonPageScreen`, `launchPackage`, `joinLiveClass`; tests |
| Student: offline and low-bandwidth use | Missing | Built | `lms_offline.dart`: bundle kept on the phone (`GET my/offline`, ETag 304 on the API), offline progress queued and synced once (`POST my/progress/sync`, idempotent); test |
| Student: quizzes show negative marking and proctoring rules; leaving the app is reported | Partial: no rules | Deepened | `quizzes_screen.dart`; test |
| Student: certificates and learning paths | Missing | Built | `AchievementsScreen`; test |
| Teacher App: LMS authoring and grading | Missing: no LMS in the Teacher App | Built | `lms_screens.dart`: courses, lesson pages and links, publish, live classes and attendance from joins, at risk, moderation, quiz attempts with flags, hand marking, push to internal marks; tests |
| Parent App: course progress, activity, why a course needs attention, certificates | Partial: grades only | Deepened | `courses_screen.dart`; tests |

## Reports and accreditation

| Item | Before | After | Evidence |
|---|---|---|---|
| NAAC 2.3.2 (teachers using ICT/LMS) and NBA teaching-learning evidence, with CSV | Missing | Built | `GET reports/evidence[?format=csv]`: per teacher courses, e-content by kind, quizzes, live classes, posts, learners reached, the percentage; ERP **NAAC 2.3.2 evidence** with **Download CSV** (`/api/download?kind=lms-evidence`); test |
| Quiz analytics, material usage, assignment compliance | Have | Have | existing reports |

## Settings, strings, hardening, seed

| Item | Before | After | Evidence |
|---|---|---|---|
| LMS rules per institution | Missing | Built | `lms_settings` (0214), `lms-settings.ts` (Zod, defaults, bad values fall back); `GET/PUT settings` (principal, administrator); ERP **Settings** |
| en / hi / kn for every new string | Missing | Built | ERP `lms-pass.ts` area (i18n test passes), Student 45, Teacher 61, Parent 11 arb keys; notifications in three languages |
| Role checks and tenant isolation on every new endpoint, with tests | Missing | Built | e2e: teacher of another class 403, student on staff endpoints 403, other institution 404/empty, parent of another family 404; authz matrix regenerated; one allow-list entry (`/v1/xapi/`, signed credential) |
| Demo data for every screen | Partial | Deepened | seed stage `lms-pass.ts` (see below) |

## Hardening

- Every new route runs under row-level security and has a role check (`LMS_STAFF` and `canManage` for course staff,
  principal/administrator for settings, principal/administrator/head of department for paths and revocation,
  students only for their own attempts, joins and claims); `test/authz-matrix.spec.ts` passes and
  `docs/security/AUTHZ_MATRIX.md` is regenerated. The only new public prefix is `/v1/xapi/` (signed per learner and
  package, one-use fetch), justified in the allow list.
- Bodies and queries are Zod-validated (strict on patches); dates are instants, IST for attendance days; marks are
  exact decimals; an attempt never goes negative.
- Idempotent: offline sync (repeat changes nothing), forum reports (one per member), certificate issue (unique per
  student and course or path), cmi5 fetch (one use), xAPI statement ids, live joins (upsert), push to internal marks.
- No N+1 on the new lists: course and quiz lists, at-risk figures (fixed number of queries per course), completion
  for a whole class, path progress.
- No PII in logs; package content links name no learner.

## Seed (Soundarya)

LMS settings; one SCORM 1.2 package shared by the courses; in each of the 30 courses a lesson page per unit, the
SCORM item (pass at 60%), a closed Unit 1 quiz (negative marking, recorded proctoring; about 550 attempts with
flagged ones and their events) and an open Unit 2 quiz (strict), three live classes (two held with about 1,100 joins,
one tomorrow), about 6,700 progress rows following each student's engagement (so the at-risk lists have names),
discussions with a held post and an open report, completion at 80% with certificates for the first course of each
class (24 issued through the document register), and the "Accounting foundations track" learning path.

## Not done

- A cmi5 course with several assignable units is imported one unit per package (the first AU of `cmi5.xml`).
- Question draws by difficulty mix (for example 4 easy, 4 medium, 2 hard) are not configurable; the pool draws at
  random.
- Webcam or screen proctoring is not offered; the signals are app and page events.
- The Student App downloads the offline bundle in full each time (the API's ETag is not yet used by the app).
- The external plagiarism service itself is not integrated; the hook announces each hand-in for one.
