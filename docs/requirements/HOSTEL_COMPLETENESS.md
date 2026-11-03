# Hostel and mess: completeness against Linways, Camu and the checklist (section 11 and the hostel brief)

Audit of `docs/research/MODULE_DEPTH_CHECKLIST.md` section 11, `HOSTEL_CANTEEN_DETAILED_SPEC.md`, the hostel pass brief
and Indian rules that apply to hostels (UGC Regulations on Curbing the Menace of Ragging, 2009 and amendments: committee,
squad, yearly undertakings by student and parent, the national helpline 1800-180-5522; AISHE DCF-II hostel table; NAAC
criteria 4.1 and 5.1). Checked in code and against the Soundarya seed: API calls on a seeded database (port 4340), the
ERP (port 3340) driven by Playwright at 1280px and 390px as the chief warden, a block-scoped warden, the accountant and
the IQAC (`apps/erp/scripts/hostel-qa.mjs`: 26 pages × 2 widths, every page loads with no error state, no sideways
scroll and no console errors), and the Student and Parent apps' widget tests.

**Before** is commit `768c795` (the branch when this pass started). Status words: **Done** (built and tested before),
**Built** (missing before, built now), **Deepened** (partial before, gaps closed now), **Fixed** (broken before).
Migrations: `0204_hostel_gate_safety`, `0205_hostel_mess_diet`.

## Rooms, beds and allotment

| Item | Before | After | Evidence |
| --- | --- | --- | --- |
| Hostels, blocks, floors, rooms, beds, room types with fees | Done | Done | `hostel.records.ts` (hostels, blocks, room types, rooms); e2e `hostel-depth` "builds hostels…" |
| Room amenities (Wi-Fi, geyser, attached bath…) on type and room, filter by amenity | Missing | Built | 0204 `amenities` arrays; `rooms` filter `amenity`; e2e "lists amenities…" |
| Boys' and girls' hostels, gender rule on allotment | Done | Done | `hostel-rules.ts` gender match; unit test "matches gender rules" |
| Allotment by distance, merit and seniority (weights in settings) | Done | Done | `allotment.ts`; unit "ranks by distance, merit and seniority" |
| Allotment by reserved category (SC/ST/OBC/EWS/PwD points) | Missing | Built | setting `allotCategoryPoints`, application `category`; e2e "adds reserved-category points…" |
| Waitlist, bed hold (internship, reservation) | Done | Done | `hostel-bed-holds`; e2e "takes deposits, holds a bed…" |
| Room change and vacate requests with warden approval | Done | Done | `hostel-requests`; Student app request sheet |
| Wardens limited to their blocks | Missing | Built | `hostel-scope.ts` on every list, the gate, reports; seed login `warden.girls` sees Sharada Block only (20 of 40 residents); e2e "limits a warden assigned to a block…" |
| Warden and resident tutor assignment, night duty roster | Done | Done | `hostel-staff`, `hostel-duties`, desk "Plan a duty roster" |

## Fees

| Item | Before | After | Evidence |
| --- | --- | --- | --- |
| Hostel fee and mess fee on the student ledger | Done | Done | `FeesService.chargeStudents`; desk "Charge mess bills to fees" |
| Caution deposit, refund on vacate net of damages, mid-month pro-rata | Done | Done | unit "settles a mid-month vacate"; e2e `hostel-depth` |
| Vacate settlement posted to the fee ledger (credit or charge), paid out | Missing | Built | settlement action `post` → `student_credits` or invoice; e2e "posts the vacate settlement…" |
| Damage to room assets charged to the student or shared by the room | Missing | Built | room asset action `chargeDamage` (odd paise to the last); e2e "charges damage…" |
| Hostel and mess fee defaulters with ageing (0-30, 31-60, 61-90, 90+) | Partial (a fee-dues list, no ageing) | Built | `GET /v1/hostel/reports/defaulters` (paged); ERP Hostel reports → Fee defaulters; seed: 16 defaulters, ₹3,05,740 |

## Mess

| Item | Before | After | Evidence |
| --- | --- | --- | --- |
| Menu by day and meal | Done | Done | `mess/menu`; now also in the Student app (today first) |
| Plans fixed or per day, leave rebates | Done | Done | unit "bills the mess with rebates…" |
| Diet system bill (month's spending ÷ diets eaten + establishment charge) | Missing | Built | 0205 `mess_expenses`, bill columns `diets`, `diet_rate_paise`, `establishment_paise`; unit and e2e "bills the mess on the diet system" (figures worked by hand in the test) |
| Mess spending from kitchen purchases (stock log), once each | Missing | Built | `POST mess/expenses/import-stock`; desk "Bring in kitchen purchases" |
| Meal attendance / coupons | Done | Done | `canteen/meal-attendance` |
| Mess committee and its inspections (quality, quantity, hygiene) | Partial (free-text feedback only) | Built | `hostel-committees` (purpose `mess`), `mess-inspections` with "close with the action taken"; student members can inspect; e2e "keeps the anti-ragging and mess committees…" |
| Kitchen stock and consumption | Done | Done | `canteen/ops/stock` |

## Out-pass and gate

| Item | Before | After | Evidence |
| --- | --- | --- | --- |
| Out-pass: parent approval in the Parent app, then the warden | Done | Done | `parent-approve`; e2e `hostel-depth` "needs the family's approval…"; Parent app approval card |
| QR gate log (resident's QR, scan out and in, hand entry with reason) | Missing | Built | 0204 `hostel_gate_logs`, `gate_token`; `GET students/:id/gate-qr`, `POST gate/scan`, `gate/manual`; ERP Hostel gate page; Student app Gate QR |
| After curfew going out needs an approved pass | Missing | Built | `gateEvent`; e2e "runs the gate on QR codes…" |
| Late entry alerts to parents, escalation after N in a window | Partial (escalation only) | Deepened | push in en/hi/kn on each late return (`lateEntryAlertParents`); e2e as above |
| Who is out now, overdue | Partial (passes only, not local outings) | Built | `GET gate/out-now`; ERP gate page |
| Night roll call with absent alert | Done | Done | `night-attendance` |
| Parent app in/out history | Missing | Built | `gateLog`/`outNow` in `GET students/:id`; Parent app "In and out of the hostel" card; widget test |

## Other records

| Item | Before | After | Evidence |
| --- | --- | --- | --- |
| Visitor log | Done | Done | `hostel-visitors` |
| Complaints and maintenance work orders | Done | Done | `complaints`, `work-orders`; now raised from the Student app |
| Room asset register linked to inventory | Done | Done | `hostel-room-assets` (`asset_id`, `inv_item_id`) |
| Discipline incidents and fines through fees | Done | Done | `hostel-incidents` |
| Anti-ragging committee and squad, in date, members, meetings | Missing | Built | `hostel_committees` over the institution's committees; compliance view |
| Anti-ragging undertakings per resident for the year (can block allotment) | Partial (stored, not checked) | Built | residents filter `undertaking`; setting `allotNeedsUndertaking`; compliance 90% in the seed |
| Medical emergency: severity, hospital, escort, outcome; family and every warden told at once | Partial (sick bay with a family note) | Built | sick bay `severity`, action `hospital`; e2e "records a medical emergency…" |
| Safety helplines shown to residents | Missing | Built | `GET /v1/hostel/safety`; Student app safety card with tap to call |

## Apps

| Item | Before | After | Evidence |
| --- | --- | --- | --- |
| Student app: out-pass, mess leave, room change, bills | Done | Done | `self_service_test.dart` |
| Student app: gate QR, complaints, mess menu, helplines | Missing | Built | `hostel_life_screens.dart`; `test/hostel_life_test.dart` (5 tests, English and Kannada at 360 px) |
| Parent app: approve out-pass | Done | Done | `out_pass_approvals_screen.dart` |
| Parent app: in/out history | Missing | Built | `boarding_screen.dart` `_GateCard`; `family_care_test.dart` (2 new) |

## Reports

| Item | Before | After | Evidence |
| --- | --- | --- | --- |
| Occupancy by hostel, block and type; vacancy | Done | Done | desk; `hostel.occupancy`, `hostel.vacancy` |
| Defaulters | Partial | Built | see Fees; also `hostel.defaulters` in Reports |
| Gate log register | Missing | Built | `hostel.gate-log` report and the gate log list |
| AISHE DCF-II hostel table and NAAC hostel figures by academic year | Missing | Built | `GET reports/aishe`; ERP Hostel reports → AISHE and NAAC; open to the IQAC and the accountant. Gender falls back to the block's (a boys' block is male) when no application says it |
| Compliance view (UGC anti-ragging, mess committee) | Missing | Built | `GET compliance`; ERP Hostel reports → Compliance |

## Hardening

| Item | Before | After | Evidence |
| --- | --- | --- | --- |
| Role checks and another institution refused | Done on old endpoints | Done on all | e2e: teacher 403 on reports, outsider institution sees nothing; block scope on every hostel list |
| Input checks on bodies and queries | Partial | Deepened | e2e "checks inputs on the old lists too" (status, ids, dates, months, years) |
| Money in integer paise, dates in IST | Partial (UTC "today" in places) | Fixed | `LOCAL_TODAY` / `localParts` in scope, committees, reports |
| Lists paged on the server | Done | Done | record kit; defaulters paged |
| ERP strings in en, hi, kn | Partial (new lists unworded) | Built | `i18n/messages/hostel-pass.ts` (314 keys); i18n test |
| Demo data on every screen | Partial (no hostels, staff, applications, deposits, bills) | Built | seed stage `soundarya/hostel-pass.ts` |

## Counts

51 items. Before: 23 Done, 11 Partial, 17 Missing. After: 23 Done, 25 Built, 2 Deepened, 1 Fixed; nothing Partial or
Missing.

## Not done, and why

- The welfare e2e (`welfare.e2e.spec.ts`) has 3 failures on dates in the discipline appeal window, counselling
  scheduling and welfare disbursement. They are in the welfare module, not the hostel, so they were left as they are.
- `depth-campus.e2e.spec.ts` fails 2 library tests (reservations, accession labels): library code, left to the library pass.
- Biometric or RFID gate hardware is not integrated; the gate takes the QR from any scanner that types into the page.
