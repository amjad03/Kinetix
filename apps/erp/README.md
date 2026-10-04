# KINETIX ERP: principal dashboard (first slice)

The web dashboard for principals, administrators, heads of department and the accounts office:
the whole school's day at a glance, classes, the timetable editor, attendance, homework, results,
messages to every classroom ("Circulate"), the boards, live classroom view, fees, the library desk,
the syllabus library and KINETIX AI usage. Spec: [docs/product/erp-dashboard.md](../../docs/product/erp-dashboard.md).

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
| `pnpm test` | Unit tests (Vitest): M3 colour-scheme mapping, dates, role access, rupees, the live-view player and renderer, AI usage, library fines and student search, results bands, the timetable grid |
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
of the pages.

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
- **Roles** (`src/lib/access.ts`): school leaders see the school pages, Live, Results and Syllabus;
  Fees is for the principal, administrator and accounts office; Library for the principal,
  administrator and library desk; the timetable editor and AI usage for the principal and
  administrator. Heads of department see results for the classes they teach. The navigation shows only what the role may open, and every page checks again
  (`requireSection`), sending others to their own home page.
- **Pages** (`src/app/(dashboard)`): Today, Classes, Timetable, Attendance, Homework, Results
  (and each assessment), Messages, Boards, Live, Fees (invoices, printable receipts), Library,
  Syllabus, AI usage. Dates and filters live in the URL
  (`?date=YYYY-MM-DD`, `?status=`), so every view can be bookmarked and shared.
- **Live view.** `src/app/api/live/[deviceId]/route.ts` watches the board on the API's
  `/realtime` socket from the server, with the session token, and relays frames to the page as
  server-sent events, so the token stays in its httpOnly cookie. `src/lib/live/player.ts` is a
  port of the board's `LessonPlayer` (lesson events → pages of strokes) and `render.ts` paints
  them on a canvas the way the board does (backgrounds, highlighter, arrows, chalk-white ink on
  the chalkboard).
- **Money** is integer paise from the API, shown as Indian rupees (`src/lib/money.ts`).
- **Theme** (`src/theme`): `scheme.ts` generates M3 roles; `palette.ts` maps them onto MUI
  (`primary`, `background`, `text`, `divider`, state layers) and exposes the full scheme as
  `palette.m3.*` and KINETIX extras as `palette.kx.*` (live/success colours, frame and pane).
  `theme.ts` sets the M3 type scale, 4/8/12/16/28 shapes and flat surfaces.
