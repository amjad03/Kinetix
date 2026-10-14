# Affiliating university and board profiles

An institution picks the university or board it is affiliated to (Settings > Affiliation, also step 2 of the
setup checklist), and a scheme or regulation year. From then on grading, pass rules, SGPA/CGPA, class awards,
attendance eligibility, exam-office defaults, wording and marks-card data follow that profile. Tenants without
a profile keep the behaviour they had (their own grade scales, scheme pass rules, 75% attendance).

## Pieces

| Where | What |
|---|---|
| `services/api/src/affiliation/rules.ts` | The rules model (`RulesSchema`, zod), overrides merge, diff and validation. |
| `services/api/src/affiliation/registry/` | Code-defined presets: `universities.ts` (Karnataka universities), `boards.ts` (UGC, autonomous, CBSE, CISCE, KSEAB SSLC, Karnataka PU), `common.ts` (shared rule sets). |
| `affiliation/resolve.ts` | `resolveAffiliation(tx, programId?)`: the profile, scheme and rules in force, overrides applied. Everything else calls this. |
| `affiliation/maths.ts` | Pure rules: grace marks, aggregate minimum, class / division, percentage equivalence, register-number check. |
| `affiliation/marks-card.ts` | The marks-card data contract (`buildMarksCard`). |
| `affiliation/result-sheet.ts` | University result sheets in (profile column names and result codes) → data-migration marks layout. |
| `affiliation/templates.ts` | The profile's tabulation register for `university-results` (result download format). |
| `affiliation/describe.ts` | The rules in plain English for the ERP. |
| Tables (migration 0143) | `affiliation_settings` (one per tenant: profile, scheme, overrides), `programme_affiliations` (a programme on another profile or scheme, with its own overrides). |
| Migration 0144 | `exam_results.rules_ref` (profile, scheme, rules version, overridden) and `exam_result_lines.grace`. |
| ERP | `apps/erp/src/app/(dashboard)/settings/affiliation`, `components/settings/affiliation/AffiliationAdmin.tsx`, `lib/affiliation.ts`, strings in `i18n/messages/affiliation.ts`. |

## Profiles in the registry

| Code | Profile | Schemes |
|---|---|---|
| `bangalore-university` | Bangalore University | `sep-2024` (default), `nep-2021` |
| `bengaluru-city-university` | Bengaluru City University | same |
| `bengaluru-north-university` | Bengaluru North University | same |
| `university-of-mysore`, `mangalore-university`, `tumkur-university`, `davangere-university`, `kuvempu-university`, `karnatak-university`, `rani-channamma-university`, `akkamahadevi-womens-university` | Karnataka state universities | same |
| `vtu` | Visvesvaraya Technological University | `2022` (default), `2021` |
| `rguhs` | Rajiv Gandhi University of Health Sciences | `cbme-2023` (MBBS, NMC GMER 2023) |
| `kslu` | Karnataka State Law University | `llb-2023` |
| `karnataka-state` | Karnataka State NEP / SEP framework (any other state university) | `sep-2024`, `nep-2021` |
| `ugc` | UGC CBCS / NEP-2020 | `ccfup-2022` (4-year UG, exits at 40/80/120/160 credits), `cbcs-2015` |
| `autonomous` | Autonomous college, own regulations | `own` (rule authority: institution) |
| `cbse` | CBSE | `secondary-2026` (Class X), `senior-secondary-2026` (Class XII) |
| `cisce` | CISCE | `icse-2026`, `isc-2026` |
| `kseab-sslc` | KSEAB SSLC | `2026` (30% a subject, 33% aggregate), `2024` (35%) |
| `karnataka-puc` | Karnataka PU (II PUC) | `2026` (30% a subject and theory, 33% aggregate), `2024` (35%) |

Each scheme records `effectiveFrom` / `effectiveTo` (batches), `appliesTo`, `version` (our revision of the
encoding), `revisedOn`, `sources` (URLs) and `notes` (what an institution must confirm against its own
circulars). Several sources are affiliated colleges' copies of regulations or news reports of government
orders, because the universities' own sites were not reachable when the presets were written; the notes say
so, and every value can be overridden.

## What a scheme's rules hold

`terminology` (Semester / Class, IA–SEE or CIE–SEE, Register Number or USN, Marks Card or Grade Card),
`registerNumber` (pattern and example: VTU `^[1-4][A-Z]{2}\d{2}[A-Z]{2}\d{3}$`), `assessment` (IA/SEE split,
paper maximum and scaling, ready-made theory and practical component layouts), `pass` (external, internal,
subject and aggregate minimums, internal-marks eligibility), `grace`, `grading` (absolute / positional / marks,
bands, grade points as band values or percentage ÷ 10), `gpa` (decimals, half-up or truncate, failed credits
in the denominator), `percentage` (marks, or (CGPA − subtract) × multiplier), `classification` (CGPA- or
percentage-based classes, first-attempt conditions, minimum for the award), `credits` (total, per term, NEP
exits), `attendance` (minimum, condonation floor, per subject or overall), `examApplication` (fields),
`revaluation` (photocopy, retotalling, revaluation, window), `marksCard` (title, header fields in card order,
subject columns, summary lines, footnotes) and `resultSheet` (column names and result codes of the university's
result sheet).

## Resolution and overrides

`resolveAffiliation(tx, programId)`:

1. A `programme_affiliations` row for the programme wins. If it is on the institution's profile and scheme,
   the institution's overrides apply first, then the programme's.
2. Otherwise the institution's `affiliation_settings` row with its overrides.
3. No row: `null`, and callers keep their old behaviour.

Overrides are a partial rules object laid over the preset (`deepMerge`; arrays replace) and validated with
`RulesSchema` plus band and weight checks; `PUT /v1/affiliation/overrides` stores only the values that differ
from the preset and audits each changed path with before, after and the reason (`affiliation.overrides_saved`).
Choosing another profile or scheme clears overrides made for the old one. If a preset revision makes stored
overrides invalid, resolution uses the preset alone and the overview reports `overridesValid: false`.

## What reads the profile

| Behaviour | Code | Rule |
|---|---|---|
| Subject grade, grade point, pass | `ExamsService.scheme/compute` | With `ruleAuthority: 'university'` the profile's grade scale and pass rules replace the subject scheme's; an approved `grading/pass-mark` governance rule still overlays. Autonomous: the scheme's stand. |
| Absent and NE | `profileChecks` | Absent in every external assessment fails with the profile's absent grade; internal marks under `internalEligibilityPercent` give NE. |
| Grace | `applyGrace` | Whole marks, smallest shortfall first, per-subject / total / subject-count limits, all-or-nothing; never for absentees or internal shortfalls. Stored in `exam_result_lines.grace`. |
| SGPA / CGPA | `sgpa`, `cgpa` | Profile decimals and rounding; failed credits in or out of the denominator. |
| Examination outcome | `examPassed` | Every subject plus the aggregate minimum (SSLC / PUC 2026). |
| Result provenance | `exam_results.rules_ref` | Profile, scheme, version, overridden. |
| Attendance eligibility | `attendanceSettings` | Programme override > approved governance rule > profile (VTU 85, BCI 70, ...) > tenant setting > 75. |
| Exam-office defaults | `officeSettings` | Profile grace and revaluation window replace the generic defaults (saved office settings still win). |
| Scheme presets | `GET /v1/scheme-presets` | Adds `affiliation` (theory) and `affiliation-practical` layouts and the profile's grade scale; `POST /v1/grade-scales {preset: 'affiliation'}`. |
| Transcripts / consolidated cards | `AcademicDocsService.snapshot` | Profile CGPA rounding, classes (first-attempt conditions) and term wording. |
| Wording | `GET /v1/institution/capabilities` | `affiliation.terminology`. |
| Setup checklist | `GET /v1/admin/institution/setup` | `affiliation`; ERP step "Affiliation". |
| Relative (curve) grading | `relativeSettings`, `ExamsService.compute` | Allowed only where `grading.relative.allowed` (UGC CBCS: yes, from 30 candidates, moderation up to 5 marks; VTU and the other presets: no); with no profile the institution's own rules allow it. The exam office turns it on (`exam_office_settings.settings.relativeGrading`), previews a subject (mean, SD, cut-offs at mean + z × SD, never below the pass mark, with a moderation shift; both grade distributions) and applies it per session subject (`exam_relative_grades`). Passing candidates of a curved subject take the curve's grade; failures, absentees and NE keep the absolute result. Published or frozen results never change. ERP: Exams > Relative grading. |
| Re-admission scheme | `GET/POST /v1/readmissions` | A student rejoining after a break moves to the programme's curriculum version in force on the day (latest regulation year not after it, effective date reached). Passed subjects count by the same code or by an equivalence (`curriculum_equivalences`, record kit `curriculum-equivalences`); earlier-term subjects of the new version not covered are listed to take. Applying pins the student to the new version and records `student_readmissions` with the plan (audit `student.readmission_scheme`). ERP: Curriculum > Re-admission, linked from the student profile. |

## Marks-card data contract

`GET /v1/affiliation/marks-card/:studentId?sessionId=` (student, family, staff; published sessions only)
returns `MarksCardData`:

- `title`, `profile` (code, name, scheme, version);
- `header`: the fields the card prints, in its order, each `{ field, label, value }` (university, college and
  code, programme, branch, scheme, term, examination month and year, name, register number with the profile's
  label, parent name, medium, serial number, date of issue);
- `columns` and `subjects`: per subject code, title, credits, internal and its maximum, external (grace
  included) and its maximum, total, grace, grade (absent grade when absent), grade point and credit points
  (only when the profile uses grade points), result;
- `summary`: total marks, percentage, SGPA, CGPA, credits registered and earned, credit points, result, class,
  percentage equivalent, as the profile lists them;
- `legend` (grade bands), `footnotes`, and `result` (passed, class, percentage, equivalent, reasons).

The documents module renders it; this module does not draw.

## University result formats

- In: `POST /v1/affiliation/result-sheet {csv, academicYear, term, programId?, dryRun}` reads a result sheet
  with the profile's column names (VTU: USN, Subject Code, Internal Marks, External Marks, Total, Result with
  P / F / A / W / X / NE), rejects unknown result codes row by row, and runs the data-migration marks import
  (dry run, reconciliation, rollback) into `legacy_marks`.
- Out: `POST /v1/affiliation/tabulation-template` saves the profile's tabulation register as a
  `university-results` template (pass rules, grace, classes in percent, column layout).

## Adding or revising a profile

1. Add or change the scheme in `registry/`. Revising rules in place: raise `version` and `revisedOn` so new
   results record the new version; add a new scheme when the university issues new regulations for new
   batches (keep the old one with `effectiveTo`).
2. Cite every source in `sources`; put anything not confirmed from the regulation itself in `notes`.
3. Add a worked example to `affiliation.spec.ts` (the registry test checks every scheme validates).
