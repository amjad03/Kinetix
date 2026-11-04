# Transport: user guide

For the transport manager, the principal, drivers, conductors and attendants, families and students. API in
`services/api/src/transport`; the completeness audit is `docs/requirements/TRANSPORT_COMPLETENESS.md`; screenshots in
`docs/demo/screens/transport/`. Demo logins: `transport` (transport manager), `driver1` and `driver2` (drivers), with
`@soundarya.demo.zynetix.in` and the demo password.

## Who sees what

- **Transport office** (`transport_manager`, and the principal and admin): every page and list below.
- **Driver, conductor, attendant**: Teacher App → Profile → Driver mode. A transport crew record with an app login
  gives the person the `driver` role. Only the route's driver starts and ends a run; the conductor and attendant open
  the run the driver started and mark the students.
- **Families and students**: the bus in the Parent and Student apps, for their own child only.
- **Accountant**: the list of transport fee changes (credits and refunds due).

## Fleet, crew and papers

1. Transport records → Fleet: vehicles (registration, seats, fuel, own or contract, GPS tracker id, insurance,
   fitness certificate, pollution certificate, permit and road tax dates; import from Excel).
2. Drivers and conductors: licence number, class and date held since, police verification date and reference, medical
   fitness until, safety training, gender and date of birth. The **Verification** filter shows who is missing
   something (police verification, medical fitness or a licence in force).
3. Routes: vehicle, driver, conductor and the **woman attendant** the school-bus guidelines ask for.
4. Expiry reminders: every day the office is told of papers, licences, medical certificates and safety checks falling
   due on the reminder days in Transport settings (30, 15, 7, 1 and 0 days before, then weekly once overdue). Safety
   and capacity → **Send today's expiry reminders** sends them now; each goes once.

## Safety checklist (Supreme Court and state school-bus guidelines)

- Transport records → Fleet → **Safety checks**: one inspection per vehicle with the 13 checklist items (speed
  governor, GPS tracker, CCTV, first-aid box, fire extinguisher, emergency exit, window grills, door locks, yellow
  paint, "School bus" sign, school name and phone, seat belts, panic button). The next check falls due after the
  interval in settings (90 days). Checks are kept; correct one by adding a new check.
- **Safety and capacity → School-bus safety**: each vehicle with its gaps, from the latest checklist and from the
  records (papers in force, a GPS tracker, a woman attendant and a conductor on its route, the driver's licence, five
  years with it, police verification and medical fitness). Export to Excel for an inspection.

## Routes, stops and fares

- Stops in running order (drag to reorder within a route), with pick-up and drop times, landmark, coordinates and the
  **distance from the campus**.
- **Fare slabs** (Routes → Fare slabs): distance bands with a monthly fee (a stop over `from` and up to `to`
  kilometres). Bands may not overlap. A new stop with a distance and no fee takes its band's fee; Safety and capacity
  → **Fares by distance** previews every stop whose fee differs from its band and fills them in one step (each change
  is in the stop's history). A stop's fee empty means the route's fee.

## Students' seats and the transport fee

1. Riders: seat a student (or member of staff) at a stop; the vehicle's seats are enforced. Families ask for a new stop
   from their app; the office approves under Change requests.
2. Transport desk → **Charge the month's transport fee**: every rider is charged the month on the student fee ledger
   (pro rata for anyone who joined, left or moved during the month); staff get a payroll recovery. Rerunning skips
   those already charged.
3. **Moving** a student (Riders → Move to stop, or an approved change request): if the month was already charged, the
   difference for the rest of the month is charged or credited now; if not, the month's run charges both seats pro
   rata. **Ending a seat** (Riders → End the seat, with a reason) in a charged month credits the days given up: off the
   unpaid transport fee, and what was already paid is a refund due. Both are kept under Riders → **Fee changes**, and
   the family is told.

## On the bus

- The driver starts the run (pick-up or drop) in the Teacher App; the phone (or the bus's tracker through the GPS
  vendor webhook) reports the position. Families at the next stop are told when the bus is close.
- **Late bus**: when the bus will reach the next stop later than its time by the delay threshold in settings (10
  minutes), the families still waiting and the office are told once a run.
- **Getting on and off**: the conductor marks each student on the trip's list, or scans the QR on the bus pass; an RFID
  reader on the bus does the same (first tap on, next tap off). The family is told (Transport settings → boarding
  notices).
- **Not boarded**: on a pick-up run where the crew is marking, a student not marked by the time the bus reaches the next
  stop is reported to the family and the office.
- **Left on board**: when a drop run ends with a student marked on and never off, the office and the driver are alerted.
- **SOS**: the driver's screen has an SOS button; the office gets an alert with the bus's position and a map link, and
  an SOS incident is opened.
- Over-speed and route deviation alerts are under Operations → GPS alerts.

## Live map

Transport → **Live map**: every bus on the road on an OpenStreetMap map with its route and stops (reached stops
filled), and a table with the next stop and minutes to it, lateness, stops reached, students on board out of riders,
speed, the last position and the state (SOS, no position for five minutes, late, needs a look, on time). It refreshes
every 15 seconds.

## Capacity and occupancy

Safety and capacity → **Capacity and occupancy**: seats, riders and occupancy per route, and suggestions: an over-full
route is told which nearby route has seats or which idle vehicle is big enough; an under-used route (below 40%) which
nearby route can take its riders or which smaller idle vehicle would do; an over-full and an under-used route whose
vehicles fit each other's riders are told to swap; and the stops nobody uses.

## Reports (Reports → Transport)

Route occupancy, route-wise fee collection (billed, collected, outstanding), transport fee defaulters with ageing
(0–30, 31–60, 61–90, 90+ days), the trip sheet (vehicle, driver, out and in times, odometer, distance, stops, boarded,
alerts), the boarding log, stop-wise riders, the expiry calendar, fee dues, maintenance, incidents, GPS alerts, fuel and
expenses. Each opens with date filters and exports to Excel or PDF.

## Apps

- **Parent app** → the child's bus: live map and minutes to the stop, lateness, today's getting on and off, the driver
  and attendant (tap to call), pick-up and drop times, the bus pass (open the PDF, valid until), the transport fee due,
  and the one-time code for the hand-over at the stop.
- **Student app** → Bus: the same view (without calling), the bus pass and asking for a new stop.
- **Teacher app** → Driver mode: start and end the run, the next stops, the students' list to mark on and off (by hand
  or the bus pass QR), and SOS. A conductor or attendant sees the run their driver started.
