# Build conventions for module agents

Read this before building a module. Copy the patterns of the nearest existing module; do not invent new ones.

## Reference modules to copy
- API: `services/api/src/welfare/` or `services/api/src/placements/` (controller + service + module, Zod bodies via `ZodBody`, `@Auth('user', ROLES)`, `this.db.withTenant(p.tenantId, async (tx) => …)`, `audit(tx, …)` on every write).
- Tables: add to `services/api/src/db/schema.ts` with `id()`, `tenantId()`, `createdAt()`; add each table name to `TENANT_TABLES` (RLS test checks it).
- Migration: hand-written SQL in `services/api/migrations/NNNN_name.sql` using the RLS block from `0095_smartboard_ai.sql` (ENABLE RLS, tenant_isolation policy, GRANT to kinetix_app), and a matching entry in `migrations/meta/_journal.json` (idx +1, when +1000, tag). Use ONLY the migration number you were given.
- Register the module in `services/api/src/app.module.ts`.
- Domain events for cross-module facts: `EventBus.emit(tx, tenantId, { type, aggregateType, aggregateId, payload })` (`src/events/events.ts`, add names to `DomainEvents`).
- Notifications: reuse `NotificationsService` patterns if a family/student must be told.
- API tests: one e2e file `services/api/test/<module>.e2e.spec.ts` like `test/welfare*.e2e.spec.ts` (helpers `createApp`, `createTenant`, logins). Run: `KINETIX_PG_ADMIN_URL=postgres://$(whoami)@localhost:5432/postgres npx vitest run test/<file>` from `services/api`. Also `npx tsc --noEmit -p .`.
- ERP: pages in `apps/erp/src/app/(dashboard)/<area>/page.tsx` + server actions `actions.ts`, shared `DataTable`, `PageHeader`, components in `src/components/<area>/`. Copy `grievances` or `placements` pages. Strings in `apps/erp/src/i18n/messages/<area>.ts` for en, hi AND kn (the i18n test fails on missing keys or Latin text in hi/kn). Add nav entry the way neighbours do. Run `npx tsc --noEmit -p .` and `npx vitest run` in `apps/erp`.
- Flutter apps (if asked): `~/development/flutter-3.47.6/bin/flutter` (the default `flutter` is too old). Copy an existing screen of the same app.
- Write code like the surrounding code: short doc comments, plain English UI strings, no placeholders, no TODO stubs.
- Commit once at the end on your branch with a clear message ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push.
- Keep your final report to 10 lines: what was built, migration number, test counts, anything not done.
