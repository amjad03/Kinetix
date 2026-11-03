# Performance at institution scale

Load test of the 25 busiest API endpoints on a large institution, November 2026: what was slow, what changed, and the
numbers before and after. Module budgets for a school-sized tenant stay in [performance-budgets.md](performance-budgets.md).

## Data and method

- **Seed** (`services/api/scripts/perf/seed-large-tenant.mjs`, set-based SQL, ~12 minutes): 20,000 students in 334
  sections, a guardian login for each, 800 staff, a six-period timetable (12,024 slots), **13.8 million** daily attendance
  rows over three years, 4,008 assessments with 240,000 marks, 240,000 fee invoices and 220,000 payments.
- **Load** (`services/api/scripts/perf/load.mjs`): 500 virtual users, each signed in as their own family (400) or member of
  staff (40 teachers, the principal), cycling through the Parent App home (children, summary, attendance, subjects, diary, fees,
  results, marks, notifications, announcements), the Teacher App (classes, homework, me) and the ERP dashboard, attendance desk,
  students, records, fees and analytics endpoints. Two profiles: **realistic** (each user pauses 2.5–7.5 s between requests,
  about what 500 people actively using the apps do) and **saturation** (no pause: the throughput ceiling).
- **Machine**: one 4-vCPU, 16 GB container running PostgreSQL 16, the API instances *and* the load generator, so absolute
  numbers are pessimistic; the comparison is what matters. Three API instances (ports 4100–4102) stand in for the load
  balancer and ECS tasks. ERP pages were not driven by a browser: they render server-side from these same API calls, so the
  API endpoint behind each top page was measured instead.
- **Slow queries**: `log_min_duration_statement = 100` on the scratch database (pg_stat_statements needs a server restart,
  not possible on the shared test server), then `EXPLAIN` of each.

Reproduce:

```bash
createdb -O zynetix_owner zynetix_perf && DATABASE_URL=postgres://zynetix_owner:…@localhost/zynetix_perf pnpm --filter @zynetix/api db:migrate
DATABASE_URL=postgres://zynetix_owner:…@localhost/zynetix_perf node services/api/scripts/perf/seed-large-tenant.mjs
# API with APP_DATABASE_URL on zynetix_perf and LOGIN_PER_IP_PER_MINUTE=1000000, then:
API=http://localhost:4100,http://localhost:4101,http://localhost:4102 VUS=500 THINK_MS=5000 DURATION=90 node services/api/scripts/perf/load.mjs
```

## What was slow and what changed

| Problem | Where | Fix |
| --- | --- | --- |
| Every date-range count over attendance (attendance week, analytics KPIs, attendance desk day and dashboard, below-75 % list) read all 13.8 M rows: the only index led with `section_id`. 1.7–4.3 s each, one at a time. | `attendance_records` | `attendance_records_tenant_date_idx (tenant_id, date) INCLUDE (status, student_id, timetable_slot_id)`: index-only scans, 4.3 s → 30 ms. |
| "Was this period marked today" ran per timetable slot with no index on `timetable_slot_id` (1.5 s for a class's day). | attendance desk day, timetable | `attendance_records_slot_date_idx (timetable_slot_id, date)` (partial). |
| A student's marks, payments and results scanned the whole table (no index leading with `student_id`). | `marks`, `fee_payments`, `exam_results` | `marks_student_idx`, `fee_payments_student_idx (student_id, paid_at)`, `exam_results_student_idx`. |
| The student behind a student login (`students.user_id`) had no index; 64 queries use it. | `students` | `students_user_idx` (partial). |
| Fees collected in the KPI range filtered on `(paid_at at time zone …)::date`, which no index can serve. | `analytics/queries.ts` | Rewritten as a `paid_at` range in the institution's time zone (uses `fee_payments_paid_idx`). |
| Dashboards that every manager polls recomputed institution-wide aggregates on each call. | analytics KPIs, attendance week, attendance desk dashboard | `common/ttl-cache.ts`: concurrent identical requests share one computation; the answer is reused for `DASHBOARD_CACHE_MS` (30 s). Keyed by institution and campus scope (and reader for the desk dashboard, where a head of department sees only their department), after the role check. |
| Each request read the session, then the roles and campuses (two round trips, now that roles are read per request for security). | `auth/auth.guard.ts` | One query: session, account status, roles and campus scope together. |

All indexes are in migration `0192_perf_indexes.sql` (`IF NOT EXISTS`; on a large existing database build them first with
`CREATE INDEX CONCURRENTLY` under the same names). The database pool per instance is now `DB_POOL_MAX` (default 20).

## Results

### Realistic: 500 users, 2.5–7.5 s between requests, 3 instances, 90 s

| | Throughput | p50 | p95 |
| --- | --- | --- | --- |
| Before | 23 req/s (the queue never drains) | 20,469 ms | 35,577 ms |
| After | 96 req/s (everything asked for) | **87 ms** | **1,973 ms** |

Per endpoint (ms):

| Endpoint | Before p50 | Before p95 | After p50 | After p95 |
| --- | --- | --- | --- | --- |
| me | 17543 | 25423 | 73 | 1676 |
| parent children | 19503 | 24679 | 49 | 1505 |
| child summary | 18425 | 27446 | 133 | 2019 |
| child attendance (90 days) | 19056 | 24555 | 110 | 1590 |
| child subjects | 18497 | 24661 | 58 | 1375 |
| child diary | 18961 | 26528 | 65 | 1568 |
| child fees | 21437 | 33381 | 62 | 2208 |
| child results | 17343 | 23775 | 69 | 1645 |
| child marks | 23930 | 31582 | 75 | 2216 |
| notifications | 16332 | 23138 | 55 | 1478 |
| announcements inbox | 24090 | 35259 | 63 | 2286 |
| teacher classes | 16172 | 24616 | 57 | 1425 |
| teacher homework | 19381 | 25619 | 65 | 1421 |
| teacher me | 17659 | 25503 | 64 | 1642 |
| attendance classes | 18656 | 26441 | 75 | 1455 |
| attendance day | 23795 | 30870 | 128 | 1878 |
| attendance dashboard | 24447 | 31045 | 37 | 1111 |
| attendance register | 20302 | 26820 | 132 | 2083 |
| analytics KPIs | 33157 | 47012 | 61 | 3651 |
| attendance week | 42058 | 60338 | 32 | 3519 |
| students list (class) | 20628 | 33481 | 49 | 2110 |
| records: students page | 23343 | 33342 | 220 | 2443 |
| fees invoices (due) | 25523 | 36375 | 577 | 3266 |
| fees summary | 25652 | 36113 | 425 | 3241 |
| students absences | 25445 | 35936 | 65 | 2160 |

"Before" here is the same build with the new indexes dropped and the dashboard cache off (the guard's merged query stays), so
it slightly flatters the old code. The p95 tail after the change is the shared 4-vCPU machine: bursts of 500 users queue
behind PostgreSQL and the load generator on the same cores.

### Saturation: 500 users with no pause, 60 s

| | Instances | Throughput | p50 | p95 |
| --- | --- | --- | --- | --- |
| Before (old build, no indexes) | 1 | 25 req/s | 29,395 ms | 41,243 ms |
| After | 1 | 106 req/s | 5,105 ms | 6,730 ms |
| After | 3 | 119 req/s | 4,371 ms | 6,249 ms |

At saturation the latency is queueing (Little's law: 500 in flight ÷ throughput); the ceiling on this machine is CPU shared
by three Node processes, PostgreSQL and the generator (a CPU profile of one instance: Drizzle query building and row mapping
27 %, pg driver 22 %, Express/Nest 20 %, GC 9 %). On production (ECS tasks of 1 vCPU each, RDS on its own instance) capacity
grows with `api_desired_count`/`api_max_count`.

## Remaining (for the owners of those modules)

- **Fees** (handed to the fees work in progress, not changed here): `GET /v1/fees/invoices?status=due` returns 555 KB (every
  due invoice of 20,000 students) with no paging, and `GET /v1/fees/summary` aggregates all 240,000 invoices on each call
  (425–577 ms unloaded, the slowest endpoints after the change). Page the list on the server and cache the summary like
  the analytics KPIs.
- `GET /v1/students` without a class returns up to 5,000 rows; the ERP uses the record kit's paged list instead, keep it so.
- Run `scripts/perf` on the production-sized staging stack before go-live and put the p95s in performance-budgets.md.
