# ERP PRD V1 coverage audit (2026-10-09)

Source: `KINETIX_COMPLETE_ERP_EDUCATION_OS_PRD_V1.md` (99 numbered sections + appendices), checked against
`claude/kinetix-ecosystem-overview-lpphjn`. Complements `GAP_ANALYSIS.md` (which tracks build waves); this file is
line-by-line against the PRD headings and sub-bullets.

Method: grep of `services/api/src` (controllers, schema), `services/api/migrations`, `apps/erp/src/app`,
`apps/teacher|student|parent/lib`, `apps/board`, `packages`. One evidence path per row. A row is **Built** when
route/table/screen exist for the whole bullet, **Partial** when only a slice exists (the note says what is absent),
**Missing** when no trace was found. This is a static audit: nothing was run, and "Built" is not "verified on
real devices or with real vendors".

Path prefixes: `api/` = `services/api/src/`, `mig/` = `services/api/migrations/`, `erp/` = `apps/erp/src/app/(dashboard)/`,
`T/S/P` = `apps/teacher|student|parent/lib/`.

Other specs in `02_AUTHORITATIVE_PRODUCT_SPECS`: only `ERP/` and `SMARTBOARD/` exist (no mobile spec file). The Smartboard
spec (sections 1 to 22+: launcher, session engine, toolbar, whiteboard, pen/highlighter/eraser, Text AI, Shape AI,
themes, ...) is covered in `GAP_ANALYSIS.md` (all acceptance items built; open: checks on real IFP hardware) and
`docs/product/board-features.md`; it is not re-audited here beyond section 62.

---

## 1-2. North star, platform boundaries

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Experiences: ERP web, Smartboard, Teacher, Student, Parent apps | Built | `apps/erp`, `apps/board`, `apps/teacher`, `apps/student`, `apps/parent` | |
| Separate consoles (Finance/Operations, Quality, Content/Knowledge, AI workspaces) | Partial | `erp/ai/page.tsx`, `erp/obe`, `erp/fees` | exist as ERP desks, not as distinct workspaces/role-switched shells |
| Shared foundations: identity, tenant, RBAC, audit, notification, files, search, event outbox | Built | `mig/0078_event_outbox.sql`, `api/search/search.controller.ts` | outbox is in-process, no broker (decided) |
| Cross-product loops (attendance from board to ERP/apps, quiz to assessment, recording to revision) | Built | `api/recordings/recordings.controller.ts` | |
| Risk signal creates teacher/mentor task | Built | `api/mentoring/mentoring.controller.ts` (`risk`) | |

## 3. Capability model (Institution Capability Engine)

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Institution type (school/college/university) | Partial | `api/db/schema.ts` (`institution_kind`) | only 3 kinds; no PUC, autonomous college, deemed, custom |
| Academic model selector (GRADE_SECTION, PROGRAM_SEMESTER_COURSE, EARLY_YEARS, STREAM_COMBINATION) | Missing | none | no `academicModel` on tenant; model is implied by data |
| Board / university / regulatory framework per tenant | Missing | `api/db/schema.ts` (`programs.curriculumCode` only) | no board/regulation entity on tenant |
| Enabled modules by capability flag | Partial | `api/flags/flags.ts` | only 5 flags (analytics, accreditation, search, classroom analytics, virus scan); modules are not gated by capability |
| Grading model per institution | Built | `api/exams/exams.controller.ts` (`grade-scales`, `result-rules`) | |
| Attendance model per institution | Missing | none | thresholds/modes not configurable |
| Fee model, quality framework, language set, integrations | Partial | `api/fees/fees.controller.ts`, `api/analytics/accreditation.ts`, `api/connectors` | languages en/hi/kn built; fee model and framework not driven by a capability profile |
| Sample configurations (Appendix B) loadable as presets | Missing | none | no preset import |

## 4. Education models, nursery to PG

| Feature | Status | Evidence | Note |
|---|---|---|---|
| 4.1 Nursery: domains, observations, milestones, learning stories, parent updates | Built | `api/school-life/early-years.controller.ts` | |
| 4.2 LKG/UKG: phonics, numeracy, worksheets, activity assessment | Partial | `api/school-life/early-years-framework.ts` | observation + milestones built; worksheets and activity-assessment scoring absent |
| 4.3 Classes 1-5: subject, chapter, topic, outcome, activity, mastery | Partial | `api/content/content.controller.ts` | chapter/topic built; learning-outcome and mastery entities absent |
| 4.4 Classes 6-10: projects, practicals, competency, board-exam prep, promotion | Partial | `api/students/students.controller.ts` (`promotions`) | promotion built; competency tracking, practical marks, board-exam prep, remedial absent |
| 4.5 PUC: stream, combination, practicals, internal marks, entrance readiness | Missing | none | no stream/combination entities (0 hits) |
| 4.6 UG/PG: dept, program, year, term, course, unit, topic, CO, assessment, credits, electives, OBE, projects, internships, placements, research | Built | `api/obe/obe.controller.ts`, `api/course-registration`, `api/placements`, `api/research` | minors/majors/multidisciplinary tracks not modelled |
| 4.7 University: constituent/affiliated institutions, faculty/school, regulation | Missing | none | single tenant = single institution; no affiliation hierarchy or academic regulation entity |

## 5. Institution and organisation management

| Feature | Status | Evidence | Note |
|---|---|---|---|
| 5.1 Institution profile | Partial | `api/db/schema.ts` (`tenants`) | name, timezone, settings only; no legal name, registration, affiliation, accreditation, address, branding fields |
| 5.2 Campus, rooms, departments | Partial | `api/departments/departments.controller.ts`, `api/admin/timetable-admin.controller.ts` (`rooms`) | no buildings/floors/facilities entity; labs only as room kind |
| 5.3 Multi-campus (staff, students, timetable, fee, assets, transport per campus) | Partial | `api/db/schema.ts` (`campusId` on programs, rooms, devices, roles) | campus-specific fee structures and configs absent |
| 5.4 Institution configuration (grading, approvals, comms, privacy, AI policy, content policy) | Partial | `erp/settings/page.tsx` | retention + security policy built; AI policy, communication-channel and privacy toggles absent |

## 6. Identity, access and people

| Feature | Status | Evidence | Note |
|---|---|---|---|
| 6.1 Identity types | Partial | `api/db/schema.ts` (`role_name`, 25 roles; mig 0111 adds `exam_controller`, `examiner`, `quality_officer`, `alumni`) | no external examiner (use `examiner`), mentor (assignment only), accreditation reviewer, university admin roles |
| 6.2 Password, email, mobile OTP, MFA, sessions, refresh tokens | Built | `api/auth/auth.controller.ts`, `api/auth/mfa.controller.ts` | |
| 6.2 Device trust | Missing | none | |
| 6.2 Enterprise SSO/OIDC | Missing | none | deliberately deferred |
| 6.3 RBAC, institution/campus/section scope, data ownership | Built | `api/auth/auth.guard.ts`, `mig/0001_rls.sql` (RLS) | |
| 6.3 Department/program-scoped permissions, delegated access | Built | `api/auth/principal.ts`, `api/delegation/*`, `erp/delegations` | HOD scope; dated, audited, revocable delegation of workflow and leave approvals |
| 6.4 Privacy rules (linked children, restricted counselling/health, finance) | Built | `api/documents/documents.access.ts`, `api/welfare/counselling.controller.ts` | |

## 7. Student master and lifecycle

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Pre-admission states (prospect, enquiry, application, selection, offer) | Built | `api/admissions/enquiries.service.ts` | |
| Admission to enrolment without duplicate record | Partial | `api/admissions/admissions.service.ts` (`applications/:id/enroll`) | no canonical-person dedupe check across tenants/applications |
| Active, promoted, detained, completion, graduation, alumni | Built | `api/students/lifecycle.service.ts` | |
| Side states: withdrawn, transferred, suspended, on leave, expelled | Built | `api/students/lifecycle.service.ts` | |
| Side states: deferred, dropout, deceased | Missing | `api/db/schema.ts` (only a "deferred" string) | no transition rules |
| Student master data (identity, contact, guardian, address, demographics, documents) | Built | `api/students/students.controller.ts`, `api/documents/vault.controller.ts` | |
| Medical, transport, hostel, fee, attendance profiles | Built | `api/school-life/health.controller.ts`, `api/transport`, `api/hostel` | |
| Academic history, learning/skill/outcome profile, projects, internships, placements | Partial | `api/skills/passport.controller.ts`, `api/placements/careers.controller.ts` | prior-school academic history not captured |

## 8. Admissions, CRM and enrolment

| Feature | Status | Evidence | Note |
|---|---|---|---|
| 8.1 Lead source, campaign, counsellor, follow-up, notes, status, next action | Built | `api/admissions/enquiries.service.ts` | |
| 8.1 Lead score | Missing | none | |
| 8.2 Campaigns, UTM, funnel | Built | `erp/admissions/campaigns`, `apps/erp/src/components/dashboard/AdmissionsDashboard.tsx` | |
| 8.2 Landing pages / forms | Partial | `apps/erp/src/app/apply/[slug]` (public form) | form per cycle only; no landing-page builder |
| 8.2 Referral, source ROI | Missing | none | no referral code, no campaign spend/ROI |
| 8.3 Online application, documents, eligibility, application fee, verification, submission | Built | `api/admissions/public-admissions.controller.ts` | |
| 8.3 Correction round | Missing | none | no "send back for correction" state |
| 8.4 Entrance test, schedule, halls, candidate list, hall ticket, score entry, cutoff | Built | `api/admissions/entrance.controller.ts` | |
| 8.4 Online question paper, candidate answering, auto evaluation | Missing | none | scores are keyed in manually |
| 8.5 Merit lists, offers, category quotas | Built | `api/admissions/admissions.controller.ts` (`merit-lists`, `quotas`) | |
| 8.5 Interviews | Missing | none | |
| 8.5 Waitlist | Partial | `api/admissions/admissions.service.ts` | offer expiry exists; ranked waitlist promotion not a separate flow |
| 8.6 Acceptance, student ID, fee assignment, section, enrolment status | Built | `api/admissions/admissions.controller.ts` (`enroll`) | |
| 8.7 Agent/partner channel (profile, leads, commission) | Missing | none | |
| 8.8 Event registration (capacity, fee, QR check-in, feedback, certificate) | Partial | `api/campus-life/events.controller.ts` | public event landing page absent |

## 9. Academic calendar and year

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Academic years and terms/semesters | Built | `api/terms/terms.controller.ts` | |
| Trimesters/quarters | Partial | `api/db/schema.ts` (`academic_terms`) | generic terms, no preset |
| Holidays, working days, exams, events, vacations | Built | `api/calendar/calendar.controller.ts` | |
| Admissions and result dates on calendar | Partial | `api/calendar/calendar.controller.ts` | not auto-fed from admissions cycles / exam publish |
| Multiple simultaneous calendars (institution, campus, program, class, department) | Partial | `erp/calendar` | single tenant calendar with audience tags; no per-campus/program calendars |

## 10. Curriculum management engine

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Entities: program, course, subject, chapter, unit, topic, credits | Built | `api/content/content.controller.ts`, `api/db/schema.ts` | |
| Entities: framework, regulation, stream, combination, learning outcome, competency, elective groups | Partial | `mig/0099_course_registration.sql` (elective groups) | framework/regulation/stream/competency entities absent |
| Prerequisites | Built | `api/course-registration/registration-rules.ts` | |
| Versioning (version, effective date, approved by, supersedes, archive) | Missing | none | curricula are code-keyed; no version rows |
| Curriculum importer (PDF/DOCX/sheet with AI proposal and approve) | Partial | `api/import/import.controller.ts` | CSV templates for students, staff, programs, timetable only; no PDF/DOCX AI extraction or ambiguity flags |
| Institution overrides (terminology, subjects, credits, outcomes) | Partial | `api/obe/obe.controller.ts` | subjects and COs editable; terminology override absent |

## 11. CBCS / CBE course registration

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Course categories (core, elective, open, minor, skill, VAC, audit) | Partial | `api/course-registration/course-registration.controller.ts` | core/elective/open built; minor/major, audit, additional, multidisciplinary types absent |
| Offering, eligibility, preferences, capacity, allocation, waitlist, confirmation | Built | `api/course-registration/course-registration.controller.ts` | |
| Allocation by merit/first-come/priority/custom rule | Partial | `api/course-registration/registration-rules.ts` | custom institution rule not configurable |
| Credit limits, clashes, prerequisites | Built | `api/course-registration/registration-rules.ts` | |
| Fee on registration, credits to transcript | Partial | `erp/course-registration` | transcript uses results; fee-on-registration not wired |

## 12. Class, batch, section management

| Feature | Status | Evidence | Note |
|---|---|---|---|
| School grade/section, class teacher | Built | `api/admin/admin.controller.ts` (`classes`), `api/db/schema.ts` (`sections`) | |
| House | Missing | none | |
| PUC stream/combination sections | Missing | none | |
| College batch/section/semester/offering | Built | `api/db/schema.ts` (`sections`, `course_offerings`) | |
| Transfers, section change, promotion, history | Built | `api/students/students.controller.ts` (`:id/section`, `promotions`, `:id/status-history`) | batch rollover is part of promotion; no separate rollover wizard |

## 13. Timetable and scheduling

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Periods, slots, rooms, subjects, teachers, classes | Built | `api/admin/timetable-admin.controller.ts` | |
| Teacher, room, section collision checks, capacity | Built | `api/admin/timetable-rules.ts` | |
| Subject frequency, lab requirements | Partial | `api/admin/timetable-rules.ts` | lab/room-kind rule only; no frequency constraint |
| Exam slots | Built | `api/exams/exams.controller.ts` (`:id/schedule`) | |
| Substitutes with notifications | Built | `api/timetable/substitutions.controller.ts` | |
| Auto-generation of timetable | Missing | none | manual editor only (not strictly required by PRD) |
| Outputs: student, teacher, room, department, board schedule | Built | `api/teacher/teacher.controller.ts` (`timetable`), `erp/timetable` | |

## 14. Attendance and presence

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Manual, Smartboard marking | Built | `api/teacher/teacher.controller.ts` (`v1/attendance`) | |
| QR attendance | Missing | none | QR exists only for events/passes |
| Biometric (students) | Missing | `api/hr/biometric-csv.ts` (staff only) | |
| AI-assisted attendance (confidence, consent, audit) | Missing | none | deliberately not built |
| Statuses present/absent/late/excused | Built | `api/db/schema.ts` (`attendance_status`) | approved-leave and custom states absent |
| Leave integration | Built | `api/students/student-leave.controller.ts` | |
| Subject-wise / day / month / term / class views | Partial | `erp/attendance`, `erp/reports` | period-level data; no term/semester roll-up screen |
| Corrections, approval, lock, shortage, warnings | Missing | none | upsert last-writer-wins; no lock, no condonation, no shortage warning |
| Parent alerts on absence | Built | `api/notifications/notifications.service.ts` | |

## 15. School-specific academic system

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Early years: observations, milestones, learning stories, parent updates | Built | `api/school-life/early-years.controller.ts` | |
| Primary/secondary: classwork, homework, worksheets | Partial | `api/homework/submissions.controller.ts` | homework built; worksheets/reading/remedial absent |
| School report card (grades, competency, remarks, attendance, co-curricular, promotion status) | Partial | `api/exams/exams.controller.ts` (`marks-card.pdf`) | marks card only; no teacher remarks, co-curricular, behaviour or promotion status on the card |
| Promotion rules, supplementary/compartment, subject-failure policy, approvals, parent communication | Partial | `api/students/students.controller.ts` (`promotions`) | bulk promotion with audit; no rule engine or compartment policy |
| PTM (schedule, slots, parent booking, reschedule, reminders) | Built | `api/school-life/ptm.controller.ts` | PTM notes/action items absent |
| School diary (homework, classwork, announcements, acknowledgements) | Built | `api/school-life/diary.controller.ts` | |
| House system (houses, allocation, points, leaderboard) | Missing | none | |
| Activities: clubs, competitions, points | Built | `api/campus-life/clubs.controller.ts` | sports/culture categories via clubs/events |

## 16. PUC / Class 11-12

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Stream and combination (configurable) | Missing | none | |
| Practical subjects, internal marks, board exam rules | Missing | none | schemes exist (`api/exams/schemes.controller.ts`) but no PUC preset |
| Entrance readiness, career guidance | Partial | `S/features/careers` | careers screens exist; no entrance-readiness tracking |
| Subject-specific attendance | Built | `api/teacher/teacher.controller.ts` (per-period) | |

## 17. Higher-ed academic management

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Departments, programs, semesters, courses, credits, sections | Built | `api/departments`, `api/db/schema.ts` | |
| Course allocation to faculty | Built | `api/course-registration/course-registration.controller.ts` (`me/teaching`), `api/admin/timetable-admin.controller.ts` | |
| Affiliated / autonomous / university-dept / deemed models | Missing | none | no academic-model switch |
| Electives, projects, internships, research | Built | `api/placements/careers.controller.ts`, `api/research` | |

## 18. Lesson planning and course planner

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Year plan, unit/topic plan, proposed vs actual, coverage | Built | `api/plans/plans.controller.ts`, `api/coverage` | |
| Teaching activity, resource, assessment, outcome mapping per plan | Partial | `api/plans/plans.controller.ts` (`lesson-plans`) | outcome (CO) mapping on lesson plan absent |
| Delayed topic and remediation flag | Partial | `erp/department/plan` | variance shown; remediation workflow absent |
| Feeds course file, audit, OBE, board lesson context | Built | `api/course-files/course-files.controller.ts` | |

## 19. LMS and learning management

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Course, module, items, announcements | Built | `api/lms/lms.controller.ts` | |
| Assignment/homework with submission and evaluation | Built | `api/homework/submissions.controller.ts` | |
| Quiz / assessment inside course | Built | `api/lms/lms.service.ts` (assessment items) | |
| Discussion forums | Missing | none | |
| Content types: PDF, PPT, video, link, simulation, virtual lab, worksheet, case study | Partial | `api/lms/lms.service.ts` | worksheet/case-study types absent |
| Student progress, completion, mastery, recommendations, overdue | Partial | `S/features/learn` | completion + overdue built; mastery and recommendations absent |
| Weighted gradebook | Built | `api/lms/lms.controller.ts` (`gradebook`) | |
| Reuse / template across sections | Partial | `api/lms/lms.controller.ts` | course shells per class/subject; no clone-from-previous-year |

## 20. Content and knowledge graph

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Hierarchy subject, chapter, topic, resource | Built | `api/content/content.controller.ts` | |
| Hierarchy: learning outcome, skill, activity, mastery nodes | Partial | `api/skills/skills.controller.ts` | skills mapped to courses/outcomes; no topic-level outcome/mastery nodes |
| Rights metadata and licensing | Built | `api/content/licensing.ts`, `api/platform/content-licenses.controller.ts` | |
| Sources: institution, teacher, government/OER, publishers, simulations | Built | `api/content/phet.controller.ts`, `api/content/concept-videos.controller.ts` | |
| Quest Studio content | Missing | none | external product, not integrated |
| Embeddings / semantic retrieval | Missing | none | deliberately deferred |

## 21. Assessment engine

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Assessment types (formative, summative, internal, external, practical, project, viva) | Partial | `api/exams/schemes.controller.ts` | schemes with components; observation/diagnostic/skill types absent |
| Question types MCQ, short, long, numeric | Built | `api/question-bank/question-bank.controller.ts` | |
| Question types coding, diagram, matching, case study, practical rubric | Partial | `api/code/code.controller.ts` | code runner exists; matching/diagram/case-study types absent |
| Metadata: topic, outcome, Bloom, difficulty, marks | Partial | `api/question-bank/blueprint.ts` | K-level and competency/skill tags absent |
| Rubric | Partial | `api/evaluation/evaluation.controller.ts` (questions config) | per-question marks; reusable rubrics absent |
| Moderation, feedback | Built | `api/marks/marks.controller.ts` (`moderate`) | |
| Reattempt, academic integrity | Missing | none | |
| Board quiz / poll becomes assessment record | Built | `api/polls/polls.controller.ts` | |

## 22. Question bank and paper engine

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Question bank with tags, difficulty, versions | Built | `api/question-bank/question-bank.controller.ts` | |
| Usage history | Partial | `mig/0101_question_bank.sql` (`qb_paper_items`) | stored, no usage report |
| Blueprint (marks, difficulty, outcome distribution) | Built | `api/question-bank/blueprint.ts` | taxonomy/Bloom distribution partly |
| Paper generation, regenerate, PDF, answer key | Built | `api/question-bank/question-bank.controller.ts` | |
| Duplicate detection | Missing | none | |
| Scrutiny workflow, approval, lock | Built | `api/question-bank/question-bank.controller.ts` (`scrutiny`, `lock`) | |
| Secure release to exam controller at set time | Missing | none | lock only, no timed release |
| Past-exam question import | Built | `api/ai/past-exams.ts` | ERP import screen not built (API only) |

## 23. Exam controller

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Exam sessions, calendar/schedule, publication, lock | Built | `api/exams/exams.controller.ts` | |
| Exam declaration / student exam registration, eligibility | Partial | `api/exams/exams.service.ts` | attendance-based eligibility rule not found; registration implicit |
| Hall tickets (photo, QR/barcode) | Partial | `api/exams/documents.ts` | PDF built; barcode/QR on hall ticket not found |
| Hall allocation and seating (batch, roll number, anti-collusion) | Partial | `api/exams/seating.ts` | rule set is basic; anti-collusion pattern not found |
| Invigilation (duty, substitution, reporting) | Built | `api/exams/exam-depth.controller.ts` | duty attendance not recorded |
| Answer script, evaluation, moderation, scrutiny | Built | `api/evaluation/evaluation.controller.ts` | |
| Revaluation | Built | `api/exams/exams.controller.ts` (`revaluations`) | |
| Supplementary / arrears / backlog | Built | `api/exams/exam-depth.controller.ts` | |
| Malpractice | Built | `api/exams/exam-depth.controller.ts` | |
| Lab / viva / practical exam types | Partial | `api/exams/schemes.controller.ts` | components exist; no practical-exam scheduling with examiners |
| Result approval workflow | Partial | `api/workflows/workflows.controller.ts` | generic engine exists; result publish not bound to it |

## 24. Digital / on-screen evaluation

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Script import and pages | Built | `api/evaluation/evaluation.controller.ts` (`scripts`, `pages/:index`) | |
| Scanning hardware, bulk scanner ingest | Missing | none | needs scanner + intake process |
| Anonymisation | Built | `api/evaluation/evaluation.logic.ts`, `scan-sanitise.ts` | dummy numbers; file names naming the student refused; EXIF/PNG text stripped; first-page header band blacked out at upload (PNG only; PDF/JPEG refused when masking is on) |
| Examiner allocation and workload | Built | `api/evaluation/evaluation.controller.ts` (`allocate`) | |
| Question-wise marks, save/resume | Built | `api/evaluation/evaluation.controller.ts` (`marks`) | |
| Annotation on script | Built | `api/evaluation/evaluation.controller.ts` (`annotations`), `erp/evaluation/desk` | tick, cross, comment, highlight as page-relative coordinates per valuation; third valuer and exam cell see earlier rounds read only; freehand ink not built |
| Second valuation, comparison, finalise, lock | Built | `api/evaluation/evaluation.controller.ts` (`second-valuation`, `finalise`) | |
| No-download secure access, audit | Built | `api/evaluation/evaluation.service.ts` | |
| Connect to CO/PO | Partial | `api/obe/attainment.ts` | exam marks feed attainment via assessment map; per-question CO tagging limited |
| ERP examiner desk | Built | `erp/evaluation/desk` | |

## 25. Results, grading, rank, transcripts

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Marks, grades, SGPA, CGPA, credits | Built | `api/exams/grading.ts` | |
| Grade scales and rules configurable per regulation | Built | `api/exams/exams.controller.ts` (`grade-scales`, `result-rules`) | |
| Moderation, grace marks | Built | `api/exams/exam-depth.controller.ts` (`grace`) | |
| Rank, progression, backlog | Built | `api/exams/ranks.ts` | subject ranking absent |
| Normalised marks, distinction class | Partial | `api/exams/grading.ts` | normalisation not found |
| Marksheet, transcript PDFs | Built | `api/exams/results.controller.ts` | |
| Consolidated marks, rank list, subject ranking, progress report PDFs | Partial | `api/exams/exams.controller.ts` (`results.csv`) | CSV only |
| Indic text in PDFs | Partial | `api/exams/documents.ts` | Latin-1 font; Kannada/Hindi names will not render |

## 26. Certificates and credentials

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Templates, bonafide, transfer, conduct, custom | Built | `api/documents/certificates.controller.ts` | |
| Request, approve, issue, bulk issue | Built | `api/documents/certificates.controller.ts` | |
| QR, unique serial, revoke, public verification | Built | `api/documents/public-verify.controller.ts` | |
| Marks card, transcript, passport | Built | `api/skills/passport.controller.ts` | |
| Graduation / convocation | Missing | none | no convocation module |
| Blockchain / wallet-style digital credentials (DigiLocker) | Missing | none | no DigiLocker/NAD push |

## 27. OBE / outcome engine

| Feature | Status | Evidence | Note |
|---|---|---|---|
| PEO, PO, PSO, CO, mapping, matrix | Built | `api/obe/obe.controller.ts` | |
| Direct and indirect attainment, thresholds, weights, targets, levels | Built | `api/obe/attainment.ts` | |
| Formula configurable (not hard-coded) | Built | `api/obe/obe.controller.ts` (`config`) | |
| Matrix colour scale, drill-down | Built | `erp/obe/matrix` | |
| School mode (learning outcome, competency, mastery) | Missing | none | |
| CQI gaps and actions | Built | `api/obe/obe.controller.ts` (`actions`) | |

## 28. Accreditation and quality OS

| Feature | Status | Evidence | Note |
|---|---|---|---|
| NAAC / NBA / NIRF / AISHE packs (CSV, PDF) | Built | `api/analytics/accreditation.ts` | |
| Configurable framework packs (criteria, metrics, owner, target, score) | Partial | `api/analytics/accreditation.ts` | packs are coded, not admin-configurable criteria trees |
| CQI loop (metric, gap, root cause, action, owner, re-measure) | Partial | `api/obe/obe.controller.ts` (`actions`) | root cause and re-measure fields absent |
| Evidence engine (auto from ERP/LMS/exams/placements/surveys/committees) | Partial | `api/obe/obe.controller.ts` (`evidence`) | manual evidence rows; no file upload (noted in GAP); no auto-harvest across modules |

## 29. Course file

| Feature | Status | Evidence | Note |
|---|---|---|---|
| One-click course file with syllabus, CO, plan, coverage, attendance, results, attainment | Built | `api/course-files/course-files.controller.ts` | |
| PDF / audit package, versioning, review | Built | `api/course-files/course-files.controller.ts` (`download`, `review`) | |
| Teacher-app access | Missing | `T/` (0 hits) | web only |

## 30. Academic audit

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Templates, checklists, course/faculty/department/program audits | Built | `api/academic-audit/academic-audit.controller.ts` | |
| Findings, non-conformities, corrective action, closure | Built | `api/academic-audit/academic-audit.controller.ts` | |
| Reference course file/attendance/results/OBE | Built | `api/academic-audit/academic-audit.controller.ts` | |

## 31. Faculty / teacher management

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Profile, employment, designation, department | Built | `api/hr/hr.controller.ts` | |
| Qualifications, skills | Partial | `api/db/schema.ts` (`staff_profiles`) | qualification/skill detail limited |
| Course allocation, workload | Partial | `api/course-registration/course-registration.controller.ts` (`me/teaching`) | no workload (hours) report |
| Training, certifications, professional development | Missing | none | |
| Appraisal | Missing | none | |
| Faculty teaching evaluation (student, HOD, peer, self) | Partial | `api/surveys/surveys.controller.ts` | student survey possible; HOD/peer/self forms and scoring absent |

## 32. HR and employee management

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Employee master, designations, bank, documents | Built | `api/hr/hr.controller.ts`, `api/documents/vault.controller.ts` | |
| Attendance (app, manual, biometric CSV) | Built | `api/hr/hr.controller.ts` | live device integration absent |
| Leave | Built | `api/hr/leave.controller.ts` | |
| Recruitment: openings, applicants, stages | Built | `api/hr/recruitment.controller.ts` | interviews as stage only |
| Offer letter, onboarding checklist, confirmation | Missing | none | |
| Appraisal, training, transfer, exit | Missing | none | |

## 33. Payroll

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Salary structure, components, runs, payslip PDF | Built | `api/hr/payroll.controller.ts` | |
| Statutory (PF, ESI, PT, TDS), LOP | Built | `api/hr/payroll.controller.ts` (`statutory.csv`) | |
| Approvals, lock, reopen | Built | `api/hr/payroll.controller.ts` | |
| Bank file, Tally export | Built | `api/hr/payroll.controller.ts` (`bank-transfer.csv`, `tally.xml`) | |
| Overtime, arrears/revisions | Missing | none | |
| Form 16 / challans | Missing | none | |

## 34. Finance and fee management

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Fee heads, structures, invoices, receipts | Built | `api/fees/fees.controller.ts` | |
| Online gateway (Razorpay) with webhook; offline/counter | Built | `api/fees/fees.controller.ts` (`webhooks/razorpay`), `api/fees/bank-transfers.controller.ts` | |
| Instalments | Partial | `api/fees/fees.controller.ts` | invoices per head; configurable instalment schedule not found |
| Scholarship, concession, refund | Built | `api/finance/scholarships.controller.ts`, `api/finance/finance.controller.ts` (`refunds`) | |
| Fine (late fee) | Partial | `api/library/library.controller.ts` (library fines) | automatic late-fee rule on fee invoices not found |
| Wallet / advance / credit | Partial | `api/hostel/canteen.controller.ts` (canteen wallet) | no general student advance-credit ledger |
| Reconciliation support, finance reports | Built | `api/finance/finance.controller.ts` (`gl`), `erp/gl-export` | gateway settlement reconciliation file import absent |
| Accounting connector (Tally, GL export) | Built | `api/finance/finance.controller.ts` (`gl.xml`) | |
| Budgets, expenses | Built | `api/finance/finance.controller.ts` | |
| Sponsor invoicing, bank-transfer verification | Built | `api/fees/sponsor-billing.controller.ts` | |

## 35. Procurement, inventory, assets

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Requisition, approval, RFQ, quote comparison/award, PO, receipt, invoice, payment status | Built | `api/inventory/inventory.controller.ts` | |
| Inventory: items, stock, issue, return, transfer, reorder | Built | `api/inventory/inventory.controller.ts` | serial/batch tracking absent |
| Asset register, location, allocation, maintenance, disposal | Built | `api/inventory/assets.controller.ts` | |
| Warranty / AMC fields | Partial | `api/inventory/assets.controller.ts` | maintenance-due built; AMC contract tracking minimal |
| Depreciation | Built | `api/inventory/assets.controller.ts` (`gl/depreciation`) | |
| Smartboards as assets linked to rooms | Partial | `api/devices/fleet.controller.ts` | device fleet separate from asset register |

## 36. Library and digital library

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Catalogue, issue, return, fines, members | Built | `api/library/library.controller.ts` | |
| Renew, reservation, damaged/lost | Missing | none | |
| Barcode / RFID | Missing | none | external hardware |
| E-books, digital resources, access log | Partial | `api/content/content.controller.ts` | content library exists; library-specific e-resource register and access log absent |
| Koha / external system | Built | `api/connectors/integrations.controller.ts` (`library/search`) | tested against local stub only |
| Link resources to curriculum topics | Partial | `api/content/content.controller.ts` | |

## 37. Hostel

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Blocks, rooms, beds, occupancy, allotment, transfer, vacate | Built | `api/hostel/hostel.controller.ts` | |
| Waitlist, application, eligibility | Built | `api/hostel/hostel.controller.ts` (`waitlist`) | |
| Warden, visitors, complaints, gate pass, night attendance | Built | `api/hostel/hostel.controller.ts` | |
| Hostel fee, mess linkage | Built | `api/hostel/hostel.controller.ts` (`fees`, `mess`) | |
| Maintenance requests | Partial | `api/hostel/hostel.controller.ts` (`complaints`) | complaints only, no work-order flow |

## 38. Transport

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Vehicles, drivers, routes, stops, assignments, fees | Built | `api/transport/transport.controller.ts` | |
| Documents / compliance expiry, expenses, incidents | Built | `api/transport/transport.controller.ts` | |
| GPS tracking, live bus + ETA, parent notices | Built | `api/transport/transport.controller.ts` (`gps`), `P/features/transport` | needs real GPS source in the field |
| RFID boarding | Missing | none | hardware |
| Student boarding record (manual scan) | Built | `T/features/driver` | |

## 39. Canteen / mess

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Menu, plans, eligibility, subscriptions | Built | `api/hostel/hostel.controller.ts` (`mess`) | |
| Meal attendance, prepaid wallet | Built | `api/hostel/canteen.controller.ts` | postpaid billing absent |
| Vendor, purchase, inventory link | Partial | `api/inventory/inventory.controller.ts` | not linked to canteen consumption |
| Feedback, wastage | Missing | none | |

## 40. Health, wellness, counselling

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Health records, emergency contact, visits, vaccinations | Built | `api/school-life/health.controller.ts` | |
| Consent | Built | `api/consent/consent.controller.ts` | |
| Counselling sessions, confidential notes, restricted access | Built | `api/welfare/counselling.controller.ts` | |
| Mentor vs counsellor separation | Built | `api/mentoring`, `api/welfare` | |
| Retention rules for sensitive data | Partial | `erp/settings/retention-actions.ts` | recordings retention built; health/counselling retention not found |

## 41. Mentoring and early intervention

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Mentor assignment (bulk), sessions, notes, action plans, follow-up | Built | `api/mentoring/mentoring.controller.ts` | |
| Combined risk signals (attendance, assessment, assignments, engagement) | Partial | `api/mentoring/mentoring.controller.ts` (`risk`) | skills and outcome attainment not in the signal |
| Intervention flow to reassessment and outcome | Partial | `api/mentoring/mentoring.controller.ts` (`plans/:id/close`) | support-content assignment and auto reassessment absent |
| No permanent labelling | Built | `api/mentoring/mentoring.controller.ts` | |

## 42. Skills and outcome passport

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Skill engine, mapping to course/outcome/activity | Built | `api/skills/skills.controller.ts` | |
| Evidence, institution verification, revocation | Built | `api/skills/passport.controller.ts` | |
| Passport PDF and public verify | Built | `api/skills/passport.controller.ts` (`pdf`, `verify-passport`) | |
| Knowledge/skills/attitudes, leadership, communication tags | Partial | `api/skills/skills.controller.ts` | KSA category structure not confirmed |

## 43. Projects and collaboration

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Project proposal, team, mentor, milestones | Built | `api/research/research.controller.ts` (`projects`) | research-oriented; student coursework projects not a separate module |
| Files, discussion, review rubric, viva, portfolio | Missing | none | |
| Collaborator discovery, team matching, showcase | Missing | none | |
| SDG mapping of projects | Built | `api/skills/sdg.controller.ts` | |

## 44. SDG and impact

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Tag projects, research, events, internships to SDGs | Built | `api/skills/sdg.controller.ts` | |
| Custom impact framework | Missing | none | UN SDG only |
| Dashboard | Built | `api/skills/sdg.controller.ts` (`dashboard`) | |

## 45. Placement

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Companies, drives, eligibility, rounds, offers | Built | `api/placements/placements.controller.ts` | |
| Student registration/withdrawal, offers respond | Built | `api/placements/placements.controller.ts` | |
| Resume / profile builder | Partial | `S/features/careers` | resume screens exist; no ERP-side profile or file |
| Aptitude / online tests | Missing | none | |
| Stats and reports | Built | `api/placements/placements.controller.ts` (`stats`) | |

## 46. Internship

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Internship, mentor, evaluation, diary, status | Built | `api/placements/careers.controller.ts` | |
| Attendance, certificate on completion | Partial | `api/placements/careers.controller.ts` | diary stands for attendance; auto certificate not wired |
| Map to skills/course/outcomes | Partial | `api/skills/sdg.controller.ts` | SDG yes; course/outcome mapping absent |

## 47. Career guidance

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Career interest, paths, recommendations | Partial | `S/features/careers` | static guidance; not driven by skill profile or AI |
| Resume, portfolio | Partial | `S/features/careers` | |
| Mock interview, aptitude, communication practice | Missing | none | |
| AI career assistant | Missing | none | |

## 48. Research

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Proposal, ethics, projects, scholars, grants, publications, conferences, patents | Built | `api/research/research.controller.ts` | |
| KPIs | Built | `api/research/research.controller.ts` (`kpis`) | |
| Supervisor allocation, thesis/dissertation, viva | Partial | `api/research/research.controller.ts` (`scholars`) | scholar status only; thesis workflow and viva absent |
| Plagiarism check | Missing | none | needs Turnitin/iThenticate or similar account |
| Datasets, DOI import, document upload | Missing | none | |
| University-level research office | Missing | none | |
| Mobile (faculty / student research) | Missing | `T/`, `S/` (0 hits) | web only |

## 49. Alumni

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Directory, batch, career, events, RSVPs | Built | `api/placements/careers.controller.ts` (`alumni`) | |
| Mentoring requests | Built | `api/placements/careers.controller.ts` | |
| Fundraising: campaigns, pledges, donations, receipt | Built | `api/placements/alumni-giving.controller.ts` | tax-exemption (80G) receipt format not confirmed |
| Volunteering, success stories | Partial | `api/placements/alumni-giving.controller.ts` (`volunteering`) | success stories absent |
| Alumni login/portal | Partial | `api/placements/alumni-portal.controller.ts` | `alumni` role and own profile, giving, receipts, volunteering API; no alumni app screens yet |

## 50. Clubs and student life

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Clubs, membership, coordinators, activities, attendance, points | Built | `api/campus-life/clubs.controller.ts` | |
| Certificates | Built | `api/campus-life/clubs.controller.ts` | |
| Student leaders / office bearers, achievements log | Partial | `api/campus-life/clubs.controller.ts` | |

## 51. Committees

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Committees, members, tenure, meetings, agenda, minutes, action items | Built | `api/campus-life/committees.controller.ts` | |
| Evidence, reports | Partial | `api/campus-life/committees.controller.ts` | no file evidence/report pack |

## 52. Events

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Event, venue, registration, capacity, fee, QR check-in, feedback | Built | `api/campus-life/events.controller.ts` | |
| Certificate on attendance | Partial | `api/campus-life/events.controller.ts` | |
| Media gallery | Missing | none | |
| Mobile passes (QR) | Built | `S/features/campus`, `P/features/school_life/event_passes_screen.dart` | |

## 53. Survey and feedback

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Question types (MCQ, rating, free text, yes/no, NPS) | Built | `api/surveys/surveys.controller.ts` | matrix and rank types not confirmed |
| Anonymous / identified, scheduling | Partial | `api/surveys/surveys.controller.ts` | publish/close; automatic scheduling and conditional logic absent |
| Results, export, CO ratings into OBE | Built | `api/surveys/surveys.controller.ts` (`export.csv`, `outcomes`) | |
| Trends, action items | Partial | `erp/surveys` | trend across cycles absent |

## 54. Grievance

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Types, anonymous, SLA, assignment, escalation, rating, reopen | Built | `api/welfare/grievances.controller.ts` | |
| Confidential committees (anti-ragging, ICC/POSH) | Built | `api/welfare/grievances.controller.ts` (`committee-stage`) | |
| Evidence attachments | Partial | `api/welfare/grievances.controller.ts` | via vault; no dedicated evidence UI check |

## 55. Discipline

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Incidents, actions, warnings, appeals, closure | Built | `api/welfare/discipline.controller.ts` | |
| Witnesses, parent involvement | Partial | `api/welfare/discipline.controller.ts` | |

## 56. Documents and records

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Upload, metadata, access control, expiry, preview | Built | `api/documents/vault.controller.ts` | |
| Virus scan | Built | `api/scanning` | |
| Versioning | Missing | none | no version rows |
| OCR | Missing | none | |
| Retention rules (generic) | Partial | `erp/settings/retention-actions.ts` | recordings only |
| Verification | Built | `api/documents/public-verify.controller.ts` | |

## 57. Workflow / e-governance engine

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Definitions, request, approve/reject, resubmit, cancel, inbox | Built | `api/workflows/workflows.controller.ts` | |
| Multi-step sequential approvals | Built | `mig/0102_workflows.sql` | |
| Parallel approval, conditions | Missing | none | |
| SLA, escalation | Partial | `api/workflows/workflows.controller.ts` | no timed auto-escalation job found |
| Forms in workflow | Partial | `erp/workflows` | free-form payload; no form builder |
| Existing flows bound to engine (admissions, scholarships, refunds, certificates, grievance) | Partial | `api/finance/scholarships.controller.ts` | many modules still use their own state machines |

## 58. Communication engine

| Feature | Status | Evidence | Note |
|---|---|---|---|
| In-app and push | Built | `api/push`, `api/notifications/notifications.service.ts` | |
| Internal messages, conversations, broadcasts | Built | `api/messages/messages.controller.ts`, `api/broadcasts` | |
| SMS | Partial | `api/auth/sms-sender.ts` | OTP + absence fallback designed (MSG91); DLT templates not registered |
| Email | Partial | `api/analytics/mailer.ts` | scheduled reports only; no general email channel |
| WhatsApp adapter | Missing | none | needs WhatsApp Business account |
| Templates, audience rules, schedule, retry, read status | Partial | `api/notifications/texts.ts` | read status built; template editor and scheduled sends absent |

## 59. Parent experience

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Attendance, homework, timetable, marks, fees, transport, events, consent | Built | `P/features` (attendance, homework, exams, fees, transport, privacy) | |
| Diary, PTM, early years, health, passport, surveys | Built | `P/features/school_life` | |
| Report card (school) | Partial | `P/features/exams` | marks card only |
| Teacher messages | Built | `P/features/messages` | |
| Behaviour/activities where allowed | Partial | `P/features/school_life` | |
| Visibility driven by policy/config | Partial | `api/parent/parent.controller.ts` | fixed rules, no per-tenant visibility switches |
| Career (PUC), official notices (college) | Built | `P/features/careers`, `P/features/updates` | |

## 60. Student app

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Dashboard, timetable, attendance, learning, homework, results, fees, calendar, messages | Built | `S/features` | |
| Assessments and quizzes | Built | `S/features/learn` | |
| Credits, course registration, passport, internship, placement | Built | `S/features/campus/course_registration_screen.dart` | |
| Research, projects | Missing | `S/` (0 hits) | |
| School: diary, activities, report card | Partial | `S/features/today` | no diary or report card screen in Student app (Parent only) |

## 61. Teacher app

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Dashboard, timetable, attendance, roster, homework, marks, lesson plan, messages | Built | `T/features` | |
| Student insights, AI copilot, recordings, board remote | Built | `T/features/insights`, `T/features/ai` | |
| Exam duties, mentoring, HR (leave/payslip), substitutions | Built | `T/features/work`, `T/features/hr` | |
| Course file, CO/PO view, research, project mentoring | Missing | `T/` (0 hits for course file, research) | CO/PO shows attainment only |

## 62. Smartboard ERP integration

| Feature | Status | Evidence | Note |
|---|---|---|---|
| ERP to board: timetable, class, teacher, students, subject, curriculum, lesson | Built | `api/pairing`, `api/sessions`, `api/teacher/teacher.controller.ts` | |
| Board to ERP: attendance, assessment, homework, recordings, activities | Built | `api/sync/sync.controller.ts`, `api/polls`, `api/recordings` | |
| OBE evidence from board activity | Partial | `api/obe/obe.controller.ts` (`evidence`) | assessment-based; no automatic board-activity evidence |
| No duplicate master data | Built | `api/sync/sync.controller.ts` | |
| Board spec items (launcher, ink, shapes, screen share, device fleet) | Built | `apps/board`, `docs/product/board-features.md` | open: real IFP hardware checks, TURN server, iOS cast |

## 63. Analytics and leadership intelligence

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Principal dashboard (admissions, attendance, fees, HR, placements, grievances) | Built | `api/admin/dashboard.controller.ts`, `erp/components/dashboard` | infrastructure and quality tiles absent |
| HOD dashboard | Built | `erp/department/page.tsx` | |
| Teacher, parent, student progress views | Built | `T/features/insights` | |
| Custom report builder (filters, grouping, calculated metrics, export, schedule) | Built | `api/analytics/custom-reports.controller.ts` | |
| 12-report catalogue, scheduled delivery | Built | `api/analytics/analytics.controller.ts` | |

## 64. AI platform

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Teacher copilot (explain, quiz, lesson plan, homework, board summary) | Built | `api/ai/ai.controller.ts` | |
| Student tutor | Partial | `api/ai/ai.controller.ts` (`explain`) | no persistent tutor with learning history |
| Parent insights | Partial | `P/features` | summaries via student data; no dedicated AI parent assistant |
| Admin copilot, finance, admissions, HR assistants | Built | `api/ai/insights.controller.ts` | aggregates only |
| Quality/accreditation, research, career assistants | Missing | none | |
| Provider-agnostic, routing, cost tracking, prompt versioning, safety | Built | `api/ai/providers.ts`, `api/ai/safety.ts` | |
| RAG, embeddings, citations | Partial | `api/ai/ai.service.ts` (grounding + sources) | keyword/topic grounding; no embeddings (deferred) |
| Local 2-3B models | Missing | none | spec deviation accepted (India-hosted chain) |
| Evaluation harness | Missing | none | |

## 65. AI / RAG context

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Tenant, grade/subject, topic, current lesson context | Built | `api/ai/ai.service.ts` | |
| Learning history, policies in context | Missing | none | |
| Grounded retrieval from approved content | Partial | `api/ai/ai.service.ts` | topic text only; semantic search deferred |

## 66. Payments and billing

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Institution-side fees, invoices, scholarships, refunds | Built | `api/fees`, `api/finance` | |
| Adapter-based gateway (not embedded) | Partial | `api/fees/payment-provider.ts` | provider interface exists; only Razorpay implemented |
| UPI, cards, bank transfer, invoice/PO | Built | `api/fees/bank-transfers.controller.ts` | via Razorpay + manual |
| Kinetix SaaS billing (plans, subscription, usage, renewal, tax) | Missing | none | no tenant subscription/billing |

## 67. Integrations / connectors

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Registry (provider, scopes, health, test, deliveries) | Built | `api/connectors/connectors.controller.ts` | |
| Signed outbound webhooks | Built | `api/connectors/adapters.ts` | |
| Tally / GL | Built | `api/hr/payroll.controller.ts` (`tally.xml`), `api/finance` | file export, not live push |
| Koha, Zoom, Teams, BI export | Built | `api/connectors/integrations.controller.ts` | tested against stubs only |
| WhatsApp, SMS provider connectors | Partial | `api/connectors/connector-types.ts` | MSG91 typed; WhatsApp missing |
| Hardware: biometric, RFID, printers/scanners | Partial | `api/hr/biometric-csv.ts` | CSV only |
| Integrity (plagiarism) | Missing | none | |
| External LMS | Missing | none | |

## 68. Search

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Global search students, staff, courses, content, documents, results | Built | `api/search/search.controller.ts` | trigram |
| Events, fees, messages, knowledge graph in search | Partial | `api/search/search.controller.ts` | not all entity types indexed |
| Permission-aware | Built | `api/search/search.controller.ts` | |
| AI natural-language search | Missing | none | deferred |

## 69. Notification and task engine

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Task records, owner, due, priority, status | Built | `api/tasks/tasks.controller.ts` | |
| SLA and escalation | Missing | none | |
| Audit | Built | `api/common/audit.ts` | |
| Tasks created by modules (approval, intervention, evidence) | Partial | `api/mentoring/mentoring.controller.ts` | some modules create tasks; not universal |

## 70. Audit and compliance

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Audit log with who/what/when/tenant | Built | `api/admin/audit.controller.ts` | |
| Before/after values | Partial | `api/admin/audit.controller.ts` | action + detail; structured before/after not uniform |
| Audit viewer + export | Built | `erp/audit` | |
| AI action audit | Partial | `api/ai/ai.service.ts` | usage log, not full action audit |
| DPDP data-subject export / erasure | Built | `api/dpdp/*`, `erp/dpdp` | JSON+PDF export, correction, erasure with retention rules (blocked or anonymised), grievance officer contact, admin queue; Parent/Student App screens not built |
| Legal sign-off (privacy notice) | Partial | `docs/product/privacy-notice.md` | draft; needs counsel review |

## 71. Multi-tenancy

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Tenant isolation at DB (RLS) | Built | `mig/0001_rls.sql` | |
| Scopes tenant, campus, department, section | Built | `api/auth/principal.ts` | program scope only via department/section |
| Shared SaaS | Built | `docs/architecture/tenancy.md` | |
| Dedicated / on-prem packaging | Missing | none | deliberately deferred |

## 72-73. Data model and events

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Core domains in 72 | Partial | `api/db/schema.ts` (about 330 tables) | absent: Building, Stream, Combination, Regulation, CurriculumVersion/Node, Rubric, Thesis, Dataset, Discussion, Appraisal, AIContext/RetrievalSource tables |
| Versioned, idempotent, retryable events | Built | `mig/0078_event_outbox.sql` | |
| Named events (STUDENT_ADMITTED ... PLACEMENT_OFFERED) | Partial | `api/common` (outbox) | a subset emitted; QUIZ_STARTED, CLASS_STARTED/ENDED, INTERVENTION_CREATED etc. not all emitted |

## 74. Reporting engine

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Dataset, filters, columns, groups, calculations, date range | Built | `api/analytics/custom-reports.controller.ts` | |
| Output table, PDF, CSV | Built | `api/analytics/reports.service.ts` | Excel (xlsx) not found, CSV only |
| Charts in builder | Partial | `erp/reports/custom` | |
| Permission-aware | Built | `api/analytics/custom-reports.controller.ts` | |

## 75. Business rule engine

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Configurable rules (grading, credits, eligibility, quotas, OBE) | Partial | `api/exams/exams.controller.ts` (`result-rules`) | rules are per-domain config |
| Effective date, version, status, author, approver, audit as a generic engine | Missing | none | no rule registry |

## 76. Workflow states and approvals

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Admission states | Built | `api/admissions/admissions.service.ts` | |
| Fee refund states | Built | `api/finance/finance.controller.ts` | |
| Question paper states | Built | `api/question-bank/question-bank.controller.ts` | |
| Result states (draft, moderation, approval, published, locked) | Partial | `api/exams/exams.controller.ts` | publish/lock built; explicit approval step absent |

## 77. File storage

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Object storage, tenant scope, signed access, virus scan, audit | Built | `api/storage`, `api/scanning` | |
| Versions, retention per category | Missing | none | |

## 78-79. Responsive admin, UI

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Desktop-first dense tables, responsive common actions | Built | `apps/erp/src/app` | |
| Mobile approvals/notifications | Partial | `T/features/work` | approvals mobile for leave; not all approval types |
| Command/search bar | Built | `apps/erp/src/components` | |
| Density profiles school vs higher-ed | Missing | none | |
| i18n en/hi/kn | Built | `apps/erp/src/messages` | |

## 80-82. Security, privacy, observability

| Feature | Status | Evidence | Note |
|---|---|---|---|
| MFA, RBAC, RLS, rate limiting, audit, secure files | Built | `api/auth/mfa.controller.ts` | |
| Encryption of sensitive fields at rest | Partial | `api/common/secret-box.ts` | secrets (gateway keys, MFA) encrypted; student/health/payroll columns rely on disk encryption |
| Secrets management, backup, DR | Partial | `docs/operations/backups-and-restore.md` | runbooks exist; restore drill not evidenced |
| Anomaly monitoring | Partial | `infra/monitoring/prometheus-rules.yml` | |
| Child safety, guardian consent, restricted data | Built | `api/consent/consent.controller.ts` | |
| Biometric / face policy | Missing | none | not built by design |
| Logs, metrics, traces, alerts | Built | `docs/operations/observability.md` | |
| Incident management process | Missing | none | |

## 83-88. Deployment, scale, NFR, capability matrix

| Feature | Status | Evidence | Note |
|---|---|---|---|
| SaaS deployment | Built | `docs/operations/deploy.md` | |
| Dedicated / on-prem | Missing | none | deferred |
| Modular monolith, queues, caching | Built | `api/jobs`, `api/redis` | |
| Search infrastructure at scale, partitioning | Missing | none | not justified yet |
| Autosave, idempotency, retries | Built | `api/sync/sync.controller.ts` | |
| Perf budgets per module | Missing | none | |
| Capability matrix (school, PUC, higher-ed, university) | Partial | see sections 3, 4, 16 | school and higher-ed mostly built; PUC and university specifics missing |
| University: affiliated institutions, central exams/valuation, convocation, analytics | Missing | none | |

## 89-90. Golden workflows, roles

| Feature | Status | Evidence | Note |
|---|---|---|---|
| 89.1 School lesson loop | Built | `api/recordings`, `api/homework` | |
| 89.2 College lesson to CO evidence to course file | Built | `api/obe/obe.controller.ts`, `api/course-files` | |
| 89.3 Fee loop to accounting connector | Built | `api/fees`, `api/finance` | |
| 89.4 Risk intervention loop | Partial | `api/mentoring/mentoring.controller.ts` | remedial content and re-measure step manual |
| 89.5 Admission loop | Built | `api/admissions` | |
| 89.6 Placement loop to alumni | Partial | `api/placements` | auto-promotion of placed student to alumni profile not found |
| Role matrix (create/read/update/delete/approve/publish/export/audit per module) | Partial | `api/auth/auth.decorators.ts` | per-controller roles; no documented matrix or exam controller / quality / external examiner roles |

## 91-99, Appendices

Process and narrative sections (agent rules, development order, definition of done, acceptance gates, Soundarya
onboarding, school pilot, differentiators, final principle). Status of the gates that can be checked:

| Gate / item | Status | Evidence | Note |
|---|---|---|---|
| 93 Definition of done: tests, audit, docs per module | Partial | `docs/requirements/GAP_ANALYSIS.md` | e2e exist for new domains; observability/docs per module uneven |
| 94 Offline-supported workflows recover | Built | `api/sync/sync.controller.ts` | board and teacher app |
| 94 Mobile critical daily ops | Built | `apps/teacher`, `apps/student`, `apps/parent` | real-device checks outstanding |
| 95 Soundarya onboarding data (outcome mapping, exams, fees, library, placement, research, quality) | Partial | `docs/requirements/` | import templates only for students, staff, programs, timetable |
| 96 School pilot (Nursery to Class 10, report cards, PTM, diary) | Partial | see sections 4, 15 | report card and house system outstanding |
| Appendix C P0 list (identity ... results) | Built | see sections 6-25 | |

---

# Prioritised Missing / Partial list

Sizes: S = under 2 days, M = 3-10 days, L = more than 2 weeks. Items cite PRD sections.

## A. Needs code

### Priority 1 (blocks the school pilot or a P0/P1 PRD item)

| # | Item | PRD | Size | What is absent |
|---|---|---|---|---|
| 1 | School report card (remarks, co-curricular, attendance, promotion status; PDF + Parent/Student app) | 15, 59, 60 | M | only marks card exists |
| 2 | Capability profile per tenant (academic model, board, module toggles, attendance/fee model, presets from Appendix B) | 3, 5.4 | L | only `institution_kind` + 5 flags |
| 3 | Attendance controls: lock after window, correction with approval, shortage/condonation warnings, term roll-up | 14 | M | upsert only |
| 4 | PUC stream and combination model, practical and internal marks, board-exam scheme preset | 4.5, 16 | L | no entities |
| 5 | Curriculum versioning (effective date, approve, supersede, archive) and AI importer from PDF/DOCX | 10 | L | code-keyed only |
| 6 | Learning outcome / competency / mastery nodes on the knowledge graph (school mode) | 4.3, 20, 27 | L | |
| 7 | Institution profile fields (legal name, registration, affiliation, address, branding) and buildings/floors/facilities | 5.1, 5.2 | M | |
| 8 | Parallel approval, conditions, timed SLA escalation in workflow engine; bind result approval and refunds to it | 57, 76, 69 | M | |
| 9 | Hall ticket QR/barcode, exam registration + eligibility (attendance rule), anti-collusion seating | 23 | M | |
| 10 | Roles: exam controller, examiner, external examiner, quality officer, accreditation reviewer, alumni; delegated access; role/permission matrix doc | 6, 90 | M | |

### Priority 2 (higher-ed depth)

| # | Item | PRD | Size | What is absent |
|---|---|---|---|---|
| 11 | Answer-script annotation, dummy-number anonymisation, scanner intake | 24 | L | |
| 12 | Faculty: appraisal, training/PD, teaching evaluation (student/HOD/peer/self), workload report | 31 | M | |
| 13 | HR: offer letter, onboarding checklist, confirmation, transfer, exit; payroll overtime/arrears, Form 16 | 32, 33 | M | |
| 14 | Accreditation: configurable criteria/metric tree, evidence auto-harvest and file upload, CQI root-cause/re-measure | 28 | L | |
| 15 | Research: supervisor allocation, thesis and viva workflow, datasets, DOI import, document upload | 48 | M | |
| 16 | Mobile gaps: Teacher (course file, CO/PO, research), Student (diary, report card, research, projects) | 60, 61 | M | |
| 17 | House system (houses, allocation, points, leaderboard) | 12, 15 | S | |
| 18 | Admissions: lead score, referral codes, agents and commission, source ROI, correction round, interviews, online entrance test, ranked waitlist | 8 | L | |
| 19 | Library: renew, reservation, damaged/lost, e-resource register and access log | 36 | M | |
| 20 | Documents: versioning, generic retention rules; storage versions | 56, 77 | M | |
| 21 | Business rule engine registry (effective date, version, approver) | 75 | L | |
| 22 | Communication: template editor, scheduled sends, general email channel, quiet hours | 58 | M | |
| 23 | Project collaboration (files, discussion, rubric, viva, portfolio, team matching) | 43 | L | |
| 24 | University model: affiliated institutions, regulations, central exams/valuation, convocation | 4.7, 88 | L | |
| 25 | Sensitive-data retention (health, counselling) and DPDP export/erasure | 40, 70 | M | |
| 26 | Student lifecycle: deferred, dropout, deceased transitions; canonical person dedupe | 7 | S | |
| 27 | Discussions in LMS; reattempts; case-study/matching/diagram question types; duplicate question detection; secure timed paper release | 19, 21, 22 | M | |
| 28 | Pending event names and uniform before/after audit capture | 70, 73 | S | |
| 29 | Canteen feedback and wastage; hostel maintenance work orders; transport RFID boarding record (software side) | 38, 39, 37 | S | |
| 30 | Career: aptitude and mock-interview practice, skill-driven recommendations | 47 | M | |

### Priority 3 (minor)

Excel (xlsx) export in report builder (S); subject ranking and consolidated mark list PDFs (S); student advance-credit ledger and late-fee rule (M); instalment schedules (M); alumni login and success stories (M); media gallery for events (S); AMC/warranty tracking (S); board-activity auto OBE evidence (M); density profiles school vs higher-ed UI (M); perf budgets per module (S).

## B. Needs external setup (vendor accounts, hardware, legal)

| Item | PRD | Needs |
|---|---|---|
| WhatsApp channel | 58, 67 | WhatsApp Business API provider account, template approval |
| SMS DLT registration and sender IDs for absence/fee alerts | 58 | MSG91 DLT templates, entity registration |
| Transactional email provider (SPF/DKIM) | 58 | SES/SendGrid account, domain |
| Plagiarism / integrity checks | 48, 67 | Turnitin / iThenticate contract |
| Biometric devices (students/staff), RFID gates, barcode/RFID library | 14, 36, 38, 67 | hardware purchase and device SDK/CSV format |
| Answer-script scanners | 24 | scanning hardware and process |
| Real GPS source for buses | 38 | GPS hardware or driver-app rollout |
| TURN server and real IFP hardware checks | 62 | coturn deployment, Soundarya classroom panels |
| Koha / Zoom / Teams against live servers | 67 | customer instances, OAuth apps |
| Tally live push (beyond file export) | 34, 67 | customer Tally gateway |
| Indic fonts in server PDFs | 25 | embedded Noto fonts with shaping (licence-free, but engineering plus font choice) |
| Payment gateway beyond Razorpay (adapter for UPI-only, bank APIs) | 66 | merchant accounts |
| SaaS billing (Kinetix plans, tax invoices) | 66 | GST registration, billing provider (or build) |
| DigiLocker / NAD / university credential push | 26 | government API onboarding |
| Quest Studio content | 20 | external product agreement |
| Privacy notice, DPDP consent text, child-safety policy | 70, 81 | legal counsel review |
| Cloud LLM / India-hosted model accounts and eval budget | 64 | provider contracts (self-hosted chain decided) |
| Backup restore drill and DR site | 80, 86 | infra budget and a scheduled drill |

## C. Deliberately deferred (decision on record)

| Item | PRD | Decision |
|---|---|---|
| Semantic search and embedding RAG | 20, 65, 68 | GAP_ANALYSIS: deferred |
| Dedicated / on-prem packaging | 71, 83 | deferred until a tenant asks |
| Enterprise SSO / OIDC | 6.2 | deferred until a tenant asks |
| Event broker (outbox stays in-process) | 73 | owner decision 2026-10-08 |
| Android native board (Kotlin) | Smartboard 5.1 | Flutter kept (ADR 0001) |
| Local 2-3B on-device models | 64 | India-hosted chain replaces it |
| AI/face-based attendance | 14, 81 | not built; needs explicit institution policy and consent design first |
| iOS cast capture and audio in casts | 62 | deferred |
| Offline-alert emails | Smartboard | SMS via MSG91 decided, not built |
