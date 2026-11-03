# Module pass brief (production-readiness pass, one module at a time)

Owner's bar: industry-grade, secure, production-ready, at least as deep as Linways and the big Indian ERPs; nothing skipped, nothing stubbed.

## Setup (every agent)
- `pg_isready || pg_ctlcluster 16 main start; redis-cli ping || redis-server --daemonize yes --dir /tmp --save ""`
- `pnpm install --frozen-lockfile && pnpm --filter @zynetix/shared build`
- API tests from services/api: `ZYNETIX_PG_ADMIN_URL=postgres://root@localhost:5432/postgres ZYNETIX_TEST_DB=zynetix_test_<module> ./node_modules/.bin/vitest run test/<file>` (run e2e files one at a time)
- tsc with `NODE_OPTIONS=--max-old-space-size=6144`; Flutter: `/opt/flutter/bin/flutter`; Playwright chromium at /opt/pw-browsers.
- Read first: docs/requirements/AGENT_BUILD_CONVENTIONS.md, RECORD_DEPTH_KIT.md, docs/product/ERP_UI_PATTERNS.md (Layout rules), and the module's section of docs/research/MODULE_DEPTH_CHECKLIST.md.
- Use only the migration numbers you were given. Commit often on your branch (container restarts happen); never push.

## Steps
1. **Audit.** Build a requirement list from: the checklist section, the module's detailed spec in docs/requirements, Linways and peers (WebSearch allowed), Indian regulation for the module, and the brief's extra list. Verify each item in code AND by exercising it against the Soundarya demo seed (API calls, ERP pages via Playwright, app widget tests). Mark Done / Partial / Missing / Broken with evidence.
2. **Build and fix** every Partial / Missing / Broken item end to end: API, ERP, the apps that should have it, en/hi/kn strings, record kit on every list, permissions, audit log, notifications.
3. **Harden** the module: every endpoint has the right role check and tenant isolation (add a test that another role and another tenant are refused); input validation on every body/query; money and dates handled exactly (integer paise, IST); idempotency on payment/webhook paths; no N+1 queries on list pages (paginate server-side); no secrets or PII in logs.
4. **Seed** realistic demo data in the Soundarya seed so every screen and report shows numbers.
5. **Test**: API e2e per workflow with hand-checked figures, ERP vitest, Flutter widget tests for app screens; ERP and API tsc clean; then run the module's pages at 1280px and 390px in Playwright and fix what looks wrong.
6. **Report**: write docs/requirements/<MODULE>_COMPLETENESS.md (item, before, after, evidence), update the module's user guide in docs, save 6–8 screenshots to docs/demo/screens/<module>/. Final reply max 15 lines: before/after counts, migrations, test counts, anything not done and why.
