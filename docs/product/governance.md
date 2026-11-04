# Governance, quality and compliance

Who uses it: the principal and the management (the board view), the IQAC coordinator (quality officer), the office
(tenant admin), heads of department for committee papers, committee chairs and secretaries, every member of staff
(policies to acknowledge, minutes to sign, committee actions) and students (policies). In the ERP: **Governance** in the
sidebar (under Accreditation). In the Teacher App: Profile → Staff tools → Governance. In the Student App: Profile →
Policies. The public: `/disclosure/<institution>` on the ERP's address.

## The board view (`/governance`)

One page with the year's figures: statutory committees (missing or needing attention), meetings held against what the
norms ask by now, minutes waiting for approval, open and overdue committee actions, open and overdue grievances,
information requests (overdue, due this week, appeals), deadlines in the next 30 days, published policies and
acknowledgements, data-protection requests, incidents, academic audit findings, the latest AQAR and open DVV queries.
Each tile opens its page.

## Statutory committees (`/governance/committees`)

- **Set up the statutory committees** creates the ones every college must keep (IQAC, anti-ragging committee and
  squad, Internal Complaints Committee, Students Grievance Redressal Committee, SC/ST cell, governing body/CDC) with
  their regulation, mandate, meetings a year and quorum. Optional bodies (minority and equal-opportunity cells, academic
  council, boards of studies, finance committee) can be set up the same way or by editing a committee's profile.
- The table shows each committee's members (and women), what its composition lacks against the regulation (a woman
  presiding over the ICC and half its members women, an NGO or legal member; a student and a woman on the SGRC; outside
  members on the IQAC and anti-ragging committee; term limits), meetings held against the norm so far this year,
  minutes to approve and actions. **Action-taken report** downloads the ATR as Excel.
- A committee's page: profile and public contact (helpline, e-mail, shown on the disclosure page if public), members
  in office (staff, a student by roll number, or an outside member by name), and its meetings. **Schedule a meeting**
  takes the agenda one item a line.

## A meeting (`/governance/meetings/<id>`)

1. **Send the notice**: the members with an account are told, in their language, with the agenda.
2. After the meeting, the secretary marks attendance (quorum is shown), writes the proceedings and each item's
   discussion, resolution and outcome, and adds the action items with owners and due dates.
3. **Circulate for approval** fixes the text (a SHA-256 fingerprint of the minutes, agenda and attendance) and sends it
   to the members who were present. It is refused without quorum.
4. Each present member **approves** or **objects** with a reason (ERP or Teacher App). Each decision is signed with the
   server's key against the fingerprint. The minutes are approved when the chair (or the secretary when no chair was
   present) and at least half of those present who can sign have approved and no one has objected.
5. On an objection the secretary **takes the minutes back**, revises and circulates again; signatures on the old text
   stay on record but no longer count. Approved minutes cannot be changed anywhere.
6. **Minutes (PDF)** prints attendance with quorum, resolutions, actions, the fingerprint and every signature (a
   signature that no longer matches is marked).
7. Owners report the **action taken** (ERP, Teacher App or *My governance work*), which feeds the ATR.

## Policies (`/governance/policies`)

Add a policy with its code, category, owner, review cycle, whether it is public, the roles that must acknowledge it and
its first version. A version goes draft → in review → approved (by someone other than its author) → published. On
publication the version before is superseded, the review date is set and the roles are told. The policy's page shows
every version with author, approver and acknowledgements, who has not acknowledged yet, and **Remind them**. A text
that changes after approval is flagged and cannot be published.

## Right to information (`/governance/rti`)

Add each request when it arrives: the reply date follows the Act (30 days; 48 hours for life or liberty; 5 more days
through an assistant PIO) and the named PIO is told. From the row: **Transfer** (s.6(3)), **Reply** (pages supplied,
Rs 2 a page; nothing when late or below the poverty line), **Refuse** under a section of the Act, **First appeal**
(within 30 days of the reply or the due date), the appellate authority's order, **Close**. The tiles give this
quarter's return (section 25). The PIO is reminded daily in the last five days and when overdue.

## Compliance calendar (`/governance/compliance`)

**Add the standard deadlines** for the academic year (anti-ragging undertakings, Form 10B, UGC self-disclosure, ITR-7,
NAAC AQAR, ICC annual report to the District Officer, AISHE DCF-II, NIRF, AICTE EoA, TDS, the RTI quarterly return, EPF),
then edit dates to the year's notified windows and add your own. Owners are reminded 30, 7 and 1 day before, and once
when a deadline passes undone. **Mark done** with the portal's acknowledgement number; a recurring deadline gets its
next date. **Register** lists them all as a record kit list (filters, export, history).

## Mandatory disclosure (`/governance/disclosure`)

The preview shows what the public page will show: the institution profile, the lines you add (approvals and
recognition, fees, infrastructure, ombudsperson, PIO), programmes, public committees with their members and helplines
(phones only where allowed), published public policies with their text, and the year's grievance figures with the
grievance officers. **Publish the page** puts it at `/disclosure/<institution>`; the website links there.

## Grievances and data protection

- A grievance also filed on UGC e-Samadhan (or AICTE, CPGRAMS, the university, the state) keeps the portal's reference
  (`POST /v1/grievances/:id/external-ref`); the register filters by it.
- Data-protection requests now include grievances to the institution and nominations; each has an answer-by date (30
  days for a right, 90 for a grievance) and `/dpdp` shows the overdue ones.

## API

`/v1/governance/dashboard`, `/v1/governance/committees/*` (catalogue, compliance, setup, people, `:id`, profile,
members, meetings, agenda, attendance, notice, circulate, revise, sign, minutes.pdf, actions, report, atr/report(.xlsx),
me/summary), `/v1/governance/policies/*` (list, create, versions, move, approve, publish, acks, remind, me/list, text,
acknowledge), `/v1/governance/rti/register`, `/v1/governance/compliance/*` (calendar, standard, done, remind),
`/v1/governance/disclosure` (+ settings), `/v1/public/disclosure/:slug` (+ policies), and the record kit lists
`governance-policies`, `rti-requests`, `compliance-deadlines`, `disclosure-items`. Daily job
`governance.compliance-reminders`.
