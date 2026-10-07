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

Missing:
- MFA beyond phone OTP, and device/session control for staff.
- Feature-flag / configuration service per tenant (settings exist; flags do not).
- Event-bus abstraction (realtime exists; a domain event bus does not).
- Observability foundation (health endpoints exist; no tracing, metrics or structured log pipeline).
- Content licensing and rights metadata as a first-class capability.
- Virus-scanning hook on uploads.
- Global faceted/semantic search across domains (the board has its own search).

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
| 3 | Admissions / student lifecycle | **Missing** |
| 4 | Timetable / attendance | Built |
| 5 | LMS / content | Partial — homework, library, content; no course shells, no gradebook |
| 6 | Assessment / examination / results | Partial — marks only; no exams, hall tickets, SGPA/CGPA, transcripts |
| 7 | OBE / accreditation | **Missing** |
| 8 | Fees / finance | Partial — fees and Razorpay; no scholarships, budgets, cost centres, GL export |
| 9 | HR / payroll | **Built** — staff records, attendance (app, manual, biometric CSV), leave, recruitment basics, India payroll (PF, ESI, Karnataka PT, TDS old/new, LOP), payslip PDF, bank/statutory/Tally exports; ERP pages and Teacher app screens. Not built: surcharge above ₹50 lakh, device-specific biometric adapters. See `docs/architecture/hr-payroll.md` |
| 10 | Library / inventory / procurement | Partial — library only |
| 11 | Transport / hostel / canteen | **Missing** |
| 12 | Communication / documents | **Built** — messaging, broadcasts, certificate templates and request → approve → issue with serial numbers, QR and public verification, student/staff ID cards, fee-receipt PDF, access-controlled document vault. See `docs/architecture/documents-certificates.md` |
| 13 | Placements / internships / alumni | **Missing** |
| 14 | Research / projects | **Missing** |
| 15 | Grievance / discipline / welfare | **Missing** |
| 16 | Analytics / reporting | **Missing** |

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
