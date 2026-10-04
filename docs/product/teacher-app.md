# Teacher App: specification (Phase 1)

The Teacher App is the teacher's phone. In Phase 1 it shows the day, connects to the board,
takes attendance, sets homework, records marks and answers families. It should feel like a Google app: clean
surfaces, a bottom navigation bar, large titles, plain language and no clutter.

Code: [`apps/teacher`](../../apps/teacher). API: `services/api/src/teacher`.

## Phase 1 (built)

| Area | Behaviour | API |
|---|---|---|
| Sign in | Institution code + email or phone + password. Institution and server are remembered. Only accounts with a teaching role (teacher, HOD, principal) can use the app. | `POST /v1/auth/login`, `GET /v1/me` |
| Today | The teacher's periods for a day: time, subject, class, room. The current period is marked **Now**. A day strip moves between days. When today has no classes (Sunday or a holiday) the app says "No classes today" and shows the next teaching day. | `GET /v1/teacher/timetable?date=` (returns `nextTeachingDate`) |
| Connect to board | Scan the board's QR code, or type its 6-digit code. Success shows the board, class, subject and period. While connected, Today shows "Connected · Room 204 Board" with **End class**. | `POST /v1/pairing/claim`, `GET /v1/teacher/session`, `POST /v1/sessions/:id/end` |
| Attendance | Per period. Everyone starts present; tap for absent, long-press for late or excused. Summary bar and submit. Re-opening shows the saved marks. Allowed on the period's day or later, never for a future date. | `GET /v1/sections/:id/roster`, `GET /v1/attendance?slotId&date`, `POST /v1/attendance` |
| Homework | List of homework the teacher set. Assign: class, subject, title, instructions, due date. Only for classes the teacher is timetabled for. | `GET /v1/teacher/classes`, `GET /v1/teacher/homework`, `POST /v1/homework`, `GET /v1/homework?sectionId=` |
| Recordings | A tab listing the lessons the teacher recorded on a board, newest first, with status: Uploading, Shared with class / Not shared, transcript (Preparing / Ready / failed), No sound. **Share with class** (after a confirmation) for finished, unshared recordings made during a timetabled class; families of absent students are notified. Tap to play in the shared lesson player ([`packages/kinetix_lesson`](../../packages/kinetix_lesson)). | `GET /v1/recordings`, `POST /v1/recordings/:id/share`, `GET /v1/recordings/:id`, `/events`, `/audio` |
| Marks | A **Marks** tab: the teacher's class (chips when they teach several), its tests and assignments latest first with **Draft** / **Published**, the class average (bar) and how many of the class have marks entered (from the list's `average`, `entered` and `classSize`). **New assessment**: class, subject (only those the teacher teaches there), title, kind (test, assignment, internal, exam, practical), out of (≤ 1000, decimals allowed), date; then straight into marks entry. **Marks entry** is built for a phone: the class in roll order, a numeric field per student (decimals up to 2 places; letters and a third decimal are ignored), **Next** on the keypad moves to the next student who is not absent, an **Absent** toggle, an optional remark (≤ 300 characters, families see it). Marks above the maximum show "Max 25" under the field and block saving. Rows with unsaved changes are tinted; leaving with unsaved marks asks "Discard changes?". **Save** sends only the changed rows and shows average, highest, lowest and how many are marked. **Publish** (only when saved) confirms that students and families will be notified and says how many students still have no marks; marks can be corrected after publishing. | `GET /v1/teacher/classes`, `GET /v1/assessments?sectionId=`, `POST /v1/assessments`, `GET /v1/assessments/:id`, `PUT /v1/assessments/:id/marks`, `POST /v1/assessments/:id/publish` |
| Messages | A **Messages** tab with an unread badge on the tab (checked at sign-in, on every tab change and when the app returns to the front). The inbox lists threads latest first: the parent's name, "Parent of Aarav Patel · BCom Sem 3 A" (or "Student · …" when an adult student writes), the last message, time and an unread count. The chat shows bubbles with times and day separators, newest at the bottom; pull down at the top for earlier messages (50 at a time); opening a thread marks it read. Sent messages appear at once; a failed one says "Not sent · tap to retry". Long-press copies a message. **New message** (button on the tab): pick the class (chips when the teacher has several), search a student by name or roll number, choose the parent or guardian (name and relation); the thread opens (or the existing one, if there is already a thread with that person about that student). Students with no guardian on record say so and cannot be picked. | `GET /v1/conversations`, `GET /v1/conversations/contacts` (`asStaff`), `POST /v1/conversations`, `GET /v1/conversations/:id/messages?before=`, `POST /v1/conversations/:id/messages`, `POST /v1/conversations/:id/read` |
| Profile | Opens from the avatar at the top of every tab. Name, roles, institution, language, sign out. | `GET /v1/me` |

Navigation: **Today · Homework · Marks · Messages · Recordings** in the bottom bar; Profile from the
avatar, as in Google's apps.

### Rules the server enforces

- A teacher sees a roster, attendance or homework only for classes they have a timetable slot in. Principals and admins can see every class.
- Attendance: the teacher must own the period, every student must be in that period's class (checked under row-level security, because foreign keys bypass it), and the date must fall on the period's weekday and not be in the future. Marks use the same last-writer-wins rule as the board's sync outbox.
- Homework: the subject must belong to the class's program and term, and the due date cannot be in the past.

- Marks: the teacher must teach the class (principals and admins may enter any class); the subject must belong to the class; marks cannot exceed the maximum; publishing needs at least one saved row and notifies families once.
- Messages: a thread is between one member of staff and one family member about one student; only its two people can post, and school leaders' reads are audited.

### API gaps

- **Nothing lists a teacher's classes across sections for marks.** The app uses `GET /v1/teacher/classes` (timetabled section and subject pairs), so a principal or admin, whom the server lets enter any class, only sees classes they teach.
- There is no push or polling channel for new messages; the badge refreshes on tab changes and app resume.

## Later phases (entry points only)

These follow the competitive research ([Teachmint](../research/teachmint-competitive-analysis.md)) and appear under **Profile → Coming soon**:

- **Announcements**: "What is this announcement about?", a 2000-character body and a target class.
- **Student doubts**: a chat thread per student with photo attachments.
- **MCQ tests**: an MCQ editor with sections ("Each question carries +4 marks") that syncs to board quizzes.
- Parent notification for absentees (the server has a TODO where it will be queued).
- Teacher App as a remote and as a document camera for the board ([board features](board-features.md)).
- Offline pairing over LAN/BLE, secure token storage and an app lock ([pairing design](../architecture/board-pairing.md)).
- Hindi and Kannada UI.
