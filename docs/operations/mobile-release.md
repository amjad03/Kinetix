# Releasing the apps

| App | Package / bundle id | Platforms | Channel |
| --- | --- | --- | --- |
| Teacher | Android `in.kinetix.kinetix_teacher`, iOS `in.kinetix.kinetixTeacher` | Android, iOS | Play (internal → closed → production), App Store (TestFlight) |
| Parent | Android `in.kinetix.kinetix_parent`, iOS `in.kinetix.kinetixParent` | Android, iOS | Play, App Store |
| Student | Android `in.kinetix.kinetix_student`, iOS `in.kinetix.kinetixStudent` | Android, iOS | Play, App Store |
| Board | Android `in.kinetix.kinetix_board` | Windows (interactive flat panels with a PC), Android panels | Installer / APK via MDM — not a store app |

The ids are permanent once published: change them (e.g. to a company-owned domain) **before** the
first upload if `in.kinetix` is not ours. The Flutter SDK is pinned in
[`.github/workflows/flutter.yml`](../../.github/workflows/flutter.yml) (3.47.6); build releases with
the same version. Versions come from `version:` in each `pubspec.yaml` (`x.y.z+build`): bump the
build number for every upload.

## Before the first release (open items)

- **Release signing (Android)**: all four `android/app/build.gradle.kts` still sign release builds
  with the debug key. Add a `key.properties`-based release signing config (keystore never
  committed). Use **Play App Signing**: we keep only the upload key.
- **Server address**: the apps default to `http://localhost:4000` and let the user edit it. Release
  builds should default to `https://<api_domain>` (e.g. a `--dart-define=KINETIX_API_URL=…` read
  with `String.fromEnvironment`) and hide the field outside debug builds; the Board's enrolment
  screen keeps the field but pre-fills it.
- Store listings need a privacy policy URL (docs/product/privacy-notice.md, published), the Play
  **Data safety** form and Apple's privacy labels (phone number, name, school records, audio for
  recordings on the Teacher app/Board; no tracking), and Play's **Families** policy for the
  Student app (children) — target audience and content settings.

## Push notifications (Firebase)

The Parent, Student and Teacher apps read their Firebase options from dart-defines (no
`google-services.json` / `GoogleService-Info.plist` committed):

```bash
flutter build appbundle --release \
  --dart-define=FIREBASE_API_KEY=… \
  --dart-define=FIREBASE_APP_ID=… \
  --dart-define=FIREBASE_MESSAGING_SENDER_ID=… \
  --dart-define=FIREBASE_PROJECT_ID=… \
  --dart-define=FIREBASE_STORAGE_BUCKET=…          # Teacher app
# iOS builds also: --dart-define=FIREBASE_IOS_BUNDLE_ID=in.kinetix.kinetixParent and the iOS FIREBASE_APP_ID
```

Without them the apps run and simply don't register for push. Keep the values in a
`--dart-define-from-file=firebase.<env>.json` per environment (not committed; they are not secret
but are environment-specific). Use one Firebase project per environment; on the server, the matching
service account goes into `kinetix/<env>/fcm` (deploy.md) with `push_enabled = true`. iOS needs an
APNs key uploaded to the Firebase project and the Push Notifications capability. Pushes carry ids
only; Firebase never receives names, marks or messages.

## Android: Play Console

1. Create the three apps (Teacher, Parent, Student) in the Play Console under the company account.
2. Build: `flutter build appbundle --release --dart-define-from-file=firebase.prod.json` in each app.
3. Upload to **Internal testing**; add testers (staff of the pilot institution and us) by email list.
   Internal testing is available in minutes, without review.
4. Promote to **Closed testing** for the pilot institution, then **Production** with a staged
   rollout (10 % → 50 % → 100 %) when stable.

## iOS: TestFlight

1. Apple Developer Program (organisation account), App Store Connect records for the three bundle ids.
2. On a Mac with Xcode: `flutter build ipa --release --dart-define-from-file=firebase.prod.json`,
   upload with Xcode Organizer or `xcrun altool`/Transporter.
3. **Internal testers** (up to 100, App Store Connect users) get builds immediately; **external
   testers** (pilot staff and parents) need a short Beta App Review per version.
4. Submit for App Store review with the privacy labels and a demo account on staging.

## Board

The Board runs on the classroom panel and is installed by us or the institution's IT, not through a
store.

- **Windows panels / OPS PCs**: `flutter build windows --release` produces
  `build/windows/x64/runner/Release/`. Package it as a signed installer (MSIX, or Inno Setup for
  wider compatibility) with a code-signing certificate (an OV/EV certificate from a CA — cost to
  confirm), so SmartScreen does not block it. Install per machine, auto-start on login, and keep
  the panel's Windows updates scheduled outside teaching hours.
- **Android panels**: `flutter build apk --release --split-per-abi` (most panels are arm64-v8a;
  some are armeabi-v7a). Distribute through the institution's MDM (or the panel vendor's
  management console); sideloading by USB is the fallback. Same release keystore as above.
- **Kiosk mode is an open product decision**: locking the panel to the Board app (Windows Assigned
  Access / Android lock-task via MDM) versus letting teachers use other apps. Until decided, the
  app runs full screen without locking the device.
- After installing, enrol each board from ERP → Boards (deploy.md, *Onboarding*).

## Release checklist

1. CI green on `main` (analyze + tests for all apps and packages).
2. Version/build bumped; changelog in the store's "What's new" (English, Hindi, Kannada).
3. Built with the pinned Flutter version, prod dart-defines, release signing.
4. Smoke test on a real device against **staging**: sign in by OTP, push received, live class,
   offline then online sync.
5. Upload to internal testing / TestFlight; pilot sign-off; staged rollout.
