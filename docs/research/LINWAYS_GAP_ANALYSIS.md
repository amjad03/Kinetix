# KINETIX vs Linways: Gap Analysis

Date: 2026-10-10. Status legend: **Have** (equal or better), **Partial**, **Missing**, **Unk** (Linways detail unknown), **Exp** (Expected, market norm: not advertised by Linways but an Indian buyer will ask).
Goal is feature parity, not a copy of Linways UI, text or branding.

## 1. Summary and score

**Overall: 6.0 / 10 vs Linways.** Breadth and engineering surface are at or above Linways (and KINETIX adds a smartboard stack, Indic/school coverage, DPDP tooling). The score is held down because Linways has 15+ years, ~dozens of live Kerala/Bangalore institutions and accreditation reports that real NAAC/NBA teams use. KINETIX has zero live customers, nothing exercised against real vendors, and unverified official-format exports.

| Area (weight) | Score | Why |
|---|---|---|
| Feature breadth (25%) | 8.5 | Nearly every Linways module has a counterpart; adds smartboard, school, research, AI tutor. |
| Workflow depth (25%) | 6.5 | Deep in exams/OBE/fees/HR; unverified at the "last 10%" (transcripts, purchase, index mark, university-specific formats). |
| Accreditation/reporting readiness (20%) | 5 | Evidence workbench and CO/PO exist; no confirmed SSR/SAR/AQAR/NIRF/AISHE portal-format export, no DVV support. Linways sells this as a flagship. |
| Integrations (15%) | 3.5 | Razorpay + MSG91 + CSV biometric only. No DigiLocker/NAD/ABC, 2nd gateway, live Tally, SSO, LTI, Teams/Meet, live biometric. |
| Production maturity (15%) | 1.5 | Demo only. No customers, no SLA history, no pen-test, no ISO 27001, no support org, no migration track record. |

Weighted: 0.25*8.5 + 0.25*6.5 + 0.2*5 + 0.15*3.5 + 0.15*1.5 = **6.0** (rounded). If buyers weight maturity heavily (typical for college procurement), the effective score for a first sale is ~4.5. Closing P0 integrations, accreditation exports and a pilot would move it to ~7.5; matching Linways on maturity takes 1-2 years of live operation.

## 2. Method and source limits

- Linways side: public pages only (linways.com features, module pages, pricing, customers, customer-college sites). Tags [OFF]/[3P]/[INF]/[UNK] in `linways_inventory.md`. Many modules are name-only (Engagement, Skill Mapping, Slow Learner, SDG, Club, AI attendance, Internship); mechanics unknown. No demo, no tender documents, no app-store text, no reviews.
- KINETIX side: `kinetix_inventory.md` (static code/controller audit, PRD_COVERAGE 422 Built / 19 Partial / 7 Missing). Nothing was run against real vendors. "Have" means code and routes exist, not production-proven.
- Spot verification greps (services/api/src, apps/erp/src) were done for non-obvious items; cited in the table. A keyword hit is evidence of presence, not of depth.
- "Exp" items come from Indian higher-ed norms (NAAC SSR/AQAR 7 criteria, NBA SAR, NIRF, AISHE, UGC ABC/APAAR, NAD/DigiLocker, CBCS/NEP 2020, affiliating-university workflows, Tally), not from Linways pages.

## 3. Area-by-area table

| # | Area | Linways | KINETIX | Status | Evidence / note |
|---|---|---|---|---|---|
| 1 | Roles/portals (mgmt, principal, HoD, faculty, student, parent, exam controller, ext. examiner, placement) | Yes | RBAC + audit, delegations, 5 consoles, 4 apps | Have | api/delegation, api/auth; ext. examiner portal: Partial (second-valuation exists, dedicated external login unverified) |
| 2 | Attendance + reports + alerts | Yes | Eligibility, condonation, board loop | Have | api/attendance-governance |
| 3 | AI/face attendance | Listed (name only) | Not built (DPDP stance) | Missing (deliberate) | Unk detail at Linways |
| 4 | Timetable, substitutions | Yes | Yes (small module) | Have/Partial | api/timetable, api/scheduling; auto-generation quality unverified |
| 5 | Lesson planner / course planner (proposed vs actual) | Yes | lesson plans, plans/planner | Have | api/plans/planner.spec.ts, grep lesson-plan 23 files |
| 6 | Student planner | Yes | Partial | Partial | only api/plans suggest |
| 7 | Internal marks, progress report, rank list, normalised marks | Yes | marks, normalisation, ranks.ts | Have | api/exams/ranks.ts, api/marks |
| 8 | Course material / doc repository / discussion forums | Yes | course-files, content, lms-ext, messages | Have | forums: Partial (grep forum not confirmed) |
| 9 | Notifications, SMS/mail to parents | Yes | MSG91 + DLT guard, push, realtime | Have | api/auth/sms-sender; WhatsApp blocked on BA account |
| 10 | Online feedback / polls / surveys | Yes | surveys, polls | Have | api/surveys |
| 11 | Faculty evaluation / infra evaluation | Yes | surveys + appraisal | Have | api/hr appraisal (8 files) |
| 12 | Principal Insights / dashboards | Yes | analytics, coverage, report builder | Have | api/analytics |
| 13 | Student leave, leave mgmt | Yes | leave (67 files) | Have | api/hr |
| 14 | Grievance | Yes | Yes | Have | api/welfare, grievance 33 files |
| 15 | Mentoring | Yes | Yes, risk->task | Have | api/mentoring |
| 16 | Slow learner analysis | Listed | No dedicated; retention/at-risk exists | Partial | api/retention |
| 17 | Admission CRM, enquiry, lead mgmt, landing page | Yes | public-admissions, growth.controller, lead-score | Have | api/admissions/growth.controller.ts, lead-score.ts |
| 18 | Marketing ROI, social ad tracking | Yes | growth.controller (extent unverified) | Partial | |
| 19 | Index mark + rank list for admission | Yes | rank/merit hits but no "index mark" | Partial | api/admissions/entrance.service.ts |
| 20 | Admission agents | Yes | agent hits (15 files), unverified | Partial | |
| 21 | Entrance tests, event registration, career pages | Yes | entrance, events, careers | Have | |
| 22 | Fees: heads, challan, receipts, fines, concessions, instalments, refunds, wallet | Yes | Yes | Have | api/fees, api/finance; challan 5 files |
| 23 | Payment gateways | Unk | Razorpay + PayU behind one gateway interface (order, hosted checkout, webhook signature, refund, settlement); tenant chooses; settlement reconciliation with exceptions queue | Have | api/fees (PayU sandbox only; Cashfree not integrated) |
| 24 | Tally integration | Yes | GL export plus live Tally Prime sync (XML over HTTP, ledger mapping, sync log with retry, offline XML file) | Have | api/tally; tested with a fake Tally server |
| 25 | Accounting books (vouchers, ledgers, BS) | Unk | Chart of accounts, receipt/payment/journal/contra vouchers, ledgers, day book, trial balance, income and expenditure, balance sheet, fee receipts auto-post, year close | Have | api/books |
| 26 | Exams: registration, types (regular/reval/supply/lab), hall, seating, invigilation | Yes | Yes | Have | api/exams (seating.ts, hall-ticket-code.ts, registration-rules.ts) |
| 27 | Dummy/false numbers, anonymisation | Yes | evaluation/scan-sanitise, anonymise | Have | api/evaluation |
| 28 | Grace marks, moderation | Yes | grace in 26 files, marks moderation | Have | |
| 29 | Revaluation, supplementary | Yes | Yes | Have | api/exams, api/marks |
| 30 | Consolidated mark list, result analysis | Yes | results.controller | Have | |
| 31 | Certificate generation + online verification | Yes | documents + public-verify QR, degree cert PDF | Have | api/documents |
| 32 | Digital evaluation (on-screen) | Yes | scripts, scan upload, annotation, allocate, finalise | Have | api/evaluation; OCR absent |
| 33 | Exam controller module | Yes (autonomous) | exam-ops | Have | |
| 34 | External examiner portal | Yes | second valuation; dedicated portal unverified | Partial | |
| 35 | Question paper generation + scrutiny + Bloom/K-level | Yes | question-bank, paper-release, bloom 16 files, scrutiny 2 | Have/Partial | scrutiny workflow thin |
| 36 | Online exams | Yes | assessment-tools, lms | Have | proctoring unverified |
| 37 | LMS: classes, assignments, repository, video conf | Yes | lms, homework, recordings, live | Have | Teams integration absent |
| 38 | MS Teams / Meet / Zoom integration | Teams listed | Zoom, Google Meet and Teams adapters; meeting from timetable slot; participant report becomes suggested attendance the teacher confirms; join links API for teacher, student and board (Flutter UI pending) | Partial | api/connectors |
| 39 | LTI / SCORM | Unk | Missing | Missing/Exp | |
| 40 | CBCS: electives, allocation, credits | Yes | course-registration (elective rules) | Have | api/course-registration/registration-rules.spec.ts |
| 41 | OBE: CO/PO/PSO, attainment, CQI | Yes (Ease OBE) | obe + quality, CQI root-cause | Have | api/obe |
| 42 | Course file | Yes | course-files | Have | |
| 43 | SDG mapping | Listed | sdg hits (9 files) | Have/Unk | |
| 44 | Skill mapping | Listed | skills module | Have/Unk | |
| 45 | Accreditation: SSR/SAR autogen, criteria reports, gap analysis, score estimate | Yes (flagship) | frameworks, criteria, evidence, harvest, NAAC/NBA/NIRF logic | Partial | api/obe/quality.logic.ts; no verified official-format export |
| 46 | AQAR, DVV, AISHE returns | Unk (not mentioned) | AISHE fields; AQAR 1 file | Partial/Exp | |
| 47 | Academic audit | Yes | academic-audit | Have | |
| 48 | Committees, event planning | Yes | events, governance | Have | |
| 49 | E-Governance custom workflow builder | Yes | workflows + delegations (38 files) | Have/Partial | builder UX depth unverified |
| 50 | HR: recruitment, leave, payroll, appraisal | HRIS, leave, appraisal (payroll Unk) | Full incl. payroll, exit | Have (better) | api/hr |
| 51 | Biometric integration | API | CSV import only | Partial | |
| 52 | Library + Koha + digital library | Yes | Full library | Have | RFID missing; Koha n/a |
| 53 | Hostel | Yes | Yes + canteen | Have | |
| 54 | Transport (routes, pickup-point reports) | Yes | Yes | Have | GPS/RFID unverified |
| 55 | Infrastructure mgmt, exam hall mgmt | Yes | assets, inventory | Have | |
| 56 | Placement, training, internship | Yes | Full | Have | |
| 57 | Alumni (fundraiser) | Listed | alumni-portal, giving | Have | |
| 58 | Project collaboration, clubs/associations | Yes | projects, campus-life clubs | Have | |
| 59 | Messagebox, engagement | Listed | messages, conversations, ptm | Have | |
| 60 | Parent app/portal | Yes | Parent app (115 dart files) | Have | |
| 61 | Mobile apps (iOS/Android) | Yes | Flutter x4, not device-verified | Partial | store release not done |
| 62 | Power BI / BI export | Yes | report builder; no Power BI connector | Partial | |
| 63 | Plagiarism checker | Yes | internal similarity (thesis); Turnitin external | Partial | api/research |
| 64 | AI features (lesson plan, QP, CO-PO, predictive) | Marketing claims | ai module, tutor, insights, grading-assist; no real embeddings | Have/Partial | api/ai |
| 65 | Coding assessment (Codeways) | Separate product | api/code + code-runner doc | Have | |
| 66 | Variants: autonomous, affiliated, engg, MBA, medical, diploma | Yes | 7 institution types, presets, module gate | Have | api/institution |
| 67 | Multi-campus / group of institutions | Yes (groups) | multi-campus, university | Have | |
| 68 | Security: WAF, TLS, backups, ISO 27001/DPDP in progress | Yes | DPDP tooling, MFA, audit, backup doc | Partial | no certification |
| 69 | Support, migration, onsite training | Add-ons | none | Missing | org, not code |

## 4. Missing list (ranked by sales impact)

1. Production proof: live pilot, SLA/uptime record, support desk, security audit (not code).
2. DigiLocker issuer, NAD/ABC/APAAR ID linkage (0 code hits).
3. Official-format NAAC SSR/AQAR, NBA SAR, NIRF, AISHE exports (unverified; AQAR not present).
4. Live Tally sync (export only) and full double-entry books.
5. Second payment gateway (Cashfree/PayU/BillDesk) and bank-grade reconciliation.
6. SSO/OIDC/SAML completion (Google/Microsoft workspace), plus Microsoft Teams/Meet scheduling.
7. Live biometric/RFID (attendance, library, transport) integrations.
8. LTI/SCORM/Moodle import; Linways data-migration importer.
9. WhatsApp Business (account blocked), real embedding model for AI.
10. Dedicated external examiner portal; standalone transcript; OCR for scripts/curriculum.
11. Face/AI attendance (deliberate, DPDP; revisit with consent design).
12. Power BI connector; Koha/SIP2 interop.

## 5. Partial list

Accreditation workbench; admission index mark and agent commissions; marketing ROI; gateways; Tally; biometric CSV only; Teams/Meet; plagiarism (internal only); student planner; slow learner; question paper scrutiny; e-governance builder UX; external examiner; mobile gaps (teacher course file/CO-PO, student diary/report card); DPDP/security certification; Power BI; transcript.

## 6. KINETIX advantages (not advertised by Linways)

| Advantage | Evidence |
|---|---|
| Smartboard/classroom board app (whiteboard, cast, session, exit ticket, offline dictionary, graphic organisers, on-device captions) | apps/board (293 dart files), api/whiteboards, cast, exit-tickets |
| School + higher-ed + coaching in one platform (school-academics, school-learning, school-life) | api/school-* |
| Indic/regional language and Indic-first UX, i18n docs | docs/i18n (verify language coverage before claiming) |
| DPDP consent, data-principal tooling, audit | api/dpdp, api/consent |
| Anti-collusion exam analytics, integrity | api/exams/anti-collusion.ts, api/integrity |
| Built-in AI tutor, grading-assist, local hashed RAG | api/ai, api/grading-assist |
| Research/IPR/thesis/datasets, alumni giving | api/research, api/placements |
| Offline-sync, devices pairing, remote classroom | api/sync, devices, pairing, remote |
| Custom report builder included (Linways gates custom reports to Enterprise) | api/analytics, ERP/reports |
| Modern API-first stack, ~118 migrations, flags, observability | api/flags, observability |

## 7. Plan by phase

Effort: S <2 wks, M 2-6 wks, L 6+ wks (one engineer unless noted).

### P0: must-have to sell to an Indian college/university

| Item | Build | Acceptance criteria | Effort | Dependencies |
|---|---|---|---|---|
| Pilot institution | Sign 1-2 friendly colleges (ideally Kerala/Karnataka affiliated + one autonomous); run a full semester | Real attendance, internal marks, fee collection, one exam cycle in production | L | Relationship, MoU, support owner |
| Linways/Excel data-migration | Importers for students, faculty, subjects, marks, fee ledgers, attendance; mapping templates | Pilot's full back-data imported with reconciliation report, <1% manual fixes | M | Sample exports from pilot; Linways export format (open question) |
| Accreditation exports | Verified NAAC SSR/AQAR criterion-wise metrics (7 criteria, QnM/QlM), NBA SAR (SAR tables, CO/PO), NIRF data, AISHE; gap analysis and score estimate | Generated report matches latest official template; reviewed by a NAAC consultant on pilot data | L | NAAC/NBA templates; domain reviewer |
| Result/exam university formats | Affiliating-university specific mark lists, internal-mark normalisation, grace rules, transcript and provisional certificate | One target university's format reproduced exactly; standalone transcript endpoint | M | University rule documents |
| Payments + reconciliation | Add Cashfree and/or PayU/BillDesk adapter; settlement reconciliation; receipts/80G-style where needed | Sandbox end-to-end incl. webhook signature, refund, settlement recon | M | Merchant accounts (sandbox then live); follow Cashfree skills when integrating |
| Tally Prime live sync | Push vouchers via Tally XML/HTTP, ledger mapping, sync log | Fee receipts and expenses appear in Tally company with matching totals | M | Tally Prime test install |
| SMS/WhatsApp production | MSG91 DLT templates approved; WhatsApp BA connect | Delivery receipts in prod for attendance/fee/result alerts | S | DLT registration, Meta BA account |
| SSO | Complete OIDC for Google Workspace and Microsoft Entra | DONE: OIDC code+PKCE, domain to tenant, JIT link, admin page, ERP sign-in; mobile/board system-browser flow pending (API ticket exchange ready) | S-M | Tenant test accounts |
| Security and compliance | Third-party pen-test, fix findings, KMS field encryption, DPDP records, backup restore drill | Report with zero open high/critical; restore tested | M | Budget, vendor |
| Hosting, SLA, support | Managed cloud in India region, 99.5% SLA, monitoring/alerting, status page, support desk and runbooks | 30 days measured uptime; response-time policy published | M | Cloud account, on-call person |
| Mobile store release | Device-verify teacher/student/parent apps, publish to Play/App Store | Apps installed on pilot devices, crash-free >99% | M | Apple/Google developer accounts |

### P1: competitive parity and differentiation

| Item | Build | Acceptance | Effort | Dependencies |
|---|---|---|---|---|
| DigiLocker issuer + NAD/ABC/APAAR | Issuer API for degree/marksheet; store APAAR/ABC ID, NAD upload | Sandbox document pushed and fetched; ID captured at admission | L | DigiLocker partner onboarding, NAD registration, legal |
| Live biometric and RFID | Vendor API/webhook for devices (eSSL, Matrix etc.), library and transport RFID | Punch appears in attendance within 1 min | M | Device hardware |
| Teams/Meet/Zoom scheduling | Create meetings from timetable, attendance import | One-click class link, attendance pulled | M | Tenant/API accounts |
| Admission depth | Index mark, rank list, agent commissions, ad-campaign ROI, Meta/Google lead connectors | Admission cycle run end to end incl. CAP-style rank list | M | Ad accounts |
| External examiner portal and scrutiny workflow | Scoped login, anonymised scripts, QP scrutiny states | External examiner completes valuation without ERP seat | M | |
| LTI 1.3/SCORM, Moodle bridge | LTI tool provider/consumer | Import a SCORM package; LTI launch works | M | |
| Accounting books | Vouchers, ledgers, trial balance, balance sheet (or certified Tally-only stance) | Matches Tally for pilot FY | L | Accountant reviewer |
| Power BI/Excel connector, Koha/SIP2 | OData feed | Power BI dataset refresh | S | |
| Real embeddings for AI | Hosted or local embedding, vector store | Retrieval eval beats hashed trigram baseline | M | Model hosting (docs/operations/ai-hosting.md) |
| Slow learner and early alert | Dedicated analytics on retention data | Faculty list of flagged students with interventions | S | |

### P2: later

| Item | Build | Acceptance | Effort | Dependencies |
|---|---|---|---|---|
| Face/AI attendance | Opt-in, consent-first, on-device | DPDP review passed | L | Legal, hardware |
| OCR for scripts/curriculum | Model or vendor OCR | >95% field accuracy on sample | L | Vendor/model |
| ISO 27001 / SOC 2 | Certify | Certificate | L | Auditor, budget |
| Dedicated/on-prem deployment | Helm/installer | Install in college DC | L | |
| Multilingual UX (regional) | Verify and complete Malayalam, Hindi, Kannada, Tamil, Telugu | Reviewed by native speakers | M | Translators |
| Partner and training programme | Onsite training, certification of implementers | 3 partners live | M | |

### Go-to-market and production readiness

| Item | Detail |
|---|---|
| Positioning | Lead with smartboard + school-to-university breadth + OBE/exam depth + transparent pricing; avoid claiming NAAC auto-reports until verified |
| Pricing | Tiered but with custom reports included; 6-month minimum is Linways norm (match flexibility) |
| Data migration service | Fixed-price offering with importer tooling |
| Support | Tickets, WhatsApp support, named CSM for first 5 customers |
| Legal | DPA, DPDP notices, T&C, SLA, data residency in India |
| References | 2 pilot case studies before approaching tenders; prepare tender response template |

## 8. Open questions to verify with a Linways demo

1. Which NAAC/NBA/NIRF formats are produced, and are they official-template Excel/Word or on-screen? Is AQAR/DVV covered?
2. How do they handle university-specific internal-mark rules (KTU, MG, Kerala, Bangalore, autonomous)?
3. Payment gateways, settlement reconciliation and Tally sync mechanics (live vs file).
4. Biometric vendor list and API shape; Koha integration depth.
5. DigiLocker/NAD/ABC support (claimed or not).
6. Hall ticket, transcript, degree certificate, revaluation workflow detail.
7. AI features: real or marketing; AI attendance accuracy and consent model.
8. Data export formats for migrating customers out (needed for our importer).
9. Customer count, uptime history, support SLAs, ISO status.
10. Which modules are Lite/Professional/Enterprise-only.
11. Mobile app feature depth and parent-app separateness.
12. E-governance builder: actual capabilities vs form-routing.
