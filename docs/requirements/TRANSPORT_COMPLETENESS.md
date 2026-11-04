# Transport: completeness against Linways, Camu, school-bus systems and the checklist (section 12)

Audit of `docs/research/MODULE_DEPTH_CHECKLIST.md` section 12, `TRANSPORT_DETAILED_SPEC.md`, the transport pass brief,
and the rules that apply to school and college buses in India: the Supreme Court's school-bus guidelines (M.C. Mehta v.
Union of India, 1997, adopted by the states and in CBSE's transport circulars: yellow paint and "School bus" written
front and back, horizontal window grills, a fire extinguisher, a first-aid box, the school's name and phone, reliable
door locks, a speed governor at 40 km/h, a woman attendant, a driver with at least five years of a heavy-vehicle
licence), GPS and CCTV on school buses (state transport rules and the Motor Vehicles (Amendment) Act 2019 tracking
requirement for public-service vehicles), and the papers a transport vehicle carries (fitness certificate, insurance,
permit, pollution certificate, road tax). Peers checked: Linways (Transport module), Camu (transport with GPS and
parent app), and dedicated school-bus systems (route planning, RFID boarding, parent ETA and not-boarded alerts, SOS).

Checked in code and against the Soundarya seed: API calls on a seeded database (port 4340, probe in the pass notes), the
ERP (port 3340) driven by Playwright at 1280px and 390px as the transport manager and the principal
(`apps/erp/scripts/transport-qa.mjs`: 35 pages × 2 widths, every page loads with no error state, no sideways scroll
and no console errors), and widget tests in the Parent, Student and Teacher apps.

**Before** is commit `5b13f65` (the branch when this pass started). Status words: **Done** (built and tested before),
**Built** (missing before, built now), **Deepened** (partial before, gaps closed now), **Fixed** (broken before).
Migrations: `0206_transport_fares_safety`, `0207_transport_boarding_trips`.

## Routes, stops and fares

| Item | Before | After | Evidence |
| --- | --- | --- | --- |
| Routes, stops in running order with pick-up and drop times, landmark, coordinates | Done | Done | `transport.records.ts` routes and stops (reorder, import); e2e `transport-depth` "keeps vehicles…" |
| Stop-wise fees (a stop's own, else the route's) | Done | Done | `transport-stops.fee`; e2e `transport-depth` |
| Distance-based fare slabs, a stop's fee from its distance | Missing | Built | 0206 `transport_fare_slabs`, `transport_stops.distance_km`; list Routes → Fare slabs (overlaps refused); `POST fare-slabs/apply` with a dry run; ERP Safety and capacity → Fares by distance; unit `slabFee`, `overlappingSlabs`; e2e `transport-pass` "prices stops by distance…" |
| Vehicle master with papers (insurance, fitness, PUC, permit, road tax, tracker) | Done | Done | `transport-vehicles` |
| Driver, conductor and attendant master | Partial (no attendant role, no crew on a route) | Deepened | role `attendant`; 0206 `transport_routes.conductor_id`, `attendant_id`; routes list shows them; `GET /me` gives each crew member their role |
| Document expiry alerts: FC, insurance, permit, PUC, road tax, licence (and medical, safety check) | Partial (a list and a calendar, nobody told) | Deepened | daily job `transport.expiry-reminders` and `POST expiry-reminders/run`: reminder days in settings (30, 15, 7, 1, 0, weekly when overdue), once each; medical fitness and safety-check due added; e2e "reminds the office…" |

## Students' seats and the fee

| Item | Before | After | Evidence |
| --- | --- | --- | --- |
| Student and staff seat at a stop with the vehicle's seats enforced | Done | Done | `transport-riders`; e2e `transport-depth` |
| Transport fee on the student ledger through the fees module (staff through payroll) | Done | Done | `POST fees/month` → `FeesService.chargeStudents`, `payroll_adjustments` |
| Mid-year move, pro rata | Broken (a move before the month's run charged the difference and the run then charged both seats pro rata: the difference twice) | Fixed | `moveRider` charges only months already billed (`moveDelta`); unit "billed old seat plus the move's delta equals both seats pro rata"; e2e `transport-depth` "…runs the month" (figures checked by hand) |
| Cancellation of a seat with the days given up credited | Missing (the seat ended, the billed month stayed) | Built | `TransportPassService.endSeat`: credit off unpaid transport fees (`reduceCharge`, kind withdrawal), the rest a refund due; ledger 0207 `transport_fee_adjustments`, list Riders → Fee changes (accountant can read); family notice; e2e "credits a cancelled seat…" (unpaid and paid cases, `cancelCredit` figures) |
| Families' change requests and the routes to choose from | Done | Done | `change-requests/mine`, approval in the list |

## Live tracking

| Item | Before | After | Evidence |
| --- | --- | --- | --- |
| GPS vendor webhook (per-source token, matched by registration or tracker id, substitute vehicles) | Done | Deepened | fix time read (ISO or epoch); a late or repeated fix is `stale` and changes nothing; fixes applied in the order taken; a trip that ended mid-batch no longer fails the batch; unit `gps-adapter.spec`; e2e "skips a GPS vendor fix older than the last one" |
| Flaky transport GPS test (`campus-ops` "runs a trip…") | Broken (counted every institution's transport notices in the shared test database, so it failed when another file ran first; the socket wait had no timeout) | Fixed | count scoped to the tenant; 5-second timeout on the live event |
| Duty test and "today" filters on lists | Broken (lists compared with the database server's date, so from 18:30 to 24:00 UTC "today" was yesterday in India; `transport-depth` failed at night) | Fixed | `IST` date in `transport.records.ts` filters; e2e passes at 04:30 IST |
| Live map in the ERP with ETA, lateness, on board, alerts, SOS | Missing | Built | `GET /v1/transport/live`; ERP `/transport/live` (OpenStreetMap tiles, routes and stops, buses coloured by state, refreshes every 15 s); unit `transport-pass.test.ts`; screenshots 01, 08 |
| Live map in the Parent app with ETA | Done | Deepened | lateness under the ETA (`lateMinutes` on the live event) |
| Arrival notice at the next stop | Done | Done | `transportArrival` within 500 m |
| Delay notice | Missing | Built | `TransportPassService.delay`: expected arrival past the stop's time by the threshold (settings, 10 min), once a run, to families still waiting and the office; unit `lateMinutes`; e2e "…delay notice…" |
| Boarding and alighting by RFID | Partial (a tap logged boarding only, not tied to a trip) | Deepened | 0207 `transport_boardings.trip_id/stop_id/kind/method`; a reader on a bus with a running trip: first tap on, next off (`devices.controller.ts`); integrations e2e still green |
| Boarding by the bus pass QR and by the conductor | Missing | Built | `POST trips/:id/boardings` (manual or `KXBUS:` code; once per trip and direction), `GET trips/:id/manifest`; Teacher app crew mode with camera scan; widget test "marks students on and off…" |
| Parent alert when the child did not board | Missing | Built | `notBoarded` when the bus reaches the next stop or ends (only when the crew marks that run); e2e "B's family hears once the bus moves on" |
| Child left on a drop run (marked on, never off) | Missing | Built | `leftOnBoard` at the end of a drop run → office and driver; e2e "flags a child never marked off…" |

## Fleet operations

| Item | Before | After | Evidence |
| --- | --- | --- | --- |
| Trip sheet: vehicle, odometer out and in, distance | Partial (trip log without vehicle or odometer) | Partial | 0207 `transport_trips.vehicle_id/start_odometer_km/end_odometer_km`; start and end take the odometer (never backwards); trips list and report `transport.trip-sheet`; e2e "…trip sheet". The Teacher app does not ask the driver for the odometer yet (API ready) |
| Fuel log and mileage (cost per km, km per litre) | Done | Done | `expenses/summary`; e2e `campus-ops2` |
| Maintenance schedule (overdue, done with cost into expenses) | Done | Done | `transport-maintenance` |
| Breakdown and incident register with the insurance claim | Done | Done | `transport-incidents` (file, settle, reject claim) |
| SOS from the bus | Missing | Built | `POST trips/:id/sos`: high-severity incident kind `sos`, trip event with position, office alert with a map link, event `transport.sos_raised`; repeat within two minutes is the same SOS; Teacher app button with a confirm; e2e "…raises an SOS" |
| Substitute vehicle and driver, spare driver pool, duty sheet | Done | Done | `transport-overrides`, `transport-duty` |
| Route optimisation: capacity against occupancy | Partial (seats left on the route list) | Built | `GET optimisation` with `routeSuggestions` (move riders to a nearby route, swap vehicles, merge an under-used route, smaller or bigger idle vehicle, unused stops); ERP Capacity and occupancy; unit test; e2e "suggests…" |
| Over-speed and route-deviation alerts | Done | Done | `transport-alerts` |

## Safety and compliance

| Item | Before | After | Evidence |
| --- | --- | --- | --- |
| School-bus safety checklist (speed governor, GPS, CCTV, woman attendant…) | Missing | Built | 0206 `transport_safety_checks` (13 items, next check from settings), list Fleet → Safety checks (kept, not deleted); `GET safety` matrix adds papers, tracker, woman attendant, conductor, driver licence, five years held, police verification, medical fitness; ERP School-bus safety; e2e "keeps the safety matrix…" |
| Driver verification records | Partial (police verified date, badge) | Deepened | 0206 gender, date of birth, licence class and held since, police verification reference, medical fitness until, training, note; Verification filter; e2e `verified: true, licenceYears: 6` |
| Bus pass with QR and photo | Done | Done | `passes/:id.pdf` |
| Temporary route change with a family notice | Done | Done | `transport-overrides` notify |
| Drop-off hand-over by one-time code or photo | Done | Done | `handovers/*` |

## Reports

| Item | Before | After | Evidence |
| --- | --- | --- | --- |
| Occupancy | Missing | Built | `transport.occupancy`; e2e figures (40 seats, 3 riders, 8%) |
| Route-wise collection (billed, collected, outstanding) | Missing | Built | `transport.collection`; e2e billed total after credits |
| Defaulters | Partial (fee dues, no ageing) | Deepened | `transport.defaulters` per student with the oldest due, days overdue and ageing band; seed: 11 defaulters |
| Stop-wise and route-wise lists, expiry calendar | Done | Done | `transport.stop-list`, `transport.expiry-calendar` |
| Trip sheet and boarding log | Missing | Built | `transport.trip-sheet`, `transport.boardings` |

## Apps

| Item | Before | After | Evidence |
| --- | --- | --- | --- |
| Parent app: bus location and stop | Done | Done | `bus_screen.dart` |
| Parent app: bus pass, transport fee, today's boarding, crew to call, lateness | Missing | Built | `BusDetails`, pass PDF, call button; widget tests "pass, fee, crew and today" (en and kn) |
| Student app: bus location, stop, pass | Done | Done | `campus/bus_screen.dart` |
| Student app: fee, today's boarding, crew, lateness | Missing | Built | widget test "shows lateness, today on the bus…" |
| Teacher app crew mode: manifest, mark on and off, scan pass, SOS; conductor and attendant | Missing | Built | `manifest_screen.dart`; widget tests "marks students…", "a conductor opens…" |

## Hardening and seed

| Item | Before | After | Evidence |
| --- | --- | --- | --- |
| Role and institution checks on every new endpoint | — | Built | `@Auth` on all; crew limited to their own routes' trips (`crewTrip`); e2e "keeps the office's screens…" (teacher and parent refused; another institution sees nothing, 404 on the manifest and fee changes); `docs/security/AUTHZ_MATRIX.md` regenerated (no new flags) |
| Money in integer paise; dates in IST | Partial (list "today" in server time) | Fixed | see the duty item; credits and charges computed in paise (`cancelCredit`, `moveDelta`) |
| Idempotency | Done | Deepened | boarding unique per trip, student and direction; adjustments once per seat, month and kind; reminders, delay, not-boarded, SOS by dedupe key; stale GPS fixes |
| Seeded trips readable | Broken (seed wrote `completed` and `arrived`, the code reads `ended` and `stop_reached`, so trip lists and the log were empty of them) | Fixed | seed fixed; 0207 rewrites existing rows |
| Demo data on every transport list and report | Missing (duty, pick-up persons, hand-overs, changes, requests, maintenance, alerts empty) | Built | `db/soundarya/transport-pass.ts`: slabs, crew and verification, 4 safety checks, 41 trips with odometers, 1,187 boarding marks, a late bus this morning, a resolved SOS, two months of fees (11 defaulters), a cancelled seat credited, and the lists above |

**Count** (50 items). Before: 21 Done, 8 Partial, 16 Missing, 4 Broken, and 1 new (role tests for the new endpoints).
After: 49 complete (18 Done, 18 Built, 8 Deepened, 5 Fixed) and 1 Partial (the trip sheet's odometer is not asked for
in the Teacher app).

## Not done

- The Teacher app does not ask the driver for the odometer at the start and end of a run (the API and the trip sheet
  take it).
- ETA is straight-line distance at the current speed, not road routing.
- Map tiles come from OpenStreetMap; in the sandbox they do not load, so the screenshots show the routes on a plain
  background.
- `apps/parent/test/boarding_test.dart` ("…shows the canteen menu") fails in the hostel boarding screen; this pass did
  not touch that screen or its data.
