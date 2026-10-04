# Push notifications setup

How the KINETIX apps receive pushes (Firebase Cloud Messaging, which delivers through APNs on iOS). Pushes are optional: without configuration the apps and API run normally and notifications still appear in each app's inbox.

## Teacher App

**Server.** Set `FCM_SERVICE_ACCOUNT` on the API (service-account JSON, inline or a file path). Without it the API uses `NoPushSender`. Pushes carry only ids (`kind`, `notificationId`) and a generic title, never personal data.

**Firebase project.** Register two apps in the same Firebase project:
- Android: package `in.kinetix.kinetix_teacher`.
- iOS: bundle id `in.kinetix.kinetixTeacher`. Upload an APNs auth key (.p8) under *Project settings → Cloud Messaging*.

**Build.** Firebase starts only when every required option is passed with `--dart-define`; otherwise the app uses `NoPush` (see `apps/teacher/lib/core/push.dart`, `FirebaseConfig`). No `google-services.json` or `GoogleService-Info.plist` is needed.

```sh
flutter build apk \
  --dart-define=FIREBASE_API_KEY=… \
  --dart-define=FIREBASE_APP_ID=… \
  --dart-define=FIREBASE_MESSAGING_SENDER_ID=… \
  --dart-define=FIREBASE_PROJECT_ID=… \
  [--dart-define=FIREBASE_IOS_BUNDLE_ID=in.kinetix.kinetixTeacher] \
  [--dart-define=FIREBASE_STORAGE_BUCKET=…]
```

`FIREBASE_APP_ID` is per platform: the Android app id for Android builds, the iOS app id for iOS builds.

**Platform files (already in the repo).**
- Android: `POST_NOTIFICATIONS` permission in `android/app/src/main/AndroidManifest.xml` (Android 13+ asks the teacher).
- iOS: `UIBackgroundModes` → `remote-notification` and `FirebaseAppDelegateProxyEnabled` in `ios/Runner/Info.plist`; `ios/Runner/Runner.entitlements` with `aps-environment` (`development`; Xcode uses `production` for App Store/TestFlight). Enable the *Push Notifications* capability for the App ID in the Apple developer account.

**Behaviour.**
- After sign-in (password or phone OTP) and on session restore, the app asks for notification permission, then registers its token with `POST /v1/push/devices {token, platform, app: "teacher"}`. Rotated tokens are re-registered.
- On sign-out the app calls `DELETE /v1/push/devices {token}` (skipped when the session already expired) and deletes the local FCM token, so the previous teacher's pushes stop.
- Tapping a push opens what it is about: `message` opens the conversation (the `conversationId` comes from the push data or, if absent, from the notification fetched by `notificationId`); `homework`, `marks` and `recording` open their tab; `calendar` opens the calendar; anything else opens Today. The notification is marked read.

**Testing without Firebase.** Tests inject a fake `PushMessaging` (`apps/teacher/test/push_test.dart`).
