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

## Accreditation and statutory returns

Code: `services/api/src/accreditation/` (routes under `/v1/accreditation`). ERP: Accreditation hub
(`/accreditation`), one page per framework (`/accreditation/<framework>`: readiness, criteria and
metrics, tasks, DVV, benchmarks), the metric workbench (`/accreditation/<framework>/metrics/<code>`)
and `My accreditation tasks`. Migrations 0127, 0141 (catalogue keys, year-wise inputs and options,
DVV detail, settings) and 0142 (tasks, comments).

### Catalogue (`frameworks/`)

Framework -> criteria -> key indicators -> metrics, in code so a manual change is a reviewed diff
with a test. Each metric carries its number, type (QnM / QlM / choice), title, unit, weightage (NAAC
metric weightage, NBA marks, NIRF sub-parameter marks), the formula as the manual states it, its
inputs (each optionally fed by a live ERP source or by the rows of its data template), how years
combine (`avg`, `sum`, `latest`, `pool`), the years it covers, the data template columns in the
official order, the evidence documents asked for, and a benchmark or a marks function.

| Key (alias) | Framework | Basis |
| --- | --- | --- |
| `naac-aff-ug` (`naac`) | NAAC affiliated / constituent UG college, criteria 100/350/110/100/140/100/100 | Revised RAF manual, 21 Dec 2022 |
| `naac-autonomous` | NAAC autonomous college, 150/300/150/100/100/100/100 | Revised RAF manual for autonomous colleges |
| `naac-university` | NAAC university, 150/200/250/100/100/100/100 | Revised RAF manual for universities |
| `nba-ug-eng-t2` (`nba`) | NBA SAR, UG engineering, Tier-II, nine criteria, 1000 marks | SAR format GAPC v4.0 (Jan 2025); Tier-II formulas (enrolment bands, success index, API, placement index, SFR, cadre ratio, FQ) |
| `nirf-college`, `nirf-university`, `nirf-engineering` (`nirf`), `nirf-management`, `nirf-pharmacy` | NIRF TLR (SS, FSR, FQE, FRU), RP (PU, QP, IPR, FPPP), GO (GPH, GUE, MS, GPHD), OI (RD, WD, ESCS, PCS), PR | NIRF methodology; category weights (college 40/15/25/10/10, others 30/30/20/10/10) |
| `aishe-dcf2` (`aishe`) | AISHE DCF-II college form, blocks 1-9 | Not scored |
| `udise-plus` (`udise`) | UDISE+ school profile and facilities, teacher profile, student profile | Not scored |

NAAC metric numbering, types and template columns follow the manuals; the split of a key
indicator's weightage across its metrics, the NBA marks inside a criterion and the college NIRF
sub-parameter marks are our reading and can be overridden per institution
(`PUT /:fw/settings`, `accreditation_settings`). NAAC announced binary accreditation with
maturity-based graded levels (MBGL) in February 2025; the readiness view reports whether the
binary data set is complete (extended profile, every year of every quantitative metric, every
narrative, evidence, floor CGPA at least 1.51) and keeps the RAF CGPA estimate for continuity.

### Computation (`engine.ts`, `sources.ts`)

A submission is the window of academic years (1 June to 31 May) ending with the cycle: five for
NAAC, three for NBA and NIRF, one for AISHE, UDISE+ and the AQAR. For each metric and year an input
is, in order: the figure entered for that year, the value read from the data template rows entered
for that year (count, sum or distinct of a column), or the live ERP source. About 80 sources
(students on roll, admitted, seats sanctioned and reserved, final-year results, result days,
revaluation requests, full-time teachers by qualification, experience band and cadre, FDPs,
mentors, publications, patents, grants by agency type, Ph.D. scholars, placements and median
salary, internships, scholarships and fee waivers, counselling, grievances, club achievements and
service-club activities, value-added course registrations, rooms, ICT rooms, computers, capital,
maintenance and operational expenditure, library spend and use, IQAC meetings, survey ratings, OBE
attainment) each return the records behind the figure and the figure computed from exactly those
records, so the drill-down and the number never disagree. A zero computed while an ERP input has no
records for the year is treated as "not recorded". Sources run sequentially on the request's
transaction, each in a savepoint so a module not deployed leaves an input empty instead of failing.

Per metric the API returns every year's inputs (with source and record count), the year values,
the filed value, the combined inputs, the score (NAAC points out of 4 from the benchmark, the
options ticked or the institution's own marking; NBA and NIRF marks from the formula), evidence
count and completeness (80% data for every required year, narrative or options answered; 20%
evidence). Criteria roll up to the NAAC grade point (scored metrics, and all metrics with unfilled
at zero), NBA marks or the NIRF parameter score; the framework to the CGPA and grade, total marks
or NIRF score.

### Evidence, DVV, tasks

Evidence lines are `obe_evidence` rows (`scope = 'metric'`) on the metric's entry for a year, with a
scanned file (JSON blob or multipart PDF / image) or a link; `GET evidence/:id/download`. DVV
clarifications (`dvv_queries`) carry the deviation, the value filed and the value DVV recommends,
the response, documents (`scope = 'dvv'`), status (open, answered, accepted, rejected, closed) and a
respond-by date. Tasks (`accreditation_tasks`) assign a metric or a criterion to a department and /
or an owner with a reviewer and due date; owners may then read and fill that metric (otherwise
only the quality team writes), start and submit it; the reviewer or quality team approves or
returns it. The daily job `accreditation.reminders` (and `POST /:fw/tasks/remind`) notifies the
owner, or the head of the assigned department, of work due within three days or overdue, once a
day per task. Comments live in `accreditation_comments`.

### Endpoints

| Route | Purpose |
| --- | --- |
| `GET frameworks`, `GET frameworks/:fw` | Catalogue list; one framework as a tree with formulas, inputs, template columns, evidence, weightage and benchmarks |
| `GET/PUT :fw/settings` | Benchmark and weightage overrides |
| `GET :fw/overview`, `GET :fw/readiness` | All metrics year by year with scores; executive view (estimate, criteria with owners and due dates, gaps, tasks, DVV counts) |
| `GET/PUT :fw/metrics/:code` | Metric detail with ERP records, rows, evidence, comments, DVV; save inputs, figure, rows, options, narrative, own marking for a year |
| `GET :fw/metrics/:code/template.xlsx`, `POST :fw/metrics/:code/import` | Data-entry template (official columns, year-wise inputs, options, evidence list) and bulk import |
| `GET/POST :fw/metrics/:code/evidence`, `POST evidence/:id/file`, `GET evidence/:id/download`, `DELETE evidence/:id` | Evidence by year |
| `GET/POST :fw/metrics/:code/comments` | Comments |
| `GET/POST :fw/tasks`, `PUT/DELETE tasks/:id`, `POST :fw/tasks/remind`, `GET my-tasks`, `GET people` | Assignment, review, reminders |
| `GET/POST dvv`, `PUT dvv/:id`, `GET/POST dvv/:id/documents`, `GET :fw/dvv.xlsx` | DVV tracker and register |
| `GET :fw/export.zip` | NAAC SSR: `Extended profile.xlsx`, `Criterion N/<metric>.xlsx` (data template in NAAC column order for every year, year-wise inputs, summary), `Summary.xlsx`, `DVV clarifications.xlsx`, `README.txt` |
| `GET :fw/aqar.xlsx` | NAAC AQAR for one year: Part A, one sheet per criterion, the year's data templates |
| `GET :fw/export.xlsx` | NBA SAR (criterion sheets, Tables 4.x and 5.x by CAY/CAYm1/CAYm2, CO-PO attainment and matrix); NIRF DCS sheets (sanctioned intake, total actual student strength, placement and higher studies, Ph.D., capital and operational expenditure, sponsored research, consultancy, executive development for management, PCS facilities, faculty details, IPR) with the score estimate; AISHE DCF-II blocks 1-9; UDISE+ profile, facilities, teacher profile, enrolment by class, student profile (SDMS), results |
| `GET :fw/evidence-pack.zip` | Every evidence file in `Criterion N/<metric>/<year>/`, with `00 Evidence index.pdf` and `.csv` (200 MB cap; the index lists what was left out) |

Where ERP records cannot fill an official template, the metric's rows are mapped from the source
records by column-name matching (each template column takes at most one record column); rows
entered or imported by the institution always win.

## Not built

Custom report builder, charts inside PDFs, warehouse or BI connector. Accreditation: NBA SAR for
Tier-I and for management programmes, AICTE approval-process returns, UGC returns and CBSE
affiliation (OASIS) data are not seeded; AISHE and UDISE+ items the ERP does not record (social
category of staff, disability, religion, Aadhaar, PEN) are listed as "To complete by hand".
