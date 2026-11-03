# Hostel and mess: user guide

For wardens, the accountant, the IQAC, residents and families. API in `services/api/src/hostel`; the completeness audit
is `docs/requirements/HOSTEL_COMPLETENESS.md`; screenshots in `docs/demo/screens/hostel/`.

## Who sees what

- **Chief warden** (a `hostel_warden` with no current assignment, or one assigned to whole hostels), the principal and
  the admin see every hostel.
- **Block warden**: on Hostel records → Staff and duty, give the warden's assignment the blocks they look after. They
  then see and act on those blocks only (lists, the gate, out-passes, reports). Demo: `warden.girls` sees Sharada Block.
- **Accountant** and **IQAC** open Hostel reports (fee defaulters; AISHE and NAAC).

## Rooms and allotment

1. Hostel records → Buildings and rooms: hostels (boys, girls or co-ed), blocks, room types (beds a room, fee, AC,
   attached bath, amenities) and rooms (import from Excel). A room's amenities add to its type's.
2. Students apply from the Student app or the warden adds an application. Hostel settings weigh distance, merit and
   year, and give reserved categories points (`sc:20, st:20, obc:10, ews:10, pwd:25`).
3. Warden's desk → Allot beds: applications are placed by priority on a free bed that fits the gender and year rules;
   the rest go on the waiting list. With "allotment needs the anti-ragging undertaking" on, a student without this
   year's undertaking is not placed.
4. Room change and vacate requests come from residents and are approved on Hostel records → Residents → Requests.
   Vacating works out the unused fee, the deposit, damages and dues; **Post to the fee account** puts the net on the
   student's ledger (a credit to pay out, or a charge when they owe).

## The gate

- Each resident has a gate QR in the Student app (Hostel → Gate QR). At **Hostel gate**, scan it into the Code box:
  the move is out or in (the other way from the last move unless you choose). Going out uses the approved out-pass;
  without one it is a local outing, and after curfew it is refused.
- Coming in after curfew, or after the pass's time, is a late entry: the family gets a notice, and repeated late
  entries (3 in 30 days by default) are escalated to the warden.
- No phone? Add the move on Hostel records → Gate → Gate log with the reason; the same rules apply.
- Out-passes asked for by the student wait for the family's approval in the Parent app, then the warden's.
- Families see "In and out of the hostel" in the Parent app with the time of each move and late returns.

## Mess

- Plans are fixed a month, per day, or **diet system**: the month's mess spending (Hostel records → Mess → Mess
  spending, or Warden's desk → Bring in kitchen purchases) divided by all diets eaten gives the rate; each member pays
  diets × rate plus the establishment charge. Leave of at least the plan's minimum days is not billed.
- Warden's desk → Make the month's mess bills, then Charge mess bills to fees.
- The mess committee (students and staff) records inspections (quality, quantity, hygiene out of 5); the warden closes
  each with the action taken.

## Safety and welfare

- Committees: Hostel records → Welfare → Committees (anti-ragging committee and squad, mess and discipline committees),
  with members, validity and a helpline shown to residents with the national anti-ragging helpline 1800-180-5522.
- Sick bay: a **medical emergency** tells the family and every warden at once; **Taken to hospital** records the
  hospital and who went, and tells the family.
- Room assets: **Charge damage to the room** charges the named student, or shares the amount among the room.

## Reports

Hostel reports: **Compliance** (committees in date, undertakings received and verified, mess inspections),
**Fee defaulters** (as of a date, aged 0-30 to 90+ days, paged), **AISHE and NAAC** (hostels by type with capacity and
residents by gender, occupancy, staff, mess, anti-ragging, health, grievances and discipline for an academic year).
Reports also lists occupancy, vacancy, out-passes, complaints, night absentees, late entries, mess bills, defaulters and
the gate log for export.
