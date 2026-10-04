import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

/// A tapped push: the notification it announces. The API sends only ids (no personal data on the
/// lock screen); the app looks up the rest.
class PushTap {
  const PushTap({required this.kind, this.notificationId, this.data = const {}});

  /// The notification kind (services/api notification_kind): message, homework, recording…
  final String kind;
  final String? notificationId;

  /// Everything the push carried, for ids a newer API may add (such as conversationId).
  final Map<String, String> data;

  static PushTap? fromData(Map<String, dynamic> data) {
    final kind = data['kind'];
    if (kind is! String) return null;
    return PushTap(
      kind: kind,
      notificationId: data['notificationId'] as String?,
      data: {for (final e in data.entries) e.key: '${e.value}'},
    );
  }
}

/// The phone's push service (FCM, which delivers through APNs on iOS). [NoPush] when the build has
/// no Firebase configuration; tests use a fake.
abstract class PushMessaging {
  /// `android` or `ios`, as POST /v1/push/devices expects.
  String get platform;

  /// Asks for permission to show notifications (Android 13+, iOS). True when allowed.
  Future<bool> requestPermission();

  /// This install's push token, or null when push is unavailable.
  Future<String?> token();

  /// A new token after the push service rotated it.
  Stream<String> get tokenRefreshed;

  /// The push that launched the app from the terminated state, if any (once).
  Future<PushTap?> initialTap();

  /// Pushes tapped while the app was running in the background.
  Stream<PushTap> get taps;

  /// Forgets this install's token, so pushes for the previous teacher stop at once.
  Future<void> deleteToken();
}

/// Push off: the build has no Firebase options.
class NoPush implements PushMessaging {
  @override
  String get platform => defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android';
  @override
  Future<bool> requestPermission() async => false;
  @override
  Future<String?> token() async => null;
  @override
  Stream<String> get tokenRefreshed => const Stream.empty();
  @override
  Future<PushTap?> initialTap() async => null;
  @override
  Stream<PushTap> get taps => const Stream.empty();
  @override
  Future<void> deleteToken() async {}
}

/// Firebase options from `--dart-define`s, so builds and tests work without Firebase:
///
///     flutter run --dart-define=FIREBASE_API_KEY=… --dart-define=FIREBASE_APP_ID=… \
///       --dart-define=FIREBASE_MESSAGING_SENDER_ID=… --dart-define=FIREBASE_PROJECT_ID=… \
///       [--dart-define=FIREBASE_IOS_BUNDLE_ID=…] [--dart-define=FIREBASE_STORAGE_BUCKET=…]
///
/// The app id differs per platform (Android and iOS apps are registered separately in Firebase).
class FirebaseConfig {
  static const apiKey = String.fromEnvironment('FIREBASE_API_KEY');
  static const appId = String.fromEnvironment('FIREBASE_APP_ID');
  static const messagingSenderId = String.fromEnvironment('FIREBASE_MESSAGING_SENDER_ID');
  static const projectId = String.fromEnvironment('FIREBASE_PROJECT_ID');
  static const iosBundleId = String.fromEnvironment('FIREBASE_IOS_BUNDLE_ID');
  static const storageBucket = String.fromEnvironment('FIREBASE_STORAGE_BUCKET');

  /// Null unless every required value was given.
  static FirebaseOptions? get options {
    if ([apiKey, appId, messagingSenderId, projectId].any((v) => v.isEmpty)) return null;
    return FirebaseOptions(
      apiKey: apiKey,
      appId: appId,
      messagingSenderId: messagingSenderId,
      projectId: projectId,
      iosBundleId: iosBundleId.isEmpty ? null : iosBundleId,
      storageBucket: storageBucket.isEmpty ? null : storageBucket,
    );
  }
}

/// Starts Firebase when the build is configured for it, else returns [NoPush]. Never throws:
/// a phone without Google Play services simply gets no pushes.
Future<PushMessaging> startPush() async {
  final options = FirebaseConfig.options;
  if (options == null || kIsWeb) return NoPush();
  try {
    await Firebase.initializeApp(options: options);
    return FirebasePush(FirebaseMessaging.instance);
  } catch (e) {
    debugPrint('Push is off: Firebase did not start ($e)');
    return NoPush();
  }
}

class FirebasePush implements PushMessaging {
  FirebasePush(this._messaging);

  final FirebaseMessaging _messaging;

  @override
  String get platform => defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android';

  @override
  Future<bool> requestPermission() async {
    final s = await _messaging.requestPermission();
    return s.authorizationStatus == AuthorizationStatus.authorized || s.authorizationStatus == AuthorizationStatus.provisional;
  }

  @override
  Future<String?> token() async {
    try {
      // iOS hands out an FCM token only once APNs has registered the phone, which can take a moment.
      if (defaultTargetPlatform == TargetPlatform.iOS) {
        for (var i = 0; i < 5 && await _messaging.getAPNSToken() == null; i++) {
          await Future<void>.delayed(const Duration(seconds: 1));
        }
      }
      return await _messaging.getToken();
    } catch (e) {
      debugPrint('No push token: $e');
      return null;
    }
  }

  @override
  Stream<String> get tokenRefreshed => _messaging.onTokenRefresh;

  @override
  Future<PushTap?> initialTap() async {
    final m = await _messaging.getInitialMessage();
    return m == null ? null : PushTap.fromData(m.data);
  }

  @override
  Stream<PushTap> get taps =>
      FirebaseMessaging.onMessageOpenedApp.map((m) => PushTap.fromData(m.data)).where((t) => t != null).cast<PushTap>();

  @override
  Future<void> deleteToken() => _messaging.deleteToken();
}
