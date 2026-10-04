# KINETIX Teacher App

The teacher's phone app (Flutter, Material 3). It shows the day's classes, takes attendance,
assigns homework and connects the teacher to a classroom board without typing a PIN on the
shared screen ([pairing design](../../docs/architecture/board-pairing.md)).
Product spec: [docs/product/teacher-app.md](../../docs/product/teacher-app.md).

## Run it

Start the API first (see the [root README](../../README.md)): `pnpm db:migrate && pnpm db:seed`,
then `node --env-file=.env dist/main.js` in `services/api`.

```bash
cd apps/teacher
flutter pub get
flutter run -d linux      # desktop window sized like a phone (412×892); code entry only, no camera
flutter run -d <android>  # QR scanning works on Android and iOS
flutter test
flutter analyze
```

Sign in with institution code `demo-college`, `anita@demo.kinetix.in` (or `ravi@demo.kinetix.in`),
password `kinetix123`.

**Server address.** The default is `http://localhost:4000`. Tap **Server** under the sign-in
button to change it. On the Android emulator, the host machine is `http://10.0.2.2:4000`.
On a real phone, use your computer's LAN IP. Cleartext HTTP is allowed only for development
(`usesCleartextTraffic` on Android, `NSAllowsLocalNetworking` on iOS).

**Trying the board pairing without a board.** Enrol a board and issue a code with curl, then
type the code in **Connect to board**:

```bash
DT=$(curl -s localhost:4000/v1/devices/enroll -H 'content-type: application/json' \
  -d '{"code":"<enrolment code printed by db:seed>","platform":"android"}' | jq -r .deviceToken)
curl -s -XPOST localhost:4000/v1/devices/me/pairing-codes -H "authorization: Bearer $DT"   # → {"code":"482913",...}
```

Codes last 120 seconds. Outside a timetabled period the board opens a "free session" with no class attached.

## Screens

| Screen | What it does |
|---|---|
| Sign in | Institution code, email or phone, password. Remembers the institution, login and server. |
| Today | Greeting, **Connect to board** card (or **Connected · Room 204 Board** with **End class**), a day strip, and the day's periods. The current period is highlighted as **Now**. Each period has **Take attendance** (✓ once taken). If today has no classes (Sunday), it says so and shows the next teaching day. Attendance opens on the day, not before. |
| Connect to board | Full-screen QR scanner on Android/iOS with **Enter code instead**. Six large digit boxes on every platform. Errors from the server are shown inline. Success shows the board, class, subject and period, with **Done** and **End class**. |
| Attendance | Roster with everyone Present. Tap toggles Absent. Long-press for Late or Excused. **Mark all present**. Summary bar ("10 present · 2 absent") and **Submit**. Marks already taken are reloaded and the button becomes **Update**. |
| Homework | Recent homework you set, with due dates. **Assign homework**: class and subject (from your timetable), title, instructions (2000-character counter), due date. |
| Profile | Name, roles, institution, **Language** (English / हिन्दी / ಕನ್ನಡ), server, sign out. Entry points for later phases (announcements, student doubts, tests) show "coming soon". |

## Code layout

```
lib/
  core/        api.dart (TeacherApi interface + HttpTeacherApi), models.dart, app_state.dart (sign-in, prefs),
               format.dart (dates and times per language), l10n.dart (AppLocalizations helpers)
  l10n/        app_en.arb (template), app_hi.arb, app_kn.arb → generated AppLocalizations
  features/    sign_in, home (NavigationBar shell), today, attendance, board (connect + QR scanner), homework, profile
  widgets/     shared bits (ErrorBanner, Pill)
test/          widget tests against FakeTeacherApi
```

## Languages

English, Hindi and Kannada via Flutter gen-l10n. The app follows the teacher's
`preferredLanguage` from `GET /v1/me`; **Profile → Language** overrides it on this phone and saves
it to the account (`PATCH /v1/me`). Before sign-in it follows the device (hi or kn, else English).
See [docs/i18n/teacher.md](../../docs/i18n/teacher.md) for adding strings and what needs review.

State is plain `ChangeNotifier` controllers rendered with `ListenableBuilder`. The design
system is [`packages/kinetix_ui`](../../packages/kinetix_ui) (light and dark, follows the system setting).

## Known gaps

- The token is in `shared_preferences`. It should move to secure storage (Keystore/Keychain), with an app lock.
- No offline pairing (BLE/LAN credential) and no offline queue for attendance yet.
- The lesson player (`packages/kinetix_lesson`) is still English only; the rest of the app is in English, Hindi and Kannada ([docs/i18n/teacher.md](../../docs/i18n/teacher.md)).
- No live updates: the Today screen refreshes on pull-to-refresh and after actions, not when the board ends a session.
