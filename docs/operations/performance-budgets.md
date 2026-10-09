# Performance budgets

Each module has a response-time budget for a sample read: the 95th percentile, in milliseconds, on a school-sized tenant (about 1,500 students). The numbers live in `services/api/src/observability/perf-budgets.ts`; `services/api/test/perf-budget.e2e.spec.ts` times each sample path six times, drops the first call (it warms the connection and the query plan) and fails if the 95th percentile of the rest is over the budget. A list screen that issues one query per row is the usual way to break a budget, and this is how it is caught before it ships.

| Module | Sample read | Budget (p95) |
|---|---|---|
| Admin shell | `/v1/admin/structure` | 400 ms |
| Notifications | `/v1/notifications?limit=10` | 300 ms |
| Tasks | `/v1/tasks/mine` | 400 ms |
| Search | `/v1/search?q=Student` | 600 ms |
| Search, plain words | `/v1/search/ask?q=...` | 800 ms |
| Governance, rules and incidents | `/v1/governance/rules`, `/incidents` | 400 ms |
| Billing | `/v1/billing/subscription` | 700 ms (it counts usage) |
| AI audit | `/v1/ai/admin/actions` | 500 ms |
| Exams | `/v1/exam-sessions` | 500 ms |
| Grievances | `/v1/grievances` | 500 ms |
| Mentoring | `/v1/mentoring/plans` | 500 ms |
| Cast | `/v1/cast/boards` | 400 ms |

Whole-service alerts back this up in production: `KinetixSlowRequests` (p95 above 1.5 s for 15 minutes) and `KinetixLatencyRegression` (p95 three times yesterday's) in `infra/monitoring/prometheus-rules.yml`.

To add a module, add a row to `PERF_BUDGETS` with a path its list screen calls. To change a budget, change the number and say why in the commit; a budget is raised only after the query has been looked at.
