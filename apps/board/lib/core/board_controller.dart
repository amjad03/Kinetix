import 'dart:async';
import 'dart:io' show Platform;
import 'dart:math';

import 'package:flutter/foundation.dart';

import '../features/comfort/eye_comfort.dart';
import '../features/ink/ink_models.dart';
import 'api_client.dart';
import 'device_store.dart';
import 'models.dart';
import 'realtime.dart';

enum BoardStage { loading, needsEnrollment, board }

/// What kind of touch surface the board runs on. Decides how palms and large contacts behave.
enum TouchProfile {
  tablet('Tablet', 'A hand resting on the screen is ignored', PalmMode.ignore),
  panel('Interactive panel', 'A palm or fist erases, like a duster', PalmMode.erase),
  irFrame('IR touch frame', 'Every touch writes. IR frames cannot tell a palm from a finger', PalmMode.off);

  const TouchProfile(this.label, this.description, this.palmMode);
  final String label;
  final String description;
  final PalmMode palmMode;
}

/// Top-level state of the board: enrolment, then the board itself, with or without a teacher.
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
  bool online = false;

  /// The signed-in teacher's session. Null means the board is in guest mode.
  SessionContext? session;
  List<Student> roster = [];
  final Map<String, AttendanceMark> attendance = {};

  EyeComfortSettings eyeComfort = const EyeComfortSettings();
  TouchProfile touchProfile = TouchProfile.tablet;

  /// Messages from the principal waiting to be shown, newest first.
  final List<BroadcastMessage> broadcasts = [];

  /// Emergencies the teacher acknowledged. They shrink to a strip but stay until the sender clears them.
  final Set<String> acknowledgedEmergencies = {};

  /// Operations waiting to reach the cloud. TODO: persist (Drift) so they survive a restart.
  final List<Map<String, dynamic>> _outbox = [];
  int get pendingOps => _outbox.length;

  Timer? _sessionTimer;
  final _random = Random();

  bool get isEnrolled => api != null;
  bool get isSignedIn => session != null;

  Future<void> start() async {
    final saved = await _store.load();
    touchProfile = TouchProfile.values.asNameMap()[await _store.setting('touchProfile')] ?? TouchProfile.tablet;
    eyeComfort = EyeComfortSettings.decode(await _store.setting('eyeComfort'));
    if (saved.server == null || saved.token == null) {
      stage = BoardStage.needsEnrollment;
    } else {
      _connect(saved.server!, saved.token!);
      deviceName = saved.name;
      stage = BoardStage.board;
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
    stage = BoardStage.board;
    notifyListeners();
  }

  /// Use the board without registering it (practice, demos). Sign-in is unavailable.
  void skipEnrollment() {
    stage = BoardStage.board;
    notifyListeners();
  }

  Future<void> endClass() async {
    if (session != null) {
      await flushOutbox();
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
    unawaited(_store.setSetting('eyeComfort', s.encode()));
    notifyListeners();
  }

  void setTouchProfile(TouchProfile p) {
    touchProfile = p;
    unawaited(_store.setSetting('touchProfile', p.name));
    notifyListeners();
  }

  void dismissBroadcast(BroadcastMessage m, {required bool acknowledge}) {
    if (m.priority == BroadcastPriority.emergency) {
      acknowledgedEmergencies.add(m.id);
    } else {
      broadcasts.removeWhere((b) => b.id == m.id);
    }
    notifyListeners();
    if (acknowledge) unawaited(api?.acknowledge(m.id).catchError((_) {}));
  }

  // --- Classroom ---------------------------------------------------------------------------

  /// Students who can be picked: everyone not marked absent.
  List<Student> get pickable => roster.where((s) => attendance[s.id] != AttendanceMark.absent).toList();

  Student? pickStudent({Student? avoid}) {
    final pool = pickable.where((s) => s != avoid || pickable.length == 1).toList();
    if (pool.isEmpty) return null;
    return pool[_random.nextInt(pool.length)];
  }

  void recordAnswer(Student s, AnswerOutcome outcome) {
    _enqueue('participation.recorded', {'studentId': s.id, 'outcome': outcome.name});
  }

  void markAttendance(Map<String, AttendanceMark> marks) {
    attendance.addAll(marks);
    for (final e in marks.entries) {
      _enqueue('attendance.marked', {'studentId': e.key, 'status': e.value.name});
    }
    notifyListeners();
  }

  void _enqueue(String type, Map<String, dynamic> payload) {
    if (session == null) return; // guest boards do not record anything
    _outbox.add({'opId': _uuidV4(), 'type': type, 'occurredAt': DateTime.now().toUtc().toIso8601String(), 'payload': payload});
    notifyListeners();
    unawaited(flushOutbox());
  }

  bool _flushing = false;

  Future<void> flushOutbox() async {
    if (_flushing || api?.sessionToken == null) return;
    _flushing = true;
    try {
      // Keep going while there is work: operations queued during a request go in the next batch.
      while (_outbox.isNotEmpty && api?.sessionToken != null) {
        final batch = List.of(_outbox.take(200));
        final res = await api!.pushOps(batch);
        final handled = batch.where((op) => res.done.contains(op['opId']) || res.rejected.containsKey(op['opId'])).toSet();
        _outbox.removeWhere(handled.contains);
        online = true;
        if (handled.isEmpty) break; // the server answered but took nothing; retry later
      }
    } catch (_) {
      online = false; // keep everything; retried on reconnect or the next change
    } finally {
      _flushing = false;
      notifyListeners();
    }
  }

  // --- Connection --------------------------------------------------------------------------

  void _connect(String url, String deviceToken) {
    api = _apiFactory(url)..deviceToken = deviceToken;
    _realtime?.dispose();
    final rt = _realtimeFactory(url);
    rt.on(
      RealtimeEvents.pairingClaimed,
      (e) => onPaired(e['sessionToken'] as String, SessionContext.fromJson(e['session'] as Map<String, dynamic>)),
    );
    rt.on(RealtimeEvents.sessionEnded, (e) {
      if (e['sessionId'] == session?.sessionId) _signOut();
    });
    rt.on(RealtimeEvents.broadcastNew, (e) => _showBroadcast(BroadcastMessage.fromJson(e)));
    rt.on(RealtimeEvents.broadcastCleared, (e) {
      broadcasts.removeWhere((b) => b.id == e['id']);
      notifyListeners();
    });
    rt.onReady = () {
      online = true;
      notifyListeners();
      unawaited(_fetchPendingBroadcasts());
      unawaited(flushOutbox());
    };
    rt.connect(deviceToken);
    _realtime = rt;
  }

  @visibleForTesting
  void onPaired(String sessionToken, SessionContext ctx) {
    api?.sessionToken = sessionToken;
    session = ctx;
    roster = [];
    attendance.clear();
    _sessionTimer?.cancel();
    _sessionTimer = Timer(ctx.expiresAt.difference(DateTime.now()), _signOut);
    notifyListeners();
    unawaited(_loadRoster());
  }

  Future<void> _loadRoster() async {
    try {
      roster = await api!.roster();
      notifyListeners();
    } catch (_) {}
  }

  void _signOut() {
    _sessionTimer?.cancel();
    api?.sessionToken = null;
    session = null;
    roster = [];
    attendance.clear();
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

  String _uuidV4() {
    final b = List<int>.generate(16, (_) => _random.nextInt(256));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    final h = b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
    return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
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
