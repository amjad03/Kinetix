# Student App: specification (Phase 1)

The Student App answers what a college student asks every day: *What's due? Did I miss
something in class? Can someone explain this to me?* It is the third member of the mobile
family, next to the [Parent App](parent-app.md) and the [Teacher App](teacher-app.md), and looks
like them: Material 3 from `kinetix_ui`, calm tonal cards, plain language. It speaks to the
student directly ("You missed this class") and adds what parents don't need: **KINETIX AI** for
doubts and the **syllabus library** for self-paced revision.

Code: [`apps/student`](../../apps/student). API: `services/api/src/parent` (the student's own
summary and `/v1/student/me`), `src/ai`, `src/content`, `src/notifications`, `src/push`,
`src/fees`, `src/whiteboards`, `src/recordings`. Lesson playback is shared with the other apps:
[`packages/kinetix_lesson`](../../packages/kinetix_lesson).

## Phase 1 (built)

| Area | Behaviour | API |
|---|---|---|
| Sign in | Institution code + email or phone + password, as in the Parent App. Institution, login and server are remembered; the session is restored on launch. Only accounts with the **student** role and a linked student record get in. Parents are pointed to the Parent app, teachers to the Teacher app, an unlinked login to the college office. | `POST /v1/auth/login`, `GET /v1/me`, `GET /v1/student/me` |
| Navigation | **Today · Learn · Updates · Profile** in a bottom bar on phones (360–430 px), a navigation rail from 600 px; content is centred at up to 720 px on tablets. Text up to 2× fits without overflow. | |
| Today | Greeting with class and roll no. Cards: **Attendance** (percentage over 30 days, attended = present + late + excused, counts, a plain note, the three latest absences, history by day with an "absent or late" filter), **Homework** (upcoming with "Due tomorrow" / "Due Fri 9 Oct", past collapsed, detail), a **Stuck on something?** shortcut to Learn, **Lesson recordings** (missed ones first, marked "You missed this class"; three on Today, the rest under "See all"; the shared player with summary and transcript), **Class boards** (read-only viewer with pages and zoom). Pull to refresh; loading, empty and error states. | `GET /v1/parent/children/:id/summary`, `/attendance` (the student's own id), `GET /v1/whiteboards/:id`, `GET /v1/recordings/:id`, `/events`, `/audio` |
| Learn: Ask a doubt | The student types a doubt and picks the answer language: **English, हिन्दी or ಕನ್ನಡ** (remembered; defaults to the profile language). Optional **Subject** chips ground the answer in that subject's syllabus; the class is always sent. The answer card shows the answer, **Key points**, **Based on** chips for the library topics it drew on (tap to open the topic), and **Ask next** follow-ups (tap to ask). When no AI server is connected the API answers with a preview, and the card says **Preview answer: KINETIX AI isn't connected at your college yet, so this is a sample, not a real explanation.** Errors in plain words: an unsafe question (422) is refused with no retry; the day's allowance used up (429) says it resets tomorrow; AI unreachable (503) or offline offers **Try again**. Earlier questions of the session stay listed. Every answer carries "KINETIX AI can make mistakes. Check important answers with your teacher or textbook." | `POST /v1/ai/explain {question, language, sectionId, subjectId?, topicId?}` |
| Learn: Syllabus | A search bar over every library topic (two letters or more), and **Your subjects** with chapter-by-chapter outlines. A subject not linked to the library says so. A **topic page** shows the course, summary, notes and "After this topic you should be able to…", a note when the curriculum team has not reviewed it yet, and **Ask KINETIX AI about this**, which grounds the question in that topic. | `GET /v1/content/search?q=`, `/syllabus?subjectId=`, `/topics/:id` |
| Updates | Inbox grouped Today / Earlier with an icon per kind (homework, board shared, lesson recording, fee, message from the college), unread dot and tab badge. Tapping marks it read and opens homework → detail, board → viewer, recording → player (with "missed" when the summary says so), payment → receipt, fee due → fees, absence → attendance history; anything else opens in full. Mark all as read. | `GET /v1/notifications`, `POST /v1/notifications/:id/read`, `/read-all` |
| Profile | Name, email or phone, class, roll no., program, college; attendance history; **Fees**: total due (red when something is overdue), every fee with Paid / Due / Part paid / Overdue, payments with **receipts** (receipt no., date and time, method, reference, balance). Read-only, and it says so: *fees are paid by your parent or guardian in the KINETIX Parent app, or at the college fees counter.* The KINETIX AI answer language. *Soon* entries (Timetable, Marks, Library books). Server; sign out (with confirmation). | `GET /v1/fees/students/:id`, `GET /v1/fees/payments/:id/receipt` |
| Push | After sign-in the app registers its push token (`app: 'student'`) and removes it on sign-out, behind a `PushTokenSource` interface. No push SDK is wired in yet, so no token is sent (TODO: Firebase Cloud Messaging). | `POST /v1/push/devices`, `DELETE /v1/push/devices` |

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

## Later phases (entry points only)

Under **Profile → Coming soon** with a *Soon* badge: **Timetable**, **Marks** (internal
assessment and exam results) and **Library books**. Also planned: push notifications through
Firebase, secure token storage with an app lock, the app's own text in Hindi and Kannada,
quizzes the teacher sends to the class, and a saved history of AI answers across sessions.
