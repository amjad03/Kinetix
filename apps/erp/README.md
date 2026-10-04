# KINETIX ERP: principal dashboard (first slice)

The web dashboard for principals, administrators, heads of department and the accounts office:
the whole school's day at a glance, classes, the timetable editor, attendance, homework, results,
messages to every classroom ("Circulate"), the head of department's view of their department (with syllabus progress and year-plan status per class, and each class's year plan and lesson plans to review), departments set-up, a read-only safeguarding view of parent–teacher
messages, the boards, live classroom view, fees, the library desk,
the syllabus library, KINETIX AI usage, the academic calendar, and institution settings with the privacy & consent summary.
In English, Hindi and Kannada ([docs/i18n/erp.md](../../docs/i18n/erp.md)). Spec: [docs/product/erp-dashboard.md](../../docs/product/erp-dashboard.md).

Next.js (App Router, TypeScript strict) + Material UI themed to Material 3. The colour scheme is
generated from the seed `#0B57D0` with `@material/material-color-utilities` (TonalSpot, the same
algorithm as Flutter's `ColorScheme.fromSeed`), so it matches the Board and the mobile apps.
Google Sans and Noto Devanagari/Kannada are bundled from `packages/kinetix_ui/fonts`. Light and
dark themes follow the system.

## Run

Needs the KINETIX Cloud API running with the demo seed (see the root README).

```bash
pnpm install                          # at the repo root
cd apps/erp
cp .env.example .env.local            # set KINETIX_API_URL if the API is not on :4000
pnpm dev                              # http://localhost:3000
```

Sign in with institution code `demo-college`, password `kinetix123`:
`principal@demo.kinetix.in` (principal), `admin@demo.kinetix.in` (administrator) or
`ravi@demo.kinetix.in` (head of department), `accounts@demo.kinetix.in` (accounts office: Fees
only) or `library@demo.kinetix.in` (library desk: Library only). Teachers such as `anita@demo.kinetix.in` are refused.

| Script | |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js on port 3000 |
| `pnpm lint` | ESLint (next/core-web-vitals + TypeScript) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Unit tests (Vitest): the dictionary (every key in English, Hindi and Kannada, placeholders, plurals) and formats, the calendar month grid and checks, settings and consent shares, live refusal codes, M3 colour-scheme mapping, dates, role access, rupees, the live-view player and renderer, class audio (IMA ADPCM decoder checked against the boards' Dart codec, playback timing), department ranges and flags (including classes behind their year plan), year-plan weeks and status labels, AI usage, library fines, results bands, the timetable grid, conversation search |
| `pnpm test:e2e` | Playwright against a running API with a **fresh** demo seed; starts `pnpm dev` unless `ERP_URL` is set |

```bash
KINETIX_API_URL=http://localhost:4000 pnpm test:e2e
# or against an already running ERP:
ERP_URL=http://localhost:3000 pnpm test:e2e
```

The e2e tests send messages, add boards, issue fees and take payments, lend and return books,
publish marks and change the timetable (and put it back), so run them on a demo
database you can reseed. They sign in once per run because the API allows 10 logins a minute per
account. The live-view tests enrol a pretend board through the API and stream ink to the page
(`e2e/board-sim.ts`). `ERP_URL`'s port is the port `next dev` is started on. Set
`PW_CHROMIUM_PATH` to use a specific Chromium binary, and `E2E_SHOTS=<dir>` to save screenshots
of the pages. Leaders hear class audio only when the institution setting `classroomAudioToViewers` is
on: the class-audio test turns it on in Settings and off again. The departments test adds a department
and deletes it again; the calendar test adds a holiday for today and deletes it; the settings test
puts every setting back. The head-of-department tests sign in as `ravi@demo.kinetix.in` themselves; the plans test reviews the seeded lesson plan, and has Ravi save a lesson plan for his own Discrete Mathematics period through the API (the principal then reviews it).
Tests read English: `signIn` picks English on the browser (`kx_lang=en`); `e2e/i18n.spec.ts`
checks Hindi and Kannada, including no horizontal overflow at 1280 and 1440 px.

## Environment

| Variable | Default | |
|---|---|---|
| `KINETIX_API_URL` | `http://localhost:4000` | KINETIX Cloud API. Only the Next.js server calls it |
| `KINETIX_TIMEZONE` | `Asia/Kolkata` | School time zone for "today", the "now" line and times. Keep in step with the tenant's zone |
| `KINETIX_INSECURE_COOKIES` | unset | `1` drops the `Secure` flag on cookies in production (only for plain-HTTP test deployments) |

## How it works

- **Auth.** The sign-in form posts to a server action that calls `POST /v1/auth/login`, rejects
  accounts without an ERP role (principal, tenant_admin, hod, accountant, librarian), and stores the access token
  in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production). The browser never sees the
  token: pages are server components and mutations are server actions that call the API with it
  (`src/lib/api.ts`). An expired token ends the session and returns to sign-in.
- **Roles** (`src/lib/access.ts`): everyone in the ERP reads the Calendar (the principal and administrator keep it);
  Settings (live view, class audio for leaders, PIN sign-in, grievance officer, consent summary) is for the principal and administrator;
  school leaders see the school pages, Live, Results and Syllabus;
  Fees is for the principal, administrator and accounts office; Library for the principal,
  administrator and library desk; the timetable editor, Parent messages and AI usage for the
  principal and administrator; Departments (set-up) for the principal and administrator. Heads of
  department land on Department (their department's classes, teachers and marks) and see results for
  the classes they teach and their department's classes. The navigation shows only what the role may open, and every page checks again
  (`requireSection`), sending others to their own home page.
- **Pages** (`src/app/(dashboard)`): Today (with a holiday banner on a holiday), Department (and `/department/syllabus` for a class's topics, `/department/plan` for its year plan by week and a week's lesson plans, which the head of department or principal reviews), Classes, Calendar, Settings, Timetable, Attendance, Homework, Results
  (and each assessment), Messages, Parent messages, Boards, Live, Fees (invoices, printable receipts), Library,
  Syllabus, AI usage, Departments. Dates and filters live in the URL
  (`?date=YYYY-MM-DD`, `?status=`), so every view can be bookmarked and shared.
- **Live view.** `src/app/api/live/[deviceId]/route.ts` watches the board on the API's
  `/realtime` socket from the server, with the session token, and relays frames to the page as
  server-sent events, so the token stays in its httpOnly cookie. `src/lib/live/player.ts` is a
  port of the board's `LessonPlayer` (lesson events → pages of strokes) and `render.ts` paints
  them on a canvas the way the board does (backgrounds, highlighter, arrows, chalk-white ink on
  the chalkboard). Class audio (when the API allows it for leaders and the teacher's mic is on) is
  relayed the same way; Listen starts Web Audio (`src/lib/live/audio.ts` decodes the 16 kHz IMA ADPCM
  chunks, a port of `LiveAudioCodec` in packages/kinetix_ink, and schedules them back to back with a
  300 ms lead). `scripts/live-audio-fixture.dart` regenerates the cross-language test fixture
  (`dart run scripts/live-audio-fixture.dart`).
- **Languages** (`src/i18n`): a typed dictionary per area with English, Hindi and Kannada, `t()` and
  `fmt` from `getI18n()` (server) or `useI18n()` (client). The language picked on the browser
  (account menu, `kx_lang` cookie) wins over the account's `preferredLanguage`. API errors are worded
  by their `code`. See [docs/i18n/erp.md](../../docs/i18n/erp.md).
- **Money** is integer paise from the API, shown as Indian rupees (`src/lib/money.ts`).
- **Theme** (`src/theme`): `scheme.ts` generates M3 roles; `palette.ts` maps them onto MUI
  (`primary`, `background`, `text`, `divider`, state layers) and exposes the full scheme as
  `palette.m3.*` and KINETIX extras as `palette.kx.*` (live/success colours, frame and pane).
  `theme.ts` sets the M3 type scale, 4/8/12/16/28 shapes and flat surfaces.
