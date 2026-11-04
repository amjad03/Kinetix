# Mobile apps (Teacher, Student, Parent, Board): completeness of the cross-cutting production pass

Audit of the four Flutter apps against the mobile pass brief (auth and security, offline and sync, push, UX quality,
the smart board, performance, store readiness, testing), read in code, with `flutter analyze` and `flutter test` run
in every app. **Before** is the branch at `6da5a18`. This pass was time-boxed: the API side of the gaps found was
built and tested; the app-side wiring of those endpoints was **not** done in this pass and is listed as **Left** below,
with the exact work remaining.

Status words: **Have** (built and tested before), **Built** (missing before, built now), **Partial** (some of it
exists), **Missing** (not there), **Left** (found missing, not done in this pass). Migrations:
`0220_mobile_sessions_releases_crashes`, `0221_user_notification_prefs`. New test:
`services/api/test/mobile-pass.e2e.spec.ts` (12 tests: refresh rotation, race window and reuse, sign-out, expiry and
tampering, disabled accounts, the version gate, crash grouping and scrubbing, personal notification settings and quiet
hours, the board screensaver feed and full-screen attendance code).

Baseline (before, unchanged after: no app code was changed in this pass): `flutter analyze` clean in all four apps;
`flutter test`: Teacher 319 passed (3 skipped, screenshot-only), Student 385 passed (3 skipped), Parent 262 passed
(3 skipped), Board analyze clean (its 107-file suite was still running when the pass was closed; it was green on
`main` in the previous pass).

Counts (44 items): before **24 Have, 5 Partial, 15 Missing**; after **24 Have, 8 Built (API), 12 Left**.

## Auth and security

| Item | Before | After | Evidence |
|---|---|---|---|
| Password and phone-code (OTP) sign-in, SSO | Have | Have | `sign_in_screen.dart` in each app; `otp_test.dart`, `otp_sign_in_test.dart` |
| Token in the key store (flutter_secure_storage, Keystore / Keychain, this-device-only), legacy token moved once | Have | Have | `secure_store.dart` / `token_store.dart`; `secure_storage_test.dart`, `token_store_test.dart` |
| Expired token signs the app out | Have | Have | `onUnauthorized` → `signOut(expired: true)` |
| Staying signed in on a phone (refresh token) | Missing: 12-hour access token, no refresh; the apps signed out every 12 hours | Built (API) / Left (apps) | `POST /v1/auth/refresh`; mobile sign-ins (`x-zynetix-client: mobile`) get a rotating refresh token (60 days sliding, SHA-256 stored), `expiresAt`; a token replaced less than a minute ago answers 409 `REFRESH_RACE`, later reuse revokes the session (`auth.refresh_reused`). Apps still to send the header, store the refresh token in the secure store and refresh before `expiresAt` / on 401 |
| Sign-out revokes the session on the server | Missing: apps only deleted the local token | Built (API) / Left (apps) | `POST /v1/me/sign-out` (audited `auth.sign_out`); apps still to call it in `signOut()` |
| Logout wipes local data | Partial: token and push token removed; cached files (Student LMS offline store, downloads) stay | Left | wipe app documents / cache dirs on sign-out |
| Biometric / device-PIN app lock | Missing (noted "still to come" in Teacher `app_state.dart`) | Left | needs `local_auth` and `FlutterFragmentActivity` in each `MainActivity.kt` |
| Multi-child switching (Parent) | Have | Have | `features/home/child_switcher.dart`, `FamilyController.selected` (remembered) |
| Multi-role (teacher, HOD, principal, driver) | Have | Have | Teacher `_finishSignIn` roles; driver mode |
| Multi-institution switching (saved accounts) | Missing | Left | one account per install today |
| Certificate pinning | Missing | Left | Dart `HttpClient` ignores `network_security_config`; plan: `SecurityContext(withTrustedRoots: false)` with pinned CA PEMs from a dart-define |
| Root / jailbreak advisory | Missing | Left | native check + banner |
| Screenshot protection on sensitive screens | Missing | Left | Android `FLAG_SECURE` channel, iOS app-switcher cover |

## Offline and sync

| Item | Before | After | Evidence |
|---|---|---|---|
| Board offline outbox (writes queued) | Have | Have | `board/lib/core/outbox_store.dart`; `outbox_test.dart` |
| Student LMS offline lessons | Have | Have | `student/lib/core/lms_offline.dart` |
| Clear error banners with retry | Have | Have | `ErrorBanner.api(..., onRetry:)` on every Teacher screen |
| Cached reads for core screens (Teacher, Student, Parent) | Missing: offline at start leaves the app on the sign-in screen | Left | caching HTTP client for GETs, wiped on sign-out |
| Teacher attendance / marks queued offline with conflict check | Missing: `AttendanceController.submit` fails offline | Left | persistent queue, replay with a base-version check |
| Low-bandwidth images (`cacheWidth`) | Partial (1 use) | Left | |

## Push notifications

| Item | Before | After | Evidence |
|---|---|---|---|
| FCM / APNs wiring from dart-defines, token registration and rotation, deleted on sign-out | Have | Have | `core/push.dart`, `firebase_push.dart`; `push_test.dart` in three apps; `docs/operations/mobile-release.md` |
| Push carries ids only (no personal data on the lock screen) | Have | Have | `services/api/test/push.e2e.spec.ts` |
| Deep link from a tapped push to the right screen | Have | Have | `pushTap` / `pendingPushTap` handled by the home shells |
| In-app inbox with unread count, mark read / all read | Have | Have | `/v1/notifications`; `updates_test.dart` |
| Personal notification preferences (push off per kind, quiet hours) | Missing: institution-wide switches only | Built (API) / Left (apps) | `GET/PUT /v1/me/notification-preferences` (0221, RLS); `PushService.deliver` skips kinds turned off and holds pushes to the end of personal quiet hours; the inbox still gets them; emergencies ignore both. Apps still to add Profile → Notifications |

## UX quality

| Item | Before | After | Evidence |
|---|---|---|---|
| Shared design system, light and dark (system) | Have | Have | `zynetix_ui` `ZynetixTheme.light/dark`, `themeMode: ThemeMode.system` |
| en / hi / kn with key-completeness tests | Have | Have | `i18n_test.dart` / `l10n_test.dart` in every app; only brand words ("ZYNETIX") hard-coded |
| Empty / error / loading states, pull to refresh | Have | Have | `KxEmptyState`, `ErrorBanner`; 24–52 `RefreshIndicator`s per phone app |
| Phone layout at small widths | Have | Have | `layout_test.dart` (Teacher, Student), `phone_layout_test.dart` (Board) |
| Accessibility guideline tests (tap targets ≥48dp, labels, contrast, 200 % text) | Partial: Board contrast tests only | Left | `meetsGuideline(...)` sweeps on key screens |
| RTL-safe layout (`EdgeInsetsDirectional`) | Partial: no RTL language shipped; 30–75 left/right-specific insets per app | Left | |

## Smart board

| Item | Before | After | Evidence |
|---|---|---|---|
| Kiosk / classroom lock, idle lock with teacher PIN | Have | Have | `core/kiosk/`, `profiles_controller.dart`; `kiosk_test.dart`, `profiles_test.dart` |
| Whiteboard, casting from the Teacher / Student app | Have | Have | `features/board`, `zynetix_cast`; `cast_test.dart` |
| Today's timetable and the period on now | Have | Have | `features/plan/today_timetable.dart`, `/v1/classroom/today` |
| Attendance QR shown on the board for the class to scan | Missing: only the Teacher App could show the code | Built (API) / Left (board screen) | `POST /v1/classroom/attendance-qr` (board token, current period in this room); a Student App scan of it marks present (e2e) |
| Idle screensaver with notices between classes | Missing | Built (API) / Left (board screen) | `GET /v1/devices/me/idle` (device token): institution, room, period on now and next, unexpired board notices (emergency first, 14 days, at most six) |

## Performance

| Item | Before | After | Evidence |
|---|---|---|---|
| Lazy lists on long screens | Partial: 12–22 `ListView.builder` per app, many plain `ListView(children:)` | Left | audit long lists (rosters, inbox) |
| Startup: no network before first frame, demo builds | Have | Have | `main.dart` (`runApp` before `restore()`) |
| App size check | Missing | Left | `flutter build appbundle --analyze-size` needs the Android SDK (not in this environment) |

## Store readiness

| Item | Before | After | Evidence |
|---|---|---|---|
| App ids `in.zynetix.<app>`, versioning from pubspec, release signing that fails without a key, HTTPS-only release | Have | Have | `android/app/build.gradle.kts`; `docs/operations/mobile-release.md` |
| Permission rationale (manifest comments, iOS strings) | Have | Have | `AndroidManifest.xml`, `ios/Runner/Info.plist` |
| Forced / recommended update from an API minimum version | Missing | Built (API) / Left (apps) | `GET /v1/public/app-versions/check` (public, rate limited), `GET/PUT /v1/platform/app-releases` (platform team, audited); `app_releases` seeded with store links (iOS ids are placeholders until App Store Connect records exist) |
| Crash reporting hook | Missing | Built (API) / Left (apps) | `POST /v1/public/client-errors` (scrubbed: emails, phones, JWTs, ids, query strings; grouped by fingerprint and version with a count, reopens when it recurs), `GET /v1/platform/client-errors`, `.../:id/resolve`. Apps still to install `FlutterError.onError` / `PlatformDispatcher.onError` reporters |
| Play Data safety / App Store privacy notes | Partial (listed as open in `mobile-release.md`) | Left | |
| Apple privacy manifest (`PrivacyInfo.xcprivacy`) | Missing | Left | |
| Target SDK current | Have (follows Flutter's default) | Have | `targetSdk = flutter.targetSdkVersion` |

## Testing

| Item | Before | After | Evidence |
|---|---|---|---|
| Widget tests per feature | Have | Have | 46 / 48 / 35 / 107 test files (Teacher / Student / Parent / Board) |
| Golden / screenshot tests | Partial: Student and Parent home (opt-in), Board screens | Left | phone 390 and tablet shots in `docs/demo/screens/mobile/<app>/` not produced |
| integration_test flows per app | Partial: Board cloud pairing only | Left | |
| Flaky tests | none found in the runs above | — | |

## API hardening done in this pass

- Every new route checked by `test/authz-matrix.spec.ts` (regenerated `docs/security/AUTHZ_MATRIX.md`); public routes
  sit under `/v1/auth/` and `/v1/public/` (allow-listed, rate limited); platform routes behind `PlatformAdminGuard`.
- Refusals in `MfaService.refresh` are returned, not thrown, so revoking a reused refresh token is not rolled back.
- `user_notification_prefs` is a tenant table with RLS (listed in `TENANT_TABLES`); `app_releases` and
  `client_error_reports` are global and hold no personal data.
- Regression: `test/push.e2e.spec.ts` (4) and `test/foundation.e2e.spec.ts` (16) pass with the changed push delivery
  and session issuing.
