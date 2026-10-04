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

## Parent App and Student App

Both family apps work the same way; the server side (`FCM_SERVICE_ACCOUNT`) is shared with the Teacher App above.

**Firebase project.** Register the apps in the same Firebase project:

| App | Android package | iOS bundle id | `app` sent to the API |
|---|---|---|---|
| Parent | `in.kinetix.kinetix_parent` | `in.kinetix.kinetixParent` | `parent` |
| Student | `in.kinetix.kinetix_student` | `in.kinetix.kinetixStudent` | `student` |

**Build.** Firebase starts only when `FIREBASE_API_KEY`, `FIREBASE_APP_ID`, `FIREBASE_MESSAGING_SENDER_ID` and `FIREBASE_PROJECT_ID` are all passed with `--dart-define` (`FIREBASE_IOS_BUNDLE_ID` optional, for iOS builds), and only on Android and iOS. Otherwise, or if `Firebase.initializeApp` fails, the app uses `NoPushMessaging`: no token, no permission question. See `apps/{parent,student}/lib/core/firebase_push.dart`. No `google-services.json` or `GoogleService-Info.plist` is needed.

```sh
cd apps/parent   # or apps/student
flutter build apk \
  --dart-define=FIREBASE_API_KEY=… \
  --dart-define=FIREBASE_APP_ID=… \
  --dart-define=FIREBASE_MESSAGING_SENDER_ID=… \
  --dart-define=FIREBASE_PROJECT_ID=…
# iOS: flutter build ipa … --dart-define=FIREBASE_IOS_BUNDLE_ID=in.kinetix.kinetixParent
```

`FIREBASE_APP_ID` is the app id of the platform being built.

**Platform files (already in the repo).** `POST_NOTIFICATIONS` in `android/app/src/main/AndroidManifest.xml`; `UIBackgroundModes` → `remote-notification` and `FirebaseAppDelegateProxyEnabled` in `ios/Runner/Info.plist`; `ios/Runner/Runner.entitlements` (`aps-environment`, set as `CODE_SIGN_ENTITLEMENTS` for Debug, Profile and Release). Enable the *Push Notifications* capability for each App ID and upload the APNs key to Firebase.

**Behaviour.**
- **Permission.** After sign-in (and after the privacy question, if any) the app asks once, in its own words and language, "Get updates on this phone?". Only "Turn on" brings up the system prompt (Android 13+ `POST_NOTIFICATIONS`, iOS). Not asked when push is off in the build, when the system already has an answer, or once answered on this phone (`push_asked` in preferences).
- **Registration.** After sign-in (phone code or password) and on session restore, in the background, the app registers its token with `POST /v1/push/devices {token, platform, app}`; a rotated token (`onTokenRefresh`) is registered again. Failures are logged and never shown.
- **Sign-out.** `DELETE /v1/push/devices {token}` while the session is still valid, then the session token is deleted from secure storage and token refreshes are no longer sent.
- **Taps.** Pushes carry only `{notificationId, kind}`. A tap (app running, in the background, or launching it; before sign-in it waits until sign-in) loads the inbox and opens the notification exactly as tapping it in Updates does (homework, attendance, results, fees/receipt, library, recording, board, calendar, conversation, or the full message), marking it read. If it is no longer in the inbox, `kind: message` opens Messages (Parent: the Messages tab; Student: the messages screen, when messaging is available) and anything else opens Updates.
- **Foreground.** A push arriving while the app is open shows no system notification; the app refreshes Updates (and, in the Parent App, Messages).

**Testing without Firebase.** `test/fake_push.dart` (`FakePushMessaging`) drives tokens, rotation, permission answers and taps; see `test/push_test.dart` in each app.
