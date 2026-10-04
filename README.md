# KINETIX

An AI-first education ecosystem for Indian schools, colleges and universities, sold as
multi-tenant SaaS and hosted entirely in India.

| Product | What it is | Tech | Path |
|---|---|---|---|
| **KINETIX Board** | AI smart board for the classroom. Runs on an Android tablet with a projector or TV, on Android interactive flat panels, and on Windows PCs. | Flutter | `apps/board` |
| **KINETIX Cloud API** | Multi-tenant backend: auth, tenancy, sync, realtime, AI gateway | NestJS + PostgreSQL | `services/api` |
| **KINETIX ERP** | Web app for admins, principals, teachers and the curriculum team. First slice: the principal dashboard | Next.js | `apps/erp` |
| **KINETIX Teacher App** | Teacher's phone: today's classes, attendance, homework, connecting to the board | Flutter | `apps/teacher` |
| **KINETIX Parent App** | Parent's phone: each child's attendance, homework, class participation, shared class boards and updates | Flutter | `apps/parent` |
| **KINETIX Student App** | Student's phone: today's classes and homework, recordings of missed lessons, KINETIX AI for doubts, syllabus, updates, fees | Flutter | `apps/student` |
| Shared contracts | Event and DTO types shared by the TS services | TypeScript | `packages/shared` |

## Status (October 2026)

| Piece | State |
|---|---|
| Cloud API | Multi-tenant (row-level security), pairing, timetable, attendance, homework, broadcasts, sync outbox, saved boards, families and notifications with push, KINETIX AI gateway (India-hosted model server, grounded in the syllabus), lesson recordings with transcripts and summaries, content library, fees and payments (Razorpay), live classroom view, principal dashboard routes. 91 e2e tests |
| Board | Teachmint-style Material 3 board: multi-touch ink, shapes with measurements, select, pages, split screen, attendance, random pick, timer, eye comfort, IR-frame touch profile, save and share boards, KINETIX AI panel (ask, quick quiz with presenter, homework, lesson plan), offline maths solver, Books (syllabus), lesson recording with voice, live view streaming, outbox saved to disk. 54 tests + live integration test |
| Teacher App | Today's classes, connect to board, attendance, homework, lesson recordings (share, play). 18 tests |
| Parent App | Children, attendance, homework, class participation, shared boards, lesson recordings (missed classes first), fees with online payment and receipts, updates inbox. 39 tests |
| Student App | Today, KINETIX AI doubts in English/Hindi/Kannada with syllabus sources, syllabus, recordings, updates, attendance and fees. 63 tests |
| ERP | Principal dashboard (today, classes, attendance, homework, messages, boards), live classroom view, fees for the accounts office, syllabus links, AI usage. 37 unit + 29 Playwright tests |
| Shared packages | `kinetix_ui` (Material 3 theme), `kinetix_ink` (ink engine, saved-board format, lesson recorder/player; 37 tests), `kinetix_lesson` (recording player; 12 tests), `kinetix_math` (offline solver; 56 tests) |
| Needs real infrastructure | An India-hosted LLM and speech server (AI answers are labelled previews until `AI_BASE_URL` / `ASR_BASE_URL` are set), Firebase for push, Razorpay keys, S3 in ap-south-1. Nothing here has run on Android/iOS hardware yet; microphones and payments are covered by tests and fakes only |
| Not built yet | Classroom audio in live view, Teachmint-style "Go live" to remote students, 3D models and virtual labs, OCR/handwriting, library circulation, marks and exams, timetable editing in the ERP, Hindi/Kannada UI text |

**Demo logins** after `pnpm db:seed` (institution `demo-college`, password `kinetix123`): principal@demo.kinetix.in,
anita@demo.kinetix.in (teacher), parent@demo.kinetix.in (parent of two), aarav@demo.kinetix.in (student),
accounts@demo.kinetix.in (fees). The seed prints a board enrolment code and imports the sample content library.

## Start here

- [Product vision & scope](docs/product/vision.md)
- [Board feature specification](docs/product/board-features.md)
- [Teacher App specification](docs/product/teacher-app.md)
- [Parent App specification](docs/product/parent-app.md)
- [Student App specification](docs/product/student-app.md)
- [ERP principal dashboard](docs/product/erp-dashboard.md)
- [Design system (Material 3, Teachmint-style board layout)](docs/design/design-system.md)
- [IR touch frames: any TV as a multi-touch board](docs/hardware/ir-touch-frames.md)
- [Competitive research: Teachmint and others](docs/research/teachmint-competitive-analysis.md)
- [System architecture](docs/architecture/overview.md)
  - [Multi-tenancy & data residency](docs/architecture/tenancy.md)
  - [Board ↔ teacher pairing (sign-in without a PIN)](docs/architecture/board-pairing.md)
  - [Offline-first sync protocol](docs/architecture/sync-protocol.md)
  - [Live classroom view & broadcast](docs/architecture/live-classroom.md)
  - [AI platform (India-hosted)](docs/architecture/ai-platform.md)
  - [Notifications to families](docs/architecture/notifications.md)
  - [Lesson recording](docs/architecture/lesson-recording.md)
  - [Content library](docs/architecture/content-library.md)
  - [Fees and payments](docs/architecture/fees-payments.md)
  - [Data model](docs/architecture/data-model.md)
- [Decision records](docs/adr/)

## Local development

```bash
pnpm install
pnpm --filter @kinetix/shared build

# API (PostgreSQL 16 running locally)
cd services/api
cp .env.example .env
pnpm db:setup          # creates the kinetix + kinetix_test databases and the two roles
pnpm db:migrate        # schema + row-level-security policies
pnpm db:seed           # demo BU-affiliated college, staff logins, a board enrolment code
pnpm start:dev         # http://localhost:4000, OpenAPI docs at /docs
pnpm test              # e2e tests against kinetix_test (RLS, pairing, broadcasts, sync)

# Board (Flutter 3.47+)
cd apps/board
flutter pub get
flutter run -d windows   # or -d linux, or an Android device
flutter test
../../scripts/board-it.sh  # board client ↔ live API integration test

# ERP principal dashboard (Next.js, needs the API)
cd apps/erp
cp .env.example .env.local   # KINETIX_API_URL, defaults to http://localhost:4000
pnpm dev                     # http://localhost:3000, sign in as principal@demo.kinetix.in / kinetix123
pnpm test && pnpm test:e2e   # unit tests; Playwright against the API with a fresh demo seed

# Teacher App
cd apps/teacher
flutter pub get
flutter run -d linux     # phone-sized window; or an Android/iOS device for QR scanning
flutter test

# Parent and Student Apps: the same way, in apps/parent (parent@demo.kinetix.in) and
# apps/student (aarav@demo.kinetix.in). Set PAYMENTS_PROVIDER=demo in the API to try fee payments.
```
