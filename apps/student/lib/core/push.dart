import 'dart:async';

import 'package:flutter/foundation.dart';

import 'api.dart';

/// Whether the person lets the app show notifications on this phone.
enum PushPermission { notDetermined, granted, denied }

/// A tapped push notification. The server sends ids only (`{notificationId, kind}`, see
/// services/api push/push.service.ts); the app opens the matching update from its inbox.
@immutable
class PushTap {
  const PushTap({this.notificationId, this.kind});

  factory PushTap.fromData(Map<String, dynamic> data) =>
      PushTap(notificationId: data['notificationId'] as String?, kind: data['kind'] as String?);

  final String? notificationId;

  /// The notification's kind as the API names it (`homework`, `calendar`, `marks`…).
  final String? kind;
}

/// The phone's push service (Firebase Cloud Messaging; APNs through FCM on iOS). Tests use a fake;
/// builds without a Firebase project use [NoPushMessaging] (see core/firebase_push.dart).
abstract class PushMessaging {
  /// False when push is not set up in this build: the app never asks for permission.
  bool get available;

  /// android or ios, as the API expects.
  String get platform;

  Future<PushPermission> permission();

  /// Shows the system prompt (Android 13+ POST_NOTIFICATIONS, iOS) and returns the answer.
  Future<PushPermission> requestPermission();

  /// The device token, or null when there is none (yet).
  Future<String?> token();

  Stream<String> get onTokenRefresh;

  /// Notifications tapped while the app is running or in the background.
  Stream<PushTap> get onTap;

  /// The notification whose tap started the app, if any.
  Future<PushTap?> initialTap();

  /// A push arrived while the app is open (the system shows nothing): refresh the inbox.
  Stream<void> get onForegroundMessage;
}

/// Push is not set up in this build (no Firebase options): no token, no prompts.
class NoPushMessaging implements PushMessaging {
  const NoPushMessaging();

  @override
  bool get available => false;

  @override
  String get platform => switch (defaultTargetPlatform) {
    TargetPlatform.iOS || TargetPlatform.macOS => 'ios',
    _ => 'android',
  };

  @override
  Future<PushPermission> permission() async => PushPermission.denied;

  @override
  Future<PushPermission> requestPermission() async => PushPermission.denied;

  @override
  Future<String?> token() async => null;

  @override
  Stream<String> get onTokenRefresh => const Stream.empty();

  @override
  Stream<PushTap> get onTap => const Stream.empty();

  @override
  Future<PushTap?> initialTap() async => null;

  @override
  Stream<void> get onForegroundMessage => const Stream.empty();
}

/// Registers the device's push token with the API after sign-in (`app: 'student'`) and again
/// when it changes, and removes it on sign-out so the next person to use the phone does not get
/// this student's updates.
class PushRegistrar {
  PushRegistrar(this.api, this.messaging);

  final StudentApi api;
  final PushMessaging messaging;

  /// The token registered for the signed-in student, if any.
  String? registeredToken;
  StreamSubscription<String>? _refresh;

  /// Best effort: push is a convenience, so failures never interrupt the student.
  Future<void> register() async {
    if (!messaging.available) return;
    _refresh ??= messaging.onTokenRefresh.listen(_send);
    try {
      final token = await messaging.token();
      if (token != null) await _send(token);
    } catch (e) {
      debugPrint('Push token unavailable: $e');
    }
  }

  Future<void> _send(String token) async {
    if (api.token == null) return;
    try {
      await api.registerPushDevice(token: token, platform: messaging.platform);
      registeredToken = token;
    } catch (e) {
      debugPrint('Push registration failed: $e');
    }
  }

  Future<void> unregister() async {
    // Not awaited: nothing depends on it, and sign-out should not wait for the stream.
    unawaited(_refresh?.cancel());
    _refresh = null;
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
