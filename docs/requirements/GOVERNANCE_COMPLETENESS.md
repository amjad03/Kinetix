# Governance, quality and compliance: completeness against Linways, the big Indian ERPs and Indian regulation (checklist sections 7, 18 and 20 and the pass brief)

Audit of `docs/research/MODULE_DEPTH_CHECKLIST.md` (sections 7, 18, 20), `GRIEVANCE_DISCIPLINE_WELFARE_DETAILED_SPEC.md`,
`OBE_ACCREDITATION_DETAILED_SPEC.md` and the governance pass brief, read in code and exercised against the Soundarya seed
(API on a seeded database `zynetix_gov_demo`, the ERP pages in Playwright at 1280px, 390px and in Kannada with
`apps/erp/scripts/governance-qa.mjs`: 48 page loads, no error state, no sideways scroll, no console errors, no raw
message keys), API e2e and Teacher and Student App widget tests. **Before** is the branch at `78ad042`.

Status words: **Have** (built and tested before), **Built** (missing before, built now), **Deepened** (partial before,
gaps closed now), **Fixed** (broken before). Migrations: `0218_governance_committees_policies_rti`,
`0219_governance_compliance_disclosure_dpdp`. New tests: `services/api/test/governance-pass.e2e.spec.ts` (10 workflows,
figures worked by hand in comments, another role and another institution refused on each),
`src/governance/statutory.spec.ts` (16 rule groups: composition, quorum, minutes fingerprint and approval, RTI, DPDP and
calendar dates, reminder steps), `apps/erp/src/lib/governance-pass.test.ts` (4), `apps/teacher/test/governance_test.dart`
(4), `apps/student/test/policies_test.dart` (3).

Counts (66 items): before **23 Have, 2 Partial, 35 Missing, 6 Broken**; after **66 Done** (23 Have, 43 Built,
Deepened or Fixed).

## Statutory committees

| Item | Before | After | Evidence |
|---|---|---|---|
| Committee register with members, roles, tenure, meetings, minutes, action items, evidence and report pack | Have | Have | `campus-life/committees.controller.ts`, `life-extras.controller.ts` |
| The statutory bodies a college must keep (IQAC, anti-ragging committee and squad, ICC, SGRC, SC/ST cell, minority and equal-opportunity cells, governing body/CDC, academic council, BoS, finance committee) with the regulation, mandate, meetings a year and quorum | Missing | Built | `governance/statutory.ts` `COMMITTEE_RULES`; `committees.kind`, `mandate`, `meetings_per_year`, `quorum_pct`, `order_ref`, `constituted_on` (0218); `POST /v1/governance/committees/setup` creates the missing required ones once |
| Composition checked against the regulation: chair, minimum members, women share and a woman presiding (POSH Act s.4), an NGO or legal member, student and woman members (UGC 2023), outside members (IQAC, anti-ragging), tenure limits | Missing | Built | `compositionIssues`; e2e: a man presiding and 33% women refused, fixed to 60% with an NGO member |
| Outside members without an account (NGO, lawyer, police, parent, media) and student members by roll number | Missing | Built | `committee_members.user_id` nullable, `name`, `category`, `gender`, `designation`, `phone`, `contact_public` (0218); gender defaults from the staff or student profile |
| Agenda items with discussion, resolution and outcome | Partial: agenda as one text | Built | `committee_agenda_items` (0218); `PUT meetings/:id/agenda` keeps linked actions when positions are unchanged |
| Notice to the members with the agenda | Missing | Built | `POST meetings/:id/notice` (en/hi/kn notification) |
| Attendance and quorum | Missing | Built | `committee_meeting_attendance` (0218); quorum = ceil(members x quorum %); circulation refused without quorum (`NO_QUORUM`) |
| Minutes circulated, approved or objected to by the members present, signed (e-sign) | Missing | Built | `committee_minute_signoffs` (0218): SHA-256 fingerprint of title, date, text, agenda and attendance; HMAC signature per member; approved when the chair (or secretary) and half of those present who can sign approve with no objection; revise invalidates old signatures but keeps them on record; tampering shows "does not verify" (e2e) |
| Minutes fixed once circulated, including through the campus-life page | Broken: minutes stayed editable | Fixed | `campus-life/committees.controller.ts` refuses edits unless the minutes are a draft (e2e) |
| Minutes PDF with attendance, resolutions, actions, fingerprint and signatures | Partial: report pack without signatures | Built | `governance/minutes-pdf.ts`, `GET meetings/:id/minutes.pdf` |
| Action-taken report (ATR): action taken, evidence, reported on, overdue, Excel | Partial: status only | Deepened | `committee_action_items.action_taken`, `reported_on`, `evidence_url`, `agenda_item_id` (0218); `PUT action-items/:id/report` by the owner; `GET atr/report(.xlsx)` |
| Meetings held this year against the norm, minutes pending, overdue actions | Missing | Built | `GET /v1/governance/committees/compliance` (share of the academic year gone) |
| A teacher who chairs or is secretary manages their own committee's meetings | Missing: office only | Built | `CommitteeGovService.canManage` (e2e: chair schedules, another teacher refused) |
| Demo meetings counted as held | Broken: seed wrote `completed`, the pages count `held` | Fixed | seed `governance-pass.ts` |
| Members sign and act from the Teacher App | Missing | Built | `apps/teacher` Profile → Governance: minutes to approve or object, actions to report |

## IQAC, accreditation and statutory returns

| Item | Before | After | Evidence |
|---|---|---|---|
| IQAC members, meetings, actions, initiatives, feedback with ATR, best practices, AQAR register | Have | Have | `accreditation/iqac.records.ts`, ERP `/accreditation/iqac` |
| NAAC SSR: all 7 criteria, metric entry auto-filled from the modules, evidence, comments, readiness, export | Have | Have | `accreditation/frameworks/naac.ts`, `sources.ts`, `auto.ts`, `exports.ts` |
| AQAR yearly export | Have | Have | `GET :fw/aqar.xlsx` |
| DVV clarification tracker | Have | Have | `dvv_queries`, `GET :fw/dvv.xlsx` |
| NBA SAR (Tier I, Tier II, PG management) | Have | Have | `frameworks/nba*.ts` |
| NIRF data capture (college, university, engineering, management, pharmacy) | Have | Have | `frameworks/nirf.ts` |
| AISHE DCF-II and UDISE+ | Have | Have | `frameworks/returns.ts` |
| AICTE EoA and UGC mandatory-disclosure metrics | Have | Have | `frameworks/regulatory.ts`, `exports-returns.ts` |
| Quality metrics dashboard (readiness by criterion) | Have | Have | `/:fw/readiness`, ERP accreditation hub |
| Stakeholder feedback on the curriculum with action taken (NAAC 1.4) | Have | Have | surveys + `iqac_feedback_reports` |
| Mandatory disclosure page published on the website | Missing | Built | `GET /v1/public/disclosure/:slug` (published only), ERP `/disclosure/[slug]`: profile, typed sections, programmes, public committees with members and helplines, public policies, grievance figures and officers |
| Typed disclosure lines (approvals, fees, infrastructure) and the publish switch | Missing | Built | `disclosure_items` (record kit, order, public flag, link check), `disclosure_settings` (0219) |
| Public policy texts linked from the page | Missing | Built | `GET /v1/public/disclosure/:slug/policies/:versionId` |

## Grievances and welfare

| Item | Before | After | Evidence |
|---|---|---|---|
| Students, parents and staff raise grievances; anonymous; SLA; escalation; committee confidentiality; appeal; rating | Have | Have | `welfare/grievances.controller.ts`, welfare e2e |
| UGC e-Samadhan (and AICTE, CPGRAMS, university, state) reference on a ticket | Missing | Built | `grievance_tickets.external_portal`, `external_ref`, `external_ref_on` (0219); `POST /v1/grievances/:id/external-ref`; register filter and export columns |
| Grievance figures on the disclosure page and the board dashboard | Missing | Built | received, resolved, average days, external |
| Scholarships, counselling (confidential), divyang accommodations, NSS/NCC units and hours, anti-ragging undertakings | Have | Have | welfare and campus-life registers |
| Discipline appeal window measured on the institution's clock | Broken: action stamped by the database clock, the window by the app clock (test failed after its fixed date) | Fixed | `discipline.controller.ts` stamps `created_at` from `Clock` |

## Policies and document control

| Item | Before | After | Evidence |
|---|---|---|---|
| Policy register (code, category, owner, review cycle, public flag, roles that must acknowledge) | Missing | Built | `governance_policies` (0218), kit `governance-policies` |
| Versions: draft, review, approval by someone other than the author (`FOUR_EYES`), publication; superseded versions readable | Missing | Built | `governance_policy_versions`; one published version at a time (partial unique index) |
| Approved text fingerprinted; tampering flagged | Missing | Built | `content_hash`; publish refused if the text changed after approval; `intact` flag |
| Published to the roles that must acknowledge, with a notification; reminders to those pending | Missing | Built | `POST versions/:id/publish`, `remind` (en/hi/kn) |
| Acknowledgement, per person, with who is pending | Missing | Built | `governance_policy_acks`; `GET versions/:id/acks`; e2e: 4 teachers, 2 acknowledged = 50%, version 2 starts at 0 |
| Review date from publication | Missing | Built | `next_review_on`, "due for review" filter and dashboard count |
| Teachers and students read and acknowledge in their apps | Missing | Built | Teacher App Governance → Policies; Student App Profile → Policies |
| Document versions, retention and legal hold (vault) | Have | Have | `governance.controller.ts` retention, versions |

## Right to information

| Item | Before | After | Evidence |
|---|---|---|---|
| RTI register with the statutory reply date: 30 days, 48 hours for life or liberty, 5 more via an assistant PIO | Missing | Built | `rti_requests` (0218), kit `rti-requests`, `rtiDueOn`; number series `RTI` |
| Transfer (s.6(3)), reply with further fee at Rs 2 a page, free when late (s.7(6)) or BPL, refusal under a section of the Act | Missing | Built | kit actions; e2e: late reply 12 pages = Rs 0, on time 5 pages = Rs 10, `8(1)(z)` refused |
| First appeal within 30 days, decided by the FAA (allowed, partly, dismissed) | Missing | Built | actions `appeal`, `appealAllowed`, `appealPartly`, `appealDismissed` |
| Quarterly return (s.25): received, carried in, transferred, replied, refused by section, fees, appeals, late | Missing | Built | `GET /v1/governance/rti/register` |
| The PIO reminded in the last five days and when overdue | Missing | Built | daily job `governance.compliance-reminders` |

## Compliance calendar, audit and the board

| Item | Before | After | Evidence |
|---|---|---|---|
| Regulatory deadlines with authority, owner, reference and state (overdue, due soon, upcoming, done, missed, waived) | Missing | Built | `compliance_deadlines` (0219), kit `compliance-deadlines`, ERP calendar by month |
| The standard deadlines of an Indian college (anti-ragging undertakings, Form 10B, UGC self-disclosure, ITR-7, AQAR, ICC annual report, AISHE, NIRF, AICTE EoA, TDS, RTI return, EPF) | Missing | Built | `STANDARD_DEADLINES`, `POST /v1/governance/compliance/standard` (idempotent per year) |
| Recurrence: done rolls a monthly, quarterly or annual deadline on (month ends kept) | Missing | Built | `nextOccurrence`, `addMonths`; e2e: IIQA done, next year created; reopen refused once rolled on |
| Reminders 30, 7 and 1 day before, once per step, and once when missed | Missing | Built | `reminderDue`, daily job; e2e drives the clock: day 0 (7-day step), day 3 nothing new, day 6 (1-day step) |
| Audit log of every change with before and after | Have | Have | `common/audit.ts`, ERP `/audit` |
| Incident register with the 72-hour breach clock | Have | Have | `governance.controller.ts` |
| Internal academic and administrative audit (AAA) with non-conformities | Have | Have | `academic-audit.controller.ts` |
| Business rule registry (versions, four eyes) | Have | Have | `governance.records.ts` |
| Board and management dashboard: committees, meetings against norms, minutes pending, actions, grievances, RTI, calendar, policies, DPDP, incidents, audit findings, AQAR and DVV | Missing | Built | `GET /v1/governance/dashboard`, ERP `/governance` |

## Data protection (DPDP Act and Rules, 2025)

| Item | Before | After | Evidence |
|---|---|---|---|
| Copy of my data, correction, erasure with legal retention | Have | Have | `dpdp/*` |
| Grievance to the data fiduciary and nomination (s.14) | Missing | Built | kinds `grievance`, `nomination`, `dpdp_requests.nominee` (0219) |
| Answer-by date (30 days for a right, 90 for a grievance, rule 14(3)) and the overdue queue | Missing | Built | `dpdp_requests.due_at`, `?overdue=true`; earlier requests back-filled |
| Requests and decisions on the institution's clock | Broken: `new Date()` | Fixed | `DpdpService` uses `Clock` |

## Tests on the clock

| Item | Before | After | Evidence |
|---|---|---|---|
| `governance-access` delegations | Broken: hard-coded November 2026 dates turned "upcoming" into "active" | Fixed | dates counted from the test clock |
| `welfare` discipline, counselling and welfare requests | Broken: appeal window fixed date, and a failing test left the clock moved for the next three | Fixed | clock stamped action, `afterEach` resets the clock |

## Hardening

- Every new endpoint has a role check: office (`tenant_admin`, `principal`, `quality_officer`, and `hod` for
  committees), the committee's own chair or secretary for its meetings, members for reading and signing minutes, the
  owner for reporting an action, the audience for acknowledging a policy; the e2e checks a teacher or student refused
  (403/404) and another institution seeing nothing on each list. `docs/security/AUTHZ_MATRIX.md` regenerated, no flags.
- Bodies Zod-validated; money in paise (RTI fees); dates IST days from the institution's clock; kit filters on
  `now() at time zone 'Asia/Kolkata'`.
- Idempotent: statutory set-up, standard deadlines, reminders (one per step), acknowledgement, signatures (one per
  member per text), disclosure settings upsert.
- No N+1 on lists: compliance, members and acknowledgement counts are grouped queries; acknowledgement lists paginate (200).
- No PII in logs; RTI applicant details stay in the register; DPDP nominee only with the request.

## Seed (Soundarya)

Eight statutory committees mapped or set up with kinds, norms, order references, helplines; outside members (lawyer of
an NGO on the ICC, police inspector, parent and press on the anti-ragging committee, industry, alumna and local society on
the IQAC, trust chairman and university nominee on the governing body); student members; this year's meetings with
agenda, attendance, minutes approved and signed (the latest IQAC minutes still with the members), action-taken reports;
the SC/ST cell without a chair and an SGRC term over the limit (attention); eight policies (two with a superseded
version, one in review, one due for review) with about 900 acknowledgements; six RTI requests (replied, refused 8(1)(j),
transferred, overdue, appeal pending); the year's standard deadlines with past ones done and the ITR overdue; the
disclosure page published; a grievance on e-Samadhan; a DPDP grievance and a nomination.

## Not done

- Minutes are signed electronically inside ZYNETIX (server-held HMAC key); Aadhaar eSign or DSC through a licensed ASP
  is not integrated.
- The RTI register is the institution's own; filing on the RTI Online portal and the Information Commission's second
  appeal are recorded only as a flag.
- Standard deadline dates are the usual ones; each portal's notified window for the year must be checked and edited.
- The Parent App does not have a policies screen yet (no seeded policy targets guardians).
