# Placements, training, internships and alumni: completeness against Linways, Superset and the Camu placement cell (checklist section 14 and the pass brief)

Audit of `docs/research/MODULE_DEPTH_CHECKLIST.md` section 14, `PLACEMENT_INTERNSHIP_ALUMNI_DETAILED_SPEC.md` and the
placements pass brief, read in code and exercised against the Soundarya seed (API on a seeded database, the ERP pages
in Playwright at 1280px and 390px with `apps/erp/scripts/placements-qa.mjs`), API e2e and Student App widget tests.
**Before** is the branch at `16a33db`.

Status words: **Have** (built and tested before), **Built** (missing before, built now), **Deepened** (partial before,
gaps closed now), **Fixed** (broken before). Migrations: `0210_placements_eligibility_crm_documents`,
`0211_apprenticeships_internship_credits_referrals`. New tests: `services/api/test/placements-pass.e2e.spec.ts`
(9 workflows, figures worked by hand in comments), `test/soundarya-placements-pass.e2e.spec.ts` (the seed: five
outgoing batches, one accepted offer per student, the NATS share), `src/placements/placement-pass.logic.spec.ts`
(11 rule groups: eligibility, gap years, dream lines, AICTE credits, NATS share, CSV import, NAAC averages, resume
draft), `apps/erp/src/lib/placements-pass.test.ts` (3), `apps/student/test/placement_dashboard_test.dart` (4).

Counts (65 items): before **33 Have, 11 Partial, 15 Missing, 6 Broken**; after **65 Done** (33 Have, 32 Built,
Deepened or Fixed).

## Companies and the recruiter relationship

| Item | Before | After | Evidence |
|---|---|---|---|
| Company registry: sector, group, city, website, record kit | Have | Have | `placements.records.ts` `placement-companies` |
| HR contacts per company | Have | Have | `placement_company_contacts`, company page |
| Self-registration, verification, blacklist, recruiter portal key | Have | Have | `recruiter-portal.controller.ts`, placements-depth e2e |
| Relationship stage (prospect, contacted, in talks, recruiting, dormant) and the officer who looks after it | Missing | Built | `placement_companies.crm_stage`, `owner_user_id` (0210); kit fields, filter, bulk edit; a first contact moves a prospect to contacted |
| Interaction log: calls, emails, meetings, campus visits, outcome, next step, follow-up date | Missing | Built | `placement_interactions` (0210), kit `placement-interactions` (import, export, history), company page **Interactions** tab and **Log interaction**, ERP **Recruiter log** view |
| Follow-ups due | Missing | Built | companies filter **Follow-up: due by today** (IST), next follow-up column, **Mark followed up**; test "keeps the recruiter relationship" |
| Recruiter key never sent to the browser | Broken: `GET /v1/placements/companies` and company create/update returned `portal_token_hash` | Fixed | `withoutKey` in `placements.controller.ts`; test asserts no hash |

## Drives and eligibility

| Item | Before | After | Evidence |
|---|---|---|---|
| Job and internship drives with JD, skills, bond, venue, window | Have | Have | `placement_drives`, drive kit |
| CGPA and current backlogs from published results | Have | Deepened | batched `academicsMany` (a fixed number of queries for the whole roll, was 2 per student) |
| Programme (branch) and batch | Have | Have | `checkEligibility` |
| Gender | Missing | Built | `placement_drives.genders` (0210), **Open to: everyone / women only / men only**; from `student_profiles.gender`; reason `gender_not_eligible` |
| Class 10 and 12 minimum percentages | Missing | Built | `min_tenth_pct`, `min_twelfth_pct`; from `student_prior_education`; missing marks give `no_prior_marks` |
| Gap years | Missing | Built | `max_gap_years`; `priorProfile`: years between class 10 and 12 beyond two, plus class 12 (or diploma) to joining; test: 2022 → 2024 is 2 years |
| History of backlogs (subjects ever failed) | Missing | Built | `max_backlog_history`, `countBacklogHistory` |
| Documents verified before registering | Missing | Built | `require_verified_docs`; required kinds by the `requiredDocs` setting (resume; resume and marks cards; all) |
| Auto-eligible list with reasons | Have | Deepened | `GET drives/:id/eligible` shows class 12 %, gap years, documents; every new reason in words (ERP, Student App) |
| Registration window, late registration by the cell, recheck after a cleared backlog | Have | Have | placements-depth e2e |
| Opt-in, opt-out with reason, debarment for skipping a drive | Have | Have | `placement_optins` |
| Dream, super-dream and one-offer policy | Have | Deepened | category from the package when a drive leaves it unset: `dreamMinLpa`, `superDreamMinLpa` settings (`categoryForCtc`); test: 12 LPA super dream, 9 and 6 dream, then a dream-placed student refused a dream drive |
| Student registration with a resume | Partial: resume kept apart | Built | `drive_registrations.resume_document_id` (0210): the registration keeps the verified (else latest) resume |
| Resume builder from profile data | Partial: typed by hand | Deepened | `GET /v1/careers/resume/draft` (`draftResume`): degree with CGPA, class 10/12 with board and %, internships, apprenticeships, projects, skills, technical training; Student App **Fill from my record** merges without losing entries |
| Placement documents and their verification | Missing | Built | `placement_documents` (0210), upload (PDF/JPEG/PNG, 5 MB, virus scan) by the student or the cell, kit `placement-documents` with **Verify** / **Reject** (reason), the student told each time; Student App upload |
| Student reasons in the Student App | Broken: any reason but five showed "Not open for registration" | Fixed | `_reasonLabel` covers all 15 reasons in en/hi/kn; widget test |

## Selection

| Item | Before | After | Evidence |
|---|---|---|---|
| Rounds: aptitude, GD, technical, interview, HR | Have | Have | `drive_rounds.kind` |
| Round results pass / fail / absent, absence debars | Have | Deepened | `recordResults` batched (checks once, writes in a few statements, notices grouped) |
| Bulk shortlist and results import | Missing | Built | `POST drives/:id/rounds/:roundId/import` (CSV: roll no, optional result and remarks; synonyms such as selected, rejected, AB); check first line by line, refuse errors unless skipped, all or nothing; ERP **Import** on each round; test with five lines |
| Interview slots and venues | Have | Have | `interview_slots` |
| Offers with CTC, offer letter upload, response, joining, revocation, conditional offers, one offer per group | Have | Have | placements and placements-depth e2e |
| Shortlist CSV for recruiters | Broken: cells not guarded against spreadsheet formulas | Fixed | `csvCell` |

## Internships and apprenticeships

| Item | Before | After | Evidence |
|---|---|---|---|
| Application, approval, mentor, diary, attendance, evaluation, supervisor rating, certificate | Have | Have | careers and internship-extras controllers |
| Stipend | Have | Have | `stipend_monthly` (whole rupees) |
| AICTE credits from hours | Partial: credits typed by hand | Deepened | `internships.hours`, `category` (industry, research, in-house, rural, virtual), `mode` (0211); credits from hours at `internshipHoursPerCredit` (45, AICTE 2019) unless entered; hand-entered credits stay; test: 100 h = 2, 140 h = 3 |
| Credits against what the programme asks | Missing | Built | `internshipCreditsRequired` setting; report **Internship credits** (short per student); student dashboard progress |
| Apprenticeships under NATS | Missing | Built | `apprenticeships` (0211): NATS enrolment, establishment id, contract, category, statutory minimum check, Government share (half the minimum, at most half paid: ₹6,150 graduate, ₹5,450 diploma from the 1 April 2026 rates), certificate of proficiency; kit with **Contract registered / Started / Completed / Ended early** |
| Monthly stipend and DBT credit | Missing | Built | `apprenticeship_stipends` (paise, one row a month, idempotent upsert); ERP apprenticeship page with each month due, paid, credited; **Apprenticeships** register report |

## Training

| Item | Before | After | Evidence |
|---|---|---|---|
| Programmes, sessions, attendance, test scores | Have | Deepened | attendance and scores written in one statement each (were one per student); duplicate student refused |
| Training on the demo | Missing | Built | seed: aptitude bootcamp, SQL and Excel, mock interviews with sessions, attendance and two aptitude tests |
| The student sees their training | Missing | Built | dashboard **Training**: attendance % and scores |
| Training page on a phone | Broken: 261px sideways scroll at 390px | Fixed | `TrainingView` overview grid constrained |

## Alumni

| Item | Before | After | Evidence |
|---|---|---|---|
| Directory, verification, events, mentoring, job posts, giving with 80G receipts, volunteering, stories | Have | Have | alumni controllers |
| Referrals | Missing | Built | `placement_referrals` (0211): a student asks a mentoring alumnus (to a job post or a company); the alumnus answers in the alumni portal (`/v1/alumni-portal/referrals`), the student is told; kit `placement-referrals` for the cell; Student App **Ask an alumnus for a referral** |
| Alumni directory for students | Partial: sent the alumnus's login id | Fixed | `userId`, `verifiedBy` left out for students and families |

## Communication and the student's dashboard

| Item | Before | After | Evidence |
|---|---|---|---|
| Round results and offers notified | Have | Have | `notifyStudent` |
| Drive opened: eligible students and families told | Missing | Built | `notifyDriveOpened` on **Open** (kit action and `drives/:id/status`), once per drive (`notified_at`), only the eligible; `notifyEligibleOnOpen` setting; test: only A's father told, not again on reopening |
| Document verified or rejected, referral progress | Missing | Built | notices with their own keys |
| The student's own placement dashboard | Partial: drives and offers list | Built | `GET placements/students/:id/dashboard`; Student App **My placement**: standing (CGPA, backlogs now and ever, class 10/12, gap years, debarment, opt-out, placed category), documents with upload, every registration with each round's result and interview slot, offers, training, AICTE credits, apprenticeships, referrals; family can read |

## Reports

| Item | Before | After | Evidence |
|---|---|---|---|
| Branch-wise placement % with median, average and highest CTC | Partial: no average | Deepened | `branch` report `averageCtc` |
| NIRF GPH / GMS: three graduating years, intake, lateral entry, graduating in minimum time, placed, median salary, higher studies | Partial: one year, no intake | Deepened | `nirf` report; minimum time = no subject whose latest result is a fail; test row worked by hand |
| NAAC 5.2.1, 5.2.2, 5.2.3 over five outgoing batches with averages | Partial: lists only | Built | `naac52` report and `naac52()`; test: 66.67 / 33.33 / 33.33 and averages 13.33 / 6.67 / 6.67 |
| AISHE: outgoing batch by programme, all and women, placed, higher studies, median salary | Missing | Built | `aishe` report |
| Company-wise, offer list, internship register, progression, training, feedback | Have | Have | REPORTS |
| Exportable placement brochure | Missing | Built | `GET /v1/placements/brochure?year=` (PDF): institution, the year at a glance, results by programme, recruiters, training, contacts; ERP **Placement brochure** button |
| IQAC reads the placement reports | Missing: the ERP page sent the quality officer away | Built | reports page lets `quality_officer` in (the API already allowed it) |
| Report year and counts in IST | Broken: `new Date().getFullYear()` and UTC `created_at` years | Fixed | year from `tenantToday`; `at time zone 'Asia/Kolkata'` |
| Report downloads for new report ids | Broken: the download route refused ids with digits (`naac52`) | Fixed | `apps/erp/src/app/api/download/route.ts` |

## Hardening

- Every new endpoint has a role check (`PLACEMENT_ROLES` to write, `PLACEMENT_VIEW_ROLES` to read, the student only for
  their own documents and referrals, the alumnus only for referrals sent to them) and runs under row-level security;
  the e2e checks a teacher refused (403) and another institution seeing nothing (0 rows or 404) on each new list.
- Bodies and queries are Zod-validated; money is integer paise (stipends, DBT); dates are IST days.
- Idempotent: stipend months (upsert), results import (upsert, check before commit), drive-open notice (once).
- N+1 removed: eligibility list, drive-open notice, round results, training attendance and scores. Legacy lists capped.
- No PII in logs; the recruiter key hash and alumni login ids no longer leave the server.

## Seed (Soundarya)

Settings (dream from 6 LPA, super dream from 10, 14 credits, NATS rates), gender and class 10/12 for the final year,
the final year's published results of the semesters done (eligibility reads a CGPA), 23 recruiter interactions with
three follow-ups due, stricter criteria on two drives and an open women-only fellowship, 91 placement documents in
every state, three training programmes, internship hours and credits, five outgoing batches (2022 to 2026, about two in
three placed, the rest to higher studies, exams and ventures), four NATS apprenticeships with stipends and one DBT
credit outstanding, seven referrals.

## Not done

- CTC stays as an exact decimal in lakh a year (`numeric(6,2)`), as before; stipends and DBT are paise.
- The Parent App keeps its read-only careers screen; the new dashboard is wired in the Student App.
- NIRF "graduating in minimum time" reads results on record (no separate degree-award date is kept).
