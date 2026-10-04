import 'dart:async';

import 'package:kinetix_parent/core/push.dart';

/// The phone's push service as Firebase would behave, driven by the test.
class FakePushMessaging implements PushMessaging {
  FakePushMessaging({this.deviceToken = 'device-token-123456', this.status = PushPermission.granted, this.launchTap});

  String? deviceToken;
  PushPermission status;

  /// What the system prompt answers.
  PushPermission answer = PushPermission.granted;
  int permissionRequests = 0;

  /// The tap that started the app.
  PushTap? launchTap;

  final _refresh = StreamController<String>.broadcast();
  final _taps = StreamController<PushTap>.broadcast();
  final _foreground = StreamController<void>.broadcast();

  /// The token changed (Firebase rotated it).
  void rotate(String token) {
    deviceToken = token;
    _refresh.add(token);
  }

  /// The person tapped a notification carrying [data] while the app was running.
  void tap(Map<String, dynamic> data) => _taps.add(PushTap.fromData(data));

  /// A push arrived while the app was open.
  void deliver() => _foreground.add(null);

  @override
  bool get available => true;

  @override
  String get platform => 'android';

  @override
  Future<PushPermission> permission() async => status;

  @override
  Future<PushPermission> requestPermission() async {
    permissionRequests++;
    return status = answer;
  }

  @override
  Future<String?> token() async => deviceToken;

  @override
  Stream<String> get onTokenRefresh => _refresh.stream;

  @override
  Stream<PushTap> get onTap => _taps.stream;

  @override
  Future<PushTap?> initialTap() async => launchTap;

  @override
  Stream<void> get onForegroundMessage => _foreground.stream;
}
