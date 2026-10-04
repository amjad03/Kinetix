# KINETIX ERP: principal dashboard (first slice)

**Who:** principal, administrator (`tenant_admin`), head of department (`hod`), and the accounts
office (`accountant`, Fees only). Teachers, students and parents are refused at sign-in and
pointed to their apps.
**Where:** `apps/erp` (Next.js). Reads the KINETIX Cloud API `v1/admin/*`, `v1/broadcasts`,
`v1/devices`, `v1/fees`, `v1/content`, `v1/ai/usage` and the `/realtime` socket (live view).

The principal's question each morning is "is the school running?": are classes being taught,
is attendance taken, who is absent, is homework set, are the boards working. This slice answers
that for any day and lets the principal reach every classroom at once.

## Look

Google admin console feel: Material 3, Google Sans, scheme from seed `#0B57D0` (TonalSpot, same
as the Board and apps), tonal surfaces, no heavy shadows. A navigation drawer on desktop becomes
a rail on tablets. Stat tiles and small bars only; no charts. Light theme; dark follows the
system.

## Pages

| Page | What it shows |
|---|---|
| **Today** | Six tiles: classes taught of scheduled (with live / missed / upcoming bar), attendance rate and periods taken of due, absent students, homework set, boards online and in class, messages sent. Then the day's timeline: time, subject, class, teacher, room, board, attendance taken/absent, status (Live, Taught, Not started, Missed, Upcoming), and a "Now" line on today. |
| **Classes** | The same classes as a table, with status filter chips (with counts), class and teacher filters. |
| **Attendance** | Rate, absent students, late marks, classes marked; per class: students, marked, present, absent, late, rate with a small bar; absent students with the periods they missed and who marked them. |
| **Homework** | Homework set in the last 7 / 14 / 30 days: title, instructions, class, subject, teacher, set, due (with "in 2 days" / "was due"). |
| **Messages** ("Circulate") | Compose: title, message, priority, audience (whole school / programs / classes), require acknowledgement, expiry; emergency asks for confirmation. Sent list: priority, active / cleared / expired, audience, boards displayed and acknowledged, families notified, per-board delivery, **Clear** ("All clear" for emergencies). |
| **Boards** | Each board: online dot, room, what it is teaching now and by whom, platform and version, last seen. **Add board** registers it and shows the one-time enrolment code large, with steps. Principal and administrator only. |
| **Live** | Boards with a class in session: subject and class, teacher, board and room, started, people watching, **Watch**. The watch view shows the board as the class sees it (scaled to fit, all backgrounds, highlighter, shapes, page *n* of *m*), the class, and "Viewing is recorded in the audit log". It works on an empty board, and explains offline (waits for the board), class ended, no class, and live view turned off. Board only: classroom sound is not part of live view yet. Principal, administrator, HOD. |
| **Fees** | Billed, collected (with a bar), outstanding and overdue in rupees (₹1,23,456; tiles shorten to ₹9.16 L), then each class. **Issue fee** to a class (name, amount per student in ₹, due date): every student gets an invoice and families are notified. **Invoices**: Due / Overdue / Paid / Cancelled / All, by class, search by student or roll number; **Record payment** at the counter (cash, cheque, bank transfer, UPI with its reference; part payments allowed) shows the numbered receipt at once; **Print receipt** opens a print-ready receipt (amount in words); **Cancel invoice** for a fee with no money received; past receipts from the row menu. Principal, administrator, accounts office. |
| **Syllabus** | Your subjects (from this week's timetable) and the library course each is linked to; principal and administrator change the link. The library by curriculum, with **Not reviewed** on courses not yet checked by a subject expert and which subject uses each course. A course shows its chapters and topics (notes, learning outcomes); the institution adds, edits and deletes **its own topics** (library topics are read-only). |
| **AI usage** | KINETIX AI over the last 30 days: requests, share answered, blocked or failed, tokens, and the same per task (Explain, Quiz, Homework, Lesson plan, Lesson summary). Principal and administrator. |

Every dated page has previous / next day, a calendar and **Today**. A day without classes says
why: on Sundays, "No classes on Sundays" with buttons for Saturday and Monday.

### Priorities (what the board does)

| Priority | Board | Apps |
|---|---|---|
| Info | Banner at the top for 15 s, then in the board inbox | Notification |
| Important | Card in the centre with a sound until the teacher dismisses it | High-priority notification |
| Emergency | Full-screen red takeover with an alarm until the sender clears it | Critical alert |

Whole-school messages go to every enrolled board. Program and class messages go to boards that
are teaching those classes at that moment, and to the students and families of those classes.

## Security

The API token stays on the server in an `httpOnly`, `SameSite=Lax` cookie; the browser only
talks to the Next.js server. Role checks happen at sign-in and again on every page load
(`/v1/me`); the API enforces them as well. Each role sees only its sections (`src/lib/access.ts`):
the accounts office lands on Fees and is sent back there from any other page.

**Live view** keeps the same rule: the browser opens a same-origin event stream
(`/api/live/:boardId`, server-sent events). The ERP server checks the session and role, joins
the API's `/realtime` socket with the user's token itself, sends `live.watch`, and forwards
`live.frame` / `live.ended` to the page; closing the page sends `live.unwatch`. The token never
reaches the browser, and the browser needs no route to the API. The API audits every viewing
(`live_view.start` / `live_view.end`).

## Not in this slice

Live classroom thumbnails, classroom sound in live view, per-student history, timetable editing,
exports, removing boards, notifications to the principal, fee reports and concessions, online
payment reconciliation, adding chapters to a course (the API supports it; the page adds topics).
