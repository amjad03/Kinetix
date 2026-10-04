# Student App: specification (Phase 1)

The Student App answers what a college student asks every day: *What's due? Did I miss
something in class? Can someone explain this to me?* It is the third member of the mobile
family, next to the [Parent App](parent-app.md) and the [Teacher App](teacher-app.md), and looks
like them: Material 3 from `kinetix_ui`, calm tonal cards, plain language. It speaks to the
student directly ("You missed this class") and adds what parents don't need: **KINETIX AI** for
doubts and the **syllabus library** for self-paced revision.

Code: [`apps/student`](../../apps/student). API: `services/api/src/parent` (the student's own
summary and `/v1/student/me`), `src/ai`, `src/content`, `src/notifications`, `src/push`,
`src/fees`, `src/whiteboards`, `src/recordings`, `src/library`, `src/marks`, `src/messages`,
`src/sessions` (`GET /v1/student/live`) and `src/realtime` (watching a live class). Lesson
playback is shared with the other apps: [`packages/kinetix_lesson`](../../packages/kinetix_lesson);
the live board is drawn with `LessonPlayer.live()` and `LessonView` from
[`packages/kinetix_ink`](../../packages/kinetix_ink).

## Phase 1 (built)

| Area | Behaviour | API |
|---|---|---|
| Sign in | Phone and a texted code by default, or **Use a password instead** (institution code + email or phone + password), as in the Parent App; the token is kept in secure storage. Institution, login and server are remembered; the session is restored on launch. Only accounts with the **student** role and a linked student record get in. Parents are pointed to the Parent app, teachers to the Teacher app, an unlinked login to the college office. | `POST /v1/auth/otp/request`, `POST /v1/auth/otp/verify`, `POST /v1/auth/login`, `GET /v1/me`, `GET /v1/student/me` |
| Navigation | **Today · Learn · Updates · Profile** in a bottom bar on phones (360–430 px), a navigation rail from 600 px; content is centred at up to 720 px on tablets. Text up to 2× fits without overflow. | |
| Today | Greeting with class and roll no. Cards: **Attendance** (percentage over 30 days, attended = present + late + excused, counts, a plain note, the three latest absences, history by day with an "absent or late" filter), **Homework** (upcoming with "Due tomorrow" / "Due Fri 9 Oct", past collapsed, detail), a **Stuck on something?** shortcut to Learn, **Lesson recordings** (missed ones first, marked "You missed this class"; three on Today, the rest under "See all"; the shared player with summary and transcript), **Results**, **Messages** (colleges only), **Library**, **Class boards** (read-only viewer with pages and zoom). Pull to refresh; loading, empty and error states. | `GET /v1/parent/children/:id/summary`, `/attendance` (the student's own id), `GET /v1/whiteboards/:id`, `GET /v1/recordings/:id`, `/events`, `/audio` |
| Live class | When the teacher takes a class live on the board, Today opens with a **Live now** banner above everything else (live colour, "Live now: Corporate Accounting", "Anita Sharma is teaching. Watch the board.", **Watch**). The app asks whether a class is live when Today loads, on pull to refresh, when the app comes back to the foreground, and as soon as a new *Live now* update arrives in Updates. **Watch** opens a full-screen, dark viewer: the board fitted to the screen at 16:9 (turn the phone sideways for a bigger board; tablets and landscape get the same layout), the **LIVE** pill, subject and teacher, the page the teacher is on ("Page 2 of 2") and **"Board only: no sound yet"**; a tap on the board hides the bars. States: *Joining the class…*, *Waiting for the board…* (until the board's snapshot arrives), *Connection lost. Reconnecting…* over the last board (the app rejoins and gets a fresh snapshot by itself), *The board went offline* (stays open and comes back on its own when the board reconnects; *Try again*), *Your teacher stopped the live class*, *The class has ended*, and a refused join in the server's words ("This is not your class"). Leaving unwatches. | `GET /v1/student/live`; Socket.IO `<api>/realtime` with `auth: {token}`: `ready`, `live.watch {deviceId}` (ack `{ok, error?, session?}`), `live.frame {deviceId, events}`, `live.ended {reason: live_off \| class_ended \| offline}`, `live.unwatch` |
| Results | A **Results** card: the two latest published assessments with the score ("19 / 25"), class average and *Above / At / Below class average*, and per-subject percentage bars; *See all results*; an assessment screen with the score, "out of 25 · 76%", bars for *You*, the class average and the highest, and the teacher's remark. Also Profile → *Results*. | `GET /v1/marks/students/:id` |
| Library | A **Library** card: books out (overdue first, **red "Overdue by 3 days"**, amber when due within two days), "*n* out", fines for late returns; the library screen with *Books out* and *Returned* (dates and fines). Also Profile → *Library books* ("2 books out, 1 overdue"). | `GET /v1/library/students/:id` |
| Messages | **Only where the API lists contacts** (colleges and universities; at schools families write instead and the student sees nothing). A **Messages** card on Today (latest thread, "*n* unread", *Write to a teacher* / *Open messages*) and Profile → *Messages* open the list of threads with each teacher. **New message** lists the class's teachers with the subjects they teach. The chat is the Parent App's: bubbles, day chips, times, pull down for earlier messages, marked read on open and on each reply, checks for replies every 15 seconds while open. | `GET /v1/conversations/contacts` (non-empty only at colleges), `POST /v1/conversations`, `GET /v1/conversations`, `GET/POST /v1/conversations/:id/messages`, `POST /v1/conversations/:id/read` |
| Learn: Ask a doubt | The student types a doubt and picks the answer language: **English, हिन्दी or ಕನ್ನಡ** (remembered; defaults to the profile language). Optional **Subject** chips ground the answer in that subject's syllabus; the class is always sent. The answer card shows the answer, **Key points**, **Based on** chips for the library topics it drew on (tap to open the topic), and **Ask next** follow-ups (tap to ask). When no AI server is connected the API answers with a preview, and the card says **Preview answer: KINETIX AI isn't connected at your college yet, so this is a sample, not a real explanation.** Errors in plain words: an unsafe question (422) is refused with no retry; the day's allowance used up (429) says it resets tomorrow; AI unreachable (503) or offline offers **Try again**. Earlier questions of the session stay listed. Every answer carries "KINETIX AI can make mistakes. Check important answers with your teacher or textbook." | `POST /v1/ai/explain {question, language, sectionId, subjectId?, topicId?}` |
| Learn: Syllabus | A search bar over every library topic (two letters or more), and **Your subjects** with chapter-by-chapter outlines. A subject not linked to the library says so. A **topic page** shows the course, summary, notes and "After this topic you should be able to…", a note when the curriculum team has not reviewed it yet, and **Ask KINETIX AI about this**, which grounds the question in that topic. | `GET /v1/content/search?q=`, `/syllabus?subjectId=`, `/topics/:id` |
| Updates | Inbox grouped Today / Earlier with an icon per kind (homework, board shared, lesson recording, fee, library, marks, message, live class, message from the college), unread dot and tab badge. Tapping marks it read and opens homework → detail, board → viewer, recording → player (with "missed" when the summary says so), payment → receipt, fee due → fees, absence → attendance history, library book borrowed → library, marks published → that result (marks reloaded), message from a teacher → the conversation, **Live now** → straight into the live board while that class is still live (otherwise "This class is no longer live."); anything else opens in full. Mark all as read. | `GET /v1/notifications`, `POST /v1/notifications/:id/read`, `/read-all` |
| Profile | Name, email or phone, class, roll no., program, college; attendance history; **Fees**: total due (red when something is overdue), every fee with Paid / Due / Part paid / Overdue, payments with **receipts** (receipt no., date and time, method, reference, balance). Read-only, and it says so: *fees are paid by your parent or guardian in the KINETIX Parent app, or at the college fees counter.* **Results & library** (and **Messages** at colleges). The KINETIX AI answer language. A *Soon* entry for Timetable. Server; sign out (with confirmation). | `GET /v1/fees/students/:id`, `GET /v1/fees/payments/:id/receipt` |
| Push | Optional per build (Firebase options via `--dart-define`, see [push-setup.md](push-setup.md)): asks once after sign-in, registers the device token (`app: 'student'`) and again when it rotates, removes it on sign-out; a tapped push opens the update as in Updates. | `POST /v1/push/devices`, `DELETE /v1/push/devices` |

### Rules the server enforces

- The summary and attendance routes answer for the student's own id only (or a guardian's
  child); any other id is a 404.
- Students may only ask KINETIX AI for **explanations**; quizzes, homework and lesson plans
  stay with teachers.

Fees are read-only **in the app** by product choice: the API's checkout route would accept a
student's own invoice, but paying is the family's job, so the Student App offers no Pay button.

## API gaps found while building

- ~~No "subjects of my class" endpoint~~: added, `GET /v1/student/subjects`; the app uses it.
- ~~Absence alerts go to guardians only~~: they now reach the student's own account too; the
  app opens attendance history.
- **The seed writes notifications for guardians only**, so a fresh demo student has an empty
  inbox until homework, a payment or a broadcast is created.
- **No PDF receipt.** The receipt is shown on screen only.
- `POST /v1/ai/explain` returns `meta.provider` and `meta.model`; the app ignores them and shows
  only `meta.preview` and `meta.sources`.
- **No sound in a live class.** The board streams ink only; the viewer says "Board only: no sound
  yet".
- **"Is my class live?" is a poll.** Without push the app learns of a live class when it opens,
  on pull to refresh, on returning to the foreground, or when Updates loads the *Live now* update.
  A realtime event to the class (or push) would bring the banner up straight away.
- **No running fine for an overdue book** (only on return), and **no realtime for messages**
  (the open chat polls every 15 seconds), as in the Parent App.

## Later phases (entry points only)

Under **Profile → Coming soon** with a *Soon* badge: **Timetable**. Also planned: sound in live
classes, an app lock, the app's own text in Hindi and Kannada,
quizzes the teacher sends to the class, and a saved history of AI answers across sessions.
