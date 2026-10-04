# Parent App: specification (Phase 1)

The Parent App answers the questions parents actually ask: *Is my child going to class? What
homework is due? Do they take part? What was taught today?* It should feel like Google Family
Link or Google Classroom: calm tonal cards, big readable numbers, plain language and no
education jargon. One parent account can follow several children.

Code: [`apps/parent`](../../apps/parent). API: `services/api/src/parent`, `src/notifications`, `src/whiteboards`.

## Phase 1 (built)

| Area | Behaviour | API |
|---|---|---|
| Sign in | Institution code + phone or email + password. Ten-digit Indian numbers are sent in E.164 (`+91…`). Institution, login and server are remembered. Only accounts with the **guardian** role can use the app; others get a polite explanation. | `POST /v1/auth/login`, `GET /v1/me` |
| Children | Avatar chips at the top of Home switch between children (hidden for one child). The choice is remembered on the device. | `GET /v1/parent/children` |
| Home | One summary call per child: a header card (name, class, roll no.) and four cards. Pull to refresh. | `GET /v1/parent/children/:id/summary?days=30` |
| Attendance | Percentage attended over the last 30 days, where attended = present + late + excused. Counts of present, absent and late. The three latest absences: "Absent · Corporate Accounting · Thu 1 Oct, 10:00". A plain note: good (85%+), "missed a few classes" (75–85%), or below 75% (the usual exam-eligibility line). History screen grouped by day with status chips and an "absent or late" filter. | summary, `GET /v1/parent/children/:id/attendance?days=30` |
| Homework | Upcoming homework with relative due dates ("Due tomorrow", "Due Fri 9 Oct"), subject and teacher; past homework collapsed. Detail screen with the instructions. | summary |
| In class | For each subject, how the child answered when the teacher picked them on the board: correct, partly correct, not correct, no answer. Shown as a sentence and a stacked bar. | summary (`participation`) |
| Class boards | Boards the teacher shared with the class after a lesson. Full-screen read-only viewer: page swipe, pinch and double-tap zoom, title, subject, teacher and date. | summary (`sharedBoards`), `GET /v1/whiteboards/:id` |
| Updates | Notification inbox grouped Today / Earlier with an icon per kind (absence, homework, board shared, message from the college), unread dot and a badge on the tab. Tapping marks it read and opens the related screen: absence → attendance history (that day outlined), homework → homework detail, board → viewer, message → full text. Mark all as read. | `GET /v1/notifications`, `POST /v1/notifications/:id/read`, `POST /v1/notifications/read-all` |
| Profile | Parent's name, phone and email, the children, college, server, sign out. | `GET /v1/me` |

### Rules the server enforces

- Every `/v1/parent/children/:id/*` route checks the guardian link first and answers 404 for
  any other child, so ids reveal nothing.
- A shared board is visible to guardians of students in the board's class, and only once the
  teacher has shared it.
- Absence alerts are withdrawn if the teacher corrects the mark to present or late.

## Later phases (entry points only)

These appear under **Profile → Coming soon** with a *Soon* badge:

- **Fees & receipts**: dues, online payment (UPI) and downloadable receipts.
- **Message the teacher**: a thread per child and teacher, with office hours.
- **Library books**: books borrowed and due dates.
- **Language**: English, हिन्दी and ಕನ್ನಡ (the fonts are already bundled in `kinetix_ui`).

Also planned: push notifications (FCM/APNs, the server already has a TODO), secure token
storage with an app lock, acknowledging a broadcast that requires it, board thumbnails, and
term-wise attendance and marks.
