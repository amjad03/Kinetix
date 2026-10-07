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

## Not yet built
RFQ comparison, store-to-store transfers and returns, hostel waitlist and room transfer, boarding and meal attendance, fuel and incident logs, GPS-vendor adapter (the driver's phone is the tracker), online canteen top-up, reports and exports.
