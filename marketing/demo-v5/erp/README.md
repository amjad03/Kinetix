# ZYNETIX ERP: real screen recordings (demo v5)

These are real recordings of the production ERP build (`apps/erp`, `next start`) and API (`services/api`). The data is the seeded Soundarya Institute of Management and Science tenant (`soundarya`, password `zynetix123`).

## Output

- `clips/<id>.mp4`: 1920x1080, 30 fps constant, H.264 (CRF 16, preset slow, yuv420p, BT.709), no audio.
- `clips/<id>.json`: `{id, title, duration, login, marks[{t,label}], rects[{t,x,y,w,h,label}]}`. Marks are the moments to sync narration to (page settled, tab clicked, row or dialog opened). Rects are in output pixels (1920x1080) and mark a region worth zooming into at that moment. A label starting with `[cut]` means the clip hard-cuts to a new page at that moment (`page.goto`, no link click).
- `contact.jpg`: the middle frame of every clip (`bash contact.sh` rebuilds it).

## How it is recorded

`node record_erp.mjs [id ...]` records all clips (or the named ones). The clip scripts are in `clips.mjs` and the recorder is in `lib.mjs`.

- The viewport is 1440x810 CSS px at device scale factor 4/3, so the frames are 1920x1080 with text about 33% larger than at 1080p 1x.
- Each clip runs in a fresh browser context, signed in with an API token in the `kx_session` cookie and with `kx_lang=en`. Before recording, the page loads, the network goes quiet, fonts load, and the page is scrolled through once so lazy sections and chart animations have finished.
- The recorder's own motion is stepped one output frame at a time and captured with `Page.captureScreenshot`. This covers the cursor (eased, slightly curved paths, 0.6 to 0.9 s per move), scrolling (eased `scrollTop` steps, 0.9 to 2 s), typing, and the click ripple (a grey circle fading over 300 ms). Motion stays smooth however slow the capture is.
- After each click, the app's transition is captured with the page animation timeline slowed to 0.2x (`Animation.setPlaybackRate`), and the frame times are scaled back to real time. Capture ends when 3 identical frames arrive and the network is idle.
- Frames are timestamped on a virtual timeline and written to ffmpeg at a constant 30 fps. Each frame is held until the next timestamp.
- The cursor is a DOM element (a black arrow with a white outline, 22 CSS px) with `pointer-events: none`. Real mouse events go to the same coordinates, so hover states are real. The Next.js dev overlay and error toasts are hidden with CSS.
- `explore.mjs` is a helper that screenshots routes for any login.

Start the stack the way `scripts/demo-start.sh` does (API on :4000, `next start` on :3000 with `ZYNETIX_API_URL=http://localhost:4000 ZYNETIX_TIMEZONE=Asia/Kolkata ZYNETIX_INSECURE_COOKIES=1`). A full run takes about 17 minutes on 4 CPUs.

## Clips

| id | what it shows | s | login |
|---|---|---|---|
| `dashboard` | Principal home: KPI cards, hover attendance and fees, scroll to attendance trend and "Needs your attention", fee collection by class and today's classes, back up, Finance tab | 18.2 | principal@ |
| `admissions` | 8-step pipeline (enquiry to enrolment), BBA 2027-28 rank (merit) list, Applications tab, one application opened | 19.1 | admissions@ |
| `students` | Student list, type "Vignesh Naik", quick panel (attendance shortage, overdue fees), attendance by subject, full 360 profile, Academics and Fees tabs | 20.1 | principal@ |
| `attendance` | Today: rate, absent, late; class-wise table; absent students; attendance approvals and the shortage (defaulter) list | 15.7 | principal@ |
| `timetable` | Weekly grid for BBA Aviation Sem 1 A, hover a period, class picker, switch to BCA Sem 3 A | 12.9 | principal@ |
| `exams` | Exam office (sessions in progress), BCom Sem 5 session: registration 96%, 25 hall tickets issued, valuation and moderation by paper | 12.9 | principal@ |
| `results` | Published BBA Sem 3 model exam: pass 78.6%, average SGPA; result sheet with grades, SGPA, CGPA, pass / not passed | 12.0 | principal@ |
| `obe` | COs/POs at target, PO attainment rings, CO-PO mapping matrix (BBA-301 chosen in the picker), CO attainment bars | 16.0 | principal@ |
| `naac` | NAAC criteria completeness rings, predicted CGPA gauge 2.80, filter to criterion 2, metric table, IQAC workspace | 12.5 | iqac@ |
| `fees` | Billed, collected, outstanding, overdue; monthly chart; defaulters and recent receipts; a fee receipt; overdue invoices; "Record a payment" dialog (closed without saving) | 16.0 | accounts@ |
| `finance` | Accounts desk (items waiting for action, registers), accounts reports, Tally sync | 15.9 | accounts@ |
| `hr` | Staff directory, leave requests, payroll runs, October 2026 run (progress steps, pay lines with PF/PT/TDS) | 15.3 | hr@ |
| `library` | Titles, on loan, overdue, fines; overdue filter; "Issue a book" dialog; catalogue | 14.3 | library@ |
| `transport` | Routes, vehicles and drivers, expiring papers, route 1 dialog with stops and riders | 16.3 | transport@ |
| `hostel` | Beds and allotment, mess menu, gate passes, complaints | 15.9 | warden@ |
| `placements` | Placement KPIs, drives, placed by company, internships, alumni giving | 15.5 | placements@ |
| `certificates` | Certificate requests (bonafide, conduct) with serial numbers, new request dialog, templates, ID cards | 14.4 | principal@ |
| `comms` | Types a PTM notice, picks "Important", delivery on 4/4 boards, communication engine (SMS / WhatsApp / email templates). Nothing is sent | 19.0 | principal@ |
| `lms` | Courses, a course space (units, notes, recorded lectures), question bank (CO, Bloom level), generated papers | 12.8 | principal@ |
| `analytics` | Analytics KPIs, monthly performance, admissions by month, department health, weekly attendance, dues by class | 12.7 | principal@ |
| `workflows` | Workflow list, Purchase approval canvas (trigger, HoD, amount >= 25000 condition, principal, accounts), step side panel | 11.0 | principal@ |
| `smartboards` | Boards (4 enrolled, 4 online), device console (app version, storage, power, remote actions), Live page | 13.9 | principal@ |
| `settings` | Settings (live classroom view, board sign-in, kiosk), institution profile | 11.8 | admin@ |
| `language` (extra) | Dashboard switched English to Kannada to Hindi and back | 10.7 | principal@ |
| `early_alerts` (extra) | Early alerts with reasons, Vignesh Naik high risk, mentoring at-risk list | 8.9 | principal@ |
| `grievances` (extra) | Tickets with severity and deadlines (ragging: critical, confidential), discipline cases | 8.2 | principal@ |
| `inventory` (extra) | Items with low stock, purchase orders, vendors | 10.6 | stores@ |
| `research` (extra) | Projects, publications, grants, patents; research office; theses | 9.3 | principal@ |
| `campus_life` (extra) | Clubs, committees, events | 8.8 | principal@ |

Exact mark times and labels are in each clip's JSON.

## Logins used

All logins are `@soundarya.demo.zynetix.in` with password `zynetix123`: principal, admissions, accounts, iqac, hr, library, transport, warden, placements, admin, stores.

## Problems and choices

- **Exam controller cannot open exam sessions.** The `controller@` login gets "Couldn't load this page: Your account doesn't have access to this" on `/exams` and on published session pages such as `/exams/5bfb9e14-...`. This looks like an app permission bug for that role. The `exams` and `results` clips use the principal instead. Not patched.
- **The CO-PO matrix starts empty.** `/obe/matrix` and the matrix card on `/obe` default to the first subject (BAV-101 / BBA-101), which has no course outcomes ("No course outcomes for this subject yet"). The clip picks BBA-301 in the subject picker. The middle frame in `contact.jpg` still shows the empty default, before the pick.
- **Boards show offline after about 30 minutes.** The seed stamps the boards' `devices.last_seen_at` once, so about 30 minutes after seeding they show as offline. `record_erp.mjs` refreshes that heartbeat in the database before each clip (demo data only, no code change). The dashboard and `smartboards` clips then show 4 of 4 online.
- **The admin account opens in Kannada.** `admin@` opens the ERP in Kannada (seeded preference). Every clip sets the `kx_lang=en` cookie, except the `language` clip, which switches the language on screen.
- **Modules not recorded:**
  - Topic videos (`/topic-videos`) has "No courses in the library yet".
  - `/platform/concept-videos` redirects to the dashboard (platform-admin only).
  - Chat (`/chat`) has no conversations.
  These are left out. LMS is shown with courses and the question bank instead.
- **Live shows no class.** The Live page (end of `smartboards`) shows "No classes on the boards right now", because no board is teaching.
- **The HR Leave tab looks inconsistent.** It says "6 waiting", but the first rows on screen are approved requests.
- **Placements drives table wraps badly.** The Drive column is narrow, so names wrap over several lines. That is the app's layout.
- **Hard cuts.** Three clips have a hard cut where no on-screen link was visible: `fees` (to overdue invoices), `lms` (to the question bank) and `early_alerts` (to mentoring). Each is marked `[cut]` in the JSON.
- **Brief jumps after a click.** Transitions that run in JavaScript (for example Recharts redraws) are not slowed down. A few frames after a click can therefore jump slightly. Scrolling and cursor motion are always smooth.
- **Length.** `students` is 20.1 s. Every other clip is 8 to 19.1 s.
