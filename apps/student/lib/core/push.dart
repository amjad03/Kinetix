import 'package:flutter/foundation.dart';

import 'api.dart';

/// Where the device's push token comes from.
///
/// TODO(push): implement with Firebase Cloud Messaging (firebase_messaging) on Android and APNs
/// via FCM on iOS: ask for notification permission, return `FirebaseMessaging.instance.getToken()`
/// and listen to `onTokenRefresh` (call [PushRegistrar.register] again). The server already
/// sends pushes that carry ids only (see docs/architecture/notifications.md); tapping one should
/// open the Updates tab. Until then the app has no token and refreshes Updates when opened.
abstract class PushTokenSource {
  /// The device token, or null when push is not available (no SDK yet, permission denied,
  /// desktop).
  Future<String?> token();

  /// android, ios or web, as the API expects.
  String get platform;
}

/// No push SDK is wired in yet: never returns a token.
class NoPushTokenSource implements PushTokenSource {
  const NoPushTokenSource();

  @override
  Future<String?> token() async => null;

  @override
  String get platform => switch (defaultTargetPlatform) {
    TargetPlatform.iOS || TargetPlatform.macOS => 'ios',
    _ => 'android',
  };
}

/// Registers the device's push token with the API after sign-in (`app: 'student'`), and removes
/// it on sign-out so the next person to use the phone does not get this student's updates.
class PushRegistrar {
  PushRegistrar(this.api, [this.source = const NoPushTokenSource()]);

  final StudentApi api;
  final PushTokenSource source;

  /// The token registered for the signed-in student, if any.
  String? registeredToken;

  /// Best effort: push is a convenience, so failures never interrupt the student.
  Future<void> register() async {
    try {
      final token = await source.token();
      if (token == null) return;
      await api.registerPushDevice(token: token, platform: source.platform);
      registeredToken = token;
    } catch (e) {
      debugPrint('Push registration failed: $e');
    }
  }

  Future<void> unregister() async {
    final token = registeredToken;
    if (token == null) return;
    registeredToken = null;
    try {
      await api.removePushDevice(token);
    } catch (e) {
      debugPrint('Push removal failed: $e');
    }
  }
}
