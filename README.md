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
| **Student app** | Mobile app | Flutter | *(planned)* |
| Shared contracts | Event and DTO types shared by the TS services | TypeScript | `packages/shared` |

## Status (October 2026)

| Piece | State |
|---|---|
| Cloud API | Multi-tenant (row-level security), pairing, timetable, attendance, homework, broadcasts, sync outbox, saved boards, families and notifications, principal dashboard routes. 59 e2e tests |
| Board | Teachmint-style Material 3 board: multi-touch ink, shapes with measurements, select, pages, split screen, attendance, random pick, timer, eye comfort, IR-frame touch profile, save and share boards. 23 tests + live integration test |
| Teacher App | Today's classes, connect to board, attendance, homework. 13 tests |
| Parent App | Children, attendance, homework, class participation, shared boards, updates inbox. 21 tests |
| Principal dashboard | Today, classes, attendance, homework, circulate messages, boards. 12 unit + 17 Playwright tests |
| Not built yet | AI features (shells only), lesson recording, live classroom view, content library, push notifications, Student App, fees and payments, offline storage for the board's outbox |

**Demo logins** after `pnpm db:seed` (institution `demo-college`, password `kinetix123`): principal@demo.kinetix.in,
anita@demo.kinetix.in (teacher), parent@demo.kinetix.in (parent of two). The seed prints a board enrolment code.

## Start here

- [Product vision & scope](docs/product/vision.md)
- [Board feature specification](docs/product/board-features.md)
- [Teacher App specification](docs/product/teacher-app.md)
- [Parent App specification](docs/product/parent-app.md)
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
```
