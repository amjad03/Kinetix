# Definition of done for a module

A module is done when all of these are true. The ones a machine can check are checked by `services/api/test/definition-of-done.spec.ts`, which fails the build when a module slips.

1. **Routes are tested.** An end-to-end test under `services/api/test/` calls the module's routes with a real login (see `test/helpers.ts`), including a role that must be refused and, for tenant data, a second institution that must see nothing.
2. **Writes are audited.** Every create, update, delete and decision calls `audit(...)` with who, what and the record; an update passes `changes: changesOf(before, after)` so the audit viewer shows before and after. A module may skip this only with a reason in the `NO_AUDIT` list of the spec (nothing stored, or audited by the module that owns the record).
3. **Tables are tenant-safe.** Each table has `tenant_id`, row-level security and a grant in the migration, and is listed in `TENANT_TABLES` (the RLS test checks it).
4. **Roles are declared.** Every route has `@Auth(...)` with the roles that may use it; `docs/product/role-matrix.md` is regenerated (`node services/api/scripts/role-matrix.mjs`) and a test keeps it in step.
5. **Money and marks are exact.** Rupees are paise integers; marks are numeric; rules that decide a result are pure functions with unit tests.
6. **The ERP page exists** for the roles that work in the ERP, with strings in English, Hindi and Kannada (the i18n test checks parity), and a nav entry gated by `lib/access.ts`.
7. **The apps are covered** where the module reaches a phone or the board: Flutter screens with widget tests, and strings in all three languages.
8. **It is fast enough.** A sample read of the module is listed in `src/observability/perf-budgets.ts` and `test/perf-budget.e2e.spec.ts` keeps it inside its budget.
9. **It is documented.** The behaviour is described in `docs/product/` or `docs/operations/`, and its row in `docs/requirements/PRD_COVERAGE.md` names the code and the test that prove it.
10. **Seeded.** The Soundarya sample (`services/api/src/db/soundarya/`) has a believable example so a demo is never empty.
