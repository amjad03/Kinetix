# KINETIX Student App

The student's phone app (Flutter, Material 3). It shows the student's day (attendance, homework
due soon, lesson recordings with the missed ones first, boards teachers shared after class),
lets them ask **KINETIX AI** to explain a doubt in English, हिन्दी or ಕನ್ನಡ, browse and search
the syllabus library, read their updates, and see their fees and receipts.
It looks and behaves like its sister apps, [the Parent App](../parent) and [the Teacher App](../teacher).
Product spec: [docs/product/student-app.md](../../docs/product/student-app.md).

## Run it

Start the API first (see the [root README](../../README.md)): `pnpm db:migrate && pnpm db:seed`,
then `node --env-file=.env dist/main.js` in `services/api`.

```bash
cd apps/student
flutter pub get
flutter run -d linux      # desktop window sized like a phone (412×892)
flutter run -d <android>  # or an iOS device / simulator
flutter test
flutter analyze
```

Sign in with institution code `demo-college`, `aarav@demo.kinetix.in`, password `kinetix123`
(Aarav Patel, BCom Sem 3 A). Parent, teacher and staff logins are refused politely and pointed
to their own app.

**Server address.** The default is `http://localhost:4000`. Tap **Server** under the sign-in
button to change it. On the Android emulator, the host machine is `http://10.0.2.2:4000`.
Cleartext HTTP is allowed only for development (`usesCleartextTraffic` on Android,
`NSAllowsLocalNetworking` on iOS).

**Filling the inbox.** The seed writes notifications for parents only. To see student updates,
set homework as `anita@demo.kinetix.in` (`POST /v1/homework`), record a counter payment as
`accounts@demo.kinetix.in` (`POST /v1/fees/invoices/:id/payments`, which gives Aarav a receipt),
or send a broadcast as `principal@demo.kinetix.in`. Shared boards and lesson recordings come
from the Board app (see the Parent App README).

**KINETIX AI.** Without an AI server configured on the API (`AI_BASE_URL`), answers come back
as previews; the app labels them **Preview answer** and says no AI server is connected.

## Screens

| Screen | What it does |
|---|---|
| Sign in | Institution code, email or phone, password; a 10-digit Indian number is sent as `+91…`. Remembers the institution, login and server. Needs the **student** role and a linked student record; others get a polite explanation. |
| Today | Greeting with class and roll no., then **Attendance** (big percentage, counts, plain note, latest absences, history), **Homework** (due dates in words, past collapsed, detail), a **Stuck on something?** shortcut to Learn, **Lesson recordings** (missed first, "You missed this class", player), **Class boards** (read-only viewer). Pull to refresh. |
| Learn → Ask a doubt | Question box, **Answer in** English / हिन्दी / ಕನ್ನಡ (remembered), optional **Subject** chip for syllabus grounding. The answer card shows the question, a **Preview answer** notice when no AI server is connected, the answer, **Key points**, **Based on** topic chips (open the topic), **Ask next** follow-ups (tap to ask), and a "can make mistakes" line. Clear messages for unsafe questions (422), the day's allowance used up (429), and AI or network unreachable (503 / offline, with **Try again**). Earlier questions of the session stay listed. The view scrolls to the answer. |
| Learn → Syllabus | Search every library topic, or open **Your subjects** for chapter-by-chapter outlines. A topic page shows its summary, notes and "After this topic you should be able to…", with **Ask KINETIX AI about this** (questions grounded in that topic). |
| Updates | Inbox grouped Today / Earlier with an icon per kind and unread dots; a badge on the tab. Tapping marks it read and opens the homework, board, recording (player), attendance history (absence), receipt (payment) or fees (fee due), else the full message. Mark all as read. |
| Profile | Name, class, roll no., program, college; attendance history; **Fees** (total due, overdue, every fee, payments and receipts; read-only: fees are paid by the parent or at the counter); the KINETIX AI answer language; *Soon* entries; server; sign out. |

Phones from 360 to 430 px wide use a bottom navigation bar; from 600 px (tablets) the
destinations move to a navigation rail and content is centred at up to 720 px. Tests check the
main flows at 360×640 and 430×932 with text at 1× and 2× for overflow.

## Code layout

```
lib/
  core/        api.dart (StudentApi + HttpStudentApi + StudentLessonSource), models.dart,
               app_state.dart (sign-in, prefs, AI language), study.dart (summary, subjects, lookups),
               push.dart (PushTokenSource, PushRegistrar), format.dart (dates, rupees)
  features/    sign_in, shell (bar / rail), today, learn (ask controller and view, syllabus, topic),
               attendance, homework, recordings, boards, updates, fees (fees, receipt), profile
  widgets/     shared bits (ErrorBanner, Pill, SectionCard, CenteredSliver, BulletLine, Tone colours)
test/          widget tests against FakeStudentApi
```

State is plain `ChangeNotifier` controllers rendered with `ListenableBuilder`, as in the Parent
App. Design system: [`packages/kinetix_ui`](../../packages/kinetix_ui); boards render with
`WhiteboardView` from [`packages/kinetix_ink`](../../packages/kinetix_ink); lessons play with
[`packages/kinetix_lesson`](../../packages/kinetix_lesson).

## Known gaps

- **Push notifications**: `PushRegistrar` registers a token with `POST /v1/push/devices`
  (`app: 'student'`) after sign-in and removes it on sign-out, but `NoPushTokenSource` has no
  token until Firebase Messaging is added (TODO in `lib/core/push.dart`). Updates refresh when
  the tab is opened or pulled.
- **Subjects**: there is no "subjects of my class" endpoint for students. The app finds subjects
  through homework (`GET /v1/homework/:id` carries the subject id), so a subject with no
  homework yet does not appear under Your subjects or as a subject chip. Search covers it.
- The token is in `shared_preferences`; it should move to secure storage, with an app lock.
- Receipts are shown on screen; there is no PDF download yet.
- The app's own text is English only; KINETIX AI answers in English, Hindi or Kannada.
