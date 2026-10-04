# Teacher App: specification (Phase 1)

The Teacher App is the teacher's phone. In Phase 1 it does four jobs: show the day, connect
to the board, take attendance and set homework. It should feel like a Google app: clean
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
| Profile | Name, roles, institution, language, sign out. | `GET /v1/me` |

### Rules the server enforces

- A teacher sees a roster, attendance or homework only for classes they have a timetable slot in. Principals and admins can see every class.
- Attendance: the teacher must own the period, every student must be in that period's class (checked under row-level security, because foreign keys bypass it), and the date must fall on the period's weekday and not be in the future. Marks use the same last-writer-wins rule as the board's sync outbox.
- Homework: the subject must belong to the class's program and term, and the due date cannot be in the past.

## Later phases (entry points only)

These follow the competitive research ([Teachmint](../research/teachmint-competitive-analysis.md)) and appear under **Profile → Coming soon**:

- **Announcements**: "What is this announcement about?", a 2000-character body and a target class.
- **Student doubts**: a chat thread per student with photo attachments.
- **Tests**: an MCQ editor with sections ("Each question carries +4 marks") that syncs to board quizzes.
- Parent notification for absentees (the server has a TODO where it will be queued).
- Teacher App as a remote and as a document camera for the board ([board features](board-features.md)).
- Offline pairing over LAN/BLE, secure token storage and an app lock ([pairing design](../architecture/board-pairing.md)).
- Hindi and Kannada UI.
