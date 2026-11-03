# Library: user guide

For the librarian, the principal and IQAC, teachers and students. The ERP pages are under **Library** in the
sidebar; teachers use **Profile › Work › Library** in the Teacher App; students use **Today › Library** and the
catalogue in the Student App. Screenshots: `docs/demo/screens/library/`.

## Pages

| Page | Who | What it does |
|---|---|---|
| `/library` | library staff, principal | The day's figures: titles and copies, on the shelf, on loan, overdue (the fine so far in open days), unpaid fines. |
| `/library/desk` | library staff | Issue and return by scanning card and copies, the overnight drop box, the gate, enrolling a class, new-arrival alerts, no-dues, overdue notices now, **Which rule applies** (a member and a material), **Labels and RFID tags**, MARC import and export, ISBN lookup. |
| `/library/opac` | library staff, principal | The catalogue: search any field, title, author, subject or ISBN; narrow by subject, material, language, author, decade, branch and "on the shelf now" (counts follow the other choices); copies per branch; reserve a title that is out for yourself or a member's card; your own loans to renew. |
| `/library/kiosk` | a station signed in as the desk | Self-check: the reader taps the card, puts books on the RFID pad (or scans barcodes) and borrows them under their own rules; **Return books** needs no card. The kiosk forgets the reader after 45 seconds. `?branch=<id>` names the branch the station stands in. Hardware kiosks and gates that speak SIP2 use the SIP2 server instead (Settings › Integrations). |
| `/library/records` | library staff | Every list with the record kit (add, edit with history, bin and restore, bulk, import, export, saved views): catalogue, copies (the accession register), branches, members, categories, **circulation rules**, clearances, loans, fine waivers, gate register, acquisitions, **purchase orders**, **vendor invoices**, **vendors**, budgets, periodicals and issues, e-resources, **e-resource usage**, repository, inter-library loans and **binding**. |
| `/library/reports` | library staff, principal, IQAC | NAAC criterion 4.2 by financial year (books, journals and e-resources spending; footfall of students and teachers; readers a day; online logins; usage %), e-resource use and cost per use, copies to weed, overdue notices sent (and **Send now**), students leaving with library dues (put fines on fees, issue no-dues) and staff exits at library clearance. |
| `/library/circulation`, `/library/e-resources`, `/library/stock-checks` | library staff | Renewals, reservations, lost and damaged; e-resources and their access log; stock verification by scanning copies. |

## How the rules work

1. **Defaults** come from Module settings › Library: loan days, books at a time, fine a day, renewals, hold days,
   the unpaid fine that blocks issue, the closed weekdays (Sunday by default), whether fines skip holidays, the notice
   days (1, 7, 15) and channels (app, SMS), and whether a TC needs the library's no-dues (on).
2. A **member category** (UG, PG, book bank, teaching staff, alumni with a deposit) overrides the defaults.
3. A **circulation rule** (Library records › Members › Circulation rules) overrides both for a category and a
   material, a category alone or a material alone: loan days (0 = read in the library only), items of that material at
   a time, fine a day, grace days, a cap on one loan's fine, renewals, whether it can be reserved. The most specific
   cell wins. Check it at the desk with **Which rule applies**.
4. **Due dates** that fall on a closed day move to the next open day. **Late fines** count only open days: Sundays
   (or the weekdays set) and the academic calendar's published, institution-wide holidays are not fined. A return
   within the grace days is not fined; after that the whole late period counts, up to the cap.

## Fines, fees and no-dues

- Collect a fine at the desk (**Fine paid**), ask for a waiver (the principal approves), or put it on the student's
  fee account: one invoice per loan (**Collect the fine with fees** on a loan, **Collect fines with fees** on a
  member, or **Put fines on fees** on the reports page). It is paid with fees at the counter or online.
- A fine on the fee account counts as owed until the fee invoice is paid.
- **No-dues**: refused while books are out, fines are unpaid (at the desk or on fees) or an inter-library loan is in
  hand. A transfer certificate is held by the certificates office until the library is clear. Staff exits: the
  library clears its step from the reports page; unpaid fines go to the full and final settlement.

## Overdue notices

Every morning each loan gets the notice for the step it has reached, once: a reminder two days before the due date,
then the first, second and final notices. They go in the app to the borrower and a student's family, and by SMS when
Communication has an active `library_overdue` SMS template with its DLT id (the run says why SMS did not go).

## Acquisitions

Suggestion (teachers and students suggest from their apps or the ERP) → approve within the department's budget head →
**Put on a purchase order** (a draft order to a vendor) → **Send to the vendor** (the PDF order sheet from the row's
menu) → **Receive copies** (each copy gets the next accession number) → **Update from receipts** → record the vendor
invoice against the order (its net amount is shared over the received lines and charged to their budgets) → another
person **passes it for payment** → the principal or accounts mark it **Paid** with the cheque or UTR number.

## Serials, e-resources, housekeeping

- Periodicals: **Expect the issues** for the subscription period, **Check in** each issue, **Mark missing**, **Claim
  from the vendor** (more than once; the count is kept), renew the subscription.
- E-resources: register DELNET, N-LIST, e-ShodhSindhu, Shodhganga, NDL, SWAYAM or publisher databases with access
  (campus IP range, remote login), cost and licence dates. Readers open them from their apps (seat limits apply);
  enter or import the provider's monthly COUNTER figures under **E-resource usage**.
- Binding: make up a batch, **Add copies** by accession number, **Send to the binder**, **Received back** (the copies
  return to the shelf). Lost and damaged books close the loan with the price; **Replaced with a new copy** accessions
  the replacement. Weeding candidates are on the reports page; withdraw them from the copies list with a reason.
- Labels: spine and barcode label sheets (A4, 24 labels) and the RFID encoder's list (CSV) for an accession range or
  copies added since a day, from the desk.

## Apps

- **Student App**: Today shows books out (overdue first) and fines; the catalogue searches with subject, language and
  decade facets, reserves a title that is out, renews, and self-checks out a book by its number.
- **Teacher App** (Profile › Work › Library): the same search and facets, reserve, my books with renew and the fine so
  far, my reservations.

## Permissions

Desk, records and reports: librarian, principal, institution admin (NAAC 4.2 also for the quality officer). Passing
and paying an invoice: principal or admin (paying also accounts), never the person who recorded it. Readers see only
their own (or their child's) loans and reservations. Another institution sees nothing.
