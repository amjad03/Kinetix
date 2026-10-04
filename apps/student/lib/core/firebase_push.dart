import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import 'push.dart';

/// Firebase options from `--dart-define`s (docs/product/push-setup.md), or null when they are
/// not all given: the build then runs without push.
FirebaseOptions? firebaseOptionsFromEnvironment() {
  const apiKey = String.fromEnvironment('FIREBASE_API_KEY');
  const appId = String.fromEnvironment('FIREBASE_APP_ID');
  const senderId = String.fromEnvironment('FIREBASE_MESSAGING_SENDER_ID');
  const projectId = String.fromEnvironment('FIREBASE_PROJECT_ID');
  const iosBundleId = String.fromEnvironment('FIREBASE_IOS_BUNDLE_ID');
  if (apiKey.isEmpty || appId.isEmpty || senderId.isEmpty || projectId.isEmpty) return null;
  return FirebaseOptions(
    apiKey: apiKey,
    appId: appId,
    messagingSenderId: senderId,
    projectId: projectId,
    iosBundleId: iosBundleId.isEmpty ? null : iosBundleId,
  );
}

/// Starts Firebase when this build was given its options; otherwise (and on any failure) the
/// app runs without push.
Future<PushMessaging> initPushMessaging() async {
  final options = firebaseOptionsFromEnvironment();
  final mobile = !kIsWeb && (defaultTargetPlatform == TargetPlatform.android || defaultTargetPlatform == TargetPlatform.iOS);
  if (options == null || !mobile) return const NoPushMessaging();
  try {
    await Firebase.initializeApp(options: options);
    return FirebasePushMessaging(FirebaseMessaging.instance);
  } catch (e) {
    debugPrint('Firebase did not start, push is off: $e');
    return const NoPushMessaging();
  }
}

class FirebasePushMessaging implements PushMessaging {
  FirebasePushMessaging(this._fm);

  final FirebaseMessaging _fm;

  @override
  bool get available => true;

  @override
  String get platform => defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android';

  static PushPermission _map(NotificationSettings s) => switch (s.authorizationStatus) {
    AuthorizationStatus.authorized || AuthorizationStatus.provisional => PushPermission.granted,
    AuthorizationStatus.denied || AuthorizationStatus.deniedPermanently => PushPermission.denied,
    AuthorizationStatus.notDetermined => PushPermission.notDetermined,
  };

  @override
  Future<PushPermission> permission() async => _map(await _fm.getNotificationSettings());

  @override
  Future<PushPermission> requestPermission() async => _map(await _fm.requestPermission());

  @override
  Future<String?> token() async {
    if (platform == 'ios') {
      // FCM needs the APNs token first; it can take a moment after permission is granted.
      for (var i = 0; i < 5 && await _fm.getAPNSToken() == null; i++) {
        await Future<void>.delayed(const Duration(seconds: 1));
      }
      if (await _fm.getAPNSToken() == null) return null;
    }
    return _fm.getToken();
  }

  @override
  Stream<String> get onTokenRefresh => _fm.onTokenRefresh;

  @override
  Stream<PushTap> get onTap => FirebaseMessaging.onMessageOpenedApp.map((m) => PushTap.fromData(m.data));

  @override
  Future<PushTap?> initialTap() async {
    final m = await _fm.getInitialMessage();
    return m == null ? null : PushTap.fromData(m.data);
  }

  @override
  Stream<void> get onForegroundMessage => FirebaseMessaging.onMessage.map((_) {});
}
