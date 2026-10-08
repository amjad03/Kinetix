# Campus operations: transport, hostel, canteen, inventory, assets

API in `services/api/src/{transport,hostel,inventory}`, tables in migrations 0060 (schema) and 0061 (row-level security); roles added in 0059.
Every write is tenant-scoped (RLS), role-checked, validated with zod and audited (`audit_log`). Amounts are integer paise. Fees for transport, hostel and mess are charged as ordinary fee invoices through `FeesService.chargeStudents` (once per title and student, so reruns are safe), so families pay and get receipts in the existing fees flow.

## Roles
`transport_manager`, `driver`, `hostel_warden`, `canteen_manager`, `store_keeper` (plus `tenant_admin` and `principal`, who can do everything and are the approvers). A driver gets the `driver` role when a driver record is created with a `userId`; it opens driver mode in the Teacher App.

## Transport (`/v1/transport`)
- Masters: vehicles (registration, capacity, insurance/fitness/PUC expiry), drivers and conductors, routes (vehicle, driver, monthly fee), ordered stops with coordinates and pickup time. `GET compliance` lists papers and licences expiring within 30 days.
- Seats: `POST assignments` (one active seat per student, capacity enforced, moving replaces the old seat), `POST fees` charges the route fee.
- Trips: the driver starts a trip (`pickup` or `drop`; drop visits stops in reverse) and posts `{lat,lng,speedKmh}` to `POST trips/:id/position`. The server marks stops reached (within 120 m), tells the families riding from the next stop once when the bus is within 500 m (notification kind `transport`), and emits `transport.position` (`TransportPositionEvent` in `@kinetix/shared`, with next stop and ETA) over the realtime gateway to the route's guardians, students and transport staff only. `GET trips/:id` is the trip log (started, approaching, stop_reached, ended).
- Families: `GET students/:id` returns the seat, stops, and the bus position and ETA (the Parent App draws it on an OpenStreetMap map).
- ETA is straight-line distance over current speed (20 km/h when stopped); it is an estimate, not road routing.

## Hostel (`/v1/hostel`) and canteen (`/v1/canteen`)
- Blocks, rooms (bed count creates beds), allotment and vacate (one bed per student and per bed; vacating is blocked while the student is out on a pass and cancels unused passes).
- Gate pass: issued for a resident, `out` then `in` at the gate; each gate event notifies the student's guardians (kind `hostel`). Overdue passes are flagged in the list.
- Visitors book, mess plans and subscriptions, weekly menu (readable by everyone), complaints (families raise for their own child; the warden resolves with a note).
- Canteen: items, a prepaid wallet per student (counter top-up and orders, idempotent by key, never overdrawn).

## Inventory, procurement and assets (`/v1/inventory`, `/v1/assets`)
- Stock is a per-store balance plus a ledger row for every change (in, out with reason, issue, goods receipt); it never goes negative. `GET items?low=true` lists items at or under the reorder level.
- Buying chain: requisition (any staff) → decision by an approver who is not the requester → PO from an approved requisition (lines limited to what was approved) → goods receipts (partial allowed, idempotent by key, raise stock) → vendor invoice matched to received quantity x PO price: a difference is held as `mismatch` until an approver (not the recorder) approves it; only `matched` or `approved` invoices can be marked paid.
- Assets: numbered tags `AST-0001` (QR payload `kinetix://asset/<tag>`, `GET by-tag/:tag` resolves a scan), allocation to one holder at a time, maintenance (optionally keeping the asset out of use) with next-due alerts, disposal, and depreciation: straight-line (cost minus salvage over the life) or written-down value at a fixed yearly rate, never below salvage.

## Placements, internships and alumni (`/v1/placements`)
- Companies and drives (role, CTC in lakh, minimum CGPA, maximum backlogs, eligible programmes, registration deadline, status). Drives move draft, open, closed, completed.
- Eligibility is worked out by the server from the latest published CGPA and the open backlogs (`eligibility.ts`): `not_open`, `deadline_passed`, `no_results`, `cgpa_below`, `backlogs_exceeded`, `program_not_eligible`. Registering an ineligible student answers 409 with the reasons; the apps show the same reasons.
- Rounds with per-student results, shortlisting, offers (one open offer per drive and student; the student accepts or declines, the placement cell can withdraw), `GET stats` for placement figures.
- Internships: create, mentor, status, evaluation score, and a diary the student keeps. Alumni records, alumni events with RSVPs, and mentoring requests that an alumnus accepts or declines.
- Students and guardians: `GET students/:studentId/overview` (drives with eligibility and registration, offers, internships, CGPA and backlogs). Only the student registers, withdraws or answers an offer.

## Research and projects (`/v1/research`)
- Proposals (draft, submit, withdraw), ethics review and a decision; approved proposals become projects with members, status and milestones.
- Scholars and their status, publications, conferences, patents (with status), grants with expenses that cannot pass the sanctioned amount, and `GET kpis`.

## Grievance, discipline and welfare (`/v1/grievances`, `/v1/discipline`, `/v1/welfare`, `/v1/counselling`)
- Grievances: any signed-in person raises one (a guardian may name the child); `anonymous` hides the name from staff while the raiser still sees it under `GET mine`. Tickets get a number (`GRV-0001`), a severity and an SLA due time (critical 24 h, high 48 h, medium 120 h, low 240 h). Assign, comment, status, resolve, rate (1 to 5, closes the ticket), reopen, and `escalate-overdue` (up to two levels).
- Ragging goes to the anti-ragging committee and harassment to the ICC (or POSH for a staff matter). They are never below high severity and only committee members can read them (`committee-stage`).
- Discipline: incidents, review, actions, close, and appeals decided by someone other than the reviewer. Welfare: scholarship and aid requests (review, decision, disburse, withdraw). Counselling: sessions with private notes (readable only by the counsellor), schedule, outcome, cancel.

## Not yet built
RFQ comparison, store-to-store transfers and returns, hostel waitlist and room transfer, boarding and meal attendance, fuel and incident logs, GPS-vendor adapter (the driver's phone is the tracker), online canteen top-up, reports and exports.
Placement offer letters as documents, alumni donations, research publication import (DOI lookup), grievance SMS and email notices, counselling referral to outside services.
