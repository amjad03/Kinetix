# Spec v2 vs built — gap analysis (2026-10-08)

Audit of `docs/requirements/` (Detailed System Requirements Pack v2) against the code on
`claude/kinetix-ecosystem-overview-lpphjn`. Update this file whenever a domain lands.

## Architecture decisions: agreed deviations from the pack

| Pack says | We built | Decision |
|---|---|---|
| Smartboard: Android native, Kotlin + Jetpack Compose | Flutter (`apps/board`) | **Keep Flutter.** Approved by the product owner 2026-10-08. The Flutter board already covers ~90% of the Phase 01 surface list, passes 588 tests, and runs on Android panels **and** Windows panels from one codebase; a Kotlin rewrite would drop Windows and restart the work. Treat "Android native" in the pack as superseded. |
| AI: cloud AI APIs + local 2–3B models | India-hosted provider chain (self-hosted/E2E first, Sarvam fallback) | Keep. Satisfies the data-residency rule the owner set, which outranks the pack's wording. |
| Identity: Kinetix in-house | Phone OTP (MSG91) + our own tokens, RLS per tenant | Matches in-house identity. TOTP MFA with per-role policy is built (see Phase 00). |

Everything else in the locked baseline matches: Next.js + TypeScript web, NestJS + TypeScript
backend, PostgreSQL, Flutter mobile, multi-tenant SaaS, en/hi/kn from day one.

## Phase 00 — foundation

Built: monorepo, web shell, backend shell, Flutter workspace, shared contracts
(`packages/shared`), CI/CD, Postgres + migrations, in-house identity, tenant/institution/campus,
RBAC, audit log, object storage, notification abstraction, curriculum foundation.

Also built (see `docs/architecture/platform-foundation.md` and `docs/operations/observability.md`):
TOTP MFA with per-role policy and session control, per-tenant feature flags, a transactional
domain-event outbox, structured logs + Prometheus metrics + OTLP traces, ClamAV upload scanning
(vault documents), content licensing, global search (trigram).

Also (2026-10-08): inline virus scanning on every untrusted upload path (homework photos,
public admission documents, profile photos; refused while the scanner is down) and Prometheus
alert rules (`infra/monitoring/prometheus-rules.yml`).

Decided, not built (owner, 2026-10-08): the event outbox stays in-process (no broker yet);
semantic search deferred; TURN = self-hosted coturn; offline-board alerts by SMS via MSG91;
iOS cast and audio deferred.

## Phase 01 — Smartboard

Built and matching the pack's surface list: launcher, teacher session picker, timetable/current
class, whiteboard, ink, PDF/PPT, web, video (concept videos), lesson/content search, simulation
hub (PhET), virtual labs, 3D/interactive, student interaction (polls, answer cards), attendance
hooks, quiz/poll, AI copilot, recording/transcription/recap, offline mode, sync, kiosk/device
enrollment, shared-device PIN profiles.

Also built (see [screen-share-and-devices](../architecture/screen-share-and-devices.md)):
- Screen sharing: a teacher's or student's phone (Teacher and Student apps) or laptop (`/cast` in the ERP) casts to
  the board over WebRTC, signalled on the realtime gateway; the class teacher approves on the board and can stop
  any cast; up to four tiles side by side or full panel, draw over, snapshot to the board; STUN/TURN by env
  (`infra/docs/coturn.md`).
- Device management console in the ERP: fleet health (online, version, OS, kiosk, class, storage, battery),
  remote lock/unlock, restart, clear PIN profiles, message, kiosk policy, rename/move, unpair, audit log, offline alerts.
- Classroom analytics in the ERP Reports page and the HOD dashboard: per-class engagement, tool usage, coverage.

Missing:
- iOS cross-app screen capture (needs a broadcast extension); audio in casts.
- Offline alerts by SMS or email (shown in the console only); a deployed TURN server.


Smartboard spec V1 (2026-10-08): every item of the source documents' developer acceptance
summary is built; see `docs/product/board-features.md` §13 and ADR 0002 (PPT animations through
the panel's presenter app; Text AI on ML Kit / Windows ink). Open: checks on real IFP hardware
(pen tips, palm, touch counts, presenter apps) in the Soundarya pilot; ERP screens for the
past-exam question bank import and the training link / What's New (API ready).

## Phase 02 — ERP domains, in the pack's dependency order

| # | Domain | State |
|---|---|---|
| 1 | Institution / org / admin | Built |
| 2 | Academic structure / curriculum | Built |
| 3 | Admissions / student lifecycle | Built — enquiry pipeline, per-program cycles and application forms, documents, application fee (Razorpay), eligibility and merit lists, offers, enrolment; lifecycle statuses with rules and audit, bulk promotion, guardians, `admissions_officer` role ([design](../architecture/admissions-lifecycle.md)). Not yet: SMS/email to applicants, entrance-test scheduling, seat quotas/reservation categories, sibling and transfer-certificate workflows |
| 4 | Timetable / attendance | Built |
| 5 | LMS / content | **Built (core)** — homework, library, content; course shells per class and subject (modules, ordered items linking topics, videos, homework, assessments, files and links; announcements); weighted gradebook from homework and assessment marks with audited teacher overrides, running grade and CSV; ERP course and gradebook pages, Student App Courses tab, Parent App course grades. Not built: file upload into courses, quizzes, forums, completion tracking. See `docs/product/lms-courses.md` |
| 6 | Assessment / examination / results | **Built (core)** — schemes (BU NEP / CBSE presets), marks verify and moderate, exam sessions, seating, hall ticket / marks card / transcript PDFs, SGPA/CGPA, publish + lock, revaluation. Not built: question bank, paper generation, answer capture, supplementary-specific rules. See docs/assessment-obe.md |
| 7 | OBE / accreditation | **Built (core)** — mission/vision/PEO/PO/PSO, versioned COs, CO-PO/PSO matrix, assessment-to-CO mapping, direct + survey (indirect) attainment, targets, gaps, actions, evidence, NAAC/NBA CSV and PDF. Not built: file upload for evidence (links and notes only), question-level CO mapping, survey collection UI. See docs/assessment-obe.md |
| 8 | Fees / finance | **Built (core)** — fees and Razorpay; scholarship schemes with eligibility and apply → approve that takes the discount off open fees; fee refunds; budgets per department with actuals from purchase orders, payroll and expenses and variance; GL journal export (Tally XML and CSV) for fee collections, refunds and payroll; ERP pages and a Student App apply screen. Not built: scholarship fund caps, discounts on later fees, per-category budgets, fixed-asset journals. See `docs/product/finance.md` |
| 9 | HR / payroll | **Built** — staff records, attendance (app, manual, biometric CSV), leave, recruitment basics, India payroll (PF, ESI, Karnataka PT, TDS old/new, LOP), payslip PDF, bank/statutory/Tally exports; ERP pages and Teacher app screens. Not built: surcharge above ₹50 lakh, device-specific biometric adapters. See `docs/architecture/hr-payroll.md` |
| 10 | Library / inventory / procurement | Built — library; inventory (items, stores, stock ledger, issue, reorder levels), vendors, requisition → approval → PO → goods receipt → three-way invoice match, asset register (QR tag, allocation, maintenance, SLM/WDV depreciation, disposal), RFQ with quotation comparison and award to PO, store-to-store transfers, returns to vendor and from issue, fixed-asset GL posting (depreciation and disposal journals in the GL export). See `docs/product/campus-operations.md` |
| 11 | Transport / hostel / canteen | Built — transport (vehicles, drivers, routes, stops, seats, fees, driver GPS → live bus + ETA + arrival notice, trip log, compliance expiry), hostel (blocks/rooms/beds, allot/vacate, fees, gate pass with family notice, visitors, mess plans + menu, complaints), canteen (menu, prepaid wallet, orders), hostel waitlist and room transfer, boarding (night) attendance with a parent alert on absence, fuel/expense tracking per vehicle, incident reports, canteen meal attendance, online wallet top-up through the Razorpay flow, a GPS-vendor adapter interface with a generic HTTP/webhook adapter, and Student and Parent app wallet and hostel views. See `docs/product/campus-operations.md` |
| 12 | Communication / documents | **Built** — messaging, broadcasts, certificate templates and request → approve → issue with serial numbers, QR and public verification, student/staff ID cards, fee-receipt PDF, access-controlled document vault. See `docs/architecture/documents-certificates.md` |
| 13 | Placements / internships / alumni | **Built (core)** — companies, drives with server-side eligibility (CGPA, backlogs, programme, deadline), rounds, offers, placement stats, internships with mentor, evaluation and diary, alumni records, events and mentoring requests; ERP desk, Student App (register, withdraw, answer offers) and Parent App (read only). Not built: offer-letter documents, alumni donations. See `docs/product/campus-operations.md` |
| 14 | Research / projects | **Built (core)** — proposals with ethics review and decision, projects with members and milestones, scholars, publications, conferences, patents, grants with expense limits, KPIs; ERP desk. Not built: DOI import, document upload. See `docs/product/campus-operations.md` |
| 15 | Grievance / discipline / welfare | **Built (core)** — grievances with SLA, escalation, anonymous raising and rating; confidential anti-ragging / ICC / POSH committee handling; discipline incidents, actions and appeals; welfare requests; counselling sessions with private notes; ERP desk, Student App and Parent App screens. Not built: SMS/email notices, outside referrals. See `docs/product/campus-operations.md` and `GRIEVANCE_DISCIPLINE_WELFARE_DETAILED_SPEC.md` |
| 16 | Analytics / reporting | **Built (core)** — KPIs and drill-down by campus/program/section, 12-report catalogue with CSV and PDF export, scheduled delivery, classroom analytics, NAAC/NIRF/AISHE data packs, placement and research entry, ERP page and global search. Not built: custom report builder, BI/warehouse connector. See `docs/architecture/analytics-reporting.md` |

## Phase 03–05 — mobile

Teacher, Student and Parent apps exist and share the API contracts and authorization model. The
pack's mobile feature matrix has not been audited line by line; do that when the ERP domains
above land, since most missing mobile screens are views onto missing domains.

## Working order agreed with the product owner

1. Admissions/CRM + student lifecycle.
2. Assessment/exam/results + OBE/accreditation.
3. HR/payroll + documents/certificates.
4. Campus operations: transport, hostel/canteen, inventory/procurement/assets.

Then: analytics (placements, research and grievance are built), and the Phase 00 foundation gaps.

## Definition of done, per the pack

A module is not done because screens exist. It is done when domain logic, authorization,
persistence, APIs and events, validation, auditability, tests, observability, documentation and
production readiness are all satisfied.

## ERP PRD V1 (Tier 2) audit — 2026-10-09

The pack's newest ERP PRD (`KINETIX_COMPLETE_ERP_EDUCATION_OS_PRD_V1.md`) compared with the
code. Built in full: certificates, payroll, hostel, transport, grievance, discipline, Smartboard
integration. Everything else is partial or missing; build waves, in order:

1. Survey/feedback engine (§53) + task engine (§69); clubs, committees, events (§50–52);
   mentoring and early intervention (§41), course file (§29), academic audit (§30).
2. CBCS course registration (§11); skill passport and SDG mapping (§42, §44); question bank and
   paper blueprint in the ERP (§22); reusable approval workflow (§57).
3. On-screen evaluation (§24); exam controller depth (invigilation, supplementary, §23);
   results depth (grace marks, rank, progression, §25).
4. Depth items: student lifecycle states (§7), admissions entrance tests/quotas/campaigns (§8),
   timetable substitutions (§13), school diary and PTM booking (§15, §59), early-years model
   (§4.1), health records (§40), alumni giving (§49), audit-log viewer (§70), custom report
   builder (§63), connector registry (§67).

Deferred by decision: semantic search (§65, §68), dedicated/on-prem deployment packaging (§71),
enterprise SSO (§6) until a tenant asks.
