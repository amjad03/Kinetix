# Releasing the apps

| App | Package / bundle id | Platforms | Channel |
| --- | --- | --- | --- |
| Teacher | Android `in.kinetix.teacher`, iOS `in.kinetix.teacher` | Android, iOS | Play (internal → closed → production), App Store (TestFlight) |
| Parent | Android `in.kinetix.parent`, iOS `in.kinetix.parent` | Android, iOS | Play, App Store |
| Student | Android `in.kinetix.student`, iOS `in.kinetix.student` | Android, iOS | Play, App Store |
| Board | Android `in.kinetix.board`, Windows MSIX identity `in.kinetix.board` | Windows (interactive flat panels with a PC), Android panels | MSIX / APK via MDM — not a store app |

The ids are permanent once published: change them (e.g. to a company-owned domain) **before** the
first upload if `in.kinetix` is not ours. The Flutter SDK is pinned in
[`.github/workflows/flutter.yml`](../../.github/workflows/flutter.yml) (3.47.6); build releases with
the same version. Versions come from `version:` in each `pubspec.yaml` (`x.y.z+build`): bump the
build number for every upload.

## Server address (`KINETIX_API_URL`)

Every app takes its API base URL at build time; the realtime (Socket.IO) connection uses the same
address:

```bash
flutter build appbundle --release --dart-define=KINETIX_API_URL=https://api.example.in
```

- **Debug** builds without the define use `http://localhost:4000` (Android emulator: type
  `http://10.0.2.2:4000` in the sign-in screen).
- **Profile and release** builds without it (or with a value that is not an `http(s)://` URL)
  refuse to start: they show "KINETIX cannot start: This build has no server address…" and log
  `ServerConfigError` (`lib/core/server_config.dart` in each app, checked first in `main()`). The
  release workflow also refuses to run without it.
- The address is the *default*: the sign-in screens (Teacher, Parent, Student) still let the user
  change the server, and the Board's enrolment screen is pre-filled with it; a value saved on the
  device wins over the build's default.
- Android release builds of the Teacher, Parent and Student apps are **HTTPS-only**
  (`usesCleartextTraffic` is `true` only in debug/profile, via a manifest placeholder); iOS allows
  plain http only to local addresses (`NSAllowsLocalNetworking`). The Board never allowed plain
  http on Android release builds: an on-premises server needs HTTPS as well.

## Android signing

`android/app/build.gradle.kts` in each app signs **release** builds with our upload key and never
with the debug key; debug and profile builds keep the debug key. Without a key a release build
stops at `preReleaseBuild` with *"Release signing is not configured (…)"*.

Local builds: create the upload keystore once (keep it, and its passwords, in the password manager
— losing it means a Play upload-key reset):

```bash
keytool -genkeypair -v -keystore ~/kinetix-upload.jks -storetype JKS -keyalg RSA -keysize 2048 \
  -validity 10000 -alias upload
```

and write `apps/<app>/android/key.properties` (gitignored, like `*.jks`/`*.keystore`/`*.pfx`):

```properties
# storeFile: absolute, or relative to apps/<app>/android/ (no comments after values)
storeFile=/home/me/kinetix-upload.jks
storePassword=…
keyAlias=upload
keyPassword=…
```

CI (and anyone who prefers env vars) sets `KINETIX_ANDROID_KEYSTORE_BASE64` (`base64 -w0
kinetix-upload.jks`; decoded into `build/app/signing/`) or `KINETIX_ANDROID_KEYSTORE_PATH`, plus
`KINETIX_ANDROID_KEYSTORE_PASSWORD`, `KINETIX_ANDROID_KEY_ALIAS`, `KINETIX_ANDROID_KEY_PASSWORD`;
env vars win over `key.properties`. One upload key can serve all four apps. Enrol every Play app in
**Play App Signing** (Google holds the app signing key; we keep only the upload key). The Board's
APKs are not on Play, so they are signed with the upload key itself: use the same key for every
Board release, or installed boards cannot update.

**R8 / minify is off** for release builds (`isMinifyEnabled = false`, overriding Flutter's
default) because no minified build has been smoke-tested on a device yet. To try it:
`flutter build apk --release -Pkinetix.minify=true …` — plugins ship their own consumer rules
(Firebase, flutter_secure_storage, record, mobile_scanner, pickers); the Parent app's
`android/app/proguard-rules.pro` adds Razorpay's rules. Make it the default only after sign-in,
push, payments (Parent), recording (Board) and live class work on a minified build.

## Before the first release (open items)

- **First real Android release build**: the signing setup was checked in a stub Gradle project
  (key from `key.properties`, from base64 env vars, and the clear failure without a key), but no
  full `flutter build appbundle --release` has run yet (the environment that wrote it had no
  Android SDK). Run the Release workflow (or a local build) once and install the APK on a device.
- **Application ids** are `in.kinetix.<app>` on Android and iOS (permanent once published). The
  Android code namespace is `app.kinetix.<app>`, because `in` is a Java keyword and cannot be a
  package name (the application id may still start with `in.`).
- Code-signing certificate for the Board's Windows installer (below) — buy and set `publisher`.
- Store listings need a privacy policy URL (docs/product/privacy-notice.md, published), the Play
  **Data safety** form and Apple's privacy labels (phone number, name, school records, audio for
  recordings on the Teacher app/Board; no tracking), and Play's **Families** policy for the
  Student app (children) — target audience and content settings.

## Push notifications (Firebase)

The Parent, Student and Teacher apps read their Firebase options from dart-defines (no
`google-services.json` / `GoogleService-Info.plist` committed):

```bash
flutter build appbundle --release --dart-define=KINETIX_API_URL=https://… \
  --dart-define=FIREBASE_API_KEY=… \
  --dart-define=FIREBASE_APP_ID=… \
  --dart-define=FIREBASE_MESSAGING_SENDER_ID=… \
  --dart-define=FIREBASE_PROJECT_ID=… \
  --dart-define=FIREBASE_STORAGE_BUCKET=…          # Teacher app
# iOS builds also: --dart-define=FIREBASE_IOS_BUNDLE_ID=in.kinetix.parent and the iOS FIREBASE_APP_ID
```

Without them the apps run and simply don't register for push. Keep the values in a
`--dart-define-from-file=firebase.<env>.json` per environment (not committed; they are not secret
but are environment-specific). Use one Firebase project per environment; on the server, the matching
service account goes into `kinetix/<env>/fcm` (deploy.md) with `push_enabled = true`. iOS needs an
APNs key uploaded to the Firebase project and the Push Notifications capability. Pushes carry ids
only; Firebase never receives names, marks or messages.

## Android: Play Console

1. Create the three apps (Teacher, Parent, Student) in the Play Console under the company account.
2. Build: `flutter build appbundle --release --dart-define=KINETIX_API_URL=https://… --dart-define-from-file=firebase.prod.json`
   in each app (release signing configured, above), or run the **Release** workflow (below).
3. Upload to **Internal testing**; add testers (staff of the pilot institution and us) by email list.
   Internal testing is available in minutes, without review.
4. Promote to **Closed testing** for the pilot institution, then **Production** with a staged
   rollout (10 % → 50 % → 100 %) when stable.

## iOS: TestFlight

1. Apple Developer Program (organisation account), App Store Connect records for the three bundle ids.
2. On a Mac with Xcode (not built in CI): open `ios/Runner.xcworkspace`, set the **Team** for the
   Runner target (automatic signing; or an App Store distribution certificate + provisioning
   profile with the Push Notifications capability), then
   `flutter build ipa --release --dart-define=KINETIX_API_URL=https://… --dart-define-from-file=firebase.prod.json`
   and upload `build/ios/ipa/*.ipa` with Transporter or `xcrun altool`.
   - Bundle ids `in.kinetix.teacher` / `…Parent` / `…Student`; display names "KINETIX
     Teacher" / "KINETIX Parent" / "KINETIX Student"; minimum iOS 15.0 (what Firebase 12 and
     mobile_scanner 7 need). Version and build from `pubspec.yaml`.
   - Push: the **Release** configuration signs with `Runner/Runner-Release.entitlements`
     (`aps-environment` = `production`); Debug and Profile use `Runner/Runner.entitlements`
     (`development`, APNs sandbox).
3. **Internal testers** (up to 100, App Store Connect users) get builds immediately; **external
   testers** (pilot staff and parents) need a short Beta App Review per version.
4. Submit for App Store review with the privacy labels and a demo account on staging.

## Board

The Board runs on the classroom panel and is installed by us or the institution's IT, not through a
store.

- **Windows panels / OPS PCs**: an MSIX installer built with the `msix` dev dependency
  (`msix_config` in `apps/board/pubspec.yaml`: identity `in.kinetix.board`, capabilities
  `internetClient`, `microphone`, version from `version:`). On a Windows machine with the
  Flutter SDK and Visual Studio (Desktop C++):

  ```bash
  cd apps/board
  flutter build windows --release --dart-define=KINETIX_API_URL=https://…
  dart run msix:create --build-windows false --certificate-path C:\secure\kinetix-codesign.pfx --certificate-password …
  # → build/windows/x64/runner/Release/kinetix_board.msix
  ```

  `publisher` in `msix_config` is a **placeholder** (`CN=KINETIX, O=KINETIX, C=IN`): replace it
  with the exact Subject of the code-signing certificate (an OV/EV certificate from a CA — cost to
  confirm) so SmartScreen and App Installer accept it. Without a certificate
  (`--sign-msix false`) the MSIX only installs on test machines that trust a self-signed one.
  Install per machine (`Add-AppxProvisionedPackage` or the MDM), auto-start on login, and keep
  the panel's Windows updates scheduled outside teaching hours. (`flutter build windows` runs only
  on Windows hosts; the CI job below uses a Windows runner.)
- **Android panels**: `flutter build apk --release --split-per-abi --dart-define=KINETIX_API_URL=https://…` (most panels are arm64-v8a;
  some are armeabi-v7a). Distribute through the institution's MDM (or the panel vendor's
  management console); sideloading by USB is the fallback. Same release keystore as above.
- **Kiosk mode is an open product decision**: locking the panel to the Board app (Windows Assigned
  Access / Android lock-task via MDM) versus letting teachers use other apps. Until decided, the
  app runs full screen without locking the device.
- After installing, enrol each board from ERP → Boards (deploy.md, *Onboarding*).

## CI: the Release workflow

`.github/workflows/release.yml`, run by hand (Actions → Release → Run workflow) with the API URL
(or set the repository variable `KINETIX_API_URL`). It uses the `release` environment; create
these secrets there (or in the repository):

| Secret | What |
| --- | --- |
| `KINETIX_ANDROID_KEYSTORE_BASE64` | upload keystore, `base64 -w0 kinetix-upload.jks` |
| `KINETIX_ANDROID_KEYSTORE_PASSWORD`, `KINETIX_ANDROID_KEY_ALIAS`, `KINETIX_ANDROID_KEY_PASSWORD` | its passwords and alias |
| `FIREBASE_TEACHER_JSON`, `FIREBASE_PARENT_JSON`, `FIREBASE_STUDENT_JSON` | optional: contents of each app's `firebase.prod.json` (without them: no push) |
| `KINETIX_WINDOWS_CERT_BASE64`, `KINETIX_WINDOWS_CERT_PASSWORD` | optional: code-signing `.pfx` for the Board MSIX (without it: unsigned MSIX) |

Jobs: **android** (one per app; Teacher/Parent/Student → `.aab` + universal `.apk`, Board →
per-ABI APKs; skipped with a warning when the keystore secret is missing) and **windows** (Board
MSIX on `windows-latest`). Outputs are workflow artifacts; uploading to Play / TestFlight stays
manual. iOS is not built in CI.

## Release checklist

1. CI green on `main` (analyze + tests for all apps and packages).
2. Version/build bumped; changelog in the store's "What's new" (English, Hindi, Kannada).
3. Built with the pinned Flutter version, `KINETIX_API_URL` + prod Firebase dart-defines, release signing.
4. Smoke test on a real device against **staging**: sign in by OTP, push received, live class,
   offline then online sync.
5. Upload to internal testing / TestFlight; pilot sign-off; staged rollout.
