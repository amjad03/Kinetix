# ZYNETIX mobile apps: user guide and store submission checklist

The four Flutter apps are the Teacher App (`apps/teacher`), the Student App (`apps/student`), the Parent App
(`apps/parent`) and the Board (`apps/board`, Android panels and Windows). This page covers what the mobile pass added:
how people use it, how it works and what must be set up before the apps go to the stores. Per-app guides:
`teacher-app.md`, `student-app.md`, `parent-app.md`, `board-features.md`. Release mechanics: `docs/operations/mobile-release.md`.

## For people using the apps

### Staying signed in, and signing out

- Signing in on a phone keeps you signed in for up to 60 days of use. You do not have to sign in again every
  12 hours: the app quietly renews its session when the short-lived access token runs out.
- **Profile → Sign out** ends the session on the server too, so a lost phone cannot keep using it. Signing out also
  removes everything the app kept on the phone for you: the saved screens for offline use, attendance or marks
  waiting to be sent (Teacher App), downloads and offline lessons (Student and Parent Apps).
- If the same sign-in is used twice at once from a copied phone, the server ends it and everyone signs in again.

### Updates

- When your version is too old to work with the server, the app shows only an **Update the app to continue**
  screen, with a button to the store.
- When a newer version is available, a banner says so at the top. Tap **Later** to hide it until the next start.

### Notification settings

**Profile → Notification settings**:

- Turn phone alerts off for a kind of notification (for example Homework or Library). Everything still reaches the
  in-app inbox; only the phone stops buzzing for that kind.
- **Quiet hours**: alerts that arrive between the two times wait until quiet hours end. Emergencies always ring.
- Settings belong to your account, so they follow you to a new phone.

### Working offline

- The Teacher, Student and Parent Apps keep the last answer of their main screens (Today, timetable, notifications,
  profile and the role's core lists). With no connection they open with that saved information and a bar at the
  bottom: **You are offline. Showing what was saved on this phone.** Pull to refresh once you are back online.
- **Teacher App**: attendance and marks saved with no connection are kept on the phone (**Saved on this phone. It
  will be sent when you are back online.**) and sent in order as soon as the server answers again, even after the
  app restarts. A newer save of the same register or assessment replaces an older one still waiting. If the server
  refuses a waiting change (for example the register was locked meanwhile), it is dropped, not retried forever.

### Screenshots

Payslips, marks entry, results, report cards, fees, gate passes and the attendance code block screenshots and screen
recording on Android while they are open (they also show blank in the recent-apps view).

### Smart board

- **Tools → Attendance code** shows the open class's self-mark code full screen (QR and eight digits) for students
  to scan with the Student App. It changes every 30 seconds, so a photo sent to someone at home is already stale.
  With no class on in the room it says so.
- **Tools → Notices** opens the between-classes screensaver: the time, institution and room, the period on now and
  next, and notices sent to boards (emergencies first). It refreshes every minute; touch it to go back.

## How it works (for developers)

Shared code lives in `packages/zynetix_ui/lib/src/mobile_core.dart`; each app passes its own words from its arb files
(`lib/core/mobile.dart` → `mobileStrings()`).

| Piece | Where | Server contract |
|---|---|---|
| Refresh and one retry on 401 | `KxTokenRefresher`; each app's HTTP client (`_request` / `_send`) | every request sends `x-zynetix-client: mobile`; `POST /v1/auth/refresh` rotates; 409 `REFRESH_RACE` keeps the token, other refusals drop it and sign out |
| Refresh token storage | Teacher `SecureStore` key `refresh_token`; Student/Parent `SecureTokenStore.refresh` | — |
| Server sign-out, local wipe | `AppState.signOut` → `signOutServer()` (straight to the client, so a 401 cannot loop) → key store → `wipeLocal` (`kxWipeLocalFiles`) | `POST /v1/me/sign-out` |
| Version gate | `KxVersionGate` around `home`, `kxCheckVersion` | `GET /v1/public/app-versions/check` |
| Crash reports | `KxCrashReporter.install()` in `main.dart` (FlutterError.onError, PlatformDispatcher.onError), scrubbed on the phone by `kxScrubCrashText`, once per error per run | `POST /v1/public/client-errors` (scrubbed again on the server) |
| Notification settings | `KxNotificationSettingsScreen`, per-app kind list `kNotificationKinds` | `GET/PUT /v1/me/notification-preferences` |
| Offline reads | `KxReadCache` (files under app support `zynetix/reads`), path allow-list per app (`_cached`) | GET responses |
| Offline writes (Teacher) | `KxWriteQueue` (`zynetix/outbox.json`), `queueAttendance` / `queueMarks`, flushed after any successful request and at start | `POST /v1/attendance`, `PUT /v1/assessments/:id/marks` |
| Screenshot protection | `KxSecureScreen` → method channel `in.zynetix/secure_screen` → `MainActivity.kt` `FLAG_SECURE` | — |
| Board screensaver / attendance code | `apps/board/lib/features/screensaver/screensaver.dart`, drawer entries in `board_extras.dart` | `GET /v1/devices/me/idle` (device token), `POST /v1/classroom/attendance-qr` (board session) |

Release builds must pass the app version so the version gate and crash reports know it:
`--dart-define=ZYNETIX_APP_VERSION=<pubspec version>` (default `0.1.0`, `lib/core/mobile.dart`). The Board reports
`kBoardVersion` (`core/app_info.dart`).

Tests: `packages/zynetix_ui/test/mobile_core_test.dart` (refresh single-flight and refusal, wipe, version gate,
crash reporter and scrubbing, notification settings, cache, queue across a restart, offline banner, FLAG_SECURE
nesting); `apps/{teacher,student,parent}/test/mobile_session_test.dart` (header, 401 → refresh → retry once, refused
refresh signs out once, offline cache, sign-out on the server and wipe; Teacher: attendance queued offline and sent
later); `apps/board/test/screensaver_test.dart`.

## Not done yet (see `docs/requirements/MOBILE_APPS_COMPLETENESS.md`)

- Biometric / device-PIN app lock: `local_auth` is not in the offline pub cache of this environment; needs
  `local_auth` plus `FlutterFragmentActivity` in each `MainActivity.kt`.
- iOS screenshot cover (app-switcher blur) and iOS screenshot detection: only Android `FLAG_SECURE` is wired.
- Offline write queue for the Student and Parent Apps (they have little to write offline); conflict check on replay
  beyond "server refuses → drop".
- The Board's version gate and crash reporter (the Board app has its own update path through the fleet console).
- A full accessibility sweep (`meetsGuideline` on every main screen); the new screens are checked at text scale 2.0
  and 320 dp.

## Store submission checklist

Items marked **(account)** need a real Firebase project, Google Play Console or Apple Developer / App Store Connect
account and cannot be done from the repository.

### Before the first upload

- [ ] **(account)** Firebase project per environment; Android `google-services` values and iOS `GoogleService-Info`
      passed as dart-defines (`docs/product/push-setup.md`); APNs key uploaded to Firebase.
- [ ] **(account)** Play Console app records `in.zynetix.teacher`, `.student`, `.parent`, `.board`; upload key and
      Play App Signing enrolled; keystore in CI secrets (`docs/operations/mobile-release.md`, Android signing).
- [ ] **(account)** App Store Connect records and bundle ids; replace the placeholder iOS store links seeded in
      `app_releases` (`PUT /v1/platform/app-releases`).
- [ ] Release build passes `ZYNETIX_API_URL` (HTTPS) and `ZYNETIX_APP_VERSION` matching `version:` in `pubspec.yaml`.
- [ ] `app_releases` rows set for each app and platform: `minVersion` (forced update) and `latestVersion`
      (recommended), `storeUrl` (https only).
- [ ] Crash reports reach `GET /v1/platform/client-errors` from a release build (trigger a test error in a staging
      build; check no names, phone numbers or emails appear).

### Store listing and privacy

- [ ] **(account)** Play **Data safety** form: account info (name, email, phone) collected for app function, not
      shared; crash logs collected (no personal data, scrubbed); device id hashed on the server; data deleted on
      sign-out from the phone; encryption in transit.
- [ ] **(account)** App Store **privacy nutrition labels** with the same answers; add `PrivacyInfo.xcprivacy`
      (required-reason APIs: `UserDefaults` via shared_preferences, file timestamps via path_provider).
- [ ] Privacy policy URL (`docs/product/privacy-notice.md` published on the institution's site).
- [ ] Permission rationale strings checked (camera: attendance scan and photos; location: Teacher driver mode only;
      notifications).
- [ ] Children: Student App audience declared (13+ for colleges; school deployments need Families policy review).
- [ ] Screenshots: phone 6.7" and 5.5" (iOS), phone and 7"/10" tablet (Play); demo builds
      (`--dart-define=ZYNETIX_DEMO=true`, `docs/product/demo-builds.md`) give sample data without a server.

### Every release

- [ ] `flutter analyze` and `flutter test` green in all four apps; `services/api` e2e `mobile-pass.e2e.spec.ts` green.
- [ ] Version bumped in `pubspec.yaml`; `ZYNETIX_APP_VERSION` matches; raise `minVersion` only when the old version
      can no longer work with the server.
- [ ] Sign in, wait past the access-token expiry (or shorten it on staging), use the app: no sign-in prompt.
- [ ] Sign out: the server session ends (`auth.sign_out` audit), the app reopens on sign-in with nothing cached.
- [ ] Airplane mode: the Teacher App opens on Today with the offline bar; attendance saved offline is sent on reconnect.
- [ ] Android: screenshot on a payslip / results screen is blocked.
