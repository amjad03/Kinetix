# Demo builds (offline sample data)

A demo build of the Teacher, Parent, Student and Board apps runs with no server. Every screen
works against an in-memory copy of **KINETIX Demo College** (the same people and classes as
`services/api/src/db/seed.ts`), so the apps can be installed on a phone or tablet and tried
before anything is deployed.

```sh
cd apps/teacher   # or apps/parent, apps/student, apps/board
flutter build apk --release --dart-define=KINETIX_DEMO=true
```

`KINETIX_API_URL` is not needed (and is ignored) in a demo build. Without `KINETIX_DEMO=true`
nothing changes: a release build without `KINETIX_API_URL` still stops with the "cannot start"
screen (docs/operations/mobile-release.md).

## What the demo shows

- A **"Demo mode"** banner on the sign-in screen with one-tap sign-in:
  - Teacher App: **Anita Sharma** (BCom Sem 3 A: Corporate Accounting and Cost Accounting).
  - Parent App: **Rajesh Patel**, with two children: Aarav (BCom Sem 3 A) and Diya (BCA Sem 1 A).
  - Student App: **Aarav Patel**.
  - Any password works, and phone sign-in accepts any number with the code **123456**.
- A **DEMO** chip at the top of every screen (on the board, in the top bar), so nobody mistakes
  the sample data for real data.
- Sample data around today's date: the timetable (Mon–Sat, Anita's periods as seeded), the
  calendar (Gandhi Jayanti, Dasara holidays, Kannada Rajyotsava, mid-semester exams, sports day,
  Christmas), homework (including a checked hand-in with a remark), marks (Unit test 1), attendance
  history, the Corporate Accounting syllabus with coverage, the year plan and today's lesson plan,
  recordings (one kept, one deleted within a week, the others at the end of the term), a shared board, fees (part-paid tuition, an overdue exam fee and a receipt), library
  loans (Diya's overdue book with a fine), messages between Rajesh and Anita, and consent.
- Changes work for the session and are forgotten when the app is closed: taking attendance,
  assigning and checking homework, handing in work, entering and publishing marks, marking topics
  taught, moving year-plan topics, saving lesson plans, messages, consent, and fee payment through
  the demo gateway.
- KINETIX AI answers (lesson-plan drafts, student questions, the board's AI panel) are sample
  answers, labelled as previews like answers from a server without an AI model.
- About eight seconds after sign-in, a reply "arrives" in the family/teacher chat, to show live
  messages. Push notifications are off.

### The board

The demo board skips enrolment and opens in **BCom Sem 3 A · Corporate Accounting with Anita
Sharma**. Books (syllabus and coverage), Today's plan, the AI panel, 3D models and labs,
attendance, lesson recording and the whiteboard (save and share) all work. After **End class**,
"Sign in" shows a pairing code that the demo teacher "scans" a few seconds later.
**Go live** and **Class audio** say "Not available in the demo".

## Not in the demo

- Playing a recording's audio (the Teacher App says "Not available in the demo" for playback;
  the family apps replay the board strokes without sound).
- Live classes, live view and class audio; push notifications; real payments.
- Photos attached to hand-ins are not shown back from the "server".

## Installing next to a real build

A demo build has the same application id as the real app, so it replaces it on the phone.
Uninstall the demo (or clear its data) before installing a real build.

## Signing test APKs

Release builds need the upload key (docs/operations/mobile-release.md). For throwaway test APKs
built in CI without that key, ask for test signing:

```sh
flutter build apk --release --dart-define=KINETIX_DEMO=true -Pkinetix.testSigning=true
# or: KINETIX_TEST_SIGNING=true flutter build apk --release …
```

When no release key is configured (no `KINETIX_ANDROID_KEYSTORE_*` variables and no
`android/key.properties`), the APK is then signed with the debug key and Gradle prints a loud
warning. Never publish such an APK or give it to users. Without the flag, a release build with no
key still fails as before; with a key configured, the flag changes nothing.

## For developers

- The demo backends live in each app's `lib/demo/`: `fake_api.dart` (the in-memory fakes, which
  the widget tests also use, so there is one source of truth) and `demo_api.dart` (the seeded
  demo data on top of them); on the board, `demo_server.dart` answers ApiClient's HTTP requests
  in memory and stands in for the realtime connection.
- `Demo.enabled` (lib/demo/demo.dart) is `KINETIX_DEMO` at run time; tests set it to see the demo
  UI. Each app has a `test/demo_test.dart` smoke test.

## Getting the test APKs

The `Test APKs` workflow (.github/workflows/test-apk.yml) builds all four apps in demo mode on
every push to the development branch that touches the apps, and publishes them as the
`test-build` pre-release on the repository's Releases page. Open that page on an Android phone,
download the APK, allow installing apps from the browser when asked, and open it. New builds
install over older ones. Set the repository variable `KINETIX_API_URL` once a server exists to
make the same APKs talk to it as well.
