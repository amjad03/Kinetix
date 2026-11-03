# Admissions and enquiry CRM: completeness (checklist section 1 and the owner's list)

Audit of `docs/research/MODULE_DEPTH_CHECKLIST.md` section 1, `ADMISSIONS_CRM_DETAILED_SPEC.md` and the owner's list in the
admissions brief (benchmark: Linways AdmissionWays, Camu, NoPaperForms; Karnataka practice: KEA counselling, COMEDK, the state
universities' and VTU's admission rules, AICTE supernumerary seats), exercised against the Soundarya seed (API calls, the
admissions pages in Playwright at 1280px and 390px). **Before** is the branch at `fe41b43`; **after** is now. User guide:
[admissions-lifecycle.md](../architecture/admissions-lifecycle.md). Screenshots: [docs/demo/screens/admissions/](../demo/screens/admissions/).

Status words: **Have** (built and tested before), **Built** (missing, partial or broken before, built now), **Deepened**
(existed; gaps closed now), **Partial** (what is still missing is said).

Migrations: **0196** (seat type, horizontal and supernumerary rows in the seat matrix; allotment seat type; applicant entrance
test, claims, seat held, outside-allotment reference; seat conversions; programme approvals and branch codes), **0197**
(admission checklist; provisional admission; credential issues; broadcasts and their sends; enquiry opt-out; application
payments' gateway account, checkout and status checks). Journal idx 181-182.

New tests: `services/api/test/admissions-pass.e2e.spec.ts` (8 workflows, figures worked by hand in its comments) and
`services/api/src/admissions/pass/pass.spec.ts` (18 unit tests: seat splits, the 60-seat Karnataka matrix, allotment with GM
first, seat types, supernumerary, horizontal displacement, float upgrade, de-reservation, entrance presets, profile eligibility,
USN series, checklist rules).

## Summary

| | Items | Have before | Partial/missing/broken before | Done after | Partial after |
|---|---|---|---|---|---|
| Checklist section 1 | 27 | 19 | 8 | 26 | 1 |
| Owner's list | 23 | 7 | 16 | 23 | 0 |
| Hardening findings | 6 | 0 | 6 | 6 | 0 |

## Checklist section 1

| Item | Before | After | Evidence |
|---|---|---|---|
| Enquiry capture (web, walk-in, phone, WhatsApp, fairs, Meta/Google lead ads) with source and UTM | Have | Have | `enquiries.service.ts`, `depth/leads.service.ts`; `admissions-depth.e2e` lead connectors |
| Landing page per programme | Have | Have | `admissions-ext.controller.ts` landing; `admissions-ext.e2e` |
| Lead stages with lost reason | Have | Have | `ENQUIRY_STAGE_MOVES`; `admissions.e2e` pipeline |
| Counsellor assignment rules, follow-up queue | Have | Have | `desk/assignment.ts`; `admissions-desk.e2e` "shares new enquiries out" |
| Duplicate detection and merge | Have | Have | `desk.service.ts` merge; `admissions-desk.e2e` |
| Counsellor activity log and next-action reminders | Have | Deepened: campaign messages logged on each enquiry's trail | `pass/broadcast.service.ts` run |
| Agents, commission slabs, TDS, clawback | Have | Have | `depth/commission.ts`; `admissions-desk.e2e` clawback |
| Campaign ROI | Have | Have | `leads.service.ts` roi |
| Multi-step application with save and resume | Have | Have | drafts; `admissions-desk.e2e` |
| Application fee through the gateway, receipt, unpaid drafts | Partial: the fee used the single legacy gateway; hosted gateways got no payer or return URL; webhooks of PayU, Cashfree, Easebuzz and CCAvenue dropped application orders; no status poll | Built: through the fees adapter (account per fee account, payer and URLs, each event once, account check, amount check, status refresh on return and hourly, 72-hour give-up) | `fees/application-fees.service.ts` applyGatewayEvent, `gateway-flow.service.ts` refreshApplication; e2e "takes the application fee through the Cashfree adapter" |
| Document checklist, verification, re-upload, DigiLocker | Have except DigiLocker | **Partial**: DigiLocker fetch not built (needs the institution's DigiLocker requester registration and keys) | `admissions.e2e` documents; correction flow |
| Eligibility rules engine | Partial: the cycle's own age, minimum and allowed-choice rules | Built: presets from the university profile (VTU BE / lateral / MBA / MCA, Karnataka state universities UG and PG, RGUHS MBBS, UGC) with category relaxation, subjects, entrance test and percentile, age | `pass/eligibility-profile.ts`; e2e "checks eligibility against the university rule"; unit tests |
| Index-mark formula | Have | Deepened: KCET engineering, KCET / COMEDK / JEE rank (ascending), NEET, PGCET, KMAT presets | `depth/index-mark.ts` rankBy; e2e "ranks by an entrance test" |
| Rank list overall, category, quota | Have | Have | `depth/rank-list.ts` |
| Seat matrix programme × quota × category, reservation roster | Partial: option × category only | Built: option × seat type × category, Karnataka categories, horizontal (PwD, rural, Kannada medium, 371J…) and supernumerary (TFW, foreign, J&K) rows, presets | `pass/reservation.ts` buildSeatPlan; e2e "fills a reservation matrix"; unit "60-seat branch" |
| Allotment rounds: allot, freeze/float, upgrade, forfeit | Partial: answers did not touch the application; no de-reservation | Built: publish offers, freeze/float/slide accept, reject and forfeit decline; GM-first, horizontal make-good (Saurav Yadav 2020); SC ↔ ST then GM conversion, optional surrender to management | `depth.service.ts` publish/respond/close, `pass/seats.service.ts` dereserve |
| Entrance test, score import | Have (own test) | Deepened: import of outside results (KCET, COMEDK, NEET, JEE, PGCET, KMAT…) by application or roll number | `seats.service.ts` importEntrance |
| Interview / GD | Have | Have | `admissions-growth.e2e` |
| Admission fee, provisional letter, conversion with roll and register number | Partial: no provisional admission, no register number | Built: provisional admission on an undertaking with a letter, confirmation when the checklist completes, VTU USN (regular 001-399, lateral 400+) or awaiting UUCMS | `pass/enrolment.service.ts`; e2e "admits provisionally … USN 1SB26CS001 / 1SB26CS400" |
| Management-quota approval with declaration | Have | Have | `admissions-desk.e2e` |
| Cancellation with UGC refund slabs | Have | Have | `desk/refund.ts` |
| TC / migration custody register | Have | Deepened: a received original on the checklist goes on the register | e2e custody count 3 |
| Scholarship pre-check | Have | Have | `desk.service.ts` scholarshipCheck |
| Bulk SMS / WhatsApp / email to segments, DLT enforced | Partial: one enquiry at a time | Built: segment preview, DLT check, opt-outs, one per number, idempotency key, TRAI 9 am-9 pm, background batches | `pass/broadcast.service.ts`; e2e "broadcasts a registered template" |
| Funnel dashboard | Have | Have | `desk/funnel` |
| Edge: programme change, lateral/transfer, NRI documents, reopening | Have | Deepened: lateral USN series, transfer and lateral checklist items | `checklist.ts`; e2e lateral |
| Reports: register, category statistics, quota fill, conversion, agent statement | Have | Deepened: university approval list (CSV), intake return, AISHE block 5 | `pass/returns.service.ts`; e2e returns |

## Owner's list

| Item | Before | After | Evidence |
|---|---|---|---|
| Lead sources and UTM tracking | Have | Have | as above |
| Counsellor assignment | Have | Have | as above |
| Follow-ups | Have | Have | pipeline due list |
| Campaign SMS / WhatsApp / email | Partial | Built | broadcasts |
| Configurable form per programme | Have | Have | cycle formFields |
| Document upload with verification | Have | Have | magic-byte check, review |
| Application fee via the existing fees gateway adapter | Broken for 4 of 5 gateways | Built | Cashfree e2e (signed webhook, duplicate, status refresh, wrong token 404) |
| Eligibility from the affiliated university profile | Missing | Built | `eligibility-options` narrows presets by `resolveAffiliation` |
| Merit by weighted marks or entrance score (KCET/COMEDK/NEET/JEE/PGCET) | Partial | Built | entrance presets |
| Category and reservation matrix (GM/SC/ST/OBC/2A/2B/3A/3B, management/NRI, supernumerary) | Missing | Built | reservation matrix |
| Counselling rounds and seat matrix | Partial | Built | rounds with seat types |
| Offer and acceptance | Partial | Built | publish → offered, freeze → accepted |
| Withdrawal with fee refund rules | Have | Have | UGC slabs |
| Seats allotted by KEA / COMEDK | Missing | Built | idempotent import, counted outside in the matrix |
| Provisional admission | Missing | Built | provisional + letter + follow-up list |
| Document checklist (TC, migration, eligibility certificate) | Partial (custody only) | Built | `checklist.ts` |
| Conversion to student with roll | Have | Have | `enroll` |
| USN / register number generation | Missing | Built | `register-number.ts`, pattern check against the profile |
| Fee schedule assigned | Missing | Built | published structures matching seat type, category, batch; e2e ₹48,500 invoice |
| Parent / student app credentials issued | Partial (users created, nothing sent) | Built | DLT SMS or email, masked log, resend |
| Lateral entry and transfer admissions | Partial | Deepened | 400 series, checklist |
| Funnel analytics | Have | Have | desk funnel |
| Government and university returns (approval list, AISHE hooks) and public status page | Partial (AISHE 5.4/5.5 typed by hand; status by secret link only) | Built | approval list CSV, intake, AISHE; accreditation sources `students_pwd`, minority, foreign; `/apply/<slug>/status` |

## Hardening

| Finding | Fix | Evidence |
|---|---|---|
| New endpoints need role and tenant checks | `@Auth` with admissions roles; de-reservation and programme approvals principal/admin only; returns also exam controller and quality officer | e2e "refuses other roles and other institutions" (403 teacher, 404 other tenant) |
| Application-fee webhooks of hosted gateways were lost | adapter fall-through with account and amount checks; webhook event row no longer points at a non-fee payment | Cashfree e2e |
| Editing a cycle's rules dropped the university preset; the preset could add questions after applications arrived | preset kept on edit; refused with 409 once applications exist | eligibility e2e |
| Public status lookup | application number + date of birth, rate-limited 10 per 15 minutes per address, honeypot, first name and initials only, no phone or guardian | e2e "answers the public status page only…" |
| CSV export of the approval list | spreadsheet formula injection neutralised (`'` before `= + - @`) | `pass.controller.ts` csvCell |
| PII in logs | credential destinations stored masked; provider errors logged with ids only | `enrolment.service.ts` maskDestination |

Money is integer paise throughout (TFW limit `8_00_000_00`); dates are IST days from the tenant clock; repeated actions are
idempotent (KEA allotment reference, broadcast idempotency key, webhook event once, checklist creation on conflict). List
endpoints for broadcasts and sends are paginated on the server; the matrix, approval list and returns are single grouped queries.

## Seed (Soundarya)

Programme approvals for all five programmes; BCA 2027-28 counselling on the state-university preset (28 seats, two rounds,
claims, a float, a reject, forfeits, round 2 in draft); MBA 2027-28 on the PGCET preset with four KEA allotments, checklists,
one confirmed and one provisional admission enrolled (fees and sign-in details), one overdue provisional; three opted-out
leads and a sent open-day broadcast (26 of 30).

## Not done

- **DigiLocker fetch** of applicant documents: needs the institution's registration as a DigiLocker requester (partner
  credentials); uploads with verification cover the flow meanwhile.
- **Flutter apps**: no app screen changed. Applicants have no app login; the student and parent apps already sign in by phone
  and one-time code, which is what the issued sign-in details point to.
