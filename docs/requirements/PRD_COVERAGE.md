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
| Separate consoles (Finance/Operations, Quality, Content/Knowledge, AI workspaces) | Built | `erp/lib/workspaces.ts`, `erp/components/shell/WorkspaceSwitcher.tsx` | five consoles (academic office, finance and operations, quality, content and knowledge, AI) choose which pages the menu lists from the top bar; the API still decides access by role |
| Shared foundations: identity, tenant, RBAC, audit, notification, files, search, event outbox | Built | `mig/0078_event_outbox.sql`, `api/search/search.controller.ts` | outbox is in-process, no broker (decided) |
| Cross-product loops (attendance from board to ERP/apps, quiz to assessment, recording to revision) | Built | `api/recordings/recordings.controller.ts` | |
| Risk signal creates teacher/mentor task | Built | `api/mentoring/mentoring.controller.ts` (`risk`) | |

## 3. Capability model (Institution Capability Engine)

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Institution type (school/college/university) | Built | `api/institution/presets.ts` (`INSTITUTION_TYPES`), `api/institution/setup.controller.ts`, `erp/institution-setup` | seven types (school, PUC college, degree college, autonomous, university, deemed, custom) on `institution_profiles.institution_type`; `tenants.kind` unchanged |
| Academic model selector (GRADE_SECTION, PROGRAM_SEMESTER_COURSE, EARLY_YEARS, STREAM_COMBINATION) | Built | `api/institution/presets.ts` (`STRUCTURE_MODELS`), `erp/institution-setup` | GRADE_SECTION, PROGRAM_SEMESTER_COURSE, EARLY_YEARS, STREAM_COMBINATION and UNIVERSITY_MULTI_INSTITUTION on the profile |
| Board / university / regulatory framework per tenant | Built | `api/institution/setup.controller.ts` (boards), `api/curriculum/frameworks.controller.ts`, `mig/0117` (`school_boards`, `curriculum_frameworks`), `erp/institution-setup` | school boards (CBSE, ICSE, state) with pass rules and one primary; curriculum frameworks (NEP 2020, CBCS) that regulations follow |
| Enabled modules by capability flag | Built | `api/institution/module-gate.interceptor.ts` | a switched-off module answers 403 MODULE_DISABLED on the API too, not only in the menu |
| Grading model per institution | Built | `api/exams/exams.controller.ts` (`grade-scales`, `result-rules`) | |
| Attendance model per institution | Built | `api/institution/setup.controller.ts` (`attendance-overrides`), `api/attendance-governance/eligibility.ts`, `erp/institution-setup` | a programme can set its own threshold and lock window; others follow the institution |
| Fee model, quality framework, language set, integrations | Built | `api/institution/setup.controller.ts`, `erp/institution-setup` | fee model, quality framework and language set live on the profile; integrations stay in connectors |
| Sample configurations (Appendix B) loadable as presets | Built | `api/institution/presets.ts` (`PRESETS`), `POST /v1/admin/institution/presets/:key/apply`, `erp/institution-setup` | the five Appendix B setups load as presets (type, structure, board, modules switched off) |

## 4. Education models, nursery to PG

| Feature | Status | Evidence | Note |
|---|---|---|---|
| 4.1 Nursery: domains, observations, milestones, learning stories, parent updates | Built | `api/school-life/early-years.controller.ts` | |
| 4.2 LKG/UKG: phonics, numeracy, worksheets, activity assessment | Built | `api/school-learning/school-learning.controller.ts` (worksheets), `erp/learning-support`, `S/features/learning` | worksheets, reading, phonics and numeracy tasks; scored activities with levels (best first) feed learning-outcome mastery |
| 4.3 Classes 1-5: subject, chapter, topic, outcome, activity, mastery | Built | `api/school-learning/school-learning.controller.ts` (`outcome-tree`, `outcomes/:id/topics`), `mig/0117` (`outcome_topics`), `erp/learning-support` | topic-level outcome nodes with class mastery counts; mastery records existed since 0114 |
| 4.4 Classes 6-10: projects, practicals, competency, board-exam prep, promotion | Built | `api/school-learning/school-rules.ts` (`evaluateBoardPass`), `remedial` endpoints, `erp/learning-support` | board pass rules (grace, aggregate, supplementary) on `school_boards`, board-practice worksheets and remedial plans from low mastery |
| 4.5 PUC: stream, combination, practicals, internal marks, entrance readiness | Built | `api/school-learning/school-learning.controller.ts` (`readiness`), `erp/learning-support`, `S/features/learning` | targets and mock-test scores with band, direction and weak subjects; the student sees it in My learning |
| 4.6 UG/PG: dept, program, year, term, course, unit, topic, CO, assessment, credits, electives, OBE, projects, internships, placements, research | Built | `api/obe/obe.controller.ts`, `api/course-registration`, `api/placements`, `api/research` | minors/majors/multidisciplinary tracks not modelled |
| 4.7 University: constituent/affiliated institutions, faculty/school, regulation | Built | `api/curriculum/faculties.controller.ts`, `mig/0117` (`faculties`, `departments.faculty_id`), `erp/institution-setup` | institutions, faculties or schools and their departments in one hierarchy |

## 5. Institution and organisation management

| Feature | Status | Evidence | Note |
|---|---|---|---|
| 5.1 Institution profile | Built | `api/institution/institution.controller.ts`, `erp/settings/institution` | legal, affiliation, AISHE, NAAC, address, contacts; logo not covered |
| 5.2 Campus, rooms, departments | Built | `api/institution/institution.controller.ts`, `erp/settings/buildings` | buildings, floors, rooms placed on floors |
| 5.3 Multi-campus (staff, students, timetable, fee, assets, transport per campus) | Built | `api/institution/setup.controller.ts` (`campus-settings`, `fee-structures`), `erp/institution-setup` | per-campus fee model and grading policy; fee plans for a campus and programme issue one invoice per active student |
| 5.4 Institution configuration (grading, approvals, comms, privacy, AI policy, content policy) | Built | `api/institution/setup.controller.ts` (`setup`), `erp/institution-setup` | AI policy, privacy toggles and message channels added to retention and security |

## 6. Identity, access and people

| Feature | Status | Evidence | Note |
|---|---|---|---|
| 6.1 Identity types | Built | `mig/0117` (role_name), `api/auth/principal.ts`, `api/evaluation/evaluation.controller.ts`, `api/curriculum/university.controller.ts` | external_examiner (marks scripts), mentor, accreditation_reviewer (reads curriculum) and university_admin (faculties and affiliated institutions) added |
| 6.2 Password, email, mobile OTP, MFA, sessions, refresh tokens | Built | `api/auth/auth.controller.ts`, `api/auth/mfa.controller.ts` | |
| 6.2 Device trust | Built | `api/trust/trust.controller.ts`, `mig/0117` (`trusted_devices`), `erp/institution-setup`, `S/core/device_id.dart`, `S/features/profile/device_trust_tile.dart` | a person trusts and revokes devices (a hash of the install id is kept), a sign-in from an unknown device is audited, administrators revoke; the Student App sends an install id and offers "Trust this phone" (Teacher and Parent apps do not yet) |
| 6.2 Enterprise SSO/OIDC | Partial | none | external: an identity-provider client registration (Google, Microsoft or Okta) and a customer IdP to test the OIDC flow against |
| 6.3 RBAC, institution/campus/section scope, data ownership | Built | `api/auth/auth.guard.ts`, `mig/0001_rls.sql` (RLS) | |
| 6.3 Department/program-scoped permissions, delegated access | Built | `api/auth/principal.ts`, `api/delegation/*`, `erp/delegations` | HOD scope; dated, audited, revocable delegation of workflow and leave approvals |
| 6.4 Privacy rules (linked children, restricted counselling/health, finance) | Built | `api/documents/documents.access.ts`, `api/welfare/counselling.controller.ts` | |

## 7. Student master and lifecycle

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Pre-admission states (prospect, enquiry, application, selection, offer) | Built | `api/admissions/enquiries.service.ts` | |
| Admission to enrolment without duplicate record | Built | `api/admissions/dedupe.ts`, `applications/:id/duplicates`, enrol check, `erp/admissions-tools` | same name plus a shared date of birth or phone against other applications and students; enrolment stops (409 DUPLICATE_PERSON) until a reason is given |
| Active, promoted, detained, completion, graduation, alumni | Built | `api/students/lifecycle.service.ts` | |
| Side states: withdrawn, transferred, suspended, on leave, expelled | Built | `api/students/lifecycle.service.ts` | |
| Side states: deferred, dropout, deceased | Built | `packages/shared/src/admissions.ts` (`deferred`), `api/students/lifecycle.service.ts` | dropped and deceased already had rules; `deferred` (with a return date) added |
| Student master data (identity, contact, guardian, address, demographics, documents) | Built | `api/students/students.controller.ts`, `api/documents/vault.controller.ts` | |
| Medical, transport, hostel, fee, attendance profiles | Built | `api/school-life/health.controller.ts`, `api/transport`, `api/hostel` | |
| Academic history, learning/skill/outcome profile, projects, internships, placements | Built | `api/admissions/admissions-ext.controller.ts` (`prior-education`), `mig/0117` (`student_prior_education`), `erp/admissions-tools` | kept on the application and moved to the student at enrolment |

## 8. Admissions, CRM and enrolment

| Feature | Status | Evidence | Note |
|---|---|---|---|
| 8.1 Lead source, campaign, counsellor, follow-up, notes, status, next action | Built | `api/admissions/enquiries.service.ts` | |
| 8.1 Lead score | Built | `api/admissions/lead-score.ts`, `erp/admissions` (score chip, sort by score) | rule-based points for source, programme interest, follow-ups and stage; recomputed on every change |
| 8.2 Campaigns, UTM, funnel | Built | `erp/admissions/campaigns`, `apps/erp/src/components/dashboard/AdmissionsDashboard.tsx` | |
| 8.2 Landing pages / forms | Built | `api/admissions/admissions-ext.controller.ts` (`landing`), `erp/app/apply/[slug]/landing/[cycleId]`, `erp/admissions-tools` | per-cycle public page with highlights, questions and contact, behind a publish switch; the form itself is unchanged |
| 8.2 Referral, source ROI | Built | `api/admissions/enquiries.service.ts` (`resolveAgent`), `apps/erp/src/app/apply/[slug]` (`?ref=`), campaign report | referral code on the public enquiry form; cost per enrolment in the campaign report |
| 8.3 Online application, documents, eligibility, application fee, verification, submission | Built | `api/admissions/public-admissions.controller.ts` | |
| 8.3 Correction round | Built | `api/admissions/admissions-ext.controller.ts` (`request-correction`, public `corrections` and `resubmit`), `erp/components/admissions/CorrectionPanel.tsx` | `correction_requested` status with rounds; the applicant sees what to fix, fixes and resubmits |
| 8.4 Entrance test, schedule, halls, candidate list, hall ticket, score entry, cutoff | Built | `api/admissions/entrance.controller.ts` | |
| 8.4 Online question paper, candidate answering, auto evaluation | Built | `api/admissions/online-test.service.ts`, `erp/admissions/online-test`, `erp/apply/[slug]/test` | applicant token login, timed MCQ drawn from a question bank, negative marking, auto-score into the entrance results |
| 8.5 Merit lists, offers, category quotas | Built | `api/admissions/admissions.controller.ts` (`merit-lists`, `quotas`) | |
| 8.5 Interviews | Built | `api/admissions/interviews.service.ts`, `erp/admissions/interviews` | panel, slot, per-panelist score sheets, outcome; `interview_score` merit rule and rejected candidates left out of the ranking |
| 8.5 Waitlist | Built | `api/admissions/admissions-ext.controller.ts` (`waitlist`, `waitlist/promote`), `erp/admissions-tools` | ranked waitlist; promoting offers freed seats in rank order and respects category quotas |
| 8.6 Acceptance, student ID, fee assignment, section, enrolment status | Built | `api/admissions/admissions.controller.ts` (`enroll`) | |
| 8.7 Agent/partner channel (profile, leads, commission) | Built | `api/admissions/agents.service.ts`, `erp/admissions/partners` | fixed commission per enrolment, accrued at enrolment, paid from the ledger |
| 8.8 Event registration (capacity, fee, QR check-in, feedback, certificate) | Built | `api/campus-life/public-events.controller.ts`, `erp/app/events/[slug]` | public list of open events with seats left and fee; registering stays in the app |

## 9. Academic calendar and year

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Academic years and terms/semesters | Built | `api/terms/terms.controller.ts` | |
| Trimesters/quarters | Built | `api/scheduling/scheduling-logic.ts` (`splitYear`), `POST /v1/scheduling/term-presets`, `erp/scheduling` | semester, trimester, quarter or annual terms made from the academic year |
| Holidays, working days, exams, events, vacations | Built | `api/calendar/calendar.controller.ts` | |
| Admissions and result dates on calendar | Built | `api/scheduling/calendar-feed.ts`, `erp/scheduling` | admission windows, merit results, exam sessions and result days reach the calendar when a cycle opens, a merit list or results are published, an exam is scheduled, or from the update button |
| Multiple simultaneous calendars (institution, campus, program, class, department) | Built | `api/calendar/calendar.controller.ts` (`campusIds`, `sectionIds`, `departmentIds`), `mig/0117`, `erp/scheduling` | entries can be for a campus, classes or departments; lists filter by audience and families see only their classes |

## 10. Curriculum management engine

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Entities: program, course, subject, chapter, unit, topic, credits | Built | `api/content/content.controller.ts`, `api/db/schema.ts` | |
| Entities: framework, regulation, stream, combination, learning outcome, competency, elective groups | Built | `api/curriculum/frameworks.controller.ts`, `mig/0117` (`curriculum_frameworks`, `regulations.framework_id`), `erp/institution-setup` | framework entity added to regulation, stream, combination, learning outcome and competency |
| Prerequisites | Built | `api/course-registration/registration-rules.ts` | |
| Versioning (version, effective date, approved by, supersedes, archive) | Built | `api/curriculum/curriculum.controller.ts`, `mig/0114_curriculum_school_university.sql`, `erp/curriculum` | draft, approved by the Board of Studies (resolution number), active, archived; revisions supersede; students pinned to their batch version; diff view |
| Curriculum importer (PDF/DOCX/sheet with AI proposal and approve) | Partial | `api/curriculum/curriculum-logic.ts` (`proposalFlags`), `erp/curriculum` | flags for duplicate codes, missing credits, units or outcomes and odd hours are built; external: an OCR engine for scanned PDFs (a vendor or a self-hosted engine) |
| Institution overrides (terminology, subjects, credits, outcomes) | Built | `api/institution/setup.controller.ts` (`terminology`), `erp/i18n/terminology.ts` | an institution renames any ERP string ("Classes" to "Sections") from setup, without code |

## 11. CBCS / CBE course registration

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Course categories (core, elective, open, minor, skill, VAC, audit) | Built | `api/db/schema.ts` (`OFFERING_CATEGORIES`), `mig/0117` | minor, major, audit (no credit toward the limit), additional, multidisciplinary and value-added added |
| Offering, eligibility, preferences, capacity, allocation, waitlist, confirmation | Built | `api/course-registration/course-registration.controller.ts` | |
| Allocation by merit/first-come/priority/custom rule | Built | `api/course-registration/registration-rules.ts` (`customScore`), `erp/course-registration` | custom rule: the institution weights CGPA, attendance and seniority per window |
| Credit limits, clashes, prerequisites | Built | `api/course-registration/registration-rules.ts` | |
| Fee on registration, credits to transcript | Built | `api/course-registration/course-registration.service.ts` (`chargeFee`), `erp/course-registration` | a course fee raises an invoice when the registration is approved (once); transcript credits still come from results |

## 12. Class, batch, section management

| Feature | Status | Evidence | Note |
|---|---|---|---|
| School grade/section, class teacher | Built | `api/admin/admin.controller.ts` (`classes`), `api/db/schema.ts` (`sections`) | |
| House | Built | `api/curriculum/houses.controller.ts`, `erp/school-mode` |  |
| PUC stream/combination sections | Built | `api/scheduling/scheduling.controller.ts` (`puc/sections`), `mig/0117` (`sections.combination_id`), `erp/scheduling` | a class per stream combination with the enrolled students moved into it |
| College batch/section/semester/offering | Built | `api/db/schema.ts` (`sections`, `course_offerings`) | |
| Transfers, section change, promotion, history | Built | `api/students/students.controller.ts` (`:id/section`, `promotions`, `:id/status-history`) | batch rollover is part of promotion; no separate rollover wizard |

## 13. Timetable and scheduling

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Periods, slots, rooms, subjects, teachers, classes | Built | `api/admin/timetable-admin.controller.ts` | |
| Teacher, room, section collision checks, capacity | Built | `api/admin/timetable-rules.ts` | |
| Subject frequency, lab requirements | Built | `api/scheduling/scheduling.controller.ts` (`frequency`), `api/admin/timetable-rules.ts`, `erp/scheduling` | least and most periods per week and most per day, enforced by the timetable editor; the lab and room rule existed |
| Exam slots | Built | `api/exams/exams.controller.ts` (`:id/schedule`) | |
| Substitutes with notifications | Built | `api/timetable/substitutions.controller.ts` | |
| Auto-generation of timetable | Built | `api/scheduling/scheduling-logic.ts` (`generateTimetable`), `timetable/generate`, `erp/scheduling` | clash-free proposal from the frequency rules; applying saves it and replace starts over |
| Outputs: student, teacher, room, department, board schedule | Built | `api/teacher/teacher.controller.ts` (`timetable`), `erp/timetable` | |

## 14. Attendance and presence

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Manual, Smartboard marking | Built | `api/teacher/teacher.controller.ts` (`v1/attendance`) | |
| QR attendance | Built | `api/attendance-governance/governance.controller.ts` | 8-digit code rotating every 30 s (HMAC), Student App code entry; camera scan not added (no scanner dependency) |
| Biometric (students) | Built | `api/scheduling/scheduling.controller.ts` (`biometric`), `erp/scheduling` | device ids per student and import of the device export marks the day; a live device push is hardware and vendor work (see section B) |
| AI-assisted attendance (confidence, consent, audit) | Partial | none | external: a face-recognition model or vendor and legal sign-off on biometric consent under the DPDP Act before anything is built |
| Statuses present/absent/late/excused | Built | `api/db/schema.ts` (`attendance_status`) | approved-leave and custom states absent |
| Leave integration | Built | `api/students/student-leave.controller.ts` | |
| Subject-wise / day / month / term / class views | Built | `api/scheduling/scheduling.controller.ts` (`attendance/rollup`), `erp/scheduling` | a class by subject, day, month or academic term |
| Corrections, approval, lock, shortage, warnings | Built | `api/attendance-governance/governance.controller.ts` | lock after N hours, HoD/principal-approved corrections, shortage report, condonation with document, eligibility |
| Parent alerts on absence | Built | `api/notifications/notifications.service.ts` | |

## 15. School-specific academic system

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Early years: observations, milestones, learning stories, parent updates | Built | `api/school-life/early-years.controller.ts` | |
| Primary/secondary: classwork, homework, worksheets | Built | `api/school-learning/school-learning.controller.ts` (worksheets), `erp/learning-support` | worksheet, reading, remedial, phonics, numeracy, activity and board-practice tasks |
| School report card (grades, competency, remarks, attendance, co-curricular, promotion status) | Built | `api/curriculum/school-academics.controller.ts` (`report-cards/:id/pdf`) | marks by subject, teacher remarks, conduct, co-curricular grades, attendance %, promotion status (principal only); Parent and Student app screens absent |
| Promotion rules, supplementary/compartment, subject-failure policy, approvals, parent communication | Built | `api/school-learning/school-rules.ts` (`decidePromotion`), `promotion` endpoints, `erp/learning-support`, `S/features/learning` | rules for attendance, pass mark, grace marks and supplementary exams; decisions are approved by the principal and the family is told |
| PTM (schedule, slots, parent booking, reschedule, reminders) | Built | `api/school-life/ptm.controller.ts` | PTM notes/action items absent |
| School diary (homework, classwork, announcements, acknowledgements) | Built | `api/school-life/diary.controller.ts` | |
| House system (houses, allocation, points, leaderboard) | Built | `api/curriculum/houses.controller.ts`, `erp/school-mode` | allotment with captain, points ledger by category, leaderboard |
| Activities: clubs, competitions, points | Built | `api/campus-life/clubs.controller.ts` | sports/culture categories via clubs/events |

## 16. PUC / Class 11-12

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Stream and combination (configurable) | Built | `api/curriculum/school-academics.controller.ts`, `erp/school-mode` |  |
| Practical subjects, internal marks, board exam rules | Built | `api/school-learning/school-rules.ts` (`evaluateBoardPass`), `boards/results/students/:id`, `erp/learning-support` | a PUC result under the primary board pass rules from the marks entered for the combination |
| Entrance readiness, career guidance | Built | `api/school-learning/school-learning.controller.ts` (`readiness`), `erp/learning-support`, `S/features/learning`, `S/features/careers` | entrance targets and mock-test tracking added to the careers screens |
| Subject-specific attendance | Built | `api/teacher/teacher.controller.ts` (per-period) | |

## 17. Higher-ed academic management

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Departments, programs, semesters, courses, credits, sections | Built | `api/departments`, `api/db/schema.ts` | |
| Course allocation to faculty | Built | `api/course-registration/course-registration.controller.ts` (`me/teaching`), `api/admin/timetable-admin.controller.ts` | |
| Affiliated / autonomous / university-dept / deemed models | Built | `api/institution/presets.ts` (`GOVERNANCE_RULES`), `api/curriculum/curriculum.controller.ts`, `api/curriculum/university.controller.ts` | an affiliated college must cite the university to approve a syllabus and cannot issue degrees; the rules for each model (syllabus authority, own exams, own degree) show on the setup page; exam publishing is not yet blocked for an affiliated college |
| Electives, projects, internships, research | Built | `api/placements/careers.controller.ts`, `api/research` | |

## 18. Lesson planning and course planner

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Year plan, unit/topic plan, proposed vs actual, coverage | Built | `api/plans/plans.controller.ts`, `api/coverage` | |
| Teaching activity, resource, assessment, outcome mapping per plan | Built | `api/school-learning/school-learning.controller.ts` (`lesson-plans/:id/outcomes`), `mig/0117` (`lesson_plan_outcomes`) | each period names the outcomes it teaches with activity, resource and assessment |
| Delayed topic and remediation flag | Built | `api/school-learning/school-learning.controller.ts` (`delayed-topics`), `erp/learning-support` | topics the year plan expected and class coverage lacks become catch-up plans for the teacher, once |
| Feeds course file, audit, OBE, board lesson context | Built | `api/course-files/course-files.controller.ts` | |

## 19. LMS and learning management

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Course, module, items, announcements | Built | `api/lms/lms.controller.ts` | |
| Assignment/homework with submission and evaluation | Built | `api/homework/submissions.controller.ts` | |
| Quiz / assessment inside course | Built | `api/lms/lms.service.ts` (assessment items) | |
| Discussion forums | Built | `api/lms/lms-ext.controller.ts` (forum), `mig/0117` (`forum_threads`, `forum_posts`), `erp/learning-support`, `S/features/learn/forum_screen.dart` | a discussion per course: students and teachers post, families read; teachers pin, lock or hide (ERP and API); the Student App has the thread list, thread and reply screens |
| Content types: PDF, PPT, video, link, simulation, virtual lab, worksheet, case study | Built | `api/lms/lms.controller.ts`, `mig/0117` | worksheet, case study, simulation, virtual lab, PPT and PDF items added |
| Student progress, completion, mastery, recommendations, overdue | Built | `api/lms/lms-ext.controller.ts` (`students/:id/recommendations`), `S/features/learning` | mastery by subject, practice that builds the weakest outcomes, and overdue work |
| Weighted gradebook | Built | `api/lms/lms.controller.ts` (`gradebook`) | |
| Reuse / template across sections | Built | `api/lms/lms-ext.controller.ts` (`courses/:id/clone`), `erp/learning-support` | copies modules and content to another class as a draft; class-bound homework, tests and worksheets are left out and counted |

## 20. Content and knowledge graph

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Hierarchy subject, chapter, topic, resource | Built | `api/content/content.controller.ts` | |
| Hierarchy: learning outcome, skill, activity, mastery nodes | Built | `mig/0117` (`outcome_topics`), `api/school-learning/school-learning.controller.ts` | chapter, topic, outcome and mastery nodes joined |
| Rights metadata and licensing | Built | `api/content/licensing.ts`, `api/platform/content-licenses.controller.ts` | |
| Sources: institution, teacher, government/OER, publishers, simulations | Built | `api/content/phet.controller.ts`, `api/content/concept-videos.controller.ts` | |
| Quest Studio content | Partial | none | external: Quest Studio is a separate product; it needs its API and a commercial agreement |
| Embeddings / semantic retrieval | Partial | none | external: an embedding model or provider and a vector store decision (pgvector or a hosted index) |

## 21. Assessment engine

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Assessment types (formative, summative, internal, external, practical, project, viva) | Built | `api/exams/schemes.controller.ts`, `mig/0117` (`component_kind`) | observation, diagnostic and skill components added; a scheme can allow more than one attempt |
| Question types MCQ, short, long, numeric | Built | `api/question-bank/question-bank.controller.ts` | |
| Question types coding, diagram, matching, case study, practical rubric | Built | `api/question-bank/blueprint.ts` (`typeConfigProblem`), `erp/question-bank` | matching, case study (with parts) and rubric-marked practical types; diagram labels checked |
| Metadata: topic, outcome, Bloom, difficulty, marks | Built | `api/question-bank/question-bank.controller.ts`, `mig/0117` (`k_level`, `competency_tags`, `skill_tags`) | knowledge level K1 to K6 and competency and skill tags beside Bloom |
| Rubric | Built | `api/assessment-tools/assessment-tools.controller.ts` (rubrics), `mig/0117` (`rubrics`, `rubric_scores`), `erp/assessment-tools` | reusable rubrics with levels and points; marking totals them; a used rubric is archived, not edited |
| Moderation, feedback | Built | `api/marks/marks.controller.ts` (`moderate`) | |
| Reattempt, academic integrity | Built | `api/assessment-tools/assessment-tools.controller.ts` (`reattempts`, `integrity`), `erp/assessment-tools` | reattempt requests against the allowed attempts, exam-screen events, a similarity check of submitted work, and leader review of every flag |
| Board quiz / poll becomes assessment record | Built | `api/polls/polls.controller.ts` | |

## 22. Question bank and paper engine

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Question bank with tags, difficulty, versions | Built | `api/question-bank/question-bank.controller.ts` | |
| Usage history | Built | `api/question-bank/paper-release.controller.ts` (`usage`), `erp/question-bank/usage`, `mig/0118_depth_exams_quality_hr_finance_campus.sql` | questions ranked by papers used and last use; never-used listed last |
| Blueprint (marks, difficulty, outcome distribution) | Built | `api/question-bank/blueprint.ts` | taxonomy/Bloom distribution partly |
| Paper generation, regenerate, PDF, answer key | Built | `api/question-bank/question-bank.controller.ts` | |
| Duplicate detection | Built | `api/question-bank/question-bank.controller.ts` (`duplicates`, trigram similarity, QB_DUPLICATE) | author must insist to save a near-copy |
| Scrutiny workflow, approval, lock | Built | `api/question-bank/question-bank.controller.ts` (`scrutiny`, `lock`) | |
| Secure release to exam controller at set time | Built | `api/question-bank/paper-release.controller.ts` (`papers/:id/release`, `releases/:paperId/paper.pdf`), `erp/exams/operations` | sealed for everyone until the set time, then only the named exam controller; audited |
| Past-exam question import | Built | `api/ai/past-exams.ts` | ERP import screen not built (API only) |

## 23. Exam controller

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Exam sessions, calendar/schedule, publication, lock | Built | `api/exams/exams.controller.ts` | |
| Exam declaration / student exam registration, eligibility | Built | `api/exams/exam-registration.controller.ts`, `api/exams/registration-rules.ts` | registration window, eligibility rules, override with reason |
| Hall tickets (photo, QR/barcode) | Built | `api/exams/documents.ts` (QR and photo), `api/exams/exams.controller.ts` (`ticketPdf`), `api/common/pdf.ts` (`image`) | signed QR and the profile photo (JPEG) printed on the ticket |
| Hall allocation and seating (batch, roll number, anti-collusion) | Built | `api/exams/anti-collusion.ts`, `api/exams/exam-registration.controller.ts` (`seating-plan`) | anti-collusion seating by class and roll number |
| Exam declaration / student exam registration, eligibility | Built | `api/exams/exam-registration.controller.ts`, `erp/exams/[id]` | window, attendance / fee dues / backlog rules, controller override with reason |
| Hall tickets (photo, QR/barcode) | Built | `api/exams/documents.ts`, `api/exams/exams.controller.ts` (`ticketPdf`), `api/documents/public-verify.controller.ts` | signed QR with public verify, and the photo on the ticket |
| Hall allocation and seating (batch, roll number, anti-collusion) | Built | `api/exams/anti-collusion.ts`, `erp/exams/[id]` | benches and rows, no same-subject neighbours, programmes mixed, chart PDF per hall |
| Invigilation (duty, substitution, reporting) | Built | `api/exams/exam-depth.controller.ts` | duty attendance not recorded |
| Answer script, evaluation, moderation, scrutiny | Built | `api/evaluation/evaluation.controller.ts` | |
| Revaluation | Built | `api/exams/exams.controller.ts` (`revaluations`) | |
| Supplementary / arrears / backlog | Built | `api/exams/exam-depth.controller.ts` | |
| Malpractice | Built | `api/exams/exam-depth.controller.ts` | |
| Lab / viva / practical exam types | Built | `api/exams/exam-ops.controller.ts` (`practicals`), `erp/exams/operations` | batch, room, time, internal and external examiners; clash checks; marks by roll number |
| Result approval workflow | Built | `api/exams/exams.controller.ts` (`request-publish`, publish gate), `api/workflows/workflows.service.ts`, `erp/exams/operations` | with a "result_publish" route set up, results publish only once approved |

## 24. Digital / on-screen evaluation

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Script import and pages | Built | `api/evaluation/evaluation.controller.ts` (`scripts`, `pages/:index`) | |
| Scanning hardware, bulk scanner ingest | Partial | `api/evaluation/evaluation.controller.ts` (`scripts/bulk`) | external: scanner hardware; bulk intake of many scans by a file-to-roll-number map is built |
| Anonymisation | Built | `api/evaluation/evaluation.logic.ts`, `scan-sanitise.ts` | dummy numbers; file names naming the student refused; EXIF/PNG text stripped; first-page header band blacked out at upload (PNG only; PDF/JPEG refused when masking is on) |
| Examiner allocation and workload | Built | `api/evaluation/evaluation.controller.ts` (`allocate`) | |
| Question-wise marks, save/resume | Built | `api/evaluation/evaluation.controller.ts` (`marks`) | |
| Annotation on script | Built | `api/evaluation/evaluation.controller.ts` (`annotations`), `erp/evaluation/desk` | tick, cross, comment, highlight as page-relative coordinates per valuation; third valuer and exam cell see earlier rounds read only; freehand ink not built |
| Second valuation, comparison, finalise, lock | Built | `api/evaluation/evaluation.controller.ts` (`second-valuation`, `finalise`) | |
| No-download secure access, audit | Built | `api/evaluation/evaluation.service.ts` | |
| Connect to CO/PO | Built | `api/obe/quality.controller.ts` (`eval-questions/:id/co`, `question-outcomes`, `apply-outcome-map`), `api/obe/attainment.ts`, `erp/obe/quality` | each question tagged with a course outcome; the tags write the assessment outcome map |
| ERP examiner desk | Built | `erp/evaluation/desk` | |

## 25. Results, grading, rank, transcripts

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Marks, grades, SGPA, CGPA, credits | Built | `api/exams/grading.ts` | |
| Grade scales and rules configurable per regulation | Built | `api/exams/exams.controller.ts` (`grade-scales`, `result-rules`) | |
| Moderation, grace marks | Built | `api/exams/exam-depth.controller.ts` (`grace`) | |
| Rank, progression, backlog | Built | `api/exams/ranks.ts` | subject ranking absent |
| Normalised marks, distinction class | Built | `api/exams/exam-ops.controller.ts` (`normalise`, `class-bands`, `classification`), `api/exams/exam-ops.logic.ts` | preview, apply and undo; original marks kept; configurable class bands and subject distinctions |
| Marksheet, transcript PDFs | Built | `api/exams/results.controller.ts` | |
| Consolidated marks, rank list, subject ranking, progress report PDFs | Built | `api/exams/exam-ops.controller.ts` (`consolidated.pdf`, `progress-report.pdf`), `api/exams/exam-depth.controller.ts` (`ranks`) | class, programme and subject ranks; PDFs |
| Indic text in PDFs | Built | `api/common/pdf-fonts.ts`, `api/common/pdf.ts` | Hindi and Kannada shaped with HarfBuzz and embedded |

## 26. Certificates and credentials

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Templates, bonafide, transfer, conduct, custom | Built | `api/documents/certificates.controller.ts` | |
| Request, approve, issue, bulk issue | Built | `api/documents/certificates.controller.ts` | |
| QR, unique serial, revoke, public verification | Built | `api/documents/public-verify.controller.ts` | |
| Marks card, transcript, passport | Built | `api/skills/passport.controller.ts` | |
| Graduation / convocation | Built | `api/curriculum/university.controller.ts`, `erp/university` | eligible graduates from final-semester pass results, registration, withhold, degree numbers, certificate PDF with signed QR and public check |
| Blockchain / wallet-style digital credentials (DigiLocker) | Partial | `api/documents/public-verify.controller.ts`, `api/pairing/offline-pairing.controller.ts` (signing keys) | external: DigiLocker/NAD issuer registration and API credentials; signed QR verification of certificates is built |

## 27. OBE / outcome engine

| Feature | Status | Evidence | Note |
|---|---|---|---|
| PEO, PO, PSO, CO, mapping, matrix | Built | `api/obe/obe.controller.ts` | |
| Direct and indirect attainment, thresholds, weights, targets, levels | Built | `api/obe/attainment.ts` | |
| Formula configurable (not hard-coded) | Built | `api/obe/obe.controller.ts` (`config`) | |
| Matrix colour scale, drill-down | Built | `erp/obe/matrix` | |
| School mode (learning outcome, competency, mastery) | Built | `api/curriculum/school-academics.controller.ts`, `erp/school-mode` | outcomes and competencies by class and subject, four mastery levels per student, section distribution; marking from the Teacher App absent |
| CQI gaps and actions | Built | `api/obe/obe.controller.ts` (`actions`) | |

## 28. Accreditation and quality OS

| Feature | Status | Evidence | Note |
|---|---|---|---|
| NAAC / NBA / NIRF / AISHE packs (CSV, PDF) | Built | `api/analytics/accreditation.ts` | |
| Configurable framework packs (criteria, metrics, owner, target, score) | Built | `api/obe/quality.controller.ts` (`frameworks`, `criteria`), `api/obe/quality.logic.ts`, `erp/obe/quality` | criteria trees with metric, target, owner and weighted score; NAAC, NBA and NIRF starters |
| CQI loop (metric, gap, root cause, action, owner, re-measure) | Built | `api/obe/quality.controller.ts` (`actions/:id/root-cause`, `remeasure`, `cqi`), `erp/obe/quality` | root cause, baseline, target, re-measure date and result; effective or another cycle |
| Evidence engine (auto from ERP/LMS/exams/placements/surveys/committees) | Built | `api/obe/quality.controller.ts` (`harvest`, `criteria/:id/evidence`, `evidence/:id/file`) | figures collected from students, staff, exams, placements, surveys, publications, LMS, course files, grievances and committees; file upload |

## 29. Course file

| Feature | Status | Evidence | Note |
|---|---|---|---|
| One-click course file with syllabus, CO, plan, coverage, attendance, results, attainment | Built | `api/course-files/course-files.controller.ts` | |
| PDF / audit package, versioning, review | Built | `api/course-files/course-files.controller.ts` (`download`, `review`) | |
| Teacher-app access | Built | `T/lib/features/work/course_files_screen.dart`, `T/lib/core/course_file_models.dart` | build a version and open the PDF from Profile |

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
| Qualifications, skills | Built | `api/hr/hr-depth.controller.ts` (`qualifications`), `erp/hr/faculty` | degrees, certifications, skills and experience; HR verifies; search by word |
| Course allocation, workload | Built | `api/hr/hr-depth.controller.ts` (`workload`), `erp/hr/faculty` | weekly hours against a norm, classes, subjects and exam duties; a head of department sees their own department |
| Training, certifications, professional development | Built | `api/hr/talent.controller.ts` (`training-records`), `erp/hr/training` | FDP, workshop, conference and course records with HR verification; certificate file upload absent |
| Appraisal | Built | `api/hr/talent.controller.ts`, `api/hr/appraisal-math.ts`, `erp/hr/appraisal` | API/PBAS-style categories: self-appraisal, HoD review of own department, principal final score and grade |
| Faculty teaching evaluation (student, HOD, peer, self) | Built | `api/hr/hr-depth.controller.ts` (`evaluations`), `erp/hr/faculty` | student, head of department, peer and self ratings, weighted into one score; raters never named |

## 32. HR and employee management

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Employee master, designations, bank, documents | Built | `api/hr/hr.controller.ts`, `api/documents/vault.controller.ts` | |
| Attendance (app, manual, biometric CSV) | Built | `api/hr/hr.controller.ts` | live device integration absent |
| Leave | Built | `api/hr/leave.controller.ts` | |
| Recruitment: openings, applicants, stages | Built | `api/hr/recruitment.controller.ts` | interviews as stage only |
| Offer letter, onboarding checklist | Built | `api/hr/talent.controller.ts`, `api/hr/letters-pdf.ts`, `erp/hr/onboarding` | offer PDF from the recruitment applicant; dated joining checklist |
| Confirmation after probation | Built | `api/hr/staff-changes.controller.ts` (`probation`), `erp/hr/probation` | HoD recommends, principal confirms or extends, with a letter |
| Exit: resignation, notice, clearance, full-and-final note, relieving letter | Built | `api/hr/exit.controller.ts`, `erp/hr/exit` | clearance across six departments; staff record closed and login disabled on relieving |
| Transfer | Built | `api/hr/staff-changes.controller.ts` (`transfers`), `erp/hr/transfers` | applies on the effective date; history kept |

## 33. Payroll

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Salary structure, components, runs, payslip PDF | Built | `api/hr/payroll.controller.ts` | |
| Statutory (PF, ESI, PT, TDS), LOP | Built | `api/hr/payroll.controller.ts` (`statutory.csv`) | |
| Approvals, lock, reopen | Built | `api/hr/payroll.controller.ts` | |
| Bank file, Tally export | Built | `api/hr/payroll.controller.ts` (`bank-transfer.csv`, `tally.xml`) | |
| Overtime, arrears/revisions | Built | `api/hr/hr-depth.controller.ts` (`payroll/adjustments`), `api/hr/payroll.service.ts`, `erp/payroll/adjustments` | overtime, arrears (including salary revisions), bonuses and recoveries, approved by the principal, then on the payslip |
| Form 16 / challans | Built | `api/hr/hr-depth.controller.ts` (`payroll/form16`, `challans`, `tds-summary`), `api/hr/form16-pdf.ts`, `erp/payroll/adjustments` | year statement and challans per employee; the numbered certificate itself comes from the tax portal (external) |

## 34. Finance and fee management

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Fee heads, structures, invoices, receipts | Built | `api/fees/fees.controller.ts` | |
| Online gateway (Razorpay) with webhook; offline/counter | Built | `api/fees/fees.controller.ts` (`webhooks/razorpay`), `api/fees/bank-transfers.controller.ts` | |
| Instalments | Built | `api/fees/fees-depth.controller.ts` (`instalment-plans`, `invoices/:id/instalments`), `erp/fees/plans` | plans by percentage and days; payments allocated in order |
| Scholarship, concession, refund | Built | `api/finance/scholarships.controller.ts`, `api/finance/finance.controller.ts` (`refunds`) | |
| Fine (late fee) | Built | `api/fees/fees-depth.controller.ts` (`late-fee-rule`, `late-fees`), `erp/fees/plans` | daily job adds the fine once and then only new days; waiver by the principal |
| Wallet / advance / credit | Built | `api/fees/fees-depth.controller.ts` (`credits`, `apply-credit`), `erp/fees/plans` | ledger of advances, adjustments and refunds; settles an invoice with a receipt |
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
| Warranty / AMC fields | Built | `api/inventory/assets-depth.controller.ts` (`amc`, `coverage`, `warranty`), `erp/assets/amc` | contracts, service visits, warranty end and what is running out |
| Depreciation | Built | `api/inventory/assets.controller.ts` (`gl/depreciation`) | |
| Smartboards as assets linked to rooms | Built | `api/inventory/assets-depth.controller.ts` (`smartboards`), `erp/assets/amc` | each board registered in the asset register against its room |

## 36. Library and digital library

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Catalogue, issue, return, fines, members | Built | `api/library/library.controller.ts` | |
| Renew, reservation, damaged/lost | Built | `api/library/library-depth.controller.ts` (`renew`, `reservations`, `lost`, `damaged`), `erp/library/circulation` | renewals limited, queue with a three-day hold, lost and damaged books charged |
| Barcode / RFID | Partial | `api/library/library-depth.controller.ts` (`books/barcodes/assign`, `labels.pdf`, `scan/:code`), `erp/library/circulation` | external: RFID readers and tags; accession codes with QR labels and scan lookup are built |
| E-books, digital resources, access log | Built | `api/library/library-depth.controller.ts` (`eresources`), `erp/library/e-resources` | register with licence and seats, and an access log |
| Koha / external system | Built | `api/connectors/integrations.controller.ts` (`library/search`) | tested against local stub only |
| Link resources to curriculum topics | Built | `api/library/library-depth.controller.ts` (`topic-links`, `topics/:id/resources`), `erp/library/e-resources` | books and e-resources recommended per topic |

## 37. Hostel

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Blocks, rooms, beds, occupancy, allotment, transfer, vacate | Built | `api/hostel/hostel.controller.ts` | |
| Waitlist, application, eligibility | Built | `api/hostel/hostel.controller.ts` (`waitlist`) | |
| Warden, visitors, complaints, gate pass, night attendance | Built | `api/hostel/hostel.controller.ts` | |
| Hostel fee, mess linkage | Built | `api/hostel/hostel.controller.ts` (`fees`, `mess`) | |
| Maintenance requests | Built | `api/hostel/campus-ops.controller.ts` (`hostel/work-orders`), `erp/hostel/work-orders` | complaint to work order, assigned, done, checked by the warden; the resident sees progress |

## 38. Transport

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Vehicles, drivers, routes, stops, assignments, fees | Built | `api/transport/transport.controller.ts` | |
| Documents / compliance expiry, expenses, incidents | Built | `api/transport/transport.controller.ts` | |
| GPS tracking, live bus + ETA, parent notices | Built | `api/transport/transport.controller.ts` (`gps`), `P/features/transport` | needs real GPS source in the field |
| RFID boarding | Missing | none | external: RFID readers and student cards |
| Student boarding record (manual scan) | Built | `T/features/driver` | |

## 39. Canteen / mess

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Menu, plans, eligibility, subscriptions | Built | `api/hostel/hostel.controller.ts` (`mess`) | |
| Meal attendance, prepaid wallet | Built | `api/hostel/canteen.controller.ts` | postpaid billing absent |
| Vendor, purchase, inventory link | Built | `api/hostel/campus-ops.controller.ts` (`canteen/ops/stock`, `summary`), `erp/canteen/operations` | purchases tied to vendors and orders; use can draw from the store |
| Feedback, wastage | Built | `api/hostel/campus-ops.controller.ts` (`canteen/ops/feedback`, wastage in `stock`), `erp/canteen/operations` | meal ratings (one per person per meal) and wastage share by item and meal |

## 40. Health, wellness, counselling

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Health records, emergency contact, visits, vaccinations | Built | `api/school-life/health.controller.ts` | |
| Consent | Built | `api/consent/consent.controller.ts` | |
| Counselling sessions, confidential notes, restricted access | Built | `api/welfare/counselling.controller.ts` | |
| Mentor vs counsellor separation | Built | `api/mentoring`, `api/welfare` | |
| Retention rules for sensitive data | Built | `api/welfare/retention.controller.ts`, `erp/health/retention`, `erp/settings/retention-actions.ts` | health visits and counselling: delete or strip after the period; daily job; audited |

## 41. Mentoring and early intervention

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Mentor assignment (bulk), sessions, notes, action plans, follow-up | Built | `api/mentoring/mentoring.controller.ts` | |
| Combined risk signals (attendance, assessment, assignments, engagement) | Built | `api/mentoring/mentoring-rules.ts`, `api/mentoring/mentoring.service.ts` (`extraSignals`) | adds outcome attainment, skills, missed assignments and class engagement to the signal |
| Intervention flow to reassessment and outcome | Built | `api/mentoring/mentoring-depth.controller.ts` (`support`, `reassess`), `api/mentoring/mentoring.service.ts`, `erp/mentoring/interventions` | support items per plan, the student sees them; risk measured again at review and on close |
| No permanent labelling | Built | `api/mentoring/mentoring.controller.ts` | |

## 42. Skills and outcome passport

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Skill engine, mapping to course/outcome/activity | Built | `api/skills/skills.controller.ts` | |
| Evidence, institution verification, revocation | Built | `api/skills/passport.controller.ts` | |
| Passport PDF and public verify | Built | `api/skills/passport.controller.ts` (`pdf`, `verify-passport`) | |
| Knowledge/skills/attitudes, leadership, communication tags | Built | `api/skills/skills.controller.ts`, `api/skills/skills.service.ts` (`ksa`), `erp/skills` | Six categories on every skill; the passport groups skills by category with the average level (`test/pathways-projects.e2e.spec.ts`). |

## 43. Projects and collaboration

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Project proposal, team, mentor, milestones | Built | `api/research/research.controller.ts` (`projects`) | research-oriented; student coursework projects not a separate module |
| Files, discussion, review rubric, viva, portfolio | Built | `api/projects/projects.controller.ts`, `erp/projects/[id]`, `S/features/projects`, `T/features/work/project_screens.dart` | Files (links and uploads), threaded discussion, mentor/peer/external rubric reviews, viva with result, portfolio with publish. |
| Collaborator discovery, team matching, showcase | Built | `api/projects/projects.controller.ts` (`discover`, `matches`, `join`, `hub`, `showcase`), `erp/projects`, `S/features/projects` | Recruiting board, skill-fit ranking from the passport and resume, join requests, showcase list. |
| SDG mapping of projects | Built | `api/skills/sdg.controller.ts` | |

## 44. SDG and impact

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Tag projects, research, events, internships to SDGs | Built | `api/skills/sdg.controller.ts` | |
| Custom impact framework | Built | `api/projects/impact.controller.ts`, `erp/projects` (Impact tab) | Own indicators with units; records from projects, events, internships and activities; dashboard totals. |
| Dashboard | Built | `api/skills/sdg.controller.ts` (`dashboard`) | |

## 45. Placement

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Companies, drives, eligibility, rounds, offers | Built | `api/placements/placements.controller.ts` | |
| Student registration/withdrawal, offers respond | Built | `api/placements/placements.controller.ts` | |
| Resume / profile builder | Built | `api/careers/careers.controller.ts` (`resume`, `resumes`, PDF), `erp/careers`, `S/features/careers` | The student keeps the resume; the placement cell searches shared resumes and prints a PDF. |
| Aptitude / online tests | Built | `api/careers/careers.controller.ts` (`tests`, `attempts`), `erp/careers`, `S/features/careers/aptitude.dart` | Timed tests with answers hidden, graded with topic scores, three attempts, results for staff. |
| Stats and reports | Built | `api/placements/placements.controller.ts` (`stats`) | |

## 46. Internship

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Internship, mentor, evaluation, diary, status | Built | `api/placements/careers.controller.ts` | |
| Attendance, certificate on completion | Built | `api/placements/internship-extras.controller.ts`, `internship-extras.service.ts`, `erp/placements` | Attendance (the diary counts where no muster was kept); completion certificate issued automatically at 75% attendance, or by the office with a waiver. |
| Map to skills/course/outcomes | Built | `api/placements/internship-extras.controller.ts` (`links`), `api/skills/sdg.controller.ts`, `erp/placements` | Skills, subjects and course outcomes, plus SDG tags. |

## 47. Career guidance

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Career interest, paths, recommendations | Built | `api/careers/careers.logic.ts` (`recommendPaths`), `erp/careers`, `S/features/careers/career_prep.dart` | Paths ranked from the skill passport and resume interests, with the skill gaps. |
| Resume, portfolio | Built | `api/careers/careers.controller.ts`, `api/projects/projects.controller.ts` (`portfolio`), `S/features/careers`, `S/features/projects` |  |
| Mock interview, aptitude, communication practice | Built | `api/careers/careers.controller.ts` (`mock-interviews`), `S/features/careers/mock_interview.dart` | Rule-based scoring on length, points covered, filler words and pace, with per-question feedback. |
| AI career assistant | Built | `api/careers/careers.controller.ts` (`assistant`), `api/ai/tasks.ts` (`careerCoach`), `S/features/careers/career_prep.dart` | Uses the AI gateway; with no model connected it answers from the same facts and says it is offline guidance. |

## 48. Research

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Proposal, ethics, projects, scholars, grants, publications, conferences, patents | Built | `api/research/research.controller.ts` | |
| KPIs | Built | `api/research/research.controller.ts` (`kpis`) | |
| Supervisor allocation, thesis/dissertation, viva | Built | `api/research/thesis.controller.ts`, `erp/research`, `T/features/work/research_screens.dart` | Supervisor caps and history, thesis stages, examiners, open defence, award. |
| Plagiarism check | Partial | `api/research/thesis.controller.ts` (`similarity`) | external: Turnitin/iThenticate account. Built: an originality check against the institution's own theses (word-run overlap, limit 25%, office override with a reason). |
| Datasets, DOI import, document upload | Built | `api/research/datasets.controller.ts`, `api/research/doi.ts`, `erp/research` | Datasets with files and access rules (open, restricted, embargoed); DOI import reads Crossref (public API, no account). |
| University-level research office | Built | `api/research/research-office.controller.ts`, `erp/research` | One view across departments. |
| Mobile (faculty / student research) | Built | `T/features/work/research_screens.dart`, `S/features/projects` |  |

## 49. Alumni

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Directory, batch, career, events, RSVPs | Built | `api/placements/careers.controller.ts` (`alumni`) | |
| Mentoring requests | Built | `api/placements/careers.controller.ts` | |
| Fundraising: campaigns, pledges, donations, receipt | Built | `api/placements/alumni-giving.controller.ts` | tax-exemption (80G) receipt format not confirmed |
| Volunteering, success stories | Built | `api/placements/success-stories.controller.ts`, `erp/alumni`, `S/features/alumni` | Alumni write, the office reviews and features; published stories show in the student app. |
| Alumni login/portal | Built | `api/placements/alumni-portal.controller.ts`, `S/features/alumni/alumni_home.dart` | An alumni-only login opens the alumni home in the student app: profile, giving, volunteering, own success stories. |

## 50. Clubs and student life

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Clubs, membership, coordinators, activities, attendance, points | Built | `api/campus-life/clubs.controller.ts` | |
| Certificates | Built | `api/campus-life/clubs.controller.ts` | |
| Student leaders / office bearers, achievements log | Built | `api/campus-life/life-extras.controller.ts`, `erp/campus-life`, `S/features/school` |  |

## 51. Committees

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Committees, members, tenure, meetings, agenda, minutes, action items | Built | `api/campus-life/committees.controller.ts` | |
| Evidence, reports | Built | `api/campus-life/life-extras.controller.ts` (`evidence`, `report-pack`), `erp/campus-life` | Files and links per meeting, and a PDF report pack. |

## 52. Events

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Event, venue, registration, capacity, fee, QR check-in, feedback | Built | `api/campus-life/events.controller.ts` | |
| Certificate on attendance | Built | `api/campus-life/life-extras.controller.ts` (`certificates`), `api/documents/auto-certificates.service.ts` | Numbered, verifiable certificates for everyone checked in. |
| Media gallery | Built | `api/campus-life/life-extras.controller.ts` (`media`), `erp/campus-life` | Staff publish; attendees add items that wait for approval. |
| Mobile passes (QR) | Built | `S/features/campus`, `P/features/school_life/event_passes_screen.dart` | |

## 53. Survey and feedback

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Question types (MCQ, rating, free text, yes/no, NPS) | Built | `api/surveys/surveys.controller.ts` | matrix and rank types not confirmed |
| Anonymous / identified, scheduling | Built | `api/surveys/surveys.controller.ts`, `surveys.service.ts` (`runSchedule`, `nextCycle`), `survey-rules.ts` (`showIf`) | Opens by itself, repeats on a schedule, conditional questions; anonymity unchanged. |
| Results, export, CO ratings into OBE | Built | `api/surveys/surveys.controller.ts` (`export.csv`, `outcomes`) | |
| Trends, action items | Built | `api/surveys/surveys.controller.ts` (`series/:key/trend`), `erp/surveys` | Cycle-to-cycle averages and change per question. |

## 54. Grievance

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Types, anonymous, SLA, assignment, escalation, rating, reopen | Built | `api/welfare/grievances.controller.ts` | |
| Confidential committees (anti-ragging, ICC/POSH) | Built | `api/welfare/grievances.controller.ts` (`committee-stage`) | |
| Evidence attachments | Built | `api/welfare/welfare-extras.controller.ts` (`GrievanceEvidenceController`), `erp/grievances` | Same privacy as the ticket; the uploader is hidden on anonymous tickets. |

## 55. Discipline

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Incidents, actions, warnings, appeals, closure | Built | `api/welfare/discipline.controller.ts` | |
| Witnesses, parent involvement | Built | `api/welfare/welfare-extras.controller.ts` (`DisciplineExtrasController`), `erp/grievances`, `P/features/school_life/conduct_screens.dart` | Witness statements; parent contact log with a notice the parent acknowledges. |

## 56. Documents and records

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Upload, metadata, access control, expiry, preview | Built | `api/documents/vault.controller.ts` | |
| Virus scan | Built | `api/scanning` | |
| Versioning | Built | `api/documents/vault.controller.ts` (`versions`, `restore`), `erp/documents/vault` | Upload with `replacesId` chains versions; history and restore as a new version. |
| OCR | Partial | none | external: an OCR engine or vision-model server (none is bundled). |
| Retention rules (generic) | Built | `api/retention/retention.controller.ts`, `retention.service.ts`, `erp/settings` | Per-target rules, daily sweep and a dry run; documents are archived, never destroyed. |
| Verification | Built | `api/documents/public-verify.controller.ts` | |

## 57. Workflow / e-governance engine

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Definitions, request, approve/reject, resubmit, cancel, inbox | Built | `api/workflows/workflows.controller.ts` | |
| Multi-step sequential approvals | Built | `mig/0102_workflows.sql` | |
| Parallel approval, conditions | Built | `api/workflows/workflows.service.ts` (`parallelOutcome`, `applicableSteps`), `mig/0110` |  |
| SLA, escalation | Built | `api/workflows/workflows.service.ts` (`sweepSla`, hourly job) | Reminders, then escalation to a named role or user. |
| Forms in workflow | Built | `api/workflows/workflow-rules.ts` (`validatePayload`), `erp/workflows` (field editor) | Definitions declare typed fields; requests are validated against them. |
| Existing flows bound to engine (admissions, scholarships, refunds, certificates, grievance) | Built | `api/workflows/bound-flows.*` (scholarships, refunds, certificates, admission fee waivers, grievance resolution), `erp/workflows` | With an active workflow for the flow, the direct action answers 409 and the outcome is applied when the last approver decides. |

## 58. Communication engine

| Feature | Status | Evidence | Note |
|---|---|---|---|
| In-app and push | Built | `api/push`, `api/notifications/notifications.service.ts` | |
| Internal messages, conversations, broadcasts | Built | `api/messages/messages.controller.ts`, `api/broadcasts` | |
| SMS | Partial | `api/comms/channels.ts`, `api/auth/sms-sender.ts` | external: DLT entity and template registration with the telecom operator. Built: template ids are stored and required before an SMS campaign can be sent; MSG91 flow sender. |
| Email | Built | `api/comms/comms.service.ts` (email channel), `api/analytics/mailer.ts` | General channel with retry; needs the mail relay (`MAIL_WEBHOOK_URL`) configured, otherwise it only logs. |
| WhatsApp adapter | Partial | `api/comms/channels.ts` (`WhatsAppSender`) | external: the institution's WhatsApp Business account. Built: the adapter interface and a guard that refuses campaigns while none is connected. |
| Templates, audience rules, schedule, retry, read status | Built | `api/comms/comms.controller.ts`, `comms.service.ts`, `erp/communication` | Templates per channel and language, saved audiences, scheduled campaigns, back-off retry (15 min, 1 h, 4 h), read status for in-app. |

## 59. Parent experience

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Attendance, homework, timetable, marks, fees, transport, events, consent | Built | `P/features` (attendance, homework, exams, fees, transport, privacy) | |
| Diary, PTM, early years, health, passport, surveys | Built | `P/features/school_life` | |
| Report card (school) | Built | `P/features/exams/report_card_screen.dart`, `api/curriculum/school-academics.controller.ts` | Scholastic and co-scholastic grades, remarks, behaviour grade, attendance and PDF. |
| Teacher messages | Built | `P/features/messages` | |
| Behaviour/activities where allowed | Built | `api/parent/parent-extras.controller.ts`, `P/features/school_life/conduct_screens.dart` |  |
| Visibility driven by policy/config | Built | `api/parent/parent-visibility.ts`, `erp/settings`, `P/core/conduct.dart` | Per-institution switches for attendance, diary, report card, behaviour, activities, health; enforced in the API. |
| Career (PUC), official notices (college) | Built | `P/features/careers`, `P/features/updates` | |

## 60. Student app

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Dashboard, timetable, attendance, learning, homework, results, fees, calendar, messages | Built | `S/features` | |
| Assessments and quizzes | Built | `S/features/learn` | |
| Credits, course registration, passport, internship, placement | Built | `S/features/campus/course_registration_screen.dart` | |
| Research, projects | Built | `S/features/projects` | My projects and workspace, find a team, showcase and peer review, portfolio, thesis status. |
| School: diary, activities, report card | Built | `api/parent/parent-extras.controller.ts` (`student/diary`, `student/activities`), `S/features/school` |  |

## 61. Teacher app

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Dashboard, timetable, attendance, roster, homework, marks, lesson plan, messages | Built | `T/features` | |
| Student insights, AI copilot, recordings, board remote | Built | `T/features/insights`, `T/features/ai` | |
| Exam duties, mentoring, HR (leave/payslip), substitutions | Built | `T/features/work`, `T/features/hr` | |
| Course file, CO/PO view, research, project mentoring | Built | `T/features/work/course_file_screens.dart`, `obe_screens.dart`, `research_screens.dart`, `project_screens.dart` |  |

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
| 12 | Faculty: teaching evaluation (student/HOD/peer/self), workload report | 31 | M | appraisal and training/PD are built |
| 13 | HR: confirmation, transfer; payroll overtime/arrears, Form 16 | 32, 33 | M | offer letter, onboarding and exit are built |
| 14 | Accreditation: configurable criteria/metric tree, evidence auto-harvest and file upload, CQI root-cause/re-measure | 28 | L | |
| 15 | Research: supervisor allocation, thesis and viva workflow, datasets, DOI import, document upload | 48 | M | |
| 16 | Mobile gaps: Teacher (course file, CO/PO, research), Student (diary, report card, research, projects) | 60, 61 | M | |
| 17 | House system (houses, allocation, points, leaderboard) | 12, 15 | S | |
| 18 | Admissions: correction round, ranked waitlist | 8 | L | lead score, referral, agents and commission, interviews and the online entrance test are built |
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
