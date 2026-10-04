# KINETIX

An AI-first education ecosystem for Indian schools, colleges and universities, sold as
multi-tenant SaaS and hosted entirely in India.

| Product | What it is | Tech | Path |
|---|---|---|---|
| **KINETIX Board** | AI smart board for the classroom. Runs on an Android tablet with a projector or TV, on Android interactive flat panels, and on Windows PCs. | Flutter | `apps/board` |
| **KINETIX Cloud API** | Multi-tenant backend: auth, tenancy, sync, realtime, AI gateway | NestJS + PostgreSQL | `services/api` |
| **KINETIX ERP** | Web app for admins, principals, teachers and the curriculum team | Next.js | `apps/erp` *(planned)* |
| **KINETIX Teacher App** | Teacher's phone: today's classes, attendance, homework, connecting to the board | Flutter | `apps/teacher` |
| **Student / Parent apps** | Mobile apps | Flutter | *(planned)* |
| Shared contracts | Event and DTO types shared by the TS services | TypeScript | `packages/shared` |

## Start here

- [Product vision & scope](docs/product/vision.md)
- [Board feature specification](docs/product/board-features.md)
- [Teacher App specification](docs/product/teacher-app.md)
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

# Teacher App
cd apps/teacher
flutter pub get
flutter run -d linux     # phone-sized window; or an Android/iOS device for QR scanning
flutter test
```
