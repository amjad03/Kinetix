# Analytics and reporting

Code: `services/api/src/analytics/`. ERP: Reports and analytics page and the global search box
(`apps/erp/src/lib/insights.ts`). Migrations 0082, 0083 (report tables), 0085 and 0086.

## Catalogue (`catalogue.ts`)

A report is `{ key, title, roles, formats, run(tx, ctx) }` returning columns and rows, so the same
definition serves the screen, CSV, PDF and scheduled delivery. Reports: `kpi.summary`,
`enrolment.summary`, `attendance.summary`, `results.summary`, `fees.summary`, `fees.defaulters`,
`staff.headcount`, `placement.offers`, `research.outputs`, `classroom.usage`, `classroom.tools`,
`classroom.syllabus_coverage`. `reportsFor(roles)` lists only what the caller's roles allow.

## Filters and scope

Every query takes campus / program / section filters and a date range, resolved to a scope that is
intersected with what the caller may see. Money is paise end to end and formatted at the edge;
dates use the institution's time zone.

## Endpoints (`/v1/analytics`, flag `analytics.reports`)

| Route | Purpose |
| --- | --- |
| `GET filters`, `GET kpis`, `GET drilldown?metric=&by=` | Filter options, headline KPIs, drill-down by campus, program or section |
| `GET classroom` | Board usage, tool and AI use, syllabus coverage (flag `classroom.analytics`) |
| `GET reports`, `POST reports/:key/run`, `GET reports/:key/export` | Catalogue, run, download (CSV or PDF) |
| `GET runs` | History of runs (`report_runs`: rows, status, delivery) |
| `GET/POST/PATCH/DELETE schedules` | Scheduled reports (`report_schedules`): daily, weekly or monthly, CSV or PDF, recipients |
| `GET accreditation/:framework` | NAAC / NIRF / AISHE data pack as a ZIP of CSVs (flag `analytics.accreditation`) |

## Placement and research figures

Analytics keeps no copy of placement or research data. `sources.ts` defines two derived tables over
the domain tables, and the KPIs, the `placement.offers` and `research.outputs` reports and the
NAAC / NIRF / AISHE packs all read them:

- **Placement offers**: `placement_offers` joined to `placement_drives` and `placement_companies`.
  The package is the offer's `ctc_lpa` converted to paise (1 LPA = 10,000,000 paise). `accepted`
  reads as `joined`; offers still standing are `offered` and `joined`.
- **Research outputs**: `publications` (journal = paper, conference, book and chapter = book),
  `patents` (by granted or filed date), presented or organised `conferences` not already a
  publication, and non-cancelled `research_projects` carrying the grants sanctioned to them.
  Publications are dated 1 January of their year.

Data entry happens in the placements and research modules. The `placement_records` and
`research_outputs` tables from migration 0083, and the analytics `placements` / `research`
endpoints that wrote to them, were dropped in migration 0086.

## Scheduling and delivery

`ReportsService` polls every `REPORTS_POLL_MS`, claims due schedules with `SKIP LOCKED`, runs the
report, advances `next_run_at`, writes a `report_runs` row and POSTs JSON to `MAIL_WEBHOOK_URL`
from `MAIL_FROM`. With no webhook configured the run is recorded and logged only. A failed run
records the error and does not stop the schedule.

## Tests

`services/api/src/foundation.spec.ts` and the analytics specs; ERP `insights.test.ts`. API specs
need a Postgres: set `KINETIX_TEST_ADMIN_URL` and `KINETIX_TEST_DB`.

## Not built

Custom report builder, charts inside PDFs, warehouse or BI connector, accreditation packs for
frameworks other than NAAC, NIRF and AISHE.
