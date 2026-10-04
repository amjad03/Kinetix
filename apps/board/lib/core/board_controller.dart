import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';

import '../features/comfort/eye_comfort.dart';
import 'api_client.dart';
import 'device_store.dart';
import 'models.dart';
import 'realtime.dart';

enum BoardStage { loading, needsEnrollment, pairing, teaching }

/// Top-level state of the board: enrolment → waiting for a teacher → teaching.
class BoardController extends ChangeNotifier {
  BoardController({DeviceStore? store, ApiClient Function(String)? apiFactory, Realtime Function(String)? realtimeFactory})
      : _store = store ?? DeviceStore(),
        _apiFactory = apiFactory ?? ((url) => ApiClient(baseUrl: url)),
        _realtimeFactory = realtimeFactory ?? Realtime.new;

  final DeviceStore _store;
  final ApiClient Function(String) _apiFactory;
  final Realtime Function(String) _realtimeFactory;

  BoardStage stage = BoardStage.loading;
  ApiClient? api;
  Realtime? _realtime;
  String? deviceName;
  SessionContext? session;
  EyeComfortSettings eyeComfort = const EyeComfortSettings();

  /// Messages from the principal waiting to be shown, newest first.
  final List<BroadcastMessage> broadcasts = [];
  Timer? _sessionTimer;

  Future<void> start() async {
    final saved = await _store.load();
    if (saved.server == null || saved.token == null) {
      stage = BoardStage.needsEnrollment;
    } else {
      _connect(saved.server!, saved.token!);
      deviceName = saved.name;
      stage = BoardStage.pairing;
    }
    notifyListeners();
  }

  Future<void> enroll(String serverUrl, String code) async {
    final url = serverUrl.trim().replaceAll(RegExp(r'/+$'), '');
    final client = _apiFactory(url);
    final res = await client.enroll(code.trim(), _platform());
    await _store.save(server: url, token: res.deviceToken, name: res.deviceName);
    deviceName = res.deviceName;
    _connect(url, res.deviceToken);
    stage = BoardStage.pairing;
    notifyListeners();
  }

  /// Opens the board without a teacher, for practice. Nothing is synced.
  void startPractice() {
    session = SessionContext.practice();
    stage = BoardStage.teaching;
    notifyListeners();
  }

  Future<void> endClass() async {
    final s = session;
    if (s != null && !s.isPractice) {
      try {
        await api?.endSession();
      } catch (_) {
        // Offline: the server ends the session itself when the period expires.
      }
    }
    _signOut();
  }

  void setEyeComfort(EyeComfortSettings s) {
    eyeComfort = s;
    notifyListeners();
  }

  /// Emergencies the teacher acknowledged. They shrink to a strip but stay until the sender clears them.
  final Set<String> acknowledgedEmergencies = {};

  void dismissBroadcast(BroadcastMessage m, {required bool acknowledge}) {
    if (m.priority == BroadcastPriority.emergency) {
      acknowledgedEmergencies.add(m.id);
    } else {
      broadcasts.removeWhere((b) => b.id == m.id);
    }
    notifyListeners();
    if (acknowledge) unawaited(api?.acknowledge(m.id).catchError((_) {}));
  }

  void _connect(String url, String deviceToken) {
    api = _apiFactory(url)..deviceToken = deviceToken;
    _realtime?.dispose();
    final rt = _realtimeFactory(url);
    rt.on(RealtimeEvents.pairingClaimed, (e) => onPaired(e['sessionToken'] as String, SessionContext.fromJson(e['session'] as Map<String, dynamic>)));
    rt.on(RealtimeEvents.sessionEnded, (e) {
      if (e['sessionId'] == session?.sessionId) _signOut();
    });
    rt.on(RealtimeEvents.broadcastNew, (e) => _showBroadcast(BroadcastMessage.fromJson(e)));
    rt.on(RealtimeEvents.broadcastCleared, (e) {
      broadcasts.removeWhere((b) => b.id == e['id']);
      notifyListeners();
    });
    rt.onReady = _fetchPendingBroadcasts;
    rt.connect(deviceToken);
    _realtime = rt;
  }

  @visibleForTesting
  void onPaired(String sessionToken, SessionContext ctx) {
    api?.sessionToken = sessionToken;
    session = ctx;
    stage = BoardStage.teaching;
    _sessionTimer?.cancel();
    _sessionTimer = Timer(ctx.expiresAt.difference(DateTime.now()), _signOut);
    notifyListeners();
  }

  void _signOut() {
    _sessionTimer?.cancel();
    api?.sessionToken = null;
    session = null;
    stage = api == null ? BoardStage.needsEnrollment : BoardStage.pairing;
    notifyListeners();
  }

  void _showBroadcast(BroadcastMessage m) {
    if (broadcasts.any((b) => b.id == m.id)) return;
    broadcasts.insert(0, m);
    notifyListeners();
    unawaited(api?.markDisplayed(m.id).catchError((_) {}));
  }

  Future<void> _fetchPendingBroadcasts() async {
    try {
      final pending = await api!.pendingBroadcasts();
      for (final m in pending.reversed) {
        _showBroadcast(m);
      }
    } catch (_) {}
  }

  String _platform() {
    if (kIsWeb) return 'web';
    if (Platform.isAndroid) return 'android';
    if (Platform.isWindows) return 'windows';
    return 'linux';
  }

  @override
  void dispose() {
    _sessionTimer?.cancel();
    _realtime?.dispose();
    super.dispose();
  }
}
