# KINETIX ERP: principal dashboard (first slice)

The web dashboard for principals, administrators and heads of department: the whole school's
day at a glance, classes, attendance, homework, messages to every classroom ("Circulate") and
the boards. Spec: [docs/product/erp-dashboard.md](../../docs/product/erp-dashboard.md).

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
`ravi@demo.kinetix.in` (head of department). Teachers such as `anita@demo.kinetix.in` are refused.

| Script | |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js on port 3000 |
| `pnpm lint` | ESLint (next/core-web-vitals + TypeScript) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Unit tests (Vitest): M3 colour-scheme mapping, date helpers |
| `pnpm test:e2e` | Playwright against a running API with a **fresh** demo seed; starts `pnpm dev` unless `ERP_URL` is set |

```bash
KINETIX_API_URL=http://localhost:4000 pnpm test:e2e
# or against an already running ERP:
ERP_URL=http://localhost:3000 pnpm test:e2e
```

The e2e tests send messages and add boards, so run them on a demo database you can reseed. They
sign in once per run because the API allows 10 logins a minute per account. Set
`PW_CHROMIUM_PATH` to use a specific Chromium binary.

## Environment

| Variable | Default | |
|---|---|---|
| `KINETIX_API_URL` | `http://localhost:4000` | KINETIX Cloud API. Only the Next.js server calls it |
| `KINETIX_TIMEZONE` | `Asia/Kolkata` | School time zone for "today", the "now" line and times. Keep in step with the tenant's zone |
| `KINETIX_INSECURE_COOKIES` | unset | `1` drops the `Secure` flag on cookies in production (only for plain-HTTP test deployments) |

## How it works

- **Auth.** The sign-in form posts to a server action that calls `POST /v1/auth/login`, rejects
  accounts without a dashboard role (principal, tenant_admin, hod), and stores the access token
  in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production). The browser never sees the
  token: pages are server components and mutations are server actions that call the API with it
  (`src/lib/api.ts`). An expired token ends the session and returns to sign-in.
- **Pages** (`src/app/(dashboard)`): Today, Classes, Attendance, Homework, Messages, Boards. Dates
  live in the URL (`?date=YYYY-MM-DD`), so every view can be bookmarked and shared.
- **Theme** (`src/theme`): `scheme.ts` generates M3 roles; `palette.ts` maps them onto MUI
  (`primary`, `background`, `text`, `divider`, state layers) and exposes the full scheme as
  `palette.m3.*` and KINETIX extras as `palette.kx.*` (live/success colours, frame and pane).
  `theme.ts` sets the M3 type scale, 4/8/12/16/28 shapes and flat surfaces.
