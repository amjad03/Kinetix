# Parent App: specification (Phase 1)

The Parent App answers the questions parents actually ask: *Is my child going to class? What
homework is due? Do they take part? What was taught today?* It should feel like Google Family
Link or Google Classroom: calm tonal cards, big readable numbers, plain language and no
education jargon. One parent account can follow several children.

Code: [`apps/parent`](../../apps/parent). API: `services/api/src/parent`, `src/notifications`, `src/whiteboards`, `src/recordings`, `src/fees`
([fees and payments](../architecture/fees-payments.md)), `src/library`, `src/marks`, `src/messages`.
Lesson playback is shared with the Teacher App: [`packages/kinetix_lesson`](../../packages/kinetix_lesson).

## Phase 1 (built)

| Area | Behaviour | API |
|---|---|---|
| Sign in | **Phone and a texted code** by default: institution code + 10-digit mobile (`+91` shown, a pasted `+91`/`0` dropped), **Send code**, then the 6-digit code (offered by SMS autofill, `AutofillHints.oneTimeCode`; no SMS permission), signing in as soon as six digits are in. **Resend** after the server's `retryAfterSeconds`, **Change number**; wrong/expired codes, invalid numbers and rate limits are worded in the app's language. **Use a password instead** keeps institution + phone or email + password. Institution, login and server are remembered; the session token is kept in secure storage (Android Keystore / iOS Keychain), moved once from older preferences. Only accounts with the **guardian** role can use the app; others get a polite explanation. | `POST /v1/auth/otp/request`, `POST /v1/auth/otp/verify`, `POST /v1/auth/login`, `GET /v1/me` |
| Push | Optional per build (Firebase options via `--dart-define`): asks once after sign-in, registers the device token (`app: 'parent'`), removes it on sign-out, and a tapped push opens the update as in Updates. See [push-setup.md](push-setup.md). | `POST /v1/push/devices`, `DELETE /v1/push/devices` |
| Children | Avatar chips at the top of Home switch between children (hidden for one child). The choice is remembered on the device. | `GET /v1/parent/children` |
| Navigation | **Home · Messages · Updates · Profile** in a bottom bar; Messages and Updates carry unread badges. | |
| Home | One summary call per child (plus fees, library and marks, each failing on its own): a header card (name, class, roll no.) and the cards below, in this order: attendance, homework, results, fees, library, lesson recordings, in class, class boards. Pull to refresh reloads all of them. | `GET /v1/parent/children/:id/summary?days=30` |
| Attendance | Percentage attended over the last 30 days, where attended = present + late + excused. Counts of present, absent and late. The three latest absences: "Absent · Corporate Accounting · Thu 1 Oct, 10:00". A plain note: good (85%+), "missed a few classes" (75–85%), or below 75% (the usual exam-eligibility line). History screen grouped by day with status chips and an "absent or late" filter. | summary, `GET /v1/parent/children/:id/attendance?days=30` |
| Homework | Upcoming homework with relative due dates ("Due tomorrow", "Due Fri 9 Oct"), subject and teacher; past homework collapsed. Detail screen with the instructions. | summary |
| Results | A **Results** card on Home: the two latest published assessments (subject, title, kind, date, class average) with the score ("22.5 / 25"; halves kept, "Absent", "Not entered") and a chip: *Above / At / Below class average* (green / neutral / amber), then **By subject** bars with the child's percentage across published marks (green 75%+, amber 50–75%, red below). *See all results* lists every assessment. The **assessment** screen: the big score with "out of 25 · 90%", the comparison chip, bars for the child, the class average and the highest in class, and the teacher's remark; an absence says so. Also from Profile → *Results & library*. | `GET /v1/marks/students/:id` (published only) |
| Library | A **Library** card on Home: "*n* out", books out with author, a due chip ("Due Fri 9 Oct"; amber within two days; **red "Overdue by 4 days"** with a red line "1 book overdue. Please return it to the library."), overdue first then earliest due, and fines for late returns. The **library** screen (also from Profile): fines (pay at the library desk), *Books out*, and *Returned* with borrowed / returned dates and any fine. | `GET /v1/library/students/:id` |
| Messages | The **Messages** tab lists threads with each teacher, latest first: teacher, "About Aarav · BCom Sem 3 A", the last message, its time ("4:18 pm", "Yesterday", "Mon", "1 Oct") and an unread count (also summed on the tab). **New message** picks the child (chips, when there are several) and then one of that child's teachers, each with the subjects they teach the class; it opens (or reopens) the thread. The **chat**: bubbles (the parent's on the right in the accent colour, the teacher's on the left), day chips, times, a composer (up to 2,000 characters; a counter near the limit), long press to copy. It opens at the newest message, **pull down for earlier messages** (pages of 50), marks the thread read on open and whenever a reply arrives, and checks for replies every 15 seconds while open (no push yet). | `GET /v1/conversations/contacts`, `POST /v1/conversations`, `GET /v1/conversations`, `GET/POST /v1/conversations/:id/messages`, `POST /v1/conversations/:id/read` |
| In class | For each subject, how the child answered when the teacher picked them on the board: correct, partly correct, not correct, no answer. Shown as a sentence and a stacked bar. | summary (`participation`) |
| Class boards | Boards the teacher shared with the class after a lesson. Full-screen read-only viewer: page swipe, pinch and double-tap zoom, title, subject, teacher and date. | summary (`sharedBoards`), `GET /v1/whiteboards/:id` |
| Lesson recordings | Lessons the teacher recorded on the board and shared with the class. The ones the child was absent for come first, marked **Missed this class**; three on Home, the rest under "See all". The player replays the board in step with the teacher's voice: play/pause (or tap the board), seek bar with elapsed and total time, ±10 s, 1× / 1.5× / 2×, page indicator. **Summary** (key points) and **Transcript** tabs appear when ready ("being prepared" while queued). Where the device has no audio backend (desktop Linux) or the lesson has no sound, the board plays on a silent clock and says so. | summary (`recordings`, with `missed`), `GET /v1/recordings/:id`, `/events`, `/audio` |
| Fees & receipts | A **Fees** card on Home: the amount due (Indian grouping, ₹1,23,456; paise only when non-zero), the fee to pay next with its due date (overdue in red, overdue first), "Pay" and "View fees"; "All fees paid" with the last payment otherwise. The Fees screen (also from Profile → *Fees & receipts*, one entry per child): total due, fees **to pay** (earliest first) with due/overdue chips and a progress bar for part payments ("₹10,000 of ₹42,500 paid · ₹32,500 left"), **paid** fees, and **payments and receipts** (amount, fee, date, method, receipt number). **Pay now** asks for the full balance or a part (rupees, minimum ₹1, no more than the balance), creates the order on the server, opens the gateway's checkout and confirms the signed result with the server, then shows the **receipt**: institution, student and roll no., class, fee, amount, method, reference, receipt no., date and balance left, on a paper-like card that stays light in dark mode; *Copy receipt* puts it in plain text for a message or email. **Gateways:** Razorpay through the official `razorpay_flutter` checkout on Android and iOS (key, order, amount, name, description, prefill; success, failure, cancel and external wallets handled); **demo** in development, a confirm sheet labelled "Demo payment: no money moves" that signs the payment like the server's demo provider; and when the college has no online payments (or on desktop builds with Razorpay), "Please pay at the fees counter". A payment the server can't verify is not recorded and the parent is told plainly. | `GET /v1/fees/students/:id`, `POST /v1/fees/invoices/:id/checkout`, `POST /v1/fees/payments/:id/confirm`, `GET /v1/fees/payments/:id/receipt` |
| Updates | Notification inbox grouped Today / Earlier with an icon per kind (absence, homework, board shared, lesson recording, fees, message from the college), unread dot and a badge on the tab. Tapping marks it read and opens the related screen: absence → attendance history (that day outlined), homework → homework detail, board → viewer, recording ("Missed Corporate Accounting? Watch the lesson") → player, payment received → its receipt, new fee → that child's fees (matched by the fee's title when there are several children), library book borrowed → that child's library, marks published → that assessment's result (the child found by class; marks reloaded), message from a teacher → the conversation, message from the college → full text. Mark all as read. | `GET /v1/notifications`, `POST /v1/notifications/:id/read`, `POST /v1/notifications/read-all` |
| Profile | Parent's name, phone and email, the children, fees & receipts, **Results & library** (one results and one library entry per child), college, server, sign out. | `GET /v1/me` |

### Rules the server enforces

- Every `/v1/parent/children/:id/*` route checks the guardian link first and answers 404 for
  any other child, so ids reveal nothing.
- A shared board is visible to guardians of students in the board's class, and only once the
  teacher has shared it.
- Absence alerts are withdrawn if the teacher corrects the mark to present or late.

## Later phases (entry points only)

These appear under **Profile → Coming soon** with a *Soon* badge:

- **Language**: English, हिन्दी and ಕನ್ನಡ (the fonts are already bundled in `kinetix_ui`).

Also planned for messages: push for replies (the chat polls while open), office hours, and
attachments.

Also planned for fees: a PDF receipt to download or share, and opening "Fee due" updates
without matching titles once the notification names the student. Also planned: an app lock, acknowledging a broadcast that requires it, board thumbnails, and
term-wise attendance and marks.

## API gaps found while building

- **No running fine for an overdue book.** `finePaise` is set only when the book comes back, so
  the app flags an overdue book in red without an amount, and says the library fines each late
  day. A per-day rate (or an accrued fine) in the response would let it show "₹8 so far".
- **Messages are not realtime without push.** With push off in a build, a reply shows up when the Messages tab is opened, on pull
  to refresh, or within 15 seconds while the chat is open.
- **Paging by time.** `?before=` takes a timestamp; two messages in the same millisecond at a page
  edge could be skipped. A cursor by message id would be exact.
- The thread list has no "read by the teacher" time, so the app shows no read receipts.
