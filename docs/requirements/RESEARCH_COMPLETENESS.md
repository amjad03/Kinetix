# Research, projects and IPR: completeness against Linways, the big Indian ERPs and the UGC, NAAC, NIRF, NBA and AISHE asks (checklist section 15 and the pass brief)

Audit of `docs/research/MODULE_DEPTH_CHECKLIST.md` section 15, `RESEARCH_PROJECTS_DETAILED_SPEC.md` and the research
pass brief (profiles and identifiers, publications with indexing and DOI, funded projects, consultancy, IPR, Ph.D.
scholars from registration to Shodhganga, ethics, seed money and incentives, MoUs, events, centres, NAAC criterion 3,
NIRF RP, NBA, AISHE, the Teacher App), read in code and exercised against the Soundarya seed (API calls on a seeded
database, the ERP pages in Playwright at 1280px and 390px with `apps/erp/scripts/research-qa.mjs`), API e2e and Teacher
App widget tests. **Before** is the branch at `db27669`.

Status words: **Have** (built and tested before), **Built** (missing before, built now), **Deepened** (partial before,
gaps closed now), **Fixed** (broken before). Migrations: `0216_research_profiles_funding_incentives`,
`0217_research_scholars_progress_similarity`. New tests: `services/api/test/research-pass.e2e.spec.ts` (9 workflows,
figures worked by hand in comments), `test/soundarya-research-pass.e2e.spec.ts` (the seed keeps its own rules),
`src/research/research-pass.rules.spec.ts` (7 rule groups), `apps/erp/src/lib/research-pass.test.ts` (3),
`apps/teacher/test/academics_test.dart` (3 new widget tests, 2 updated).

Counts (66 items): before **24 Have, 7 Partial, 30 Missing, 5 Broken**; after **66 Done** (22 Have unchanged, 30 Built,
9 Deepened, 5 Fixed; two items that were Have are now Deepened).

## Faculty research profile

| Item | Before | After | Evidence |
|---|---|---|---|
| ORCID iD, Scopus Author ID, Web of Science ResearcherID, Google Scholar, Vidwan, IRINS link, research areas | Missing | Built | `research_profiles` (0216); kit `research-profiles`; `GET/PUT /v1/research/profiles/me`; Teacher App **My research** |
| Identifiers checked and normalised (ORCID mod 11-2, Scopus 10-11 digits, ResearcherID `AAB-1234-2019`, the id read from a Scholar or Vidwan link) | Missing | Built | `research-pass.rules.ts` `validScopusId`, `validWosId`, `scholarIdOf`, `vidwanIdOf`; e2e "keeps each teacher's researcher identifiers" |
| One ORCID iD per teacher; one profile per teacher | Missing | Built | partial unique index; `ORCID_TAKEN` |
| The research office verifies; a teacher's change to an identifier needs verifying again (metrics do not) | Missing | Built | kit action **Mark verified**; `verified_at` cleared; e2e checks both |
| h-index and citations as Scopus, Web of Science and Scholar report them, with the date | Missing | Built | `scopus_h_index` … `metrics_on` |
| Profile from the records: publications as owner or co-author, citations, h-index, i10, grants, IPR, consultancy, recognitions, scholars; Excel | Have | Deepened | `reports/faculty-profile`; now also `GET /v1/research/me` with identifiers and incentive claims |
| Works imported from ORCID | Have | Have | `publications/import-orcid`; now also refuses title duplicates and records where the details came from |

## Publications

| Item | Before | After | Evidence |
|---|---|---|---|
| Journal, conference, book and chapter with Scopus, Web of Science, UGC-CARE, PubMed indexing, quartile, impact factor, citations, ISSN/ISBN | Have | Have | kit `research-publications` |
| UGC-CARE group I / II | Missing | Built | `publications.ugc_care_group`; refused unless indexed in UGC-CARE |
| DOI look-up from Crossref | Have | Deepened | `GET publications/doi-lookup` answers the record and any duplicate before saving |
| Offline fallback: a cached copy answers while the registry is down; with none, the typed-in title, venue and year are kept as pending and completed later | Missing | Built | `research_doi_cache` (0216), `DoiLookup`, `import-doi` `fallback`, `POST publications/refresh-pending`; ERP **Add by DOI** and **Refresh pending DOIs**; e2e "looks a DOI up through its cache …" |
| Where a record's details came from (by hand, Crossref, ORCID, pending) | Missing | Built | `publications.metadata_source` |
| Duplicate detection | Partial: the same DOI, or exactly the same title in the same year, only in the kit form | Deepened | `publication-dupes.ts` `duplicateOf`: the same DOI, or the same title with case, spacing and punctuation set aside, a year apart (online and print); different DOIs are never duplicates; used by the kit, DOI import, ORCID import and `POST publications`; `POST publications/check-duplicate`; expression index `publications_title_key_idx` |
| A paper with co-authors from several institutions credited once; staff co-authors credited by name | Have | Have | `creditPeople` |
| A retracted paper stays on record and stops counting | Have | Have | research-depth e2e |
| The demo's indexing values (`'Scopus'`, `'UGC-CARE'`) did not match the codes, so the demo counted no indexed paper | Broken | Fixed | `soundarya/operations.ts` uses `scopus`, `ugc_care`, with credited authors |
| A teacher's publication list (Teacher App) showed only the papers they recorded, not those crediting them | Broken | Fixed | `GET /v1/research/publications?ownerUserId=` includes co-authored; e2e |

## Funded projects and consultancy

| Item | Before | After | Evidence |
|---|---|---|---|
| Agency, scheme, sanction, dates, PI and co-investigators (project members) | Have | Have | kit `research-grants`, `project_members` |
| Agency kind (government, non-government, international, industry) for NAAC 3.1 | Partial: guessed from the agency name in the report | Deepened | `research_grants.agency_kind` (0216, back-filled from the name); kit field; NAAC sources read it |
| Budget heads (manpower, equipment, consumables, travel, contingency, overhead) with what each sanctions | Missing | Built | `research_grant_heads` (0216); kit `grant-heads` with spent and left; heads cannot add up to more than the sanction or drop below what was spent |
| Each expense booked to a head and stopped at it | Missing | Built | `grant_expenses.budget_head`; `expenseRefusal` `HEAD_OVERSPEND`; `HEAD_REQUIRED` once a grant has heads |
| Fund releases by instalment (paise), with the date the money arrived | Missing | Built | `research_grant_releases` (0216); kit `grant-releases`; releases cannot add up to more than the sanction |
| Spending stops at what the agency has released | Missing | Built | `FUNDS_NOT_RELEASED`; e2e: 6 lakh spent of 6 released, the next ₹50,000 waits for instalment 2 |
| Overhead percentage and the amount earned on releases | Missing | Built | `research_grants.overhead_pct`; grant list `overhead`; statement |
| Utilisation certificates per period, filled from expenses | Have | Have | kit `grant-ucs` **Fill from expenses** |
| The GFR 2017 form 12-A figures for any period (unspent at the start, received, available, spent, unspent at the end), by head, with releases; Excel | Missing | Built | `GET grants/:id/statement(.xlsx)`; `ucFigures`; ERP reports **Grant statement and utilisation certificate**; e2e figures by hand; a grant with no release recorded is taken as received on its start date and says so |
| Expenses locked against overspending under concurrency | Have | Have | `for('update')` on the grant |
| Consultancy, testing and corporate training with the institution's and consultants' shares | Have | Have | kit `research-consultancies` |
| Funding calls with internal deadlines gating submission | Have | Have | kit `research-calls` |

## IPR, ethics, seed money, incentives, collaborations

| Item | Before | After | Evidence |
|---|---|---|---|
| Patents, copyright, designs, trademarks: filed, published, granted, rejected; licensing revenue | Have | Have | kit `research-patents` actions |
| Ethics approvals (IEC, IAEC, IBSC) with expiry, clearing the proposal's ethics step | Have | Have | kit `research-ethics` |
| Seed money with utilisation and report | Have | Have | kit `research-seed-grants` |
| Incentive schemes: rates by Scopus/WoS quartile, Scopus, WoS, UGC-CARE, books, chapters, conference papers, patents published or granted; yearly cap; validity | Missing | Built | `research_incentive_schemes` (0216), kit with **Set rates** (rupees typed, paise stored) |
| Claims worked out by the scheme: best rate, co-author share (`coAuthorIncentivePct`, 50%), cut to the yearly cap; one claim per scheme and paper; approve (never one's own), reject with reason, pay with reference; the teacher told | Missing | Built | `POST incentives/claims`, `research_incentive_claims`, kit actions, notifications; e2e: ₹25,000 Q1, ₹5,000 co-author at the cap, `CAP_REACHED`, a rejection frees the cap, a retracted paper `NOT_ELIGIBLE` |
| MoUs and the activities under them; functional MoUs | Have | Have | kits `research-mous`, `research-mou-activities` |
| Seminars, workshops, FDPs organised: kind, what about (research methodology, IPR, entrepreneurship), participants, sponsorship | Partial: name, role, level only | Deepened | `conferences.event_kind`, `theme`, `participants`, `sponsor`, `sponsored_paise` (0217) |
| Research centres recognised by the university, with the order, validity, head, scholars, guides and projects | Missing | Built | `research_centres` (0216); kit `research-centres`; scholars and projects placed in a centre |
| Central instruments with internal and external billing | Have | Have | kits `research-equipment`, `research-equipment-usage` |
| Datasets with access rules and embargo | Have | Have | `datasets.controller.ts` |
| "Due in 14 days", "expiring", "overdue" filters (calls, ethics, MoUs, doctoral committees, centres) | Broken: read the database server's UTC day, not the institution's clock (the research-depth e2e failed) | Fixed | `TODAY` in `research.records.ts` reads the application clock in the tenant's time zone |

## Ph.D. scholars

| Item | Before | After | Evidence |
|---|---|---|---|
| Registration | Partial: name, programme, supervisor, date | Deepened | `research_scholars` (0217): registration number (unique), full or part time, department, centre, fellowship and its agency (JRF, SRF, institute), admitted through (NET, GATE, SET, entrance test, exempt), gender, category, coursework and synopsis dates (in order) |
| The last day to submit: six years, eight for women (UGC 2022) | Missing | Built | scholars list `submitBy`; `maxSubmissionOn` |
| Supervisor allocation with load caps | Partial: 8 for everyone | Deepened | UGC 2022 caps from the designation (Professor 8, Associate Professor 6, Assistant Professor 4), else `supervisorCapDefault`; a set cap wins; e2e refuses a fifth scholar for an assistant professor |
| Coursework (research methodology, publication ethics, subject papers) | Have | Have | kit `scholar-coursework` |
| Doctoral / research advisory committee meetings with the next one due | Have | Have | kit `scholar-dc-meetings`, overdue filter |
| Six-monthly progress reports: the supervisor (or office) records, accepts with a rating or returns for corrections; periods cannot overlap; the scholar told | Missing | Built | `scholar_progress_reports` (0217); kit `scholar-progress-reports` with **Accept**, **Return for corrections**; the scholars list shows the last report |
| Synopsis, draft, submission, examiners, viva, award | Have | Have | `thesis.controller.ts`; the award date now kept |
| Internal similarity check against the institution's theses | Have | Have | `internalSimilarity` |
| The university's plagiarism software (URKUND / Ouriginal or DrillBit under ShodhShuddhi, Turnitin, iThenticate): report number, link, score and the UGC 2018 level | Missing | Built | `POST theses/:id/similarity/external`, `similarity_checks.report_ref`, `report_url`, `level`; ERP thesis dialog **Record similarity report** |
| Similarity limit before examination | Broken: 25%, where the UGC 2018 regulations put level 0 at 10% | Fixed | research setting `similarityLimitPercent` (default 10); the office overrides with a reason as before |
| E-copy deposited with INFLIBNET Shodhganga after the award, with its handle | Missing | Built | `POST theses/:id/shodhganga`, `thesis_records.shodhganga_handle` (0217); ERP **Record Shodhganga deposit** |

## Reports

| Item | Before | After | Evidence |
|---|---|---|---|
| NAAC criterion 3 year by year from the records | Have | Have | `reports/naac-c3` |
| 3.1 grants from government and non-government agencies | Partial: by agency name | Deepened | by `agency_kind` |
| 3.3 papers "indexed in Scopus or Web of Science" counted a paper indexed anywhere | Broken | Fixed | `indexed_in && array['scopus', 'wos']` |
| 3.2.2 workshops on research methodology, IPR and entrepreneurship | Partial: campus events only | Deepened | also the research office's events organised on those themes; e2e 2025-26 = 1 |
| NIRF RP data for three financial years (sponsored research, consultancy, EDPs, publications, IPR) | Have | Have | `reports/nirf-rp(.xlsx)` |
| NIRF ratios: PU (papers per faculty a year), QP (citations per paper), FPPP (research and consultancy per faculty), IPR | Missing | Built | `GET reports/nirf-params`, `nirfRatios`; research money is what was released (or sanctioned where no release is recorded); e2e 0.22 and 1 lakh worked by hand |
| NBA SAR criterion 5 for CAY, CAYm1, CAYm2, for a department or the institution | Missing | Built | `GET reports/nba` |
| AISHE: Ph.D. enrolment as on 30 September by department, mode, category and women; Ph.D.s awarded; fellowships | Missing | Built | `GET reports/aishe`; e2e table by hand |
| NBA and AISHE workbook; grant statement workbook | Missing | Built | `reports/nba-aishe.xlsx`, `grants/:id/statement.xlsx`; ERP downloads (`api/download` ids `nba-aishe`, `grant-statement`) |
| The IQAC reads the research reports | Missing: the quality officer was sent away | Built | `RESEARCH_REPORT_ROLES`; the ERP shows the IQAC the Reports view only; e2e "lets the IQAC read the research reports and nothing else" |

## Apps and the ERP

| Item | Before | After | Evidence |
|---|---|---|---|
| Teacher App: projects, scholars and theses, publications by DOI, datasets | Have | Have | `research_screens.dart` |
| Teacher App: my research (publications, citations, h-index, i10, IPR, scholars guided), identifiers with edit and verification state, IPR list, incentive claims | Missing | Built | **My research** tab; `myResearch`, `saveResearcherIds`; widget tests in en and hi |
| ERP: every new register on the record kit (add, edit, history, bin, bulk, import, export, saved views) | Missing | Built | seven kits in `research-pass.records.ts`; `ResearchLists.tsx` specs; Excel templates (e2e downloads each) |
| ERP: new fields on the existing lists (UGC-CARE group, details from, released, overhead, agency kind, registration no., mode, fellowship, centre, last report, submit by, event kind, theme) | Missing | Built | `ResearchLists.tsx` |
| en, hi and kn for every new string | Missing | Built | `apps/erp/src/i18n/messages/research-pass.ts` (351 keys), Teacher App ARB (31 keys); `i18n.test.ts` |

## Hardening

- Every new endpoint has a role check: researcher identifiers and claims are the teacher's own (`FACULTY_ROLES`), the
  grant statement only for the project's people and the office (`404` otherwise), registers write for the office
  (`RESEARCH_ROLES`), reports for the office, heads and the IQAC (`RESEARCH_REPORT_ROLES`). Every new table has
  row-level security (`TENANT_TABLES`, `rls.e2e`); the e2e checks a student refused and another institution seeing
  nothing on each new list and report. `docs/security/AUTHZ_MATRIX.md` regenerated.
- Bodies and queries are Zod-validated; incentive rates are parsed from rupees to paise; money is integer paise
  throughout; dates are IST days from the application clock (the old filters used the database's UTC day).
- Idempotent: one claim per scheme, teacher and paper (unique index, `ALREADY_CLAIMED`); one instalment number per
  grant; one head per grant; one progress report per period start; the DOI cache is upserted; pending DOIs refresh once.
- Registry look-ups (Crossref) happen outside the database transaction with a timeout.
- Lists are paginated server-side by the kit; the new figures are sub-selects in the list query (no per-row requests).
- No PII in logs; audit entries for every write and export (`research.incentive_*`, `research.profile_verified`,
  `thesis.similarity_report`, `thesis.shodhganga_deposited`, `research.grant_statement_exported`, …).

## Seed (Soundarya)

Researcher identifiers for eight research-active faculty (five verified), two recognised centres (one recognition
running out), 24 publications over 2022 to 2026 with indexing, quartiles, impact factors and citations (one retracted,
one waiting for the DOI registry), four IPR records through to a licensed patent, four funded projects (AICTE, ANRF,
ICSSR, Infosys Foundation) with 19 budget heads, six instalments, expenses by head and four UCs (one returned), five
consultancy and training jobs, four MoUs with activities, seed money, awards and fellowships, three ethics approvals
(one expiring), four funding calls (one closing in a fortnight), three central instruments with bookings, five events
(IPR, research methodology, entrepreneurship), two incentive schemes with claims in every state, and nine Ph.D.
scholars with registration detail, coursework, doctoral committee meetings, progress reports in every state, a thesis
with its DrillBit report and an awarded thesis on Shodhganga.

## Not done

- The plagiarism engines are recorded by report (number, link, score); ZYNETIX does not upload the thesis to URKUND,
  DrillBit or Turnitin itself, as their institutional APIs need the university's own contract keys.
- NIRF's published PU, QP and FPPP scores are percentile-scaled against all participating institutions; ZYNETIX
  shows the institution's own inputs and ratios, not the score.
- Scopus and Web of Science citation counts are entered (or imported with ORCID works); there is no licensed Scopus
  or Web of Science API pull.
