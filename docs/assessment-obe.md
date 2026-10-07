# Assessment, exams, results and OBE

API: `services/api/src/exams`, `src/obe`, and the workflow additions in `src/marks`. ERP: `/exams`, `/exams/schemes`, `/exams/[id]`, `/results/[id]` (marks entry panel), `/obe`, `/obe/setup`, `/obe/matrix`. Migrations 0046 to 0050.

## Assessment
- A **scheme** per subject and academic year: components (kind internal/external/practical/project/viva, weights adding to 100), credits, pass rules, and a **grade scale** (bands plus `band` or `percentOver10` grade points). Presets: `bu-nep`, `ugc-10`, `cbse` (`GET /v1/scheme-presets`). Everything board-specific is configuration; the maths is in `exams/grading.ts`.
- **Marks workflow** on assessments: draft, submitted (teacher), verified (head of department or principal; not the creator), moderated (adjustments with a reason; original kept). `reopen` clears moderation. Marks of an exam are frozen once its session is processed. Existing class tests are unaffected (they stay `draft`).
- **Exam session**: papers (each creates the exam assessment, linked to the scheme's external component), clash check, seating (papers at the same time share halls, neighbours write different papers), hall tickets (withholding with a reason), PDF.
- **Processing** refuses until every component has verified marks. SGPA = credit points / credits attempted (a failed subject counts as 0); CGPA = all credit points / all credits attempted, a later attempt replacing an earlier one. Publish notifies classes and publishes the exam assessments, so the Student and Parent apps' `GET /v1/marks/students/:id` keep working (it now returns moderated marks). New: `GET /v1/results/students/:id`, marks-card and transcript PDFs.
- **Revaluation**: student or family requests while published; principal accepts, enters the re-checked marks, the student is re-graded. **Lock** ends the window.
- PDFs are produced by a small built-in writer (`common/pdf.ts`); only Latin text is drawn.

## OBE
- Programme statements (mission, vision, PEO, PO, PSO) and per-programme attainment rules (`AttainmentConfig`: student threshold, level bands, evidence weights, direct/indirect weights, target).
- COs are versioned per subject (draft, active, retired). Only drafts change; a new version copies COs and matrix. CO to PO/PSO strength 1 to 3.
- Assessments map to COs with a share of their marks. Direct attainment per evidence kind, weighted; indirect from surveys (ignored below their minimum responses); combined by weights; PO/PSO by mapping strength. Each run stores snapshots, so trend and reports are reproducible. Gaps, improvement actions and evidence links are tracked.
- Reports: `GET /v1/obe/programs/:id/report.csv|pdf?academicYearId=&framework=nba|naac`.

## Testing
`KINETIX_PG_ADMIN_URL` (or `KINETIX_TEST_ADMIN_URL`) is a superuser connection URL used by `test/global-setup.ts`; without it the old `sudo -u postgres psql` is used. `KINETIX_TEST_DB` picks the database.
