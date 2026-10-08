# Spec v2 vs built — gap analysis (2026-10-08)

Audit of `docs/requirements/` (Detailed System Requirements Pack v2) against the code on
`claude/kinetix-ecosystem-overview-lpphjn`. Update this file whenever a domain lands.

## Architecture decisions: agreed deviations from the pack

| Pack says | We built | Decision |
|---|---|---|
| Smartboard: Android native, Kotlin + Jetpack Compose | Flutter (`apps/board`) | **Keep Flutter.** Approved by the product owner 2026-10-08. The Flutter board already covers ~90% of the Phase 01 surface list, passes 588 tests, and runs on Android panels **and** Windows panels from one codebase; a Kotlin rewrite would drop Windows and restart the work. Treat "Android native" in the pack as superseded. |
| AI: cloud AI APIs + local 2–3B models | India-hosted provider chain (self-hosted/E2E first, Sarvam fallback) | Keep. Satisfies the data-residency rule the owner set, which outranks the pack's wording. |
| Identity: Kinetix in-house | Phone OTP (MSG91) + our own tokens, RLS per tenant | Matches in-house identity. MFA beyond OTP is still missing (see below). |

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

Missing:
- A message broker behind the event outbox; semantic (embedding) search.
- Virus scanning on upload paths other than the vault; dashboards and alert rules for the new metrics.

## Phase 01 — Smartboard

Built and matching the pack's surface list: launcher, teacher session picker, timetable/current
class, whiteboard, ink, PDF/PPT, web, video (concept videos), lesson/content search, simulation
hub (PhET), virtual labs, 3D/interactive, student interaction (polls, answer cards), attendance
hooks, quiz/poll, AI copilot, recording/transcription/recap, offline mode, sync, kiosk/device
enrollment, shared-device PIN profiles.

Missing:
- Screen sharing (student or teacher device casting to the board).
- A device-management console for IT (fleet view, remote lock, app version, health).
- Classroom analytics (per-class engagement, tool usage, coverage) surfaced to the ERP.

## Phase 02 — ERP domains, in the pack's dependency order

| # | Domain | State |
|---|---|---|
| 1 | Institution / org / admin | Built |
| 2 | Academic structure / curriculum | Built |
| 3 | Admissions / student lifecycle | Built — enquiry pipeline, per-program cycles and application forms, documents, application fee (Razorpay), eligibility and merit lists, offers, enrolment; lifecycle statuses with rules and audit, bulk promotion, guardians, `admissions_officer` role ([design](../architecture/admissions-lifecycle.md)). Not yet: SMS/email to applicants, entrance-test scheduling, seat quotas/reservation categories, sibling and transfer-certificate workflows |
| 4 | Timetable / attendance | Built |
| 5 | LMS / content | Partial — homework, library, content; no course shells, no gradebook |
| 6 | Assessment / examination / results | **Built (core)** — schemes (BU NEP / CBSE presets), marks verify and moderate, exam sessions, seating, hall ticket / marks card / transcript PDFs, SGPA/CGPA, publish + lock, revaluation. Not built: question bank, paper generation, answer capture, supplementary-specific rules. See docs/assessment-obe.md |
| 7 | OBE / accreditation | **Built (core)** — mission/vision/PEO/PO/PSO, versioned COs, CO-PO/PSO matrix, assessment-to-CO mapping, direct + survey (indirect) attainment, targets, gaps, actions, evidence, NAAC/NBA CSV and PDF. Not built: file upload for evidence (links and notes only), question-level CO mapping, survey collection UI. See docs/assessment-obe.md |
| 8 | Fees / finance | Partial — fees and Razorpay; no scholarships, budgets, cost centres, GL export |
| 9 | HR / payroll | **Built** — staff records, attendance (app, manual, biometric CSV), leave, recruitment basics, India payroll (PF, ESI, Karnataka PT, TDS old/new, LOP), payslip PDF, bank/statutory/Tally exports; ERP pages and Teacher app screens. Not built: surcharge above ₹50 lakh, device-specific biometric adapters. See `docs/architecture/hr-payroll.md` |
| 10 | Library / inventory / procurement | Mostly built — library; inventory (items, stores, stock ledger, issue, reorder levels), vendors, requisition → approval → PO → goods receipt → three-way invoice match, asset register (QR tag, allocation, maintenance, SLM/WDV depreciation, disposal). Missing: RFQ/quotation comparison, stock transfers between stores, returns, fixed-asset GL posting. See `docs/product/campus-operations.md` |
| 11 | Transport / hostel / canteen | Mostly built — transport (vehicles, drivers, routes, stops, seats, fees, driver GPS → live bus + ETA + arrival notice, trip log, compliance expiry), hostel (blocks/rooms/beds, allot/vacate, fees, gate pass with family notice, visitors, mess plans + menu, complaints), canteen (menu, prepaid wallet, orders). Missing: hostel waitlist and room transfer, boarding attendance, fuel/expense tracking, incident reports, meal attendance, GPS-vendor adapter, online wallet top-up. See `docs/product/campus-operations.md` |
| 12 | Communication / documents | **Built** — messaging, broadcasts, certificate templates and request → approve → issue with serial numbers, QR and public verification, student/staff ID cards, fee-receipt PDF, access-controlled document vault. See `docs/architecture/documents-certificates.md` |
| 13 | Placements / internships / alumni | **Missing** |
| 14 | Research / projects | **Missing** |
| 15 | Grievance / discipline / welfare | **Missing** |
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

Then: placements/alumni, research, grievance, analytics, and the Phase 00 foundation gaps.

## Definition of done, per the pack

A module is not done because screens exist. It is done when domain logic, authorization,
persistence, APIs and events, validation, auditability, tests, observability, documentation and
production readiness are all satisfied.
