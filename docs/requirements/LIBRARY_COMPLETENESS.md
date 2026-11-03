# Library: completeness against Koha, SOUL 3.0 and the Linways library (checklist section 10 and the library brief)

Audit of `docs/research/MODULE_DEPTH_CHECKLIST.md` section 10, `LIBRARY_DETAILED_SPEC.md` and the library pass brief,
exercised against the Soundarya seed: a seeded database with the API (port 4321) and the ERP (port 3321) driven by
Playwright at 1280px and 390px (`apps/erp/scripts/library-qa.mjs`: 18 pages, each loads with a heading, no error
state, no sideways scroll and no console errors), API e2e, and Student and Teacher App widget tests. **Before** is
the branch at `b592af4`.

Status words: **Have** (built and tested before), **Built** (missing, partial or broken before, built now),
**Deepened** (existed, gaps closed now). Migrations: `0202_library_circulation_rules`,
`0203_library_acquisition_serials_eresources`. New tests: `services/api/test/library-pass.e2e.spec.ts` (11 workflows,
figures worked by hand in comments), `test/soundarya-library-pass.e2e.spec.ts` (seed), `apps/erp/src/lib/library-pass.test.ts`
(7), `apps/teacher/test/library_test.dart` (3), one new Student App widget test. Fixed older tests:
`depth-campus` and `campus-ops-depth` (held copy and limit refusals are 409 like the copy desk; stock verification is
by copy now).

Counts (50 items): before **25 Have, 11 Partial, 12 Missing, 2 Broken**; after **50 Done** (25 Have, 25 Built or Deepened).

## Cataloguing

| Item | Before | After | Evidence |
|---|---|---|---|
| Catalogue with record kit (add, edit, history, bin, import, export) | Have | Have | `library.records.ts` `library-books`; `library-depth.e2e` |
| Accession register, a number per copy, multiple copies, branches | Have | Have | `library-copies`, `library-branches` |
| MARC21 import (ISO 2709 and MARCXML) and export | Have | Have | `marc.ts`, `/library/desk` MARC card |
| Copy cataloguing from another catalogue (SRU, the web form of Z39.50) | Missing | Built | `copy-catalogue.ts`, `POST /v1/library/copy-catalogue/import`; test "copy-catalogues a MARC record…" (duplicate ISBN 409, no title 400) |
| ISBN lookup (catalogue, Open Library) | Have | Have | `isbn-lookup.ts`, desk lookup |
| Call numbers: DDC and Colon Classification (also UDC, LCC) | Partial: DDC only | Built | `class_scheme`, `class_number`, `book_number` (0203); `/v1/library/call-number` |
| Barcode and RFID labels | Partial: book-level barcode sheet | Built | `GET /v1/library/copies/labels.pdf` (Code 128 per copy, spine label with call number) and `copies/rfid.csv` (the encoder's list); desk **Labels and RFID tags**; test checks range filtering |

## Circulation and rules

| Item | Before | After | Evidence |
|---|---|---|---|
| Issue and return by scanning card and copies | Have | Have | `/v1/library/desk/issue|return` |
| Renew, with limits and the queue | Have | Deepened | renew limit and fine now from the loan's own material rule (`/me` fix) |
| Reservations and holds, hold-ready notice | Partial: students only, no notice | Built | holds by card for any member (0202 `member_id`), `notifyReady`; ERP OPAC reserve for self or a card; apps reserve |
| Member category rules (loan period, limits) | Have | Have | `library-member-categories` |
| Circulation rules matrix (category × material, grace, cap, per-material limit, read-in-library) | Missing | Built | `library_circ_rules` (0202), `rulesFor`; test "keeps a rules matrix…" and "issues under the matrix…" (reference refused, 2-item limit, Sunday due date to Monday); desk **Which rule applies** |
| Holiday-aware fines from the academic calendar | Missing: every day counted | Built | `fines.ts` (closed weekdays, published institution-wide holidays; a programme's own holiday does not count); test: 15 Oct return within grace = ₹0, 19 Oct = 4 open days = ₹4, 2 Nov capped at ₹10 |
| Fine waiver with approval | Have | Have | `library-fine-waivers` |
| Fine payment through fees | Partial: per loan only | Deepened | `sendMemberFinesToFees` (each loan in a savepoint, idempotent); member action and reports page; test: ₹4 sent once, second run sends nothing |
| Issue blocked on dues | Have | Have | `blockIssueAtFinePaise` |
| No-dues clearance feeding TC and exit | Partial: manual clearance only | Built | `assertLibraryClearForTc` in `certificates.service.ts` (fines on fees count until paid); `/v1/library/exits` (TC requests, students who left owing, staff at clearance) and staff clearance into the settlement; reports page; test (exits list, no-dues waits for the fee) |
| Exits list query | Broken: `students.created_at` does not exist (500) | Built | fixed to `updated_at`; test |
| Lost or damaged book with charge; replacement copy | Have | Have | `settleLoan`, `replaceLost` |
| Book bank (SC/ST) semester loans | Have | Have | category kind `book_bank` |
| Staff and external members with deposits | Have | Have | `library-members` deposit actions |
| Wrong-branch return in transit | Have | Have | `returnLoan` |

## Gate, kiosk and OPAC

| Item | Before | After | Evidence |
|---|---|---|---|
| Gate register and footfall | Have | Have | `library-gate`, gate swipe |
| RFID self-check kiosk | Partial: student self-checkout by typed number; SIP2 for hardware | Built | `/library/kiosk` (card tap, RFID pad or scans, borrow under own rules, return without card, idle reset; phone layout checked); SIP2 server for 3M/Bibliotheca units |
| Drop box with overnight return log | Have | Have | `/v1/library/dropbox` |
| OPAC with faceted search in the ERP | Missing | Built | `/library/opac`: facets subject, material, language, author, decade, branch, on the shelf now (counts leave their own choice out), copies per branch, reserve, my loans |
| OPAC in the Student App: search, my loans, renew, reserve | Partial: no facets | Deepened | `catalogue_screen.dart` facet chips; widget test "narrows a search by a subject facet…" |
| OPAC in the Teacher App | Missing | Built | `features/library/library_screen.dart` (search with facets, reserve, my books with renew and fine so far, reservations); `library_test.dart` en and kn |
| New arrivals and alerts | Have | Have | `new-arrivals`, alert subscriptions |

## Acquisitions

| Item | Before | After | Evidence |
|---|---|---|---|
| Suggestion and approval within budget | Have | Have | `library-acquisitions` |
| Department budget heads | Have | Have | `library-budgets` |
| Vendors (GSTIN checked, discount, terms) | Missing: free-text vendor | Built | `library-vendors` (0203); test (bad GSTIN 400, duplicate 409) |
| Purchase order with lines and PDF | Missing | Built | `library-purchase-orders`, `addToOrder`, `send`, `refresh`, `GET …/pdf`; row menu **Download the order (PDF)** |
| Receipt into the accession register | Have | Have | `receive` |
| Vendor invoice against the order, shared over the lines, passed by another person, paid with UTR | Partial: one amount per request | Built | `library-invoices` (`allocate`), `pass` (maker-checker), `paid`; test: ₹900 gross − ₹90 = ₹810, budget spent ₹810, librarian refused, paid invoice not deletable |

## Serials, e-resources, housekeeping

| Item | Before | After | Evidence |
|---|---|---|---|
| Subscriptions, expected issues, check-in | Have | Have | `library-periodicals`, `library-issues` |
| Missing-issue claims (repeat claims counted) | Partial: one claim | Deepened | `claim_count` (0203); test claims twice |
| E-resources with seats and access log | Have | Have | `library-eresources` |
| DELNET, N-LIST, e-ShodhSindhu (provider, access, cost, remote login) | Missing | Built | provider/access/cost columns (0203); seed |
| Usage statistics (COUNTER monthly, opens, cost per use) | Missing | Built | `library-eresource-usage` (import), `GET /v1/library/eresources/usage`; test cost per use ₹20,000 / 26 |
| Inter-library loan register | Have | Have | `library-ill` |
| Institutional repository | Have | Have | `library-repository` |
| Stock verification (campus-ops) | Partial: summary by title only | Deepened | copy-level scan and close (`library_stock_check_copies`, 0202), body default; `campus-ops-depth.e2e` |
| Weeding | Missing | Built | `GET /v1/library/weeding` (not issued for N years, damaged, superseded edition); reports page; test |
| Binding | Missing | Built | `library-binding` batches and items (copies go to "at the binder" and back); test |
| Withdrawal register | Have | Have | copy and book withdraw with reason |

## Reports and notices

| Item | Before | After | Evidence |
|---|---|---|---|
| Accession, circulation, overdue, most borrowed, footfall reports | Have | Have | `campus-ops/catalog.ts` library reports |
| NAAC 4.2 (expenditure on books and journals/e-resources, footfall, usage %, logins) | Partial: footfall only | Built | `GET /v1/library/naac` and ops report `library.naac`; reports page; test with exact paise |
| Overdue SMS and app notices, once per step | Missing | Built | `notices.ts` (daily job, due soon, first, second, final; SMS through Communication with DLT check); test (3 first notices, rerun sends nothing, reason SMS skipped) |
| ERP fine estimate on the library home | Broken: flat ₹2 a day | Built | uses the API's open-day fine so far |

## Hardening

- Every new endpoint carries `@Auth` with the library roles (NAAC also the quality officer; invoice pass and pay
  their own roles); tests refuse a teacher, a student and another institution (records 404/0 rows, fines-to-fees 404,
  NAAC zeros).
- Bodies and queries are Zod-checked (label filters, months, ISBN, GSTIN, MARC tags); money is integer paise; dates
  are the institution's day (IST); fines-to-fees and notices are idempotent; list pages are paginated server-side;
  the ERP calls only whitelisted paths (`lib/library-pass.ts`, unit-tested).
- Audit on every write (`library_po.*`, `library_invoice.*`, `library_binding.*`, notices, labels printed).

## Not done

- Live copy cataloguing needs an SRU server reachable from the deployment (`LIBRARY_SRU_TARGETS`); tests use a MARC
  record directly.
- RFID hardware (gates, sorters) is reached through SIP2; tag encoding itself is done by the vendor's encoder from the
  CSV list.
