# KINETIX ERP: principal dashboard (first slice)

**Who:** principal, administrator (`tenant_admin`), head of department (`hod`). Teachers,
students and parents are refused at sign-in and pointed to their apps.
**Where:** `apps/erp` (Next.js). Reads the KINETIX Cloud API `v1/admin/*`, `v1/broadcasts`,
`v1/devices`.

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
(`/v1/me`); the API enforces them as well.

## Not in this slice

Live classroom thumbnails, per-student history, timetable editing, exports, renaming or removing
boards, re-issuing enrolment codes, notifications to the principal.
